// [S-50.0] NewsHub Provider - Stock & Market News
// Source: Massive (Polygon) API for stock news + Static JSON for market headlines

import path from 'path';
import fs from 'fs';

import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";

export interface NewsItem {
    id: string;
    headline: string;
    summaryKR: string;       // Korean summary
    source: string;
    publishedAt: string;     // ISO datetime
    publishedAtET: string;   // Formatted ET time
    sentiment: "positive" | "negative" | "neutral";
    relatedTickers?: string[];
    catalystType?: string;   // earnings, deal, lawsuit, regulatory, etc.
    catalystAge: number;     // Hours since publication
    isStale: boolean;        // > 72h = stale (for engine penalty)
}

// [S-53.8] Like/Dislike item with source transparency
export interface LikeDislikeItem {
    text: string;
    source: string;
    publishedAtET: string;
    isStale: boolean;
    catalystAgeHours: number;
}

interface NewsHubSnapshot {
    asOfET: string;
    marketHeadlines: NewsItem[];   // Top 5 market news
    stockNews: NewsItem[];         // Stock-specific news
    marketLikes: LikeDislikeItem[];      // [S-53.8] Now objects with source/time
    marketDislikes: LikeDislikeItem[];   // [S-53.8] Now objects with source/time
}

const MARKET_HEADLINES_PATH = path.join(process.cwd(), 'src', 'data', 'marketHeadlines.static.json');

// Load static market headlines
function loadMarketHeadlines(): NewsItem[] {
    try {
        if (fs.existsSync(MARKET_HEADLINES_PATH)) {
            const raw = fs.readFileSync(MARKET_HEADLINES_PATH, 'utf-8');
            const items = JSON.parse(raw);
            return items.map((item: any) => ({
                ...item,
                publishedAtET: item.publishedAt ? formatETTime(item.publishedAt) : '',
                catalystAge: calculateAge(item.publishedAt),
                isStale: calculateAge(item.publishedAt) > 72
            }));
        }
    } catch (e) {
        console.error('[NewsHub] Failed to load market headlines:', e);
    }
    return [];
}

function calculateAge(isoDate: string): number {
    const published = new Date(isoDate);
    const now = new Date();
    return Math.floor((now.getTime() - published.getTime()) / (1000 * 60 * 60));
}

function formatETTime(isoDate: string): string {
    return new Date(isoDate).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Fetch stock news from Massive (Polygon) API
export async function fetchStockNews(tickers: string[], limit: number = 10): Promise<NewsItem[]> {
    try {
        const tickerStr = tickers.join(',');
        const endpoint = `/v2/reference/news?ticker=${tickerStr}&limit=${limit}&order=desc&sort=published_utc`;

        const data = await fetchMassive(endpoint, {}, true, undefined, CACHE_POLICY.DISPLAY_NEWS);
        if (!data.results || !Array.isArray(data.results)) {
            return [];
        }

        return data.results.map((article: any, idx: number) => {
            const publishedAt = article.published_utc || new Date().toISOString();
            const age = calculateAge(publishedAt);

            // Simple sentiment detection from keywords
            let sentiment: "positive" | "negative" | "neutral" = "neutral";
            const title = (article.title || "").toLowerCase();
            if (title.includes('surge') || title.includes('rally') || title.includes('beat') || title.includes('upgrade')) {
                sentiment = 'positive';
            } else if (title.includes('drop') || title.includes('fall') || title.includes('miss') || title.includes('downgrade') || title.includes('investigation')) {
                sentiment = 'negative';
            }

            // Detect catalyst type
            let catalystType = undefined;
            if (title.includes('earning') || title.includes('revenue') || title.includes('guidance')) {
                catalystType = 'earnings';
            } else if (title.includes('lawsuit') || title.includes('sue') || title.includes('investigation')) {
                catalystType = 'lawsuit';
            } else if (title.includes('deal') || title.includes('acquire') || title.includes('merger')) {
                catalystType = 'deal';
            } else if (title.includes('fda') || title.includes('approval') || title.includes('regulatory')) {
                catalystType = 'regulatory';
            }

            return {
                id: article.id || `news-${idx}`,
                headline: article.title || "No Title",
                summaryKR: article.description?.substring(0, 100) || article.title || "—", // TODO: Translate
                source: article.publisher?.name || "Unknown",
                publishedAt,
                publishedAtET: formatETTime(publishedAt),
                sentiment,
                relatedTickers: article.tickers || [],
                catalystType,
                catalystAge: age,
                isStale: age > 72
            };
        });
    } catch (e) {
        console.error('[NewsHub] Failed to fetch stock news:', e);
        return [];
    }
}

// Derive market sentiment from news
// [S-53.3] Use summaryKR ?? headline priority for Korean display
// [S-53.8] Now returns LikeDislikeItem[] with source transparency
function deriveMarketSentiment(news: NewsItem[]): { likes: LikeDislikeItem[], dislikes: LikeDislikeItem[] } {
    const likes: LikeDislikeItem[] = [];
    const dislikes: LikeDislikeItem[] = [];

    // [S-53.8] Filter fresh news first, sort by recency
    const sortedNews = [...news].sort((a, b) => b.catalystAge - a.catalystAge);
    const positiveNews = sortedNews.filter(n => n.sentiment === 'positive' && !n.isStale);
    const negativeNews = sortedNews.filter(n => n.sentiment === 'negative' && !n.isStale);

    // [S-53.8] Also include stale items as fallback with marking
    const stalePositive = sortedNews.filter(n => n.sentiment === 'positive' && n.isStale);
    const staleNegative = sortedNews.filter(n => n.sentiment === 'negative' && n.isStale);

    // Fresh items first
    positiveNews.slice(0, 2).forEach(n => {
        const text = n.summaryKR || n.headline;
        likes.push({
            text: text.length > 50 ? text.substring(0, 50) + '...' : text,
            source: n.source || 'Unknown',
            publishedAtET: n.publishedAtET || '',
            isStale: false,
            catalystAgeHours: n.catalystAge
        });
    });

    negativeNews.slice(0, 2).forEach(n => {
        const text = n.summaryKR || n.headline;
        dislikes.push({
            text: text.length > 50 ? text.substring(0, 50) + '...' : text,
            source: n.source || 'Unknown',
            publishedAtET: n.publishedAtET || '',
            isStale: false,
            catalystAgeHours: n.catalystAge
        });
    });

    // [S-53.8] Fill with stale if not enough fresh
    if (likes.length < 2 && stalePositive.length > 0) {
        stalePositive.slice(0, 2 - likes.length).forEach(n => {
            const text = n.summaryKR || n.headline;
            likes.push({
                text: text.length > 50 ? text.substring(0, 50) + '...' : text,
                source: n.source || 'Unknown',
                publishedAtET: n.publishedAtET || '',
                isStale: true,
                catalystAgeHours: n.catalystAge
            });
        });
    }

    if (dislikes.length < 2 && staleNegative.length > 0) {
        staleNegative.slice(0, 2 - dislikes.length).forEach(n => {
            const text = n.summaryKR || n.headline;
            dislikes.push({
                text: text.length > 50 ? text.substring(0, 50) + '...' : text,
                source: n.source || 'Unknown',
                publishedAtET: n.publishedAtET || '',
                isStale: true,
                catalystAgeHours: n.catalystAge
            });
        });
    }

    // Default fallback
    if (likes.length === 0) {
        likes.push({ text: "뚜렷한 긍정 촉매 없음", source: "System", publishedAtET: "", isStale: false, catalystAgeHours: 0 });
    }
    if (dislikes.length === 0) {
        dislikes.push({ text: "뚜렷한 부정 촉매 없음", source: "System", publishedAtET: "", isStale: false, catalystAgeHours: 0 });
    }

    return { likes, dislikes };
}

// Main snapshot function
export async function getNewsHubSnapshot(tickers: string[] = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMZN']): Promise<NewsHubSnapshot> {
    const now = new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York',
        dateStyle: 'short',
        timeStyle: 'short'
    });

    const marketHeadlines = loadMarketHeadlines();
    const stockNews = await fetchStockNews(tickers, 15);
    const allNews = [...marketHeadlines, ...stockNews];
    const { likes, dislikes } = deriveMarketSentiment(allNews);

    return {
        asOfET: now,
        marketHeadlines: marketHeadlines.slice(0, 5),
        stockNews: stockNews.slice(0, 10),
        marketLikes: likes,
        marketDislikes: dislikes
    };
}

// For engine integration: check if ticker has fresh catalyst
export function hasRecentCatalyst(news: NewsItem[], ticker: string): boolean {
    return news.some(n =>
        n.relatedTickers?.includes(ticker) &&
        !n.isStale &&
        n.catalystType !== undefined
    );
}
