// ============================================================================
// 실적 발표의 «실제 반응» 기록 — 읽기(페이지) · 채우기(크론) (2026-10-14)
//
// 읽기(페이지 경로): Redis mget 한 번뿐 — 벤더 0 · 쓰기 0. 실패하면 빈 결과(페이지는 이 칸만 비운다, 던지지 않는다).
// 채우기(크론 /api/cron/earnings-actuals, 평일 아침 2번 + 마감 뒤 30분 간격):
//   ① 예상 변동폭 «발표 전 마지막 값» 저장 — 화면이 읽는 저장본(readImpliedMoveRows: 웹·앱·라우트와 같은 문)에서 읽는다.
//      세션이 발표 전 범위 안일 때만(expectedEligible) · 발표가 끝난(phase done) 종목은 건드리지 않는다.
//   ② 실제 반응 계산 — 반응일 정규장 마감 + 30분 뒤에 Intrinio 일봉으로 (기준일 종가 → 반응일 종가) 등락률.
//      독립 공급사(FMP, 분할 미조정 종가)와 두 날짜 모두 같을 때만 «대조 일치(check: fmp)»로 표시한다.
//      두 공급사가 다르면 저장하지 않는다(다음 회차가 다시 본다). FMP 가 없으면 Intrinio 단독으로 저장하고 그렇게 표시한다.
// 키: earnings:actuals:v1:{TICKER}:{발표일} (TTL 120일, EC2 레디스 전용 — 복제 접두사 밖) · 한 발표당 0.5KB.
// ============================================================================

import { CONFIRMED_EARNINGS, type ConfirmedEarnings } from '@/lib/earningsConfirmed';
import { addDaysYmd, phaseOf } from '@/lib/earningsWeek';
import {
  ACTUALS_TTL_SEC, MAX_PLAUSIBLE_MOVE_PCT, actualsKey, closesAgree, expectedEligible, isReactionFinal, parseRecord, pctChange,
  reactionFinalAt, reactionSessions, sameExpected, type ActualMove, type ActualsRecord, type ExpectedSnap, type ReportHour,
} from '@/lib/earnings/earningsActuals';
import { daysBetweenYmd, etDateOf } from '@/lib/marketCalendar';
import { getDailyAggregates } from '@/services/intrinioClient';
import { readImpliedMoveRows } from '@/services/impliedMoveService';
import { mgetFromCache, setInCache } from '@/services/redisClient';

export const recordMapKey = (ticker: string, date: string): string => `${String(ticker).toUpperCase()}|${date}`;

/** 페이지가 읽는 문 — 항목 순서와 무관한 Map(키: «티커|발표일»). 실패·빈 값은 조용히 빈 Map. */
export async function readActualRecords(entries: ReadonlyArray<{ ticker: string; date: string }>): Promise<Map<string, ActualsRecord>> {
  const out = new Map<string, ActualsRecord>();
  if (!entries.length) return out;
  try {
    const vals = await mgetFromCache<unknown>(entries.map((e) => actualsKey(e.ticker, e.date)));
    entries.forEach((e, i) => {
      const rec = parseRecord(vals[i]);
      if (rec && rec.ticker === e.ticker.toUpperCase() && rec.date === e.date) out.set(recordMapKey(e.ticker, e.date), rec);
    });
  } catch { /* 읽기 실패 — 이 칸만 비운다 */ }
  return out;
}

// ── 종가 원천 ────────────────────────────────────────────────────────────────

export interface DailyClose { date: string; close: number }
export type BarsFn = (ticker: string, from: string, to: string) => Promise<DailyClose[]>;

/** Intrinio 일봉(우리 API 와 같은 원천) — 날짜는 UTC 자정 도장 = 거래일 그 자체. */
export const intrinioCloses: BarsFn = async (ticker, from, to) => {
  const agg = await getDailyAggregates(ticker, from, to, { sort: 'asc', limit: 40 });
  return (agg?.results || [])
    .map((r: any) => ({ date: new Date(Number(r.t)).toISOString().slice(0, 10), close: Number(r.c) }))
    .filter((r: DailyClose) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.close > 0);
};

/** FMP 분할 미조정 종가(독립 공급사) — 키가 없거나 실패하면 null(대조만 건너뛴다). */
export const fmpCloses: BarsFn = async (ticker, from, to) => {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error('fmp_key_missing');
  const u = `https://financialmodelingprep.com/stable/historical-price-eod/non-split-adjusted?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}&apikey=${encodeURIComponent(key)}`;
  const res = await fetch(u, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`fmp_http_${res.status}`);
  const j: any = await res.json();
  if (!Array.isArray(j)) throw new Error('fmp_shape');
  return j
    // non-split-adjusted 엔드포인트의 종가는 필드 이름이 adjClose 다(값은 분할 미조정 — 10/14 실측: JPM 10/13 adjClose 331.43 = 일봉 종가). close 가 있으면 close.
    .map((r: any) => ({ date: String(r?.date || '').slice(0, 10), close: Number(r?.close ?? r?.adjClose) }))
    .filter((r: DailyClose) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.close > 0);
};

// ── 채우기 ───────────────────────────────────────────────────────────────────

export interface CycleDeps {
  readImplied?: typeof readImpliedMoveRows;
  bars?: BarsFn;
  fmp?: BarsFn;
}
export interface CycleReport {
  now: number;
  today: string;
  considered: number;
  expectedSaved: string[];
  actualsSaved: string[];
  /** 대조 보강 결과 — «티커|발표일:fmp» 또는 «:mismatch-dropped» */
  rechecked: string[];
  skipped: Array<{ key: string; reason: string }>;
}

const hourOf = (c: ConfirmedEarnings): ReportHour | null => (c.hour === 'bmo' || c.hour === 'amc' ? c.hour : null);
/** 크론이 보는 창 — 발표일이 오늘 −10일 ~ +5일 */
const LOOKBACK_DAYS = 10;
const LOOKAHEAD_DAYS = 5;
/** 반응일이 이만큼(일) 넘게 지난 기록은 자동으로 채우지 않는다(낡은 일봉을 새 값처럼 쓰지 않게 — 수동 보강 몫) */
const MAX_AGE_DAYS = 8;
/** 한 회차에서 새로 계산하는 최대 종목 수(maxDuration 60초 보호) */
const MAX_ACTUALS_PER_RUN = 12;
/** Intrinio 단독으로 저장된 기록을 FMP 로 다시 대조하는 기간 — 저장 뒤 4일 */
const RECHECK_WINDOW_MS = 4 * 24 * 3600_000;
/**
 * «마감 직후 임시 종가» 방어 — 일봉 확정 시각(마감+30분) «뒤 2시간 안에» 저장한 기록은 그 2시간이 지난 뒤 한 번 더 읽어 같은지 본다.
 * 근거(10/13 실측, 운영 세션 가격 무결성 수리): 마감 교차(closing cross)의 늦은 체결이 반영되며 일봉이 한동안 임시값이었다(AZZ 137.16 → 최종 136.71 — 0.3%p).
 */
const SETTLE_MS = 120 * 60_000;

async function saveRecord(rec: ActualsRecord): Promise<boolean> {
  return setInCache(actualsKey(rec.ticker, rec.date), rec, ACTUALS_TTL_SEC).catch(() => false);
}

export async function runActualsCycle(opts: { nowMs?: number; list?: readonly ConfirmedEarnings[]; deps?: CycleDeps; dryRun?: boolean } = {}): Promise<CycleReport> {
  const now = opts.nowMs ?? Date.now();
  const today = etDateOf(now);
  const list = opts.list ?? CONFIRMED_EARNINGS;
  const readImplied = opts.deps?.readImplied ?? readImpliedMoveRows;
  const bars = opts.deps?.bars ?? intrinioCloses;
  const fmp = opts.deps?.fmp ?? fmpCloses;
  const report: CycleReport = { now, today, considered: 0, expectedSaved: [], actualsSaved: [], rechecked: [], skipped: [] };
  const lo = addDaysYmd(today, -LOOKBACK_DAYS);
  const hi = addDaysYmd(today, LOOKAHEAD_DAYS);

  const cands = list.filter((c) => hourOf(c) && c.date >= lo && c.date <= hi);
  report.considered = cands.length;
  if (!cands.length) return report;
  const recs = await readActualRecords(cands);
  const dirty = new Map<string, ActualsRecord>();
  const recOf = (c: ConfirmedEarnings): ActualsRecord => dirty.get(recordMapKey(c.ticker, c.date)) ?? recs.get(recordMapKey(c.ticker, c.date))
    ?? { v: 1, ticker: c.ticker.toUpperCase(), date: c.date, hour: hourOf(c)!, expected: null, actual: null, at: now };
  const skip = (c: ConfirmedEarnings, reason: string) => report.skipped.push({ key: recordMapKey(c.ticker, c.date), reason });

  // ① 예상 변동폭 — 발표 전(phase done 이 아닌) 종목만
  const pre = cands.filter((c) => phaseOf(c.date, c.hour, now) !== 'done');
  if (pre.length) {
    let rows: Awaited<ReturnType<typeof readImpliedMoveRows>> = [];
    try {
      rows = await readImplied(pre.map((c) => ({ ticker: c.ticker, after: c.date, timing: c.hour === 'bmo' ? 'bmo' as const : 'amc' as const })), today);
    } catch { rows = []; }
    pre.forEach((c, i) => {
      const im = rows[i];
      if (!im || !(Number(im.impliedMovePct) > 0)) return skip(c, `expected:${im?.reason ?? 'no_row'}`);
      if (!expectedEligible(c, im.session)) return skip(c, `expected:session_${im.session ?? 'unknown'}_out_of_range`);
      const cur = recOf(c);
      const snap: ExpectedSnap = {
        pct: im.impliedMovePct!, expiry: im.expiry, session: im.session!, basis: im.basis,
        method: im.method ?? null,
        ...(im.straddlePct !== undefined ? { straddlePct: im.straddlePct } : {}),
        strike: im.strike, straddle: im.straddle, spot: im.spot, capturedAt: now, src: 'page',
      };
      if (sameExpected(cur.expected, snap)) return;                               // 같은 값 — 다시 쓰지 않는다
      if (cur.expected && snap.session < cur.expected.session) return skip(c, 'expected:older_session');   // 뒤로 가지 않는다
      const next = { ...cur, expected: snap, at: now };
      dirty.set(recordMapKey(c.ticker, c.date), next);
      report.expectedSaved.push(`${c.ticker}|${c.date}:${snap.pct}`);
    });
  }

  // ② 실제 반응 — 반응일 일봉이 확정된 종목
  let computed = 0;
  const computedNow = new Set<string>();
  for (const c of cands) {
    const cur = recOf(c);
    if (cur.actual) continue;
    const rs = reactionSessions(c.date, c.hour);
    if (!rs) { skip(c, 'actual:no_sessions'); continue; }
    if (!isReactionFinal(rs.react, now)) { skip(c, 'actual:not_final'); continue; }
    if ((daysBetweenYmd(rs.react, today) ?? 0) > MAX_AGE_DAYS) { skip(c, 'actual:too_old'); continue; }
    if (computed >= MAX_ACTUALS_PER_RUN) { skip(c, 'actual:run_cap'); continue; }
    computed++;
    try {
      const from = addDaysYmd(rs.base, -4);
      const main = await bars(c.ticker, from, rs.react);
      const b = main.find((x) => x.date === rs.base), r = main.find((x) => x.date === rs.react);
      if (!b || !r) { skip(c, `actual:bar_missing(${b ? '' : rs.base}${!b && !r ? ',' : ''}${r ? '' : rs.react})`); continue; }
      const pct = pctChange(b.close, r.close);
      if (pct == null || Math.abs(pct) > MAX_PLAUSIBLE_MOVE_PCT) { skip(c, `actual:implausible(${pct})`); continue; }
      let check: ActualMove['check'] = null;
      try {
        const other = await fmp(c.ticker, rs.base, rs.react);
        const ob = other.find((x) => x.date === rs.base), or = other.find((x) => x.date === rs.react);
        if (ob && or) {
          if (!closesAgree(b.close, ob.close) || !closesAgree(r.close, or.close)) {
            console.warn(`[EarningsActuals] vendor_mismatch ${c.ticker} ${c.date}: intrinio ${b.close}→${r.close} fmp ${ob.close}→${or.close}`);
            skip(c, `actual:vendor_mismatch(${b.close}/${ob.close},${r.close}/${or.close})`);
            continue;
          }
          check = 'fmp';
        } else {
          skip(c, `fmp:bar_missing(${ob ? '' : rs.base}${!ob && !or ? ',' : ''}${or ? '' : rs.react})`);
        }
      } catch (e: any) {
        // 대조 불가 — Intrinio 단독으로 저장하고 그렇게 표시한다(다음 회차가 «대조 보강»으로 다시 본다)
        skip(c, `fmp:unavailable(${String(e?.message || e).slice(0, 40)})`);
      }
      const actual: ActualMove = { pct, baseDate: rs.base, baseClose: b.close, reactDate: rs.react, reactClose: r.close, src: 'intrinio-daily', check, at: now };
      dirty.set(recordMapKey(c.ticker, c.date), { ...cur, actual, at: now });
      computedNow.add(recordMapKey(c.ticker, c.date));
      report.actualsSaved.push(`${c.ticker}|${c.date}:${pct}${check ? '' : ':single'}`);
    } catch (e: any) {
      skip(c, `actual:error(${String(e?.message || e).slice(0, 60)})`);
    }
  }

  // ③-0 «확정 뒤 재확인» — 일봉 확정(마감+30분) 직후 2시간 안에 저장한 기록은 2시간이 지난 뒤 한 번 더 읽는다(마감 직후 임시 종가 방어).
  //      같으면 저장 시각만 갱신(다시 안 본다) · 다르면 새 값으로(두 공급사가 같을 때) · 두 공급사가 서로 다르면 기록을 지운다.
  let settledChecks = 0;
  for (const c of cands) {
    const cur = recOf(c);
    const a = cur.actual;
    if (!a || computedNow.has(recordMapKey(c.ticker, c.date))) continue;
    const settleAt = (reactionFinalAt(a.reactDate) ?? 0) + SETTLE_MS;
    if (!(a.at < settleAt && now >= settleAt) || settledChecks >= MAX_ACTUALS_PER_RUN) continue;
    settledChecks++;
    try {
      const main = await bars(c.ticker, addDaysYmd(a.baseDate, -1), a.reactDate);
      const b = main.find((x) => x.date === a.baseDate), r = main.find((x) => x.date === a.reactDate);
      if (!b || !r) { skip(c, 'settle:bar_missing'); continue; }
      if (Math.abs(b.close - a.baseClose) < 0.0051 && Math.abs(r.close - a.reactClose) < 0.0051) {
        dirty.set(recordMapKey(c.ticker, c.date), { ...cur, actual: { ...a, at: now }, at: now });
        report.rechecked.push(`${c.ticker}|${c.date}:settled-same`);
        continue;
      }
      const pct = pctChange(b.close, r.close);
      let check: ActualMove['check'] = null;
      let vendorsDisagree = false;
      try {
        const other = await fmp(c.ticker, a.baseDate, a.reactDate);
        const ob = other.find((x) => x.date === a.baseDate), or = other.find((x) => x.date === a.reactDate);
        if (ob && or) { if (closesAgree(b.close, ob.close) && closesAgree(r.close, or.close)) check = 'fmp'; else vendorsDisagree = true; }
      } catch { /* FMP 불가 — 단독 */ }
      if (pct == null || Math.abs(pct) > MAX_PLAUSIBLE_MOVE_PCT || vendorsDisagree) {
        console.warn(`[EarningsActuals] settle_conflict ${c.ticker} ${c.date}: stored ${a.baseClose}→${a.reactClose} now intrinio ${b.close}→${r.close} — 기록을 지운다`);
        dirty.set(recordMapKey(c.ticker, c.date), { ...cur, actual: null, at: now });
        report.rechecked.push(`${c.ticker}|${c.date}:settle-conflict-dropped`);
        continue;
      }
      console.warn(`[EarningsActuals] settle_update ${c.ticker} ${c.date}: ${a.baseClose}→${a.reactClose} (${a.pct}%) → ${b.close}→${r.close} (${pct}%)`);
      dirty.set(recordMapKey(c.ticker, c.date), { ...cur, actual: { ...a, pct, baseClose: b.close, reactClose: r.close, check, at: now }, at: now });
      report.rechecked.push(`${c.ticker}|${c.date}:settled-updated(${a.pct}→${pct})`);
    } catch (e: any) {
      skip(c, `settle:error(${String(e?.message || e).slice(0, 40)})`);
    }
  }

  // ③ 대조 보강 — Intrinio 단독(check null)으로 저장된 «최근» 기록을 FMP 로 다시 대조한다.
  //    일치하면 «FMP 대조»로 올리고, 두 공급사가 다르면 그 기록을 지운다(대조 못 한 값은 화면에 남겨도 되지만, 독립 공급사가 «다르다»고 하면 남기지 않는다).
  let rechecked = 0;
  for (const c of cands) {
    const cur = recOf(c);
    const a = cur.actual;
    if (!a || a.check || computedNow.has(recordMapKey(c.ticker, c.date))) continue;   // 방금 계산하며 이미 FMP 를 본 종목은 건너뛴다
    if (now - a.at > RECHECK_WINDOW_MS || rechecked >= MAX_ACTUALS_PER_RUN) continue;
    rechecked++;
    try {
      const other = await fmp(c.ticker, a.baseDate, a.reactDate);
      const ob = other.find((x) => x.date === a.baseDate), or = other.find((x) => x.date === a.reactDate);
      if (!ob || !or) { skip(c, 'recheck:fmp_bar_missing'); continue; }
      if (closesAgree(a.baseClose, ob.close) && closesAgree(a.reactClose, or.close)) {
        dirty.set(recordMapKey(c.ticker, c.date), { ...cur, actual: { ...a, check: 'fmp' }, at: now });
        report.rechecked.push(`${c.ticker}|${c.date}:fmp`);
      } else {
        console.warn(`[EarningsActuals] recheck_mismatch ${c.ticker} ${c.date}: intrinio ${a.baseClose}→${a.reactClose} fmp ${ob.close}→${or.close} — 기록을 지운다`);
        dirty.set(recordMapKey(c.ticker, c.date), { ...cur, actual: null, at: now });
        report.rechecked.push(`${c.ticker}|${c.date}:mismatch-dropped`);
      }
    } catch (e: any) {
      skip(c, `recheck:fmp_unavailable(${String(e?.message || e).slice(0, 40)})`);
    }
  }

  if (!opts.dryRun) {
    for (const rec of dirty.values()) {
      const ok = await saveRecord(rec);
      if (!ok) report.skipped.push({ key: recordMapKey(rec.ticker, rec.date), reason: 'save_failed' });
    }
  }
  return report;
}

/** 수동 보강(스크립트 전용) — 예상 변동폭을 직접 넣는다. 이미 값이 있으면 건드리지 않는다(force 가 아니면). */
export async function seedExpected(
  c: { ticker: string; date: string; hour: ReportHour },
  snap: ExpectedSnap & { method: NonNullable<ExpectedSnap['method']> },
  opts: { force?: boolean } = {},
): Promise<'saved' | 'kept' | 'failed'> {
  const cur = (await readActualRecords([c])).get(recordMapKey(c.ticker, c.date));
  if (cur?.expected && !opts.force) return 'kept';
  const rec: ActualsRecord = cur ? { ...cur, expected: snap, at: Date.now() }
    : { v: 1, ticker: c.ticker.toUpperCase(), date: c.date, hour: c.hour, expected: snap, actual: null, at: Date.now() };
  return (await saveRecord(rec)) ? 'saved' : 'failed';
}
