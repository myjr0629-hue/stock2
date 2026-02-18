// ============================================================================
// /api/intel/snapshot — Sector Snapshot API
// POST: Save post-market snapshot (cron/manual trigger)
// GET:  Retrieve latest or specific-date snapshot
// ============================================================================

import { NextResponse } from 'next/server';
import { saveSnapshot, getLatestSnapshot, getSnapshotByDate } from '@/lib/supabase/snapshot';
import type { SnapshotData, TickerSnapshot, SectorSummary, NewsDigestItem } from '@/types/sector';
import { fetchStockNews } from '@/services/newsHubProvider';
import { GoogleGenAI } from '@google/genai';
import { getFromCache } from '@/services/redisClient';
import { YAHOO_CACHE_KEYS, type YahooQuote } from '@/services/yahooFinanceHub';

// Sector ticker lists
const SECTOR_TICKERS: Record<string, string[]> = {
    m7: ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'],
    physical_ai: ['PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG'],
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

        // ── Fetch current live data from existing Intel API ──
        const liveApiUrl = sector === 'm7'
            ? `${baseUrl}/api/intel/m7`
            : `${baseUrl}/api/intel/physicalai`;

        const res = await fetch(liveApiUrl, { cache: 'no-store' });
        if (!res.ok) {
            return NextResponse.json(
                { error: 'Failed to fetch live data for snapshot' },
                { status: 502 }
            );
        }

        const text = await res.text();
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
            // Generate AI verdict based on indicators
            const verdict = generateVerdict(q);
            const analysis = generateAnalysisKR(q, verdict);

            return {
                ticker: q.ticker,
                close_price: q.price || 0,
                change_pct: q.changePct || 0,
                alpha_score: q.alphaScore || 0,
                grade: q.grade || '-',
                volume: q.volume || 0,
                gex: q.gex || 0,
                pcr: q.pcr || 0,
                gamma_regime: q.gammaRegime || 'NEUTRAL',
                max_pain: q.maxPain || 0,
                call_wall: q.callWall || 0,
                put_floor: q.putFloor || 0,
                rsi: q.rsi || 0,
                rvol: q.rvol || 0,
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
                // Generate AI insights via Gemini (NEWS_KEY = Tier1 primary)
                const geminiKey = process.env.GEMINI_NEWS_KEY || process.env.GEMINI_VERDICT_KEY || process.env.GEMINI_API_KEY;
                console.log(`[Snapshot] uniqueNews: ${uniqueNews.length}, geminiKey: ${geminiKey ? 'YES (' + geminiKey.substring(0, 8) + '...)' : 'MISSING'}`);
                if (geminiKey) {
                    try {
                        const genAI = new GoogleGenAI({ apiKey: geminiKey });
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

                        const prompt = `You are SIGNUM Intelligence, an elite financial analyst.
Context: M7 sector today — ${tickerContext}
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

                        const result = await genAI.models.generateContent({
                            model: 'gemini-2.5-flash',
                            contents: prompt,
                        });

                        const responseText = (result.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
                        if (!responseText) throw new Error('Gemini returned empty response');
                        const parsed = JSON.parse(responseText);
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
                        console.log(`[Snapshot] News Digest: ${newsDigest.length} items, overall: ${newsSentimentOverall}`);
                    } catch (aiErr: any) {
                        newsDebugInfo = `Gemini failed: ${aiErr.message || aiErr}`;
                        console.warn('[Snapshot] Gemini insight generation failed, using raw news:', aiErr);
                        // Fallback: use news without AI insight
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
                    // No Gemini key — raw news only
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
    if (score >= 70 && pcr < 0.7 && changePct > 1) return 'BUY_DIP';
    if (score < 30 && pcr > 1.3 && changePct < -1) return 'HEDGE';
    if (score >= 60 && gex < 0 && pcr < 0.8) return 'BUY_DIP';
    if (score < 40 && gex < 0 && pcr > 1.1) return 'TRIM';

    // RSI-driven signals
    if (rsi > 0 && rsi < 30 && changePct < -1 && score >= 40) return 'BUY_DIP';  // Oversold + dip on decent stock
    if (rsi > 70 && changePct > 2) return 'TRIM';  // Overbought + overextended
    if (rsi > 0 && rsi < 25 && pcr < 0.8) return 'BUY_DIP';  // Deep oversold + bullish options

    // Moderate signals
    if (changePct > 2 && pcr < 0.6) return 'TRIM';  // Overextended
    if (changePct < -2 && score >= 50) return 'BUY_DIP';  // Dip on strong stock

    // RVOL conviction modifier: high volume confirms weak signals
    if (rvol > 1.5 && changePct < -1.5 && score >= 45) return 'BUY_DIP';  // High vol selloff on OK stock
    if (rvol > 1.5 && changePct > 2 && pcr > 0.9) return 'TRIM';  // High vol rally with put pressure

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
        'BUY_DIP': '조정 시 매수 기회',
        'HOLD': '보유 유지',
        'HEDGE': '헷지 권고',
        'TRIM': '일부 차익실현 고려',
    };

    return `${changePct > '0' ? '▲' : '▼'} ${changePct}%.${rsiNote}${rvolNote} ${regimeKR}. PCR ${pcr.toFixed(2)} (${pcrKR}). Max Pain $${maxPain} 대비 ${maxPainDir} ${Math.abs(parseFloat(maxPainDist))}% 마감.${levelNote} [${verdictKR[verdict] || verdict}]`;
}

function generateNextDayBriefing(
    tickers: TickerSnapshot[],
    summary: { dominantRegime: string; avgPcr: number; totalGex: number; gainers: number; losers: number; outlook: string }
): { legacy: string; briefing: { headline: string; bullets: string[]; watchpoints: string[] } } {
    const sorted = [...tickers].sort((a, b) => b.change_pct - a.change_pct);
    const topGainer = sorted[0];
    const topLoser = sorted[sorted.length - 1];

    const regimeKR = summary.dominantRegime === 'LONG' ? 'Long Gamma (변동성 억제)' : 'Short Gamma (변동성 확대 가능)';
    const outlookKR = summary.outlook === 'BULLISH' ? '강세 편향' : summary.outlook === 'BEARISH' ? '약세 편향' : '중립';

    const gammaCount = tickers.filter(t => t.gamma_regime === 'LONG').length;

    // ── Legacy string (backward compat) ──
    let legacy = `세션 결과: ${summary.gainers}↑ ${summary.losers}↓. `;
    legacy += `주도주 ${topGainer.ticker}(${topGainer.change_pct >= 0 ? '+' : ''}${topGainer.change_pct.toFixed(2)}%), `;
    legacy += `약세 ${topLoser.ticker}(${topLoser.change_pct.toFixed(2)}%). `;
    legacy += `감마 환경: ${gammaCount}/${tickers.length} ${regimeKR}. `;
    legacy += `PCR 평균 ${summary.avgPcr.toFixed(2)} → ${outlookKR}. `;

    // ── Structured briefing ──
    // Headline
    const allDown = summary.gainers === 0;
    const allUp = summary.losers === 0;
    let headline = '';
    if (allUp) {
        headline = `전 종목 상승 — ${topGainer.ticker} ${topGainer.change_pct >= 0 ? '+' : ''}${topGainer.change_pct.toFixed(2)}% 선도, 리스크 온 모드`;
    } else if (allDown) {
        headline = `전 종목 하락 — ${topLoser.ticker} ${topLoser.change_pct.toFixed(2)}% 최대 낙폭, 방어 전환 필요`;
    } else if (summary.gainers <= 2) {
        headline = `${topGainer.ticker} 주도 반등, 그러나 ${tickers.length}종 중 ${summary.losers}종 하락 — 변동성은 여전하다`;
    } else {
        headline = `${summary.gainers}종 상승 vs ${summary.losers}종 하락 — ${outlookKR} 장세, 선별적 접근 필요`;
    }

    // Bullets
    const bullets: string[] = [];
    // Bullet 1: Leader & Laggard
    if (topGainer.change_pct > 0) {
        bullets.push(`📈 주도주: <mark>${topGainer.ticker} ${topGainer.change_pct >= 0 ? '+' : ''}${topGainer.change_pct.toFixed(2)}%</mark>${summary.gainers === 1 ? ', 유일한 상승 종목' : ` 외 ${summary.gainers - 1}종 상승`}`);
    } else {
        bullets.push(`📉 전 종목 하락: 최소 낙폭 <mark>${topGainer.ticker} ${topGainer.change_pct.toFixed(2)}%</mark>`);
    }
    // Bullet 2: Gamma Regime
    const regimeEmoji = summary.dominantRegime === 'LONG' ? '🛡️' : '⚡';
    if (gammaCount === tickers.length) {
        bullets.push(`${regimeEmoji} 감마 환경: 전 종목 <mark>${summary.dominantRegime === 'LONG' ? 'Long Gamma' : 'Short Gamma'}</mark> — ${summary.dominantRegime === 'LONG' ? '변동성 억제 구간' : '변동성 확대 구간'}`);
    } else {
        bullets.push(`${regimeEmoji} 감마 환경: ${gammaCount}/${tickers.length} Long Gamma, <mark>${tickers.length - gammaCount}종 Short Gamma</mark> — 혼조세`);
    }
    // Bullet 3: PCR & Outlook
    const pcrEmoji = summary.avgPcr < 0.8 ? '🟢' : summary.avgPcr > 1.2 ? '🔴' : '🟡';
    bullets.push(`${pcrEmoji} PCR 평균 <mark>${summary.avgPcr.toFixed(2)}</mark> → ${outlookKR}. ${summary.avgPcr < 0.8 ? '콜 우위 — 상방 기대' : summary.avgPcr > 1.2 ? '풋 우위 — 하방 압력' : '옵션 시장 중립적 포지셔닝'}`);

    // Bullet 4: Volume analysis
    const highVolTickers = tickers.filter(t => (t.rvol || 0) > 1.3);
    const lowVolTickers = tickers.filter(t => (t.rvol || 0) > 0 && (t.rvol || 0) < 0.7);
    if (highVolTickers.length > 0) {
        bullets.push(`📊 거래량 주목: ${highVolTickers.map(t => `${t.ticker} ${(t.rvol || 0).toFixed(1)}x`).join(', ')} — 평소 대비 높은 거래량, 추세 가속 가능`);
    } else if (lowVolTickers.length > 0) {
        bullets.push(`📊 거래량 감소: ${lowVolTickers.map(t => `${t.ticker} ${(t.rvol || 0).toFixed(1)}x`).join(', ')} — 관망세 우세, 방향 결정 대기`);
    }

    // Bullet 5: RSI extremes
    const oversold = tickers.filter(t => (t.rsi || 50) < 35);
    const overbought = tickers.filter(t => (t.rsi || 50) > 70);
    if (oversold.length > 0) {
        bullets.push(`⚠️ RSI 과매도 구간: ${oversold.map(t => `<mark>${t.ticker} RSI ${Math.round(t.rsi || 0)}</mark>`).join(', ')} — 기술적 반등 가능성 주시`);
    } else if (overbought.length > 0) {
        bullets.push(`⚠️ RSI 과매수 구간: ${overbought.map(t => `<mark>${t.ticker} RSI ${Math.round(t.rsi || 0)}</mark>`).join(', ')} — 차익실현 압력 예상`);
    } else {
        const avgRsi = tickers.reduce((s, t) => s + (t.rsi || 50), 0) / tickers.length;
        bullets.push(`📐 RSI 평균 <mark>${Math.round(avgRsi)}</mark> — 과열/과매도 구간 아님, 중립 모멘텀`);
    }

    // Bullet 6: Alpha score distribution
    const avgAlpha = tickers.reduce((s, t) => s + (t.alpha_score || 0), 0) / tickers.length;
    const gradeA = tickers.filter(t => t.grade === 'A' || t.grade === 'B').length;
    bullets.push(`🏆 Alpha 평균 <mark>${Math.round(avgAlpha)}</mark> — ${gradeA > 0 ? `B등급↑ ${gradeA}종목 (${tickers.filter(t => t.grade === 'A' || t.grade === 'B').map(t => t.ticker).join(',')})` : '전 종목 C등급 이하, 전반적 약세'}`);

    // Watchpoints
    const watchpoints: string[] = [];
    const nearCallWall = tickers.filter(t =>
        t.call_wall > 0 && t.close_price > 0 &&
        ((t.call_wall - t.close_price) / t.close_price * 100) < 3
    );
    nearCallWall.forEach(t => {
        const dist = ((t.call_wall - t.close_price) / t.close_price * 100).toFixed(1);
        watchpoints.push(`🎯 ${t.ticker} Call Wall $${t.call_wall} 근접 (${dist}%), 돌파 시 감마 스퀴즈 가능`);
    });

    const nearPutFloor = tickers.filter(t =>
        t.put_floor > 0 && t.close_price > 0 &&
        ((t.close_price - t.put_floor) / t.close_price * 100) < 3
    );
    nearPutFloor.forEach(t => {
        const dist = ((t.close_price - t.put_floor) / t.close_price * 100).toFixed(1);
        watchpoints.push(`🛡️ ${t.ticker} Put Floor $${t.put_floor} 근접 (${dist}%), 하방 지지 예상`);
    });

    if (watchpoints.length === 0) {
        watchpoints.push(`📊 주요 옵션 레벨 근접 종목 없음 — 레인지 내 등락 예상`);
    }

    // Legacy string watchpoints
    if (nearCallWall.length > 0) {
        legacy += `관전 포인트: ${nearCallWall.map(t => `${t.ticker} Call Wall $${t.call_wall} 근접`).join(', ')}.`;
    }

    return { legacy, briefing: { headline, bullets, watchpoints } };
}

