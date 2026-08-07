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
        // [XS-2.0] alphaSnapshot can be null (engine failure) — such tickers are excluded from the radar
        type RadarEntry = AnalysisCacheEntry & { alphaSnapshot: NonNullable<AnalysisCacheEntry['alphaSnapshot']> };
        let entries = Object.values(cachedMap).filter((entry): entry is RadarEntry => {
            if (!entry || !entry.ticker || !entry.alphaSnapshot) return false;
            return true;
        });

        // 1.5. Autonomous Auto-Pilot Allocation Engine (mode=auto)
        const mode = searchParams.get('mode') || '';
        const totalCapital = parseFloat(searchParams.get('totalCapital') || '10000');
        const holdingsParam = searchParams.get('holdings') || '';
        const userHoldings = holdingsParam ? holdingsParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean) : [];
        // Holdings with quantities for drift detection: "AAPL:10,NVDA:5"
        const holdingsQtyParam = searchParams.get('holdingsQty') || '';
        const userHoldingsQty: Array<{ticker: string; qty: number}> = holdingsQtyParam
            ? holdingsQtyParam.split(',').map(h => {
                const [t, q] = h.split(':');
                return { ticker: t?.trim().toUpperCase() || '', qty: parseInt(q || '0', 10) };
            }).filter(h => h.ticker && h.qty > 0)
            : [];

        if (mode === 'auto') {
            // ── V7 Empirical Win Rate Calibration ──────────────────────────────
            // Derived from 54,850 T+3 pairs backtest (t=12.84, p<0.0001)
            // Replaces naive p = score/100 with actual grade-level hit rates
            const empiricalWinRate = (score: number): number => {
                if (score >= 85) return 0.685;  // S-grade: 68.5% win rate
                if (score >= 70) return 0.582 + (score - 70) * (0.685 - 0.582) / 15;
                if (score >= 55) return 0.521 + (score - 55) * (0.582 - 0.521) / 15;
                if (score >= 40) return 0.420 + (score - 40) * (0.521 - 0.420) / 15;
                if (score >= 25) return 0.354 + (score - 25) * (0.420 - 0.354) / 15;
                return 0.354;  // F-grade: 35.4% win rate
            };

            // ── Dynamic Cash Reserve (Regime-Aware) ───────────────────────────
            // When market regime is hostile, hold cash instead of forcing 100% invested
            const calculateCashReserve = (cands: AnalysisCacheEntry[]): number => {
                const regimeScores = cands
                    .map(c => c.alphaSnapshot?.pillars?.regime)
                    .filter((r): r is number => r != null);
                if (regimeScores.length === 0) return 0.10;
                const avgRegime = regimeScores.reduce((s, r) => s + r, 0) / regimeScores.length;
                if (avgRegime >= 10) return 0.00;  // Favorable
                if (avgRegime >= 7)  return 0.10;  // Neutral
                if (avgRegime >= 4)  return 0.20;  // Adverse
                return 0.35;                        // Crisis
            };

            // ── Smart Limit Price Calculator ──────────────────────────────────
            const calculateSmartLimit = (
                currentPrice: number, vwap: number, atrPct: number, alphaScore: number
            ): { limitPrice: number; strategy: string } => {
                const aggressiveness = Math.min(1.0, Math.max(0, (alphaScore - 50) / 40));
                if (currentPrice < vwap) {
                    const offset = (atrPct || 0.02) * 0.1 * (1 - aggressiveness);
                    return { limitPrice: parseFloat((currentPrice * (1 - offset)).toFixed(2)), strategy: 'VWAP_DISCOUNT' };
                } else {
                    const offset = (atrPct || 0.02) * 0.3 * (1 - aggressiveness);
                    return { limitPrice: parseFloat(Math.max(vwap, currentPrice * (1 - offset)).toFixed(2)), strategy: 'VWAP_PULLBACK' };
                }
            };
            // Helper function to calculate Pearson correlation coefficient from historical sparkline daily log returns
            const calculateSparklinePearson = (sparkA: number[], sparkB: number[]): number => {
                if (!sparkA || !sparkB || sparkA.length < 5 || sparkB.length < 5) {
                    return 0.40; // baseline historical market correlation
                }
                
                const retA: number[] = [];
                const retB: number[] = [];
                const minLen = Math.min(sparkA.length, sparkB.length);
                
                for (let i = 1; i < minLen; i++) {
                    if (sparkA[i-1] > 0 && sparkA[i] > 0) {
                        retA.push(Math.log(sparkA[i] / sparkA[i-1]));
                    }
                    if (sparkB[i-1] > 0 && sparkB[i] > 0) {
                        retB.push(Math.log(sparkB[i] / sparkB[i-1]));
                    }
                }
                
                const returnsLen = Math.min(retA.length, retB.length);
                if (returnsLen < 3) {
                    return 0.40;
                }
                
                let sumA = 0, sumB = 0;
                for (let i = 0; i < returnsLen; i++) {
                    sumA += retA[i];
                    sumB += retB[i];
                }
                const meanA = sumA / returnsLen;
                const meanB = sumB / returnsLen;
                
                let num = 0, denA = 0, denB = 0;
                for (let i = 0; i < returnsLen; i++) {
                    const diffA = retA[i] - meanA;
                    const diffB = retB[i] - meanB;
                    num += diffA * diffB;
                    denA += diffA * diffA;
                    denB += diffB * diffB;
                }
                
                if (denA === 0 || denB === 0) return 0.40;
                const r = num / Math.sqrt(denA * denB);
                return isNaN(r) ? 0.40 : Math.max(-1.0, Math.min(1.0, r));
            };

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

            // C. Dynamic Pearson Correlation Matrix (Systemic Cluster Risk Penalty)
            const correlations: Record<string, number> = {};
            topCandidates.forEach((assetA) => {
                let correlationSum = 0;
                topCandidates.forEach((assetB) => {
                    if (assetA.ticker === assetB.ticker) {
                        correlationSum += 1.0;
                    } else {
                        correlationSum += calculateSparklinePearson(assetA.sparkline || [], assetB.sparkline || []);
                    }
                });
                correlations[assetA.ticker] = correlationSum;
            });

            // ── Dynamic Cash Reserve Calculation ──────────────────────────
            const cashReserve = calculateCashReserve(topCandidates);
            const investableCapital = totalCapital * (1 - cashReserve);

            // D. Kelly-Risk Parity allocation calculation (V7 calibrated)
            let rawWeights = topCandidates.map(e => {
                const score = e.alphaSnapshot.score;
                const ivVal = e.iv ?? null;
                const rvolVal = e.relVol ?? 1.0;
                const price = e.vwap || 0;

                // 1. Volatility: IV → ATR → heuristic fallback
                let vol = ivVal;
                if (vol === null && (e as any).atrPct) {
                    vol = (e as any).atrPct;  // ATR as % of price (realized vol)
                }
                if (vol === null) {
                    vol = Math.max(0.10, 0.30 * rvolVal);  // simplified fallback
                }

                // 2. Empirical Win Probability (V7 backtest-calibrated)
                const p = empiricalWinRate(score);
                const tp = e.callWall && e.callWall > price ? e.callWall : (price * 1.08);
                const sl = e.putFloor && e.putFloor < price ? e.putFloor : (price * 0.94);
                const b = price - sl > 0 ? (tp - price) / (price - sl) : 2.0;
                const bClamped = Math.max(0.5, Math.min(5.0, b));
                const kelly = Math.max(0.0, p - (1 - p) / bClamped);

                // 3. Cluster Penalty
                const penalty = correlations[e.ticker] || 1.0;
                
                // Weight combines calibrated Kelly × correlation-penalized risk parity
                const rawWeight = kelly * (1 / (vol * penalty));

                return { ticker: e.ticker, rawWeight, entry: e, vol, kellyFraction: kelly, winProb: p };
            });

            const totalRawWeight = rawWeights.reduce((sum, item) => sum + item.rawWeight, 0) || 1;
            
            // Adaptive position cap: min(25%, 1/N + 10%) where N = number of candidates
            const positionCap = Math.min(0.25, (1 / Math.max(topCandidates.length, 2)) + 0.10);

            // Normalize weights and apply position cap
            let allocatedPort = rawWeights.map(item => {
                let normWeight = item.rawWeight / totalRawWeight;
                const weight = Math.min(positionCap, normWeight);
                return { ...item, weight };
            });

            // Re-normalize weights to sum to 100% after cap
            const finalWeightSum = allocatedPort.reduce((sum, item) => sum + item.weight, 0) || 1;
            allocatedPort = allocatedPort.map(item => ({
                ...item,
                weight: item.weight / finalWeightSum
            }));

            // E. Compute Live Liquidation Alerts and Opportunity Cost Swaps
            const alerts: {
                liquidations: Array<{ ticker: string; score: number; reason: string }>;
                rotations: Array<{ sell: string; sellScore: number; buy: string; buyScore: number; urgency: number; reason: string }>;
            } = { liquidations: [], rotations: [] };

            // Find held assets decaying below support threshold (Score < 50 or bearish action)
            userHoldings.forEach(ticker => {
                const activeEntry = entries.find(e => e.ticker === ticker);
                if (activeEntry) {
                    const score = activeEntry.alphaSnapshot.score;
                    const action = activeEntry.alphaSnapshot.action?.toUpperCase();
                    if (score < 50 || !['BUY', 'STRONG_BULLISH'].includes(action)) {
                        alerts.liquidations.push({
                            ticker,
                            score,
                            reason: `Alpha score of ${ticker} (${score}) has decayed below key support thresholds. Liquidate long exposure immediately.`
                        });
                    }
                }
            });

            // Find opportunity swaps: compare active holdings (that are NOT liquidated) with candidates NOT held
            const nonLiquidatedHoldings = userHoldings.filter(t => !alerts.liquidations.some(l => l.ticker === t));
            const candidateList = allocatedPort.filter(item => !userHoldings.includes(item.ticker));

            if (nonLiquidatedHoldings.length > 0 && candidateList.length > 0) {
                const swaps: Array<{ sell: string; sellScore: number; buy: string; buyScore: number; urgency: number; reason: string }> = [];

                nonLiquidatedHoldings.forEach(heldTicker => {
                    const heldEntry = entries.find(e => e.ticker === heldTicker);
                    if (heldEntry) {
                        const heldScore = heldEntry.alphaSnapshot.score;
                        
                        candidateList.forEach(cand => {
                            const candScore = cand.entry.alphaSnapshot.score;
                            // Rebalancing score threshold drag is set to 15 points
                            const urgency = candScore - heldScore - 15;

                            if (urgency > 0) {
                                swaps.push({
                                    sell: heldTicker,
                                    sellScore: heldScore,
                                    buy: cand.ticker,
                                    buyScore: candScore,
                                    urgency,
                                    reason: `Yield Maximization: Reallocating capital from ${heldTicker} (Score ${heldScore}) to ${cand.ticker} (Score ${candScore}) increases expected risk-adjusted return by ${urgency} expectancy points.`
                                });
                            }
                        });
                    }
                });

                // Pick the single highest urgency swap to keep action command clean and definitive
                if (swaps.length > 0) {
                    swaps.sort((a, b) => b.urgency - a.urgency);
                    alerts.rotations.push(swaps[0]);
                }
            }

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

                // Slippage-adjusted allocation (0.1% + $1 commission per trade)
                const SLIPPAGE_BPS = 10;
                const COMMISSION = 1.0;
                const allocatedCapital = investableCapital * item.weight;
                const slippagePerShare = price * (SLIPPAGE_BPS / 10000);
                const effectivePrice = price + slippagePerShare;
                const targetShares = price > 0 ? Math.floor((allocatedCapital - COMMISSION) / effectivePrice) : 0;

                // Mathematical Option Wall / ATR bracket levels
                const entryTarget = price;
                const tp = entry.callWall && entry.callWall > price ? entry.callWall : (price * 1.08);
                const sl = entry.putFloor && entry.putFloor < price ? entry.putFloor : (price * 0.94);
                const rrRatio = (sl !== price) ? (tp - price) / (price - sl) : 2.0;

                // Smart limit price
                const atrPct = (entry as any).atrPct || 0.02;
                const smartLimit = calculateSmartLimit(price, entry.vwap || price, atrPct, entry.alphaSnapshot.score);

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
                    kellyMeta: {
                        winProb: item.winProb,
                        kellyFraction: item.kellyFraction,
                        vol: item.vol,
                    },
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
                        riskRewardRatio: parseFloat(rrRatio.toFixed(2)),
                        smartLimitPrice: smartLimit.limitPrice,
                        smartLimitStrategy: smartLimit.strategy,
                        slippageBps: SLIPPAGE_BPS,
                    }
                };
            }));

            // ── Weight Drift Detection ────────────────────────────────────────
            const driftAlerts: Array<{
                ticker: string; targetWeight: number; actualWeight: number;
                driftPct: number; needsRebalance: boolean; direction: string;
            }> = [];

            if (userHoldingsQty.length > 0) {
                const DRIFT_THRESHOLD = 0.15;
                // Compute actual NAV from holdings
                let actualTotalVal = 0;
                const holdingValues: Record<string, number> = {};
                for (const h of userHoldingsQty) {
                    const result = results.find(r => r.ticker === h.ticker);
                    const hPrice = result?.realtime?.price || 0;
                    const val = h.qty * hPrice;
                    holdingValues[h.ticker] = val;
                    actualTotalVal += val;
                }
                if (actualTotalVal > 0) {
                    for (const r of results) {
                        const targetW = r.weight;
                        const actualVal = holdingValues[r.ticker] || 0;
                        const actualW = actualVal / actualTotalVal;
                        const drift = targetW > 0.01 ? Math.abs(actualW - targetW) / targetW : 0;
                        if (drift > DRIFT_THRESHOLD) {
                            driftAlerts.push({
                                ticker: r.ticker, targetWeight: targetW, actualWeight: actualW,
                                driftPct: parseFloat((drift * 100).toFixed(1)),
                                needsRebalance: true,
                                direction: actualW > targetW ? 'OVERWEIGHT' : 'UNDERWEIGHT'
                            });
                        }
                    }
                }
            }

            return NextResponse.json({
                ok: true,
                results,
                alerts,
                driftAlerts,
                meta: {
                    totalCount: results.length,
                    totalCapital,
                    investableCapital,
                    cashReserve,
                    cashReserveAmount: totalCapital * cashReserve,
                    positionCap,
                    mode: 'auto',
                    engine: 'kelly-rp-v2'
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
