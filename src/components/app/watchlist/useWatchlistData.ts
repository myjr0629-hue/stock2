'use client';

// ============================================================================
// «내 종목» 행 데이터 — 내 종목만의 것은 «담은 목록과 화면»뿐이다(대표 9/30). 값은 다른 화면과 같은 원천을 그대로 쓴다.
//   가격·등락·시간외  공용 실시간 가격(src/hooks/useLiveQuotes — 가격 허브 연결 + /api/live/quotes 예비 + calcPriceDisplay)
//                    대시보드 «내 종목» 카드와 목록 화면이 같은 훅이라 숫자가 늘 같다.
//   옵션 레벨        /api/watchlist/batch?mode=price 의 레벨(구조 한 벌 저장본 — 종목 화면과 같은 결과를 읽기만 한다 · 72)
//                    목록 화면에서만 · 15분마다(EOD 판본이라 장중에 바뀌지 않는다) · 30개씩 나눔(BATCH_MAX)
//   실적 날짜·발표 시각  /api/market/earnings-calendar      (시장 전체 1콜, 서버 6시간 캐시) — 종목별 «다음 실적» 고르기는
//                    공용 규칙 lib/earningsDate.ts pickNextEarnings(Command·Intel·웹 티커와 같은 함수 · 9/30)
//   장외 비중(FINRA)     /api/flow/dark-pool?t=A,B,…        (EOD · 출처 표기 필수)
//   고래 신규 포지션     /api/flow/options-eod?all=1         (전 종목 1콜 · CDN 10분 · 콜/풋 따로)
// 걷어낸 것(9/30): 내 종목 전용 가격 폴링(30초 묶음 요청)·행 사본(sessionStorage sg-wl-cache-v2 · localStorage sg-wl-last-v1)·
//   첫 요청 15초·빠른 재시도 — 공용 연결이 대신한다. 첫 그림: 담은 목록(이름·로고)은 즉시, 가격은 공용 연결이 주는 대로.
//
// 지어내지 않는다:
//   · 가격이 없으면 «—» · 등락을 모르면 비운다(0.00% 를 지어내지 않는다 — liveDisplay).
//   · 200 OK 라도 «오류·미적재»를 알리는 부가 사실 응답은 실패다 — «값 없음»으로 15분 굳히지 않고 다시 묻는다.
//     다시 묻기는 지수 백오프(45초 → 90초 → 3분 → … 상한 15분)이고 폴링 tick 마다 다시 부르지 않는다(E1 — 되먹임 금지).
//   · 레벨 묶음이 하나라도 실패하면 «실패»(다시 시도) — 받은 묶음의 레벨은 쓴다.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { tickerName } from '@/lib/app/tickerNames';
import type { WlLocale } from '@/lib/app/watchlistInsights';
import { useLiveQuotes } from '@/hooks/useLiveQuotes';
import type { LiveDisplay } from '@/utils/liveQuote';
import { pickNextEarnings } from '@/lib/earningsDate';
import { etDateOf } from '@/lib/marketCalendar';

export interface BatchRealtime {
  /** 그리는 가격(공용 실시간 가격 · 없으면 null → «—») */
  price?: number | null;
  /** 그리는 등락(모르면 null) */
  changePct?: number | null;
  /** 이 숫자의 세션 — 'pre' | 'reg' | 'post' | 'closed' */
  session?: string | null;
  /** 시간외 체결가를 그린다(프리·애프터) — 가격 기준 라벨이 «프리마켓·애프터마켓» */
  ext?: boolean;
  /** 가격 허브 틱이다(아니면 시세 요청 값) */
  live?: boolean;
  maxPain?: number | null;
  callWall?: number | null;
  putFloor?: number | null;
  gammaFlipLevel?: number | null;
  // impliedMovePct 는 일부러 읽지 않는다 — 묶음 API 의 그 값은 옵션 내재 변동이 아니라 (콜월 − 풋플로어) ÷ 가격이다
  //   (watchlistBatchService). «옵션 ±»로 보이면 틀린 숫자가 된다(watchlistInsights InsightInput 주석).
  levelsChainDate?: string | null;
  levelsSource?: string | null;
  levelsExpiration?: string | null;
  /** 서버 정의 게이트(optionLevelGate)가 지운 레벨 필드 — 빈 레벨이 «원래 없음»인지 «정의 위반»인지 가른다 */
  levelsDropped?: string[] | null;
  /** 응답에 levelsSource 키가 있었나(72 이후) — 클라이언트가 붙인다 */
  hasLevelsMeta?: boolean;
  /** 이 가격을 받은 시각(ms). 가격 기준 라벨(«9/28 종가»·«장중»)은 «지금»이 아니라 이 시각으로 계산한다(A10) */
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
 * 레벨 묶음 한 요청의 종목 수 상한 — 30개 이하일 때만 서버가 종목별 실시간 스냅샷으로 받는다(intrinioClient DIRECT_SNAPSHOT_MAX).
 * 31개부터는 벌크 경로라 서버의 정의 게이트(현물 기준)가 묵은 가격으로 돈다 — 30개씩 나눈다(서버 라우트 상한은 50).
 */
export const BATCH_MAX = 30;
/** 옵션 레벨을 다시 묻는 간격 — 구조 저장본은 EOD 판본이라 장중에 바뀌지 않는다(예전엔 가격과 함께 30초마다 물었다) */
export const LEVELS_TTL_MS = 15 * 60_000;
const LEVELS_TIMEOUT_MS = 15_000;
const EXTRAS_TTL = 15 * 60_000;
const EARNINGS_TTL = 30 * 60_000;
/** 부가 사실(실적·장외·고래)이 실패하면 이만큼 뒤 «그것만» 다시 묻는다 — 칩이 15분씩 사라지지 않게. 실패가 이어지면 두 배씩 */
export const EXTRAS_RETRY_MS = 45_000;
/** 다시 묻기 간격 상한 — 서버가 실패를 짧게 캐시하고(실적 90초·장외 30초) 여기서 물러나 벤더 되먹임을 끊는다(E1) */
export const EXTRAS_RETRY_MAX_MS = 15 * 60_000;
/** n번째 연속 실패 뒤 다시 묻기까지 — 45초 → 90초 → 3분 → 6분 → 12분 → 15분(상한) */
export function extrasBackoffMs(failures: number): number {
  return Math.min(EXTRAS_RETRY_MAX_MS, EXTRAS_RETRY_MS * 2 ** Math.max(0, failures - 1));
}
const EXTRAS_TIMEOUT_MS = 7_000;
const LEVEL_CACHE_MAX = 300;

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

/** 레벨 필드(묶음 응답의 realtime) — 가격은 읽지 않는다(가격은 공용 실시간 가격) */
type LevelFields = Pick<BatchRealtime,
  'maxPain' | 'callWall' | 'putFloor' | 'gammaFlipLevel' | 'levelsChainDate' | 'levelsSource' | 'levelsExpiration' | 'levelsDropped' | 'hasLevelsMeta'>;

function parseLevels(rt: any): LevelFields {
  return {
    maxPain: num(rt.maxPain), callWall: num(rt.callWall), putFloor: num(rt.putFloor), gammaFlipLevel: num(rt.gammaFlipLevel),
    levelsChainDate: typeof rt.levelsChainDate === 'string' ? rt.levelsChainDate : null,
    levelsSource: typeof rt.levelsSource === 'string' ? rt.levelsSource : null,
    levelsExpiration: typeof rt.levelsExpiration === 'string' ? rt.levelsExpiration : null,
    levelsDropped: Array.isArray(rt.levelsDropped) ? rt.levelsDropped.filter((x: unknown): x is string => typeof x === 'string') : null,
    hasLevelsMeta: Object.prototype.hasOwnProperty.call(rt, 'levelsSource'),
  };
}

/**
 * 레벨 묶음(30개)마다 한 요청. ok = 모든 묶음을 받았다 · asked = 성공한 묶음이 물은 종목(행이 없으면 «레벨 없음»으로 정해진다).
 */
async function fetchLevels(tickers: string[]): Promise<{ data: Record<string, LevelFields>; asked: string[]; ok: boolean; any: boolean }> {
  const out: Record<string, LevelFields> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < tickers.length; i += BATCH_MAX) chunks.push(tickers.slice(i, i + BATCH_MAX));
  const res = await Promise.all(chunks.map((c) =>
    fetchJson(`/api/watchlist/batch?mode=price&tickers=${encodeURIComponent(c.join(','))}`, LEVELS_TIMEOUT_MS).catch(() => null)));
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
      out[t] = parseLevels(rt);
    }
  });
  return { data: out, asked, ok: okChunks === chunks.length, any: okChunks > 0 };
}

async function fetchEarnings(locale: string): Promise<Record<string, EarningsInfo>> {
  const j = await fetchJson('/api/market/earnings-calendar', EXTRAS_TIMEOUT_MS);
  const rows: any[] = Array.isArray(j?.rows) ? j.rows : [];
  // 이 라우트는 오류도 200 {ok:true, rows:[], reason} 으로 알린다 — «실적 없음»으로 굳히지 않는다(부가 사실 실패와 같은 종류).
  //   'no-key'(서버 설정 없음)는 다시 물어도 같으므로 «없음»으로 둔다.
  if (!j || !Array.isArray(j.rows) || (!rows.length && j.reason && j.reason !== 'no-key')) throw new Error(`earnings-unavailable:${j?.reason ?? ''}`);
  // 종목별 «다음 실적» = 공용 규칙(pickNextEarnings — Command·Intel·웹 티커와 같은 함수). 예전엔 «가장 이른 행»을 골라
  //   캐시(6시간)에 남은 어제(ET) 행이 다음 분기 행을 가렸다 — 오늘(ET) 이후에서 고른다.
  const byTicker = new Map<string, any[]>();
  for (const r of rows) {
    const t = String(r?.ticker || '').toUpperCase();
    if (!t) continue;
    const list = byTicker.get(t);
    if (list) list.push(r); else byTicker.set(t, [r]);
  }
  const todayET = etDateOf(Date.now());
  const out: Record<string, EarningsInfo> = {};
  for (const [t, list] of byTicker) {
    const briefRow = list.find((r) => r?.brief);
    const brief = briefRow?.brief?.[locale] || briefRow?.brief?.en;
    const name = typeof brief?.name === 'string' ? brief.name : null;
    const next = pickNextEarnings({ fmp: list }, todayET);
    if (next) { out[t] = { date: next.date, hour: next.hour, name }; continue; }
    // 다가오는 실적이 없다(캐시에 남은 지난 행뿐) — 칩은 서지 않지만(earningsPending 이 지난 날짜를 거른다) 이름 공급원(A14)은 남긴다
    const last = list.map((r) => String(r?.date || '').slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop();
    if (last && name) out[t] = { date: last, hour: '', name };
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
// 공용 캐시 — 목록·빈 상태 미리보기가 같이 읽는다(레벨·부가 사실). 바뀌면 version 을 올려 구독자 전부 다시 그린다.
// 가격은 여기 없다 — 공용 실시간 가격(useLiveQuotes)이 준다.
// ─────────────────────────────────────────────────────────────────────────────
type LevelEntry = { at: number; lv: LevelFields | null };   // lv null = 물었는데 그 종목 레벨 행이 없었다(«없음»으로 정해짐)
const levelCache = new Map<string, LevelEntry>();
/** 이 세션에서 끝난 마지막 레벨 요청(키 = 정렬된 티커 목록) */
const levelStatus = new Map<string, { at: number; ok: boolean }>();
const levelInflight = new Map<string, Promise<void>>();

let earningsMem: { at: number; locale: string; data: Record<string, EarningsInfo> } | null = null;
let whaleMem: { at: number; data: Record<string, WhaleInfo> } | null = null;
const dpMem = new Map<string, { at: number; data: Record<string, DarkPoolInfo> }>();
let earningsInflight: Promise<void> | null = null;
let whalesInflight: Promise<void> | null = null;
const dpInflight = new Map<string, Promise<void>>();
/**
 * 부가 사실 실패 — 마지막 실패 시각 · 연속 실패 수(null = 실패 아님). 실패도 «정해짐»(칩 없이 그린다)이고,
 * extrasBackoffMs(n) 뒤에만 다시 묻는다 — 그 전의 화면 복귀는 건너뛴다(E1).
 */
type FailState = { at: number; n: number };
let earningsFail: FailState | null = null;
let whalesFail: FailState | null = null;
const dpFail = new Map<string, FailState>();
const retryAtOf = (f: FailState | null | undefined): number => (f ? f.at + extrasBackoffMs(f.n) : 0);
const nextFail = (f: FailState | null | undefined): FailState => ({ at: Date.now(), n: (f?.n ?? 0) + 1 });

let version = 1;
const subs = new Set<() => void>();

function bump() {
  version += 1;
  subs.forEach((l) => { try { l(); } catch { /* noop */ } });
}

function subscribeCache(l: () => void) {
  subs.add(l);
  return () => { subs.delete(l); };
}
const getCacheVersion = () => version;
const getServerVersion = () => 0;

/**
 * 옵션 레벨을 묻는다 — 같은 목록이면 요청 하나(진행 중이면 합류) · 받은 지 LEVELS_TTL_MS(15분) 안의 종목은 다시 묻지 않는다.
 * force = «다시 시도» 버튼(그 목록 전부 다시).
 */
function loadLevels(key: string, force = false): Promise<void> {
  const tickers = key.split(',');
  const running = levelInflight.get(key);
  if (running) return running;
  const now = Date.now();
  const due = tickers.filter((t) => { const e = levelCache.get(t); return force || !e || now - e.at >= LEVELS_TTL_MS; });
  if (!due.length) {
    const st = levelStatus.get(key);
    if (!st || !st.ok) { levelStatus.set(key, { at: now, ok: true }); bump(); }
    return Promise.resolve();
  }
  const p = fetchLevels(due)
    .then(({ data, asked, ok }) => {
      const at = Date.now();
      for (const t of asked) {
        levelCache.delete(t);                    // 삽입 순서 = 최근 순(넘치면 오래된 것부터 버린다)
        levelCache.set(t, { at, lv: data[t] ?? null });
      }
      while (levelCache.size > LEVEL_CACHE_MAX) levelCache.delete(levelCache.keys().next().value as string);
      levelStatus.set(key, { at, ok });
    })
    .catch(() => { levelStatus.set(key, { at: Date.now(), ok: false }); })
    .finally(() => { levelInflight.delete(key); bump(); });
  levelInflight.set(key, p);
  return p;
}

/**
 * 부가 사실(실적·고래·장외)을 필요하면 묻는다 — 화면 진입·복귀·다시 묻기 타이머가 같이 부른다.
 * 실패한 것은 백오프(retryAt)가 지나기 전엔 부르지 않는다: 예전엔 tick 마다 다시 불러 보는 사람 1명당 실적 캘린더(FMP 14일 창 9콜)
 * ≈18콜/분이 나갔고, 그 429 가 다시 빈 응답이 되는 되먹임이었다(E1).
 */
function loadExtras(key: string, locale: string) {
  const now = Date.now();
  if (!earningsInflight && now >= retryAtOf(earningsFail)
    && (!earningsMem || earningsMem.locale !== locale || now - earningsMem.at > EARNINGS_TTL)) {
    earningsInflight = fetchEarnings(locale)
      .then((d) => { earningsMem = { at: Date.now(), locale, data: d }; earningsFail = null; })
      .catch(() => { earningsFail = nextFail(earningsFail); })   // 없으면 실적 칩이 안 선다 — 백오프 뒤 다시
      .finally(() => { earningsInflight = null; bump(); });
  }
  if (!whalesInflight && now >= retryAtOf(whalesFail) && (!whaleMem || now - whaleMem.at > EXTRAS_TTL)) {
    whalesInflight = fetchWhales()
      .then((d) => { whaleMem = { at: Date.now(), data: d.byTicker }; whalesFail = null; })
      .catch(() => { whalesFail = nextFail(whalesFail); })       // 없으면 고래 칩이 안 선다 — 백오프 뒤 다시
      .finally(() => { whalesInflight = null; bump(); });
  }
  const hit = dpMem.get(key);
  if (!dpInflight.has(key) && now >= retryAtOf(dpFail.get(key)) && (!hit || now - hit.at > EXTRAS_TTL)) {
    dpInflight.set(key, fetchDarkPool(key.split(','))
      .then((d) => {
        dpMem.set(key, { at: Date.now(), data: d });
        if (dpMem.size > 12) dpMem.delete(dpMem.keys().next().value as string);
        dpFail.delete(key);
      })
      .catch(() => { dpFail.set(key, nextFail(dpFail.get(key))); })   // 없으면 장외 칩이 안 선다 — 백오프 뒤 다시
      .finally(() => { dpInflight.delete(key); bump(); }));
  }
}

/** 실패한 부가 사실을 다시 물을 시각(ms) — 실패한 것이 없거나 이미 다시 묻는 중이면 null */
function extrasRetryAt(key: string): number | null {
  let at = Infinity;
  if (earningsFail && !earningsInflight) at = Math.min(at, retryAtOf(earningsFail));
  if (whalesFail && !whalesInflight) at = Math.min(at, retryAtOf(whalesFail));
  const dp = dpFail.get(key);
  if (dp && !dpInflight.has(key)) at = Math.min(at, retryAtOf(dp));
  return Number.isFinite(at) ? at : null;
}

/**
 * 종목 이름 — 목록·편집 목록·대시보드·시트가 «같은 공급원»을 쓴다.
 *   이름표(tickerNames) → 이 기기가 받은 실적 브리프 이름(그 언어) → 빈 문자열.
 *   (예전엔 목록만 브리프 이름을 썼고 편집 목록·대시보드는 같은 종목 이름이 비어 있었다.)
 *   이 캐시를 구독한 화면(useWatchlistData)은 실적이 도착하면 다시 그리므로 이름도 따라 바뀐다.
 */
export function wlTickerName(t: string, loc: WlLocale): string {
  const T = (t || '').toUpperCase();
  const m = earningsMem && earningsMem.locale === loc ? earningsMem.data : null;
  return tickerName(T, loc, m?.[T]?.name ?? null);
}

// ── 분 단위 «지금» — 날짜 라벨 판정용(렌더에서 Date.now() 를 부르지 않는다) ──
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
  /** 행 값 — 가격(공용 실시간) + 레벨(목록 화면) · 가격을 받은 시각 receivedAt */
  rows: Record<string, BatchRealtime>;
  earnings: Record<string, EarningsInfo>;
  darkPool: Record<string, DarkPoolInfo>;
  whales: Record<string, WhaleInfo>;
  /** 가격이 아직 한 번도 안 왔다 — 값이 없는 행은 뼈대로 그린다 */
  pending: boolean;
  /** 값이 하나도 없고 아직 기다리는 중 */
  loading: boolean;
  /** 값이 하나도 없고 마지막 요청이 실패했다 */
  error: boolean;
  /** 마지막 «가격» 시세 요청이 실패했다(한 묶음이라도) — 값은 남아 있을 수 있다. 레벨 실패는 여기 넣지 않는다(levelsFailed — 가격 표시와 분리) */
  failed: boolean;
  /** 마지막 옵션 레벨 요청이 실패했다(한 묶음이라도) — 지도만의 일이다. «가격을 불러오지 못했습니다»를 띄우지 않는다 */
  levelsFailed: boolean;
  /** 목록이 오래됐다 — 시세 요청이 실패 중이고 가격 허브도 끊겼다(보이는 값이 멈춘 값일 수 있다). 새 값이 올 때까지 흐리게 */
  stale: boolean;
  /** 이 행만 흐리게 — 지금은 목록 흐림과 같다(행 사본·붙든 값이 없다) */
  isRowStale: (t: string) => boolean;
  /** 정규장이다 — LIVE 표시(대시보드 «지수 LIVE»와 같은 방식: 서버 시장 상태의 세션이 정규장 · 휴장이면 서버가 closed) */
  live: boolean;
  /** 실적·장외·고래·레벨(부가 사실)이 이 목록 전체에 대해 한 번은 정해졌다 */
  extrasSettled: boolean;
  /** 이 종목의 부가 사실(레벨 포함)이 정해졌나 — 행마다 판정(종목 하나를 더 담아도 다른 행의 칩은 그대로 둔다) */
  extrasReadyFor: (t: string) => boolean;
  /** 이 종목의 옵션 레벨이 정해졌나 — 지도 뼈대(레벨이 가격보다 늦게 와도 «레벨 갱신 대기»로 깜빡이지 않게) */
  levelsReadyFor: (t: string) => boolean;
  refresh: () => void;
}

interface Derived {
  levels: Record<string, LevelFields | null>;
  earnings: Record<string, EarningsInfo>;
  darkPool: Record<string, DarkPoolInfo>;
  whales: Record<string, WhaleInfo>;
  levelStatus: { at: number; ok: boolean } | null;
  extrasSettled: boolean;
  extrasReadyFor: (t: string) => boolean;
  levelsReadyFor: (t: string) => boolean;
  /** 실패한 부가 사실을 다시 물을 시각(없으면 null) */
  retryAt: number | null;
}

const EMPTY_EARN: Record<string, EarningsInfo> = {};
const EMPTY_DP: Record<string, DarkPoolInfo> = {};
const EMPTY_WHALE: Record<string, WhaleInfo> = {};
const never = () => false;
const always = () => true;
const EMPTY_DERIVED: Derived = {
  levels: {}, earnings: EMPTY_EARN, darkPool: EMPTY_DP, whales: EMPTY_WHALE,
  levelStatus: null, extrasSettled: false, extrasReadyFor: never, levelsReadyFor: never, retryAt: null,
};

function derive(key: string, locale: string, extras: boolean, v: number): Derived {
  if (!key || v === 0 || !extras) return EMPTY_DERIVED;
  const tickers = key.split(',');
  const levels: Record<string, LevelFields | null> = {};
  for (const t of tickers) { const e = levelCache.get(t); if (e) levels[t] = e.lv; }
  const lvStatus = levelStatus.get(key) ?? null;
  // 레벨이 «정해졌다» = 그 종목 레벨을 받았거나(없음 포함) · 이 목록의 레벨 요청이 끝났다(실패 포함 — 뼈대가 영원히 남지 않게)
  const levelsReadyFor = lvStatus ? always : (t: string) => levelCache.has(t);
  const earnings = earningsMem && earningsMem.locale === locale ? earningsMem.data : EMPTY_EARN;
  const whales = whaleMem ? whaleMem.data : EMPTY_WHALE;
  // 장외 비중은 «목록» 단위로 받는다 — 종목을 하나 더 담으면 새 목록 키가 된다.
  //   지난 목록에서 받은 값도 종목별로 이어 쓰고(최근 요청이 이긴다 · 그 요청에 없던 종목은 «없음»),
  //   «이 종목을 물어본 적이 있나(covered)»로 행마다 정해짐을 판정한다.
  const want = new Set(tickers);
  const darkPool: Record<string, DarkPoolInfo> = {};
  const covered = new Set<string>();
  for (const [k, entry] of dpMem) {
    for (const t of k.split(',')) {
      if (!want.has(t)) continue;
      covered.add(t);
      delete darkPool[t];
      if (entry.data[t]) darkPool[t] = entry.data[t];
    }
  }
  for (const k of dpFail.keys()) for (const t of k.split(',')) if (want.has(t)) covered.add(t);
  const earnDone = (!!earningsMem && earningsMem.locale === locale) || !!earningsFail;
  const whaleDone = !!whaleMem || !!whalesFail;
  const base = earnDone && whaleDone;
  const extrasReadyFor = !base ? never
    : (t: string) => covered.has(t) && levelsReadyFor(t);
  return {
    levels, earnings, darkPool, whales, levelStatus: lvStatus,
    extrasSettled: base && tickers.every((t) => covered.has(t) && levelsReadyFor(t)),
    extrasReadyFor,
    levelsReadyFor,
    retryAt: extrasRetryAt(key),
  };
}

/**
 * 화면 상태 플래그 — 가격(공용 시세)과 레벨(묶음)을 가른다: 레벨 묶음이 실패해도 가격 표시·«실패» 띠는 가격만 본다.
 *   pending  값도 응답도 없는 종목이 있다(그 행만 뼈대) · loading 값이 하나도 없고 기다리는 중 · error 값이 하나도 없고 실패
 *   stale    시세가 실패 중이고 가격 허브도 끊겼다(보이는 값이 멈춘 값일 수 있다)
 */
export function watchlistFlags(i: {
  key: string; have: number; livePending: boolean; liveFailed: boolean; liveConnected: boolean;
  levelStatus: { ok: boolean } | null; extras: boolean;
}) {
  return {
    pending: !!i.key && i.livePending,
    loading: !!i.key && i.have === 0 && i.livePending,
    error: !!i.key && i.have === 0 && !i.livePending && i.liveFailed,
    failed: i.liveFailed,
    levelsFailed: i.extras && !!i.levelStatus && !i.levelStatus.ok,
    stale: i.have > 0 && i.liveFailed && !i.liveConnected,
  };
}

/** 가격(공용 실시간) + 레벨 → 행. 가격이 아직 없고 그 종목 시세 응답도 안 왔으면 행을 만들지 않는다 — 뼈대로 기다린다 */
export function mergeRow(q: LiveDisplay | undefined, lv: LevelFields | null | undefined, settled: boolean): BatchRealtime | undefined {
  if (!q && !settled) return undefined;
  return {
    ...(lv ?? {}),
    price: q?.price ?? null,
    changePct: q?.changePct ?? null,
    session: q?.session ?? null,
    ext: q?.ext ?? false,
    live: q?.live ?? false,
    receivedAt: q?.at,
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
  const [tick, setTick] = useState(0);
  // 가격·등락·시간외 — 공용 실시간 가격(대시보드 «지수 LIVE»와 같은 연결·같은 시세 요청)
  const live = useLiveQuotes(tickers);
  const liveRefresh = live.refresh;
  const refresh = useCallback(() => { setTick((x) => x + 1); liveRefresh(); }, [liveRefresh]);

  // 옵션 레벨·부가 사실(실적·장외·고래) — 목록 화면에서만 · 진입·복귀·15분마다(레벨은 EOD 판본)
  const forcedTick = useRef(0);
  useEffect(() => {
    if (!extras || !key) return;
    const force = tick !== forcedTick.current;          // «다시 시도» — 그 목록 레벨 전부 다시
    forcedTick.current = tick;
    void loadLevels(key, force);
    loadExtras(key, locale);
  }, [extras, key, tick, locale]);
  useEffect(() => {
    if (!extras || !key) return;
    const again = () => { if (document.visibilityState === 'visible') { void loadLevels(key); loadExtras(key, locale); } };
    const id = setInterval(again, LEVELS_TTL_MS);
    document.addEventListener('visibilitychange', again);
    document.addEventListener('app:resume', again);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', again);
      document.removeEventListener('app:resume', again);
    };
  }, [extras, key, locale]);

  const d = useMemo(() => derive(key, locale, extras, v), [key, locale, extras, v]);
  const retryAt = d.retryAt;

  // 부가 사실이 실패했으면 백오프(45초 → … 15분) 뒤 «그것만» 다시 묻는다
  useEffect(() => {
    if (!extras || !key || retryAt == null) return;
    const id = setTimeout(() => {
      if (document.visibilityState === 'visible') loadExtras(key, locale);
    }, Math.max(1_000, retryAt - Date.now()));
    return () => clearTimeout(id);
  }, [extras, key, locale, retryAt]);

  const settled = live.settled;
  const rows = useMemo(() => {
    const out: Record<string, BatchRealtime> = {};
    if (!key || v === 0) return out;
    for (const t of key.split(',')) {
      const row = mergeRow(live.quotes[t], d.levels[t], settled(t));
      if (row) out[t] = row;
    }
    return out;
  }, [key, v, live.quotes, d.levels, settled]);

  const have = Object.values(rows).filter((r) => r.price != null).length;
  const f = watchlistFlags({
    key, have, livePending: live.pending, liveFailed: live.failed, liveConnected: live.connected, levelStatus: d.levelStatus, extras,
  });
  const stale = f.stale;
  const isRowStale = useCallback(() => stale, [stale]);
  return {
    rows,
    earnings: d.earnings,
    darkPool: d.darkPool,
    whales: d.whales,
    pending: f.pending,
    loading: f.loading,
    error: f.error,
    failed: f.failed,
    levelsFailed: f.levelsFailed,
    stale,
    isRowStale,
    live: live.session === 'reg',
    extrasSettled: !extras || d.extrasSettled,
    extrasReadyFor: extras ? d.extrasReadyFor : always,
    levelsReadyFor: extras ? d.levelsReadyFor : always,
    refresh,
  };
}

/** 테스트용 — 모듈 캐시 초기화 · 안쪽 함수(요청 합류·레벨 간격·부가 사실) */
export function _resetWatchlistDataForTest() {
  levelCache.clear(); levelStatus.clear(); levelInflight.clear();
  earningsMem = null; whaleMem = null; dpMem.clear(); dpInflight.clear();
  earningsInflight = null; whalesInflight = null; earningsFail = null; whalesFail = null; dpFail.clear();
  version = 1;
}
export const _wlDataTest = {
  loadLevels,
  loadExtras,
  derive: (key: string, locale = 'en', extras = true) => derive(key, locale, extras, version),
  extrasRetryAt,
};
