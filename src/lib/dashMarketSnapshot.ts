import { normalizeQuoteSession, oneNumberBase, oneNumberFromQuote } from '../utils/calcPriceDisplay';
import { resolveIndexClose } from './indexCloseSnapshot';

export interface SectorItem {
    name: string;
    pct: number | null;
    base?: number;
    riskPct?: number;
    sourceSessionDate: string | null;
    marketTime?: string | number | null;
}

const SECTORS = [
    ['Tech', 'XLK'], ['Energy', 'XLE'], ['Cons. Disc', 'XLY'], ['Materials', 'XLB'],
    ['Industrials', 'XLI'], ['Finance', 'XLF'], ['Healthcare', 'XLV'], ['Utilities', 'XLU'],
];
const dated = (date: unknown): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const time = (value: unknown): number => typeof value === 'string' ? Date.parse(value) : finite(value) ? value : NaN;

export function buildSectorItems(quotes: Record<string, any>, session: string, previous: SectorItem[] = []): SectorItem[] {
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
            return { name, pct, base: oneNumberBase(quote, sess), riskPct: pct,
                sourceSessionDate, marketTime };
        }
        // Restore the entire dated observation. An unavailable response contributes
        // no new measurement to the existing risk-score calculation.
        return { name, pct: validLast ? last.pct : null, base: validLast ? last.base : undefined,
            sourceSessionDate: validLast ? last.sourceSessionDate : null,
            marketTime: validLast ? last.marketTime : null };
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

/** A tick without a source time or a compatible baseline cannot replace a dated quote. */
export function sectorDisplayPct(sector: SectorItem, tick: { price: number; priceTime?: number } | null | undefined,
    active: boolean, now = Date.now()): number | null {
    if (!active || !tick || !finite(tick.price) || tick.price <= 0 || !finite(tick.priceTime)
        || tick.priceTime <= 0 || now - tick.priceTime > 60_000 || tick.priceTime > now + 5_000
        || !finite(sector.base) || sector.base <= 0) return sector.pct;
    const date = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(tick.priceTime));
    return date === sector.sourceSessionDate ? (tick.price - sector.base) / sector.base * 100 : sector.pct;
}
