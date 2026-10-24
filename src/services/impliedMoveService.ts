/**
 * ★ [2026-09-29] 예상 변동 «전환기» 읽기 — 구조 사본에 impliedMove 가 아직 없을 때만 쓴다.
 *
 * 구조 서비스는 이제 결과에 impliedMove(주간 만기 ATM 스트래들)를 싣는다(src/lib/impliedMove.ts).
 * 그런데 이 수리 «전에» 계산된 사본은 장외 신선 TTL(72시간)·마지막 정상본(72시간) 동안 그 필드 없이 남는다.
 * 그 사이 화면의 IMP MOVE 가 «—» 로 비지 않게, 같은 체인(수집기 캐시 polygon:snapshot:probe:{T} 의 주간 만기)을
 * «읽기만» 해서 같은 정의로 계산한다. 구조 사본이 새로 계산되면(장중 60초 TTL) 이 경로는 저절로 안 쓰인다.
 *
 * ⛔ 벤더 호출 0 · Redis 쓰기 0. 인스턴스 메모 60초(같은 종목을 한 요청 묶음에서 되풀이해 읽지 않게).
 */
import { getFromCache, mgetFromCache } from '@/services/redisClient';
import { structureV2Key, structureLastGoodKey } from '@/services/structureService';
import { atmStraddleImpliedMove, eodQuoteRows, etDateString, IMPLIED_MOVE_DEF, impliedMoveFields, type ImpliedMove, type ImpliedMoveBasis } from '@/lib/impliedMove';
import { readEodCloses } from '@/services/eodSnapshot';
import { etDateOf, etMinutesOf, isNonTradingDay, sessionCloseMinutes, shownRegularSessionDate } from '@/lib/marketCalendar';
import { optionExpirationFloor, weeklyOptionExpiryAt, isOptionExpiredAt } from '@/lib/marketCalendar';
import { regularReferencePrice } from '@/lib/quoteBasis';

import { ImpliedDeadlineError, withinImpliedDeadline, IMPLIED_REFRESH_BUDGET_MS, IMPLIED_SAVE_RESERVE_MS } from '@/lib/earnings/impliedDeadline';
import { bgStore } from '@/lib/intrinioBackground';
import { expiryMethod, type EarningsMoveMethod, type EarningsMove } from '@/lib/earnings/eventMove';
import { EARNINGS_IMPLIED_KEY, earningsObservationKey, type ImpliedPack } from '@/lib/earnings/earningsImplied';

const MEMO_MS = 60_000;
const memo = new Map<string, { at: number; value: ImpliedMove | null }>();

/** 구조 사본이 «이 수리 전» 것인가 — 계산은 성공했는데 impliedMove 키 자체가 없다 */
export function structureLacksImpliedMove(structure: any): boolean {
    return !!structure && typeof structure === 'object' && structure.options_status === 'OK' && !('impliedMove' in structure);
}

/** 수집기 체인 캐시의 주간 만기로 ATM 스트래들 — 없으면 null */
export async function weeklyImpliedMoveFromProbe(ticker: string, spot: number, expiry?: string | null): Promise<ImpliedMove | null> {
    const T = String(ticker || '').toUpperCase();
    if (!T || !(spot > 0)) return null;
    const now = Date.now();
    if (expiry && isOptionExpiredAt(expiry, now)) return null;
    const key = `${T}:${expiry || 'weekly'}:${optionExpirationFloor(now)}:${spot}`;
    const hit = memo.get(key);
    if (hit && now - hit.at < MEMO_MS && !isOptionExpiredAt(hit.value?.expiry, now)) return hit.value;
    let value: ImpliedMove | null = null;
    try {
        const pc: any = await getFromCache<any>(`polygon:snapshot:probe:${T}`);
        const chain = [...(Array.isArray(pc?.exactResults) ? pc.exactResults : []), ...(Array.isArray(pc?.probeResults) ? pc.probeResults : [])];
        const exp = expiry || (pc?.weeklyExpiry && !isOptionExpiredAt(pc.weeklyExpiry) ? pc.weeklyExpiry : weeklyOptionExpiryAt(Date.now()));
        if (chain.length) {
            value = atmStraddleImpliedMove(chain, spot, {
                expiry: exp,
                quotesLive: pc?.greeksSource === 'realtime',
                quotesAt: Number(pc?._ts) || null,
                // [10/4] EOD 값의 세션 꼬리표 — 수집기 체인 날짜(만기별 → 주간)
                chainDate: (exp && pc?.chainDates?.[exp]) || pc?.chainDate || null,
            });
        }
    } catch {
        value = null;
    }
    if (memo.size > 2000) memo.clear();
    memo.set(key, { at: Date.now(), value });
    return value;
}

/**
 * 저장된 구조 사본(레벨 판본·옛 마지막 정상본 중 늦게 계산됐고 만기가 지나지 않은 것)을 «읽기만» 한다.
 * getStructureData 와 달리 계산·배경 갱신을 부르지 않는다 — 부르는 쪽이 Redis 쓰기를 늘리지 않게.
 */
export async function peekStoredStructure(ticker: string): Promise<any | null> {
    const T = String(ticker || '').toUpperCase();
    if (!T) return null;
    try {
        // [통합 9/30] 레벨 판본은 main 9/30 설계로 종목당 structure:v2:{T} 하나다(옛 structure:v1:{T}:auto 는 더 안 쓴다).
        //   판본을 먼저, 옛 마지막 정상본(structure:lastgood:{T}:auto)은 전환기 대체로만 — structureService.readStoredStructures 와 같은 순서.
        const [fresh, lastGood] = await mgetFromCache<{ data: any; timestamp: number }>([
            structureV2Key(T), structureLastGoodKey(`${T}:auto`),
        ]);
        const today = optionExpirationFloor();
        const cands = [fresh, lastGood]
            .filter((v) => v?.data && !(typeof v.data.expiration === 'string' && v.data.expiration < today))
            .sort((a, b) => (Number(b!.timestamp) || 0) - (Number(a!.timestamp) || 0));
        return cands[0]?.data ?? null;
    } catch {
        return null;
    }
}

/** 구조 결과에서도 묶음/API와 같은 종가·ATM·체인 세션 보정을 적용한다. */
export async function impliedMoveOfStructure(ticker: string, structure: any, spot?: number | null, opts: { retryNull?: boolean; referenceSession?: string } = {}): Promise<ImpliedMove | null> {
    if (!structure || typeof structure !== 'object') return null;
    if (isOptionExpiredAt(structure.expiration)) return null;
    // Intel은 세션이 확인된 가격만 전달한다. 없으면 옛 구조 가격으로 메우지 않는다.
    const referenceSession = opts.referenceSession ?? (opts.retryNull ? shownRegularSessionDate() : undefined);
    const reference = referenceSession ? {
        session: referenceSession,
        spot: typeof spot === 'number' && Number.isFinite(spot) && spot > 0 ? spot : null,
    } : undefined;
    const S = reference ? reference.spot ?? NaN : Number(spot) > 0 ? Number(spot) : Number(structure.underlyingPrice);
    const needsProbe = structureLacksImpliedMove(structure) || (opts.retryNull === true && structure.options_status === 'OK' && structure.impliedMove == null);
    if (needsProbe && typeof structure.expiration !== 'string' && !reference) return weeklyImpliedMoveFromProbe(ticker, S);
    const st = needsProbe ? { ...structure, underlyingPrice: S } : structure;
    const [result] = await resolveImpliedMoves([{ ticker: String(ticker || '').toUpperCase() }], [st], etDateString(), opts.retryNull, reference);
    return result.im;
}

// ════════════════════════════════════════════════════════════════════════════
// [2026-10-11] 실적 주간 페이지(/earnings-week)용 «읽기 전용 예상 변동 묶음» — GET /api/options/implied-move 와 같은 규칙·같은 저장본
//
// 라우트(src/app/api/options/implied-move/route.ts)는 종목 모두에 같은 after/timing 을 건다. 여기는 종목마다 다른 발표일·시각을
// 한 번의 mget 으로 읽는다(정의는 lib/impliedMove.ts 한 곳). 라우트 파일은 건드리지 않았다 — 두 경로가 갈라지지 않게
// tests/earningsWeek.test.ts 가 «라우트 GET 을 기준값(오라클)»으로 같은 저장본에서 같은 결과를 내는지 대조한다.
// ⛔ 부작용 없음: 벤더 0 · Redis 쓰기 0 · 구조 재계산 0.
// ════════════════════════════════════════════════════════════════════════════

export type ImpliedTiming = 'amc' | 'bmo' | 'dmh' | 'unknown';
export interface ImpliedMoveRequest { ticker: string; after?: string | null; timing?: ImpliedTiming }
export interface ImpliedMoveRow {
    ticker: string;
    impliedMovePct: number | null;
    expiry: string | null;
    asOf: number | null;
    basis: ImpliedMoveBasis | null;
    strike: number | null;
    straddle: number | null;
    spot: number | null;
    source: 'structure' | 'probe' | null;
    session: string | null;
    reason: string | null;
    method?: EarningsMoveMethod | null;
    eventMovePct?: number | null;
    /** 같은 관측의 ATM 스트래들/현물. 이벤트 분리값과 별도로 보존한다. */
    straddlePct?: number | null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function impliedRowOf(ticker: string, im: ImpliedMove | null, source: ImpliedMoveRow['source'], reason: string | null, earnings = false): ImpliedMoveRow {
    const f = impliedMoveFields(im);
    if (f.impliedMovePct == null) { im = null; reason ??= 'no_straddle'; }
    const event = im as EarningsMove | null;
    return {
        ticker,
        impliedMovePct: f.impliedMovePct != null ? ((im as EarningsMove).eventMovePct ?? f.impliedMovePct) : null,
        expiry: im?.expiry ?? null,
        asOf: f.impliedMoveAsOf,
        basis: f.impliedMoveBasis,
        strike: f.impliedMovePct != null ? im!.strike : null,
        straddle: f.impliedMovePct != null ? im!.straddle : null,
        spot: im?.spot ?? null,
        source: im ? source : null,
        session: f.impliedMoveSession,
        reason: f.impliedMovePct != null ? null : reason,
        ...(earnings ? {
            method: im?.expiry ? (im as EarningsMove).method ?? expiryMethod(im.expiry) : null,
            straddlePct: f.impliedMovePct,
        } : event?.method ? { method: event.method } : {}),
        ...(event?.eventMovePct != null ? { eventMovePct: event.eventMovePct } : {}),
    };
}

type ResolvedImpliedMove = { ticker: string; im: ImpliedMove | null; source: ImpliedMoveRow['source']; reason: string | null };
const resolvedMoveOf = (ticker: string, im: ImpliedMove | null, source: ImpliedMoveRow['source'], reason: string | null): ResolvedImpliedMove => ({ ticker, im, source, reason });

function freshestStoredStructure(a: any, b: any, today: string): any | null {
    const cands = [a, b]
        .filter((v) => v?.data && !(typeof v.data.expiration === 'string' && v.data.expiration < today))
        .sort((x, y) => (Number(y.timestamp) || 0) - (Number(x.timestamp) || 0));
    return cands[0]?.data ?? null;
}

function firstExpiryAfterDate(exps: string[], date: string, timing: ImpliedTiming): string | null {
    const sameDayOk = timing === 'bmo' || timing === 'dmh';
    return exps.filter((e) => ISO_DATE_RE.test(e)).sort().find((e) => (sameDayOk ? e >= date : e > date)) ?? null;
}

/** 첫 이벤트 만기는 우선하되, 같은 만기의 관측은 옵션 세션·호가 시각이 후퇴하지 않게 한다. */
function shouldUseEarningsObservation(candidate: EarningsMove, existing: ImpliedMove | null): boolean {
    if (!candidate.expiry) return false;
    if (!existing?.expiry) return true;
    if (candidate.expiry !== existing.expiry) return candidate.expiry < existing.expiry;
    const next = impliedMoveFields(candidate), prev = impliedMoveFields(existing);
    const nextSession = next.impliedMoveSession, prevSession = prev.impliedMoveSession;
    if (nextSession !== prevSession) return !!nextSession && (!prevSession || nextSession > prevSession);
    if (!nextSession) return false;
    // 같은 세션의 최종 EOD는 장중 호가보다 뒤다. checkedAt(캐시 확인 시각)은 신선도 근거가 아니다.
    if (candidate.basis !== existing.basis) return candidate.basis === 'eod';
    // 같은 EOD 세션의 event-split 보충은 허용한다.
    if (candidate.basis === 'eod') return true;
    const nextAt = next.impliedMoveAsOf, prevAt = prev.impliedMoveAsOf;
    return typeof nextAt === 'number' && Number.isFinite(nextAt) && nextAt > 0
        && (!(typeof prevAt === 'number' && Number.isFinite(prevAt) && prevAt > 0) || nextAt > prevAt);
}

// ════════════════════════════════════════════════════════════════════════════
// [T26 2026-10-25] «같은 종목·같은 만기·같은 세션 = 한 값» — 일반 경로도 실적 경로의 «마감 관측»을 같은 규칙으로 쓴다.
//
// [사고] 10/24 운영: AMZN 10/30 만기 10/23 세션 — GET /api/options/implied-move 7.8 vs 실적 캘린더 7.9.
//   행사가(247.5)·분모(공식 종가 248)·세션은 같고 «다리 가격의 원천»만 달랐다:
//     · 구조 사본 = 수집기 체인 midpoint = 실시간 FMV(synthetic_price) 콜 10.125 + 풋 9.325 = 19.45 → 7.843 → 7.8
//       (정규장 밖에서 받은 실시간 호가라 basis eod 로 바뀌지만 공급사 마감 호가는 아니다)
//     · 실적 관측 = 공급사 EOD 체인 mark(마감 호가 중간) 콜 10.10 + 풋 9.375 = 19.475 → 7.853 → 7.9
//   정의(lib/impliedMove [정의]·meta.definition)는 장외 = «마지막 세션의 마감 중간값»이므로 정본은 마감 관측이다.
//   실적 경로는 이미 shouldUseEarningsObservation(같은 만기·같은 세션이면 EOD 관측 우선)으로 관측을 쓴다 — 일반 경로만 몰랐다.
//
// [규칙] 관측 «레지스트리» = 실적 캘린더 묶음(earnings:implied:v1)의 행 키 «티커|발표일». 그 발표의 관측 키(next·same)를 읽어
//   만기가 같은 관측만 shouldUseEarningsObservation 으로 고른다(장중 실시간 값은 더 새 세션이라 그대로 — 관측은 읽지도 않는다).
//   관측 값은 저장된 그대로 쓴다(재계산·지어내기 0). 다리·행사가·분모가 같으면 기존 행을 그대로 둔다(출처 표기 불변).
//   ⛔ 벤더 0 · Redis 쓰기 0. 읽기 = 묶음 GET 1(인스턴스 메모 60초) + 관측 mget 1(해당 종목만). 실패하면 기존 값 그대로.
// ════════════════════════════════════════════════════════════════════════════

const PACK_MEMO_MS = 60_000;
let packMemo: { at: number; value: ImpliedPack | null } | null = null;
/** 시험용 — 묶음 메모 비우기 */
export function _resetImpliedPackMemoForTest(): void { packMemo = null; }

async function readEarningsPackMemo(): Promise<ImpliedPack | null> {
    const now = Date.now();
    if (packMemo && now - packMemo.at >= 0 && now - packMemo.at < PACK_MEMO_MS) return packMemo.value;
    let value: ImpliedPack | null = null;
    try {
        const p = await getFromCache<ImpliedPack>(EARNINGS_IMPLIED_KEY);
        value = p && p.v === 1 && p.cells && typeof p.cells === 'object' ? p : null;
    } catch {
        value = null;
    }
    packMemo = { at: Date.now(), value };
    return value;
}

const OBS_MAX_AGE_DAYS = 5;

/** 저장된 마감 관측이 «쓸 수 있는 정의값»인가 — 만기 일치·EOD·세션 5일 이내·다리 값 양수 */
function usableClosingObservation(im: any, expiry: string, today: string): im is EarningsMove {
    if (!im || typeof im !== 'object' || im.def !== IMPLIED_MOVE_DEF || im.basis !== 'eod' || im.expiry !== expiry) return false;
    if (isOptionExpiredAt(im.expiry)) return false;
    const f = impliedMoveFields(im);
    if (f.impliedMovePct == null || !f.impliedMoveSession) return false;
    const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${f.impliedMoveSession}T00:00:00Z`)) / 86400_000;
    if (!(age >= 0 && age <= OBS_MAX_AGE_DAYS)) return false;
    return [im.spot, im.strike, im.callPrice, im.putPrice, im.straddle].every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
}

/** 일반 요청(after 없음)의 결과에 같은 만기의 마감 관측을 실적 경로와 같은 규칙으로 적용한다(제자리 수정). */
async function applyClosingObservations(reqs: ImpliedMoveRequest[], results: ResolvedImpliedMove[]): Promise<void> {
    // «지금 정규장의 실시간 값»만 관측(지난 세션)보다 새롭다 — 규칙상 바뀌지 않으므로 읽지도 않는다.
    //   지난 세션에 저장된 live 값(예: 금요일 장중 값을 토요일에 읽음)·장 마감 뒤 남은 오늘 live 값은 같은 세션의 EOD 관측이
    //   이긴다(shouldUseEarningsObservation: 같은 세션이면 EOD 우선) — 관문 10250346 ①.
    const nowMs = Date.now();
    const today = etDateOf(nowMs);
    const marketOpen = !isNonTradingDay(today) && etMinutesOf(nowMs) >= 570 && etMinutesOf(nowMs) < sessionCloseMinutes(today);
    const targets = results
        .map((r, idx) => ({ r, idx }))
        .filter(({ r, idx }) => {
            const im = r.im;
            if (reqs[idx]?.after || !im || typeof im.expiry !== 'string' || !ISO_DATE_RE.test(im.expiry)) return false;
            if (im.basis === 'eod') return true;
            if (im.basis !== 'live') return false;
            const session = impliedMoveFields(im).impliedMoveSession;
            return !(marketOpen && (session == null || session === today));
        });
    if (!targets.length) return;
    const pack = await readEarningsPackMemo();
    if (!pack) return;
    const lookups: Array<{ idx: number; key: string; cellPct: number | null }> = [];
    for (const { r, idx } of targets) {
        const prefix = `${r.ticker}|`;
        for (const [rowKey, cell] of Object.entries(pack.cells)) {
            if (!rowKey.startsWith(prefix) || !cell || cell.e !== r.im!.expiry) continue;
            const after = rowKey.slice(prefix.length);
            if (!ISO_DATE_RE.test(after)) continue;
            const cellPct = typeof cell.p === 'number' && cell.p > 0 ? cell.p : null;
            lookups.push({ idx, key: earningsObservationKey(r.ticker, after, false), cellPct });
            lookups.push({ idx, key: earningsObservationKey(r.ticker, after, true), cellPct });
        }
    }
    if (!lookups.length) return;
    let values: any[] = [];
    try {
        values = await mgetFromCache<any>(lookups.map((l) => l.key));
    } catch {
        return;
    }
    const best = new Map<number, { im: EarningsMove; matchesCell: boolean }>();
    lookups.forEach((l, i) => {
        const existing = results[l.idx].im;
        const im = values[i]?.im;
        if (!existing?.expiry || !usableClosingObservation(im, existing.expiry, today)) return;
        if (!shouldUseEarningsObservation(im, existing)) return;
        // 후보끼리도 같은 규칙 — 더 새 세션의 관측이 이긴다(관문 10250346 ②: next·same 이 다른 세션이면 늦은 쪽 = 지금 시각 키가 매시 갱신).
        //   같은 세션이면 캘린더 칸에 실린 값과 같은 관측을 먼저(같은 EOD 체인이면 next·same 은 같은 다리다).
        const matchesCell = l.cellPct != null && (im.eventMovePct ?? im.pct) === l.cellPct;
        const prev = best.get(l.idx);
        const s = impliedMoveFields(im).impliedMoveSession!, ps = prev ? impliedMoveFields(prev.im).impliedMoveSession! : null;
        if (!prev || s > ps! || (s === ps && matchesCell && !prev.matchesCell)) best.set(l.idx, { im, matchesCell });
    });
    for (const [idx, { im }] of best) {
        const existing = results[idx].im!;
        if (existing.basis === im.basis && existing.strike === im.strike && existing.spot === im.spot && existing.pct === im.pct
            && existing.straddle === im.straddle && impliedMoveFields(existing).impliedMoveSession === impliedMoveFields(im).impliedMoveSession) continue;
        // 일반 경로는 ATM 스트래들 정의값만 — 실적 전용(method·eventMovePct)은 싣지 않는다.
        const { method: _method, eventMovePct: _event, ...straddle } = im;
        results[idx] = resolvedMoveOf(results[idx].ticker, straddle as ImpliedMove, 'probe', null);
    }
}

/** 종목별 (after, timing) 으로 예상 변동을 읽는다 — 결과는 요청 순서. 저장본이 없으면 값 없이 이유만(지어내지 않는다). */
export async function readImpliedMoveRows(requests: ImpliedMoveRequest[], today: string = etDateString(), opts: { probeMonthly?: boolean; deadlineMs?: number } = {}): Promise<ImpliedMoveRow[]> {
    const reqs = requests.map((r) => ({ ticker: String(r.ticker || '').toUpperCase(), after: r.after && ISO_DATE_RE.test(r.after) ? r.after : null, timing: r.timing ?? 'unknown' }));
    if (!reqs.length) return [];
    const deadlineMs = opts.deadlineMs ?? (opts.probeMonthly ? Date.now() + IMPLIED_REFRESH_BUDGET_MS - IMPLIED_SAVE_RESERVE_MS : undefined);
    const failed = () => reqs.map(r => impliedRowOf(r.ticker, null, null, 'read_failed', !!r.after));
    let structureVals: any[] = [];
    try {
        structureVals = await withinImpliedDeadline(() => mgetFromCache<any>(reqs.flatMap((r) => [structureV2Key(r.ticker), structureLastGoodKey(`${r.ticker}:auto`)])), deadlineMs);
    } catch {
        structureVals = [];
    }
    const floor = optionExpirationFloor();
    if (today < floor) today = floor;
    const structures = reqs.map((_, i) => freshestStoredStructure(structureVals[2 * i], structureVals[2 * i + 1], today));
    let resolved: ResolvedImpliedMove[];
    try {
        resolved = await withinImpliedDeadline(() => resolveImpliedMoves(reqs, structures, today), deadlineMs);
    } catch { return failed(); }
    // Monthly observations must also check for earlier weekly expiries, even when non-null.
    // Only the background pack may collect; all other callers read the dated observation.
    for (let i = 0; i < resolved.length; i++) {
        const r = reqs[i];
        if (!r.after) continue;
        const existing = resolved[i].im;
        if (deadlineMs != null && Date.now() >= deadlineMs) break;
        // 갱신 흐름이 429·시간 초과로 닫혔으면 남은 종목의 월간 조회도 즉시 멈춘다(관문 10200755 ②).
        if (opts.probeMonthly && bgStore.getStore()?.tripped) break;
        try {
            const { earningsMonthlyMove } = await import('@/services/earningsMonthlyProbe');
            const im = await earningsMonthlyMove(r.ticker, r.after, r.timing === 'bmo' || r.timing === 'dmh', structures[i], opts.probeMonthly === true, deadlineMs);
            if (im && shouldUseEarningsObservation(im, existing)) resolved[i] = resolvedMoveOf(r.ticker, im, 'probe', null);
        } catch (error) {
            if (error instanceof ImpliedDeadlineError) break;
        }
    }
    return resolved.map((r, i) => impliedRowOf(r.ticker, r.im, r.source, r.reason, !!reqs[i].after));
}

/** 전달받은 구조를 읽기 전용으로 보정한다. 단건·묶음 모두 이 경로를 지난다. */
async function resolveImpliedMoves(reqs: ImpliedMoveRequest[], structures: any[], today: string, retryNull = false, reference?: { session: string; spot: number | null }): Promise<ResolvedImpliedMove[]> {
    // 저장본 읽기를 기다리던 중 마감됐을 수도 있다.
    const floor = optionExpirationFloor();
    if (today < floor) today = floor;
    const now = Date.now();
    const date = etDateOf(now);
    const closed = isNonTradingDay(date) || etMinutesOf(now) >= sessionCloseMinutes(date) || etMinutesOf(now) < 570;
    let eod = closed ? await readEodCloses().catch(() => null) : null;
    const results: ResolvedImpliedMove[] = [];
    const needProbe: Array<{ idx: number; ticker: string; expiry: string | null; after?: string | null; timing?: ImpliedTiming; spot: number; session: string | null }> = [];
    reqs.forEach((r, i) => {
        const st = structures[i];
        if (!st || isOptionExpiredAt(st.expiration)) { results.push(resolvedMoveOf(r.ticker, null, null, 'no_snapshot')); return; }
        let weeklyIm: ImpliedMove | null = st.impliedMove?.def === IMPLIED_MOVE_DEF && impliedMoveFields(st.impliedMove).impliedMovePct != null ? st.impliedMove : null;
        const missingMove = structureLacksImpliedMove(st) || (retryNull && st.options_status === 'OK' && st.impliedMove == null);
        // 옛 구조 사본도 실제 종가를 읽어 분모를 바로잡는다. EOD 날짜가 체인 세션과 같을 때만.
        // null 보충도 이 정상 경로를 공유한다. 기존 값의 세션이 없으면 구조의 체인 세션으로 종가를 대조한다.
        const referenceSession = reference?.session ?? weeklyIm?.session ?? (retryNull && missingMove ? st.chainDate : null);
        const regularClose = eod && eod.date === referenceSession
            ? regularReferencePrice({ day: { c: eod.rows.get(r.ticker)?.c } }, true) : null;
        const spot = regularClose ?? (reference ? reference.spot ?? NaN : Number(st.underlyingPrice));
        if (weeklyIm && regularClose && regularClose > 0 && weeklyIm.spot !== regularClose) {
            // [T26] 표시용으로 소수 2자리 반올림된 straddle 이 아니라 원래 두 다리 합으로 한 번만 반올림한다(관측 경로와 같은 계산).
            const legs = Number(weeklyIm.callPrice) + Number(weeklyIm.putPrice);
            const sum = Number.isFinite(legs) && legs > 0 ? legs : weeklyIm.straddle;
            weeklyIm = { ...weeklyIm, spot: regularClose, pct: Math.round(sum / regularClose * 1000) / 10 };
        }
        const session = reference?.session ?? (closed ? impliedMoveFields(weeklyIm).impliedMoveSession ?? st.chainDate ?? null : null);
        const exps: string[] = Array.isArray(st.availableExpirations) ? st.availableExpirations.filter((e: string) => e >= today) : [];
        const want = r.after ? firstExpiryAfterDate(exps, r.after, r.timing ?? 'unknown') : (typeof st.expiration === 'string' ? st.expiration : null);
        // availableExpirations is the structure's slice, not the collector's full chain.
        // Read the real chain before declaring that an earnings expiry is unavailable.
        if (r.after && !want) {
            if (spot > 0) needProbe.push({ idx: i, ticker: r.ticker, expiry: null, after: r.after, timing: r.timing, spot, session });
            results.push(resolvedMoveOf(r.ticker, null, null, 'no_expiry_after')); return;
        }
        if (weeklyIm && weeklyIm.expiry === want) {
            // 종가 이동으로 ATM 행사가가 바뀔 수도 있다. 같은 원천 체인이 있으면 두 다리도 다시 고른다.
            if (regularClose && st.impliedMove.spot !== regularClose) needProbe.push({ idx: i, ticker: r.ticker, expiry: want, spot, session });
            results.push(resolvedMoveOf(r.ticker, weeklyIm, 'structure', null)); return;
        }
        // Intel만 명시적 null도 같은 만기·세션의 수집기 체인으로 재시도한다. 다른 소비처의 기본 동작은 유지.
        if (!want || !(spot > 0) || (!r.after && !missingMove)) { results.push(resolvedMoveOf(r.ticker, null, null, 'no_straddle')); return; }
        needProbe.push({ idx: i, ticker: r.ticker, expiry: want, after: r.after, timing: r.timing, spot, session });
        results.push(resolvedMoveOf(r.ticker, null, null, 'no_straddle'));
    });
    if (needProbe.length) {
        let probes: any[] = [];
        try {
            probes = await mgetFromCache<any>(needProbe.map((n) => `polygon:snapshot:probe:${n.ticker}`));
        } catch {
            probes = [];
        }
        // An earnings fallback can be EOD even during REG. Its denominator and ATM
        // selection must use that option session's close, never the structure's spot.
        if (!eod && needProbe.some(n => n.after)) eod = await readEodCloses().catch(() => null);
        needProbe.forEach((n, i) => {
            const pc = probes[i];
            const chain = [...(Array.isArray(pc?.exactResults) ? pc.exactResults : []), ...(Array.isArray(pc?.probeResults) ? pc.probeResults : [])];
            const actualExps: string[] = [...new Set<string>(chain.map((c: any) => c?.details?.expiration_date)
                .filter((e: unknown): e is string => typeof e === 'string' && ISO_DATE_RE.test(e) && e >= today))].sort();
            const eligible = n.after ? actualExps.filter((e) => firstExpiryAfterDate([e], n.after!, n.timing ?? 'unknown')) : [n.expiry!];
            // A weekly expiry may lack a complete ATM pair. Try subsequent actual expiries,
            // including the next monthly expiry, without inventing a quote or a date.
            for (const expiry of eligible) {
                const rows = chain.filter((c: any) => c?.details?.expiration_date === expiry);
                const rowDates = [...new Set(rows.map((c: any) => c?._intrinio?.date).filter((d: unknown) => typeof d === 'string' && ISO_DATE_RE.test(d)))];
                const chainDate = pc?.chainDates?.[expiry] || ((!pc?.weeklyExpiry || pc.weeklyExpiry === expiry) ? pc?.chainDate : null)
                    || (rowDates.length === 1 ? rowDates[0] : null) || null;
                if (!n.after && n.session && chainDate !== n.session) continue;
                const quoteOptions = {
                    expiry,
                    quotesLive: pc?.greeksSource === 'realtime',
                    quotesAt: Number(pc?._ts) || null,
                    chainDate,
                };
                let im = n.after ? null : atmStraddleImpliedMove(rows, n.spot, quoteOptions);
                // 실적 행: 슬림 저장 midpoint 는 basis(live·eod)와 상관없이 출처(양쪽 호가 여부)를 알 수 없다(관문 10200855) —
                //   새 값은 양쪽 마감 호가로만(strict), 그 밖엔 main 의 기존 규칙(legacy)이 내던 값만.
                if (n.after) {
                    // 새 경로(마감 종가 분모·ATM 재선택)는 양쪽 마감 호가가 확인되는 계약만 쓴다(관문 10200755 ①, lib/impliedMove.eodQuoteRows).
                    let strict: ImpliedMove | null = null;
                    // Check the expiry's own provenance, independently of the weekly slice.
                    const close = chainDate && !rowDates.some(d => d !== chainDate) && eod && eod.date === chainDate ? eod.rows.get(n.ticker)?.c : null;
                    if (typeof close === 'number' && Number.isFinite(close) && close > 0) {
                        // Re-select both legs at the closing ATM strike, not just the percentage.
                        const e = atmStraddleImpliedMove(eodQuoteRows(rows, pc?.greeksSource === 'realtime'), close, { ...quoteOptions, quotesLive: false });
                        if (e?.basis === 'eod' && e.session === chainDate) strict = e;
                    }
                    // 새 경로가 값을 못 내면 main 의 기존 규칙 그대로(구조가 고른 만기 하나·같은 세션 증명)만 — 이 브랜치가
                    //   main 이 내지 않던 값을 새로 만들지 않고, main 이 내던 값을 «—»로 지우지도 않는다.
                    let legacy: ImpliedMove | null = null;
                    if (!strict && n.expiry && expiry === n.expiry) {
                        const mainChainDate = pc?.chainDates?.[expiry] || ((!pc?.weeklyExpiry || pc.weeklyExpiry === expiry) ? pc?.chainDate : null) || null;
                        if (!(n.session && mainChainDate !== n.session)) {
                            const m = atmStraddleImpliedMove(chain, n.spot, { ...quoteOptions, chainDate: mainChainDate });
                            if (m && !(n.session && m.session !== n.session)) legacy = m;
                        }
                    }
                    im = strict ?? legacy;
                    if (!im) continue;
                }
                if (!im || (!n.after && n.session && im.session !== n.session)) continue;
                results[n.idx] = resolvedMoveOf(n.ticker, im, 'probe', null);
                break;
            }
            if (!results[n.idx].im && eligible.length > 0) results[n.idx].reason = chain.length ? 'no_straddle' : 'no_snapshot';
        });
    }
    // [T26] 같은 종목·만기의 «마감 관측»이 있으면 실적 경로와 같은 규칙(shouldUseEarningsObservation)으로 고른다.
    //   after 요청은 readImpliedMoveRows 가 그 발표의 관측을 직접 읽으므로 여기선 일반 요청만.
    await applyClosingObservations(reqs, results);
    // 위 조회를 기다리는 사이 마감됐을 수 있다 — 먼저 채운 행도 응답 직전에 다시 검사한다(지난 만기 값은 내지 않는다).
    const end = Date.now();
    return results.map((row) => (row.im?.expiry && isOptionExpiredAt(row.im.expiry, end) ? resolvedMoveOf(row.ticker, null, null, 'no_straddle') : row));
}
