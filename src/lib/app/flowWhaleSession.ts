import { etClock, etWallTimeToMs, isTradingDate, prevTradingDate } from '../marketSession';
import { sessionCloseMinutes } from '../marketCalendar';

export const WHALE_PREMIUM_FLOOR = 50_000;

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
        const ms = typeof tx.timestamp === 'number' && tx.timestamp > 0
            ? tx.timestamp / 1_000_000 : Date.parse(tx.tradeDate || '');
        // Historical prints require their actual date and time; never invent either.
        if (!Number.isFinite(ms)) return regular;
        return ms >= openMs && ms <= Math.min(closeMs, nowMs);
    });
    const scanned = data.debug?.totalContractsScanned;
    const observedZero = regular && data.items.length === 0
        && typeof scanned === 'number' && Number.isFinite(scanned) && scanned > 0;
    if (items.length === 0 && !observedZero) return missing;
    return { items, meta: data, sessionDate: regular ? null : target };
}
