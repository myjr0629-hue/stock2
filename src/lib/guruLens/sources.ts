/** SEC frames + the prototype's public Yahoo chart. No application endpoints or paid fetches. */
import sp500 from '../../../data/sp500/sp500-2026-09-16.json';
import { UNIVERSE } from '../universe';
import { Company, Field, FIELDS, Series } from './types';
import { num } from './rules';

const collected = new Set(UNIVERSE);
export const GURU_UNIVERSE = sp500.filter((r) => collected.has(r.t));
export interface SourceCache {
    read<T>(key: string): Promise<T | null>;
    write<T>(key: string, value: T, ttl?: number): Promise<boolean>;
}
export interface Fact {
    val: number;
    end: string;
    start?: string;
    accn?: string;
    concept: string;
    unit: string;
}
type Frame = Record<string, Fact>;
const concepts: Record<Field, string[]> = {
    ni: ['NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ProfitLoss'],
    eq: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
    rev: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'],
    eps: ['EarningsPerShareDiluted'],
    ocf: ['NetCashProvidedByUsedInOperatingActivities'],
    capex: ['PaymentsToAcquirePropertyPlantAndEquipment'],
    divpaid: ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends'],
    dps: ['CommonStockDividendsPerShareDeclared'],
    oi: ['OperatingIncomeLoss'],
    gp: ['GrossProfit', 'CostOfRevenue', 'CostOfGoodsAndServicesSold'],
    da: ['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization'],
    wsh: ['WeightedAverageNumberOfDilutedSharesOutstanding'],
    assets: ['Assets'],
    liab: ['Liabilities'],
    ca: ['AssetsCurrent'],
    cl: ['LiabilitiesCurrent'],
    ltd: [
        'LongTermDebtNoncurrent',
        'LongTermDebt',
        'LongTermDebtAndCapitalLeaseObligations',
        'LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities',
        'SeniorNotes',
        'LongTermNotesPayable',
    ],
    cash: ['CashAndCashEquivalentsAtCarryingValue'],
    ppe: ['PropertyPlantAndEquipmentNet'],
};
const instant = new Set<Field>(['eq', 'assets', 'liab', 'ca', 'cl', 'ltd', 'cash', 'ppe']);
const long = new Set<Field>(['ni', 'eq', 'rev', 'eps', 'ocf', 'capex', 'divpaid', 'dps']);
const unitOf = (f: Field) => (f === 'wsh' ? 'shares' : f === 'eps' || f === 'dps' ? 'USD-per-shares' : 'USD');
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export function splitAdjustedShares(
    shares: number,
    end: string,
    date: string,
    splits: Company['splits'],
): { shares: number; multiplier: number } {
    const multiplier = splits.filter((s) => s.date > end && s.date <= date).reduce((v, s) => v * s.ratio, 1);
    return { shares: shares * multiplier, multiplier };
}
/** Equal-date daily returns only; missing sessions never shift the market against a stock. */
export function alignedBeta(stock: Array<[string, number]>, market: Array<[string, number]>): number | null {
    const byDate = new Map(market),
        aligned = stock.filter(([d]) => byDate.has(d));
    if (aligned.length < 200) return null;
    const a: number[] = [],
        b: number[] = [];
    for (let i = 1; i < aligned.length; i++) {
        a.push(aligned[i][1] / aligned[i - 1][1] - 1);
        b.push(byDate.get(aligned[i][0])! / byDate.get(aligned[i - 1][0])! - 1);
    }
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length,
        am = mean(a),
        bm = mean(b);
    const variance = b.reduce((s, x) => s + (x - bm) ** 2, 0);
    return variance > 0 ? a.reduce((s, x, i) => s + (x - am) * (b[i] - bm), 0) / variance : null;
}
interface Chart {
    currency: string;
    closes: Array<[string, number]>;
    high: number;
    splits: Company['splits'];
}
export function parseChart(raw: any, today: string): Chart {
    const result = raw?.chart?.result?.[0],
        q = result?.indicators?.quote?.[0];
    if (!q || !Array.isArray(result.timestamp)) throw new Error('price_missing');
    const bars = result.timestamp
        .map((ts: number, i: number) => ({
            date: new Date(ts * 1000).toISOString().slice(0, 10),
            close: q.close?.[i],
            high: q.high?.[i],
        }))
        .filter((b: any) => b.date < today && num(b.close) && b.close > 0 && num(b.high) && b.high > 0);
    if (bars.length < 253) throw new Error('price_history_short');
    const splits = Object.values<any>(result.events?.splits ?? {}).map((s) => ({
        date: new Date(s.date * 1000).toISOString().slice(0, 10),
        ratio: s.numerator / s.denominator,
    }));
    if (splits.some((s) => !num(s.ratio) || s.ratio <= 0)) throw new Error('split_invalid');
    return {
        currency: result.meta?.currency ?? '',
        closes: bars.map((b: any) => [b.date, b.close]),
        high: Math.max(...bars.slice(-252).map((b: any) => b.high)),
        splits,
    };
}
export async function collectCompanies(
    cache: SourceCache,
    now = new Date(),
    fetcher: typeof fetch = fetch,
): Promise<{
    companies: Company[];
    calls: { sec: number; prices: number; paid: number };
    failures: string[];
}> {
    const date = now.toISOString().slice(0, 10),
        year = now.getUTCFullYear() - 1;
    const deadline = Date.now() + 240_000,
        calls = { sec: 0, prices: 0, paid: 0 };
    const failures: string[] = [];
    const json = async (url: string, sec: boolean) => {
        if (Date.now() > deadline) throw new Error('source_deadline');
        if (sec) calls.sec++;
        else calls.prices++;
        const res = await fetcher(url, {
            headers: {
                'User-Agent': sec
                    ? 'SIGNUM HQ research contact@signumhq.com'
                    : 'Mozilla/5.0 (SIGNUM HQ research)',
            },
            cache: 'no-store',
            signal: AbortSignal.timeout(15_000),
        });
        if (res.status === 404 && sec) return null;
        if (!res.ok) throw new Error(sec ? 'sec_fetch_failed' : 'price_fetch_failed');
        return res.json();
    };
    // Fresh CIK table once per run: otherwise a replacement can stay hidden behind an old cache.
    const tickers = await json('https://www.sec.gov/files/company_tickers.json', true);
    const cikMap = new Map(
        Object.values<any>(tickers ?? {}).map((r) => [String(r.ticker).toUpperCase(), Number(r.cik_str)]),
    );
    // Historical CIK only for the replacement documented in REPORT-PROTO. Both identities are retained.
    const ids = GURU_UNIVERSE.map((r) => ({
        ...r,
        reportedCik: cikMap.get(r.t) ?? 0,
        cik: r.t === 'XOM' ? 34088 : (cikMap.get(r.t) ?? 0),
    }));
    const cikSet = new Set(ids.map((r) => r.cik));
    const frameMemo = new Map<string, Frame>();
    const frame = async (tax: string, c: string, u: string, per: string): Promise<Frame> => {
        const key = `guru:source:v1:frame:${tax}:${c}:${u}:${per}:${date}`;
        if (frameMemo.has(key)) return frameMemo.get(key)!;
        const hit = await cache.read<Frame>(key);
        if (hit) {
            frameMemo.set(key, hit);
            return hit;
        }
        await wait(140); // sequential SEC requests: <8/s, no retries/fan-out
        const raw = await json(`https://data.sec.gov/api/xbrl/frames/${tax}/${c}/${u}/${per}.json`, true);
        const selected: Frame = {};
        if (raw) {
            if (raw.uom !== u.replace('-per-', '/') || raw.ccp !== per || raw.tag !== c)
                throw new Error('frame_unit_or_period');
            for (const row of raw.data ?? [])
                if (cikSet.has(row.cik) && num(row.val) && row.end <= date)
                    selected[String(row.cik)] = {
                        val: row.val,
                        end: row.end,
                        start: row.start,
                        accn: row.accn,
                        concept: c,
                        unit: u,
                    };
        }
        frameMemo.set(key, selected);
        await cache.write(key, selected, 8 * 86400);
        return selected;
    };
    const series = new Map<string, Record<Field, Series>>(),
        facts = new Map<string, Map<string, Fact>>();
    ids.forEach((r) => {
        series.set(r.t, Object.fromEntries(FIELDS.map((f) => [f, {}])) as Record<Field, Series>);
        facts.set(r.t, new Map());
    });
    for (const f of FIELDS) {
        for (let y = year - (long.has(f) ? 11 : 3); y <= year; y++) {
            const per = `CY${y}${instant.has(f) ? 'Q4I' : ''}`,
                frames: Frame[] = [];
            for (const c of concepts[f]) frames.push(await frame('us-gaap', c, unitOf(f), per));
            for (const r of ids) {
                const available = frames.map((fr) => fr[r.cik]).filter(Boolean);
                let fact = f === 'ltd' ? available.sort((a, b) => b.val - a.val)[0] : available[0];
                if (f === 'gp' && fact && fact.concept !== 'GrossProfit') {
                    const rev = series.get(r.t)!.rev[y];
                    fact = num(rev) ? { ...fact, val: rev - fact.val } : (undefined as unknown as Fact);
                }
                series.get(r.t)![f][y] = fact?.val ?? null;
                if (fact) facts.get(r.t)!.set(`${f}:${y}`, fact);
            }
        }
    }
    // Latest available quarter, then preceding two. No invented share count or million multiplier.
    const latestQ = Math.floor(now.getUTCMonth() / 3) - 1;
    const shareFrames: Frame[] = [];
    for (let i = 0; i < 3; i++) {
        const q = latestQ - i,
            yy = now.getUTCFullYear() + Math.floor(q / 4),
            qq = (((q % 4) + 4) % 4) + 1;
        shareFrames.push(
            await frame('dei', 'EntityCommonStockSharesOutstanding', 'shares', `CY${yy}Q${qq}I`),
        );
    }
    const chart = async (t: string): Promise<Chart | null> => {
        const key = `guru:source:v1:price:${t}:${date}`;
        const hit = await cache.read<Chart>(key);
        if (hit) return hit;
        try {
            const value = parseChart(
                await json(
                    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t.replaceAll('.', '-'))}?range=2y&interval=1d&events=split`,
                    false,
                ),
                date,
            );
            await cache.write(key, value, 8 * 86400);
            return value;
        } catch {
            failures.push(`price:${t}`);
            return null;
        }
    };
    const spy = await chart('SPY');
    if (!spy) throw new Error('market_history_missing');
    const prices = new Map<string, Chart>();
    let cursor = 0;
    await Promise.all(
        Array.from({ length: 3 }, async () => {
            while (cursor < ids.length) {
                const r = ids[cursor++],
                    p = await chart(r.t);
                if (p) prices.set(r.t, p);
            }
        }),
    );
    const companies: Company[] = ids.map((r) => {
        const fs = series.get(r.t)!,
            p = prices.get(r.t),
            sh = shareFrames.map((fr) => fr[r.cik]).find(Boolean);
        const last = p?.closes.at(-1),
            priceDate = last?.[0] ?? '',
            price = last?.[1] ?? 0;
        const adjusted = sh ? splitAdjustedShares(sh.val, sh.end, priceDate, p?.splits ?? []) : null;
        const issues: string[] = [];
        if (!r.reportedCik) issues.push('cik_missing');
        if (!p) issues.push('price_missing');
        if (!sh) issues.push('shares_missing');
        // Historical shares/EPS remain as reported. A split across compared annual periods
        // needs basis reconciliation before interpreting dilution or EPS growth.
        if (p?.splits.some((s) => s.date >= `${year - 3}-01-01` && s.date <= `${year}-12-31`))
            issues.push('historical_split_basis_review');
        // Preserve raw facts; suspect rows are held, never silently repaired from EPS.
        for (let y = year - 3; y <= year; y++) {
            const ni = fs.ni[y],
                eps = fs.eps[y],
                wsh = fs.wsh[y];
            if (num(wsh) && wsh > 0 && wsh < 1e5) issues.push(`share_unit:${y}`);
            if (num(ni) && num(eps) && num(wsh) && eps * wsh !== 0) {
                const k = Math.abs(ni / (eps * wsh));
                if (k > 50 || k < 0.02 || ni * eps < 0) issues.push(`net_income_digits:${y}`);
            }
        }
        const n = p?.closes.length ?? 0,
            ret = (i: number) => (p && n > i ? price / p.closes[n - 1 - i][1] - 1 : null);
        return {
            ...fs,
            ticker: r.t,
            name: r.name,
            sector: r.sector,
            cik: r.cik,
            reportedCik: r.reportedCik,
            year,
            priceDate,
            price,
            currency: p?.currency ?? '',
            shares: adjusted?.shares ?? null,
            sharesDate: sh?.end ?? null,
            splitMultiplier: adjusted?.multiplier ?? 1,
            splits: p?.splits ?? [],
            offHigh: p ? price / p.high - 1 : null,
            ret12m: ret(252),
            mom12_1: p && n > 252 ? p.closes[n - 22][1] / p.closes[n - 253][1] - 1 : null,
            beta: p ? alignedBeta(p.closes.slice(-260), spy.closes.slice(-260)) : null,
            issues,
        };
    });
    return { companies, calls, failures };
}
