'use client';

// ============================================================================
// «내 종목» 행 데이터 — 이미 계산 중인 값만 쓴다(새 벤더·새 비용 없음, 기획서 1-3)
//   가격·레벨·내재 변동   /api/watchlist/batch?mode=price   (보이는 목록 하나 = 요청 하나, 30개씩 나눔 — BATCH_MAX 주석)
//   실적 날짜·발표 시각    /api/market/earnings-calendar      (시장 전체 1콜, 서버 6시간 캐시)
//   장외 비중(FINRA)       /api/flow/dark-pool?t=A,B,…        (EOD · 출처 표기 필수)
//   고래 신규 포지션       /api/flow/options-eod?all=1         (전 종목 1콜 · CDN 10분 · 콜/풋 따로)
// 폴링: 화면이 보일 때만 · 정규장(또는 세션을 아직 모름) 30초 · 프리·애프터·장 마감 5분(표시값 = 본장 종가라 안 바뀐다 —
//   프리마켓은 09:30 ET 개장 직후로 당긴다). 세션이 바뀌면 타이머를 다시 건다. 앱 복귀(app:resume)·화면 복귀에 즉시 한 번.
//   정규장 30초에 매번 묻는 것은 목록의 «앞 30종목»(현재 정렬 = 보이는 순서)뿐 — 나머지는 5분마다(E2: 1인 분당 요청 종목 수 상한).
//
// 빠르게 — «다시 그릴 때 기다리지 않는다»:
//   · 캐시는 «종목 하나» 단위다 — 대시보드(앞 3개)에서 받은 값이 목록 화면 첫 그림에 바로 선다.
//     종목을 하나 더 담아도 나머지 행은 그대로 있고 새 행만 뼈대로 기다린다.
//   · 같은 목록 요청이 진행 중이면 새로 보내지 않고 합류한다 · 15초 안에 받은 값이면 다시 묻지 않는다.
//   · 마지막으로 잘 받은 행은 기기(localStorage sg-wl-last-v1 — 가격을 받은 행만 · 최근 100종목)와 sessionStorage 에 둔다
//     — 앱을 새로 켜도(sessionStorage 는 빈다 · 9/29 23:07 실측: 배포 직후 재실행 1분 넘게 «—»)·새로고침·언어 변경 뒤에도
//     첫 그림이 비지 않는다. 복원 규칙은 하나다: 6시간 넘은 값은 버린다(뼈대로 기다린다) · 가격 0 = 못 받음 · 종목마다 더 최근 값.
//     오래된 값(정규장 3분 · 그 밖 20분)은 stale=true 로 알려 화면이 흐리게 그린다(«지금 값»처럼 보이지 않게 — 행마다는 받은 시각 나이, E4).
//     새 값이 오면 바로 바꾼다.
//
// 지어내지 않는다:
//   · 가격 0 이하 = «못 받음» — 0.00% 로 그리지 않고, 마지막 정상값이 있으면 그것을 둔다(그 행만 흐리게 — held).
//   · 200 OK 라도 «오류·미적재»를 알리는 부가 사실 응답은 실패다 — «값 없음»으로 15분 굳히지 않고 다시 묻는다.
//     다시 묻기는 지수 백오프(45초 → 90초 → 3분 → … 상한 15분)이고 폴링 tick 마다 다시 부르지 않는다(E1 — 되먹임 금지).
//   · 여러 묶음 중 하나라도 실패하면 «실패»(다시 시도)로 적는다. 붙든 행 하나가 목록 전체를 흐리거나 «실패»로 만들지 않는다(E4).
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
  /** 가장 최근 요청에서 가격을 못 받아 마지막 정상값을 붙들고 있다(클라이언트가 붙인다) — 이 행만 흐리게(E4) */
  held?: boolean;
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
/**
 * 정규장 30초 폴링에서 매번 묻는 «앞쪽» 종목 수 — 목록의 현재 정렬(보이는 순서) 앞 30종목. 나머지는 COLD_REFRESH_MS 마다(E2).
 * 왜: 묶음(≤30)마다 서버가 종목별 Intrinio 스냅샷(실시간 10초·일봉 120초 캐시)을 부른다 — PRO 100종목 × 30초면 1인 200종목·분,
 *   몇 명만 모여도 벤더 한도(2,000/분)에 닿아 빈 응답 → 전 사용자 가격 0(과거 사고와 같은 종류).
 *   앞 30 × 30초(60/분) + 나머지 70 ÷ 5분(14/분) = 1인 최대 74종목·분(MAX_ITEMS 100 기준 · 시험으로 고정).
 */
export const HOT_MAX = 30;
/** 앞쪽 밖 종목을 다시 묻는 간격 */
export const COLD_REFRESH_MS = 5 * 60_000;
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
/** 이 안에 받은 값이면 화면에 다시 들어와도 묻지 않는다 */
const MIN_REFETCH_MS = 15_000;
/** 폴링 간격 — 정규장(또는 세션 모름) · 프리/애프터/장 마감 */
export const POLL_LIVE_MS = 30_000;
export const POLL_SLOW_MS = 5 * 60_000;
/** 이보다 오래된 값은 «흐리게»(stale) — 정규장은 폴링 30초라 3분이면 여러 번 놓친 것 · 그 밖은 폴링 5분이라 20분 */
const STALE_LIVE_MS = 3 * 60_000;
const STALE_SLOW_MS = 20 * 60_000;
/** 이보다 오래된 값은 아예 그리지 않는다(뼈대로 기다린다) · 못 받은 가격 대신 붙들어 두는 한도 · 저장본 복원 한도(두 저장소 같다) */
const DISPLAY_MAX_AGE = 6 * 3_600_000;
const BATCH_TIMEOUT_MS = 9_000;
const EXTRAS_TIMEOUT_MS = 7_000;
const ROW_CACHE_MAX = 300;
/** v2 — 가격 0 = null(못 받음) · 고래 콜/풋 분리 · 받은 시각. 모양이 바뀌어 옛 v1 은 읽지 않고 지운다 */
const PERSIST_KEY = 'sg-wl-cache-v2';
const PERSIST_KEY_OLD = 'sg-wl-cache-v1';
const PERSIST_V = 2;
const PERSIST_ROWS_MAX = 80;
/**
 * 기기(localStorage)의 «마지막 정상 행» — sessionStorage 는 앱을 새로 켜면 비어 첫 그림에 보여 줄 값이 없었다.
 * 가격을 받은 행만 · 받은 시각 순 최근 100종목(MAX_ITEMS) · 6시간 넘은 것은 저장할 때 정리한다. 행 모양은 sessionStorage 와 같다.
 * 설정 «캐시 지우기»가 지워도 되는 캐시다(WATCHLIST_PERSIST_KEYS 에 넣지 않는다).
 */
const LAST_KEY = 'sg-wl-last-v1';
const LAST_V = 1;
const LAST_ROWS_MAX = 100;
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

/**
 * 이 행만 오래됐나(E4) — 가격을 못 받아 옛 값을 붙들었거나(held), 5분 주기 종목(E2)의 주기보다도 흐림 기준만큼 더 오래됐다.
 * 목록 전체의 흐림(stale)은 «가장 최근에 받은 행» 기준이라, 붙든 행 하나가 목록 전체를 흐리지 않는다.
 */
export function rowIsStale(rt: BatchRealtime | undefined, session: string | null | undefined, nowMs: number): boolean {
  if (!rt || !nowMs) return false;
  if (rt.held) return true;
  return rt.receivedAt != null && nowMs - rt.receivedAt > staleAfterMs(session) + COLD_REFRESH_MS;
}

/**
 * 정규장 폴링에서 매번 물을 «앞쪽» 종목(E2) — 우선순위(목록의 현재 정렬 = 보이는 순서)의 앞 HOT_MAX.
 * 우선순위에 없는 종목(방금 담음 등)은 주어진 순서로 뒤에 잇는다. HOT_MAX 이하 목록은 전부 앞쪽(null).
 */
export function hotSetOf(tickers: readonly string[], priority?: readonly string[] | null): Set<string> | null {
  const uniq = [...new Set(tickers)];
  if (uniq.length <= HOT_MAX) return null;
  const inList = new Set(uniq);
  const hot = new Set<string>();
  for (const t of [...(priority ?? []).filter((x) => inList.has(x)), ...uniq]) {
    if (hot.size >= HOT_MAX) break;
    hot.add(t);
  }
  return hot;
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
type RowEntry = { at: number; rt: BatchRealtime };  // rt.held — 옛 값을 붙든 행(holdRow)
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
/**
 * 부가 사실 실패 — 마지막 실패 시각 · 연속 실패 수(null = 실패 아님). 실패도 «정해짐»(칩 없이 그린다)이고,
 * extrasBackoffMs(n) 뒤에만 다시 묻는다 — 그 전의 폴링 tick·화면 복귀는 건너뛴다(E1).
 */
type FailState = { at: number; n: number };
let earningsFail: FailState | null = null;
let whalesFail: FailState | null = null;
const dpFail = new Map<string, FailState>();
const retryAtOf = (f: FailState | null | undefined): number => (f ? f.at + extrasBackoffMs(f.n) : 0);
const nextFail = (f: FailState | null | undefined): FailState => ({ at: Date.now(), n: (f?.n ?? 0) + 1 });

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

/**
 * 저장본 한 행 [종목, 받은 시각, 값] → 캐시 항목(두 저장소 같은 규칙). 6시간 넘었거나(뼈대로 기다린다) 모양이 틀리면 null.
 * 값은 네트워크 응답과 같은 검사를 다시 거친다(parseRealtime — 가격 0 = 못 받음 → null) — 저장본이 깨져 숫자 자리에 글자가
 * 들어 있어도 화면이 죽지 않게. 출처 메타 여부(hasLevelsMeta)·붙듦(held)은 저장된 값 그대로다(다시 계산하면 72 이전 모양이 «메타 있음»이 된다).
 */
function restoreRow(r: unknown, now: number): [string, RowEntry] | null {
  if (!Array.isArray(r) || r.length !== 3) return null;
  const [t, at, rt] = r;
  if (typeof t !== 'string' || !t || typeof at !== 'number' || !rt || typeof rt !== 'object') return null;
  if (now - at > DISPLAY_MAX_AGE || at > now + 60_000) return null;
  const src = rt as Record<string, unknown>;
  const row: BatchRealtime = { ...parseRealtime(src), hasLevelsMeta: src.hasLevelsMeta === true, receivedAt: at };
  if (src.held === true) row.held = true;
  return [t, { at, rt: row }];
}

/** 기기 저장본의 행 — 가격을 받은 행만(«마지막 정상 행»). 막혔거나 깨졌으면 빈 목록 */
function readLastGood(now: number): [string, RowEntry][] {
  const out: [string, RowEntry][] = [];
  try {
    const j = JSON.parse(window.localStorage.getItem(LAST_KEY) || 'null');
    if (!j || j.v !== LAST_V || !Array.isArray(j.rows)) return out;
    for (const r of j.rows) {
      const e = restoreRow(r, now);
      if (e && e[1].rt.price != null) out.push(e);
    }
  } catch { /* 사생활 모드·막힘·깨진 값 — 없는 것으로 */ }
  return out;
}

function hydrateOnce() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  const now = Date.now();
  // 종목마다 더 최근에 받은 값 하나 — 기기 저장본(앱을 새로 켜도 남는다) 위에 이 탭의 사본(sessionStorage)을 얹는다(같은 시각이면 탭 사본)
  const restored = new Map<string, RowEntry>(readLastGood(now));
  try { window.sessionStorage.removeItem(PERSIST_KEY_OLD); } catch { /* 사생활 모드 */ }
  try {
    const raw = window.sessionStorage.getItem(PERSIST_KEY);
    const j = raw ? JSON.parse(raw) : null;
    if (j && j.v === PERSIST_V) {
      if (Array.isArray(j.rows)) {
        for (const r of j.rows) {
          const e = restoreRow(r, now);
          if (!e) continue;
          const prev = restored.get(e[0]);
          if (!prev || prev.at <= e[1].at) restored.set(e[0], e[1]);
        }
      }
      if (j.earn && typeof j.earn.locale === 'string' && j.earn.m && typeof j.earn.m === 'object') pEarn = { locale: j.earn.locale, m: j.earn.m };
      if (j.whale && typeof j.whale === 'object') pWhale = j.whale;
      if (j.dp && Array.isArray(j.dp.checked) && j.dp.m && typeof j.dp.m === 'object') pDp = { checked: new Set(j.dp.checked), m: j.dp.m };
    }
  } catch { /* 사생활 모드·깨진 값 — 기기 저장본·메모리만 쓴다 */ }
  // 받은 시각 순으로 넣는다(rowCache 삽입 순서 = 최근 순 — 넘치면 오래된 것부터 버린다)
  for (const [t, e] of [...restored].sort((a, b) => a[1].at - b[1].at)) rowCache.set(t, e);
}

function pick<T>(m: Record<string, T> | null | undefined, keys: Set<string>): Record<string, T> {
  const out: Record<string, T> = {};
  if (!m) return out;
  for (const k of keys) if (m[k] !== undefined) out[k] = m[k];
  return out;
}

/**
 * 기기(localStorage)에 «마지막 정상 행» — 가격을 받은 행만 · 6시간 안 · 받은 시각 순 최근 100종목. 이미 있던 저장본(다른 탭이 쓴 값)과
 * 종목마다 더 최근 것으로 합친다(같은 시각이면 메모리 — 붙듦 표시가 새것). 막힘·용량 초과·깨진 저장본은 조용히 넘긴다.
 */
function persistLastGood(byRecent: readonly [string, RowEntry][]) {
  try {
    const now = Date.now();
    const merged = new Map<string, RowEntry>(readLastGood(now));
    for (const [t, e] of byRecent) {
      if (e.rt.price == null || now - e.at > DISPLAY_MAX_AGE) continue;
      const prev = merged.get(t);
      if (!prev || prev.at <= e.at) merged.set(t, e);
    }
    const rows = [...merged]
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, LAST_ROWS_MAX)
      .map(([t, e]) => [t, e.at, e.rt] as const);
    window.localStorage.setItem(LAST_KEY, JSON.stringify({ v: LAST_V, rows }));
  } catch { /* 막힘·용량 — 메모리·sessionStorage 만 쓴다 */ }
}

function persistNow() {
  if (typeof window === 'undefined') return;
  const byRecent = [...rowCache.entries()].sort((a, b) => b[1].at - a[1].at);
  persistLastGood(byRecent);
  try {
    const rows = byRecent
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

/** 옛 값을 붙든 행 — 받은 시각은 그대로(흐림 판정) · held 표시(이 행만 흐리게) */
function holdRow(t: string, prev: RowEntry) {
  if (!prev.rt.held) rowCache.set(t, { at: prev.at, rt: { ...prev.rt, held: true } });
}

/**
 * 같은 목록이면 요청 하나 — 진행 중이면 합류한다. 물을 종목은 «받은 지 오래된 것»만:
 *   앞쪽(hot — 목록의 현재 정렬 앞 HOT_MAX)은 15초, 나머지는 COLD_REFRESH_MS(5분)가 지나야 다시 묻는다(E2).
 *   hot 을 안 주면(대시보드 3줄·미리보기) 전부 앞쪽이다.
 */
function loadBatch(key: string, hot?: ReadonlySet<string> | null): Promise<void> {
  const tickers = key.split(',');
  for (const t of tickers) interest.add(t);
  const running = batchInflight.get(key);
  if (running) return running;
  const now = Date.now();
  const due = tickers.filter((t) => {
    const e = rowCache.get(t);
    return !e || now - e.at >= (!hot || hot.has(t) ? MIN_REFETCH_MS : COLD_REFRESH_MS);
  });
  if (!due.length) {
    const st = keyStatus.get(key);
    if (!st || !st.ok) { keyStatus.set(key, { at: now, ok: true }); bump(); }
    return Promise.resolve();
  }
  const p = fetchBatch(due)
    .then(({ data, partial, asked }) => {
      const at = Date.now();
      for (const [t, rt] of Object.entries(data)) {
        const prev = rowCache.get(t);
        // 가격을 못 받았는데 마지막 정상값이 있으면 그것을 둔다 — 받은 시각도 그대로, 그 행만 흐리게(held).
        //   목록 전체를 «실패»·흐림으로 만들지 않는다(E4 — 가격 0 종목 하나가 목록 전체를 흐리게 했다). 6시간 넘은 값은 붙들지 않는다.
        if (rt.price == null && prev?.rt.price != null && at - prev.at < DISPLAY_MAX_AGE) { holdRow(t, prev); continue; }
        rowCache.delete(t);                       // 삽입 순서 = 최근 순(넘치면 오래된 것부터 버린다)
        rowCache.set(t, { at, rt: { ...rt, receivedAt: at } });
      }
      // 물었는데 행이 아예 안 온 종목(서버가 그 종목만 오류)도 «못 받음» — 같은 규칙: 6시간 안의 옛 값은 붙든다(held)
      for (const t of asked) {
        if (data[t]) continue;
        const prev = rowCache.get(t);
        if (!prev) continue;
        if (at - prev.at < DISPLAY_MAX_AGE) holdRow(t, prev); else rowCache.delete(t);
      }
      while (rowCache.size > ROW_CACHE_MAX) rowCache.delete(rowCache.keys().next().value as string);
      // «실패»는 이번 요청의 묶음 실패만(행 하나를 붙든 것은 그 행의 흐림으로 보인다 — E4)
      keyStatus.set(key, { at, ok: !partial });
    })
    .catch(() => { keyStatus.set(key, { at: Date.now(), ok: false }); })
    .finally(() => { batchInflight.delete(key); bump(); });
  batchInflight.set(key, p);
  return p;
}

/**
 * 부가 사실(실적·고래·장외)을 필요하면 묻는다 — 폴링 tick·화면 복귀·다시 묻기 타이머가 같이 부른다.
 * 실패한 것은 백오프(retryAt)가 지나기 전엔 부르지 않는다: 예전엔 tick 마다 다시 불러 보는 사람 1명당 실적 캘린더(FMP 14일 창 9콜)
 * ≈18콜/분이 나갔고, 그 429 가 다시 빈 응답이 되는 되먹임이었다(E1).
 */
function loadExtras(key: string, locale: string) {
  for (const t of key.split(',')) interest.add(t);     // 부가 사실(이름 포함)을 sessionStorage 에 남길 범위
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
  /** 마지막 요청이 실패했다(한 묶음이라도) — 값은 남아 있을 수 있다. 옛 값을 붙든 행 하나로는 «실패»가 아니다(E4 — 그 행만 흐리게) */
  failed: boolean;
  /** 목록이 오래됐다 — 가장 최근에 받은 행마저 오래됐다(정규장 3분 · 그 밖 20분 — 요청이 계속 실패 중). 새 값이 올 때까지 흐리게 */
  stale: boolean;
  /** 이 행만 오래됐다 — 가격을 못 받아 옛 값을 붙들었거나(held), 5분 주기 종목(E2)의 주기보다도 오래됐다(E4) */
  isRowStale: (t: string) => boolean;
  /** 실적·장외·고래(부가 사실)가 이 목록 전체에 대해 한 번은 정해졌다 */
  extrasSettled: boolean;
  /** 이 종목의 부가 사실이 정해졌나 — 행마다 판정(종목 하나를 더 담아도 다른 행의 칩은 그대로 둔다) */
  extrasReadyFor: (t: string) => boolean;
  refresh: () => void;
}

/** 우선순위(목록의 현재 정렬) — 렌더가 끝난 뒤 부르는 쪽이 적는 ref. 정규장 30초 폴링의 «앞 30종목»을 정한다(E2) */
export type WatchlistPriority = { readonly current: readonly string[] | null };

interface Derived {
  rows: Record<string, BatchRealtime>;
  earnings: Record<string, EarningsInfo>;
  darkPool: Record<string, DarkPoolInfo>;
  whales: Record<string, WhaleInfo>;
  have: number;
  /** 가장 최근에 받은 행의 받은 시각 — 목록 흐림 기준(E4: 가장 오래된 행 기준이면 붙든 행 하나가 목록 전체를 흐렸다) */
  newest: number;
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
  have: 0, newest: -Infinity, status: null, session: null, extrasSettled: false, extrasReadyFor: never, retryAt: null,
};

function derive(key: string, locale: string, extras: boolean, v: number): Derived {
  if (!key || v === 0) return EMPTY_DERIVED;
  const tickers = key.split(',');
  const rows: Record<string, BatchRealtime> = {};
  let have = 0;
  let newest = -Infinity;
  let session: string | null = null;
  let sessionAt = -Infinity;
  for (const t of tickers) {
    const e = rowCache.get(t);
    if (!e) continue;
    rows[t] = e.rt;
    have += 1;
    if (e.at > newest) newest = e.at;
    // 세션은 «가장 최근에 받은» 행의 것 — 복원된 옛 행(어제 'post')이 오늘 'reg' 를 가리지 않게
    if (e.rt.session && e.at > sessionAt) { sessionAt = e.at; session = e.rt.session; }
  }
  const status = keyStatus.get(key) ?? null;
  if (!extras) return { ...EMPTY_DERIVED, rows, have, newest, status, session };
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
  for (const k of dpFail.keys()) for (const t of k.split(',')) if (want.has(t)) covered.add(t);
  const earnDone = (!!earningsMem && earningsMem.locale === locale) || !!earningsFail || (!!pEarn && pEarn.locale === locale);
  const whaleDone = !!whaleMem || !!whalesFail || !!pWhale;
  const base = earnDone && whaleDone;
  const extrasReadyFor = !base ? never : covered.size >= want.size && tickers.every((t) => covered.has(t)) ? always : (t: string) => covered.has(t);
  return {
    rows, earnings, darkPool, whales, have, newest, status, session,
    extrasSettled: base && tickers.every((t) => covered.has(t)),
    extrasReadyFor,
    retryAt: extrasRetryAt(key),
  };
}

export function useWatchlistData(
  tickers: readonly string[],
  opts: { extras?: boolean; locale?: string; priority?: WatchlistPriority } = {},
): WatchlistData {
  const extras = !!opts.extras;
  const locale = opts.locale || 'en';
  const priority = opts.priority;
  const key = useMemo(() => [...new Set(tickers)].sort().join(','), [tickers]);
  // 서버·하이드레이션 첫 그림은 0(빈 값) → 서버 HTML 과 같다. 그 뒤로는 캐시에서 바로 그린다.
  const v = useSyncExternalStore(subscribeCache, getCacheVersion, getServerVersion);
  const now = useWlNow();
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((x) => x + 1), []);

  // 가격·레벨 — 31종목부터는 앞 30종목(현재 정렬)만 매번, 나머지는 5분마다(E2)
  useEffect(() => {
    if (!key) return;
    void loadBatch(key, hotSetOf(key.split(','), priority?.current));
  }, [key, tick, priority]);

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

  // 부가 사실이 실패했으면 백오프(45초 → … 15분) 뒤 «그것만» 다시 묻는다(가격 폴링과 따로 — 장 밖 5분 폴링을 기다리지 않는다)
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
  const rows = d.rows;
  const isRowStale = useCallback((t: string) => rowIsStale(rows[t], session, now), [rows, session, now]);
  return {
    rows: d.rows,
    earnings: d.earnings,
    darkPool: d.darkPool,
    whales: d.whales,
    pending: !!key && !done,
    loading: !!key && d.have === 0 && !done,
    error: !!key && d.have === 0 && failed,
    failed,
    stale: d.have > 0 && now > 0 && now - d.newest > staleMs,
    isRowStale,
    extrasSettled: !extras || d.extrasSettled,
    extrasReadyFor: extras ? d.extrasReadyFor : always,
    refresh,
  };
}

/** 테스트용 — 모듈 캐시 초기화(= 앱을 새로 켬: 메모리만 비고 저장소는 그대로) · 안쪽 함수(요청 합류·신선도 문·저장·복원) */
export function _resetWatchlistDataForTest() {
  rowCache.clear(); keyStatus.clear(); batchInflight.clear(); interest.clear();
  earningsMem = null; whaleMem = null; dpMem.clear(); dpInflight.clear();
  earningsInflight = null; whalesInflight = null; earningsFail = null; whalesFail = null; dpFail.clear();
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
  LAST_KEY,
  LAST_ROWS_MAX,
};
