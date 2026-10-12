'use client';

// ============================================================================
// 첫 실행 «가치 먼저» — 화면 쪽 데이터 (2026-10-12)
// ----------------------------------------------------------------------------
// 새 API 는 없다. 이미 운영 중인 읽기 API 만 쓴다(내 종목 목록 화면과 같은 원천 · 같은 판정):
//   가격·등락       useLiveQuotes (가격 허브 + /api/live/quotes)
//   옵션 레벨       /api/watchlist/batch?mode=price (fetchLevels — 내 종목 목록과 같은 함수)
//   AI 한 줄        /api/watchlist/ai-line (저장본만 읽는다 — 사용자 경로에서 생성을 기다리지 않는다 · useWatchlistAiLines)
//   실적·변동폭     /api/market/earnings-calendar (행마다 implied — 앱 실적 화면과 같은 응답) — 첫 종목을 고른 뒤에만 부른다(124KB)
//   검색            /api/tickers/search (내 종목 검색 팝업과 같은 API)
//   (끄기 스위치 읽기 /api/app/onboarding-config 는 가벼운 onboardingMode.ts — 모든 앱 화면에 실리는 오버레이가 읽는다)
// 인기 종목 칩 12개는 화면이 켜질 때 한 번에 미리 받는다 — 첫 탭에 바로 카드가 선다(요청 3개: 레벨·AI 한 줄·시세 요청).
// 어떤 요청이 실패해도 칩과 담기는 동작한다(카드는 «—»·지도 사유 한마디로 그려진다).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuotes } from '@/hooks/useLiveQuotes';
import { fetchLevels, mergeRow, useWlNow, type LevelFields } from '@/components/app/watchlist/useWatchlistData';
import { useWatchlistAiLines } from '@/components/app/watchlist/useWatchlistAiLines';
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
  const ai = useWatchlistAiLines(active ? list : [], loc, active);

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
  const wantEarn = active && picks.length > 0;
  useEffect(() => {
    if (!wantEarn || earnDone) return;
    let dead = false;
    void loadEarningsRows().then((rows) => { if (dead) return; setEarnRows(rows); setEarnDone(true); });
    return () => { dead = true; };
  }, [wantEarn, earnDone]);

  // 카드 — 내 종목 목록 행과 같은 판정(buildValueCard). «지금»은 분 단위 공용 시계(useWlNow)
  const now = useWlNow();
  const cards = useMemo(() => (now ? picks.map((t) => {
    const rt = mergeRow(live.quotes[t], levelMem.get(t)?.lv, live.settled(t));
    return buildValueCard(t, rt, ai.get(t), loc, now);
  }) : []), [picks, live.quotes, live.settled, ai.get, ai.version, loc, now, tick]);   // eslint-disable-line react-hooks/exhaustive-deps -- tick: levelMem(모듈 캐시)이 바뀌었다는 표식

  // 지형이 바뀐 AI 글은 서버에 다시 써 달라고(종목당 10분에 한 번 — 내 종목 목록과 같은 규칙)
  const staleKey = cards.filter((c) => c.aiStale).map((c) => c.t).join(',');
  const reportStale = ai.reportStale;
  useEffect(() => { if (staleKey) reportStale(staleKey.split(',')); }, [staleKey, reportStale]);

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
