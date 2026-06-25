// ============================================================================
// /api/cron/13f-cache — 주요 기관 13-F 보유 데이터 Redis 캐싱
// Vercel Cron: 0 22 * * 1-5  (UTC 22:00 = ET 17:00 장마감 1시간 후)
//
// Strategy: "역방향 조회"
// Polygon API는 cusip 필터를 지원하지 않으므로 (early-access beta),
// filer_cik(기관 CIK) 필터로 각 기관의 전체 포트폴리오를 수집한 뒤
// CUSIP별로 역색인하여 Redis에 저장합니다.
//
// 결과: 어떤 종목이든 즉시 "누가 보유하고 있나?" 조회 가능
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { setInCache } from '@/services/redisClient';

const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const MASSIVE_BASE_URL = process.env.MASSIVE_BASE_URL || "https://api.polygon.io";

// Top 30 institutional investors by AUM (covers ~80% of institutional ownership)
const TOP_INSTITUTIONS: { cik: string; name: string; domain?: string }[] = [
    { cik: '0000102909', name: 'Vanguard Group', domain: 'vanguard.com' },
    { cik: '0001364742', name: 'BlackRock Inc.', domain: 'blackrock.com' },
    { cik: '0001037389', name: 'State Street Corp', domain: 'statestreet.com' },
    { cik: '0001166559', name: 'Fidelity (FMR)', domain: 'fidelity.com' },
    { cik: '0001065696', name: 'JPMorgan Chase', domain: 'jpmorgan.com' },
    { cik: '0000070858', name: 'Bank of America', domain: 'bankofamerica.com' },
    { cik: '0000019617', name: 'Morgan Stanley', domain: 'morganstanley.com' },
    { cik: '0001423053', name: 'Goldman Sachs Asset Mgmt', domain: 'goldmansachs.com' },
    { cik: '0001649339', name: 'Geode Capital Mgmt', domain: 'geodecapital.com' },
    { cik: '0001037529', name: 'Wellington Management', domain: 'wellington.com' },
    { cik: '0001160106', name: 'Northern Trust Corp', domain: 'northerntrust.com' },
    { cik: '0001633907', name: 'Capital Group', domain: 'capitalgroup.com' },
    { cik: '0000036405', name: 'T. Rowe Price', domain: 'troweprice.com' },
    { cik: '0001159159', name: 'Invesco Ltd', domain: 'invesco.com' },
    { cik: '0000093751', name: 'Charles Schwab', domain: 'schwab.com' },
    { cik: '0001141046', name: 'Citadel Advisors', domain: 'citadel.com' },
    { cik: '0001350694', name: 'Renaissance Technologies', domain: 'rentec.com' },
    { cik: '0001067983', name: 'Berkshire Hathaway', domain: 'berkshirehathaway.com' },
    { cik: '0001582202', name: 'Millennium Mgmt', domain: 'mlp.com' },
    { cik: '0001424381', name: 'D.E. Shaw & Co', domain: 'deshaw.com' },
    { cik: '0001336528', name: 'Susquehanna Intl Group', domain: 'sig.com' },
    { cik: '0001345471', name: 'Jane Street Group', domain: 'janestreet.com' },
    { cik: '0001145549', name: 'AQR Capital Mgmt', domain: 'aqr.com' },
    { cik: '0001167557', name: 'Two Sigma Investments', domain: 'twosigma.com' },
    { cik: '0001061768', name: 'Bridgewater Associates', domain: 'bridgewater.com' },
    { cik: '0000884394', name: 'Point72 Asset Mgmt', domain: 'point72.com' },
    { cik: '0001535392', name: 'Balyasny Asset Mgmt', domain: 'bfrnd.com' },
    { cik: '0001397545', name: 'Cathie Wood / ARK Invest', domain: 'ark-invest.com' },
    { cik: '0000732905', name: 'UBS Group', domain: 'ubs.com' },
    { cik: '0000764764', name: 'Deutsche Bank', domain: 'db.com' },
];

interface Filing13F {
    filer_cik: string;
    cusip: string;
    issuer_name: string;
    shares_or_principal_amount: number;
    market_value: number;
    period: string;
    filing_date: string;
}

// CUSIP → Holder list (reverse index)
interface CusipHolding {
    cik: string;
    name: string;
    domain?: string;
    shares: number;
    marketValue: number;
    period: string;
    filingDate: string;
    issuerName: string;
}

async function fetchInstitutionHoldings(cik: string): Promise<Filing13F[]> {
    const allResults: Filing13F[] = [];
    let nextUrl: string | null = null;
    const MAX_PAGES = 20; // Each institution may have thousands of holdings

    for (let page = 0; page < MAX_PAGES; page++) {
        const url: string = nextUrl || `${MASSIVE_BASE_URL}/stocks/filings/vX/13-F?filer_cik=${cik}&limit=1000&sort=filing_date.desc&apiKey=${MASSIVE_API_KEY}`;
        
        try {
            const res: Response = await fetch(url);
            if (!res.ok) {
                console.warn(`[13F-Cache] API error for CIK ${cik}: ${res.status}`);
                break;
            }
            const data: { results?: Filing13F[]; next_url?: string } = await res.json();
            const results = data.results || [];
            allResults.push(...results);
            
            nextUrl = data.next_url ? `${data.next_url}&apiKey=${MASSIVE_API_KEY}` : null;
            if (!nextUrl || results.length < 1000) break;
            
            // Rate limit
            if (page > 0) await new Promise(r => setTimeout(r, 150));
        } catch (e) {
            console.warn(`[13F-Cache] Fetch error for CIK ${cik}:`, e);
            break;
        }
    }

    return allResults;
}

export async function GET(request: NextRequest) {
    // [Security] CRON_SECRET
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');
    const { searchParams } = new URL(request.url);
    const secretParam = searchParams.get('secret');

    if (process.env.NODE_ENV === 'production' && cronSecret) {
        const isHeaderValid = authHeader === `Bearer ${cronSecret}`;
        const isParamValid = secretParam === cronSecret;
        if (!isHeaderValid && !isParamValid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const startTime = Date.now();
    console.log('[13F-Cache] Starting institutional holdings cache build...');

    try {
        // Step 1: Fetch all holdings for top institutions
        const cusipIndex = new Map<string, CusipHolding[]>();
        let totalFilings = 0;
        let institutionsFetched = 0;

        for (const inst of TOP_INSTITUTIONS) {
            try {
                const filings = await fetchInstitutionHoldings(inst.cik);
                totalFilings += filings.length;
                institutionsFetched++;

                // Get the most recent period
                const periods = [...new Set(filings.map(f => f.period))].sort().reverse();
                const currentPeriod = periods[0];
                const prevPeriod = periods.length > 1 ? periods[1] : null;

                // Only index current period holdings
                const currentFilings = filings.filter(f => f.period === currentPeriod);
                const prevFilings = prevPeriod ? filings.filter(f => f.period === prevPeriod) : [];
                const prevMap = new Map(prevFilings.map(f => [f.cusip, f]));

                for (const f of currentFilings) {
                    if (!f.cusip) continue;
                    const prev = prevMap.get(f.cusip);

                    const holding: CusipHolding = {
                        cik: inst.cik,
                        name: inst.name,
                        domain: inst.domain,
                        shares: f.shares_or_principal_amount,
                        marketValue: f.market_value,
                        period: f.period,
                        filingDate: f.filing_date,
                        issuerName: f.issuer_name,
                    };

                    const list = cusipIndex.get(f.cusip) || [];
                    list.push(holding);
                    cusipIndex.set(f.cusip, list);
                }

                console.log(`[13F-Cache] ${inst.name}: ${currentFilings.length} holdings (period: ${currentPeriod})`);
                
                // Rate limit between institutions
                await new Promise(r => setTimeout(r, 200));
            } catch (e) {
                console.warn(`[13F-Cache] Error for ${inst.name}:`, e);
            }
        }

        // Step 2: Save to Redis — each CUSIP gets its own cache key
        let cusipsSaved = 0;
        const TTL = 90000; // 25 hours

        for (const [cusip, holders] of cusipIndex.entries()) {
            // Sort by market value desc
            holders.sort((a, b) => b.marketValue - a.marketValue);

            await setInCache(`cache:13f:cusip:${cusip}`, {
                holders,
                updatedAt: new Date().toISOString(),
            }, TTL);
            cusipsSaved++;
        }

        // Step 3: Save metadata
        await setInCache('cache:13f:meta', {
            institutionsFetched,
            totalFilings,
            cusipsCached: cusipsSaved,
            updatedAt: new Date().toISOString(),
            elapsedMs: Date.now() - startTime,
        }, TTL);

        const elapsed = Date.now() - startTime;
        console.log(`[13F-Cache] Complete: ${institutionsFetched} institutions, ${totalFilings} filings, ${cusipsSaved} CUSIPs cached in ${elapsed}ms`);

        return NextResponse.json({
            success: true,
            institutionsFetched,
            totalFilings,
            cusipsCached: cusipsSaved,
            elapsedMs: elapsed,
        });

    } catch (error: any) {
        console.error('[13F-Cache] Fatal error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
