// ============================================================================
// Guardian News Intelligence — Market-Wide News Digest API
// Polygon News (no ticker = global market news) → Claude AI Analysis/Curation
// Uses macro snapshot context for market-reaction-linked interpretation
// Bedrock Claude 3.5 Haiku — optimized prompt for Claude's strengths
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { fetchMassive, CACHE_POLICY } from '@/services/massiveClient';
import { callBedrock, MODELS } from '@/services/bedrockClient';

const REDIS_KEY = 'guardian:news:digest';
const REDIS_TTL = 35 * 60; // 35 min (5 min buffer over 30 min cron)

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
    _source: 'fresh' | 'cached';
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

// ===== Fetch Market-Wide News from Polygon =====
async function fetchMarketNews(limit: number = 30): Promise<any[]> {
    try {
        // No ticker = market-wide news from all publishers
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
        // Normalize FMP format to match Polygon structure
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

// ===== Merge & Deduplicate News =====
function mergeAndDeduplicate(polygonNews: any[], fmpNews: any[]): any[] {
    const all = [...polygonNews, ...fmpNews];
    // Sort by published time (newest first)
    all.sort((a, b) => new Date(b.published_utc || 0).getTime() - new Date(a.published_utc || 0).getTime());
    // Deduplicate by title similarity (first 50 chars)
    const seen = new Set<string>();
    return all.filter(n => {
        const key = (n.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
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
- Select EXACTLY TOP 10 most impactful news (fewer if <10 unique)
- Prioritize: geopolitical > macro policy > market-moving > sector rotation > commentary
- DEDUPLICATE: same event → keep most detailed article only
- Each summary: 1-2 concise sentences with key facts and numbers
- Each analysis: exactly 1 dense conditional sentence — no filler words — MUST reference provided market data
- urgency 1-10: 8+ only for BREAKING (<60 min old + extreme keywords: crash/halt/war/collapse/default)
</output_rules>`;

async function analyzeWithClaude(articles: any[], macroContext: string): Promise<NewsDigestItem[]> {
    const inputItems = articles.slice(0, 30).map((a, i) => ({
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

Select TOP 10 and output as JSON array with this exact schema per item:
{"id","headline","summaryKR","summaryEN","summaryJP","analysisKR","analysisEN","analysisJP","category":"US_MARKET|GLOBAL|GEOPOLITICAL|MACRO|SECTOR","impact":"BULLISH|BEARISH|MIXED|NEUTRAL","urgency":1-10}

Output ONLY the JSON array — no explanation, no markdown.`;

    try {
        const bedrockResult = await callBedrock({
            modelId: MODELS.HAIKU_35,
            system: SYSTEM_PROMPT,
            userPrompt,
            maxTokens: 8192,
            temperature: 0.3,
            timeoutMs: 60000,
            jsonPrefill: false,  // This route uses array '[' prefill
            fallbackModel: null, // Haiku IS the cheap model
            label: 'NewsDigest',
        });

        // Parse as JSON array (response might start with '[' or not)
        let json = bedrockResult.text;
        if (!json.startsWith('[')) json = '[' + json;
        json = json.replace(/```json/g, '').replace(/```/g, '').trim();
        if (!json || json === '[') throw new Error('Empty Claude response');

        const parsed = JSON.parse(json) as any[];
        console.log(`[NewsDigest] Claude: ${parsed.length} items (model: ${bedrockResult.model})`);

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
        // Fallback: return raw top 5 without AI
        return articles.slice(0, 10).map((a, i) => ({
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
    const isUrgent = searchParams.get('urgent') === '1'; // VIX spike trigger

    // Step 1: Check Redis cache (skip if urgent VIX trigger)
    if (!forceRefresh && !isUrgent) {
        try {
            const cached = await getFromCache<NewsDigest>(REDIS_KEY);
            if (cached && cached.items?.length > 0) {
                return NextResponse.json({ ...cached, _source: 'cached' });
            }
        } catch { /* ignore cache miss */ }
    }

    // Step 2: Fetch fresh data from BOTH sources
    const baseUrl = req.url.split('/api/')[0];
    const [polygonArticles, fmpArticles, macroContext] = await Promise.all([
        fetchMarketNews(30),
        fetchFMPGeneralNews(15),
        getMacroContext(baseUrl),
    ]);

    // Merge & deduplicate: Polygon (stock/sector) + FMP (macro/geopolitical)
    const articles = mergeAndDeduplicate(polygonArticles, fmpArticles);
    console.log(`[NewsDigest] Sources: Polygon=${polygonArticles.length}, FMP=${fmpArticles.length}, Merged=${articles.length}${isUrgent ? ' [URGENT/VIX]' : ''}`);

    if (articles.length === 0) {
        return NextResponse.json({ items: [], error: 'No news available', _source: 'empty' });
    }

    // Step 3: AI Analysis (Claude Haiku via Bedrock)
    const items = await analyzeWithClaude(articles, macroContext);

    // Step 4: Build digest
    const now = new Date();
    const digest: NewsDigest = {
        items,
        generatedAt: now.toISOString(),
        generatedAtET: formatET(now.toISOString()),
        nextRefreshAt: new Date(now.getTime() + 30 * 60000).toISOString(),
        marketContext: macroContext,
        _source: 'fresh',
    };

    // Step 5: Save to Redis — only full-TTL cache if analysis succeeded
    const hasAnalysis = items.some(it => it.analysisEN && it.analysisEN.length > 0);
    try {
        const ttl = hasAnalysis ? REDIS_TTL : 180; // 35min if good, 3min if analysis empty (retry soon)
        await setInCache(REDIS_KEY, digest, ttl);
        console.log(`[NewsDigest] Saved ${items.length} items to Redis (TTL: ${ttl}s, analysis: ${hasAnalysis ? 'OK' : 'EMPTY — short TTL for retry'})`);
    } catch (e) {
        console.warn('[NewsDigest] Redis save failed:', e);
    }

    return NextResponse.json(digest);
}
