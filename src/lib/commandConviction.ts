import { netPremiumOf } from './premiumFlow';
import { normalizeVwap, vwapDistancePct } from './vwap';
import { selectValue } from './metrics/observation';
import { isCommandResponseUnavailable } from './commandVolatilityObservation';

const finite = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
const positive = (value: unknown): number | null => {
    const n = finite(value);
    return n !== null && n > 0 ? n : null;
};

export interface ConvictionRawInputs {
    cross?: unknown;
    price?: unknown;
    vwap?: unknown;
    pcr?: unknown;
    gex?: unknown;
    flow?: unknown;
    news?: unknown;
}

/** Explicit NONE and measured numeric zeros are observations; absent/invalid inputs are not. */
export function convictionInputsOf(raw: ConvictionRawInputs) {
    const pcr = finite(raw.pcr);
    const news = finite(raw.news);
    return {
        cross: raw.cross === 'GOLDEN' || raw.cross === 'DEAD' || raw.cross === 'NONE' ? raw.cross : null,
        price: positive(raw.price),
        vwap: normalizeVwap(raw.vwap),
        pcr: pcr !== null && pcr >= 0 ? pcr : null,
        gex: finite(raw.gex),
        netPremium: netPremiumOf(raw.flow),
        news: news !== null && news >= 0 && news <= 100 ? news : null,
    };
}
export type ConvictionInputs = ReturnType<typeof convictionInputsOf>;
export type ConvictionField = keyof ConvictionInputs;

/** App and web share the N4 observation gate, weights, thresholds and translation keys. */
export function scoreCommandConviction(input: ConvictionInputs) {
    const votes: number[] = [];
    if (input.cross !== null) votes.push(input.cross === 'GOLDEN' ? 15 : input.cross === 'DEAD' ? -15 : 0);
    const distance = vwapDistancePct(input.price, input.vwap);
    if (distance !== null) votes.push(distance > 1 ? 8 : distance < -1 ? -8 : 0);
    if (input.pcr !== null) votes.push(input.pcr > 0 && input.pcr < 0.7 ? 7 : input.pcr > 1.2 ? -7 : 0);
    if (input.gex !== null) votes.push(input.gex > 0 ? 5 : input.gex < 0 ? -5 : 0);
    if (input.netPremium !== null) votes.push(input.netPremium > 500000 ? 5 : input.netPremium < -500000 ? -5 : 0);
    // Web's existing news contribution; the app does not supply this optional input.
    if (input.news !== null) votes.push(input.news >= 70 ? 10 : input.news < 40 ? -10 : 0);
    if (!votes.length) return null;
    const score = Math.max(0, Math.min(100, 50 + votes.reduce((sum, value) => sum + value, 0)));
    const [labelKey, grade]: [
        'convStrong' | 'convBullish' | 'convSlightUp' | 'convNeutral' | 'convSlightDown' | 'convBearish' | 'convStrongDown', string,
    ] = score >= 80 ? ['convStrong', 'A']
        : score >= 65 ? ['convBullish', 'B+']
        : score >= 55 ? ['convSlightUp', 'B']
        : score >= 45 ? ['convNeutral', 'C']
        : score >= 35 ? ['convSlightDown', 'D']
        : score >= 20 ? ['convBearish', 'D-'] : ['convStrongDown', 'F'];
    return { score, labelKey, grade };
}

export interface ConvictionSnapshot {
    ticker: string;
    inputs: ConvictionInputs;
    sourceDates: Record<ConvictionField, string | null>;
    /** SSR payloads already folded in. A payload is an observation once — when it arrives —
     *  so re-rendering never re-applies an older SSR over a newer live observation. */
    ssr?: readonly unknown[];
}

// Source dates only: never substitute a response/cache refresh time or Date.now().
function sourceDate(value: unknown): string | null {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return null;
    return Number.isFinite(Date.parse(value)) ? value : null;
}

/**
 * Per-input form of the shared selection rule (lib/metrics/observation.ts selectValue):
 * the newer SOURCE time wins; unknown/equal times fall back to arrival order (incoming);
 * a missing value keeps the previous real value with its own source date; measured 0 is a value.
 * Missing values never lend their date to a fallback observation.
 */
export function retainConvictionInputs(ticker: string, raw: ConvictionRawInputs,
    dates: Partial<Record<ConvictionField, unknown>>, previous?: ConvictionSnapshot): ConvictionSnapshot {
    const incoming = convictionInputsOf(raw);
    const old = previous?.ticker === ticker ? previous : undefined;
    const inputs = {} as Record<ConvictionField, unknown>;
    const sourceDates = {} as ConvictionSnapshot['sourceDates'];
    for (const key of Object.keys(incoming) as ConvictionField[]) {
        const picked = selectValue<unknown>(
            old ? { value: old.inputs[key], asOf: sourceDate(old.sourceDates[key]) } : null,
            { value: incoming[key], asOf: sourceDate(dates[key]) },
        );
        inputs[key] = picked.value;
        sourceDates[key] = picked.asOf;
    }
    return { ticker, inputs: inputs as ConvictionInputs, sourceDates, ssr: old?.ssr };
}

/** Read raw web payloads, bypassing UI states that manufacture NONE/zero defaults. */
export function webConvictionSnapshot(ticker: string, data: {
    unified?: any; quote?: any; stock?: any; price?: unknown; priceDate?: unknown; news?: any;
}, previous?: ConvictionSnapshot): ConvictionSnapshot {
    const matches = (value: any) => value && (!value.ticker || value.ticker.toUpperCase() === ticker.toUpperCase())
        && (!value.symbol || value.symbol.toUpperCase() === ticker.toUpperCase());
    // A failed/unavailable unified poll is not an observation (shared rule 1).
    const u = matches(data.unified) && !isCommandResponseUnavailable(data.unified) ? data.unified : null;
    const q = matches(data.quote) ? data.quote : null;
    const s = matches(data.stock) ? data.stock : null;
    const seed = retainConvictionInputs(ticker, { price: s?.price, vwap: s?.vwap }, {
        price: s?.freshness?.asOfISO,
        vwap: s?.vwapDate,
    }, previous);
    return retainConvictionInputs(ticker, {
        cross: u?.sma?.cross,
        price: s || q || u ? data.price : null,
        vwap: q?.vwap,
        pcr: u?.structure?.pcRatio,
        gex: u?.structure?.netGex,
        flow: q?.flow,
        news: data.news?.score,
    }, {
        cross: u?.sma?.date ?? u?.sma?.sourceDate,
        price: data.priceDate ?? (data.price === s?.price ? s?.freshness?.asOfISO : null),
        vwap: q?.vwapDate,
        pcr: u?.structure?.chainDate,
        gex: u?.structure?.chainDate,
        netPremium: q?.flow?.dataFreshness?.premiumDate ?? q?.flow?.dataFreshness?.chainDate,
        news: data.news?.date,
    }, seed);
}

/** Web Command state: fold the SSR payload once per payload (at arrival), then the live poll.
 *  A new SSR (revisit) is a new observation and competes by source time; the same SSR re-rendered is not. */
export function webConvictionState(ticker: string,
    ssr: { unified?: any; stock?: any },
    live: { unified?: any; quote?: any; stock?: any; price?: unknown; news?: any },
    previous?: ConvictionSnapshot): ConvictionSnapshot {
    const old = previous?.ticker === ticker ? previous : undefined;
    const ssrKey = [ssr.unified ?? null, ssr.stock ?? null] as const;
    const folded = old?.ssr && old.ssr[0] === ssrKey[0] && old.ssr[1] === ssrKey[1];
    const base = folded ? old : webConvictionSnapshot(ticker, { unified: ssr.unified, stock: ssr.stock, price: ssr.stock?.price }, old);
    return { ...webConvictionSnapshot(ticker, live, base), ssr: ssrKey };
}
