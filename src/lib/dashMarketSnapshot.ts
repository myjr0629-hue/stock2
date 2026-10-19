import { normalizeQuoteSession, oneNumberBase, oneNumberFromQuote, oneNumberPct } from '../utils/calcPriceDisplay';
import { resolveIndexClose } from './indexCloseSnapshot';
import { WS_RECEIVE_IDLE_MS } from './priceAcceptance';

export interface SectorItem {
    name: string;
    pct: number | null;
    base?: number;
    riskPct?: number;
    sourceSessionDate: string | null;
    marketTime?: string | number | null;
    /** Trading day whose baseline is `base` (the prior regular close). Pre, regular and
     *  post of that day share it, so a newer tick of that day is measured against it. */
    baseDate?: string | null;
}

const SECTORS = [
    ['Tech', 'XLK'], ['Energy', 'XLE'], ['Cons. Disc', 'XLY'], ['Materials', 'XLB'],
    ['Industrials', 'XLI'], ['Finance', 'XLF'], ['Healthcare', 'XLV'], ['Utilities', 'XLU'],
];
const dated = (date: unknown): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const time = (value: unknown): number => typeof value === 'string' ? Date.parse(value) : finite(value) ? value : NaN;
const etDate = (ms: number): string => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(ms));

/** asOfMs = the response's own timestamp; it dates the pre-market day before its first print. */
export function buildSectorItems(quotes: Record<string, any>, session: string, previous: SectorItem[] = [],
    asOfMs?: number): SectorItem[] {
    return SECTORS.map(([name, symbol]) => {
        const quote = quotes[symbol];
        const sess = normalizeQuoteSession(String(quote?.session || session || ''));
        const one = oneNumberFromQuote(quote, sess);
        const ext = Boolean(one?.ext);
        const pct = ext ? one?.changePct : quote?.changePercent;
        const sourceSessionDate = ext ? quote?.extendedDate : quote?.sourceSessionDate;
        const marketTime = ext ? quote?.extendedTime : quote?.priceTime;
        const measured = !quote?.error && finite(ext ? one?.price : quote?.price)
            && (ext ? one!.price : quote.price) > 0 && finite(pct) && dated(sourceSessionDate);
        const last = previous.find(item => item.name === name);
        const validLast = last && finite(last.pct) && dated(last.sourceSessionDate);
        const older = validLast && (sourceSessionDate < last.sourceSessionDate!
            || (sourceSessionDate === last.sourceSessionDate && time(marketTime) < time(last.marketTime)));
        if (measured && !older) {
            const baseDate = sess === 'pre' ? (ext ? sourceSessionDate : finite(asOfMs) && asOfMs > 0 ? etDate(asOfMs) : null)
                : sess === 'reg' || sess === 'post' ? sourceSessionDate : null;
            return { name, pct, base: oneNumberBase(quote, sess), riskPct: pct,
                sourceSessionDate, marketTime, baseDate };
        }
        // Restore the entire dated observation. An unavailable response contributes
        // no new measurement to the existing risk-score calculation.
        return { name, pct: validLast ? last.pct : null, base: validLast ? last.base : undefined,
            sourceSessionDate: validLast ? last.sourceSessionDate : null,
            marketTime: validLast ? last.marketTime : null,
            baseDate: validLast && dated(last.baseDate) ? last.baseDate : null };
    });
}

export function buildIndexItems(indices: any, previous: any[] = []) {
    return [['DOW', 'dow'], ['NASDAQ', 'nasdaq'], ['S&P 500', 'spx']].map(([sym, key]) => {
        const old = previous.find(item => item.sym === sym);
        const quote = resolveIndexClose(indices?.[key], old && { ...old, price: old.px, changePct: old.chg });
        return { sym, px: quote?.price ?? 0, chg: quote?.changePct ?? null,
            noData: !quote, up: quote != null && quote.changePct >= 0, spark: [],
            marketTime: quote?.marketTime, updatedAt: quote?.updatedAt,
            ...(quote?.revision !== undefined ? { revision: quote.revision } : {}),
            sourceSessionDate: quote?.sourceSessionDate };
    });
}

/**
 * A newer socket tick of the baseline's trading day is a measurement (an equal price is 0%).
 * A tick without a source time, from another trading day, older than the quote, or without
 * a compatible baseline cannot replace the dated quote.
 */
export function sectorDisplayPct(sector: SectorItem, tick: { price: number; priceTime?: number; ts?: number; receivedAt?: number } | null | undefined,
    active: boolean, now = Date.now()): number | null {
    // 체결 «나이»로 거르지 않는다 — 시간외·정규장 15분 지연 체결도 서버가 본 것보다 새 체결이면 측정값이다(관문 10192243 P2: 10:30 에 받은 10:15 체결).
    //   대신 «받은 지» 10분 넘은 틱(앱이 뒤로 갔다 온 뒤 남은 틱)은 쓰지 않는다 — 공용 수신 상태 정책(priceAcceptance.WS_RECEIVE_IDLE_MS)
    const received = finite(tick?.receivedAt) && tick!.receivedAt! > 1e12 ? tick!.receivedAt! : finite(tick?.ts) && tick!.ts! > 1e12 ? tick!.ts! : null;
    if (!active || !tick || !finite(tick.price) || tick.price <= 0 || !finite(tick.priceTime)
        || tick.priceTime <= 0 || (received != null && now - received > WS_RECEIVE_IDLE_MS) || tick.priceTime > now + 5_000
        || !finite(sector.base) || sector.base <= 0 || !dated(sector.baseDate)) return sector.pct;
    if (etDate(tick.priceTime) !== sector.baseDate) return sector.pct;
    const seen = time(sector.marketTime);
    if (Number.isFinite(seen) && tick.priceTime < seen) return sector.pct;
    // Same baseline as the quote's one number (shared formula).
    return oneNumberPct(tick.price, sector.base) ?? sector.pct;
}
