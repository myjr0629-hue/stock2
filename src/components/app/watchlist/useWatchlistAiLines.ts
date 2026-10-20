'use client';

// ============================================================================
// «내 종목» AI 한 줄 — 화면 쪽 읽기 (2026-10-12)
//   GET /api/watchlist/ai-line?t=…&loc=… — 저장된 글만 받는다(서버가 기다리지 않는다). 없는 종목은 서버가 응답 뒤에 만들고
//   pending 으로 알려 준다 → 6초·18초 뒤 그 종목만 한 번씩 더 묻는다(그 뒤로는 15분 간격 · 화면 복귀).
//   글이 «지금 지형»과 다르면(aiLineState 'stale') 화면은 그 줄을 그리지 않고 reportStale 로 서버에 다시 써 달라고 알린다(종목당 10분에 한 번).
//   실패해도 줄을 안 그릴 뿐이다 — 다른 칸(가격·지도·칩)은 이 요청과 무관하다.
// ============================================================================

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { textIntegrityReasons } from '@/lib/ai/textIntegrity';
import type { AiLineEntry, AiLineLocale } from '@/lib/app/watchlistAiLine';

export const AI_LINES_TTL_MS = 15 * 60_000;
const FOLLOW_UPS_MS = [6_000, 18_000];
const RETRY_MS = 20_000;
const STALE_HINT_GAP_MS = 10 * 60_000;
const TIMEOUT_MS = 6_000;
const MEM_MAX = 400;

type Slot = { at: number; e: AiLineEntry | null };
const mem = new Map<string, Slot>();          // `${loc}:${T}`
const inflight = new Set<string>();
const hinted = new Map<string, number>();     // `${loc}:${T}` → 마지막 «다시 써 달라» 시각
let version = 1;
const subs = new Set<() => void>();
const bump = () => { version += 1; subs.forEach((l) => { try { l(); } catch { /* noop */ } }); };
const subscribe = (l: () => void) => { subs.add(l); return () => { subs.delete(l); }; };
const getV = () => version;
const getServerV = () => 0;
const mk = (loc: string, t: string) => `${loc}:${t}`;

function isEntry(x: any): x is AiLineEntry {
  return !!x && typeof x === 'object' && typeof x.text === 'string' && !textIntegrityReasons(x.text).length && (x.insight == null || (typeof x.insight === 'string' && !textIntegrityReasons(x.insight).length)) && (x.insightUntil == null || typeof x.insightUntil === 'number') && typeof x.chain === 'string' && !!x.lv && typeof x.lv === 'object' && !!x.sides && typeof x.sides === 'object';
}

async function fetchLines(tickers: string[], loc: AiLineLocale, stale: string[]): Promise<{ lines: Record<string, AiLineEntry | null>; pending: string[] }> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tid = setTimeout(() => ctl?.abort(), TIMEOUT_MS);
  try {
    const q = `/api/watchlist/ai-line?t=${encodeURIComponent(tickers.join(','))}&loc=${loc}${stale.length ? `&stale=${encodeURIComponent(stale.join(','))}` : ''}`;
    const r = await fetch(q, ctl ? { signal: ctl.signal, cache: 'no-store' } : { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    const lines: Record<string, AiLineEntry | null> = {};
    const src = j && typeof j.lines === 'object' && j.lines ? j.lines : {};
    for (const t of tickers) lines[t] = isEntry(src[t]) ? src[t] : null;
    const pending = Array.isArray(j?.pending) ? j.pending.filter((x: unknown): x is string => typeof x === 'string') : [];
    return { lines, pending };
  } finally {
    clearTimeout(tid);
  }
}

/**
 * 묻기 — force 가 아니면 15분 안에 받은 종목은 건너뛴다. 실패하면 받은 적 없는 종목만 «없음»으로 정한다(있던 글은 그대로).
 * attempt = pending 다시 묻기 회차(0 = 처음).
 */
function load(tickers: string[], loc: AiLineLocale, opts: { force?: boolean; stale?: string[]; attempt?: number; retried?: boolean } = {}): void {
  const now = Date.now();
  const due = opts.force ? tickers : tickers.filter((t) => { const s = mem.get(mk(loc, t)); return !s || now - s.at >= AI_LINES_TTL_MS; });
  if (!due.length) return;
  const stale = opts.stale ?? [];
  const ik = `${loc}|${due.join(',')}|${stale.join(',')}`;
  if (inflight.has(ik)) return;
  inflight.add(ik);
  fetchLines(due, loc, stale)
    .then(({ lines, pending }) => {
      const at = Date.now();
      for (const t of due) { mem.delete(mk(loc, t)); mem.set(mk(loc, t), { at, e: lines[t] ?? null }); }
      while (mem.size > MEM_MAX) mem.delete(mem.keys().next().value as string);
      const attempt = opts.attempt ?? 0;
      const want = pending.filter((t) => due.includes(t));
      if (want.length && attempt < FOLLOW_UPS_MS.length) {
        setTimeout(() => load(want, loc, { force: true, attempt: attempt + 1 }), FOLLOW_UPS_MS[attempt]);
      }
    })
    .catch(() => {
      const at = Date.now();
      // 실패 — 받은 적 없는 종목만 «없음»(줄을 안 그린다). 있던 글은 남긴다. 20초 뒤 한 번만 다시(서버 첫 기동 등) · 그 뒤로는 15분 간격
      for (const t of due) if (!mem.has(mk(loc, t))) mem.set(mk(loc, t), { at, e: null });
      if (!opts.retried) setTimeout(() => load(due, loc, { force: true, stale, retried: true }), RETRY_MS);
    })
    .finally(() => { inflight.delete(ik); bump(); });
}

export interface WatchlistAiLines {
  /** 이 종목의 글(자리표 그대로) — 아직 모르거나 없으면 null */
  get: (t: string) => AiLineEntry | null;
  /** 글이 «지금 지형»과 달라 그리지 않은 종목들 — 서버에 다시 써 달라고 알린다(종목당 10분에 한 번) */
  reportStale: (tickers: string[]) => void;
  /** 바뀌면 다시 계산하라는 표식 */
  version: number;
}

export function useWatchlistAiLines(tickers: readonly string[], loc: AiLineLocale, enabled: boolean): WatchlistAiLines {
  const key = useMemo(() => [...new Set(tickers.map((t) => t.toUpperCase()))].sort().join(','), [tickers]);
  const v = useSyncExternalStore(subscribe, getV, getServerV);

  useEffect(() => {
    if (!enabled || !key) return;
    const list = key.split(',');
    load(list, loc);
    const again = () => { if (document.visibilityState === 'visible') load(list, loc); };
    const id = setInterval(again, AI_LINES_TTL_MS);
    document.addEventListener('visibilitychange', again);
    document.addEventListener('app:resume', again);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', again);
      document.removeEventListener('app:resume', again);
    };
  }, [enabled, key, loc]);

  const get = useCallback((t: string): AiLineEntry | null => (v && enabled ? mem.get(mk(loc, t.toUpperCase()))?.e ?? null : null), [v, loc, enabled]);

  const reportStale = useCallback((ts: string[]) => {
    if (!enabled || !ts.length) return;
    const now = Date.now();
    const due = [...new Set(ts.map((t) => t.toUpperCase()))].filter((t) => now - (hinted.get(mk(loc, t)) ?? 0) >= STALE_HINT_GAP_MS);
    if (!due.length) return;
    due.forEach((t) => hinted.set(mk(loc, t), now));
    load(due.sort(), loc, { force: true, stale: due });
  }, [enabled, loc]);

  return { get, reportStale, version: v };
}

// ── 측정 — 줄이 «처음 보였다»는 앱 실행당 종목마다 한 번만 ──
const seen = new Set<string>();
export function firstSeen(t: string): boolean {
  if (seen.has(t)) return false;
  seen.add(t);
  return true;
}

/** 테스트용 */
export function _resetAiLinesForTest() { mem.clear(); inflight.clear(); hinted.clear(); seen.clear(); version = 1; }
export const _aiLinesTest = { load, mem: () => mem };
