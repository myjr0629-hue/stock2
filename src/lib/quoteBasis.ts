/** 정규장 값과 조회 시각을 구분하는 순수 함수. 시각은 ET 원천 날짜/체결 시각으로만 만든다. */
import { sessionCloseMinutes } from './marketCalendar';
const positive = (x: unknown): number | null => typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null;
export function regularReferencePrice(snapshot: any, closed: boolean): number | null {
    if (closed) return positive(snapshot?.day?.c);
    return positive(snapshot?.lastTrade?.p) ?? positive(snapshot?.min?.c) ?? positive(snapshot?.day?.c) ?? positive(snapshot?.prevDay?.c);
}
export function priceAsOfET(session: string, sourceDate: string | null, tradeMs: number | null, nowMs: number): string | null {
    if (session === 'CLOSED') {
        if (!sourceDate || !/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) return null;
        const [y, m, d] = sourceDate.split('-'); const minutes = sessionCloseMinutes(sourceDate);
        return `${m}/${d}/${y}, ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    }
    if (!(tradeMs != null && Number.isFinite(tradeMs) && tradeMs > 0 && tradeMs <= nowMs)) return null;
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(tradeMs);
}
