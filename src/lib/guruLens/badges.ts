import { cusipForTicker, isPartialIndex, latestCompletedPeriod } from '../holders13f';
import { etDateOf, optionExpiryJudge } from '../marketCalendar';
import { applyConfirmedEarnings } from '../earningsConfirmed';
import { earningsCountdown } from '../earningsDate';
import type { ImpliedMoveRequest, ImpliedMoveRow } from '../../services/impliedMoveService';
import { LensId } from './types';
import { num } from './rules';

type Holder = {
    cik: string;
    name?: string;
    shares: number;
    marketValue: number;
    period?: string;
    filingDate?: string | null;
};
export interface HoldingIndex {
    holders: Holder[];
    totalHolders?: number;
    period?: string;
    source?: string;
    universeFilers?: number;
}
const fundCik: Partial<Record<LensId, string>> = {
    moat_compounder: '1067983',
    wonderful_fair: '783412',
    roc_ey: '1510387',
    low_psr_momentum: '1423442',
    quality_multifactor: '1167557',
};
export const holdingKey = (ticker: string) => {
    const c = cusipForTicker(ticker);
    return c ? `cache:13f:cusip:${c}` : null;
};
export const insiderKey = (ticker: string) =>
    `intrinio:resp:v1:companies/${ticker}/insider_transaction_filings::${JSON.stringify({ page_size: '30' })}`;
/** Index rank is NOT portfolio weight rank. The existing top-60 index cannot supply portfolio weights. */
export function holdingBadge(id: LensId, index: HoldingIndex | null, now = new Date()) {
    const cik = fundCik[id];
    if (!cik)
        return {
            state: 'not_applicable',
            held: null,
            period: null,
            filingDate: null,
            portfolioRank: null,
            weightPct: null,
        };
    const holder = index?.holders?.find((h) => String(Number(h.cik)) === cik && h.shares > 0);
    const period = holder?.period ?? index?.period ?? null;
    const partial = index ? isPartialIndex(index) : true;
    const complete =
        !!index && !partial && num(index.totalHolders) && index.totalHolders === index.holders.length;
    return {
        state: holder && period ? 'held' : complete && period ? 'not_held' : 'unknown',
        held: holder && period ? true : complete && period ? false : null,
        fundCik: cik,
        fund: holder?.name ?? null,
        period,
        filingDate: holder?.filingDate ?? null,
        shares: holder?.shares ?? null,
        marketValue: holder?.marketValue ?? null,
        portfolioRank: null,
        weightPct: null,
        partial,
        truncated: !!index && (index.totalHolders ?? Infinity) > index.holders.length,
        stale: !!period && period < latestCompletedPeriod(now),
    };
}
export interface OptionRow {
    callVol?: number;
    putVol?: number;
    top?: Array<{ t: 'C' | 'P'; d: number | null; e: string }>;
    date?: string;
}
export interface InsiderRaw {
    transaction_filings?: Array<{
        filing_date?: string;
        transactions?: Array<{
            transaction_type_code?: string;
            transaction_date?: string;
            amount_of_shares?: number;
            transaction_price?: number;
            derivative_transaction?: boolean;
        }>;
    }>;
}
export function insiderNet(raw: InsiderRaw | null, now: number) {
    if (!Array.isArray(raw?.transaction_filings)) return null;
    const until = etDateOf(now),
        since = etDateOf(now - 30 * 86400_000);
    let net = 0,
        buy = 0,
        sell = 0;
    for (const f of raw.transaction_filings)
        for (const t of f.transactions ?? []) {
            // Use actual transaction date; filing date alone cannot prove a trade belongs to the 30d window.
            const d = t.transaction_date,
                code = t.transaction_type_code;
            if (!d || d < since || d > until || t.derivative_transaction || !['P', 'S'].includes(code ?? ''))
                continue;
            if (!num(t.amount_of_shares) || !num(t.transaction_price)) return null;
            const value = t.amount_of_shares * t.transaction_price;
            if (code === 'P') {
                net += value;
                buy++;
            } else {
                net -= value;
                sell++;
            }
        }
    return { net30d: net, buyCount: buy, sellCount: sell, from: since, through: until };
}
export interface DarkPool {
    date: string | null;
    regime: string | null;
    stealth: number | null;
}
export function moneyBadge(
    dp: DarkPool | null,
    options: OptionRow | null,
    optionDate: string | null,
    insider: ReturnType<typeof insiderNet>,
    now = Date.now(),
) {
    const today = etDateOf(now);
    const fresh = (d: string | null) =>
        !!d && d <= today && Date.parse(today) - Date.parse(d) <= 7 * 86400_000;
    const expired = optionExpiryJudge(now);
    const large = (options?.top ?? []).filter((c) => num(c.d) && c.d >= 5000 && !expired(c.e));
    const calls = large.filter((c) => c.t === 'C').length,
        puts = large.filter((c) => c.t === 'P').length;
    const cp =
        num(options?.callVol) && num(options?.putVol) && options!.putVol! > 0
            ? options!.callVol! / options!.putVol!
            : null;
    const signals = [
        {
            id: 'dark_pool',
            on:
                dp && (dp.regime !== null || num(dp.stealth))
                    ? dp.regime === 'ACCUMULATION' || (num(dp.stealth) && dp.stealth >= 70)
                    : null,
            date: dp?.date ?? null,
            values: dp,
        },
        {
            id: 'call_dominance',
            on: num(cp) ? cp >= 1.5 : null,
            date: optionDate,
            values: { callPutVolumeRatio: cp },
        },
        {
            id: 'new_call_oi',
            on: options && Array.isArray(options.top) ? calls > 0 && calls > puts : null,
            date: optionDate,
            values: { calls, puts, minimumOiChange: 5000, proxy: true, scope: 'stored_top_contracts' },
        },
        {
            id: 'insider_net_buy',
            on: insider ? insider.net30d > 0 : null,
            date: insider?.through ?? null,
            values: insider,
        },
    ];
    // The two EOD sources must share an observation date before counting them together.
    const date = fresh(optionDate) ? optionDate : fresh(dp?.date ?? null) ? dp!.date : null;
    const counted = signals.filter(
        (s) => s.on === true && (s.id === 'insider_net_buy' || (s.date === date && fresh(s.date))),
    );
    return {
        count: counted.length,
        overlap: counted.length >= 2,
        asOf: date,
        signals,
        attribution: 'Data source: FINRA',
        meaning: '관측 신호의 겹침; 매수 주체·의도 확정 아님',
    };
}
export interface BadgeDependencies {
    read<T>(key: string): Promise<T | null>;
    darkPool(tickers: string[]): Promise<Record<string, DarkPool>>;
    implied(reqs: ImpliedMoveRequest[]): Promise<ImpliedMoveRow[]>;
}
/** Pure cache reads. Returns data once per ticker; lens-specific holdings are added by the caller. */
export async function readBadges(tickers: string[], deps: BadgeDependencies, now = Date.now()) {
    const today = etDateOf(now);
    const [options, calendar, dp] = await Promise.all([
        deps.read<{ date: string; tickers: Record<string, OptionRow>; stale?: Record<string, OptionRow> }>(
            'intrinio:options:eod',
        ),
        deps.read<{ rows: Array<{ ticker: string; date: string; hour?: string; dateStatus?: string }> }>(
            'market:earnings-calendar:v4',
        ),
        deps.darkPool(tickers),
    ]);
    const events = applyConfirmedEarnings(
        (calendar?.rows ?? []).map((row) => ({ ...row, hour: row.hour ?? '' })),
        today,
        { universe: new Set(tickers) },
    ).rows;
    const out: Record<
        string,
        {
            holdingIndex: HoldingIndex | null;
            money: ReturnType<typeof moneyBadge>;
            earnings: {
                date: string | null;
                days: number | null;
                dLabel: string | null;
                timing: string | null;
                dateStatus: string | null;
                impliedMove: ImpliedMoveRow | null;
                reason: string | null;
            };
        }
    > = {};
    const requests: ImpliedMoveRequest[] = [];
    // Bound cache concurrency rather than opening hundreds of Redis requests simultaneously.
    for (let i = 0; i < tickers.length; i += 10)
        await Promise.all(
            tickers.slice(i, i + 10).map(async (ticker) => {
                const key = holdingKey(ticker);
                const [holdingIndex, insider] = await Promise.all([
                    key ? deps.read<HoldingIndex>(key) : Promise.resolve(null),
                    deps.read<InsiderRaw>(insiderKey(ticker)),
                ]);
                const stale = options?.stale?.[ticker],
                    option = options?.tickers?.[ticker] ?? stale ?? null;
                const optionDate = options?.tickers?.[ticker] ? options.date : (stale?.date ?? null);
                const event = events
                    .filter((e) => e.ticker === ticker && e.date >= today)
                    .sort((a, b) => a.date.localeCompare(b.date))[0];
                const countdown = event ? earningsCountdown(event.date, now) : null;
                const days = countdown?.daysUntilEarnings ?? null;
                out[ticker] = {
                    holdingIndex,
                    money: moneyBadge(dp[ticker] ?? null, option, optionDate, insiderNet(insider, now), now),
                    earnings: {
                        date: event?.date ?? null,
                        days,
                        dLabel: countdown?.daysLabel ?? null,
                        timing: event?.hour ?? null,
                        dateStatus: event?.dateStatus ?? null,
                        impliedMove: null,
                        reason: event ? 'outside_35_day_window' : 'no_earnings_cache',
                    },
                };
                if (event && days !== null && days >= 0 && days <= 35) {
                    const timing = ['amc', 'bmo', 'dmh'].includes(event.hour ?? '')
                        ? (event.hour as 'amc' | 'bmo' | 'dmh')
                        : 'unknown';
                    requests.push({ ticker, after: event.date, timing });
                    out[ticker].earnings.reason = 'no_snapshot';
                }
            }),
        );
    for (let i = 0; i < requests.length; i += 10)
        for (const row of await deps.implied(requests.slice(i, i + 10))) {
            out[row.ticker].earnings.impliedMove = row;
            out[row.ticker].earnings.reason = row.reason;
        }
    return out;
}
