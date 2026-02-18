import { NextRequest, NextResponse } from 'next/server';
import { fetchStockNews } from '@/services/newsHubProvider';
import { getFromCache } from '@/services/redisClient';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get('t');
    const isQuick = searchParams.get('quick') === '1';
    if (!ticker) return NextResponse.json({ items: [] });

    const startTime = Date.now();
    try {
        // [Quick Mode] Skip market context + AI analysis for instant response
        let marketContext: string | undefined;
        if (!isQuick) {
            try {
                // Try to get live market data from Redis (set by other API calls)
                const [rsiData, structData, quoteData] = await Promise.all([
                    getFromCache(`sma:${ticker}`).catch(() => null),
                    getFromCache(`options:structure:${ticker}`).catch(() => null),
                    getFromCache(`quote:${ticker}`).catch(() => null),
                ]);

                const contextParts: string[] = [];

                if (rsiData) {
                    const sma = typeof rsiData === 'string' ? JSON.parse(rsiData) : rsiData;
                    if (sma.rsi14) contextParts.push(`RSI(14): ${Math.round(sma.rsi14)}`);
                    if (sma.sma20) contextParts.push(`SMA20: $${sma.sma20}`);
                    if (sma.sma50) contextParts.push(`SMA50: $${sma.sma50}`);
                }

                if (structData) {
                    const struct = typeof structData === 'string' ? JSON.parse(structData) : structData;
                    if (struct.pcr) contextParts.push(`PCR: ${struct.pcr}`);
                    if (struct.gammaProfile?.netGex) contextParts.push(`GEX: ${struct.gammaProfile.netGex > 0 ? '+' : ''}${(struct.gammaProfile.netGex / 1e6).toFixed(1)}M`);
                    if (struct.gammaProfile?.regime) contextParts.push(`Gamma Regime: ${struct.gammaProfile.regime}`);
                    if (struct.callWall) contextParts.push(`Call Wall: $${struct.callWall}`);
                    if (struct.putFloor) contextParts.push(`Put Floor: $${struct.putFloor}`);
                    if (struct.maxPain) contextParts.push(`Max Pain: $${struct.maxPain}`);
                }

                if (quoteData) {
                    const quote = typeof quoteData === 'string' ? JSON.parse(quoteData) : quoteData;
                    if (quote.price) contextParts.push(`Current Price: $${quote.price}`);
                    if (quote.changePct !== undefined) contextParts.push(`Change: ${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(2)}%`);
                }

                if (contextParts.length > 0) {
                    marketContext = `${ticker}: ${contextParts.join(', ')}`;
                    console.log(`[News API] Market context for ${ticker}: ${marketContext}`);
                }
            } catch (ctxErr) {
                // Market context is optional — proceed without it
                console.warn('[News API] Failed to build market context:', ctxErr);
            }
        }

        // Use Global News Hub (Massive API + Gemini Translation + AI Analysis)
        // Fetch 10, Gemini selects top 5 by impact (dedup + relevance)
        const newsItems = await fetchStockNews([ticker], 10, isQuick, marketContext);

        const items = newsItems.map(item => ({
            title: item.headline, // Original English headline
            summaryKR: item.summaryKR || null, // Korean translation
            summaryJP: item.summaryJP || null, // Japanese translation
            analysisKR: item.analysisKR || null, // AI market interpretation (Korean)
            analysisEN: item.analysisEN || null, // AI market interpretation (English)
            analysisJP: item.analysisJP || null, // AI market interpretation (Japanese)
            originalTitle: item.headline,
            url: item.link || "#",
            source: item.source,
            publishedAtEt: item.publishedAtET,
            ageHours: item.catalystAge,
            tag: item.catalystType ? item.catalystType.toUpperCase() : "GENERAL",
            time: item.publishedAt,
            sentiment: item.sentiment,
            isRumor: item.summaryKR?.includes('[루머') || false
        }));

        // Calculate sentiment aggregation
        const positive = items.filter(i => i.sentiment === 'positive').length;
        const negative = items.filter(i => i.sentiment === 'negative').length;
        const neutral = items.filter(i => i.sentiment === 'neutral').length;
        const total = items.length || 1;

        const sentimentScore = Math.round(((positive - negative) / total + 1) * 50); // 0-100 scale
        let sentimentLabel = '중립';
        let sentimentColor = 'text-white';
        if (sentimentScore >= 70) { sentimentLabel = '긍정'; sentimentColor = 'text-emerald-400'; }
        else if (sentimentScore >= 55) { sentimentLabel = '양호'; sentimentColor = 'text-cyan-400'; }
        else if (sentimentScore <= 30) { sentimentLabel = '부정'; sentimentColor = 'text-rose-400'; }
        else if (sentimentScore <= 45) { sentimentLabel = '주의'; sentimentColor = 'text-amber-400'; }

        return NextResponse.json({
            ticker,
            items,
            sentiment: {
                score: sentimentScore,
                label: sentimentLabel,
                color: sentimentColor,
                breakdown: { positive, negative, neutral }
            },
            source: "MassiveAPI+Gemini",
            sourceGrade: "A+",
            hasAIAnalysis: items.some(i => i.analysisKR || i.analysisEN),
            debug: {
                fetched: items.length,
                latencyMs: Date.now() - startTime,
                hasMarketContext: !!marketContext
            }
        });


    } catch (e) {
        console.error("News API Error:", e);
        return NextResponse.json({ items: [], error: "Failed to fetch news" });
    }
}
