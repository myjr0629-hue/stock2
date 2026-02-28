// ==========================================================================
// /api/intel/cross-sector-brief — Cross-Sector AI Daily Brief
// POST: Generate via Gemini (called by cron after all snapshots)
// GET:  Retrieve latest brief for frontend display
// ==========================================================================

import { NextResponse } from 'next/server';
import { getLatestSnapshot } from '@/lib/supabase/snapshot';
import { getFromCache, setInCache } from '@/services/redisClient';
import { GoogleGenAI } from '@google/genai';
import { YAHOO_CACHE_KEYS, type YahooQuote } from '@/services/yahooFinanceHub';

const SECTOR_IDS = [
    'm7', 'physical_ai', 'silicon_core', 'power_matrix', 'bio_pulse',
    'cyber_shield', 'orbit_defense', 'quantum_edge', 'fintech_pulse', 'cloud_fortress',
];

const SECTOR_LABELS: Record<string, string> = {
    m7: 'M7 (Magnificent 7)',
    physical_ai: 'Physical AI (Robotics & Embodied)',
    silicon_core: 'Silicon Core (AI Infra & Chips)',
    power_matrix: 'Power Matrix (Energy & Nuclear)',
    bio_pulse: 'Bio Pulse (GLP-1 & Biotech)',
    cyber_shield: 'Cyber Shield (AI Security & Zero Trust)',
    orbit_defense: 'Orbit Defense (Space & Defense)',
    quantum_edge: 'Quantum Edge (Quantum & AI Infra)',
    fintech_pulse: 'Fintech Pulse (Digital Finance)',
    cloud_fortress: 'Cloud Fortress (Cloud & SaaS)',
};

function getTodayET(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function getCacheKey(date: string) {
    return `postmarket:cross-brief:${date}`;
}

/**
 * GET /api/intel/cross-sector-brief
 * Returns the latest AI-generated cross-sector analysis
 */
export async function GET() {
    try {
        const today = getTodayET();
        const cached = await getFromCache<{
            analysis: string;
            generatedAt: string;
            date: string;
            sectorCount: number;
        }>(getCacheKey(today));

        if (cached) {
            return NextResponse.json({ success: true, ...cached });
        }

        // Try yesterday if today not ready
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        const cachedYesterday = await getFromCache<any>(getCacheKey(yesterdayStr));

        if (cachedYesterday) {
            return NextResponse.json({ success: true, ...cachedYesterday });
        }

        return NextResponse.json({ success: false, error: 'No cross-sector brief available yet' }, { status: 404 });
    } catch (e: any) {
        console.error('[CrossSectorBrief] GET error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

/**
 * POST /api/intel/cross-sector-brief
 * Generate cross-sector analysis via Gemini
 */
export async function POST() {
    const startTime = Date.now();

    try {
        // 1. Fetch all 10 sector snapshots from Supabase
        console.log('[CrossSectorBrief] Fetching 10 sector snapshots...');
        const snapshots = await Promise.all(
            SECTOR_IDS.map(async (id) => {
                const snap = await getLatestSnapshot(id);
                return { id, data: snap?.data_json || null };
            })
        );

        const validSnapshots = snapshots.filter(s => s.data);
        if (validSnapshots.length === 0) {
            return NextResponse.json({ error: 'No sector snapshots available' }, { status: 404 });
        }

        // 2. Fetch macro data from Redis
        const [redisVix, redisSpx, redisNq, redisTnx, redisBtc, redisFng] = await Promise.all([
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.VIX),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.SPX),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.NQ),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.TNX),
            getFromCache<YahooQuote>('yahoo:quote:BTC-USD'),
            getFromCache<any>('market:fear_greed'),
        ]);

        // 3. Build concise prompt data
        const sectorSummaries = validSnapshots.map(s => {
            const summary = (s.data as any)?.sector_summary;
            const tickers = (s.data as any)?.tickers || [];

            // Top gainer/loser
            const sorted = [...tickers].sort((a: any, b: any) => b.change_pct - a.change_pct);
            const leader = sorted[0];
            const laggard = sorted[sorted.length - 1];

            // Collect news headlines
            const news = (summary?.newsDigest || []).slice(0, 3).map((n: any) => ({
                title: n.summaryKR || n.headline,
                sentiment: n.sentiment,
            }));

            return {
                sector: SECTOR_LABELS[s.id] || s.id,
                outlook: summary?.outlook || 'NEUTRAL',
                gainers: summary?.gainers || 0,
                losers: summary?.losers || 0,
                avgAlpha: summary?.avg_alpha || 0,
                avgPcr: summary?.avg_pcr || 0,
                totalGex: summary?.total_gex || 0,
                dominantRegime: summary?.dominant_regime || 'NEUTRAL',
                leader: leader ? `${leader.ticker} ${leader.change_pct >= 0 ? '+' : ''}${leader.change_pct.toFixed(2)}%` : '-',
                laggard: laggard ? `${laggard.ticker} ${laggard.change_pct.toFixed(2)}%` : '-',
                newsSentiment: summary?.newsSentimentOverall || 'NEUTRAL',
                news,
            };
        });

        const macroStr = [
            redisVix ? `VIX: ${redisVix.price.toFixed(2)} (${redisVix.changePct >= 0 ? '+' : ''}${redisVix.changePct.toFixed(2)}%)` : null,
            redisSpx ? `S&P500: ${redisSpx.price.toFixed(2)} (${redisSpx.changePct >= 0 ? '+' : ''}${redisSpx.changePct.toFixed(2)}%)` : null,
            redisNq ? `NASDAQ: ${redisNq.price.toFixed(2)} (${redisNq.changePct >= 0 ? '+' : ''}${redisNq.changePct.toFixed(2)}%)` : null,
            redisTnx ? `US10Y: ${redisTnx.price.toFixed(2)}% (${redisTnx.changePct >= 0 ? '+' : ''}${redisTnx.changePct.toFixed(2)}%)` : null,
            redisBtc ? `BTC: $${redisBtc.price.toFixed(0)} (${redisBtc.changePct >= 0 ? '+' : ''}${redisBtc.changePct.toFixed(2)}%)` : null,
            redisFng ? `Fear & Greed: ${redisFng.value || redisFng.score || 'N/A'}` : null,
        ].filter(Boolean).join(' | ');

        // 4. Gemini API call
        const geminiKey = process.env.GEMINI_NEWS_KEY || process.env.GEMINI_VERDICT_KEY || process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
        }

        const genAI = new GoogleGenAI({ apiKey: geminiKey });

        const prompt = `You are SIGNUM Intelligence, an elite institutional-grade financial analyst writing a comprehensive daily POST-MARKET CROSS-SECTOR BRIEF.

## Macro Environment
${macroStr || 'Macro data unavailable'}

## 10 Sector Summaries
${JSON.stringify(sectorSummaries, null, 1)}

## Instructions
Write a comprehensive Korean-language (한국어) daily cross-sector analysis report. This should feel like a Bloomberg Terminal daily brief.

Structure your analysis as follows:

### MARKET OVERVIEW — 시장 개요
- Overall market tone today (based on macro + sector data)
- Key themes and drivers

### SECTOR ROTATION — 섹터 로테이션 분석
- Which sectors gained / lost
- Money flow patterns (where is capital rotating?)
- Why certain sectors outperformed/underperformed

### NEWS IMPACT — 주요 뉴스 영향  
- Top 3-5 most impactful news items across all sectors
- How each news impacts related sectors/tickers
- Market narrative synthesis

### GAMMA & OPTIONS — 감마 & 옵션 환경
- GEX trends across sectors
- PCR signals
- Gamma regime implications

### OUTLOOK — 내일 전망 & 주시 포인트
- Key levels to watch
- Potential catalysts (earnings, macro events)
- Risk factors
- Sector-specific opportunities

Requirements:
- Write in Korean (한국어) naturally, like a senior Korean analyst
- Be specific with numbers, tickers, and percentages
- Use bold (**text**) for emphasis on key data points
- Be detailed and thorough — minimum 800 characters
- Include specific ticker mentions with data
- Do NOT add any markdown code fences, just write the analysis directly
- Do NOT use any emojis in the output — this is a premium institutional terminal
- Use the section headers exactly as shown above (English label + Korean subtitle)`;

        console.log(`[CrossSectorBrief] Calling Gemini with ${sectorSummaries.length} sectors...`);
        const result = await genAI.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        const analysis = (result.text || '').trim();
        if (!analysis) {
            return NextResponse.json({ error: 'Gemini returned empty response' }, { status: 500 });
        }

        // 5. Save to Redis (TTL: 24 hours)
        const today = getTodayET();
        const briefData = {
            analysis,
            generatedAt: new Date().toISOString(),
            date: today,
            sectorCount: validSnapshots.length,
            macroSnapshot: macroStr,
        };

        await setInCache(getCacheKey(today), briefData, 86400); // 24h TTL
        const elapsed = Date.now() - startTime;

        console.log(`[CrossSectorBrief] ✅ Generated ${analysis.length} chars in ${elapsed}ms`);

        return NextResponse.json({
            success: true,
            ...briefData,
            elapsedMs: elapsed,
        });

    } catch (e: any) {
        console.error('[CrossSectorBrief] POST error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
