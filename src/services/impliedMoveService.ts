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
import { atmStraddleImpliedMove, etDateString, IMPLIED_MOVE_DEF, impliedMoveFields, type ImpliedMove, type ImpliedMoveBasis } from '@/lib/impliedMove';
import { optionExpirationFloor, weeklyOptionExpiryAt, isOptionExpiredAt } from '@/lib/marketCalendar';

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

/** 구조 결과에서 예상 변동 — 전환기엔 수집기 체인으로 채운다 */
export async function impliedMoveOfStructure(ticker: string, structure: any, spot?: number | null): Promise<ImpliedMove | null> {
    if (!structure || typeof structure !== 'object') return null;
    if (isOptionExpiredAt(structure.expiration)) return null;
    if (!structureLacksImpliedMove(structure)) {
        const im = structure.impliedMove;
        return im && impliedMoveFields(im).impliedMovePct != null && im.expiry === structure.expiration ? im : null;
    }
    const S = Number(spot) > 0 ? Number(spot) : Number(structure.underlyingPrice);
    return weeklyImpliedMoveFromProbe(ticker, S, typeof structure.expiration === 'string' ? structure.expiration : null);
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
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function impliedRowOf(ticker: string, im: ImpliedMove | null, source: ImpliedMoveRow['source'], reason: string | null): ImpliedMoveRow {
    const f = impliedMoveFields(im);
    if (f.impliedMovePct == null) { im = null; reason ??= 'no_straddle'; }
    return {
        ticker,
        impliedMovePct: f.impliedMovePct,
        expiry: im?.expiry ?? null,
        asOf: f.impliedMoveAsOf,
        basis: f.impliedMoveBasis,
        strike: f.impliedMovePct != null ? im!.strike : null,
        straddle: f.impliedMovePct != null ? im!.straddle : null,
        spot: im?.spot ?? null,
        source: im ? source : null,
        session: f.impliedMoveSession,
        reason: f.impliedMovePct != null ? null : reason,
    };
}

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

/** 종목별 (after, timing) 으로 예상 변동을 읽는다 — 결과는 요청 순서. 저장본이 없으면 값 없이 이유만(지어내지 않는다). */
export async function readImpliedMoveRows(requests: ImpliedMoveRequest[], today: string = etDateString()): Promise<ImpliedMoveRow[]> {
    const reqs = requests.map((r) => ({ ticker: String(r.ticker || '').toUpperCase(), after: r.after && ISO_DATE_RE.test(r.after) ? r.after : null, timing: r.timing ?? 'unknown' }));
    if (!reqs.length) return [];
    let structureVals: any[] = [];
    try {
        structureVals = await mgetFromCache<any>(reqs.flatMap((r) => [structureV2Key(r.ticker), structureLastGoodKey(`${r.ticker}:auto`)]));
    } catch {
        structureVals = [];
    }
    // 저장본 읽기를 기다리던 중 마감됐을 수도 있다.
    const floor = optionExpirationFloor();
    if (today < floor) today = floor;
    const results: ImpliedMoveRow[] = [];
    const needProbe: Array<{ idx: number; ticker: string; expiry: string; spot: number }> = [];
    reqs.forEach((r, i) => {
        const st = freshestStoredStructure(structureVals[2 * i], structureVals[2 * i + 1], today);
        if (!st) { results.push(impliedRowOf(r.ticker, null, null, 'no_snapshot')); return; }
        const weeklyIm: ImpliedMove | null = st.impliedMove?.def === IMPLIED_MOVE_DEF && impliedMoveFields(st.impliedMove).impliedMovePct != null ? st.impliedMove : null;
        const spot = Number(st.underlyingPrice);
        const exps: string[] = Array.isArray(st.availableExpirations) ? st.availableExpirations.filter((e: string) => e >= today) : [];
        const want = r.after ? firstExpiryAfterDate(exps, r.after, r.timing) : (typeof st.expiration === 'string' ? st.expiration : null);
        if (r.after && !want) { results.push(impliedRowOf(r.ticker, null, null, 'no_expiry_after')); return; }
        if (weeklyIm && weeklyIm.expiry === want) { results.push(impliedRowOf(r.ticker, weeklyIm, 'structure', null)); return; }
        if (!want || !(spot > 0) || (!r.after && !structureLacksImpliedMove(st))) { results.push(impliedRowOf(r.ticker, null, null, 'no_straddle')); return; }
        needProbe.push({ idx: i, ticker: r.ticker, expiry: want, spot });
        results.push(impliedRowOf(r.ticker, null, null, 'no_straddle'));
    });
    if (needProbe.length) {
        let probes: any[] = [];
        try {
            probes = await mgetFromCache<any>(needProbe.map((n) => `polygon:snapshot:probe:${n.ticker}`));
        } catch {
            probes = [];
        }
        needProbe.forEach((n, i) => {
            const pc = probes[i];
            const chain = Array.isArray(pc?.probeResults) ? pc.probeResults : [];
            const im = chain.length
                ? atmStraddleImpliedMove(chain, n.spot, {
                    expiry: n.expiry,
                    quotesLive: pc?.greeksSource === 'realtime',
                    quotesAt: Number(pc?._ts) || null,
                    chainDate: (n.expiry && pc?.chainDates?.[n.expiry]) || pc?.chainDate || null,
                })
                : null;
            results[n.idx] = impliedRowOf(n.ticker, im, 'probe', chain.length ? 'no_straddle' : 'no_snapshot');
        });
    }
    // 위 조회를 기다리는 사이 마감됐을 수 있다 — 먼저 채운 행도 응답 직전에 다시 검사한다(지난 만기 값은 내지 않는다).
    const end = Date.now();
    return results.map((row) => (row.expiry && isOptionExpiredAt(row.expiry, end) ? impliedRowOf(row.ticker, null, null, 'no_straddle') : row));
}
