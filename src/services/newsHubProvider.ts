// [S-50.0] NewsHub Provider - Stock & Market News
// Source: Massive (Polygon) API for stock news + Static JSON for market headlines

import path from 'path';
import fs from 'fs';

import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";
import { getFromCache, setInCache } from "@/services/redisClient";

export interface NewsItem {
    id: string;
    headline: string;
    summaryKR: string;       // Korean summary
    summaryJP?: string;      // Japanese summary [S-75]
    analysisKR?: string;     // AI market interpretation (Korean)
    analysisEN?: string;     // AI market interpretation (English)
    analysisJP?: string;     // AI market interpretation (Japanese)
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

const MODEL_NAME = "gemini-2.5-flash"; // [QUALITY] 2.5-flash: deeper analysis with thinking (5 items fits within 60s timeout)

interface AIAnalysisResult {
    id: string;
    summaryKR: string;
    summaryJP: string;  // [S-75] Japanese translation
    analysisKR?: string;     // AI market interpretation (Korean)
    analysisEN?: string;     // AI market interpretation (English)
    analysisJP?: string;     // AI market interpretation (Japanese)
    isRumor: boolean;
    sentiment?: "positive" | "negative" | "neutral";
}

let genAI: GoogleGenAI | null = null;

function getGenAIClient() {
    if (genAI) return genAI;

    // 1. Try Process Env (NEWS_KEY first, then fallback to VERDICT or generic)
    let apiKey = process.env.GEMINI_NEWS_KEY || process.env.GEMINI_VERDICT_KEY || process.env.GEMINI_API_KEY;

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
            } else {
                console.warn('[NewsHub] .env.local not found');
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
// marketContext is optional — when provided, Gemini generates data-driven market interpretation
// [PERF] Redis AI Cache — skip Gemini for previously analyzed articles (TTL: 2h)
export async function analyzeNewsBatch(items: any[], marketContext?: string): Promise<AIAnalysisResult[]> {
    const client = getGenAIClient();

    // [PERF] Step 1: Check Redis cache for each item
    const cachedResults: AIAnalysisResult[] = [];
    const uncachedItems: any[] = [];

    try {
        const cacheChecks = await Promise.all(
            items.map(async (item) => {
                const articleId = item.id || item.internalId || '';
                if (!articleId) return null;
                const cached = await getFromCache<AIAnalysisResult>(`news:ai:${articleId}`);
                return cached ? { ...cached, _fromCache: true } : null;
            })
        );

        items.forEach((item, idx) => {
            if (cacheChecks[idx]) {
                cachedResults.push(cacheChecks[idx]!);
            } else {
                uncachedItems.push(item);
            }
        });

        if (uncachedItems.length === 0) {
            console.log(`[NewsHub] All ${items.length} items served from Redis cache ✓`);
            return cachedResults;
        }
        console.log(`[NewsHub] Cache hit: ${cachedResults.length}, miss: ${uncachedItems.length} → sending to Gemini`);
    } catch (cacheErr) {
        console.warn('[NewsHub] Redis cache check failed, proceeding with full Gemini:', cacheErr);
        uncachedItems.push(...items);
    }

    // [PERF] Step 2: Only analyze uncached items with Gemini
    const itemsToAnalyze = uncachedItems.length > 0 ? uncachedItems : items;

    // Try Gemini First
    if (client) {
        try {
            const promptItems = itemsToAnalyze.map(item => ({
                id: item.id || `news-${Math.random().toString(36).substr(2, 9)}`,
                text: `${item.title} - ${item.description || ""}`
            }));

            // Build market context section for the prompt
            const contextSection = marketContext
                ? `\n            MARKET CONTEXT for this ticker (use this for your analysis):\n            ${marketContext}\n`
                : '';

            // [S-75+] Trilingual translation + AI Market Interpretation + Curation prompt
            const prompt = `
            You are a top-tier financial analyst at a Bloomberg-class terminal.
            Your job: CURATE the most impactful news, translate, and provide ACTIONABLE market interpretation.
            ${contextSection}
            CRITICAL RULES:
            - From the input items, SELECT ONLY THE TOP 5 most impactful news for investors. Discard duplicates and low-value items.
            - Rank by: price impact potential > earnings/guidance > regulatory > analyst action > general commentary.
            - If two articles cover the same event, keep only the one with more detail.
            - summaryKR MUST be in Korean (한국어). summaryJP MUST be in Japanese (日本語). Do NOT mix languages.
            - analysisKR MUST be in Korean, analysisEN in English, analysisJP in Japanese.
            - Each analysis should be 1-2 sentences of ACTIONABLE interpretation (not just repeating the headline).
            - If market context is provided, CONNECT the news to the data (RSI, PCR, gamma, support/resistance).
            - Focus on: price impact, risk level, and what a trader should watch for.

            Input Data (JSON) — ${promptItems.length} items, select TOP 5:
            ${JSON.stringify(promptItems)}

            Task for EACH selected item (TOP 5 ONLY):
            1. 'summaryKR': Korean professional translation (한국어 전문 톤).
            2. 'summaryJP': Japanese professional translation (日本語専門トーン).
            3. 'analysisKR': Korean market interpretation, 1-2 sentences. 투자자가 바로 행동할 수 있는 해석. (e.g. "RSI 과매도 구간에서 하락 뉴스 → 기술적 반등 가능성. Put Floor $120 지지 확인 필요")
            4. 'analysisEN': English market interpretation, 1-2 sentences. Actionable. (e.g. "Bearish news while RSI is oversold → possible technical bounce. Watch Put Floor at $120 for support.")
            5. 'analysisJP': Japanese market interpretation, 1-2 sentences. (e.g. "RSI売られ過ぎ区間で下落ニュース→テクニカル反発の可能性。プットフロア$120のサポート確認必要")
            6. 'sentiment': "positive" | "negative" | "neutral" — Based on ACTUAL market impact of the news (not just headline tone). Positive = price-supportive catalyst, Negative = price-damaging catalyst, Neutral = informational only.
            7. 'isRumor': boolean (true if sources say 'reportedly', 'leaks', 'rumor', 'speculation').

            Output MUST be a valid JSON Array of EXACTLY 5 items (or fewer if less than 5 unique news exist):
            [ { "id": "...", "summaryKR": "...", "summaryJP": "...", "analysisKR": "...", "analysisEN": "...", "analysisJP": "...", "sentiment": "positive|negative|neutral", "isRumor": boolean } ]
            DO NOT output markdown code blocks. Just the raw JSON.
            `;

            // Wrap Gemini call with 60s Timeout (10 items × 3 languages + analysis)
            const result = await withTimeout(
                client.models.generateContent({
                    model: MODEL_NAME,
                    contents: prompt,
                }),
                60000, // 60s timeout — generous for batch translation+analysis
                { text: "[]" } as any // fallback empty result
            );

            const responseText = result.text || "";

            // Clean up markdown if present
            const jsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            if (!jsonStr) throw new Error('Gemini returned empty response');
            const analysis = JSON.parse(jsonStr) as AIAnalysisResult[];

            // [Fix] If Gemini returns empty/matches nothing, force fallback
            if (analysis.length === 0 && itemsToAnalyze.length > 0) {
                throw new Error("Gemini returned empty results (Timeout or Refusal)");
            }

            // [PERF] Step 3: Save Gemini results to Redis cache (TTL: 2 hours)
            try {
                await Promise.all(
                    analysis.map(result => {
                        if (result.id) {
                            return setInCache(`news:ai:${result.id}`, result, 7200);
                        }
                        return Promise.resolve();
                    })
                );
                console.log(`[NewsHub] Cached ${analysis.length} AI results to Redis (TTL: 2h)`);
            } catch (saveErr) {
                console.warn('[NewsHub] Failed to save AI results to Redis:', saveErr);
            }

            // Merge cached + fresh results
            return [...cachedResults, ...analysis];
        } catch (e: any) {
            const errInfo = {
                message: e?.message?.substring(0, 200),
                status: e?.status || e?.statusCode || e?.code,
                name: e?.name,
            };
            console.warn("[NewsHub] Gemini Analysis Failed:", JSON.stringify(errInfo));
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
            let translatedKR = textToTranslate;
            let translatedJP = textToTranslate;

            // Skip if rate limited
            if (isTranslationRateLimited) {
                fallbackResults.push({
                    id: item.id || `news-${Math.random().toString(36).substr(2, 9)}`,
                    summaryKR: translatedKR,
                    summaryJP: translatedJP,  // Use original English as fallback
                    isRumor: false
                });
                continue;
            }

            try {
                // [V3.7.5] Conservative 1s delay between fallback requests
                if (fallbackResults.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                // Translate to Korean AND Japanese in parallel
                const [resKR, resJP] = await Promise.all([
                    withTimeout(
                        translate(textToTranslate, { to: 'ko' }),
                        5000,
                        { text: textToTranslate } as any
                    ),
                    withTimeout(
                        translate(textToTranslate, { to: 'ja' }),
                        5000,
                        { text: textToTranslate } as any
                    )
                ]);
                translatedKR = (resKR as any).text;
                translatedJP = (resJP as any).text;
            } catch (err: any) {
                // If we get a 429, we trigger the circuit breaker
                const is429 = err.status === 429 ||
                    err.name === 'TooManyRequestsError' ||
                    err.message?.includes('429') ||
                    err.message?.includes('Too Many Requests');

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
                summaryKR: translatedKR,
                summaryJP: translatedJP,
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
export async function fetchStockNews(tickers: string[], limit: number = 10, skipAI: boolean = false, marketContext?: string): Promise<NewsItem[]> {
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

        // Run Gemini Analysis (skip for snapshot — it does its own Gemini call)
        let aiResults: AIAnalysisResult[] = [];
        if (!skipAI && getGenAIClient()) {
            aiResults = await analyzeNewsBatch(rawItems, marketContext);
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
            let finalSummaryKR = article.description?.substring(0, 100) || article.title || "—";
            let finalSummaryJP = article.title || "—";  // [S-75] Default to English

            if (aiMatch) {
                finalSummaryKR = aiMatch.summaryKR;
                finalSummaryJP = aiMatch.summaryJP || article.title;  // [S-75]
                if (aiMatch.isRumor) {
                    finalSummaryKR = `[루머/비확인] ${finalSummaryKR}`;
                    finalSummaryJP = `[未確認] ${finalSummaryJP}`;  // [S-75]
                    // Maybe degrade sentiment or score? 
                    // For now, visual warning is enough.
                }
            }

            return {
                id: article.internalId,
                headline: article.title || "No Title",
                summaryKR: finalSummaryKR,
                summaryJP: finalSummaryJP,  // [S-75] Japanese translation
                analysisKR: aiMatch?.analysisKR || undefined,
                analysisEN: aiMatch?.analysisEN || undefined,
                analysisJP: aiMatch?.analysisJP || undefined,
                source: article.publisher?.name || "Unknown",
                link: article.article_url,
                publishedAt,
                publishedAtET: formatETTime(publishedAt),
                sentiment: aiMatch?.sentiment || sentiment,
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
// [V3.4.1] Static headlines REMOVED from sentiment derivation — live Polygon only
export async function getNewsHubSnapshot(tickers: string[] = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMZN']): Promise<NewsHubSnapshot> {
    const now = new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York',
        dateStyle: 'short',
        timeStyle: 'short'
    });

    // [V3.4.1] Fetch LIVE market-level news (broad market ETFs) + ticker-specific
    const marketTickers = ['SPY', 'QQQ', 'DIA'];
    const [marketNews, stockNews] = await Promise.all([
        fetchStockNews(marketTickers, 10),
        fetchStockNews(tickers, 15)
    ]);

    // Sentiment derived from LIVE news only — never from stale static files
    const liveNews = [...marketNews, ...stockNews];
    const { likes, dislikes } = deriveMarketSentiment(liveNews);

    console.log(`[NewsHub V3.4.1] Live news: ${marketNews.length} market + ${stockNews.length} stock → Likes:${likes.length} Dislikes:${dislikes.length}`);

    return {
        asOfET: now,
        marketHeadlines: marketNews.slice(0, 5),  // Live market headlines (SPY/QQQ/DIA)
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
