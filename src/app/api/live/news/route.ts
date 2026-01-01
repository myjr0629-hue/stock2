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
            isRumor: item.summaryKR.includes('[루머') // Rough check if rumor labeled
        }));

        return NextResponse.json({
            ticker,
            items,
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
