import { NextRequest, NextResponse } from 'next/server';
import { fetchStockNews } from '@/services/newsHubProvider';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get('t');
    if (!ticker) return NextResponse.json({ items: [] });

    const startTime = Date.now();
    try {
        // Use Global News Hub (Massive API + Gemini Translation)
        // This replaces the old Google RSS Scraper (Native KR).
        const newsItems = await fetchStockNews([ticker], 10);

        const items = newsItems.map(item => ({
            title: item.summaryKR || item.headline, // Use Korean summary as display title
            originalTitle: item.headline,
            url: item.link || "#",
            source: item.source,
            publishedAtEt: item.publishedAtET,
            ageHours: item.catalystAge,
            tag: item.catalystType ? item.catalystType.toUpperCase() : "GENERAL",
            time: item.publishedAt,
            sentiment: item.sentiment,
            isRumor: item.summaryKR.includes('[루머') // Rough check if rumor labeled
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
            debug: {
                fetched: items.length,
                latencyMs: Date.now() - startTime
            }
        });


    } catch (e) {
        console.error("News API Error:", e);
        return NextResponse.json({ items: [], error: "Failed to fetch news" });
    }
}
