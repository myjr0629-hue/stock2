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

        // 1.5. Autonomous Auto-Pilot Allocation Engine (mode=auto)
        const mode = searchParams.get('mode') || '';
        const totalCapital = parseFloat(searchParams.get('totalCapital') || '10000');

        if (mode === 'auto') {
            // A. Filter top expectancy assets (Alpha Score >= 60, Grades S/A/B, Bullish Bias)
            let candidates = entries.filter(e => {
                const score = e.alphaSnapshot.score;
                const grade = e.alphaSnapshot.grade?.toUpperCase();
                const action = e.alphaSnapshot.action?.toUpperCase();
                return score >= 60 && ['S', 'A', 'B'].includes(grade) && ['BUY', 'STRONG_BULLISH'].includes(action);
            });

            // Fallback if no assets match strict 60+ expectation
            if (candidates.length === 0) {
                candidates = entries.filter(e => e.alphaSnapshot.score >= 50 && ['S', 'A', 'B', 'C'].includes(e.alphaSnapshot.grade?.toUpperCase()));
            }

            // B. Select top 6 highest expectancy candidates
            candidates.sort((a, b) => (b.alphaSnapshot.score || 0) - (a.alphaSnapshot.score || 0));
            const topCandidates = candidates.slice(0, 6);

            // C. Kelly-Risk Parity allocation calculation
            let rawWeights = topCandidates.map(e => {
                const expectancy = (e.alphaSnapshot.score || 50) / 100;
                const rsiVal = e.rsi ?? 50;
                const rvolVal = e.relVol ?? 1.0;
                // Risk factor penalizes high RSI and high RVOL to prioritize stable fear resolution entry
                const riskFactor = 1 / (rsiVal * Math.max(0.5, rvolVal));
                return { ticker: e.ticker, rawWeight: expectancy * riskFactor, entry: e };
            });

            const totalRawWeight = rawWeights.reduce((sum, item) => sum + item.rawWeight, 0) || 1;
            
            // Normalize weights and apply 25% cap for prudence
            let allocatedPort = rawWeights.map(item => {
                let normWeight = item.rawWeight / totalRawWeight;
                const weight = Math.min(0.25, normWeight);
                return { ...item, weight };
            });

            // Re-normalize weights to sum to 100% after cap
            const finalWeightSum = allocatedPort.reduce((sum, item) => sum + item.weight, 0) || 1;
            allocatedPort = allocatedPort.map(item => ({
                ...item,
                weight: item.weight / finalWeightSum
            }));

            // Enrich each allocated candidate with live price and bracket levels
            let results = await Promise.all(allocatedPort.map(async (item) => {
                const entry = item.entry;
                let price = entry.vwap || 0;
                let changePct = 0;
                let prevClose = 0;

                try {
                    const snap = await fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${entry.ticker}`).catch(() => null);
                    if (snap?.ticker) {
                        price = snap.ticker.lastTrade?.p || snap.ticker.day?.c || snap.ticker.prevDay?.c || price;
                        prevClose = snap.ticker.prevDay?.c || 0;
                        changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : snap.ticker.todaysChangePerc || 0;
                    }
                } catch {}

                const allocatedCapital = totalCapital * item.weight;
                const targetShares = price > 0 ? Math.floor(allocatedCapital / price) : 0;

                // Mathematical Option Wall / ATR bracket levels
                const entryTarget = price;
                const tp = entry.callWall && entry.callWall > price ? entry.callWall : (price * 1.08);
                const sl = entry.putFloor && entry.putFloor < price ? entry.putFloor : (price * 0.95);
                const rrRatio = (sl !== price) ? (tp - price) / (price - sl) : 2.0;

                return {
                    ticker: entry.ticker,
                    weight: item.weight,
                    allocatedCapital,
                    targetShares,
                    rsi: entry.rsi,
                    relVol: entry.relVol,
                    pcr: entry.pcr,
                    gexM: entry.gexM,
                    alphaSnapshot: entry.alphaSnapshot,
                    realtime: {
                        price,
                        changePct,
                        prevClose,
                        vwap: entry.vwap || price,
                        volume: entry.volume || 0
                    },
                    execution: {
                        entry: entryTarget,
                        takeProfit: tp,
                        stopLoss: sl,
                        riskRewardRatio: parseFloat(rrRatio.toFixed(2))
                    }
                };
            }));

            return NextResponse.json({
                ok: true,
                results,
                meta: {
                    totalCount: results.length,
                    totalCapital,
                    mode: 'auto'
                }
            }, {
                headers: {
                    'Cache-Control': 'private, max-age=2, stale-while-revalidate=10',
                }
            });
        }

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
            const gexVal = e.gexM != null ? e.gexM : (e.gex != null ? e.gex / 1000000 : null);
            if (gexVal != null && gexVal < gexMin) return false;
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
