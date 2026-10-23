import { shownRegularSessionDate, cashSessionPhaseAt } from './marketCalendar';
import { normalizeVwap, sessionVwapFromBars } from './vwap';

const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const positive = (v: unknown) => { const n = num(v); return n !== null && n > 0 ? n : null; };

/** Alpha momentum always describes the displayed regular session, never POST/PRE returns.
 * The ticker's top-level changePct is a fraction; only its regular prices/percent field qualify.
 */
export function alphaRegularQuote(quote: any, now = Date.now()) {
    const date = shownRegularSessionDate(now);
    if (quote?.prices?.regularDate !== date) return null;
    const live = cashSessionPhaseAt(now) === 'regular' && quote?.session === 'REG';
    if (live && (!(quote.tsServer > 0) || quote.tsServer > now || now - quote.tsServer > 15 * 60000)) return null;
    const price = live ? positive(quote.display?.price) : positive(quote.prices.regularCloseToday);
    const prevClose = positive(quote.prices.prevRegularClose);
    if (price === null || prevClose === null) return null;
    return { price, prevClose, changePct: (price - prevClose) / prevClose * 100, sessionDate: date };
}

/** Existing minute caches only. A different session's VWAP cannot fill this session. */
export function alphaSessionVwap(quote: any, chart: any, minutes: any, now = Date.now()): number | null {
    const date = shownRegularSessionDate(now);
    const direct = quote?.vwapDate === date ? normalizeVwap(quote.vwap) : null;
    if (direct !== null) return direct;
    const from = (rows: any) => sessionVwapFromBars(Array.isArray(rows) ? rows.filter(r => r?.etDate === date) : null);
    const cv = from(Array.isArray(chart) ? chart : chart?.data);
    const mv = from(minutes?.data);
    return (mv && (!cv || Number(minutes?._builtAt) > Number(chart?._builtAt)) ? mv : cv)?.vwap ?? null;
}

/** Use an actual index/ETF observation. NQ=F is not an NDX cash return. */
export function alphaMacroInputs(macro: any, vix: any, vix3m: any) {
    const ndx = macro?.factors?.nasdaq100;
    const cash = ['I:NDX', '^NDX', 'NDX', 'QQQ'].includes(ndx?.symbolUsed);
    return {
        ndxChangePct: cash ? num(ndx.chgPct) : null,
        vixValue: num(vix?.price) ?? num(macro?.vix),
        vixChangePct: num(vix?.changePct) ?? num(macro?.factors?.vix?.chgPct),
        vix3mValue: num(vix3m?.price),
        tltChangePct: num(macro?.tltChangePct), gldChangePct: num(macro?.gldChangePct),
        dxy: num(macro?.dxy), realYieldStance: macro?.realYield?.stance ?? null,
    };
}
