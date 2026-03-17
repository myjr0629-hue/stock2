// ============================================================================
// Guardian News Intelligence — Market-Wide News Digest API
// Polygon News (no ticker = global market news) → Gemini AI Analysis/Curation
// Uses macro snapshot context for market-reaction-linked interpretation
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { fetchMassive, CACHE_POLICY } from '@/services/massiveClient';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import fs from 'fs';

const REDIS_KEY = 'guardian:news:digest';
const REDIS_TTL = 35 * 60; // 35 min (5 min buffer over 30 min cron)
const MODEL_NAME = 'gemini-2.5-flash';

// ===== Types =====
export interface NewsDigestItem {
    id: string;
    headline: string;        // Original English
    summaryKR: string;       // Korean summary (1-2 sentences)
    summaryEN: string;       // English summary
    summaryJP: string;       // Japanese summary
    analysisKR: string;      // Korean market interpretation with indicator context
    analysisEN: string;      // English market interpretation
    analysisJP: string;      // Japanese market interpretation
    category: 'US_MARKET' | 'GLOBAL' | 'GEOPOLITICAL' | 'MACRO' | 'SECTOR';
    impact: 'BULLISH' | 'BEARISH' | 'MIXED' | 'NEUTRAL';
    urgency: number;         // 1-10 (8+ = BREAKING)
    source: string;
    publishedAt: string;
    publishedAtET: string;
    ageMinutes: number;
}

export interface NewsDigest {
    items: NewsDigestItem[];
    generatedAt: string;      // ISO timestamp
    generatedAtET: string;    // ET formatted
    nextRefreshAt: string;    // Next cron run
    marketContext: string;    // Macro context used for analysis
    _source: 'fresh' | 'cached';
}

// ===== Gemini Client =====
let genAI: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
    if (genAI) return genAI;
    let apiKey = process.env.GEMINI_NEWS_KEY || process.env.GEMINI_VERDICT_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        try {
            const envPath = path.join(process.cwd(), '.env.local');
            if (fs.existsSync(envPath)) {
                const content = fs.readFileSync(envPath, 'utf-8');
                for (const line of content.split('\n')) {
                    const t = line.trim();
                    if (t.startsWith('GEMINI_NEWS_KEY=')) { apiKey = t.split('=')[1].trim(); break; }
                    if (!apiKey && t.startsWith('GEMINI_API_KEY=')) apiKey = t.split('=')[1].trim();
                }
            }
        } catch { /* ignore */ }
    }
    if (apiKey) { genAI = new GoogleGenAI({ apiKey }); return genAI; }
    return null;
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

// ===== Gemini Batch Analysis =====
async function analyzeWithGemini(articles: any[], macroContext: string): Promise<NewsDigestItem[]> {
    const client = getGenAI();
    if (!client) {
        console.warn('[NewsDigest] No Gemini API key — returning raw items');
        return articles.slice(0, 5).map((a, i) => ({
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

    const inputItems = articles.slice(0, 30).map((a, i) => ({
        id: a.id || `news-${i}`,
        title: a.title || '',
        desc: (a.description || '').substring(0, 200),
        source: a.publisher?.name || '',
        published: a.published_utc || '',
        ageMin: getAgeMinutes(a.published_utc || new Date().toISOString()),
    }));

    const prompt = `You are a top-tier macro strategist at a Bloomberg-class terminal.
Your job: CURATE the most impactful global market news, translate into 3 languages, and provide ACTIONABLE market interpretation linked to real-time indicators.

CURRENT MARKET DATA (use this for your analysis):
${macroContext || 'Market data unavailable'}

INPUT NEWS (${inputItems.length} articles — select TOP 5 by global market impact):
${JSON.stringify(inputItems)}

CRITICAL RULES:
1. SELECT ONLY TOP 5 most impactful news for global market investors. Prioritize: geopolitical > macro policy > market-moving events > sector rotation > commentary.
2. DEDUPLICATE: if multiple articles cover the same event, keep only the most detailed one.
3. COMPLIANCE: Do NOT provide specific trading recommendations (buy/sell/hold). Focus on factual impact analysis and conditional scenarios (IF→THEN). Use language like "may indicate", "suggests potential", "watch for" instead of directives.
4. TRANSLATIONS must be PERFECT natural language — not machine-translated. Korean=한국어 전문 투자 톤, Japanese=日本語金融プロフェッショナルトーン.
5. ANALYSIS must CONNECT news to the market data above when relevant (e.g., "VIX surging confirms market fear from tariff news").
6. Each 'summary' should be 1-2 concise sentences capturing the key fact.
7. Each 'analysis' MUST be exactly 1 sharp sentence. Be maximally dense — no filler words. Link to indicator data using IF→THEN format when possible.
8. 'urgency' 1-10: 8+ = BREAKING (published < 60 min AND extreme market impact keywords like crash, halt, emergency, war, collapse, default).

For EACH of the TOP 5 selected items, output:
{
  "id": "original article id",
  "headline": "original English headline",
  "summaryKR": "한국어 요약 (1-2문장, 전문 투자 톤)",
  "summaryEN": "English summary (1-2 sentences, professional)",
  "summaryJP": "日本語要約 (1-2文、金融プロトーン)",
  "analysisKR": "한국어 시장 해석 — 지표 연결 (조건부 시나리오 형식)",
  "analysisEN": "English market interpretation — indicator-linked (IF→THEN format)",
  "analysisJP": "日本語市場解釈 — 指標連動 (条件付きシナリオ)",
  "category": "US_MARKET|GLOBAL|GEOPOLITICAL|MACRO|SECTOR",
  "impact": "BULLISH|BEARISH|MIXED|NEUTRAL",
  "urgency": 1-10
}

Output MUST be a valid JSON Array of EXACTLY 5 items (or fewer if < 5 unique):
[ { ... }, { ... } ]
DO NOT output markdown code blocks. Raw JSON only.`;

    try {
        const result = await Promise.race([
            client.models.generateContent({ model: MODEL_NAME, contents: prompt }),
            new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Gemini timeout 60s')), 60000))
        ]);

        const text = result.text || '';
        const json = text.replace(/```json/g, '').replace(/```/g, '').trim();
        if (!json) throw new Error('Empty Gemini response');
        
        const parsed = JSON.parse(json) as any[];
        
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
        console.error('[NewsDigest] Gemini analysis failed:', e);
        // Fallback: return raw top 5 without AI
        return articles.slice(0, 5).map((a, i) => ({
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

    // Step 1: Check Redis cache
    if (!forceRefresh) {
        try {
            const cached = await getFromCache<NewsDigest>(REDIS_KEY);
            if (cached && cached.items?.length > 0) {
                return NextResponse.json({ ...cached, _source: 'cached' });
            }
        } catch { /* ignore cache miss */ }
    }

    // Step 2: Fetch fresh data
    const baseUrl = req.url.split('/api/')[0];
    const [articles, macroContext] = await Promise.all([
        fetchMarketNews(30),
        getMacroContext(baseUrl),
    ]);

    if (articles.length === 0) {
        return NextResponse.json({ items: [], error: 'No news available', _source: 'empty' });
    }

    // Step 3: AI Analysis
    const items = await analyzeWithGemini(articles, macroContext);

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

    // Step 5: Save to Redis
    try {
        await setInCache(REDIS_KEY, digest, REDIS_TTL);
        console.log(`[NewsDigest] Saved ${items.length} items to Redis (TTL: ${REDIS_TTL}s)`);
    } catch (e) {
        console.warn('[NewsDigest] Redis save failed:', e);
    }

    return NextResponse.json(digest);
}
