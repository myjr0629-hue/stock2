// ============================================================================
// /api/intel/snapshot — Sector Snapshot API
// POST: Save post-market snapshot (cron/manual trigger)
// GET:  Retrieve latest or specific-date snapshot
// ============================================================================

import { NextResponse } from 'next/server';
import { saveSnapshot, getLatestSnapshot, getSnapshotByDate } from '@/lib/supabase/snapshot';
import type { SnapshotData, TickerSnapshot, SectorSummary, NewsDigestItem, BriefingData } from '@/types/sector';
import { fetchStockNews } from '@/services/newsHubProvider';
import { callBedrock } from '@/services/bedrockClient';
import { getFromCache } from '@/services/redisClient';
import { YAHOO_CACHE_KEYS, type YahooQuote } from '@/services/yahooFinanceHub';

export const maxDuration = 60;



// Sector ticker lists
const SECTOR_TICKERS: Record<string, string[]> = {
    m7: ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'],
    physical_ai: ['PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG'],
    silicon_core: ['AMD', 'AVGO', 'TSM', 'ARM', 'MU', 'ASML', 'MRVL'],
    power_matrix: ['CEG', 'VST', 'GEV', 'PWR', 'CCJ', 'SMR', 'ETN'],
    bio_pulse: ['LLY', 'NVO', 'VRTX', 'REGN', 'VKTX', 'AMGN', 'GILD'],
    cyber_shield: ['CRWD', 'PANW', 'FTNT', 'ZS', 'S', 'OKTA', 'NET'],
    orbit_defense: ['LMT', 'RTX', 'AXON', 'KTOS', 'LDOS', 'ASTS', 'LUNR'],
    quantum_edge: ['SMCI', 'SNOW', 'IONQ', 'DELL', 'AI', 'PATH', 'TWLO'],
    fintech_pulse: ['XYZ', 'PYPL', 'COIN', 'SOFI', 'AFRM', 'HOOD', 'UPST'],
    cloud_fortress: ['CRM', 'NOW', 'DDOG', 'WDAY', 'MDB', 'TEAM', 'HUBS'],
};

/**
 * GET /api/intel/snapshot?sector=m7&date=2026-02-10
 * Retrieve latest or date-specific snapshot
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const sector = searchParams.get('sector');
    const date = searchParams.get('date');

    if (!sector) {
        return NextResponse.json(
            { error: 'Missing sector parameter' },
            { status: 400 }
        );
    }

    try {
        const snapshot = date
            ? await getSnapshotByDate(sector, date)
            : await getLatestSnapshot(sector);

        if (!snapshot) {
            return NextResponse.json(
                { error: 'No snapshot found', sector, date },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            snapshot: snapshot.data_json,
            snapshot_date: snapshot.snapshot_date,
            created_at: snapshot.created_at,
        });
    } catch (e: any) {
        console.error('[Snapshot API] GET error:', e);
        return NextResponse.json(
            { error: 'Failed to fetch snapshot' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/intel/snapshot
 * Body: { sector: 'm7' }
 * Triggered after market close to capture and save snapshot
 */
export async function POST(request: Request) {
    try {
        // Support both body JSON and query params
        let sector: string;
        try {
            const body = await request.json();
            sector = body.sector as string;
        } catch {
            // If no body, try query params
            const { searchParams } = new URL(request.url);
            sector = searchParams.get('sector') || '';
        }

        if (!sector || !SECTOR_TICKERS[sector]) {
            return NextResponse.json(
                { error: 'Invalid sector', valid: Object.keys(SECTOR_TICKERS) },
                { status: 400 }
            );
        }

        const baseUrl = request.url.split('/api/')[0];
        const tickers = SECTOR_TICKERS[sector];

        // ── Fetch current live data: fast (prices) + watchlist/batch (alpha/RSI/RVOL) ──
        const bypassHeaders: Record<string, string> = {};
        if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
            bypassHeaders['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
        }

        const [fastRes, batchRes] = await Promise.all([
            // 1. Price data from Polygon batch
            fetch(`${baseUrl}/api/intel/fast?sector=${sector}`, {
                cache: 'no-store',
                headers: bypassHeaders,
            }),
            // 2. Alpha scores, RSI, RVOL from watchlist/batch (real-time calculation)
            fetch(`${baseUrl}/api/watchlist/batch?tickers=${tickers.join(',')}`, {
                cache: 'no-store',
                headers: bypassHeaders,
            }).catch(() => null),
        ]);

        if (!fastRes.ok) {
            return NextResponse.json(
                { error: 'Failed to fetch live data for snapshot' },
                { status: 502 }
            );
        }

        const text = await fastRes.text();
        if (!text) {
            return NextResponse.json(
                { error: 'Empty response from live API' },
                { status: 502 }
            );
        }

        let liveData: any;
        try { liveData = JSON.parse(text); } catch {
            return NextResponse.json(
                { error: 'Invalid JSON from live API' },
                { status: 502 }
            );
        }

        if (!liveData?.data || liveData.data.length === 0) {
            return NextResponse.json(
                { error: 'No ticker data available' },
                { status: 502 }
            );
        }

        // Parse watchlist/batch data and build lookup map
        const batchMap: Record<string, any> = {};
        if (batchRes && batchRes.ok) {
            try {
                const batchJson = await batchRes.json();
                (batchJson?.results || batchJson?.data || []).forEach((r: any) => {
                    batchMap[r.ticker] = r;
                });
            } catch { /* batch data optional, fast data is sufficient for prices */ }
        }

        // ── Build snapshot data ──
        const now = new Date();
        const snapshotDate = now.toISOString().split('T')[0]; // YYYY-MM-DD

        // Next market close (approximate: next weekday at ET 21:00 UTC)
        const nextClose = new Date(now);
        nextClose.setDate(nextClose.getDate() + 1);
        // Skip weekends
        if (nextClose.getDay() === 0) nextClose.setDate(nextClose.getDate() + 1);
        if (nextClose.getDay() === 6) nextClose.setDate(nextClose.getDate() + 2);
        nextClose.setUTCHours(21, 0, 0, 0); // ET 16:00 = UTC 21:00

        const tickerSnapshots: TickerSnapshot[] = liveData.data.map((q: any) => {
            // Merge watchlist/batch data (alpha, RSI, RVOL, options) over fast data
            const batch = batchMap[q.ticker];
            const alphaScore = batch?.alphaSnapshot?.score ?? batch?.alpha?.score ?? q.alphaScore ?? 0;
            const grade = batch?.alphaSnapshot?.grade ?? batch?.alpha?.grade ?? q.grade ?? '-';
            const rsi = batch?.realtime?.rsi ?? q.rsi ?? 0;
            const rvol = batch?.realtime?.relVol ?? q.rvol ?? 0;
            const gex = batch?.flow?.netGex ?? q.gex ?? 0;
            const pcr = batch?.flow?.oiPcr ?? batch?.flow?.volumePcr ?? q.pcr ?? 0;
            const maxPain = batch?.flow?.maxPain ?? q.maxPain ?? 0;
            const callWall = batch?.flow?.callWall ?? q.callWall ?? 0;
            const putFloor = batch?.flow?.putFloor ?? q.putFloor ?? 0;

            const merged = { ...q, alphaScore, grade, rsi, rvol, gex, pcr, maxPain, callWall, putFloor };

            // Generate AI verdict based on merged indicators
            const verdict = generateVerdict(merged);
            const analysis = generateAnalysisKR(merged, verdict);

            return {
                ticker: q.ticker,
                close_price: q.price || 0,
                change_pct: q.changePct || 0,
                alpha_score: alphaScore,
                grade,
                volume: q.volume || 0,
                gex,
                pcr,
                gamma_regime: q.gammaRegime || 'NEUTRAL',
                max_pain: maxPain,
                call_wall: callWall,
                put_floor: putFloor,
                rsi,
                rvol,
                sparkline: q.sparkline || [],
                verdict,
                analysis_kr: analysis,
            };
        });

        // ── Build sector summary ──
        const gainers = tickerSnapshots.filter(t => t.change_pct > 0).length;
        const losers = tickerSnapshots.filter(t => t.change_pct < 0).length;
        const avgAlpha = tickerSnapshots.reduce((sum, t) => sum + t.alpha_score, 0) / tickerSnapshots.length;
        const avgPcr = tickerSnapshots.reduce((sum, t) => sum + t.pcr, 0) / tickerSnapshots.length;
        const totalGex = tickerSnapshots.reduce((sum, t) => sum + t.gex, 0);

        const regimeCounts = { LONG: 0, SHORT: 0, NEUTRAL: 0 };
        tickerSnapshots.forEach(t => {
            if (t.gamma_regime in regimeCounts) {
                regimeCounts[t.gamma_regime as keyof typeof regimeCounts]++;
            }
        });
        const dominantRegime = regimeCounts.LONG >= regimeCounts.SHORT ? 'LONG' : 'SHORT';

        const outlook = avgPcr < 0.8 ? 'BULLISH' : avgPcr > 1.2 ? 'BEARISH' : 'NEUTRAL';

        // ── [MACRO CONTEXT] Read from Redis only (Guardian already caches Yahoo data) ──
        let macroContext: SectorSummary['macroContext'] = undefined;
        try {
            const [redisVix, redisSpx, redisNq, redisTnx] = await Promise.all([
                getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.VIX),
                getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.SPX),
                getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.NQ),
                getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.TNX),
            ]);
            if (redisVix && redisSpx && redisNq && redisTnx) {
                macroContext = {
                    vix: { price: Math.round(redisVix.price * 100) / 100, changePct: Math.round(redisVix.changePct * 100) / 100 },
                    spx: { price: Math.round(redisSpx.price * 100) / 100, changePct: Math.round(redisSpx.changePct * 100) / 100 },
                    nq: { price: Math.round(redisNq.price * 100) / 100, changePct: Math.round(redisNq.changePct * 100) / 100 },
                    tnx: { price: Math.round(redisTnx.price * 100) / 100, changePct: Math.round(redisTnx.changePct * 100) / 100 },
                };
                console.log(`[Snapshot] Macro from Redis: VIX=${macroContext.vix.price}, SPX=${macroContext.spx.price}`);
            } else {
                console.log('[Snapshot] Macro data not in Redis yet, skipping macroContext');
            }
        } catch (macroErr) {
            console.warn('[Snapshot] Macro Redis read failed:', macroErr);
        }

        const briefingResult = generateNextDayBriefing(tickerSnapshots, {
            dominantRegime, avgPcr, totalGex, gainers, losers, outlook
        });

        // ── [NEWS DIGEST] Fetch M7 news + Gemini AI Insight ──
        let newsDigest: NewsDigestItem[] = [];
        let newsSentimentOverall: string = 'NEUTRAL';
        let newsDebugInfo: string = '';
        try {
            // Polygon API needs individual ticker calls (comma-separated not supported)
            const newsPromises = tickers.map(t => fetchStockNews([t], 3, true));
            const newsArrays = await Promise.all(newsPromises);
            const rawNews = newsArrays.flat();
            console.log(`[Snapshot] fetchStockNews returned ${rawNews.length} items from ${tickers.length} tickers`);
            if (rawNews.length > 0) console.log(`[Snapshot] First news: ${rawNews[0].headline}`);
            // Dedup by headline
            const seen = new Set<string>();
            const uniqueNews = rawNews.filter(n => {
                if (seen.has(n.headline)) return false;
                seen.add(n.headline);
                return true;
            }).slice(0, 8);

            if (uniqueNews.length > 0) {
                // Generate AI insights via Bedrock Claude Sonnet 4
                if (process.env.AWS_ACCESS_KEY_ID) {
                    try {
                        const newsForPrompt = uniqueNews.map((n, i) => ({
                            id: i,
                            title: n.headline,
                            desc: n.summaryKR || n.headline,
                            tickers: n.relatedTickers?.filter(t => tickers.includes(t)) || [],
                            sentiment: n.sentiment,
                        }));

                        const tickerContext = tickerSnapshots.map(t =>
                            `${t.ticker}: ${t.change_pct >= 0 ? '+' : ''}${t.change_pct.toFixed(2)}%, RSI ${t.rsi}, PCR ${t.pcr}, γ ${t.gamma_regime}`
                        ).join('; ');

                        const userPrompt = `Context: M7 sector today — ${tickerContext}
Outlook: ${outlook}, Dominant Gamma: ${dominantRegime}

Analyze these ${newsForPrompt.length} news items and provide investment insights:
${JSON.stringify(newsForPrompt)}

For each news item, provide:
1. insightKR: 한국어 투자 인사이트 (15-25자, 핵심 영향만. 예: "AI 인프라 지출 확대 → NVDA 수혜 지속")
2. insightEN: English investment insight (15-25 words, key impact. e.g. "AI infra spending surge benefits NVDA long-term")
3. insightJP: 日本語投資インサイト (15-25文字, 核心的影響のみ)
4. sentiment: "positive" | "negative" | "neutral" (based on actual market impact, not headline tone)
5. summaryKR: 한국어 번역 제목 (10-20자)
6. summaryJP: 日本語翻訳タイトル (10-20文字)

Also provide overallSentiment: "BULLISH" | "BEARISH" | "MIXED" | "NEUTRAL" based on the aggregate news tone.

Output MUST be valid JSON (no markdown):
{ "items": [ { "id": 0, "summaryKR": "...", "summaryJP": "...", "insightKR": "...", "insightEN": "...", "insightJP": "...", "sentiment": "..." } ], "overallSentiment": "..." }`;

                        const bedrockResult = await callBedrock({
                            system: 'You are SIGNUM Intelligence, an elite financial analyst. Return ONLY valid JSON.',
                            userPrompt,
                            maxTokens: 4096,
                            temperature: 0.3,
                            timeoutMs: 30000,
                            label: 'Snapshot/News',
                        });

                        const parsed = JSON.parse(bedrockResult.text);
                        const aiItems = parsed.items || [];
                        newsSentimentOverall = parsed.overallSentiment || 'NEUTRAL';

                        newsDigest = uniqueNews.slice(0, 6).map((n, i) => {
                            const ai = aiItems.find((a: any) => a.id === i) || {};
                            return {
                                headline: n.headline,
                                summaryKR: ai.summaryKR || n.summaryKR || n.headline,
                                summaryJP: ai.summaryJP || n.summaryJP || n.headline,
                                insightKR: ai.insightKR || '',
                                insightEN: ai.insightEN || '',
                                insightJP: ai.insightJP || '',
                                source: n.source,
                                sentiment: ai.sentiment || n.sentiment || 'neutral',
                                tickers: n.relatedTickers?.filter(t => tickers.includes(t)) || [],
                                publishedAt: n.publishedAt,
                            };
                        });
                        console.log(`[Snapshot] News Digest (Bedrock): ${newsDigest.length} items, overall: ${newsSentimentOverall}`);
                    } catch (aiErr: any) {
                        newsDebugInfo = `Bedrock failed: ${aiErr.message || aiErr}`;
                        console.warn('[Snapshot] Bedrock insight generation failed, using raw news:', aiErr);
                        newsDigest = uniqueNews.slice(0, 6).map(n => ({
                            headline: n.headline,
                            summaryKR: n.summaryKR || n.headline,
                            summaryJP: n.summaryJP || n.headline,
                            insightKR: '',
                            insightEN: '',
                            insightJP: '',
                            source: n.source,
                            sentiment: n.sentiment || 'neutral',
                            tickers: n.relatedTickers?.filter(t => tickers.includes(t)) || [],
                            publishedAt: n.publishedAt,
                        }));
                    }
                } else {
                    // No AWS credentials — raw news only
                    newsDigest = uniqueNews.slice(0, 6).map(n => ({
                        headline: n.headline,
                        summaryKR: n.summaryKR || n.headline,
                        summaryJP: n.summaryJP || n.headline,
                        insightKR: '',
                        insightEN: '',
                        insightJP: '',
                        source: n.source,
                        sentiment: n.sentiment || 'neutral',
                        tickers: n.relatedTickers?.filter(t => tickers.includes(t)) || [],
                        publishedAt: n.publishedAt,
                    }));
                }
            }
        } catch (newsErr) {
            console.warn('[Snapshot] News fetch failed, skipping digest:', newsErr);
        }

        const sectorSummary: SectorSummary = {
            avg_alpha: Math.round(avgAlpha * 10) / 10,
            gainers,
            losers,
            dominant_regime: dominantRegime,
            avg_pcr: Math.round(avgPcr * 100) / 100,
            total_gex: totalGex,
            outlook,
            next_day_briefing_kr: briefingResult.legacy,
            briefing: briefingResult.briefing,
            newsDigest: newsDigest.length > 0 ? newsDigest : undefined,
            newsSentimentOverall: newsDigest.length > 0 ? newsSentimentOverall : undefined,
            macroContext,
        };

        const snapshotData: SnapshotData = {
            meta: {
                snapshot_timestamp: now.toISOString(),
                sector,
                locked_until: nextClose.toISOString(),
            },
            tickers: tickerSnapshots,
            sector_summary: sectorSummary,
        };

        // ── Save to Supabase ──
        const result = await saveSnapshot(sector, snapshotDate, snapshotData);

        if (!result.success) {
            return NextResponse.json(
                { error: 'Failed to save snapshot', details: result.error },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            sector,
            snapshot_date: snapshotDate,
            tickers_count: tickerSnapshots.length,
            outlook: sectorSummary.outlook,
            news_count: newsDigest.length,
            news_sentiment: newsSentimentOverall,
            news_debug: newsDebugInfo || 'OK',
        });

    } catch (e: any) {
        console.error('[Snapshot API] POST error:', e);
        return NextResponse.json(
            { error: 'Failed to create snapshot', message: e.message },
            { status: 500 }
        );
    }
}

// ============================================================================
// AI Verdict Generation (rule-based, using available indicators)
// ============================================================================

function generateVerdict(q: any): string {
    const score = q.alphaScore || 0;
    const gex = q.gex || 0;
    const pcr = q.pcr || 1;
    const changePct = q.changePct || 0;
    const rsi = q.rsi || 0;
    const rvol = q.rvol || 0;

    // Strong signals
    if (score >= 70 && pcr < 0.7 && changePct > 1) return 'OVERSOLD_ZONE';
    if (score < 30 && pcr > 1.3 && changePct < -1) return 'ELEVATED_RISK';
    if (score >= 60 && gex < 0 && pcr < 0.8) return 'OVERSOLD_ZONE';
    if (score < 40 && gex < 0 && pcr > 1.1) return 'OVERBOUGHT_ZONE';

    // RSI-driven signals
    if (rsi > 0 && rsi < 30 && changePct < -1 && score >= 40) return 'OVERSOLD_ZONE';
    if (rsi > 70 && changePct > 2) return 'OVERBOUGHT_ZONE';
    if (rsi > 0 && rsi < 25 && pcr < 0.8) return 'OVERSOLD_ZONE';

    // Moderate signals
    if (changePct > 2 && pcr < 0.6) return 'OVERBOUGHT_ZONE';
    if (changePct < -2 && score >= 50) return 'OVERSOLD_ZONE';

    // RVOL conviction modifier
    if (rvol > 1.5 && changePct < -1.5 && score >= 45) return 'OVERSOLD_ZONE';
    if (rvol > 1.5 && changePct > 2 && pcr > 0.9) return 'OVERBOUGHT_ZONE';

    return 'HOLD';
}

function generateAnalysisKR(q: any, verdict: string): string {
    const t = q.ticker;
    const gex = q.gex || 0;
    const pcr = q.pcr || 1;
    const regime = q.gammaRegime || 'NEUTRAL';
    const changePct = (q.changePct || 0).toFixed(2);
    const maxPain = q.maxPain || 0;
    const price = q.price || 0;
    const callWall = q.callWall || 0;
    const putFloor = q.putFloor || 0;
    const rsi = q.rsi || 0;
    const rvol = q.rvol || 0;

    const regimeKR = regime === 'LONG' ? 'Long Gamma(변동성 억제)' :
        regime === 'SHORT' ? 'Short Gamma(변동성 확대)' : '중립';

    const pcrKR = pcr < 0.7 ? '강세 포지셔닝' :
        pcr > 1.2 ? '약세 포지셔닝' : '균형 포지셔닝';

    const maxPainDist = maxPain > 0 ? ((price - maxPain) / maxPain * 100).toFixed(1) : '0';
    const maxPainDir = parseFloat(maxPainDist) > 0 ? '상단' : '하단';

    // RSI description
    let rsiNote = '';
    if (rsi > 0) {
        const rsiVal = Math.round(rsi);
        if (rsi < 30) rsiNote = ` RSI ${rsiVal}(과매도).`;
        else if (rsi > 70) rsiNote = ` RSI ${rsiVal}(과매수).`;
        else rsiNote = ` RSI ${rsiVal}.`;
    }

    // RVOL description
    let rvolNote = '';
    if (rvol > 0) {
        const rvolVal = rvol.toFixed(1);
        if (rvol > 1.5) rvolNote = ` RVOL ${rvolVal}x(거래량 급증).`;
        else if (rvol < 0.5) rvolNote = ` RVOL ${rvolVal}x(거래량 부진).`;
        else rvolNote = ` RVOL ${rvolVal}x.`;
    }

    // Key level proximity
    let levelNote = '';
    if (callWall > 0 && price > 0) {
        const distToWall = ((callWall - price) / price * 100).toFixed(1);
        if (parseFloat(distToWall) < 2 && parseFloat(distToWall) > 0) {
            levelNote = ` Call Wall $${callWall} 근접(${distToWall}%), 돌파 시 감마스퀴즈 가능.`;
        }
    }
    if (putFloor > 0 && price > 0) {
        const distToFloor = ((price - putFloor) / price * 100).toFixed(1);
        if (parseFloat(distToFloor) < 2 && parseFloat(distToFloor) > 0) {
            levelNote = ` Put Floor $${putFloor} 근접(${distToFloor}%), 하방 지지 예상.`;
        }
    }

    const verdictKR: Record<string, string> = {
        'OVERSOLD_ZONE': '과매도 영역 진입 관측',
        'HOLD': '중립 구간 관측',
        'ELEVATED_RISK': '리스크 지표 상승 관측',
        'OVERBOUGHT_ZONE': '과매수 영역 진입 관측',
    };

    return `${changePct > '0' ? '▲' : '▼'} ${changePct}%.${rsiNote}${rvolNote} ${regimeKR}. PCR ${pcr.toFixed(2)} (${pcrKR}). Max Pain $${maxPain} 대비 ${maxPainDir} ${Math.abs(parseFloat(maxPainDist))}% 마감.${levelNote} [${verdictKR[verdict] || verdict}]`;
}

function generateNextDayBriefing(
    tickers: TickerSnapshot[],
    summary: { dominantRegime: string; avgPcr: number; totalGex: number; gainers: number; losers: number; outlook: string }
): { legacy: string; briefing: BriefingData } {
    const sorted = [...tickers].sort((a, b) => b.change_pct - a.change_pct);
    const topGainer = sorted[0];
    const topLoser = sorted[sorted.length - 1];

    const regimeKR = summary.dominantRegime === 'LONG' ? 'Long Gamma (변동성 억제)' : 'Short Gamma (변동성 확대 가능)';
    const regimeEN = summary.dominantRegime === 'LONG' ? 'Long Gamma (volatility suppressed)' : 'Short Gamma (volatility expansion possible)';
    const regimeJP = summary.dominantRegime === 'LONG' ? 'ロングガンマ（変動性抑制）' : 'ショートガンマ（変動性拡大可能）';

    const outlookKR = summary.outlook === 'BULLISH' ? '강세 편향' : summary.outlook === 'BEARISH' ? '약세 편향' : '중립';
    const outlookEN = summary.outlook === 'BULLISH' ? 'bullish bias' : summary.outlook === 'BEARISH' ? 'bearish bias' : 'neutral';
    const outlookJP = summary.outlook === 'BULLISH' ? '強気偏向' : summary.outlook === 'BEARISH' ? '弱気偏向' : '中立';

    const gammaCount = tickers.filter(t => t.gamma_regime === 'LONG').length;

    // ── Legacy string (backward compat) ──
    let legacy = `세션 결과: ${summary.gainers}↑ ${summary.losers}↓. `;
    legacy += `주도주 ${topGainer.ticker}(${topGainer.change_pct >= 0 ? '+' : ''}${topGainer.change_pct.toFixed(2)}%), `;
    legacy += `약세 ${topLoser.ticker}(${topLoser.change_pct.toFixed(2)}%). `;
    legacy += `감마 환경: ${gammaCount}/${tickers.length} ${regimeKR}. `;
    legacy += `PCR 평균 ${summary.avgPcr.toFixed(2)} → ${outlookKR}. `;

    // ── Structured briefing (3 languages) ──
    const allDown = summary.gainers === 0;
    const allUp = summary.losers === 0;
    const chgStr = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

    // Headlines
    let headline = '', headlineEN = '', headlineJP = '';
    if (allUp) {
        headline = `전 종목 상승 — ${topGainer.ticker} ${chgStr(topGainer.change_pct)} 선도, 리스크 온 모드`;
        headlineEN = `All stocks up — ${topGainer.ticker} ${chgStr(topGainer.change_pct)} leading, risk-on mode`;
        headlineJP = `全銘柄上昇 — ${topGainer.ticker} ${chgStr(topGainer.change_pct)} 主導、リスクオンモード`;
    } else if (allDown) {
        headline = `전 종목 하락 — ${topLoser.ticker} ${topLoser.change_pct.toFixed(2)}% 최대 낙폭, 방어적 환경 관측`;
        headlineEN = `All stocks down — ${topLoser.ticker} ${topLoser.change_pct.toFixed(2)}% largest drop, defensive environment observed`;
        headlineJP = `全銘柄下落 — ${topLoser.ticker} ${topLoser.change_pct.toFixed(2)}% 最大下落幅、防御的環境観測`;
    } else if (summary.gainers <= 2) {
        headline = `${topGainer.ticker} 주도 반등, 그러나 ${tickers.length}종 중 ${summary.losers}종 하락 — 변동성 지속 관측`;
        headlineEN = `${topGainer.ticker}-led rebound, but ${summary.losers} of ${tickers.length} still down — volatility persists`;
        headlineJP = `${topGainer.ticker}主導の反発、しかし${tickers.length}銘柄中${summary.losers}銘柄下落 — 変動性継続観測`;
    } else {
        headline = `${summary.gainers}종 상승 vs ${summary.losers}종 하락 — ${outlookKR} 장세, 혼조 환경 관측`;
        headlineEN = `${summary.gainers} up vs ${summary.losers} down — ${outlookEN} market, mixed conditions observed`;
        headlineJP = `${summary.gainers}銘柄上昇 vs ${summary.losers}銘柄下落 — ${outlookJP}相場、混在環境観測`;
    }

    // Bullets (KR / EN / JP)
    const bullets: string[] = [];
    const bulletsEN: string[] = [];
    const bulletsJP: string[] = [];

    // Bullet 1: Leader & Laggard
    if (topGainer.change_pct > 0) {
        bullets.push(`📈 주도주: <mark>${topGainer.ticker} ${chgStr(topGainer.change_pct)}</mark>${summary.gainers === 1 ? ', 유일한 상승 종목' : ` 외 ${summary.gainers - 1}종 상승`}`);
        bulletsEN.push(`📈 Leader: <mark>${topGainer.ticker} ${chgStr(topGainer.change_pct)}</mark>${summary.gainers === 1 ? ', sole gainer' : ` and ${summary.gainers - 1} others up`}`);
        bulletsJP.push(`📈 主導株: <mark>${topGainer.ticker} ${chgStr(topGainer.change_pct)}</mark>${summary.gainers === 1 ? '、唯一の上昇銘柄' : ` 他${summary.gainers - 1}銘柄上昇`}`);
    } else {
        bullets.push(`📉 전 종목 하락: 최소 낙폭 <mark>${topGainer.ticker} ${topGainer.change_pct.toFixed(2)}%</mark>`);
        bulletsEN.push(`📉 All down: smallest drop <mark>${topGainer.ticker} ${topGainer.change_pct.toFixed(2)}%</mark>`);
        bulletsJP.push(`📉 全銘柄下落: 最小下落幅 <mark>${topGainer.ticker} ${topGainer.change_pct.toFixed(2)}%</mark>`);
    }

    // Bullet 2: Gamma Regime
    const regimeEmoji = summary.dominantRegime === 'LONG' ? '🛡️' : '⚡';
    if (gammaCount === tickers.length) {
        bullets.push(`${regimeEmoji} 감마 환경: 전 종목 <mark>${summary.dominantRegime === 'LONG' ? 'Long Gamma' : 'Short Gamma'}</mark> — ${summary.dominantRegime === 'LONG' ? '변동성 억제 구간' : '변동성 확대 구간'}`);
        bulletsEN.push(`${regimeEmoji} Gamma: All <mark>${summary.dominantRegime === 'LONG' ? 'Long Gamma' : 'Short Gamma'}</mark> — ${summary.dominantRegime === 'LONG' ? 'volatility suppressed' : 'volatility expansion zone'}`);
        bulletsJP.push(`${regimeEmoji} ガンマ: 全銘柄 <mark>${summary.dominantRegime === 'LONG' ? 'ロングガンマ' : 'ショートガンマ'}</mark> — ${summary.dominantRegime === 'LONG' ? '変動性抑制区間' : '変動性拡大区間'}`);
    } else {
        bullets.push(`${regimeEmoji} 감마 환경: ${gammaCount}/${tickers.length} Long Gamma, <mark>${tickers.length - gammaCount}종 Short Gamma</mark> — 혼조세`);
        bulletsEN.push(`${regimeEmoji} Gamma: ${gammaCount}/${tickers.length} Long, <mark>${tickers.length - gammaCount} Short Gamma</mark> — mixed`);
        bulletsJP.push(`${regimeEmoji} ガンマ: ${gammaCount}/${tickers.length} ロング, <mark>${tickers.length - gammaCount}銘柄ショートガンマ</mark> — 混在`);
    }

    // Bullet 3: PCR & Outlook
    const pcrEmoji = summary.avgPcr < 0.8 ? '🟢' : summary.avgPcr > 1.2 ? '🔴' : '🟡';
    bullets.push(`${pcrEmoji} PCR 평균 <mark>${summary.avgPcr.toFixed(2)}</mark> → ${outlookKR}. ${summary.avgPcr < 0.8 ? '콜 우위 — 상방 기대' : summary.avgPcr > 1.2 ? '풋 우위 — 하방 압력' : '옵션 시장 중립적 포지셔닝'}`);
    bulletsEN.push(`${pcrEmoji} Avg PCR <mark>${summary.avgPcr.toFixed(2)}</mark> → ${outlookEN}. ${summary.avgPcr < 0.8 ? 'Call dominance — upside expected' : summary.avgPcr > 1.2 ? 'Put dominance — downside pressure' : 'Options market neutral positioning'}`);
    bulletsJP.push(`${pcrEmoji} PCR平均 <mark>${summary.avgPcr.toFixed(2)}</mark> → ${outlookJP}。${summary.avgPcr < 0.8 ? 'コール優位 — 上方期待' : summary.avgPcr > 1.2 ? 'プット優位 — 下方圧力' : 'オプション市場中立的ポジショニング'}`);

    // Bullet 4: Volume analysis
    const highVolTickers = tickers.filter(t => (t.rvol || 0) > 1.3);
    const lowVolTickers = tickers.filter(t => (t.rvol || 0) > 0 && (t.rvol || 0) < 0.7);
    if (highVolTickers.length > 0) {
        const volStr = highVolTickers.map(t => `${t.ticker} ${(t.rvol || 0).toFixed(1)}x`).join(', ');
        bullets.push(`📊 거래량 주목: ${volStr} — 평소 대비 높은 거래량, 추세 가속 가능`);
        bulletsEN.push(`📊 Volume alert: ${volStr} — above-average volume, trend acceleration possible`);
        bulletsJP.push(`📊 出来高注目: ${volStr} — 通常比高出来高、トレンド加速可能`);
    } else if (lowVolTickers.length > 0) {
        const volStr = lowVolTickers.map(t => `${t.ticker} ${(t.rvol || 0).toFixed(1)}x`).join(', ');
        bullets.push(`📊 거래량 감소: ${volStr} — 관망세 우세, 방향 결정 대기`);
        bulletsEN.push(`📊 Low volume: ${volStr} — wait-and-see dominates, direction pending`);
        bulletsJP.push(`📊 出来高減少: ${volStr} — 様子見優勢、方向性待ち`);
    }

    // Bullet 5: RSI extremes
    const oversold = tickers.filter(t => (t.rsi || 50) < 35);
    const overbought = tickers.filter(t => (t.rsi || 50) > 70);
    if (oversold.length > 0) {
        const rsiStr = oversold.map(t => `<mark>${t.ticker} RSI ${Math.round(t.rsi || 0)}</mark>`).join(', ');
        bullets.push(`⚠️ RSI 과매도 구간: ${rsiStr} — 기술적 반등 가능성 영역`);
        bulletsEN.push(`⚠️ RSI oversold: ${rsiStr} — potential technical bounce`);
        bulletsJP.push(`⚠️ RSI売られ過ぎ: ${rsiStr} — テクニカル反発の可能性`);
    } else if (overbought.length > 0) {
        const rsiStr = overbought.map(t => `<mark>${t.ticker} RSI ${Math.round(t.rsi || 0)}</mark>`).join(', ');
        bullets.push(`⚠️ RSI 과매수 구간: ${rsiStr} — 과열 영역 진입 관측`);
        bulletsEN.push(`⚠️ RSI overbought: ${rsiStr} — profit-taking pressure expected`);
        bulletsJP.push(`⚠️ RSI買われ過ぎ: ${rsiStr} — 利確売り圧力予想`);
    } else {
        const avgRsi = tickers.reduce((s, t) => s + (t.rsi || 50), 0) / tickers.length;
        bullets.push(`📐 RSI 평균 <mark>${Math.round(avgRsi)}</mark> — 과열/과매도 구간 아님, 중립 모멘텀`);
        bulletsEN.push(`📐 Avg RSI <mark>${Math.round(avgRsi)}</mark> — no extremes, neutral momentum`);
        bulletsJP.push(`📐 RSI平均 <mark>${Math.round(avgRsi)}</mark> — 過熱/売られ過ぎなし、中立モメンタム`);
    }

    // Bullet 6: Alpha score distribution
    const avgAlpha = tickers.reduce((s, t) => s + (t.alpha_score || 0), 0) / tickers.length;
    const gradeA = tickers.filter(t => t.grade === 'A' || t.grade === 'B').length;
    const gradeList = tickers.filter(t => t.grade === 'A' || t.grade === 'B').map(t => t.ticker).join(',');
    bullets.push(`🏆 Alpha 평균 <mark>${Math.round(avgAlpha)}</mark> — ${gradeA > 0 ? `B등급↑ ${gradeA}종목 (${gradeList})` : '전 종목 C등급 이하, 전반적 약세'}`);
    bulletsEN.push(`🏆 Avg Alpha <mark>${Math.round(avgAlpha)}</mark> — ${gradeA > 0 ? `${gradeA} B-grade+ (${gradeList})` : 'all below C-grade, overall weakness'}`);
    bulletsJP.push(`🏆 Alpha平均 <mark>${Math.round(avgAlpha)}</mark> — ${gradeA > 0 ? `B等級↑ ${gradeA}銘柄 (${gradeList})` : '全銘柄C等級以下、全般的弱勢'}`);

    // Watchpoints (KR / EN / JP)
    const watchpoints: string[] = [];
    const watchpointsEN: string[] = [];
    const watchpointsJP: string[] = [];

    const nearCallWall = tickers.filter(t =>
        t.call_wall > 0 && t.close_price > 0 &&
        ((t.call_wall - t.close_price) / t.close_price * 100) < 3
    );
    nearCallWall.forEach(t => {
        const dist = ((t.call_wall - t.close_price) / t.close_price * 100).toFixed(1);
        watchpoints.push(`🎯 ${t.ticker} Call Wall $${t.call_wall} 근접 (${dist}%), 돌파 시 감마 스퀴즈 가능`);
        watchpointsEN.push(`🎯 ${t.ticker} near Call Wall $${t.call_wall} (${dist}%), gamma squeeze possible on breakout`);
        watchpointsJP.push(`🎯 ${t.ticker} コールウォール $${t.call_wall} 接近 (${dist}%)、突破時ガンマスクイーズ可能`);
    });

    const nearPutFloor = tickers.filter(t =>
        t.put_floor > 0 && t.close_price > 0 &&
        ((t.close_price - t.put_floor) / t.close_price * 100) < 3
    );
    nearPutFloor.forEach(t => {
        const dist = ((t.close_price - t.put_floor) / t.close_price * 100).toFixed(1);
        watchpoints.push(`🛡️ ${t.ticker} Put Floor $${t.put_floor} 근접 (${dist}%), 하방 지지 예상`);
        watchpointsEN.push(`🛡️ ${t.ticker} near Put Floor $${t.put_floor} (${dist}%), downside support expected`);
        watchpointsJP.push(`🛡️ ${t.ticker} プットフロア $${t.put_floor} 接近 (${dist}%)、下方支持予想`);
    });

    if (watchpoints.length === 0) {
        watchpoints.push(`📊 주요 옵션 레벨 근접 종목 없음 — 레인지 내 등락 예상`);
        watchpointsEN.push(`📊 No tickers near key option levels — range-bound movement expected`);
        watchpointsJP.push(`📊 主要オプションレベル接近銘柄なし — レンジ内変動予想`);
    }

    // Legacy string watchpoints
    if (nearCallWall.length > 0) {
        legacy += `관전 포인트: ${nearCallWall.map(t => `${t.ticker} Call Wall $${t.call_wall} 근접`).join(', ')}.`;
    }

    return {
        legacy,
        briefing: {
            headline, headlineEN, headlineJP,
            bullets, bulletsEN, bulletsJP,
            watchpoints, watchpointsEN, watchpointsJP,
        }
    };
}

