/**
 * [13-F] Institutional Holdings API
 * 
 * Fetches SEC Form 13-F data for a given ticker.
 * 
 * Usage: GET /api/command/13f?ticker=NVDA
 * 
 * Data flow (V2 — Cache-first):
 * 1. Check Redis cache (populated by /api/cron/13f-cache, CUSIP-indexed)
 * 2. If cache hit → return top holders from 30+ institutions instantly
 * 3. If cache miss → fallback to Massive API (paginated, limited coverage)
 * 4. Resolve filer CIK → institution name via SEC EDGAR
 * 5. Return top holders sorted by market value
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';

const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const MASSIVE_BASE_URL = process.env.MASSIVE_BASE_URL || "https://api.polygon.io";

// --- CUSIP Mapping for major tickers (13-F uses CUSIP, not ticker symbols) ---
// This is populated dynamically on first call + hardcoded fallbacks for speed
const CUSIP_MAP: Record<string, string> = {
    'NVDA': '67066G104', 'AAPL': '037833100', 'MSFT': '594918104',
    'AMZN': '023135106', 'GOOGL': '02079K305', 'GOOG': '02079K107',
    'META': '30303M102', 'TSLA': '88160R101', 'AVGO': '11135F101',
    'JPM': '46625H100', 'V': '92826C839', 'UNH': '91324P102',
    'MA': '57636Q104', 'HD': '437076102', 'COST': '22160K105',
    'NFLX': '64110L106', 'CRM': '79466L302', 'AMD': '007903107',
    'QCOM': '747525103', 'INTC': '458140100', 'DIS': '254687106',
    'ADBE': '00724F101', 'PEP': '713448108', 'KO': '191216100',
    'MRK': '58933Y105', 'ABT': '002824100', 'TMO': '883556102',
    'ORCL': '68389X105', 'ACN': 'G1151C101', 'MCD': '580135101',
    'WMT': '931142103', 'BAC': '060505104', 'PFE': '717081103',
    'CSCO': '17275R102', 'NKE': '654106103', 'LLY': '532457108',
    'XOM': '30231G102', 'CVX': '166764100', 'ABBV': '00287Y109',
    'IBM': '459200101', 'GS': '38141G104', 'CAT': '149123101',
    'BA': '097023105', 'GE': '369604301', 'PLTR': '69608A108',
    'ARM': 'G0692U109', 'SMCI': '86800U104', 'MRVL': 'G5876H105',
    'MU': '595112103', 'SNOW': '833445109', 'PANW': '697435105',
    'NOW': '81762P102', 'UBER': '90353T100', 'SQ': '852234103',
    'SHOP': '82509L107', 'COIN': '19260Q107', 'MSTR': '594972408',
    'SOFI': '83406F102', 'RIVN': '76954A103', 'LCID': '549498104',
    'SPY': '78462F103', 'QQQ': '46090E103', 'IWM': '464287655',
};

// --- Institution name mapping (known CIK → name for top institutions, avoids SEC round-trip) ---
const KNOWN_INSTITUTIONS: Record<string, { name: string; domain?: string }> = {
    '0000102909': { name: 'Vanguard Group', domain: 'vanguard.com' },
    '0001364742': { name: 'BlackRock Inc.', domain: 'blackrock.com' },
    '0001067983': { name: 'Berkshire Hathaway', domain: 'berkshirehathaway.com' },
    '0001037389': { name: 'State Street Corp', domain: 'statestreet.com' },
    '0001065696': { name: 'JPMorgan Chase', domain: 'jpmorgan.com' },
    '0000070858': { name: 'Bank of America', domain: 'bankofamerica.com' },
    '0001166559': { name: 'Fidelity (FMR)', domain: 'fidelity.com' },
    '0001141046': { name: 'Citadel Advisors', domain: 'citadel.com' },
    '0001350694': { name: 'Renaissance Technologies', domain: 'rentec.com' },
    '0001423053': { name: 'Goldman Sachs Asset Mgmt', domain: 'goldmansachs.com' },
    '0000019617': { name: 'Morgan Stanley', domain: 'morganstanley.com' },
    '0001145549': { name: 'AQR Capital Mgmt', domain: 'aqr.com' },
    '0001167557': { name: 'Two Sigma Investments', domain: 'twosigma.com' },
    '0001037529': { name: 'Wellington Management', domain: 'wellington.com' },
    '0001061768': { name: 'Bridgewater Associates', domain: 'bridgewater.com' },
    '0001159159': { name: 'Invesco Ltd', domain: 'invesco.com' },
    '0000093751': { name: 'Charles Schwab', domain: 'schwab.com' },
    '0001633907': { name: 'Capital Group', domain: 'capitalgroup.com' },
    '0000036405': { name: 'T. Rowe Price', domain: 'troweprice.com' },
    '0001424381': { name: 'D.E. Shaw & Co', domain: 'deshaw.com' },
    '0001582202': { name: 'Millennium Mgmt', domain: 'mlp.com' },
    '0000884394': { name: 'Point72 Asset Mgmt', domain: 'point72.com' },
    '0001535392': { name: 'Balyasny Asset Mgmt', domain: 'bfrnd.com' },
    '0001397545': { name: 'Cathie Wood / ARK Invest', domain: 'ark-invest.com' },
    '0001336528': { name: 'Susquehanna Intl Group', domain: 'sig.com' },
    '0001345471': { name: 'Jane Street Group', domain: 'janestreet.com' },
    '0001649339': { name: 'Geode Capital Mgmt', domain: 'geodecapital.com' },
    '0001160106': { name: 'Northern Trust Corp', domain: 'northerntrust.com' },
    '0001056516': { name: 'Palouse Capital Mgmt' },
    '0001075444': { name: 'Advanced Asset Mgmt Advisors' },
    '0001601539': { name: 'Chicago Trust Co' },
    '0000883782': { name: 'Fulton Bank' },
};

// Cache for CIK → name resolution (in-memory, lives as long as the server)
const cikNameCache = new Map<string, string>(
    Object.entries(KNOWN_INSTITUTIONS).map(([cik, info]) => [cik, info.name])
);

async function resolveCikName(cik: string): Promise<string> {
    if (cikNameCache.has(cik)) return cikNameCache.get(cik)!;

    try {
        const paddedCik = cik.replace(/^0*/, '').padStart(10, '0');
        const res = await fetch(`https://data.sec.gov/submissions/CIK${paddedCik}.json`, {
            headers: { 'User-Agent': 'SIGNUM HQ admin@signumhq.com' },
            next: { revalidate: 604800 } // 7 days cache
        });
        if (res.ok) {
            const data = await res.json();
            const name = data.name || `CIK ${cik}`;
            cikNameCache.set(cik, name);
            return name;
        }
    } catch (e) {
        console.warn(`[13F] CIK resolution failed for ${cik}`);
    }

    const fallback = `Institution (${cik.replace(/^0+/, '')})`;
    cikNameCache.set(cik, fallback);
    return fallback;
}

function getInstitutionDomain(cik: string): string | null {
    return KNOWN_INSTITUTIONS[cik]?.domain || null;
}

interface Filing13F {
    filer_cik: string;
    issuer_name: string;
    cusip: string;
    shares_or_principal_amount: number;
    market_value: number;
    period: string;
    filing_date: string;
    investment_discretion: string;
    form_type: string;
}

export interface Holder13F {
    rank: number;
    cik: string;
    name: string;
    domain: string | null;
    shares: number;
    marketValue: number;
    period: string;
    filingDate: string;
    // QoQ changes
    prevShares: number | null;
    sharesChange: number | null;
    sharesChangePct: number | null;
    prevMarketValue: number | null;
    marketValueChange: number | null;
}

export async function GET(request: NextRequest) {
    const ticker = request.nextUrl.searchParams.get('ticker')?.toUpperCase();
    if (!ticker) {
        return NextResponse.json({ error: 'ticker required' }, { status: 400 });
    }

    try {
        // 1. Get CUSIP for this ticker
        const cusip = CUSIP_MAP[ticker];

        // 2. [V2] Try Redis cache first (populated by /api/cron/13f-cache)
        if (cusip) {
            try {
                const cached = await getFromCache<{
                    holders: Array<{
                        cik: string; name: string; domain?: string;
                        shares: number; marketValue: number;
                        period: string; filingDate: string;
                    }>;
                    updatedAt: string;
                }>(`cache:13f:cusip:${cusip}`);

                if (cached && cached.holders && cached.holders.length > 0) {
                    console.log(`[13F] Cache HIT for ${ticker} (${cusip}): ${cached.holders.length} holders`);
                    
                    // Build response from cache
                    const holders: Holder13F[] = cached.holders.map((h, i) => ({
                        rank: i + 1,
                        cik: h.cik,
                        name: h.name,
                        domain: h.domain || getInstitutionDomain(h.cik),
                        shares: h.shares,
                        marketValue: h.marketValue,
                        period: h.period,
                        filingDate: h.filingDate,
                        prevShares: null,      // QoQ not available from cache (single period)
                        sharesChange: null,
                        sharesChangePct: null,
                        prevMarketValue: null,
                        marketValueChange: null,
                    }));

                    const totalShares = holders.reduce((s, h) => s + h.shares, 0);
                    const totalValue = holders.reduce((s, h) => s + h.marketValue, 0);

                    return NextResponse.json({
                        ticker,
                        holders: holders.slice(0, 20),
                        summary: {
                            totalHolders: holders.length,
                            totalShares,
                            totalValue,
                            period: holders[0]?.period || null,
                            prevPeriod: null,
                            newEntrants: 0,
                            exits: 0,
                        },
                        _source: 'redis-cache',
                        _updatedAt: cached.updatedAt,
                    });
                }
            } catch (e) {
                // Redis error — fall through to Polygon API
                console.warn('[13F] Redis cache error, falling back to API:', e);
            }
        }

        // 3. [Fallback] Fetch from Polygon API (original logic — limited coverage)
        // Strategy: Keep paginating until we have matches from at least 2 distinct quarters
        const allResults: Filing13F[] = [];
        let nextUrl: string | null = null;
        const MAX_PAGES = 10; // More pages to ensure QoQ data

        for (let page = 0; page < MAX_PAGES; page++) {
            const fetchUrl: string = nextUrl || `${MASSIVE_BASE_URL}/stocks/filings/vX/13-F?limit=1000&sort=filing_date.desc&apiKey=${MASSIVE_API_KEY}`;
            const fetchRes: Response = await fetch(fetchUrl, { next: { revalidate: 86400 } }); // 24h cache
            if (!fetchRes.ok) {
                console.error(`[13F] Massive API error: ${fetchRes.status}`);
                break;
            }
            const pageData: any = await fetchRes.json();
            allResults.push(...(pageData.results || []));
            nextUrl = pageData.next_url ? `${pageData.next_url}&apiKey=${MASSIVE_API_KEY}` : null;

            // Check matches: need at least 2 distinct periods for QoQ
            const matches = cusip
                ? allResults.filter(r => r.cusip === cusip)
                : allResults.filter(r => r.issuer_name?.toUpperCase().includes(ticker) || r.issuer_name?.toUpperCase().includes(ticker.replace(/\./g, '')));
            const distinctPeriods = new Set(matches.map(m => m.period)).size;

            // Stop if: 2+ periods found with enough data, or no more pages
            if ((distinctPeriods >= 2 && matches.length >= 10) || !nextUrl) break;
            // Also stop if we have tons of single-period data (filing season just started)
            if (matches.length >= 50 && distinctPeriods >= 1) break;
            if (page > 0) await new Promise(r => setTimeout(r, 150)); // Rate limit respect
        }

        // 3. Filter for our ticker
        let tickerFilings: Filing13F[];
        if (cusip) {
            tickerFilings = allResults.filter(r => r.cusip === cusip);
        } else {
            // Fallback: match by issuer name (fuzzy)
            const upperTicker = ticker.toUpperCase();
            tickerFilings = allResults.filter(r => {
                const name = r.issuer_name?.toUpperCase() || '';
                return name.includes(upperTicker);
            });
            // Learn the CUSIP for next time
            if (tickerFilings.length > 0 && tickerFilings[0].cusip) {
                CUSIP_MAP[ticker] = tickerFilings[0].cusip;
            }
        }

        if (tickerFilings.length === 0) {
            return NextResponse.json({
                ticker,
                holders: [],
                summary: { totalHolders: 0, totalShares: 0, totalValue: 0, period: null },
                message: 'No 13-F data found for this ticker'
            });
        }

        // 4. Separate by period (current vs previous quarter)
        const periods = [...new Set(tickerFilings.map(f => f.period))].sort().reverse();
        const currentPeriod = periods[0];
        const prevPeriod = periods.length > 1 ? periods[1] : null;

        const currentFilings = tickerFilings.filter(f => f.period === currentPeriod);
        const prevFilings = prevPeriod ? tickerFilings.filter(f => f.period === prevPeriod) : [];

        // Build prev quarter lookup: CIK → filing
        const prevMap = new Map<string, Filing13F>();
        for (const f of prevFilings) {
            prevMap.set(f.filer_cik, f);
        }

        // 5. Resolve names and build holders list
        const holders: Holder13F[] = [];
        const namePromises = currentFilings.map(f => resolveCikName(f.filer_cik));
        const names = await Promise.all(namePromises);

        for (let i = 0; i < currentFilings.length; i++) {
            const f = currentFilings[i];
            const prev = prevMap.get(f.filer_cik);
            const sharesChange = prev ? f.shares_or_principal_amount - prev.shares_or_principal_amount : null;
            const sharesChangePct = prev && prev.shares_or_principal_amount > 0
                ? ((f.shares_or_principal_amount - prev.shares_or_principal_amount) / prev.shares_or_principal_amount) * 100
                : null;

            holders.push({
                rank: 0,
                cik: f.filer_cik,
                name: names[i],
                domain: getInstitutionDomain(f.filer_cik),
                shares: f.shares_or_principal_amount,
                marketValue: f.market_value,
                period: f.period,
                filingDate: f.filing_date,
                prevShares: prev?.shares_or_principal_amount ?? null,
                sharesChange,
                sharesChangePct,
                prevMarketValue: prev?.market_value ?? null,
                marketValueChange: prev ? f.market_value - prev.market_value : null,
            });
        }

        // Sort by market value desc, assign ranks
        holders.sort((a, b) => b.marketValue - a.marketValue);
        holders.forEach((h, i) => h.rank = i + 1);

        // 6. Summary
        const totalShares = holders.reduce((sum, h) => sum + h.shares, 0);
        const totalValue = holders.reduce((sum, h) => sum + h.marketValue, 0);

        // Identify new entrants and exits
        const currentCiks = new Set(currentFilings.map(f => f.filer_cik));
        const prevCiks = new Set(prevFilings.map(f => f.filer_cik));
        const newEntrants = [...currentCiks].filter(c => !prevCiks.has(c)).length;
        const exits = [...prevCiks].filter(c => !currentCiks.has(c)).length;

        return NextResponse.json({
            ticker,
            holders: holders.slice(0, 20), // Top 20
            summary: {
                totalHolders: holders.length,
                totalShares,
                totalValue,
                period: currentPeriod,
                prevPeriod,
                newEntrants,
                exits,
            }
        });

    } catch (error: any) {
        console.error('[13F] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch 13-F data', details: error.message }, { status: 500 });
    }
}
