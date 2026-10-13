'use client';

// ============================================================================
// 첫 실행 «가치 먼저» — 화면 쪽 데이터 (2026-10-12)
// ----------------------------------------------------------------------------
// 새 API 는 없다. 이미 운영 중인 읽기 API 만 쓴다(내 종목 목록 화면과 같은 원천 · 같은 판정):
//   가격·등락       useLiveQuotes (가격 허브 + /api/live/quotes)
//   옵션 레벨       /api/watchlist/batch?mode=price (fetchLevels — 내 종목 목록과 같은 함수)
//   AI 한 줄        /api/watchlist/ai-line (저장본만 읽는다 — 사용자 경로에서 생성을 기다리지 않는다). 내 종목 화면의 훅(useWatchlistAiLines)은 6초에 끊고 20초 뒤 한 번만 다시 묻는데,
//                   첫 실행은 이 줄이 «첫 가치»라 더 참을성 있게 읽는다(12초 · 두 번 다시 · 서버가 «만드는 중»이라 하면 3·7·14·24초 뒤 다시)
//   실적·변동폭     /api/market/earnings-calendar (행마다 implied — 앱 실적 화면과 같은 응답) — 첫 종목을 고른 뒤에만 부른다(124KB)
//   검색            /api/tickers/search (내 종목 검색 팝업과 같은 API)
//   (끄기 스위치 읽기 /api/app/onboarding-config 는 가벼운 onboardingMode.ts — 모든 앱 화면에 실리는 오버레이가 읽는다)
// 인기 종목 칩 12개는 화면이 켜질 때 한 번에 미리 받는다 — 첫 탭에 바로 카드가 선다(요청 3개: 레벨·AI 한 줄·시세 요청).
// 어떤 요청이 실패해도 칩과 담기는 동작한다(카드는 «—»·지도 사유 한마디로 그려진다).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuotes } from '@/hooks/useLiveQuotes';
import { fetchLevels, mergeRow, useWlNow, type LevelFields } from '@/components/app/watchlist/useWatchlistData';
import type { AiLineEntry } from '@/lib/app/watchlistAiLine';
import type { WlLocale } from '@/lib/app/watchlistInsights';
import {
  ONB_POPULAR, buildValueCard, imminentEarnings, type OnbEarnings, type ValueCard,
} from '@/lib/app/firstRunValue';

// ── 실적 캘린더 ───────────────────────────────────────────────────────────
const EARN_TTL_MS = 30 * 60_000;
const EARN_TIMEOUT_MS = 12_000;
let earnMem: { at: number; rows: unknown[] } | null = null;
let earnInflight: Promise<unknown[] | null> | null = null;

async function loadEarningsRows(): Promise<unknown[] | null> {
  if (earnMem && Date.now() - earnMem.at < EARN_TTL_MS) return earnMem.rows;
  if (earnInflight) return earnInflight;
  earnInflight = (async () => {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tid = setTimeout(() => ctl?.abort(), EARN_TIMEOUT_MS);
    try {
      const r = await fetch('/api/market/earnings-calendar', ctl ? { signal: ctl.signal } : undefined);
      if (!r.ok) return null;
      const j = await r.json();
      // 이 라우트는 오류도 200 {ok:true, rows:[], reason} 으로 알린다 — 빈 행은 «실적 없음»이 아니라 «못 읽음»이다
      if (!j || !Array.isArray(j.rows) || !j.rows.length) return null;
      earnMem = { at: Date.now(), rows: j.rows };
      return j.rows as unknown[];
    } catch {
      return null;
    } finally {
      clearTimeout(tid);
      earnInflight = null;
    }
  })();
  return earnInflight;
}

// ── 옵션 레벨 ─────────────────────────────────────────────────────────────
// 한 묶음(≤30)으로 받는다 — 묶음 요청은 서버가 5~9초 걸리기도 한다(내 종목 목록과 같은 요청). 그래서 «묶음이 날아가는 중인 종목»은 다시 묻지 않고
// (화면이 다시 그려져도 · 종목을 더 골라도 같은 요청이 겹치지 않는다), 끝나면 구독한 화면에 알린다.
// 묶음이 실패하면 4초·6초 뒤 두 번까지 다시 묻고, 그래도 못 받으면 «레벨 없음»으로 정한다(뼈대가 영원히 남지 않게 — 지도 자리는 «레벨 갱신 대기» 한마디).
const LEVELS_TTL_MS = 15 * 60_000;
const levelMem = new Map<string, { at: number; lv: LevelFields | null }>();
const levelFlight = new Set<string>();
const levelSubs = new Set<() => void>();
const notifyLevels = () => levelSubs.forEach((f) => { try { f(); } catch { /* noop */ } });

function requestLevels(list: readonly string[], attempt = 0): void {
  const now = Date.now();
  const due = list.filter((t) => { const e = levelMem.get(t); return (!e || now - e.at >= LEVELS_TTL_MS) && !levelFlight.has(t); });
  if (!due.length) return;
  due.forEach((t) => levelFlight.add(t));
  const settle = (asked: string[], data: Record<string, LevelFields>) => {
    const at = Date.now();
    for (const t of asked) levelMem.set(t, { at, lv: data[t] ?? null });
    due.forEach((t) => levelFlight.delete(t));
    const missing = due.filter((t) => !asked.includes(t));
    if (missing.length) {
      // 묶음 요청은 서버 사정으로 3초~13초까지 흔들린다(운영 실측) — 두 번까지 다시 묻는다(4초 · 6초 뒤)
      if (attempt < 2) setTimeout(() => requestLevels(missing, attempt + 1), attempt === 0 ? 4_000 : 6_000);
      else for (const t of missing) levelMem.set(t, { at, lv: null });
    }
    notifyLevels();
  };
  fetchLevels(due).then(({ data, asked }) => settle(asked, data)).catch(() => settle([], {}));
}

// ── AI 한 줄 ──────────────────────────────────────────────────────────────
// 저장본만 읽는 라우트(2.5초 읽기 상한)지만 응답 본문이 느리게 오는 때가 있다(운영 실측 10/12: 2.1·2.1·13.6초). 내 종목 훅처럼 6초에 끊으면 첫 화면의 줄이 통째로 비므로
// 이 단계는 12초까지 기다리고, 실패하면 6초·12초 뒤 다시 묻는다. 서버가 «지금 만든다(pending)»고 하면 3·7·14·24초 뒤 그 종목만 다시.
const AI_TTL_MS = 15 * 60_000;
const AI_TIMEOUT_MS = 12_000;
// 서버가 «지금 만드는 중»(pending — 없는 종목 · 지형이 바뀐 글 stale 알림)이라 하면 3초·7초·14초·24초 뒤 그 종목만 다시(생성은 응답 뒤 1~3초)
const AI_FOLLOW_UPS_MS = [3_000, 7_000, 14_000, 24_000];
const AI_HINT_GAP_MS = 10 * 60_000;
const aiMem = new Map<string, AiLineEntry | null>();     // `${loc}:${T}` → 글(없으면 null)
const aiAt = new Map<string, number>();                   // 마지막으로 «정해진» 시각
const aiFlight = new Set<string>();
const aiHinted = new Map<string, number>();
const aiSubs = new Set<() => void>();
const aiTimers = new Set<ReturnType<typeof setTimeout>>();
const later = (fn: () => void, ms: number) => { const id = setTimeout(() => { aiTimers.delete(id); fn(); }, ms); aiTimers.add(id); };
/** 가치 단계를 떠나면 «다시 묻기» 예약을 걷는다 — 화면이 없는 뒤에 요청이 나가지 않게 */
export function cancelAiFollowUps(): void { aiTimers.forEach((id) => clearTimeout(id)); aiTimers.clear(); }
const notifyAi = () => aiSubs.forEach((f) => { try { f(); } catch { /* noop */ } });
const aiKey = (loc: string, t: string) => `${loc}:${t}`;

function isAiEntry(x: any): x is AiLineEntry {
  return !!x && typeof x === 'object' && typeof x.text === 'string' && typeof x.chain === 'string' && !!x.lv && typeof x.lv === 'object' && !!x.sides && typeof x.sides === 'object';
}

async function fetchAiLines(tickers: string[], loc: WlLocale, stale: string[]): Promise<{ lines: Record<string, AiLineEntry | null>; pending: string[] }> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tid = setTimeout(() => ctl?.abort(), AI_TIMEOUT_MS);
  try {
    const q = `/api/watchlist/ai-line?t=${encodeURIComponent(tickers.join(','))}&loc=${loc}${stale.length ? `&stale=${encodeURIComponent(stale.join(','))}` : ''}`;
    const r = await fetch(q, ctl ? { signal: ctl.signal, cache: 'no-store' } : { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    const src = j && typeof j.lines === 'object' && j.lines ? j.lines : {};
    const lines: Record<string, AiLineEntry | null> = {};
    for (const t of tickers) lines[t] = isAiEntry(src[t]) ? src[t] : null;
    return { lines, pending: Array.isArray(j?.pending) ? j.pending.filter((x: unknown): x is string => typeof x === 'string') : [] };
  } finally {
    clearTimeout(tid);
  }
}

function requestAi(list: readonly string[], loc: WlLocale, opts: { force?: boolean; stale?: string[]; attempt?: number } = {}): void {
  const now = Date.now();
  const attempt = opts.attempt ?? 0;
  const due = list.filter((t) => { const k = aiKey(loc, t); const at = aiAt.get(k); return !aiFlight.has(k) && (opts.force || at === undefined || now - at >= AI_TTL_MS); });
  if (!due.length) return;
  due.forEach((t) => aiFlight.add(aiKey(loc, t)));
  fetchAiLines(due, loc, opts.stale ?? [])
    .then(({ lines, pending }) => {
      const at = Date.now();
      for (const t of due) { const k = aiKey(loc, t); aiMem.set(k, lines[t] ?? null); aiAt.set(k, at); aiFlight.delete(k); }
      notifyAi();
      const want = pending.filter((t) => due.includes(t));
      if (want.length && attempt < AI_FOLLOW_UPS_MS.length) later(() => requestAi(want, loc, { force: true, attempt: attempt + 1 }), AI_FOLLOW_UPS_MS[attempt]);
    })
    .catch(() => {
      due.forEach((t) => aiFlight.delete(aiKey(loc, t)));
      if (attempt < 2) { later(() => requestAi(due, loc, { force: true, attempt: attempt + 1 }), 6_000 * (attempt + 1)); return; }
      // 끝내 못 읽었다 — «줄 없음»으로 정한다(칩·담기·지도는 그대로) · 이미 받은 글은 남긴다
      const at = Date.now();
      for (const t of due) { const k = aiKey(loc, t); if (!aiMem.has(k)) aiMem.set(k, null); aiAt.set(k, at); }
      notifyAi();
    });
}

/** 글이 «지금 지형»과 달라 그리지 않은 종목 — 서버에 다시 써 달라고 알린다(종목당 10분에 한 번 · 내 종목 목록과 같은 규칙) */
function reportAiStale(tickers: string[], loc: WlLocale): void {
  const now = Date.now();
  const due = tickers.filter((t) => now - (aiHinted.get(aiKey(loc, t)) ?? 0) >= AI_HINT_GAP_MS);
  if (!due.length) return;
  due.forEach((t) => aiHinted.set(aiKey(loc, t), now));
  requestAi(due.sort(), loc, { force: true, stale: due });
}

// ── 가치 단계 데이터 ──────────────────────────────────────────────────────
export interface ValueData {
  /** 고른 종목마다 카드(고른 순서) */
  cards: ValueCard[];
  /** 이 종목의 가격이 정해졌나(«—» 포함) · 옵션 레벨이 정해졌나(없음 포함) — 카드 뼈대를 각각 접는 기준(가격은 레벨보다 먼저 온다) */
  priceReady: (t: string) => boolean;
  levelsReady: (t: string) => boolean;
  /** 이 종목의 실적 임박 정보(없으면 null) · earningsDone: 실적 캘린더 요청이 끝났다(실패 포함) */
  earnings: (t: string) => OnbEarnings | null;
  earningsDone: boolean;
}

export function useValueData(picks: readonly string[], loc: WlLocale, active: boolean): ValueData {
  // 미리 받을 종목 = 인기 12 + 지금 고른 것(검색으로 고른 종목 포함)
  const list = useMemo(() => [...new Set<string>([...ONB_POPULAR, ...picks])], [picks]);
  const live = useLiveQuotes(active ? list : []);

  // 레벨 — 모듈 캐시에 쌓이고, 끝나면 이 화면을 다시 그린다
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const bump = () => setTick((x) => x + 1);
    levelSubs.add(bump);
    requestLevels(list);
    return () => { levelSubs.delete(bump); };
  }, [active, list]);

  // 실적 — 첫 종목을 고른 뒤에만
  const [earnRows, setEarnRows] = useState<unknown[] | null>(() => (earnMem ? earnMem.rows : null));
  const [earnDone, setEarnDone] = useState(() => !!earnMem);
  const [earnRetry, setEarnRetry] = useState(0);
  const wantEarn = active && picks.length > 0;
  useEffect(() => {
    if (!wantEarn || earnDone) return;
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void loadEarningsRows().then((rows) => {
      if (dead) return;
      if (rows) { setEarnRows(rows); setEarnDone(true); return; }
      // 못 읽었다 — 4초 뒤 한 번만 다시(124KB 응답이 느릴 때가 있다). 그래도 못 읽으면 실적 줄 없이 간다(칩·지도·AI 줄은 그대로)
      if (earnRetry < 1) timer = setTimeout(() => { if (!dead) setEarnRetry(1); }, 4_000);
      else setEarnDone(true);
    });
    return () => { dead = true; if (timer) clearTimeout(timer); };
  }, [wantEarn, earnDone, earnRetry]);

  // AI 한 줄 — 모듈 캐시에 쌓이고, 끝나면 이 화면을 다시 그린다
  const [aiTick, setAiTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const bump = () => setAiTick((x) => x + 1);
    aiSubs.add(bump);
    requestAi(list, loc);
    return () => { aiSubs.delete(bump); };
  }, [active, list, loc]);

  // 카드 — 내 종목 목록 행과 같은 판정(buildValueCard). «지금»은 분 단위 공용 시계(useWlNow).
  // 칩 12개 전부의 카드를 만들어 «지형이 바뀐 글»을 찾는다 — 고른 종목만이 아니라(아래 reportAiStale) 다음 사람을 위해서도
  const now = useWlNow();
  const all = useMemo(() => {
    const m = new Map<string, ValueCard>();
    if (!now) return m;
    for (const t of list) {
      const rt = mergeRow(live.quotes[t], levelMem.get(t)?.lv, live.settled(t));
      m.set(t, buildValueCard(t, rt, aiMem.get(aiKey(loc, t)) ?? null, loc, now));
    }
    return m;
  }, [list, live.quotes, live.settled, loc, now, tick, aiTick]);   // eslint-disable-line react-hooks/exhaustive-deps -- tick·aiTick: 모듈 캐시(levelMem·aiMem)가 바뀌었다는 표식
  const cards = useMemo(() => picks.map((t) => all.get(t)).filter((c): c is ValueCard => !!c), [picks, all]);

  // 글이 있는데 지형이 바뀌었다(EOD 체인이 넘어간 아침 · 가격이 레벨을 건넘) → 서버에 다시 써 달라고(종목당 10분에 한 번 — 내 종목 목록과 같은 규칙)
  const staleKey = [...all.values()].filter((c) => c.aiStale).map((c) => c.t).sort().join(',');
  useEffect(() => { if (staleKey) reportAiStale(staleKey.split(','), loc); }, [staleKey, loc]);

  const priceReady = (t: string) => live.settled(t);
  const levelsReady = (t: string) => levelMem.has(t);
  const earnings = useCallback((t: string) => (earnRows ? imminentEarnings(earnRows, t, Date.now()) : null), [earnRows]);

  return { cards, priceReady, levelsReady, earnings, earningsDone: earnDone };
}

// ── 종목 검색 ─────────────────────────────────────────────────────────────
export type SearchHit = { symbol: string; name: string };
export type SearchState = { q: string; hits: SearchHit[]; failed: boolean } | null;

/** 입력 180ms 뒤 /api/tickers/search — 늦게 온 응답은 버린다(내 종목 검색 팝업과 같은 규칙) */
export function useTickerSearch(query: string, enabled: boolean): SearchState {
  const [res, setRes] = useState<SearchState>(null);
  useEffect(() => {
    const q = query.trim();
    if (!enabled || !q) { setRes(null); return; }
    let dead = false;
    const id = window.setTimeout(async () => {
      let next: NonNullable<SearchState>;
      try {
        const r = await fetch(`/api/tickers/search?q=${encodeURIComponent(q)}`);
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        const hits: SearchHit[] = [];
        if (Array.isArray(j?.results)) {
          for (const x of j.results) {
            if (x && typeof x.symbol === 'string' && x.symbol) hits.push({ symbol: x.symbol, name: typeof x.name === 'string' ? x.name : '' });
          }
        }
        next = { q, hits: hits.slice(0, 6), failed: false };
      } catch {
        next = { q, hits: [], failed: true };
      }
      if (!dead) setRes(next);
    }, 180);
    return () => { dead = true; window.clearTimeout(id); };
  }, [query, enabled]);
  return res;
}

// ── 알림 미리보기 — 실제 최신 모닝 푸시 본문(AI 한 줄) ─────────────────────────
export interface PushPreview { body: string | null; date: string | null }
const previewMem = new Map<string, PushPreview>();

/** /api/app/push-preview — 모닝 푸시가 실제로 쓰는 «AI 한 줄»(가드 통과본). 못 읽으면 null(화면은 옛 설명 글로 그린다) */
export function usePushPreview(loc: WlLocale, enabled: boolean): PushPreview | null {
  const [pv, setPv] = useState<PushPreview | null>(() => previewMem.get(loc) ?? null);
  useEffect(() => {
    if (!enabled || previewMem.has(loc)) return;
    let dead = false;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tid = setTimeout(() => ctl?.abort(), 8_000);
    void fetch(`/api/app/push-preview?loc=${loc}`, ctl ? { signal: ctl.signal } : undefined)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const m = j && typeof j === 'object' ? (j as { morning?: { body?: unknown; date?: unknown } }).morning : null;
        const v: PushPreview = { body: typeof m?.body === 'string' && m.body ? m.body : null, date: typeof m?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.date) ? m.date : null };
        previewMem.set(loc, v);
        if (!dead) setPv(v);
      })
      .catch(() => { /* 옛 설명 글로 그린다 */ })
      .finally(() => clearTimeout(tid));
    return () => { dead = true; };
  }, [loc, enabled]);
  return pv;
}
