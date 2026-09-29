'use client';

// ============================================================================
// «내 종목» 행 데이터 — 이미 계산 중인 값만 쓴다(새 벤더·새 비용 없음, 기획서 1-3)
//   가격·레벨·내재 변동   /api/watchlist/batch?mode=price   (보이는 목록 하나 = 요청 하나, 30개씩 나눔 — BATCH_MAX 주석)
//   실적 날짜·발표 시각    /api/market/earnings-calendar      (시장 전체 1콜, 서버 6시간 캐시)
//   장외 비중(FINRA)       /api/flow/dark-pool?t=A,B,…        (EOD · 출처 표기 필수)
//   고래 신규 포지션       /api/flow/options-eod?all=1         (전 종목 1콜 · CDN 10분 · 콜/풋 따로)
// 폴링: 화면이 보일 때만 · 정규장(또는 세션을 아직 모름) 30초 · 프리·애프터·장 마감 5분(표시값 = 본장 종가라 안 바뀐다 —
//   프리마켓은 09:30 ET 개장 직후로 당긴다). 세션이 바뀌면 타이머를 다시 건다. 앱 복귀(app:resume)·화면 복귀에 즉시 한 번.
//
// 빠르게 — «다시 그릴 때 기다리지 않는다»:
//   · 캐시는 «종목 하나» 단위다 — 대시보드(앞 3개)에서 받은 값이 목록 화면 첫 그림에 바로 선다.
//     종목을 하나 더 담아도 나머지 행은 그대로 있고 새 행만 뼈대로 기다린다.
//   · 같은 목록 요청이 진행 중이면 새로 보내지 않고 합류한다 · 15초 안에 받은 값이면 다시 묻지 않는다.
//   · 마지막으로 잘 받은 값은 sessionStorage 에도 둔다(최대 6시간) — 새로고침·언어 변경 뒤에도 첫 그림이 비지 않는다.
//     오래된 값(정규장 3분 · 그 밖 20분)은 stale=true 로 알려 화면이 흐리게 그린다(«지금 값»처럼 보이지 않게).
//     새 값이 오면 바로 바꾼다.
//
// 지어내지 않는다:
//   · 가격 0 이하 = «못 받음» — 0.00% 로 그리지 않고, 마지막 정상값이 있으면 그것을 둔다(오래되면 흐려진다).
//   · 200 OK 라도 «오류·미적재»를 알리는 부가 사실 응답은 실패다 — «값 없음»으로 15분 굳히지 않고 45초 뒤 다시 묻는다.
//   · 여러 묶음 중 하나라도 실패하면 «실패»(다시 시도)로 적는다.
// ============================================================================

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { tickerName } from '@/lib/app/tickerNames';
import { etMinutesOf, type WlLocale } from '@/lib/app/watchlistInsights';

export interface BatchRealtime {
  /** 받은 가격(0 이하는 «못 받음» → null) */
  price?: number | null;
  changePct?: number | null;
  session?: string | null;
  maxPain?: number | null;
  callWall?: number | null;
  putFloor?: number | null;
  gammaFlipLevel?: number | null;
  // impliedMovePct 는 일부러 읽지 않는다 — 묶음 API 의 그 값은 옵션 내재 변동이 아니라 (콜월 − 풋플로어) ÷ 가격이다
  //   (watchlistBatchService). «옵션 ±»로 보이면 틀린 숫자가 된다(watchlistInsights InsightInput 주석).
  extendedPrice?: number | null;
  extendedChangePct?: number | null;
  extendedLabel?: string | null;
  levelsChainDate?: string | null;
  levelsSource?: string | null;
  levelsExpiration?: string | null;
  /** 서버 정의 게이트(optionLevelGate)가 지운 레벨 필드 — 빈 레벨이 «원래 없음»인지 «정의 위반»인지 가른다 */
  levelsDropped?: string[] | null;
  /** 응답에 levelsSource 키가 있었나(72 이후) — 클라이언트가 붙인다 */
  hasLevelsMeta?: boolean;
  /** 이 값을 받은 시각(ms) — 클라이언트가 붙인다. 가격 기준 라벨(«9/28 종가»·«장중»)은 «지금»이 아니라 이 시각으로 계산한다 */
  receivedAt?: number;
}

export interface EarningsInfo { date: string; hour: string; name?: string | null }
export interface DarkPoolInfo { pct: number; volRatio: number | null; date: string | null }
/**
 * 고래 신규 포지션 — 우세한 쪽(금액 기준, 서버 side 와 같은 규칙) «한쪽»의 숫자만. 콜+풋 합계를 «신규 콜»로 적지 않는다.
 *   notional = 그쪽 ΔOI×100×행사가(프리미엄 아님 — 문턱에만 쓴다) · date = OI 를 잰 EOD 세션 · prevDate = 비교한 직전 세션
 */
export interface WhaleInfo { side: 'call' | 'put'; contracts: number; notional: number; date: string | null; prevDate: string | null }

/**
 * 한 요청에 담는 종목 수 상한 — 30개 이하일 때만 서버가 종목별 실시간 스냅샷으로 받는다(intrinioClient DIRECT_SNAPSHOT_MAX).
 * 31개부터는 벌크 경로다: day.c = NBBO 중간값 캐시(5분) · 전일 종가 벌크 EOD(T+1) → 프리·애프터에 «종가» 자리에 시간외
 * 중간값, 장중엔 최대 5분 묵은 값이 섰다. 그래서 30개씩 여러 요청으로 나눈다(서버 라우트 상한은 50).
 */
export const BATCH_MAX = 30;
const EXTRAS_TTL = 15 * 60_000;
const EARNINGS_TTL = 30 * 60_000;
/** 부가 사실(실적·장외·고래)이 실패하면 이만큼 뒤 «그것만» 다시 묻는다 — 칩이 15분씩 사라지지 않게 */
export const EXTRAS_RETRY_MS = 45_000;
/** 이 안에 받은 값이면 화면에 다시 들어와도 묻지 않는다 */
const MIN_REFETCH_MS = 15_000;
/** 폴링 간격 — 정규장(또는 세션 모름) · 프리/애프터/장 마감 */
export const POLL_LIVE_MS = 30_000;
export const POLL_SLOW_MS = 5 * 60_000;
/** 이보다 오래된 값은 «흐리게»(stale) — 정규장은 폴링 30초라 3분이면 여러 번 놓친 것 · 그 밖은 폴링 5분이라 20분 */
const STALE_LIVE_MS = 3 * 60_000;
const STALE_SLOW_MS = 20 * 60_000;
/** 이보다 오래된 값은 아예 그리지 않는다(뼈대로 기다린다) · 못 받은 가격 대신 붙들어 두는 한도 */
const DISPLAY_MAX_AGE = 6 * 3_600_000;
const BATCH_TIMEOUT_MS = 9_000;
const EXTRAS_TIMEOUT_MS = 7_000;
const ROW_CACHE_MAX = 300;
/** v2 — 가격 0 = null(못 받음) · 고래 콜/풋 분리 · 받은 시각. 모양이 바뀌어 옛 v1 은 읽지 않고 지운다 */
const PERSIST_KEY = 'sg-wl-cache-v2';
const PERSIST_KEY_OLD = 'sg-wl-cache-v1';
const PERSIST_V = 2;
const PERSIST_ROWS_MAX = 80;
/** 표시값이 본장 종가라 30초마다 물을 까닭이 없는 세션 */
const SLOW_SESSIONS = ['pre', 'post', 'closed'];

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * 다음 폴링까지(ms).
 *   정규장('reg') · 세션을 아직 모름(null) → 30초. 모르는 채 5분을 잡으면 첫 응답이 'reg' 여도 5분 동안 안 바뀌었다.
 *   프리·애프터·장 마감 → 5분. 표시값이 본장 종가라 바뀌지 않는데 30초마다 서버가 FINRA·DynamoDB·유동성 계산을 돌렸다.
 *     프리마켓은 09:30 ET 개장 직후(+5초)로 당긴다 — 개장 첫 값을 5분 늦추지 않게.
 */
export function pollDelayMs(session: string | null | undefined, nowMs: number): number {
  if (!session || !SLOW_SESSIONS.includes(session)) return POLL_LIVE_MS;
  if (session === 'pre') {
    // ET 오프셋은 정시 단위라 «이 분 안에서 지난 ms» 는 UTC 와 같다
    const untilOpen = (9 * 60 + 30 - etMinutesOf(nowMs)) * 60_000 - (nowMs % 60_000) + 5_000;
    if (untilOpen <= 0) return POLL_LIVE_MS;      // 개장 시각이 지났는데 아직 'pre' — 곧 'reg' 로 바뀐다
    return Math.min(POLL_SLOW_MS, Math.max(POLL_LIVE_MS, untilOpen));
  }
  return POLL_SLOW_MS;
}

/** 이보다 오래된 값이면 «흐리게» — 세션의 폴링 간격에 맞춘다 */
export function staleAfterMs(session: string | null | undefined): number {
  return session && SLOW_SESSIONS.includes(session) ? STALE_SLOW_MS : STALE_LIVE_MS;
}

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
  const px = num(rt.price);
  // 가격 0 이하 = «못 받음» — 서버가 스냅샷 없는 종목에 price 0 · changePct 0 을 싣는다. «— · 0.00%»로 그리지 않는다.
  const got = px != null && px > 0;
  return {
    price: got ? px : null,
    changePct: got ? num(rt.changePct) : null,
    session: typeof rt.session === 'string' ? rt.session : null,
    maxPain: num(rt.maxPain), callWall: num(rt.callWall), putFloor: num(rt.putFloor), gammaFlipLevel: num(rt.gammaFlipLevel),
    extendedPrice: got ? num(rt.extendedPrice) : null,
    extendedChangePct: got ? num(rt.extendedChangePct) : null,
    extendedLabel: got && typeof rt.extendedLabel === 'string' ? rt.extendedLabel : null,
    levelsChainDate: typeof rt.levelsChainDate === 'string' ? rt.levelsChainDate : null,
    levelsSource: typeof rt.levelsSource === 'string' ? rt.levelsSource : null,
    levelsExpiration: typeof rt.levelsExpiration === 'string' ? rt.levelsExpiration : null,
    levelsDropped: Array.isArray(rt.levelsDropped) ? rt.levelsDropped.filter((x: unknown): x is string => typeof x === 'string') : null,
    hasLevelsMeta: Object.prototype.hasOwnProperty.call(rt, 'levelsSource'),
  };
}

/**
 * 묶음마다 한 요청. partial = 받은 묶음도 있지만 실패한 묶음이 있다(목록 전체로는 «실패» — 다시 시도를 띄운다).
 * asked = 성공한 묶음이 물은 종목(그 묶음에 행이 없으면 «못 받음»이다).
 */
async function fetchBatch(tickers: string[]): Promise<{ data: Record<string, BatchRealtime>; partial: boolean; asked: string[] }> {
  const out: Record<string, BatchRealtime> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < tickers.length; i += BATCH_MAX) chunks.push(tickers.slice(i, i + BATCH_MAX));
  const res = await Promise.all(chunks.map((c) =>
    fetchJson(`/api/watchlist/batch?mode=price&tickers=${encodeURIComponent(c.join(','))}`, BATCH_TIMEOUT_MS).catch(() => null)));
  let okChunks = 0;
  const asked: string[] = [];
  res.forEach((r, i) => {
    if (!r || !Array.isArray(r.results)) return;
    okChunks += 1;
    asked.push(...chunks[i]);
    for (const row of r.results) {
      const t = String(row?.ticker || '').toUpperCase();
      const rt = row?.realtime;
      if (!t || !rt || typeof rt !== 'object') continue;
      out[t] = parseRealtime(rt);
    }
  });
  if (!okChunks) throw new Error('batch-failed');
  return { data: out, partial: okChunks < chunks.length, asked };
}

async function fetchEarnings(locale: string): Promise<Record<string, EarningsInfo>> {
  const j = await fetchJson('/api/market/earnings-calendar', EXTRAS_TIMEOUT_MS);
  const rows: any[] = Array.isArray(j?.rows) ? j.rows : [];
  // 이 라우트는 오류도 200 {ok:true, rows:[], reason} 으로 알린다 — «실적 없음»으로 굳히지 않는다(부가 사실 실패와 같은 종류).
  //   'no-key'(서버 설정 없음)는 다시 물어도 같으므로 «없음»으로 둔다.
  if (!j || !Array.isArray(j.rows) || (!rows.length && j.reason && j.reason !== 'no-key')) throw new Error(`earnings-unavailable:${j?.reason ?? ''}`);
  const out: Record<string, EarningsInfo> = {};
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
  // 200 이라도 «아직 못 읽음»(available:false · options-eod-not-loaded)은 실패다 — «신규 포지션 없음»으로 15분 굳히지 않는다
  if (!j || j.available !== true || !j.opening || typeof j.opening !== 'object') throw new Error(`whales-unavailable:${j?.reason ?? ''}`);
  const byTicker: Record<string, WhaleInfo> = {};
  const date = typeof j.date === 'string' ? j.date : null;
  const prevDate = typeof j.prevDate === 'string' ? j.prevDate : null;
  for (const [t, v] of Object.entries<any>(j.opening)) {
    const cc = num(v?.callContracts), pc = num(v?.putContracts), cn = num(v?.callNotional), pn = num(v?.putNotional);
    // 콜·풋을 나눠 싣지 않은 옛 모양은 쓰지 않는다 — 합계를 한쪽 이름으로 적으면 거짓이 된다
    if (cc == null || pc == null || cn == null || pn == null) continue;
    const side: 'call' | 'put' = cn >= pn ? 'call' : 'put';
    const contracts = side === 'call' ? cc : pc;
    const notional = side === 'call' ? cn : pn;
    if (!(contracts > 0)) continue;
    byTicker[t.toUpperCase()] = { side, contracts, notional, date, prevDate };
  }
  return { date, byTicker };
}

async function fetchDarkPool(tickers: string[]): Promise<Record<string, DarkPoolInfo>> {
  if (!tickers.length) return {};
  const j = await fetchJson(`/api/flow/dark-pool?t=${encodeURIComponent(tickers.slice(0, 200).join(','))}`, EXTRAS_TIMEOUT_MS);
  // 200 이라도 오류·미적재(reason error · not-loaded)는 실패다 — 원천을 못 읽은 것과 «값 없음»이 같은 모양으로 온다.
  //   진짜 «없음»은 not-in-universe(원천은 읽었는데 FINRA 목록에 없다)뿐이다. 서버는 실패를 캐시하지 않는다(no-store).
  //   ticker-not-in-finra-universe 는 예전 서버의 같은 뜻(CDN 에 남은 응답) — 사유가 없는 여러 종목 빈 응답도 예전 모양이라 실패로 본다.
  const legitNone = j?.reason === 'not-in-universe' || j?.reason === 'ticker-not-in-finra-universe';
  if (!j || (j.available === false && !legitNone)) throw new Error(`dp-unavailable:${j?.reason ?? ''}`);
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
/** 마지막 실패 시각(0 = 실패 아님) — 실패도 «정해짐»(칩 없이 그린다)이고, EXTRAS_RETRY_MS 뒤 다시 묻는다 */
let earningsFailedAt = 0;
let whalesFailedAt = 0;
const dpFailedAt = new Map<string, number>();

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
  try { window.sessionStorage.removeItem(PERSIST_KEY_OLD); } catch { /* 사생활 모드 */ }
  try {
    const raw = window.sessionStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    const j = JSON.parse(raw);
    if (!j || j.v !== PERSIST_V) return;
    const now = Date.now();
    if (Array.isArray(j.rows)) {
      for (const r of j.rows) {
        if (!Array.isArray(r) || r.length !== 3) continue;
        const [t, at, rt] = r;
        if (typeof t !== 'string' || typeof at !== 'number' || !rt || typeof rt !== 'object') continue;
        if (now - at > DISPLAY_MAX_AGE || at > now + 60_000) continue;
        const row = { ...(rt as BatchRealtime), receivedAt: at };
        if (!(typeof row.price === 'number' && row.price > 0)) { row.price = null; row.changePct = null; }
        rowCache.set(t, { at, rt: row });
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
      v: PERSIST_V,
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
    .then(({ data, partial, asked }) => {
      const at = Date.now();
      let kept = false;
      for (const [t, rt] of Object.entries(data)) {
        const prev = rowCache.get(t);
        // 가격을 못 받았는데 마지막 정상값이 있으면 그것을 둔다 — 받은 시각도 그대로라 오래되면 흐려지고(stale),
        //   이 목록은 «실패»로 적어 다시 시도를 띄운다. 6시간 넘은 값은 붙들지 않는다(없음으로 그린다).
        if (rt.price == null && prev?.rt.price != null && at - prev.at < DISPLAY_MAX_AGE) { kept = true; continue; }
        rowCache.delete(t);                       // 삽입 순서 = 최근 순(넘치면 오래된 것부터 버린다)
        rowCache.set(t, { at, rt: { ...rt, receivedAt: at } });
      }
      // 물었는데 행이 아예 안 온 종목(서버가 그 종목만 오류)도 «못 받음» — 같은 규칙: 6시간 안의 옛 값은 두고 실패로 적는다
      for (const t of asked) {
        if (data[t]) continue;
        const prev = rowCache.get(t);
        if (!prev) continue;
        if (at - prev.at < DISPLAY_MAX_AGE) kept = true; else rowCache.delete(t);
      }
      while (rowCache.size > ROW_CACHE_MAX) rowCache.delete(rowCache.keys().next().value as string);
      keyStatus.set(key, { at, ok: !partial && !kept });
    })
    .catch(() => { keyStatus.set(key, { at: Date.now(), ok: false }); })
    .finally(() => { batchInflight.delete(key); bump(); });
  batchInflight.set(key, p);
  return p;
}

function loadExtras(key: string, locale: string) {
  for (const t of key.split(',')) interest.add(t);     // 부가 사실(이름 포함)을 sessionStorage 에 남길 범위
  const now = Date.now();
  if (!earningsInflight && (!earningsMem || earningsMem.locale !== locale || now - earningsMem.at > EARNINGS_TTL)) {
    earningsInflight = fetchEarnings(locale)
      .then((d) => { earningsMem = { at: Date.now(), locale, data: d }; earningsFailedAt = 0; })
      .catch(() => { earningsFailedAt = Date.now(); })     // 없으면 실적 칩이 안 선다 — 45초 뒤 다시
      .finally(() => { earningsInflight = null; bump(); });
  }
  if (!whalesInflight && (!whaleMem || now - whaleMem.at > EXTRAS_TTL)) {
    whalesInflight = fetchWhales()
      .then((d) => { whaleMem = { at: Date.now(), data: d.byTicker }; whalesFailedAt = 0; })
      .catch(() => { whalesFailedAt = Date.now(); })       // 없으면 고래 칩이 안 선다 — 45초 뒤 다시
      .finally(() => { whalesInflight = null; bump(); });
  }
  const hit = dpMem.get(key);
  if (!dpInflight.has(key) && (!hit || now - hit.at > EXTRAS_TTL)) {
    dpInflight.set(key, fetchDarkPool(key.split(','))
      .then((d) => {
        dpMem.set(key, { at: Date.now(), data: d });
        if (dpMem.size > 12) dpMem.delete(dpMem.keys().next().value as string);
        dpFailedAt.delete(key);
      })
      .catch(() => { dpFailedAt.set(key, Date.now()); })   // 없으면 장외 칩이 안 선다 — 45초 뒤 다시
      .finally(() => { dpInflight.delete(key); bump(); }));
  }
}

/** 실패한 부가 사실을 다시 물을 시각(ms) — 실패한 것이 없거나 이미 다시 묻는 중이면 null */
function extrasRetryAt(key: string): number | null {
  let at = Infinity;
  if (earningsFailedAt && !earningsInflight) at = Math.min(at, earningsFailedAt + EXTRAS_RETRY_MS);
  if (whalesFailedAt && !whalesInflight) at = Math.min(at, whalesFailedAt + EXTRAS_RETRY_MS);
  const dpAt = dpFailedAt.get(key);
  if (dpAt && !dpInflight.has(key)) at = Math.min(at, dpAt + EXTRAS_RETRY_MS);
  return Number.isFinite(at) ? at : null;
}

/**
 * 종목 이름 — 목록·편집 목록·대시보드·시트가 «같은 공급원»을 쓴다.
 *   이름표(tickerNames) → 이 기기가 받은 실적 브리프 이름(그 언어 · 새로고침 뒤엔 sessionStorage) → 빈 문자열.
 *   (예전엔 목록만 브리프 이름을 썼고 편집 목록·대시보드는 같은 종목 이름이 비어 있었다.)
 *   이 캐시를 구독한 화면(useWatchlistData)은 실적이 도착하면 다시 그리므로 이름도 따라 바뀐다.
 */
export function wlTickerName(t: string, loc: WlLocale): string {
  const T = (t || '').toUpperCase();
  const m = earningsMem && earningsMem.locale === loc ? earningsMem.data
    : pEarn && pEarn.locale === loc ? pEarn.m : null;
  return tickerName(T, loc, m?.[T]?.name ?? null);
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
  /** 행 값 — receivedAt(받은 시각)이 붙어 있다 */
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
  /** 마지막 요청이 실패했다(한 묶음만 실패했거나 가격을 못 받아 옛 값을 붙든 행이 있어도) — 값은 남아 있을 수 있다 */
  failed: boolean;
  /** 그리는 값 중 오래된 것이 있다(정규장 3분 · 그 밖 20분) — 새 값이 올 때까지 흐리게 */
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
  /** 가장 최근에 받은 행의 세션 — 폴링 간격·흐림 기준 */
  session: string | null;
  extrasSettled: boolean;
  extrasReadyFor: (t: string) => boolean;
  /** 실패한 부가 사실을 다시 물을 시각(없으면 null) */
  retryAt: number | null;
}

const EMPTY_ROWS: Record<string, BatchRealtime> = {};
const EMPTY_EARN: Record<string, EarningsInfo> = {};
const EMPTY_DP: Record<string, DarkPoolInfo> = {};
const EMPTY_WHALE: Record<string, WhaleInfo> = {};
const never = () => false;
const always = () => true;
const EMPTY_DERIVED: Derived = {
  rows: EMPTY_ROWS, earnings: EMPTY_EARN, darkPool: EMPTY_DP, whales: EMPTY_WHALE,
  have: 0, oldest: Infinity, status: null, session: null, extrasSettled: false, extrasReadyFor: never, retryAt: null,
};

function derive(key: string, locale: string, extras: boolean, v: number): Derived {
  if (!key || v === 0) return EMPTY_DERIVED;
  const tickers = key.split(',');
  const rows: Record<string, BatchRealtime> = {};
  let have = 0;
  let oldest = Infinity;
  let session: string | null = null;
  let newest = -Infinity;
  for (const t of tickers) {
    const e = rowCache.get(t);
    if (!e) continue;
    rows[t] = e.rt;
    have += 1;
    if (e.at < oldest) oldest = e.at;
    // 세션은 «가장 최근에 받은» 행의 것 — 복원된 옛 행(어제 'post')이 오늘 'reg' 를 가리지 않게
    if (e.rt.session && e.at > newest) { newest = e.at; session = e.rt.session; }
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
  for (const k of dpFailedAt.keys()) for (const t of k.split(',')) if (want.has(t)) covered.add(t);
  const earnDone = (!!earningsMem && earningsMem.locale === locale) || earningsFailedAt > 0 || (!!pEarn && pEarn.locale === locale);
  const whaleDone = !!whaleMem || whalesFailedAt > 0 || !!pWhale;
  const base = earnDone && whaleDone;
  const extrasReadyFor = !base ? never : covered.size >= want.size && tickers.every((t) => covered.has(t)) ? always : (t: string) => covered.has(t);
  return {
    rows, earnings, darkPool, whales, have, oldest, status, session,
    extrasSettled: base && tickers.every((t) => covered.has(t)),
    extrasReadyFor,
    retryAt: extrasRetryAt(key),
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
  const session = d.session;
  const retryAt = d.retryAt;

  // 폴링 — 보일 때만. 간격은 세션별(pollDelayMs) — 세션이 바뀌면(모름 → 'reg', 'pre' → 'reg' …) 타이머를 다시 건다.
  useEffect(() => {
    if (!key) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (document.visibilityState === 'visible') refresh();
        schedule();
      }, pollDelayMs(session, Date.now()));
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
  }, [key, refresh, session]);

  // 부가 사실이 실패했으면 45초 뒤 «그것만» 다시 묻는다(가격 폴링과 따로 — 장 밖 5분 폴링을 기다리지 않는다)
  useEffect(() => {
    if (!extras || !key || retryAt == null) return;
    const id = setTimeout(() => {
      if (document.visibilityState === 'visible') loadExtras(key, locale);
    }, Math.max(1_000, retryAt - Date.now()));
    return () => clearTimeout(id);
  }, [extras, key, locale, retryAt]);

  const done = !!d.status;
  const failed = !!d.status && !d.status.ok;
  const staleMs = staleAfterMs(session);
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
  earningsInflight = null; whalesInflight = null; earningsFailedAt = 0; whalesFailedAt = 0; dpFailedAt.clear();
  pEarn = null; pWhale = null; pDp = null; hydrated = false; version = 1;
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
}
export const _wlDataTest = {
  loadBatch,
  loadExtras,
  derive: (key: string, locale = 'en', extras = false) => derive(key, locale, extras, version),
  hydrate: () => hydrateOnce(),
  flushPersist: () => { if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; } persistNow(); },
  extrasRetryAt,
  PERSIST_KEY,
  PERSIST_KEY_OLD,
};
