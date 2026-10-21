// Intel 결측 보충: 저장본만 읽는다. 공급사 호출·캐시 쓰기는 추가하지 않는다.
import { mgetFromCache } from '@/services/redisClient';
import { etTradingDateOf, shownRegularSessionDate, etDateOf, cashSessionPhaseAt } from '@/lib/marketCalendar';
import { regularReferencePrice } from '@/lib/quoteBasis';
import { readImpliedMoveFields, impliedMoveFields, type ImpliedMoveFields } from '@/lib/impliedMove';
import { peekStoredStructure, impliedMoveOfStructure } from '@/services/impliedMoveService';
import { withinImpliedDeadline } from '@/lib/earnings/impliedDeadline';

/** 작성자가 쓰는 full → nochain → 옛 v2 순서. 점수는 같은 거래일의 실측만. */
export async function readIntelTickerCache(ticker: string): Promise<any | null> {
    const T = ticker.toUpperCase();
    const rows = await mgetFromCache<any>([
        `flow:ticker:v6:${T}`, `flow:ticker:nochain:v6:${T}`, `flow:ticker:v2:${T}`,
    ]).catch(() => []);
    const base = rows.find(Boolean);
    if (!base) return null;
    const day = etTradingDateOf();
    const scored = rows.find(row => {
        const score = row?.alpha?.score;
        const at = row?.alpha?.calculatedAt ? Date.parse(row.alpha.calculatedAt) : Number(row?.tsServer);
        return typeof score === 'number' && Number.isFinite(score)
            && Number.isFinite(at) && at > 0 && at <= Date.now() && etTradingDateOf(at) === day;
    });
    return { ...base, alpha: scored?.alpha ?? null };
}

/**
 * 분석 캐시의 생존 여부와 무관하게 결측 종목을 보충한다. 분석 행을 만들거나 timestamp를 갱신하지 않는다.
 * 기존 유효값은 그대로, 새 보충은 표시 정규장과 같은 세션·같은 ATM 정의만. 전체 700ms 상한.
 */
export async function readIntelImpliedMoves(tickers: string[], analysis: Record<string, any>, snapshots: Record<string, any> = {}): Promise<Record<string, ImpliedMoveFields>> {
    const result: Record<string, ImpliedMoveFields> = {};
    const need = tickers.filter(t => {
        const f = readImpliedMoveFields(analysis[t]);
        if (f.impliedMovePct == null) return true;
        result[t] = f;
        return false;
    });
    if (!need.length) return result;
    const deadline = Date.now() + 700;
    const now = Date.now();
    const session = shownRegularSessionDate(now);
    const closed = cashSessionPhaseAt(now) !== 'regular';
    // 현재 체결·분봉은 원천 시각, 일봉 종가는 공급사의 정규장 날짜로 확인한다.
    // 조회 시각(updated)이나 옵션 chainDate는 현물 가격의 세션 근거가 아니다.
    const sameSession = (ms: number) => Number.isFinite(ms) && ms > 0 && ms <= now && etDateOf(ms) === session
        && (closed || cashSessionPhaseAt(ms) === 'regular');
    // 작업이 늦게 끝나도 반환된 맵을 뒤늦게 바꾸지 않는다.
    const fills: Record<string, ImpliedMoveFields> = {};
    const work = Promise.all(need.map(async t => {
        try {
            const st = await peekStoredStructure(t);
            if (Date.now() >= deadline) return;
            const sn = snapshots[t];
            const spot = regularReferencePrice({
                lastTrade: sameSession(Number(sn?.lastTrade?.t) / 1e6) ? sn.lastTrade : null,
                min: sameSession(Number(sn?.min?.t)) ? sn.min : null,
                day: sn?._intrinio?.regularDate === session ? sn.day : null,
            }, closed);
            const im = await impliedMoveOfStructure(t, st, spot, { retryNull: true, referenceSession: session });
            const f = impliedMoveFields(im);
            if (Date.now() < deadline && f.impliedMovePct != null && f.impliedMoveSession === session) fills[t] = f;
        } catch { /* 이 종목 보충 실패는 다른 종목의 정상값을 지우지 않는다. */ }
    }));
    try { await withinImpliedDeadline(() => work, deadline); } catch { /* 완료된 종목만 반환 */ }
    return { ...result, ...fills };
}
