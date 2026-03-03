// ==========================================================================
// /api/intel/cross-sector-brief — Cross-Sector AI Daily Brief (V2)
// POST: Generate structured multi-language JSON via Gemini
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

function getDayOfWeekET(): string {
    return new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' });
}

function getCacheKey(date: string) {
    return `postmarket:cross-brief-v2:${date}`;
}

// ── Structured Types ──
export interface CrossSectorBriefV2 {
    marketOverview: {
        tone: 'BULLISH' | 'BEARISH' | 'MIXED' | 'CAUTIOUS';
        summary: { ko: string; en: string; ja: string };
        keyDrivers: { ko: string[]; en: string[]; ja: string[] };
    };
    sectorRotation: {
        winners: { sector: string; change: string; reason: { ko: string; en: string; ja: string } }[];
        losers: { sector: string; change: string; reason: { ko: string; en: string; ja: string } }[];
        rotationInsight: { ko: string; en: string; ja: string };
    };
    newsImpact: {
        items: {
            headline: { ko: string; en: string; ja: string };
            impact: { ko: string; en: string; ja: string };
            sentiment: 'positive' | 'negative' | 'neutral';
            relatedSectors: string[];
        }[];
    };
    gammaOptions: {
        totalGexLabel: string;
        avgPcr: number;
        regime: string;
        insight: { ko: string; en: string; ja: string };
    };
    outlook: {
        bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTIOUS';
        keyLevels: { label: string; value: string }[];
        catalysts: { ko: string[]; en: string[]; ja: string[] };
        risks: { ko: string[]; en: string[]; ja: string[] };
        opportunities: { ko: string[]; en: string[]; ja: string[] };
    };
}

/**
 * GET /api/intel/cross-sector-brief
 * Returns the latest AI-generated cross-sector analysis
 */
export async function GET() {
    try {
        const today = getTodayET();
        const cached = await getFromCache<{
            structured: CrossSectorBriefV2;
            generatedAt: string;
            date: string;
            sectorCount: number;
            macroSnapshot: string;
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
 * Generate structured multi-language cross-sector analysis via Gemini
 */
export async function POST() {
    const startTime = Date.now();

    try {
        // 1. Fetch all 10 sector snapshots from Supabase
        console.log('[CrossSectorBrief V2] Fetching 10 sector snapshots...');
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

            const sorted = [...tickers].sort((a: any, b: any) => b.change_pct - a.change_pct);
            const leader = sorted[0];
            const laggard = sorted[sorted.length - 1];

            // Collect news headlines with dates
            const news = (summary?.newsDigest || []).slice(0, 3).map((n: any) => ({
                title: n.headline || n.summaryKR,
                sentiment: n.sentiment,
                publishedAt: n.publishedAt || '',
            }));

            return {
                sector: SECTOR_LABELS[s.id] || s.id,
                sectorId: s.id,
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

        // 4. Gemini API call with structured JSON prompt
        const geminiKey = process.env.GEMINI_NEWS_KEY || process.env.GEMINI_VERDICT_KEY || process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
        }

        const genAI = new GoogleGenAI({ apiKey: geminiKey });
        const todayDate = getTodayET();
        const dayOfWeek = getDayOfWeekET();

        const prompt = `You are SIGNUM Intelligence, an elite institutional-grade financial analyst. Generate a structured POST-MARKET CROSS-SECTOR BRIEF.

## CRITICAL RULES
1. Today's date is ${todayDate} (${dayOfWeek}), Eastern Time.
2. DO NOT guess or fabricate earnings dates, events, or any information not present in the provided data.
3. If a company has already reported earnings (e.g. past date), do NOT say "earnings upcoming" or "imminent."
4. Only reference news items that appear in the provided data. Never hallucinate news.
5. Base ALL analysis strictly on the provided sector data and macro numbers.

## Macro Environment
${macroStr || 'Macro data unavailable'}

## 10 Sector Summaries (Today's Close Data)
${JSON.stringify(sectorSummaries, null, 1)}

## OUTPUT FORMAT
Return ONLY valid JSON (no markdown fences, no extra text). The JSON must follow this exact structure:

{
  "marketOverview": {
    "tone": "BULLISH|BEARISH|MIXED|CAUTIOUS",
    "summary": {
      "ko": "한국어 시장 요약 (2-3문장, 핵심 수치 포함)",
      "en": "English market summary (2-3 sentences with key numbers)",
      "ja": "日本語市場サマリー（2-3文、主要指標含む）"
    },
    "keyDrivers": {
      "ko": ["한국어 핵심 동인 1", "한국어 핵심 동인 2", "한국어 핵심 동인 3"],
      "en": ["English key driver 1", "English key driver 2", "English key driver 3"],
      "ja": ["日本語主要ドライバー1", "日本語主要ドライバー2", "日本語主要ドライバー3"]
    }
  },
  "sectorRotation": {
    "winners": [
      { "sector": "Sector Name", "change": "+X.XX%", "reason": { "ko": "...", "en": "...", "ja": "..." } }
    ],
    "losers": [
      { "sector": "Sector Name", "change": "-X.XX%", "reason": { "ko": "...", "en": "...", "ja": "..." } }
    ],
    "rotationInsight": {
      "ko": "자금 흐름 분석 인사이트 (defensive/cyclical/growth 등)",
      "en": "Capital rotation analysis insight",
      "ja": "資金フロー分析インサイト"
    }
  },
  "newsImpact": {
    "items": [
      {
        "headline": { "ko": "한국어 헤드라인", "en": "English headline", "ja": "日本語ヘッドライン" },
        "impact": { "ko": "시장 영향 분석", "en": "Market impact", "ja": "市場への影響" },
        "sentiment": "positive|negative|neutral",
        "relatedSectors": ["sector_id_1", "sector_id_2"]
      }
    ]
  },
  "gammaOptions": {
    "totalGexLabel": "e.g. -$9.6B (Negative Gamma)",
    "avgPcr": 1.05,
    "regime": "LONG|SHORT|MIXED",
    "insight": {
      "ko": "감마/옵션 환경 해석 2-3문장",
      "en": "Gamma/options environment interpretation 2-3 sentences",
      "ja": "ガンマ/オプション環境解釈 2-3文"
    }
  },
  "outlook": {
    "bias": "BULLISH|BEARISH|NEUTRAL|CAUTIOUS",
    "keyLevels": [
      { "label": "S&P 500 Support", "value": "5,800" },
      { "label": "NASDAQ Resistance", "value": "25,000" }
    ],
    "catalysts": {
      "ko": ["다가오는 촉매 1", "촉매 2"],
      "en": ["Upcoming catalyst 1", "Catalyst 2"],
      "ja": ["今後の触媒1", "触媒2"]
    },
    "risks": {
      "ko": ["리스크 요인 1", "리스크 요인 2"],
      "en": ["Risk factor 1", "Risk factor 2"],
      "ja": ["リスク要因1", "リスク要因2"]
    },
    "opportunities": {
      "ko": ["기회 1", "기회 2"],
      "en": ["Opportunity 1", "Opportunity 2"],
      "ja": ["機会1", "機会2"]
    }
  }
}

## ANALYSIS REQUIREMENTS
- Be specific with numbers, tickers, and percentages from the provided data
- Provide 3-5 news impact items based on PROVIDED news data only
- Provide 2-3 winners and 2-3 losers in sector rotation based on avgAlpha and leader/laggard data
- Provide 2-4 key levels to watch in outlook
- Each language should be natural and professional — Korean like a 증권사 리서치센터, English like Bloomberg Terminal, Japanese like Nikkei/日経
- Maximum 3 keyDrivers, 3 catalysts, 3 risks, 3 opportunities per language`;

        console.log(`[CrossSectorBrief V2] Calling Gemini with ${sectorSummaries.length} sectors...`);
        const result = await genAI.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        const rawText = (result.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
        if (!rawText) {
            return NextResponse.json({ error: 'Gemini returned empty response' }, { status: 500 });
        }

        let structured: CrossSectorBriefV2;
        try {
            structured = JSON.parse(rawText);
        } catch (parseErr) {
            console.error('[CrossSectorBrief V2] JSON parse failed:', parseErr, 'Raw:', rawText.substring(0, 500));
            return NextResponse.json({ error: 'Gemini returned invalid JSON' }, { status: 500 });
        }

        // Validate required fields
        if (!structured.marketOverview || !structured.sectorRotation || !structured.outlook) {
            return NextResponse.json({ error: 'Gemini response missing required sections' }, { status: 500 });
        }

        // 5. Save to Redis (TTL: 24 hours)
        const today = getTodayET();
        const briefData = {
            structured,
            generatedAt: new Date().toISOString(),
            date: today,
            sectorCount: validSnapshots.length,
            macroSnapshot: macroStr,
        };

        await setInCache(getCacheKey(today), briefData, 86400); // 24h TTL
        const elapsed = Date.now() - startTime;

        console.log(`[CrossSectorBrief V2] ✅ Generated structured brief in ${elapsed}ms`);

        return NextResponse.json({
            success: true,
            ...briefData,
            elapsedMs: elapsed,
        });

    } catch (e: any) {
        console.error('[CrossSectorBrief V2] POST error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
