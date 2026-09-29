'use client';

// ============================================================================
// «내 종목» 행 데이터 — 이미 계산 중인 값만 쓴다(새 벤더·새 비용 없음, 기획서 1-3)
//   가격·레벨·내재 변동   /api/watchlist/batch?mode=price   (보이는 목록 하나 = 요청 하나, 50개씩 나눔)
//   실적 날짜·발표 시각    /api/market/earnings-calendar      (시장 전체 1콜, 서버 6시간 캐시)
//   장외 비중(FINRA)       /api/flow/dark-pool?t=A,B,…        (EOD · 출처 표기 필수)
//   고래 신규 포지션       /api/flow/options-eod?all=1         (전 종목 1콜 · CDN 10분)
// 폴링: 화면이 보일 때만 · 장이 열린 동안 30초 · 닫혔을 땐 5분. 앱 복귀(app:resume)에 즉시 한 번.
//
// 빠르게 — «다시 그릴 때 기다리지 않는다»:
//   · 캐시는 «종목 하나» 단위다 — 대시보드(앞 3개)에서 받은 값이 목록 화면 첫 그림에 바로 선다.
//     종목을 하나 더 담아도 나머지 행은 그대로 있고 새 행만 뼈대로 기다린다.
//   · 같은 목록 요청이 진행 중이면 새로 보내지 않고 합류한다 · 15초 안에 받은 값이면 다시 묻지 않는다.
//   · 마지막으로 잘 받은 값은 sessionStorage 에도 둔다(최대 6시간) — 새로고침·언어 변경 뒤에도 첫 그림이 비지 않는다.
//     오래된 값(장중 3분 · 장 밖 20분)은 stale=true 로 알려 화면이 흐리게 그린다(«지금 값»처럼 보이지 않게).
//     새 값이 오면 바로 바꾼다.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

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

const BATCH_MAX = 50;
const EXTRAS_TTL = 15 * 60_000;
const EARNINGS_TTL = 30 * 60_000;
/** 이 안에 받은 값이면 화면에 다시 들어와도 묻지 않는다 */
const MIN_REFETCH_MS = 15_000;
/** 이보다 오래된 값은 «흐리게»(stale) — 장중은 폴링 30초라 3분이면 이미 여러 번 놓친 것 */
const STALE_LIVE_MS = 3 * 60_000;
const STALE_CLOSED_MS = 20 * 60_000;
/** 이보다 오래된 값은 아예 그리지 않는다(뼈대로 기다린다) */
const DISPLAY_MAX_AGE = 6 * 3_600_000;
const BATCH_TIMEOUT_MS = 9_000;
const EXTRAS_TIMEOUT_MS = 7_000;
const ROW_CACHE_MAX = 300;
const PERSIST_KEY = 'sg-wl-cache-v1';
const PERSIST_ROWS_MAX = 80;
const LIVE_SESSIONS = ['reg', 'pre', 'post'];

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

async function fetchJson(url: string, timeoutMs: number): Promise<any> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tid = setTimeout(() => ctl?.abort(), timeoutMs);
  try {
    const r = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
    if (!r.ok) throw new Error(`${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(tid);
  }
}

function parseRealtime(rt: any): BatchRealtime {
  return {
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

async function fetchBatch(tickers: string[]): Promise<Record<string, BatchRealtime>> {
  const out: Record<string, BatchRealtime> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < tickers.length; i += BATCH_MAX) chunks.push(tickers.slice(i, i + BATCH_MAX));
  const res = await Promise.all(chunks.map((c) =>
    fetchJson(`/api/watchlist/batch?mode=price&tickers=${encodeURIComponent(c.join(','))}`, BATCH_TIMEOUT_MS).catch(() => null)));
  let any = false;
  for (const r of res) {
    if (!r || !Array.isArray(r.results)) continue;
    any = true;
    for (const row of r.results) {
      const t = String(row?.ticker || '').toUpperCase();
      const rt = row?.realtime;
      if (!t || !rt || typeof rt !== 'object') continue;
      out[t] = parseRealtime(rt);
    }
  }
  if (!any) throw new Error('batch-failed');
  return out;
}

async function fetchEarnings(locale: string): Promise<Record<string, EarningsInfo>> {
  const j = await fetchJson('/api/market/earnings-calendar', EXTRAS_TIMEOUT_MS);
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

async function fetchWhales() {
  const j = await fetchJson('/api/flow/options-eod?all=1', EXTRAS_TIMEOUT_MS);
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

async function fetchDarkPool(tickers: string[]): Promise<Record<string, DarkPoolInfo>> {
  if (!tickers.length) return {};
  const j = await fetchJson(`/api/flow/dark-pool?t=${encodeURIComponent(tickers.slice(0, 200).join(','))}`, EXTRAS_TIMEOUT_MS);
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

// ─────────────────────────────────────────────────────────────────────────────
// 공용 캐시 — 대시보드·목록·빈 상태 미리보기가 같이 읽는다. 바뀌면 version 을 올려 구독자 전부 다시 그린다.
// ─────────────────────────────────────────────────────────────────────────────
type RowEntry = { at: number; rt: BatchRealtime };
const rowCache = new Map<string, RowEntry>();
/** 이 세션에서 끝난 마지막 요청(키 = 정렬된 티커 목록) */
const keyStatus = new Map<string, { at: number; ok: boolean }>();
const batchInflight = new Map<string, Promise<void>>();
/** 이번 세션에 화면이 물어본 종목(부가 사실을 sessionStorage 에 남길 범위) */
const interest = new Set<string>();

let earningsMem: { at: number; locale: string; data: Record<string, EarningsInfo> } | null = null;
let whaleMem: { at: number; data: Record<string, WhaleInfo> } | null = null;
const dpMem = new Map<string, { at: number; data: Record<string, DarkPoolInfo> }>();
let earningsInflight: Promise<void> | null = null;
let whalesInflight: Promise<void> | null = null;
const dpInflight = new Map<string, Promise<void>>();
let earningsFailed = false;
let whalesFailed = false;
const dpFailed = new Set<string>();

/** 지난 화면(새로고침 전)에서 남긴 부가 사실 — 그리기용 대체값일 뿐, 다시 받을지 판단에는 쓰지 않는다 */
let pEarn: { locale: string; m: Record<string, EarningsInfo> } | null = null;
let pWhale: Record<string, WhaleInfo> | null = null;
let pDp: { checked: Set<string>; m: Record<string, DarkPoolInfo> } | null = null;

let version = 1;
const subs = new Set<() => void>();
let hydrated = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function bump() {
  version += 1;
  subs.forEach((l) => { try { l(); } catch { /* noop */ } });
  schedulePersist();
}

function hydrateOnce() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const raw = window.sessionStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    const j = JSON.parse(raw);
    if (!j || j.v !== 1) return;
    const now = Date.now();
    if (Array.isArray(j.rows)) {
      for (const r of j.rows) {
        if (!Array.isArray(r) || r.length !== 3) continue;
        const [t, at, rt] = r;
        if (typeof t !== 'string' || typeof at !== 'number' || !rt || typeof rt !== 'object') continue;
        if (now - at > DISPLAY_MAX_AGE || at > now + 60_000) continue;
        rowCache.set(t, { at, rt: rt as BatchRealtime });
      }
    }
    if (j.earn && typeof j.earn.locale === 'string' && j.earn.m && typeof j.earn.m === 'object') pEarn = { locale: j.earn.locale, m: j.earn.m };
    if (j.whale && typeof j.whale === 'object') pWhale = j.whale;
    if (j.dp && Array.isArray(j.dp.checked) && j.dp.m && typeof j.dp.m === 'object') pDp = { checked: new Set(j.dp.checked), m: j.dp.m };
  } catch { /* 사생활 모드·깨진 값 — 메모리만 쓴다 */ }
}

function pick<T>(m: Record<string, T> | null | undefined, keys: Set<string>): Record<string, T> {
  const out: Record<string, T> = {};
  if (!m) return out;
  for (const k of keys) if (m[k] !== undefined) out[k] = m[k];
  return out;
}

function persistNow() {
  if (typeof window === 'undefined') return;
  try {
    const rows = [...rowCache.entries()]
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, PERSIST_ROWS_MAX)
      .map(([t, e]) => [t, e.at, e.rt] as const);
    const keys = new Set<string>([...interest, ...rows.map((r) => r[0])]);
    const earnSrc = earningsMem ? { locale: earningsMem.locale, m: earningsMem.data } : pEarn;
    const dpAll: Record<string, DarkPoolInfo> = { ...(pDp?.m ?? {}) };
    const checked = new Set<string>(pDp?.checked ?? []);
    for (const [k, entry] of dpMem) {
      for (const t of k.split(',')) { checked.add(t); delete dpAll[t]; }
      Object.assign(dpAll, entry.data);
    }
    const payload = {
      v: 1,
      rows,
      earn: earnSrc ? { locale: earnSrc.locale, m: pick(earnSrc.m, keys) } : undefined,
      whale: whaleMem ? pick(whaleMem.data, keys) : pWhale ? pick(pWhale, keys) : undefined,
      dp: { checked: [...checked].filter((t) => keys.has(t)), m: pick(dpAll, keys) },
    };
    window.sessionStorage.setItem(PERSIST_KEY, JSON.stringify(payload));
  } catch { /* 용량·사생활 모드 — 메모리만 쓴다 */ }
}

function schedulePersist() {
  if (typeof window === 'undefined' || persistTimer) return;
  persistTimer = setTimeout(() => { persistTimer = null; persistNow(); }, 400);
}

function subscribeCache(l: () => void) {
  hydrateOnce();
  subs.add(l);
  return () => { subs.delete(l); };
}
function getCacheVersion() {
  hydrateOnce();
  return version;
}
const getServerVersion = () => 0;

/** 같은 목록이면 요청 하나 — 진행 중이면 합류하고, 15초 안에 다 받았으면 묻지 않는다 */
function loadBatch(key: string): Promise<void> {
  const tickers = key.split(',');
  for (const t of tickers) interest.add(t);
  const running = batchInflight.get(key);
  if (running) return running;
  const now = Date.now();
  if (tickers.every((t) => { const e = rowCache.get(t); return !!e && now - e.at < MIN_REFETCH_MS; })) {
    const st = keyStatus.get(key);
    if (!st || !st.ok) { keyStatus.set(key, { at: now, ok: true }); bump(); }
    return Promise.resolve();
  }
  const p = fetchBatch(tickers)
    .then((data) => {
      const at = Date.now();
      for (const [t, rt] of Object.entries(data)) {
        rowCache.delete(t);                       // 삽입 순서 = 최근 순(넘치면 오래된 것부터 버린다)
        rowCache.set(t, { at, rt });
      }
      while (rowCache.size > ROW_CACHE_MAX) rowCache.delete(rowCache.keys().next().value as string);
      keyStatus.set(key, { at, ok: true });
    })
    .catch(() => { keyStatus.set(key, { at: Date.now(), ok: false }); })
    .finally(() => { batchInflight.delete(key); bump(); });
  batchInflight.set(key, p);
  return p;
}

function loadExtras(key: string, locale: string) {
  const now = Date.now();
  if (!earningsInflight && (!earningsMem || earningsMem.locale !== locale || now - earningsMem.at > EARNINGS_TTL)) {
    earningsInflight = fetchEarnings(locale)
      .then((d) => { earningsMem = { at: Date.now(), locale, data: d }; earningsFailed = false; })
      .catch(() => { earningsFailed = true; })     // 없으면 실적 칩이 안 선다
      .finally(() => { earningsInflight = null; bump(); });
  }
  if (!whalesInflight && (!whaleMem || now - whaleMem.at > EXTRAS_TTL)) {
    whalesInflight = fetchWhales()
      .then((d) => { whaleMem = { at: Date.now(), data: d.byTicker }; whalesFailed = false; })
      .catch(() => { whalesFailed = true; })       // 없으면 고래 칩이 안 선다
      .finally(() => { whalesInflight = null; bump(); });
  }
  const hit = dpMem.get(key);
  if (!dpInflight.has(key) && (!hit || now - hit.at > EXTRAS_TTL)) {
    dpInflight.set(key, fetchDarkPool(key.split(','))
      .then((d) => {
        dpMem.set(key, { at: Date.now(), data: d });
        if (dpMem.size > 12) dpMem.delete(dpMem.keys().next().value as string);
        dpFailed.delete(key);
      })
      .catch(() => { dpFailed.add(key); })           // 없으면 장외 칩이 안 선다
      .finally(() => { dpInflight.delete(key); bump(); }));
  }
}

// ── 분 단위 «지금» — 날짜 라벨·신선도 판정용(렌더에서 Date.now() 를 부르지 않는다) ──
let nowMs = 0;
let nowTimer: ReturnType<typeof setInterval> | null = null;
const nowListeners = new Set<() => void>();
export function subscribeWlNow(cb: () => void) {
  nowListeners.add(cb);
  if (nowTimer == null) {
    nowMs = Date.now();   // 화면에 다시 들어왔을 때 옛 «지금»을 쓰지 않게(React 가 구독 직후 값을 다시 읽는다)
    nowTimer = setInterval(() => { nowMs = Date.now(); nowListeners.forEach((l) => l()); }, 60_000);
  }
  return () => {
    nowListeners.delete(cb);
    if (!nowListeners.size && nowTimer != null) { clearInterval(nowTimer); nowTimer = null; }
  };
}
export function getWlNow() { if (!nowMs) nowMs = Date.now(); return nowMs; }
export function useWlNow(): number {
  return useSyncExternalStore(subscribeWlNow, getWlNow, () => 0);
}

export interface WatchlistData {
  rows: Record<string, BatchRealtime>;
  earnings: Record<string, EarningsInfo>;
  darkPool: Record<string, DarkPoolInfo>;
  whales: Record<string, WhaleInfo>;
  /** 이 목록으로 끝난 요청이 아직 없다 — 값이 없는 행은 뼈대로 그린다 */
  pending: boolean;
  /** 값이 하나도 없고 아직 기다리는 중 */
  loading: boolean;
  /** 값이 하나도 없고 마지막 요청이 실패했다 */
  error: boolean;
  /** 마지막 요청이 실패했다(값은 남아 있을 수 있다) */
  failed: boolean;
  /** 그리는 값 중 오래된 것이 있다(장중 3분 · 장 밖 20분) — 새 값이 올 때까지 흐리게 */
  stale: boolean;
  /** 실적·장외·고래(부가 사실)가 이 목록 전체에 대해 한 번은 정해졌다 */
  extrasSettled: boolean;
  /** 이 종목의 부가 사실이 정해졌나 — 행마다 판정(종목 하나를 더 담아도 다른 행의 칩은 그대로 둔다) */
  extrasReadyFor: (t: string) => boolean;
  refresh: () => void;
}

interface Derived {
  rows: Record<string, BatchRealtime>;
  earnings: Record<string, EarningsInfo>;
  darkPool: Record<string, DarkPoolInfo>;
  whales: Record<string, WhaleInfo>;
  have: number;
  oldest: number;
  status: { at: number; ok: boolean } | null;
  session: string | null;
  extrasSettled: boolean;
  extrasReadyFor: (t: string) => boolean;
}

const EMPTY_ROWS: Record<string, BatchRealtime> = {};
const EMPTY_EARN: Record<string, EarningsInfo> = {};
const EMPTY_DP: Record<string, DarkPoolInfo> = {};
const EMPTY_WHALE: Record<string, WhaleInfo> = {};
const never = () => false;
const always = () => true;
const EMPTY_DERIVED: Derived = {
  rows: EMPTY_ROWS, earnings: EMPTY_EARN, darkPool: EMPTY_DP, whales: EMPTY_WHALE,
  have: 0, oldest: Infinity, status: null, session: null, extrasSettled: false, extrasReadyFor: never,
};

function derive(key: string, locale: string, extras: boolean, v: number): Derived {
  if (!key || v === 0) return EMPTY_DERIVED;
  const tickers = key.split(',');
  const rows: Record<string, BatchRealtime> = {};
  let have = 0;
  let oldest = Infinity;
  let session: string | null = null;
  for (const t of tickers) {
    const e = rowCache.get(t);
    if (!e) continue;
    rows[t] = e.rt;
    have += 1;
    if (e.at < oldest) oldest = e.at;
    if (!session && e.rt.session) session = e.rt.session;
  }
  const status = keyStatus.get(key) ?? null;
  if (!extras) return { ...EMPTY_DERIVED, rows, have, oldest, status, session };
  const earnings = earningsMem && earningsMem.locale === locale ? earningsMem.data
    : pEarn && pEarn.locale === locale ? pEarn.m : EMPTY_EARN;
  const whales = whaleMem ? whaleMem.data : pWhale ?? EMPTY_WHALE;
  // 장외 비중은 «목록» 단위로 받는다 — 종목을 하나 더 담으면 새 목록 키가 된다.
  //   지난 목록에서 받은 값도 종목별로 이어 쓰고(최근 요청이 이긴다 · 그 요청에 없던 종목은 «없음»),
  //   «이 종목을 물어본 적이 있나(covered)»로 행마다 정해짐을 판정한다.
  const want = new Set(tickers);
  const darkPool: Record<string, DarkPoolInfo> = pDp ? pick(pDp.m, want) : {};
  const covered = new Set<string>(pDp ? [...pDp.checked].filter((t) => want.has(t)) : []);
  for (const [k, entry] of dpMem) {
    for (const t of k.split(',')) {
      if (!want.has(t)) continue;
      covered.add(t);
      delete darkPool[t];
      if (entry.data[t]) darkPool[t] = entry.data[t];
    }
  }
  for (const k of dpFailed) for (const t of k.split(',')) if (want.has(t)) covered.add(t);
  const earnDone = (!!earningsMem && earningsMem.locale === locale) || earningsFailed || (!!pEarn && pEarn.locale === locale);
  const whaleDone = !!whaleMem || whalesFailed || !!pWhale;
  const base = earnDone && whaleDone;
  const extrasReadyFor = !base ? never : covered.size >= want.size && tickers.every((t) => covered.has(t)) ? always : (t: string) => covered.has(t);
  return {
    rows, earnings, darkPool, whales, have, oldest, status, session,
    extrasSettled: base && tickers.every((t) => covered.has(t)),
    extrasReadyFor,
  };
}

export function useWatchlistData(
  tickers: readonly string[],
  opts: { extras?: boolean; locale?: string } = {},
): WatchlistData {
  const extras = !!opts.extras;
  const locale = opts.locale || 'en';
  const key = useMemo(() => [...new Set(tickers)].sort().join(','), [tickers]);
  // 서버·하이드레이션 첫 그림은 0(빈 값) → 서버 HTML 과 같다. 그 뒤로는 캐시에서 바로 그린다.
  const v = useSyncExternalStore(subscribeCache, getCacheVersion, getServerVersion);
  const now = useWlNow();
  const [tick, setTick] = useState(0);
  const sessionRef = useRef<string | null>(null);

  const refresh = useCallback(() => setTick((x) => x + 1), []);

  // 가격·레벨
  useEffect(() => {
    if (!key) return;
    void loadBatch(key);
  }, [key, tick]);

  // 부가 사실(실적·장외·고래) — 목록 화면에서만
  useEffect(() => {
    if (!extras || !key) return;
    loadExtras(key, locale);
  }, [extras, key, tick, locale]);

  const d = useMemo(() => derive(key, locale, extras, v), [key, locale, extras, v]);
  useEffect(() => { sessionRef.current = d.session; }, [d.session]);

  // 폴링 — 보일 때만. 장중(reg·pre·post) 30초, 아니면 5분.
  useEffect(() => {
    if (!key) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      const live = LIVE_SESSIONS.includes(sessionRef.current || '');
      timer = setTimeout(() => {
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
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('app:resume', onResume);
    };
  }, [key, refresh]);

  const done = !!d.status;
  const failed = !!d.status && !d.status.ok;
  const staleMs = LIVE_SESSIONS.includes(d.session || '') ? STALE_LIVE_MS : STALE_CLOSED_MS;
  return {
    rows: d.rows,
    earnings: d.earnings,
    darkPool: d.darkPool,
    whales: d.whales,
    pending: !!key && !done,
    loading: !!key && d.have === 0 && !done,
    error: !!key && d.have === 0 && failed,
    failed,
    stale: d.have > 0 && now > 0 && now - d.oldest > staleMs,
    extrasSettled: !extras || d.extrasSettled,
    extrasReadyFor: extras ? d.extrasReadyFor : always,
    refresh,
  };
}

/** 테스트용 — 모듈 캐시 초기화 · 안쪽 함수(요청 합류·신선도 문·저장·복원) */
export function _resetWatchlistDataForTest() {
  rowCache.clear(); keyStatus.clear(); batchInflight.clear(); interest.clear();
  earningsMem = null; whaleMem = null; dpMem.clear(); dpInflight.clear();
  earningsInflight = null; whalesInflight = null; earningsFailed = false; whalesFailed = false; dpFailed.clear();
  pEarn = null; pWhale = null; pDp = null; hydrated = false; version = 1;
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
}
export const _wlDataTest = {
  loadBatch,
  loadExtras,
  derive: (key: string, locale = 'en', extras = false) => derive(key, locale, extras, version),
  hydrate: () => hydrateOnce(),
  flushPersist: () => { if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; } persistNow(); },
  PERSIST_KEY,
};
