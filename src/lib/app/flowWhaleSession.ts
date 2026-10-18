import { etClock, etWallTimeToMs, isTradingDate, prevTradingDate } from '../marketSession';
import { sessionCloseMinutes } from '../marketCalendar';

export const WHALE_PREMIUM_FLOOR = 50_000;

/** 체결 시각(ms). 없거나 해석 불가면 NaN — 시각을 지어내지 않는다. */
function tradeTimeMs(tx: any): number {
    return typeof tx?.timestamp === 'number' && tx.timestamp > 0
        ? tx.timestamp / 1_000_000 : Date.parse(tx?.tradeDate || '');
}

/**
 * 원천이 «체결»을 실제로 관측했는가.
 * 체인 조회 성공(스캔 계약 수 > 0)은 증거가 아니다 — last_trade(체결 시각·가격·수량)가 하나라도 있어야 한다.
 *   ① 라우트가 센 debug.tradesObserved > 0, 또는
 *   ② 응답 항목 중 체결 시각·가격·수량이 모두 있는 것이 하나라도 있음(세션 필터 «전» — 전일 체결도 관측이다).
 */
function tradesObserved(data: any): boolean {
    const counted = data?.debug?.tradesObserved;
    if (typeof counted === 'number' && Number.isFinite(counted) && counted > 0) return true;
    return data.items.some((tx: any) => {
        const ms = tradeTimeMs(tx);
        return Number.isFinite(ms) && ms > 0 && Number(tx?.price) > 0 && Number(tx?.size) > 0;
    });
}

/** Select observed prints only. A chain scan is not a historical session archive. */
export function selectWhaleSession(data: any, session: string, nowMs = Date.now()): {
    items: any[]; meta: any; sessionDate: string | null;
} {
    const missing = { items: [], meta: null, sessionDate: null };
    if (data?.unavailable === true || !Array.isArray(data?.items)) return missing;
    const now = etClock(nowMs);
    const close = sessionCloseMinutes(now.date);
    const regular = session.toUpperCase() === 'REG' && isTradingDate(now.date)
        && now.minutes >= 570 && now.minutes < close;
    const target = regular || (isTradingDate(now.date) && now.minutes >= close)
        ? now.date : prevTradingDate(now.date);
    const openMs = etWallTimeToMs(target, 570);
    const closeMs = etWallTimeToMs(target, sessionCloseMinutes(target));
    const items = data.items.filter((tx: any) => {
        const type = String(tx?.type ?? tx?.optionType ?? '').toUpperCase();
        const premium = Number(tx?.premium);
        if ((type !== 'CALL' && type !== 'PUT') || !Number.isFinite(premium) || premium < WHALE_PREMIUM_FLOOR) return false;
        const ms = tradeTimeMs(tx);
        // Historical prints require their actual date and time; never invent either.
        if (!Number.isFinite(ms)) return regular;
        return ms >= openMs && ms <= Math.min(closeMs, nowMs);
    });
    // «관측된 0건» = 정규장 && 체결 데이터 관측됨 && «현재 세션 필터 후» 0건.
    // (필터 전 배열로 판정하면 전일 체결만 있는 정상 스캔이 «—»가 되고, 스캔 수로 판정하면 원천 결측이 «$0»이 된다)
    const observedZero = regular && items.length === 0 && tradesObserved(data);
    if (items.length === 0 && !observedZero) return missing;
    return { items, meta: data, sessionDate: regular ? null : target };
}
