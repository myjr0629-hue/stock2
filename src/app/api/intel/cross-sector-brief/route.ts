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
import { fetchMassive } from '@/services/massiveClient';

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

// [V11.0] Static economic calendar — returns next N upcoming events
function getUpcomingEconomicEvents(count: number): { date: string; time: string; event: string; impact: string }[] {
    const EVENTS = [
        { date: '2026-03-06', time: '08:30', event: 'Non-Farm Payrolls (Feb)', impact: 'HIGH' },
        { date: '2026-03-11', time: '08:30', event: 'CPI / Core CPI (Feb)', impact: 'HIGH' },
        { date: '2026-03-12', time: '08:30', event: 'PPI / Core PPI (Feb)', impact: 'HIGH' },
        { date: '2026-03-13', time: '08:30', event: 'GDP 2nd Estimate (Q4)', impact: 'HIGH' },
        { date: '2026-03-13', time: '08:30', event: 'Core PCE Price Index (Jan)', impact: 'HIGH' },
        { date: '2026-03-18', time: '14:00', event: 'FOMC Rate Decision', impact: 'HIGH' },
        { date: '2026-04-01', time: '10:00', event: 'ISM Manufacturing PMI (Mar)', impact: 'HIGH' },
        { date: '2026-04-03', time: '08:30', event: 'Non-Farm Payrolls (Mar)', impact: 'HIGH' },
        { date: '2026-04-08', time: '14:00', event: 'FOMC Minutes (Mar)', impact: 'HIGH' },
        { date: '2026-04-10', time: '08:30', event: 'CPI / Core CPI (Mar)', impact: 'HIGH' },
        { date: '2026-04-29', time: '14:00', event: 'FOMC Rate Decision', impact: 'HIGH' },
        { date: '2026-05-08', time: '08:30', event: 'Non-Farm Payrolls (Apr)', impact: 'HIGH' },
        { date: '2026-05-12', time: '08:30', event: 'CPI / Core CPI (Apr)', impact: 'HIGH' },
        { date: '2026-06-05', time: '08:30', event: 'Non-Farm Payrolls (May)', impact: 'HIGH' },
        { date: '2026-06-10', time: '08:30', event: 'CPI / Core CPI (May)', impact: 'HIGH' },
        { date: '2026-06-17', time: '14:00', event: 'FOMC Rate Decision', impact: 'HIGH' },
        { date: '2026-07-02', time: '08:30', event: 'Non-Farm Payrolls (Jun)', impact: 'HIGH' },
        { date: '2026-07-14', time: '08:30', event: 'CPI / Core CPI (Jun)', impact: 'HIGH' },
        { date: '2026-07-29', time: '14:00', event: 'FOMC Rate Decision', impact: 'HIGH' },
        { date: '2026-08-07', time: '08:30', event: 'Non-Farm Payrolls (Jul)', impact: 'HIGH' },
        { date: '2026-08-12', time: '08:30', event: 'CPI / Core CPI (Jul)', impact: 'HIGH' },
        { date: '2026-09-04', time: '08:30', event: 'Non-Farm Payrolls (Aug)', impact: 'HIGH' },
        { date: '2026-09-11', time: '08:30', event: 'CPI / Core CPI (Aug)', impact: 'HIGH' },
        { date: '2026-09-16', time: '14:00', event: 'FOMC Rate Decision', impact: 'HIGH' },
    ];
    const now = new Date();
    return EVENTS
        .filter(e => {
            const [y, m, d] = e.date.split('-').map(Number);
            const [h, min] = e.time.split(':').map(Number);
            return new Date(Date.UTC(y, m - 1, d, h + 5, min)).getTime() > now.getTime();
        })
        .slice(0, count);
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

        // 2. Fetch macro data + market news from Redis/Polygon
        const [redisVix, redisSpx, redisNq, redisTnx, redisBtc, redisFng, marketNews] = await Promise.all([
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.VIX),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.SPX),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.NQ),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.TNX),
            getFromCache<YahooQuote>('yahoo:quote:BTC-USD'),
            getFromCache<any>('market:fear_greed'),
            // [V11.0] Fetch broad market news with descriptions for deeper context
            fetchMassive('/v2/reference/news', { ticker: 'SPY,QQQ,DIA,TLT,GLD', limit: '10', order: 'desc', sort: 'published_utc' }, true)
                .then((res: any) => (res?.results || []).map((n: any) => {
                    const title = n.title || '';
                    const desc = n.description ? ` — ${n.description.slice(0, 150)}` : '';
                    return title + desc;
                }).filter(Boolean))
                .catch(() => [] as string[]),
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

        // [V11.0] Market news context for AI
        const newsContext = (marketNews as string[]).length > 0
            ? `\n## Real-time Market News (from Polygon)\n${(marketNews as string[]).map((n: string, i: number) => `${i + 1}. ${n}`).join('\n')}`
            : '';

        // [V11.0] Next economic event context (static calendar)
        const nextEvents = getUpcomingEconomicEvents(3);
        const calendarContext = nextEvents.length > 0
            ? `\n## Upcoming Economic Events\n${nextEvents.map(e => `- ${e.date} ${e.time} ET: ${e.event} (${e.impact})`).join('\n')}`
            : '';

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
6. NEVER provide investment advice, recommendations, or action directives. Use conditional observations only ("IF X → THEN Y is possible").
7. Use "Market Breadth" (참여폭 in Korean) — never translate as 광폭.

## Macro Environment
${macroStr || 'Macro data unavailable'}
${newsContext}
${calendarContext}

## 10 Sector Summaries (Today's Close Data)
${JSON.stringify(sectorSummaries, null, 1)}

## EDGE DETECTION REQUIREMENTS (CRITICAL FOR PREMIUM QUALITY)
1. **Cross-Asset Divergence**: If stocks rise but VIX also rises, or bonds and equities move same direction — flag the divergence explicitly.
2. **Sector Anomalies**: If one sector moves opposite to all others (e.g. Bio Pulse +3% while everything else is red), analyze WHY and flag as anomaly.
3. **Smart Money Signals**: Compare PCR across sectors. Unusually high PCR in bullish sectors = institutional hedging. Flag it.
4. **Gamma Structure**: If GEX is deeply negative + VIX elevated, note the amplified downside risk structure.
5. **News-Price Gap**: If major negative news dropped but stocks didn't react, note the resilience. Vice versa.
6. **Calendar Awareness**: If an upcoming economic event (FOMC, CPI, NFP) is within 3 days, note how current positioning may be pre-event hedging/positioning.

## OUTPUT FORMAT
Return ONLY valid JSON (no markdown fences, no extra text). The JSON must follow this exact structure:

{
  "marketOverview": {
    "tone": "BULLISH|BEARISH|MIXED|CAUTIOUS",
    "summary": {
      "ko": "한국어 시장 요약 (3-4문장, 핵심 수치 + 원인 분석 + 교차 검증 포함)",
      "en": "English market summary (3-4 sentences with key numbers, causation, cross-validation)",
      "ja": "日本語市場サマリー（3-4文、主要指標+原因分析+クロスバリデーション含む）"
    },
    "keyDrivers": {
      "ko": ["핵심 동인 1 (구체적 수치 포함)", "핵심 동인 2", "핵심 동인 3"],
      "en": ["Key driver 1 (with specific numbers)", "Key driver 2", "Key driver 3"],
      "ja": ["主要ドライバー1（具体的数値含む）", "主要ドライバー2", "主要ドライバー3"]
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
      "ko": "자금 흐름 패턴 분석 — defensive vs growth vs cyclical. 이상 신호가 있으면 반드시 언급.",
      "en": "Capital rotation pattern — defensive vs growth vs cyclical. Flag any anomalies.",
      "ja": "資金フローパターン — ディフェンシブ vs グロース vs シクリカル。異常シグナルがあれば必ず言及。"
    }
  },
  "newsImpact": {
    "items": [
      {
        "headline": { "ko": "한국어 헤드라인", "en": "English headline", "ja": "日本語ヘッドライン" },
        "impact": { "ko": "시장 영향 분석 (구체적 수치/섹터 연결)", "en": "Market impact (specific numbers/sector connection)", "ja": "市場への影響（具体的数値/セクター接続）" },
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
      "ko": "감마/옵션 구조적 환경 해석 (2-3문장). 딜러 포지셔닝과 변동성 구조 분석.",
      "en": "Gamma/options structural interpretation (2-3 sentences). Dealer positioning and vol structure.",
      "ja": "ガンマ/オプション構造的環境解釈（2-3文）。ディーラーポジショニングとボラティリティ構造分析。"
    }
  },
  "outlook": {
    "bias": "BULLISH|BEARISH|NEUTRAL|CAUTIOUS",
    "keyLevels": [
      { "label": "S&P 500 Support", "value": "5,800" },
      { "label": "NASDAQ Resistance", "value": "25,000" }
    ],
    "catalysts": {
      "ko": ["촉매 1 (IF 조건부 분석)", "촉매 2"],
      "en": ["Catalyst 1 (IF conditional analysis)", "Catalyst 2"],
      "ja": ["触媒1（IF条件付き分析）", "触媒2"]
    },
    "risks": {
      "ko": ["리스크 1 (IF→THEN 구조)", "리스크 2"],
      "en": ["Risk 1 (IF→THEN structure)", "Risk 2"],
      "ja": ["リスク1（IF→THEN構造）", "リスク2"]
    },
    "opportunities": {
      "ko": ["관찰 1 (조건부 팩트)", "관찰 2"],
      "en": ["Observation 1 (conditional fact)", "Observation 2"],
      "ja": ["観察1（条件付きファクト）", "観察2"]
    }
  }
}

## ANALYSIS REQUIREMENTS
- Be specific with numbers, tickers, and percentages from the provided data
- Provide 3-5 news impact items based on PROVIDED news data AND real-time market news
- Provide 2-3 winners and 2-3 losers in sector rotation based on avgAlpha and leader/laggard data
- Provide 2-4 key levels to watch in outlook
- Each language should be natural and professional — Korean like a 증권사 리서치센터, English like Bloomberg Terminal, Japanese like Nikkei/日経
- Maximum 3 keyDrivers, 3 catalysts, 3 risks, 3 opportunities per language
- Use IF→THEN conditional framing for catalysts, risks, and opportunities (e.g. "IF US10Y > 4.5% → growth stock valuation pressure likely to intensify")
- Flag any cross-asset divergences or sector anomalies as premium edge insights`;

        console.log(`[CrossSectorBrief V2] Calling Gemini with ${sectorSummaries.length} sectors...`);
        // [V11.0] Use gemini-2.5-pro for deeper cross-sector reasoning
        const result = await genAI.models.generateContent({
            model: 'gemini-2.5-pro',
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
