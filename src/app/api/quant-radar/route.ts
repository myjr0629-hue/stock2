import { NextResponse } from 'next/server';
import { getAnalysisCacheForTickers, type AnalysisCacheEntry } from '@/services/analysisCache';
import { UNIVERSE } from '@/lib/universe';
import { fetchMassive } from '@/services/massiveClient';
import { createClient } from '@/lib/supabase/server';

// Ensure this route is dynamic server-side to bypass build-time caching
export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

export async function GET(request: Request) {
    // 1. Secure Server-Side Authorization Check
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ ok: false, error: 'Unauthorized: Access restricted to operators' }, { status: 401 });
        }

        const email = (user.email || '').toLowerCase();
        const isAdmin = ADMIN_EMAILS.includes(email);

        if (!isAdmin) {
            return NextResponse.json({ ok: false, error: 'Forbidden: Administrator credentials required' }, { status: 403 });
        }
    } catch (authError) {
        console.error('[Quant Radar API] Auth verification failed:', authError);
        return NextResponse.json({ ok: false, error: 'Security verification failed' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    // DIY Filter inputs
    const scoreMin = parseInt(searchParams.get('scoreMin') || '0', 10);
    const scoreMax = parseInt(searchParams.get('scoreMax') || '100', 10);
    const gradesParam = searchParams.get('grades'); // e.g. "S,A"
    const actionParam = searchParams.get('action'); // e.g. "STRONG_BULLISH"
    const search = searchParams.get('search')?.trim().toUpperCase() || '';
    const overlay = searchParams.get('overlay') || ''; // oversold, extreme_oversold, overheat, fear_resolution, r_mode, whale
    
    // Options filters
    const gexMin = parseFloat(searchParams.get('gexMin') || '-Infinity');
    const pcrMax = parseFloat(searchParams.get('pcrMax') || 'Infinity');
    const darkPoolMin = parseFloat(searchParams.get('darkPoolMin') || '0');

    // Sorting & Pagination
    const sortBy = searchParams.get('sortBy') || 'score'; // score, change, rsi, volume
    const sortOrder = searchParams.get('sortOrder') || 'desc'; // desc, asc
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '24', 10);

    const allowedGrades = gradesParam ? gradesParam.split(',').map(g => g.trim().toUpperCase()) : [];

    try {
        // 1. High-Performance Redis MGET over the entire 2,000 Universe tickers (~50ms)
        const cachedMap = await getAnalysisCacheForTickers(UNIVERSE).catch(() => ({}));

        // Convert map to list and filter valid cache hits
        let entries = Object.values(cachedMap).filter((entry): entry is AnalysisCacheEntry => {
            if (!entry || !entry.ticker || !entry.alphaSnapshot) return false;
            return true;
        });

        // 2. Server-side DIY Filtering
        if (search) {
            entries = entries.filter(e => e.ticker.includes(search));
        }

        entries = entries.filter(e => {
            const score = e.alphaSnapshot.score;
            const grade = e.alphaSnapshot.grade?.toUpperCase();
            const action = e.alphaSnapshot.action?.toUpperCase();

            // Score boundary check
            if (score < scoreMin || score > scoreMax) return false;

            // Grade filter check
            if (allowedGrades.length > 0 && !allowedGrades.includes(grade)) return false;

            // Action filter check
            if (actionParam && action !== actionParam.toUpperCase()) return false;

            // Options limits
            if (e.gex != null && e.gex < gexMin) return false;
            if (e.pcr != null && e.pcr > pcrMax) return false;
            if (e.darkPoolPct != null && e.darkPoolPct < darkPoolMin) return false;

            // Advanced technical/regime overlay check
            if (overlay === 'oversold') {
                if (e.rsi == null || e.rsi >= 30) return false;
            } else if (overlay === 'extreme_oversold') {
                if (e.rsi == null || e.rsi >= 25) return false;
            } else if (overlay === 'overheat') {
                if (e.rsi == null || e.rsi <= 70) return false;
            } else if (overlay === 'fear_resolution') {
                const gates = e.alphaSnapshot.gatesApplied || [];
                const isFearRes = gates.includes('FEAR_RESOLUTION') || gates.includes('FEAR_RESOLUTION_MACD');
                if (!isFearRes) return false;
            } else if (overlay === 'r_mode') {
                const whyKR = e.alphaSnapshot.whyKR || '';
                const triggers = e.alphaSnapshot.triggers || [];
                const isRMode = whyKR.includes('R-Mode') || triggers.includes('R_MODE');
                if (!isRMode) return false;
            } else if (overlay === 'whale') {
                if (e.whaleIndex < 65 && e.whaleConfidence !== 'HIGH') return false;
            }

            return true;
        });

        // 3. Sorting
        entries.sort((a, b) => {
            let valA: number = 0;
            let valB: number = 0;

            if (sortBy === 'score') {
                valA = a.alphaSnapshot.score || 0;
                valB = b.alphaSnapshot.score || 0;
            } else if (sortBy === 'rsi') {
                valA = a.rsi ?? 50;
                valB = b.rsi ?? 50;
            } else if (sortBy === 'volume') {
                valA = a.volume ?? 0;
                valB = b.volume ?? 0;
            } else if (sortBy === 'gex') {
                valA = a.gex ?? 0;
                valB = b.gex ?? 0;
            }

            if (sortOrder === 'asc') {
                return valA - valB;
            } else {
                return valB - valA;
            }
        });

        const totalCount = entries.length;

        // 4. Pagination
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        const paginatedEntries = entries.slice(start, end);

        // 5. Enrich visible page of tickers with real-time prices & change percents
        let enrichedResults = paginatedEntries.map(e => ({
            ...e,
            realtime: {
                price: e.vwap || 0,
                changePct: 0,
                prevClose: (e.vwap && e.vwapDist) ? e.vwap * (1 + e.vwapDist / 100) : 0,
                vwap: e.vwap,
                volume: e.volume || 0,
            }
        }));

        if (enrichedResults.length > 0) {
            const pageTickers = enrichedResults.map(e => e.ticker);
            const snapshotData = await fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers`, { tickers: pageTickers.join(',') }).catch(() => null);
            
            if (snapshotData?.tickers) {
                const snapMap: Record<string, any> = {};
                snapshotData.tickers.forEach((t: any) => { snapMap[t.ticker] = t; });

                enrichedResults = enrichedResults.map(entry => {
                    const snap = snapMap[entry.ticker];
                    if (snap) {
                        const price = snap.lastTrade?.p || snap.day?.c || snap.prevDay?.c || 0;
                        const prevDayClose = snap.prevDay?.c || 0;
                        const changePct = prevDayClose > 0 ? ((price - prevDayClose) / prevDayClose) * 100 : snap.todaysChangePerc || 0;
                        
                        return {
                            ...entry,
                            realtime: {
                                price,
                                changePct,
                                prevClose: prevDayClose,
                                vwap: snap.day?.vw || entry.vwap,
                                volume: snap.day?.v || entry.volume || 0,
                            }
                        };
                    }
                    return entry;
                });
            }
        }

        return NextResponse.json({
            ok: true,
            results: enrichedResults,
            meta: {
                totalCount,
                page,
                pageSize,
                totalPages: Math.ceil(totalCount / pageSize),
            }
        }, {
            headers: {
                'Cache-Control': 'private, max-age=2, stale-while-revalidate=10',
            }
        });

    } catch (e: any) {
        console.error('[Quant Radar API] Error handling scan:', e);
        return NextResponse.json({ ok: false, error: e.message || 'Server error' }, { status: 500 });
    }
}
