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
    link?: string;           // Article URL
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

// Google Gemini Integration
import { GoogleGenAI } from "@google/genai";
// @ts-ignore
import translate from "google-translate-api-x";

const MODEL_NAME = "gemini-2.5-flash"; // [STABLE] Fast & Reliable

interface AIAnalysisResult {
    id: string;
    summaryKR: string;
    isRumor: boolean;
}

let genAI: GoogleGenAI | null = null;

function getGenAIClient() {
    if (genAI) return genAI;

    // 1. Try Process Env (SWAPPED: Use VERDICT KEY for News)
    let apiKey = process.env.GEMINI_VERDICT_KEY || process.env.GEMINI_API_KEY;

    // 2. Manual Fallback if process.env fails (Robust Loader)
    if (!apiKey) {
        try {
            const envPath = path.join(process.cwd(), '.env.local');
            if (fs.existsSync(envPath)) {
                const content = fs.readFileSync(envPath, 'utf-8');
                const lines = content.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('GEMINI_NEWS_KEY=')) {
                        apiKey = trimmed.split('=')[1].trim();
                        break;
                    }
                    if (!apiKey && trimmed.startsWith('GEMINI_API_KEY=')) {
                        apiKey = trimmed.split('=')[1].trim();
                    }
                }
            }
        } catch (e) {
            console.warn('[NewsHub] Env fetch failed:', e);
        }
    }

    if (apiKey) {
        genAI = new GoogleGenAI({ apiKey });
        return genAI;
    }
    return null;
}

// [V3.7.5] Translation Circuit Breaker & Global Throttling
let isTranslationRateLimited = false;
let last429Timestamp = 0;
const COOLDOWN_MS = 60 * 1000; // 1 minute cooldown

// Helper for Timeout
async function withTimeout<T>(promise: Promise<T>, ms: number, fallbackValue: T): Promise<T> {
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => {
            console.warn(`[NewsHub] Timeout after ${ms}ms`);
            resolve(fallbackValue);
        }, ms);
    });

    return Promise.race([
        promise.then((res) => {
            clearTimeout(timeoutId);
            return res;
        }).catch((err) => {
            clearTimeout(timeoutId);
            throw err;
        }),
        timeoutPromise
    ]);
}

// [Gemini Logic] Batch Analysis to respect Rate Limits (15 RPM)
// We process up to 10 items in one go.
export async function analyzeNewsBatch(items: any[]): Promise<AIAnalysisResult[]> {
    const client = getGenAIClient();

    // Try Gemini First
    if (client) {
        try {
            const promptItems = items.map(item => ({
                id: item.id || `news-${Math.random().toString(36).substr(2, 9)}`,
                text: `${item.title} - ${item.description || ""}`
            }));

            const prompt = `
            You are a top-tier financial analyst for the Korean market (Yeouido style).
            Translate the following news headlines/summaries into professional Korean.
            Also, enable 'Rumor Detection': precise identification of unverified reports, leaks, or speculation vs confirmed news.
            
            Input Data (JSON):
            ${JSON.stringify(promptItems)}

            Task:
            1. Translated 'summaryKR': concise, professional tone (e.g. "상승 마감" instead of "오르고 끝났다").
            2. 'isRumor': boolean (true if sources are 'sources say', 'reportedly', 'leaks', 'rumor', 'speculation').

            Output MUST be a valid JSON Array of objects:
            [ { "id": "...", "summaryKR": "...", "isRumor": boolean } ]
            DO NOT output markdown code blocks. Just the raw JSON.
            `;

            // Wrap Gemini call with 10s Timeout
            const result = await withTimeout(
                client.models.generateContent({
                    model: MODEL_NAME,
                    contents: prompt,
                }),
                10000, // 10s timeout
                { text: "[]" } as any // fallback empty result
            );

            const responseText = result.text || "";

            // Clean up markdown if present
            const jsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const analysis = JSON.parse(jsonStr) as AIAnalysisResult[];

            // [Fix] If Gemini returns empty/matches nothing, force fallback
            if (analysis.length === 0 && items.length > 0) {
                throw new Error("Gemini returned empty results (Timeout or Refusal)");
            }

            return analysis;
        } catch (e) {
            console.warn("[NewsHub] Gemini Analysis Failed (404/Quota/Timeout), switching to Fallback:", e);
            // Fall through to fallback
        }
    }

    // Fallback: Google Translate + Regex Rumor Detection
    try {
        const fallbackResults: AIAnalysisResult[] = [];

        // [V3.7.5] Circuit Breaker Check
        if (isTranslationRateLimited) {
            const timeSinceLast429 = Date.now() - last429Timestamp;
            if (timeSinceLast429 < COOLDOWN_MS) {
                console.warn(`[NewsHub] Translation Circuit Breaker Active (Cooldown: ${Math.ceil((COOLDOWN_MS - timeSinceLast429) / 1000)}s), skipping translation.`);
            } else {
                isTranslationRateLimited = false; // Reset after cooldown
                console.log("[NewsHub] Translation Circuit Breaker Reset. Retrying...");
            }
        }

        for (const item of items) {
            const textToTranslate = item.description || item.title || "";
            let translated = textToTranslate;

            // Skip if rate limited
            if (isTranslationRateLimited) {
                fallbackResults.push({
                    id: item.id || `news-${Math.random().toString(36).substr(2, 9)}`,
                    summaryKR: translated,
                    isRumor: false
                });
                continue;
            }

            try {
                // [V3.7.5] Conservative 1s delay between fallback requests
                if (fallbackResults.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                // Wrap Translate with 5s Timeout
                const res = await withTimeout(
                    translate(textToTranslate, { to: 'ko' }),
                    5000,
                    { text: textToTranslate } as any
                );
                translated = (res as any).text;
            } catch (err: any) {
                // If we get a 429, we trigger the circuit breaker
                const is429 = err.status === 429 ||
                    err.name === 'TooManyRequestsError' ||
                    err.message?.includes('429') ||
                    err.message?.includes('Too Many Requests'); // [V3.7.6] Explicit string check

                if (is429) {
                    console.warn("[NewsHub] Translation Rate Limited (429)! Activating Circuit Breaker.");
                    isTranslationRateLimited = true;
                    last429Timestamp = Date.now();
                } else {
                    console.error("[NewsHub] Translation fail:", err);
                }
            }

            // Simple Regex for Rumors (English Source)
            const fullText = (item.title + " " + (item.description || "")).toLowerCase();
            const rumorKeywords = [/sources say/i, /reportedly/i, /rumor/i, /unconfirmed/i, /speculation/i, /considering a bid/i, /people familiar with/i];
            const isRumor = rumorKeywords.some(rx => rx.test(fullText));

            fallbackResults.push({
                id: item.id || `news-${Math.random().toString(36).substr(2, 9)}`,
                summaryKR: translated,
                isRumor
            });
        }

        return fallbackResults;
    } catch (e) {
        console.error("[NewsHub] Fallback Failed:", e);
        return [];
    }
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

        // Prep raw items
        const rawItems = data.results.map((article: any, idx: number) => ({
            ...article,
            internalId: article.id || `news-${idx}`
        }));

        // Run Gemini Analysis (Parallel to save time? No, simple await is safer for now)
        // Only run if we have a valid key
        let aiResults: AIAnalysisResult[] = [];
        if (process.env.GEMINI_NEWS_KEY || process.env.GEMINI_API_KEY) {
            aiResults = await analyzeNewsBatch(rawItems);
        }

        return rawItems.map((article: any) => {
            const publishedAt = article.published_utc || new Date().toISOString();
            const age = calculateAge(publishedAt);

            // Simple sentiment detection from keywords (Fallback/Base)
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

            // [S-53.9] Official Source Detection
            const publisher = (article.publisher?.name || "").toLowerCase();
            const officialSources = [
                "business wire",
                "pr newswire",
                "globenewswire",
                "accesswire",
                "sec",
                "thear" // Often aggregates official PRs
            ];
            const isOfficial = officialSources.some(src => publisher.includes(src));

            // Merge AI Result
            const aiMatch = aiResults.find(r => r.id === article.internalId);
            // If AI detects rumor, we can tag it. For now, we put it in text or logic?
            // Let's prepend [루머] if confirmed rumor
            let finalSummary = article.description?.substring(0, 100) || article.title || "—";

            if (aiMatch) {
                finalSummary = aiMatch.summaryKR;
                if (aiMatch.isRumor) {
                    finalSummary = `[루머/비확인] ${finalSummary}`;
                    // Maybe degrade sentiment or score? 
                    // For now, visual warning is enough.
                }
            }

            return {
                id: article.internalId,
                headline: article.title || "No Title",
                summaryKR: finalSummary,
                source: article.publisher?.name || "Unknown",
                link: article.article_url,
                publishedAt,
                publishedAtET: formatETTime(publishedAt),
                sentiment,
                relatedTickers: article.tickers || [],
                catalystType,
                catalystAge: age,
                isStale: age > 72,
                isOfficial
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
