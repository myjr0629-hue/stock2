import { CASH_CLOSE_OBSERVATION_MAX_AGE_MS, closerCashCloseReference, futuresCashCloseCandidate, futuresCashCloseKey, FUTURES_CASH_CLOSE_TTL,
    validFuturesCashCloseReference, type FuturesCashCloseReference } from '@/lib/futuresCashClose';
import type { IndexQuoteInput } from '@/lib/marketIndexBasis';
import { readEachStoreStrict, setFuturesCashCloseIfCloser } from './redisClient';
import { etWallTimeToMs } from '@/lib/marketSession';
import { sessionCloseMinutes } from '@/lib/marketCalendar';

/** market-feed 기존 관측만 저장한다. 조회 경로에서는 호출하지 않는다. */
export async function captureFuturesCashClose(quote: IndexQuoteInput, nowMs = Date.now(),
    verifyRead?: (key: string) => Promise<{ ok: boolean; value: unknown }>): Promise<boolean> {
    const candidate = futuresCashCloseCandidate(quote, nowMs);
    if (!candidate) return true;
    const key = futuresCashCloseKey(candidate.symbol, candidate.sessionDate);
    const closeAt = new Date(etWallTimeToMs(candidate.sessionDate, sessionCloseMinutes(candidate.sessionDate))).toISOString();
    if (!await setFuturesCashCloseIfCloser(key, candidate, closeAt, FUTURES_CASH_CLOSE_TTL)) return false;
    if (!verifyRead) return true;
    const back = await verifyRead(key).catch(() => ({ ok: false, value: null }));
    const value = back.value as FuturesCashCloseReference | null;
    // 다른 수집자가 더 좋은 기준을 저장했어도 성공이다. 같은 체결은 최초 가격을 유지한다.
    return back.ok && validFuturesCashCloseReference(value, candidate.symbol, candidate.sessionDate)
        && closerCashCloseReference(value, candidate) === value;
}

// 마감 20분 뒤에는 후보 관측(체결 마감 ±1분대·관측 나이 15분 이내 — 야후 선물 10분 지연)이 더 생길 수 없다(쓰기 지연 여유 포함)
// → 그 뒤 고른 기준은 인스턴스 메모리에 둔다.
const SETTLE_AFTER_CLOSE_MS = 2 * 60_000 + CASH_CLOSE_OBSERVATION_MAX_AGE_MS + 3 * 60_000;
const settledRefs = new Map<string, FuturesCashCloseReference>();
export function _resetSettledCashCloseRefsForTest(): void { settledRefs.clear(); }

/**
 * 두 저장소(EC2·Upstash)를 모두 읽어 마감에 더 가까운 실제 관측을 고른다.
 * EC2 장애 동안 Upstash 에만 더 가까운 기준이 저장됐다가 EC2 가 복구돼도 EC2 의 덜 정확한 값을 쓰지 않는다.
 */
export async function loadFuturesCashCloseReference(symbol: 'NQ=F' | 'ES=F', date: string, nowMs = Date.now(),
    readEach: typeof readEachStoreStrict = readEachStoreStrict): Promise<FuturesCashCloseReference | null> {
    const key = futuresCashCloseKey(symbol, date);
    const memo = settledRefs.get(key);
    if (memo) return memo;
    const none = { ok: false, values: [null] };
    const both = await readEach<FuturesCashCloseReference>([key]).catch(() => ({ ec: none, upstash: none }));
    const a = both.ec.ok ? both.ec.values[0] : null;
    const b = both.upstash.ok ? both.upstash.values[0] : null;
    let best: FuturesCashCloseReference | null = null;
    for (const v of [a, b]) {
        if (validFuturesCashCloseReference(v, symbol, date)) best = best ? closerCashCloseReference(best, v) : v;
    }
    const settledAt = etWallTimeToMs(date, sessionCloseMinutes(date)) + SETTLE_AFTER_CLOSE_MS;
    // 두 저장소가 «각각» 정상 응답했고 같은 기준일 때만 고정한다(폴백으로 같은 저장소를 두 번 읽은 결과는 합의가 아니다).
    // 한쪽 읽기 실패·결측·불일치면 고정하지 않고 다음 조회에서 다시 읽는다.
    const agreed = both.ec.ok && both.upstash.ok && validFuturesCashCloseReference(a, symbol, date)
        && validFuturesCashCloseReference(b, symbol, date) && a.asOf === b.asOf && a.price === b.price;
    if (best && agreed && nowMs >= settledAt) {
        if (settledRefs.size > 64) settledRefs.clear();
        settledRefs.set(key, best);
    }
    return best;
}
