'use client';

// ============================================================================
// «✦ AI 오늘 볼 것» — 화면 쪽 읽기 (2026-10-13)
//   GET /api/today-picks?loc= — 서버가 저장해 둔 문서만 받는다(서버가 기다리지 않는다 · AI 호출 0).
//   · 처음 그릴 때는 «뼈대»(서버 HTML 과 같다) → 마운트 뒤 기기에 남긴 마지막 사본(36시간 안)을 먼저 그리고 → 새로 받는다.
//     그래서 앱을 다시 열면 카드가 들썩이지 않는다.
//   · 끄기 스위치가 켜졌거나 항목이 없으면 'empty' → 카드 자체를 그리지 않는다. 읽기가 실패해도 마찬가지(다른 카드는 이 요청과 무관).
//   · 갱신: 앱 복귀·화면 복귀 때 5분이 지났으면 · 10분 간격.
// ============================================================================
import { useEffect, useState } from 'react';
import type { PicksView } from '@/lib/todayPicks/view';
import type { Loc } from '@/lib/todayPicks/types';

export const TP_CACHE_MS = 5 * 60_000;
const TIMEOUT_MS = 6_000;
const LS_KEY = (loc: Loc) => `sg:tp:v1:${loc}`;
const LS_MAX_AGE_MS = 36 * 3600_000;
const RETRY_MS = 20_000;

export type TodayPicksState = { status: 'loading' } | { status: 'empty' } | { status: 'ready'; view: PicksView };

type CacheEntry = { at: number; view: PicksView | null };
const mem = new Map<Loc, CacheEntry>();
const isFresh = (entry: CacheEntry) => Number.isFinite(entry.at) && Date.now() - entry.at <= LS_MAX_AGE_MS;

function isView(x: any): x is PicksView {
  return !!x && typeof x === 'object' && Array.isArray(x.items) && x.items.every((i: any) => i && typeof i.ticker === 'string' && typeof i.what === 'string' && typeof i.why === 'string');
}

function readLocal(loc: Loc): CacheEntry | null {
  try {
    const raw = localStorage.getItem(LS_KEY(loc));
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!j || typeof j.at !== 'number' || !isFresh(j) || !isView(j.view) || !j.view.items.length) return null;
    return j;
  } catch { return null; }
}
function readCached(loc: Loc): CacheEntry | null {
  const hit = mem.get(loc);
  return hit && isFresh(hit) ? hit : readLocal(loc);
}
function writeLocal(loc: Loc, view: PicksView | null) {
  try {
    if (view && view.items.length) localStorage.setItem(LS_KEY(loc), JSON.stringify({ at: Date.now(), view }));
    else localStorage.removeItem(LS_KEY(loc));
  } catch { /* 저장 불가 환경 — 무해 */ }
}

async function fetchView(loc: Loc): Promise<PicksView | null> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tid = setTimeout(() => ctl?.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`/api/today-picks?loc=${loc}`, ctl ? { signal: ctl.signal, cache: 'no-store' } : { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    if (!isView(j)) throw new Error('shape');
    return j;
  } finally { clearTimeout(tid); }
}

export function useTodayPicks(loc: Loc): TodayPicksState {
  const [state, setState] = useState<TodayPicksState>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    let retried = false;
    const apply = (v: PicksView | null) => { if (alive) setState(v && v.items.length && !v.off ? { status: 'ready', view: v } : { status: 'empty' }); };

    const load = (force: boolean) => {
      const cached = readCached(loc);
      if (cached) apply(cached.view);
      else if (alive) setState({ status: 'loading' });
      const m = mem.get(loc);
      if (!force && m && Date.now() - m.at < TP_CACHE_MS) { apply(m.view); return; }
      fetchView(loc)
        .then((v) => { mem.set(loc, { at: Date.now(), view: v }); writeLocal(loc, v); apply(v); })
        .catch(() => {
          // 실패 시점에도 36시간 안인 사본만 쓴다. 없거나 만료됐으면 기존 empty 상태. 20초 뒤 한 번만 다시
          apply(readCached(loc)?.view ?? null);
          if (!retried) { retried = true; setTimeout(() => { if (alive) load(true); }, RETRY_MS); }
        });
    };
    load(false);

    const again = () => { if (document.visibilityState === 'visible') load(false); };
    const id = setInterval(again, 10 * 60_000);
    document.addEventListener('visibilitychange', again);
    document.addEventListener('app:resume', again);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', again);
      document.removeEventListener('app:resume', again);
    };
  }, [loc]);

  return state;
}
