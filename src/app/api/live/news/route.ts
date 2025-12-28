import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get('t');
    if (!ticker) return NextResponse.json({ items: [] });

    const startTime = Date.now();
    try {
        // Query Strategy: Build 2 queries
        const queries = [`${ticker} 주가`, `${ticker} 전망`];
        // Note: We don't have company name easily here without another API call, 
        // using "{TICKER} 주가" and "{TICKER} 전망" as stable defaults.

        const fetchNews = async (q: string) => {
            const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`;
            const res = await fetch(url, { next: { revalidate: 600 } });
            if (!res.ok) return "";
            return await res.text();
        };

        const xmls = await Promise.all(queries.map(fetchNews));

        const items: any[] = [];
        const seenUrls = new Set<string>();
        const now = new Date();
        const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

        xmls.forEach(xml => {
            // Simple regex parser for RSS <item>
            const itemRegex = /<item>([\s\S]*?)<\/item>/g;
            let match;
            while ((match = itemRegex.exec(xml)) !== null) {
                const content = match[1];
                const title = content.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/&amp;/g, '&').replace(/&quot;/g, '"') || "";
                const link = content.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "";
                const pubDateStr = content.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";
                const source = content.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || "Google News";

                if (!title || !link || seenUrls.has(link)) continue;

                const pubDate = new Date(pubDateStr);
                if (isNaN(pubDate.getTime()) || pubDate < fortyEightHoursAgo) continue;

                const ageHours = Math.floor((now.getTime() - pubDate.getTime()) / (1000 * 60 * 60));

                // Convert to ET
                const etFormatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: 'America/New_York',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
                const parts = etFormatter.formatToParts(pubDate);
                const getPart = (type: string) => parts.find(p => p.type === type)?.value;
                const publishedAtEt = `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')} ET`;

                const getTag = (title: string) => {
                    const lowerTitle = title.toLowerCase();
                    if (lowerTitle.match(/실적|어닝|매출|eps|실적발표/)) return "EARNINGS";
                    if (lowerTitle.match(/전망|가이던스|예상|목표/)) return "GUIDANCE";
                    if (lowerTitle.match(/급등|급락|변동성|옵션|폭등|폭락/)) return "VOLATILITY";
                    if (lowerTitle.match(/규제|조사|소송|법원|제재/)) return "REGULATION";
                    if (lowerTitle.match(/금리|연준|cpi|인플레이션|경기/)) return "MACRO";
                    return "GENERAL";
                };

                items.push({
                    title,
                    url: link,
                    source,
                    publishedAtEt,
                    ageHours,
                    tag: getTag(title),
                    time: pubDate.toISOString()
                });
                seenUrls.add(link);
            }
        });

        // Rank by recency
        const sorted = items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 5);

        return NextResponse.json({
            ticker,
            items: sorted,
            source: "GoogleNewsRSS",
            sourceGrade: sorted.length > 0 ? "A" : "B",
            debug: {
                fetched: items.length,
                deduped: seenUrls.size,
                latencyMs: Date.now() - startTime
            }
        });

    } catch (e) {
        console.error("News API Error:", e);
        return NextResponse.json({ items: [], error: "Failed to fetch news" });
    }
}
