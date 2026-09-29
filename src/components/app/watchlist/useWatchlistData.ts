'use client';

// ============================================================================
// «내 종목» 행 데이터 — 이미 계산 중인 값만 쓴다(새 벤더·새 비용 없음, 기획서 1-3)
//   가격·레벨·내재 변동   /api/watchlist/batch?mode=price   (종목 50개씩)
//   실적 날짜·발표 시각    /api/market/earnings-calendar      (시장 전체 1콜, 서버 6시간 캐시)
//   장외 비중(FINRA)       /api/flow/dark-pool?t=A,B,…        (EOD · 출처 표기 필수)
//   고래 신규 포지션       /api/flow/options-eod?all=1         (전 종목 1콜 · CDN 10분)
// 폴링: 화면이 보일 때만 · 장이 열린 동안 30초 · 닫혔을 땐 5분. 앱 복귀(app:resume)에 즉시 한 번.
// 모듈 캐시로 대시보드 → 목록 이동 때 빈 화면 없이 바로 그린다.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface BatchRealtime {
  price?: number | null;
  changePct?: number | null;
  session?: string | null;
  maxPain?: number | null;
  callWall?: number | null;
  putFloor?: number | null;
  gammaFlipLevel?: number | null;
  impliedMovePct?: number | null;
  extendedPrice?: number | null;
  extendedChangePct?: number | null;
  extendedLabel?: string | null;
  levelsChainDate?: string | null;
  levelsSource?: string | null;
  levelsExpiration?: string | null;
  /** 응답에 levelsSource 키가 있었나(서버 수리 이후) — 클라이언트가 붙인다 */
  hasLevelsMeta?: boolean;
}

export interface EarningsInfo { date: string; hour: string; name?: string | null }
export interface DarkPoolInfo { pct: number; volRatio: number | null; date: string | null }
export interface WhaleInfo { contracts: number; notional: number; side: 'call' | 'put'; date: string | null }

type Cached<T> = { at: number; data: T };
const batchCache = new Map<string, Cached<Record<string, BatchRealtime>>>();
let earningsCache: Cached<Record<string, EarningsInfo>> | null = null;
let whaleCache: Cached<{ date: string | null; byTicker: Record<string, WhaleInfo> }> | null = null;
const dpCache = new Map<string, Cached<Record<string, DarkPoolInfo>>>();

const BATCH_MAX = 50;
const EXTRAS_TTL = 15 * 60_000;
const EARNINGS_TTL = 30 * 60_000;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

async function fetchJson(url: string, signal?: AbortSignal): Promise<any> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function fetchBatch(tickers: string[], signal?: AbortSignal): Promise<Record<string, BatchRealtime>> {
  const out: Record<string, BatchRealtime> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < tickers.length; i += BATCH_MAX) chunks.push(tickers.slice(i, i + BATCH_MAX));
  const res = await Promise.all(chunks.map((c) =>
    fetchJson(`/api/watchlist/batch?mode=price&tickers=${encodeURIComponent(c.join(','))}`, signal).catch(() => null)));
  let any = false;
  for (const r of res) {
    if (!r || !Array.isArray(r.results)) continue;
    any = true;
    for (const row of r.results) {
      const t = String(row?.ticker || '').toUpperCase();
      const rt = row?.realtime;
      if (!t || !rt || typeof rt !== 'object') continue;
      out[t] = {
        price: num(rt.price), changePct: num(rt.changePct), session: typeof rt.session === 'string' ? rt.session : null,
        maxPain: num(rt.maxPain), callWall: num(rt.callWall), putFloor: num(rt.putFloor), gammaFlipLevel: num(rt.gammaFlipLevel),
        impliedMovePct: num(rt.impliedMovePct),
        extendedPrice: num(rt.extendedPrice), extendedChangePct: num(rt.extendedChangePct),
        extendedLabel: typeof rt.extendedLabel === 'string' ? rt.extendedLabel : null,
        levelsChainDate: typeof rt.levelsChainDate === 'string' ? rt.levelsChainDate : null,
        levelsSource: typeof rt.levelsSource === 'string' ? rt.levelsSource : null,
        levelsExpiration: typeof rt.levelsExpiration === 'string' ? rt.levelsExpiration : null,
        hasLevelsMeta: Object.prototype.hasOwnProperty.call(rt, 'levelsSource'),
      };
    }
  }
  if (!any) throw new Error('batch-failed');
  return out;
}

async function fetchEarnings(signal?: AbortSignal, locale = 'en'): Promise<Record<string, EarningsInfo>> {
  const j = await fetchJson('/api/market/earnings-calendar', signal);
  const out: Record<string, EarningsInfo> = {};
  const rows: any[] = Array.isArray(j?.rows) ? j.rows : [];
  for (const r of rows) {
    const t = String(r?.ticker || '').toUpperCase();
    const d = typeof r?.date === 'string' ? r.date.slice(0, 10) : '';
    if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const prev = out[t];
    if (prev && prev.date <= d) continue;                 // 가장 가까운 발표만
    const brief = r?.brief?.[locale] || r?.brief?.en;
    out[t] = { date: d, hour: typeof r?.hour === 'string' ? r.hour : '', name: typeof brief?.name === 'string' ? brief.name : null };
  }
  return out;
}

async function fetchWhales(signal?: AbortSignal) {
  const j = await fetchJson('/api/flow/options-eod?all=1', signal);
  const byTicker: Record<string, WhaleInfo> = {};
  const date = typeof j?.date === 'string' ? j.date : null;
  if (j?.available && j?.opening && typeof j.opening === 'object') {
    for (const [t, v] of Object.entries<any>(j.opening)) {
      const contracts = num(v?.contracts), notional = num(v?.notional);
      if (contracts == null || notional == null) continue;
      byTicker[t.toUpperCase()] = { contracts, notional, side: v?.side === 'put' ? 'put' : 'call', date };
    }
  }
  return { date, byTicker };
}

async function fetchDarkPool(tickers: string[], signal?: AbortSignal): Promise<Record<string, DarkPoolInfo>> {
  if (!tickers.length) return {};
  const j = await fetchJson(`/api/flow/dark-pool?t=${encodeURIComponent(tickers.slice(0, 200).join(','))}`, signal);
  const out: Record<string, DarkPoolInfo> = {};
  const put = (t: string, v: any) => {
    const pct = num(v?.pct);
    if (pct == null || pct <= 0) return;
    out[t.toUpperCase()] = { pct, volRatio: num(v?.volRatio), date: typeof v?.date === 'string' ? v.date : null };
  };
  if (j?.tickers && typeof j.tickers === 'object') for (const [t, v] of Object.entries<any>(j.tickers)) put(t, v);
  else if (j?.available && typeof j?.ticker === 'string') put(j.ticker, j);   // 한 종목이면 모양이 다르다
  return out;
}

export interface WatchlistData {
  rows: Record<string, BatchRealtime>;
  earnings: Record<string, EarningsInfo>;
  darkPool: Record<string, DarkPoolInfo>;
  whales: Record<string, WhaleInfo>;
  /** 첫 응답 전(캐시도 없음) */
  loading: boolean;
  /** 가격을 한 번도 못 받았다 */
  error: boolean;
  refresh: () => void;
}

export function useWatchlistData(
  tickers: readonly string[],
  opts: { extras?: boolean; locale?: string } = {},
): WatchlistData {
  const extras = !!opts.extras;
  const locale = opts.locale || 'en';
  const key = useMemo(() => [...new Set(tickers)].sort().join(','), [tickers]);
  // 받은 값은 «어느 목록의 값인지(key)»와 함께 둔다 — 목록이 바뀌면 캐시 → 빈 값 순으로 즉시 보인다
  const [batch, setBatch] = useState<{ key: string; data: Record<string, BatchRealtime> } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [earnings, setEarnings] = useState<Record<string, EarningsInfo>>(() => earningsCache?.data ?? {});
  const [whales, setWhales] = useState<Record<string, WhaleInfo>>(() => whaleCache?.data.byTicker ?? {});
  const [dp, setDp] = useState<{ key: string; data: Record<string, DarkPoolInfo> } | null>(null);
  const [tick, setTick] = useState(0);
  const sessionRef = useRef<string | null>(null);

  const refresh = useCallback(() => setTick((x) => x + 1), []);

  // 가격·레벨
  useEffect(() => {
    if (!key) return;
    const ctl = new AbortController();
    fetchBatch(key.split(','), ctl.signal)
      .then((data) => {
        batchCache.set(key, { at: Date.now(), data });
        if (batchCache.size > 12) batchCache.delete(batchCache.keys().next().value as string);
        const any = Object.values(data)[0];
        sessionRef.current = any?.session ?? null;
        setBatch({ key, data });
        setFailedKey(null);
      })
      .catch(() => { if (!ctl.signal.aborted) setFailedKey(key); });
    return () => ctl.abort();
  }, [key, tick]);

  // 부가 사실(실적·장외·고래) — 목록 화면에서만
  useEffect(() => {
    if (!extras || !key) return;
    const ctl = new AbortController();
    const now = Date.now();
    if (!earningsCache || now - earningsCache.at > EARNINGS_TTL) {
      fetchEarnings(ctl.signal, locale).then((d) => { earningsCache = { at: Date.now(), data: d }; setEarnings(d); }).catch(() => { /* 없으면 실적 칩이 안 선다 */ });
    }
    if (!whaleCache || now - whaleCache.at > EXTRAS_TTL) {
      fetchWhales(ctl.signal).then((d) => { whaleCache = { at: Date.now(), data: d }; setWhales(d.byTicker); }).catch(() => { /* 없으면 고래 칩이 안 선다 */ });
    }
    const dpHit = dpCache.get(key);
    if (!dpHit || now - dpHit.at > EXTRAS_TTL) {
      fetchDarkPool(key.split(','), ctl.signal).then((d) => { dpCache.set(key, { at: Date.now(), data: d }); setDp({ key, data: d }); }).catch(() => { /* 없으면 장외 칩이 안 선다 */ });
    }
    return () => ctl.abort();
  }, [extras, key, tick, locale]);

  // 폴링 — 보일 때만. 장중(reg·pre·post) 30초, 아니면 5분.
  useEffect(() => {
    if (!key) return;
    let timer: number | null = null;
    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      const live = ['reg', 'pre', 'post'].includes(sessionRef.current || '');
      timer = window.setTimeout(() => {
        if (document.visibilityState === 'visible') refresh();
        schedule();
      }, live ? 30_000 : 300_000);
    };
    schedule();
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    const onResume = () => refresh();
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('app:resume', onResume);
    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('app:resume', onResume);
    };
  }, [key, refresh]);

  const cached = batchCache.get(key)?.data;
  const rows = !key ? EMPTY_ROWS : batch?.key === key ? batch.data : cached ?? EMPTY_ROWS;
  const darkPool = dp?.key === key ? dp.data : dpCache.get(key)?.data ?? EMPTY_DP;
  const have = !!key && (batch?.key === key || !!cached);

  return {
    rows,
    earnings,
    darkPool,
    whales,
    loading: !!key && !have && failedKey !== key,
    error: !!key && !have && failedKey === key,
    refresh,
  };
}

const EMPTY_ROWS: Record<string, BatchRealtime> = {};
const EMPTY_DP: Record<string, DarkPoolInfo> = {};
