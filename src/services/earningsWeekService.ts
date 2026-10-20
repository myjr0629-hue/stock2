// ============================================================================
// 실적 주간(/[locale]/earnings-week) 자료 — «읽기만». 새 계산·새 수집·새 캐시 키 없음 (2026-10-11)
//
// 이 페이지는 기존 «한 문»의 값을 모아 보여 줄 뿐이다:
//   · 일정   = lib/earningsConfirmed.ts CONFIRMED_EARNINGS — 회사가 공지한 것만(근거 URL·원문 문장·확인 시각이 있는 목록).
//              FMP 캘린더(=추정 포함)는 «표에 넣지 않는다». 단, 표에서 빠진 이번 주 예정 종목을 «날짜 확인 전»으로 알리는 데만 쓴다.
//   · 예상 변동 = lib/impliedMove.ts 정의(ATM 스트래들 ÷ 현물) — services/impliedMoveService.readImpliedMoveRows 가
//              GET /api/options/implied-move 와 같은 저장본·같은 규칙으로 읽는다(발표 뒤 첫 만기: amc 는 발표일 «다음», bmo 는 당일부터).
//   · Max Pain·Call Wall·Put Floor = structureService 레벨 판본(structure:v2:{T}) → displayLevels 표시 게이트. 다른 문과 같은 함수·같은 판본.
//
// 사용자 경로: Redis 읽기(mget 두 번)뿐이다 — 벤더 호출 0 · Redis 쓰기 0 · 구조 재계산 0.
//   인스턴스 메모 60초(+ 단일 비행) → 낡아도 30분까지는 «마지막 정상본»을 즉시 주고 갱신은 응답 뒤(background) — 읽기가 실패하면 마지막 정상본 유지.
//   판본이 아예 없는 종목만 응답 뒤 한 번 데워 둔다(warmMissingStructure — 요청당 3·종목당 5분, 인스턴스 간 잠금).
//
// [2026-10-14] 발표가 끝난 행의 «실제 반응 vs 발표 전 옵션 예상» — services/earningsActualsService.readActualRecords 한 번의 mget(읽기뿐).
//   채우는 쪽은 크론(/api/cron/earnings-actuals)이다 — 이 서비스는 여전히 쓰기 0 · 벤더 0.
// ============================================================================

import { CONFIRMED_EARNINGS, type ConfirmedEarnings } from '@/lib/earningsConfirmed';
import { selectWeekEntries, weekRangeET, type WeekRange } from '@/lib/earningsWeek';
import { etDateString } from '@/lib/impliedMove';
import { readImpliedMoveRows, type ImpliedMoveRow, type ImpliedTiming } from '@/services/impliedMoveService';
import { displayLevels, peekStructureLevelsDetailed, warmMissingStructure } from '@/services/structureService';
import { EARNINGS_CALENDAR_CACHE_KEY } from '@/services/earningsCalendarService';
import { getFromCache } from '@/services/redisClient';
import { readActualRecords, recordMapKey } from '@/services/earningsActualsService';
import type { ActualMove, ExpectedSnap } from '@/lib/earnings/earningsActuals';
import type { EarningsMoveMethod } from '@/lib/earnings/eventMove';

export interface EarningsWeekRow {
  method?: EarningsMoveMethod | null;
  ticker: string;
  date: string;
  hour: 'amc' | 'bmo' | '';
  etTime: string | null;
  // 예상 변동(없으면 모두 null + reason)
  impliedMovePct: number | null;
  impliedExpiry: string | null;
  impliedBasis: 'live' | 'eod' | null;
  impliedSession: string | null;
  impliedAsOf: number | null;
  straddle: number | null;
  strike: number | null;
  /** 예상 변동 계산에 쓴 현물(가장 최근 체결가) */
  spot: number | null;
  impliedReason: string | null;
  // 레벨(표시 게이트 통과분 — 없으면 null)
  maxPain: number | null;
  callWall: number | null;
  putFloor: number | null;
  levelsExpiry: string | null;
  levelsChainDate: string | null;
  levelsAsOf: number | null;
  /** 발표 전 마지막 정규장에 화면이 보여 준 예상 변동폭(크론이 저장) — 기록이 없으면 null/없음 */
  expectedAtReport?: ExpectedSnap | null;
  /** 발표 다음 정규장 마감 뒤 계산한 실제 반응(종가 대 종가) — 아직이면 null/없음 */
  actual?: ActualMove | null;
}

export interface EarningsWeekData {
  range: WeekRange;
  rows: EarningsWeekRow[];
  /** 이번 주로 보이지만 회사 공지로 확인되지 않아 표에서 뺀 종목(데이터 제공처 예정일) */
  pending: Array<{ ticker: string; date: string }>;
  /** 회사 공지 목록의 가장 늦은 확인 시각(ISO) */
  listVerifiedAt: string;
  /** 숫자 기준 — 가장 많은 행이 공유한 옵션 세션(ET 날짜)과 그 판본 시각(ms) */
  dataSession: string | null;
  /** 가장 많은 행의 값 기준 — 'live' 장중 실시간 호가 · 'eod' 마감 호가 */
  dataBasis: 'live' | 'eod' | null;
  dataAt: number | null;
  generatedAt: number;
}

const FRESH_MS = 60_000;
const STALE_OK_MS = 30 * 60_000;

type Memo = { at: number; data: EarningsWeekData };
const memo = new Map<string, Memo>();
const inflight = new Map<string, Promise<EarningsWeekData>>();
/** 시험용 */
export function _resetEarningsWeekMemo(): void { memo.clear(); inflight.clear(); }

const timingOf = (c: ConfirmedEarnings): ImpliedTiming => (c.hour === 'bmo' ? 'bmo' : c.hour === 'amc' ? 'amc' : 'unknown');

function mode<T>(xs: Array<T | null | undefined>): T | null {
  const n = new Map<T, number>();
  for (const x of xs) if (x != null) n.set(x, (n.get(x) || 0) + 1);
  let best: T | null = null, bc = 0;
  for (const [k, v] of n) if (v > bc) { best = k; bc = v; }
  return best;
}

/**
 * 이번 주로 보이지만 회사 공지로 확인되지 않은 종목 — 캘린더 «캐시»를 읽기만 한다(없으면 빈 목록).
 *   getMarketEarningsCalendar 를 부르지 않는 이유: 캐시가 비었을 때 FMP 14일 창 9콜을 만들러 가는 경로라, 이 페이지가 벤더를 부를 수 있게 된다.
 *   원천 행(덮기 전)이라 회사 공지 목록의 종목을 빼는 것으로 «확인 전»을 가른다.
 */
async function pendingFromCalendar(range: WeekRange, confirmedTickers: Set<string>): Promise<Array<{ ticker: string; date: string }>> {
  try {
    const p = await getFromCache<{ rows?: Array<{ ticker: string; date: string }> }>(EARNINGS_CALENDAR_CACHE_KEY);
    const seen = new Set<string>();
    const out: Array<{ ticker: string; date: string }> = [];
    for (const x of p?.rows || []) {
      if (!x?.ticker || !x?.date || x.date < range.start || x.date > range.end || confirmedTickers.has(x.ticker)) continue;
      if (seen.has(x.ticker)) continue;
      seen.add(x.ticker);
      out.push({ ticker: x.ticker, date: x.date });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker));
  } catch { return []; }
}

/** 한 주의 자료를 «지금 읽어서» 만든다(캐시 없음) — 시험·getEarningsWeek 가 쓴다. */
export async function buildEarningsWeek(nowMs: number = Date.now(), list: readonly ConfirmedEarnings[] = CONFIRMED_EARNINGS, opts: { readOnly?: boolean } = {}): Promise<EarningsWeekData> {
  const range = weekRangeET(nowMs);
  const entries = selectWeekEntries(list, range.start, range.end);
  const tickers = entries.map((e) => e.ticker);
  const today = etDateString(nowMs);

  const [implied, lv, pending, actuals] = await Promise.all([
    readImpliedMoveRows(entries.map((e) => ({ ticker: e.ticker, after: e.date, timing: timingOf(e) })), today).catch((): ImpliedMoveRow[] => entries.map((e) => ({
      ticker: e.ticker, impliedMovePct: null, expiry: null, asOf: null, basis: null, strike: null, straddle: null, spot: null, source: null, session: null, reason: 'read_failed',
    }))),
    tickers.length ? peekStructureLevelsDetailed(tickers, [], undefined, { refresh: false }).catch(() => null) : Promise.resolve(null),
    pendingFromCalendar(range, new Set(list.map((c) => c.ticker))),
    readActualRecords(entries),   // 던지지 않는다(실패 = 빈 Map)
  ]);
  if (!opts.readOnly && lv?.noSnapshot?.length) void warmMissingStructure(lv.noSnapshot).catch(() => []);

  const rows: EarningsWeekRow[] = entries.map((e, i) => {
    const im = implied[i];
    const sl = lv?.levels.get(e.ticker) ?? null;
    // 만기가 지난 판본은 쓰지 않는다(다른 SEO 문과 같다) · 표시 가격은 넘기지 않는다(재선택 → 갱신 예약을 부르지 않게)
    const dl = sl && sl.levelsExpiration && sl.levelsExpiration >= today ? displayLevels(sl, null, 'web/earnings-week') : null;
    const ar = actuals.get(recordMapKey(e.ticker, e.date));
    return {
      ticker: e.ticker, date: e.date, hour: e.hour, etTime: e.etTime ?? null,
      impliedMovePct: im?.impliedMovePct ?? null,
      method: im?.method ?? null,
      impliedExpiry: im?.expiry ?? null,
      impliedBasis: im?.basis ?? null,
      impliedSession: im?.session ?? null,
      impliedAsOf: im?.asOf ?? null,
      straddle: im?.straddle ?? null,
      strike: im?.strike ?? null,
      spot: im?.spot ?? null,
      impliedReason: im?.reason ?? null,
      maxPain: dl?.maxPain ?? null,
      callWall: dl?.callWall ?? null,
      putFloor: dl?.putFloor ?? null,
      levelsExpiry: dl?.levelsExpiration ?? null,
      levelsChainDate: dl?.levelsChainDate ?? null,
      levelsAsOf: dl && sl?.levelsAsOf ? Number(sl.levelsAsOf) : null,
      expectedAtReport: ar?.expected ?? null,
      actual: ar?.actual ?? null,
    };
  });

  const withNumbers = rows.filter((r) => r.impliedMovePct != null);
  const dataSession = mode(withNumbers.map((r) => r.impliedSession)) ?? mode(rows.map((r) => r.levelsChainDate));
  const at = rows.map((r) => r.levelsAsOf).filter((x): x is number => typeof x === 'number' && x > 0);
  return {
    range, rows, pending,
    listVerifiedAt: list.reduce((m, c) => (c.verifiedAt > m ? c.verifiedAt : m), ''),
    dataSession,
    dataBasis: mode(withNumbers.map((r) => r.impliedBasis)),
    dataAt: at.length ? Math.max(...at) : (withNumbers.map((r) => r.impliedAsOf).find((x) => x != null) ?? null),
    generatedAt: nowMs,
  };
}

/**
 * 페이지·OG 이미지·메타데이터가 부르는 문 — 인스턴스 메모 60초 + 단일 비행 + 마지막 정상본.
 *   readOnly: 공유 랜딩은 저장본만 읽으며 누락된 구조의 보강을 예약하지 않는다(기본 호출은 기존대로 보강).
 *   background: 낡은 사본을 주고 «응답 뒤» 갱신을 맡길 때(page 는 next/server after 로 넘긴다). 없으면 낡은 사본이라도 기다리지 않고 주되 갱신은 바로 떠 둔다.
 */
export async function getEarningsWeek(opts: { background?: (p: Promise<unknown>) => void; readOnly?: boolean } = {}): Promise<EarningsWeekData> {
  const now = Date.now();
  // 읽기 전용 호출이 보강 예약을 하는 진행 중 요청에 합류하거나 기본 호출을 억제하지 않게 분리한다.
  const key = `${weekRangeET(now).start}:${opts.readOnly ? 'read' : 'warm'}`;
  const hit = memo.get(key);
  const refresh = () => {
    let p = inflight.get(key);
    if (!p) {
      p = buildEarningsWeek(now, CONFIRMED_EARNINGS, opts)
        .then((data) => { memo.set(key, { at: Date.now(), data }); return data; })
        .finally(() => { inflight.delete(key); });
      inflight.set(key, p);
    }
    return p;
  };
  if (hit && now - hit.at < FRESH_MS) return hit.data;
  if (hit && now - hit.at < STALE_OK_MS) {
    const p = refresh();
    p.catch(() => undefined);
    if (opts.background) opts.background(p.catch(() => undefined));
    return hit.data;
  }
  try {
    return await refresh();
  } catch (e) {
    if (hit) return hit.data;      // 읽기 실패 → 아무리 낡아도 마지막 정상본
    throw e;
  }
}
