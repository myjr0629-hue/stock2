// ============================================================================
// Guardian News Intelligence — Market-Wide News Digest API
// Polygon News (no ticker = global market news) → Claude AI Analysis/Curation
// Uses macro snapshot context for market-reaction-linked interpretation
// Bedrock Claude 3.5 Haiku — optimized prompt for Claude's strengths
//
// [V2] 5-item batch + accumulate strategy:
//   - Each call: AI processes TOP 5 fresh articles (fast, ~25s)
//   - Merges with existing Redis cache → displays 10 unique items
//   - Cron runs every 15 min → fresher news, no timeout risk
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { fetchMassive, CACHE_POLICY } from '@/services/massiveClient';
import { callBedrock, MODELS } from '@/services/bedrockClient';

const REDIS_KEY = 'guardian:news:digest';
const REDIS_TTL = 20 * 60; // 20 min (buffer over 15 min cron interval)
const BATCH_SIZE = 5;       // AI processes 5 items per call (~25s, safe within timeout)
const DISPLAY_SIZE = 10;    // UI shows 10 items total (accumulated from 2 batches)

// Allow Vercel Pro to run up to 60s — Claude needs ~25s for 5 items × 3 languages
export const maxDuration = 60;

// ===== Types =====
export interface NewsDigestItem {
    id: string;
    headline: string;
    summaryKR: string;
    summaryEN: string;
    summaryJP: string;
    analysisKR: string;
    analysisEN: string;
    analysisJP: string;
    category: 'US_MARKET' | 'GLOBAL' | 'GEOPOLITICAL' | 'MACRO' | 'SECTOR';
    impact: 'BULLISH' | 'BEARISH' | 'MIXED' | 'NEUTRAL';
    urgency: number;
    source: string;
    publishedAt: string;
    publishedAtET: string;
    ageMinutes: number;
}

export interface NewsDigest {
    items: NewsDigestItem[];
    generatedAt: string;
    generatedAtET: string;
    nextRefreshAt: string;
    marketContext: string;
    _source: 'fresh' | 'cached' | 'accumulated';
}

// ===== Time Helpers =====
function formatET(iso: string): string {
    return new Date(iso).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

function getAgeMinutes(iso: string): number {
    return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}

// ===== Title key for dedup =====
function titleKey(title: string): string {
    return (title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
}

// ===== Fetch Market-Wide News from Polygon =====
async function fetchMarketNews(limit: number = 30): Promise<any[]> {
    try {
        const endpoint = `/v2/reference/news?limit=${limit}&order=desc&sort=published_utc`;
        const data = await fetchMassive(endpoint, {}, true, undefined, CACHE_POLICY.DISPLAY_NEWS);
        return data?.results || [];
    } catch (e) {
        console.error('[NewsDigest] Polygon fetch failed:', e);
        return [];
    }
}

// ===== Fetch Macro/Geopolitical News from FMP =====
const FMP_API_KEY = process.env.FMP_API_KEY || '';
async function fetchFMPGeneralNews(limit: number = 15): Promise<any[]> {
    if (!FMP_API_KEY) return [];
    try {
        const res = await fetch(
            `https://financialmodelingprep.com/stable/news/general-latest?limit=${limit}&apikey=${FMP_API_KEY}`,
            { signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) return [];
        const data = await res.json();
        if (!Array.isArray(data)) return [];
        return data.map((n: any) => ({
            id: `fmp-${n.url?.slice(-20) || Math.random()}`,
            title: n.title || '',
            description: n.text?.substring(0, 300) || '',
            published_utc: n.publishedDate || new Date().toISOString(),
            publisher: { name: n.site || 'FMP' },
            _source: 'fmp',
        }));
    } catch (e) {
        console.error('[NewsDigest] FMP fetch failed:', e);
        return [];
    }
}

// ===== Merge & Deduplicate raw articles =====
function mergeAndDeduplicate(polygonNews: any[], fmpNews: any[]): any[] {
    const all = [...polygonNews, ...fmpNews];
    all.sort((a, b) => new Date(b.published_utc || 0).getTime() - new Date(a.published_utc || 0).getTime());
    const seen = new Set<string>();
    return all.filter(n => {
        const key = titleKey(n.title);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ===== Deduplicate digest items by headline =====
function deduplicateItems(items: NewsDigestItem[]): NewsDigestItem[] {
    const seen = new Set<string>();
    return items.filter(item => {
        const key = titleKey(item.headline);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ===== Fetch Macro Context for AI =====
async function getMacroContext(baseUrl: string): Promise<string> {
    try {
        const res = await fetch(`${baseUrl}/api/market/macro`, {
            signal: AbortSignal.timeout(5000),
            ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
                ? { headers: { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } }
                : {}),
        });
        if (!res.ok) return '';
        const macro = await res.json();
        const f = macro.factors;
        const parts: string[] = [];
        if (f?.nasdaq100?.level) parts.push(`NASDAQ 100: ${f.nasdaq100.level.toFixed(0)} (${f.nasdaq100.chgPct >= 0 ? '+' : ''}${f.nasdaq100.chgPct?.toFixed(2) || '0'}%)`);
        if (f?.spx?.level) parts.push(`S&P 500: ${f.spx.level.toFixed(0)} (${f.spx.chgPct >= 0 ? '+' : ''}${f.spx.chgPct?.toFixed(2) || '0'}%)`);
        if (f?.vix?.level) parts.push(`VIX: ${f.vix.level.toFixed(1)} (${f.vix.chgPct >= 0 ? '+' : ''}${f.vix.chgPct?.toFixed(2) || '0'}%)`);
        if (f?.us10y?.level) parts.push(`US 10Y: ${f.us10y.level.toFixed(2)}% (${f.us10y.chgPct >= 0 ? '+' : ''}${f.us10y.chgPct?.toFixed(2) || '0'}%)`);
        if (f?.oil?.level) parts.push(`Oil: $${f.oil.level.toFixed(1)} (${f.oil.chgPct >= 0 ? '+' : ''}${f.oil.chgPct?.toFixed(2) || '0'}%)`);
        if (f?.gold?.level) parts.push(`Gold: $${f.gold.level.toFixed(0)} (${f.gold.chgPct >= 0 ? '+' : ''}${f.gold.chgPct?.toFixed(2) || '0'}%)`);
        if (f?.dxy?.level) parts.push(`DXY: ${f.dxy.level.toFixed(1)} (${f.dxy.chgPct >= 0 ? '+' : ''}${f.dxy.chgPct?.toFixed(2) || '0'}%)`);
        if (f?.btc?.level) parts.push(`BTC: $${f.btc.level.toFixed(0)} (${f.btc.chgPct >= 0 ? '+' : ''}${f.btc.chgPct?.toFixed(2) || '0'}%)`);
        return parts.join(' | ');
    } catch {
        return '';
    }
}

// ===== Claude AI Analysis (Bedrock) =====
const SYSTEM_PROMPT = `You are a top-tier macro strategist at a Bloomberg-class institutional terminal.
Your role: CURATE the most impactful global market news and provide institutional-grade analysis.

<persona>
- Write Korean (한국어) in authoritative 전문 투자 분석가 tone — use expressions like "~에 주목할 필요가 있습니다", "~할 가능성을 시사합니다", "~에 대한 재평가가 불가피합니다"
- Write Japanese (日本語) in 金融プロフェッショナル tone — formal 「です・ます」 with precise financial terminology
- Write English in concise Bloomberg-wire professional style
- NEVER use machine-translation patterns. Each language must feel native.
</persona>

<compliance>
- Do NOT provide specific trading recommendations (buy/sell/hold)
- Use conditional language: "may indicate", "suggests potential", "watch for"
- Analysis format: conditional cause-and-effect connecting news to market data
</compliance>

<analysis_format>
- English analysis: use "IF → THEN" format (e.g. "IF X happens, THEN Y may follow")
- Korean analysis (analysisKR): use native Korean conditional — "만약 ~한다면, ~할 수 있습니다" or "~이/가 지속된다면, ~에 대한 재평가가 불가피합니다". Do NOT write "IF", "THEN" in English.
- Japanese analysis (analysisJP): use native Japanese conditional — "もし～が継続すれば、～の可能性があります" or "～であれば、～が予想されます". Do NOT write "IF", "THEN" in English.
</analysis_format>

<output_rules>
- Select EXACTLY TOP ${BATCH_SIZE} most impactful news from the provided articles
- Prioritize: geopolitical > macro policy > market-moving > sector rotation > commentary
- DEDUPLICATE: same event → keep most detailed article only
- Each summary: 1-2 concise sentences with key facts and numbers
- Each analysis: exactly 1 dense conditional sentence — no filler words — MUST reference provided market data
- urgency 1-10: 8+ only for BREAKING (<60 min old + extreme keywords: crash/halt/war/collapse/default)
</output_rules>`;

async function analyzeWithClaude(articles: any[], macroContext: string): Promise<NewsDigestItem[]> {
    const inputItems = articles.slice(0, 20).map((a, i) => ({
        id: a.id || `news-${i}`,
        title: a.title || '',
        desc: (a.description || '').substring(0, 200),
        source: a.publisher?.name || '',
        published: a.published_utc || '',
        ageMin: getAgeMinutes(a.published_utc || new Date().toISOString()),
    }));

    const userPrompt = `<market_data>
${macroContext || 'Market data unavailable — weekend/holiday'}
</market_data>

<articles count="${inputItems.length}">
${JSON.stringify(inputItems)}
</articles>

Select TOP ${BATCH_SIZE} and output as JSON array with this exact schema per item:
{"id","headline","summaryKR","summaryEN","summaryJP","analysisKR","analysisEN","analysisJP","category":"US_MARKET|GLOBAL|GEOPOLITICAL|MACRO|SECTOR","impact":"BULLISH|BEARISH|MIXED|NEUTRAL","urgency":1-10}

Output ONLY the JSON array — no explanation, no markdown.`;

    try {
        const t0 = Date.now();
        const bedrockResult = await callBedrock({
            modelId: MODELS.HAIKU_35,
            system: SYSTEM_PROMPT,
            userPrompt,
            maxTokens: 4096,   // 5 items × 3 langs ≈ 3K tokens — safe within 4096
            temperature: 0.3,
            timeoutMs: 45000,  // 45s — plenty for 5 items
            jsonPrefill: false,
            fallbackModel: null,
            label: 'NewsDigest-Batch5',
        });

        let json = bedrockResult.text;
        if (!json.startsWith('[')) json = '[' + json;
        json = json.replace(/```json/g, '').replace(/```/g, '').trim();
        if (!json || json === '[') throw new Error('Empty Claude response');

        const parsed = JSON.parse(json) as any[];
        console.log(`[NewsDigest] Claude: ${parsed.length} items in ${Date.now() - t0}ms (model: ${bedrockResult.model})`);

        return parsed.map((item, i) => ({
            id: item.id || `digest-${i}`,
            headline: item.headline || articles[i]?.title || 'No Title',
            summaryKR: item.summaryKR || '',
            summaryEN: item.summaryEN || '',
            summaryJP: item.summaryJP || '',
            analysisKR: item.analysisKR || '',
            analysisEN: item.analysisEN || '',
            analysisJP: item.analysisJP || '',
            category: item.category || 'US_MARKET',
            impact: item.impact || 'NEUTRAL',
            urgency: Math.min(10, Math.max(1, item.urgency || 3)),
            source: articles.find(a => a.id === item.id)?.publisher?.name || item.source || 'Unknown',
            publishedAt: articles.find(a => a.id === item.id)?.published_utc || new Date().toISOString(),
            publishedAtET: formatET(articles.find(a => a.id === item.id)?.published_utc || new Date().toISOString()),
            ageMinutes: getAgeMinutes(articles.find(a => a.id === item.id)?.published_utc || new Date().toISOString()),
        }));
    } catch (e) {
        console.error('[NewsDigest] Claude analysis failed:', e);
        // Fallback: return raw top items without AI
        return articles.slice(0, BATCH_SIZE).map((a, i) => ({
            id: a.id || `news-${i}`,
            headline: a.title || 'No Title',
            summaryKR: a.description?.substring(0, 120) || a.title,
            summaryEN: a.description?.substring(0, 120) || a.title,
            summaryJP: a.title,
            analysisKR: '', analysisEN: '', analysisJP: '',
            category: 'US_MARKET' as const,
            impact: 'NEUTRAL' as const,
            urgency: 3,
            source: a.publisher?.name || 'Unknown',
            publishedAt: a.published_utc || new Date().toISOString(),
            publishedAtET: formatET(a.published_utc || new Date().toISOString()),
            ageMinutes: getAgeMinutes(a.published_utc || new Date().toISOString()),
        }));
    }
}

// ===== Main API Handler =====
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get('refresh') === '1';
    const isUrgent = searchParams.get('urgent') === '1';

    // Step 1: Load existing cache (always — we need it for accumulation)
    let existingDigest: NewsDigest | null = null;
    try {
        existingDigest = await getFromCache<NewsDigest>(REDIS_KEY);
    } catch { /* ignore cache miss */ }

    // Return cached if not refreshing and cache has items
    if (!forceRefresh && !isUrgent && existingDigest && existingDigest.items?.length > 0) {
        const items = existingDigest.items.map(it => ({
            ...it,
            ageMinutes: getAgeMinutes(it.publishedAt),
        }));
        return NextResponse.json({ ...existingDigest, items, _source: 'cached' });
    }

    // Step 2: Fetch fresh articles from BOTH sources
    const baseUrl = req.url.split('/api/')[0];
    const t0 = Date.now();
    const [polygonArticles, fmpArticles, macroContext] = await Promise.all([
        fetchMarketNews(30),
        fetchFMPGeneralNews(15),
        getMacroContext(baseUrl),
    ]);
    console.log(`[NewsDigest] Fetch done in ${Date.now() - t0}ms: Polygon=${polygonArticles.length}, FMP=${fmpArticles.length}`);

    const articles = mergeAndDeduplicate(polygonArticles, fmpArticles);

    if (articles.length === 0) {
        return NextResponse.json({ items: [], error: 'No news available', _source: 'empty' });
    }

    // Step 3: Filter out articles already in cache (avoid duplicates)
    const existingKeys = new Set(
        (existingDigest?.items || []).map(it => titleKey(it.headline))
    );
    const freshArticles = articles.filter(a => !existingKeys.has(titleKey(a.title)));
    console.log(`[NewsDigest] Fresh articles: ${freshArticles.length} (filtered ${articles.length - freshArticles.length} duplicates)${isUrgent ? ' [URGENT/VIX]' : ''}`);

    // Step 4: AI Analysis — only 5 fresh items (fast, ~25s)
    let newItems: NewsDigestItem[] = [];
    if (freshArticles.length > 0) {
        const t1 = Date.now();
        newItems = await analyzeWithClaude(freshArticles, macroContext);
        console.log(`[NewsDigest] AI done in ${Date.now() - t1}ms: ${newItems.length} new items`);
    } else {
        console.log('[NewsDigest] No fresh articles — keeping existing cache');
    }

    // Step 5: Accumulate — merge new + existing, keep latest 10 unique
    const existingItems = existingDigest?.items || [];
    const allItems = [...newItems, ...existingItems]; // New first (higher priority)
    const uniqueItems = deduplicateItems(allItems);
    const displayItems = uniqueItems
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
        .slice(0, DISPLAY_SIZE)
        .map(it => ({ ...it, ageMinutes: getAgeMinutes(it.publishedAt) }));

    // Step 6: Build digest
    const now = new Date();
    const digest: NewsDigest = {
        items: displayItems,
        generatedAt: now.toISOString(),
        generatedAtET: formatET(now.toISOString()),
        nextRefreshAt: new Date(now.getTime() + 15 * 60000).toISOString(),
        marketContext: macroContext,
        _source: existingItems.length > 0 && newItems.length > 0 ? 'accumulated' : 'fresh',
    };

    // Step 7: Save to Redis
    const hasAnalysis = displayItems.some(it => it.analysisEN && it.analysisEN.length > 0);
    try {
        const ttl = hasAnalysis ? REDIS_TTL : 180; // 20min if good, 3min if analysis empty
        await setInCache(REDIS_KEY, digest, ttl);
        console.log(`[NewsDigest] Saved ${displayItems.length} items (new: ${newItems.length}, kept: ${existingItems.length}, TTL: ${ttl}s, analysis: ${hasAnalysis ? 'OK' : 'EMPTY'})`);
    } catch (e) {
        console.warn('[NewsDigest] Redis save failed:', e);
    }

    return NextResponse.json(digest);
}
