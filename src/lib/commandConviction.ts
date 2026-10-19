import { netPremiumOf } from './premiumFlow';
import { normalizeVwap, vwapDistancePct } from './vwap';
import { compareSourceTime, isFailedSection, selectValue } from './metrics/observation';
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
    /** Inputs whose value was kept from the previous observation (missing or older incoming) — shown with their date. */
    carriedFields?: ConvictionField[];
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
    const carriedFields: ConvictionField[] = [];
    for (const key of Object.keys(incoming) as ConvictionField[]) {
        const prev = old ? { value: old.inputs[key], asOf: sourceDate(old.sourceDates[key]) } : null;
        const next = { value: incoming[key], asOf: sourceDate(dates[key]) };
        const picked = selectValue<unknown>(prev, next);
        inputs[key] = picked.value;
        sourceDates[key] = picked.asOf;
        // Same rule, made visible: the previous real value stood (incoming missing, or an older source time).
        if (prev && prev.value !== null && (next.value === null || (compareSourceTime(next.asOf, prev.asOf) ?? 0) < 0)) carriedFields.push(key);
    }
    return { ticker, inputs: inputs as ConvictionInputs, sourceDates, ssr: old?.ssr, carriedFields };
}

/** Read raw web payloads, bypassing UI states that manufacture NONE/zero defaults. */
export function webConvictionSnapshot(ticker: string, data: {
    unified?: any; quote?: any; stock?: any; price?: unknown; priceDate?: unknown; news?: any;
}, previous?: ConvictionSnapshot, options: { seedStock?: boolean } = {}): ConvictionSnapshot {
    const matches = (value: any) => value && (!value.ticker || value.ticker.toUpperCase() === ticker.toUpperCase())
        && (!value.symbol || value.symbol.toUpperCase() === ticker.toUpperCase());
    // A failed/unavailable unified poll is not an observation (shared rule 1).
    const u = matches(data.unified) && !isCommandResponseUnavailable(data.unified) ? data.unified : null;
    const q = matches(data.quote) ? data.quote : null;
    const s = matches(data.stock) ? data.stock : null;
    // The SSR stock payload is an observation once (webConvictionState folds it); a live poll
    // never re-observes it — otherwise SSR VWAP 98 → live 102 → live missing would revert to 98.
    const seed = options.seedStock === false ? previous : retainConvictionInputs(ticker, { price: s?.price, vwap: s?.vwap }, {
        price: s?.freshness?.asOfISO,
        vwap: s?.vwapDate,
    }, previous);
    // Shared rule 1 per section: a PENDING / invalid / errored structure, sma or flow does not vote.
    const st = isFailedSection(u?.structure) ? null : u?.structure;
    const sm = isFailedSection(u?.sma) ? null : u?.sma;
    const fl = isFailedSection(q?.flow) ? null : q?.flow;
    return retainConvictionInputs(ticker, {
        cross: sm?.cross,
        price: s || q || u ? data.price : null,
        vwap: q?.vwap,
        pcr: st?.pcRatio,
        gex: st?.netGex,
        flow: fl,
        news: data.news?.score,
    }, {
        cross: sm?.date ?? sm?.sourceDate ?? sm?.asOf,
        price: data.priceDate ?? (data.price === s?.price ? s?.freshness?.asOfISO : null),
        vwap: q?.vwapDate,
        pcr: editionDate(st),
        gex: editionDate(st),
        netPremium: fl?.dataFreshness?.premiumDate ?? fl?.dataFreshness?.chainDate,
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
    return { ...webConvictionSnapshot(ticker, live, base, { seedStock: false }), ssr: ssrKey };
}

/** The structure edition's source time — same priority as the volatility edition (chainDate, asOf, levelsAsOf). */
const editionDate = (st: any): unknown => st?.chainDate ?? st?.asOf ?? st?.levelsAsOf ?? null;

/** The oldest source date among carried inputs (what the card should show next to a carried score). */
export function carriedConvictionDate(snapshot: ConvictionSnapshot | null | undefined): string | null {
    const dates = (snapshot?.carriedFields ?? []).map(k => snapshot!.sourceDates[k]).filter((d): d is string => !!d);
    return dates.length ? dates.reduce((a, b) => (compareSourceTime(a, b) ?? 0) <= 0 ? a : b) : null;
}

/** App/adapter raw inputs from one unified payload + quote. Failed sections (rule 1) never vote. */
export function commandConvictionRaw(unified: any, price: unknown, vwap: unknown, flow: unknown,
    sourceDates: { price?: unknown; vwap?: unknown } = {}): { raw: ConvictionRawInputs; dates: Partial<Record<ConvictionField, unknown>> } {
    const u = isCommandResponseUnavailable(unified) ? null : unified;
    const st = isFailedSection(u?.structure) ? null : u?.structure;
    const sm = isFailedSection(u?.sma) ? null : u?.sma;
    const fl = isFailedSection(flow) ? null : flow as any;
    return {
        raw: { cross: sm?.cross, price, vwap, pcr: st?.pcRatio, gex: st?.netGex, flow: fl },
        dates: { cross: sm?.date ?? sm?.sourceDate ?? sm?.asOf, pcr: editionDate(st), gex: editionDate(st),
            price: sourceDates.price, vwap: sourceDates.vwap,
            netPremium: fl?.dataFreshness?.premiumDate ?? fl?.dataFreshness?.chainDate },
    };
}
