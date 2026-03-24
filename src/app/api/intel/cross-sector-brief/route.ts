// ==========================================================================
// /api/intel/cross-sector-brief — Cross-Sector AI Daily Brief (V3)
// POST: Generate structured multi-language JSON via Bedrock Claude (Bloomberg-Grade)
// GET:  Retrieve latest brief for frontend display
// ==========================================================================

import { NextResponse } from 'next/server';
import { getLatestSnapshot } from '@/lib/supabase/snapshot';
import { getFromCache, setInCache } from '@/services/redisClient';
import { callBedrock } from '@/services/bedrockClient';
import { YAHOO_CACHE_KEYS, type YahooQuote } from '@/services/yahooFinanceHub';
import { fetchMassive } from '@/services/massiveClient';
import { getETOffsetHours } from '@/services/timezoneUtils';

export const maxDuration = 60; // Bedrock AI analysis needs 30s+



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
    return `postmarket:cross-brief-v3:${date}`;
}

// ── Structured Types (V3 — Bloomberg-Grade) ──
export interface CrossSectorBriefV3 {
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
            impactLevel: 'LOW' | 'MED' | 'HIGH';
            relatedSectors: string[];
            impactChain: { indicator: string; direction: '↑' | '↓'; label: { ko: string; en: string; ja: string } }[];
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
    edgeAlerts?: {
        type: 'DIVERGENCE' | 'ANOMALY' | 'EXTREME';
        title: { ko: string; en: string; ja: string };
        detail: { ko: string; en: string; ja: string };
    }[];
}

/**
 * GET /api/intel/cross-sector-brief
 * Returns the latest AI-generated cross-sector analysis
 */
export async function GET() {
    try {
        // Check today + up to 4 days back (covers weekends & holidays)
        for (let daysBack = 0; daysBack <= 4; daysBack++) {
            const d = new Date();
            d.setDate(d.getDate() - daysBack);
            const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

            // Try V3 first, then fall back to V2
            const cachedV3 = await getFromCache<any>(`postmarket:cross-brief-v3:${dateStr}`);
            if (cachedV3) {
                return NextResponse.json({ success: true, ...cachedV3 });
            }
            const cachedV2 = await getFromCache<any>(`postmarket:cross-brief-v2:${dateStr}`);
            if (cachedV2) {
                return NextResponse.json({ success: true, ...cachedV2 });
            }
        }

        return NextResponse.json({ success: false, error: 'No cross-sector brief available yet' }, { status: 404 });
    } catch (e: any) {
        console.error('[CrossSectorBrief] GET error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

/**
 * POST /api/intel/cross-sector-brief
 * Generate structured multi-language cross-sector analysis via Bedrock Claude
 * V3: Bloomberg-grade depth with 13 macro indicators + impact chains
 */
export async function POST() {
    console.log('[CrossSectorBrief V3] POST handler entered');
    const startTime = Date.now();

    try {
        // 1. Fetch all 10 sector snapshots from Supabase
        console.log('[CrossSectorBrief V3] Fetching 10 sector snapshots...');
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

        // 2. Fetch ALL macro indicators + actual index closes + news + calendar from Redis
        const [
            redisVix, redisVix3m, redisSpx, redisNq, redisTnx,
            redisBtc, redisFng, redisGold, redisOil, redisTlt,
            redisRut, redisUsdkrw, redisUsdjpy,
            // Actual index closing prices (regular session — not futures)
            redisIdxNasdaq, redisIdxDow, redisIdxSpx,
            fmpCalendar, marketNews
        ] = await Promise.all([
            // 6 existing
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.VIX),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.VIX3M),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.SPX),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.NQ),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.TNX),
            getFromCache<YahooQuote>('yahoo:quote:BTC-USD'),
            getFromCache<any>('market:fear_greed'),
            // 7 — already in Redis via cron
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.GOLD),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.OIL),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.TLT),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.RUT),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.USDKRW),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.USDJPY),
            // Actual index quotes from Yahoo (^IXIC, ^DJI, ^GSPC)
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.IDX_NASDAQ),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.IDX_DOW),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.IDX_SPX),
            // FMP economic calendar from Redis
            getFromCache<any[]>('fmp:econ-calendar'),
            // Market news with extended descriptions
            fetchMassive('/v2/reference/news', { ticker: 'SPY,QQQ,DIA,TLT,GLD', limit: '10', order: 'desc', sort: 'published_utc' }, true)
                .then((res: any) => (res?.results || []).map((n: any) => {
                    const title = n.title || '';
                    const desc = n.description ? ` — ${n.description.slice(0, 300)}` : '';
                    return title + desc;
                }).filter(Boolean))
                .catch(() => [] as string[]),
        ]);

        // 2b. Use actual index data from Redis (regular session close, not futures)
        // Priority: actual index (^IXIC/^DJI/^GSPC) > futures (NQ=F/ES=F) as fallback
        const idxNasdaq = redisIdxNasdaq || redisNq;   // NASDAQ actual > NQ=F futures
        const idxSpx    = redisIdxSpx || redisSpx;      // S&P 500 actual > ES=F futures  
        const idxDow    = redisIdxDow || null;           // DOW (new, no futures fallback)
        const idxRut    = redisRut;                      // Russell uses RTY=F (no actual index cached yet)

        if (redisIdxNasdaq) console.log(`[CrossSectorBrief] NASDAQ: Index=${redisIdxNasdaq.price.toFixed(2)} (${redisIdxNasdaq.changePct.toFixed(2)}%) vs Futures=${redisNq?.price.toFixed(2)} (${redisNq?.changePct.toFixed(2)}%)`);
        if (redisIdxSpx) console.log(`[CrossSectorBrief] S&P500: Index=${redisIdxSpx.price.toFixed(2)} (${redisIdxSpx.changePct.toFixed(2)}%) vs Futures=${redisSpx?.price.toFixed(2)} (${redisSpx?.changePct.toFixed(2)}%)`);
        if (redisIdxDow) console.log(`[CrossSectorBrief] DOW: Index=${redisIdxDow.price.toFixed(2)} (${redisIdxDow.changePct.toFixed(2)}%)`);

        // 3. Build sector summaries
        const sectorSummaries = validSnapshots.map(s => {
            const summary = (s.data as any)?.sector_summary;
            const tickers = (s.data as any)?.tickers || [];

            const sorted = [...tickers].sort((a: any, b: any) => b.change_pct - a.change_pct);
            const leader = sorted[0];
            const laggard = sorted[sorted.length - 1];

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

        // 4. Build expanded macro string — Actual indices (reg-session close) + Yahoo for commodities/FX
        const fmt = (q: YahooQuote | null, label: string, suffix = '') =>
            q ? `${label}: ${q.price.toFixed(suffix === '%' ? 2 : (q.price > 1000 ? 0 : 2))}${suffix} (${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%)` : null;

        const macroStr = [
            // US Indices (actual index close from Yahoo ^IXIC/^DJI/^GSPC)
            fmt(redisVix, 'VIX'),
            fmt(redisVix3m, 'VIX3M'),
            redisVix && redisVix3m ? `VIX/VIX3M Ratio: ${(redisVix.price / (redisVix3m.price || 1)).toFixed(3)} (${redisVix.price > redisVix3m.price ? 'BACKWARDATION ⚠️' : 'CONTANGO ✓'})` : null,
            fmt(idxSpx, 'S&P500'),
            fmt(idxNasdaq, 'NASDAQ'),
            fmt(idxDow, 'DOW'),
            fmt(idxRut, 'Russell2000'),
            redisTnx ? `US10Y: ${redisTnx.price.toFixed(2)}% (${redisTnx.changePct >= 0 ? '+' : ''}${redisTnx.changePct.toFixed(2)}%)` : null,
            fmt(redisTlt, 'TLT(20Y+Bond)'),
            fmt(redisGold, 'Gold'),
            fmt(redisOil, 'WTI Oil'),
            redisBtc ? `BTC: $${redisBtc.price.toFixed(0)} (${redisBtc.changePct >= 0 ? '+' : ''}${redisBtc.changePct.toFixed(2)}%)` : null,
            redisFng ? `Fear & Greed: ${redisFng.value || redisFng.score || 'N/A'}` : null,
            redisUsdkrw ? `USD/KRW: ${redisUsdkrw.price.toFixed(2)} (${redisUsdkrw.changePct >= 0 ? '+' : ''}${redisUsdkrw.changePct.toFixed(2)}%)` : null,
            redisUsdjpy ? `USD/JPY: ${redisUsdjpy.price.toFixed(2)} (${redisUsdjpy.changePct >= 0 ? '+' : ''}${redisUsdjpy.changePct.toFixed(2)}%)` : null,
        ].filter(Boolean).join(' | ');

        // 5. Market news context
        const newsContext = (marketNews as string[]).length > 0
            ? `\n## Real-time Market News (from Polygon)\n${(marketNews as string[]).map((n: string, i: number) => `${i + 1}. ${n}`).join('\n')}`
            : '';

        // 6. FMP Economic Calendar from Redis (replaces hardcoded)
        let calendarContext = '';
        const upcomingEvents: { date: string; event: string; daysUntil: number; impact: string }[] = [];
        if (Array.isArray(fmpCalendar) && fmpCalendar.length > 0) {
            const now = new Date();
            const upcoming = fmpCalendar
                .filter((e: any) => new Date(e.date || e.dateTime) > now)
                .slice(0, 5);
            calendarContext = upcoming.length > 0
                ? `\n## Upcoming Economic Events (FMP Live)\n${upcoming.map((e: any) => {
                    const evtDate = new Date(e.date || e.dateTime);
                    const daysUntil = Math.ceil((evtDate.getTime() - now.getTime()) / 86400000);
                    upcomingEvents.push({
                        date: (e.date || e.dateTime || '').split('T')[0],
                        event: e.event || e.name || '',
                        daysUntil,
                        impact: e.impact || 'MEDIUM',
                    });
                    return `- D-${daysUntil} ${(e.date || '').split(' ')[0]}: ${e.event || e.name} (${e.impact || 'MEDIUM'})`;
                }).join('\n')}`
                : '';
        }

        // 7. Bedrock Claude Sonnet 4 API call
        if (!process.env.AWS_ACCESS_KEY_ID) {
            return NextResponse.json({ error: 'AWS credentials not configured' }, { status: 500 });
        }

        const todayDate = getTodayET();
        const dayOfWeek = getDayOfWeekET();

        const prompt = `You are SIGNUM Intelligence, an elite institutional-grade financial analyst producing a Bloomberg-quality POST-MARKET CROSS-SECTOR BRIEF.

## CRITICAL RULES
1. Today's date is ${todayDate} (${dayOfWeek}), Eastern Time.
2. DO NOT guess or fabricate earnings dates, events, or any information not present in the provided data.
3. If a company has already reported earnings (e.g. past date), do NOT say "earnings upcoming."
4. Only reference news items that appear in the provided data. Never hallucinate news.
5. Base ALL analysis strictly on the provided sector data and macro numbers.
6. NEVER provide investment advice, recommendations, or action directives. Use ONLY conditional observations (e.g. "IF X → THEN Y is historically associated with Z").
7. Use "Market Breadth" (참여폭 in Korean) — never translate as 광폭.

## 13 Macro Indicators (Full Cross-Asset View)
${macroStr || 'Macro data unavailable'}
${newsContext}
${calendarContext}

## 10 Sector Summaries (Today's Close Data)
${JSON.stringify(sectorSummaries, null, 1)}

## BLOOMBERG-GRADE ANALYSIS REQUIREMENTS (CRITICAL)

### 1. Cross-Asset Correlation Analysis
- VIX vs VIX3M: If VIX > VIX3M (Backwardation), note this is historically associated with near-term stress. Provide typical duration context.
- Equity-Bond Correlation: If SPX and TLT move in same direction, flag the unusual correlation. If diverged, note if Risk-On or Risk-Off.
- Gold-Dollar-Bond Triangle: Gold↑ + US10Y↑ = inflation hedge demand. Gold↑ + US10Y↓ = flight-to-safety. Flag which pattern is observed.
- Oil Impact Chain: Oil price moves → inflation expectations → yield impact → growth stock sensitivity.
- BTC as Risk Barometer: BTC correlating with NASDAQ = risk-on proxy. BTC diverging = crypto-specific flow.

### 2. FX & International Context
- USD/KRW context for Korean analysis: Strong dollar = foreign selling pressure on Korean equities, impact on export competitiveness.
- USD/JPY context for Japanese analysis: Approaching intervention levels (155+), yen carry trade unwind risks, BOJ policy implications.
- For English: DXY-equivalent strength assessment using the FX pairs.

### 3. News Impact Chain (MANDATORY for each news item)
For each news item, provide an "impactChain" showing the causal propagation:
NEWS → Primary Indicator (direct effect) → Secondary Indicator (ripple) → Tertiary (sector impact)
Example: "CPI beats expectations" → US10Y ↑ (direct) → NASDAQ ↓ (valuation) → VIX ↑ (uncertainty)

### 4. Edge Detection (Premium Insights)
Identify and flag as "edgeAlerts" any of these institutional-grade observations:
- DIVERGENCE: When correlated assets break their normal relationship (e.g., stocks up + VIX up)
- ANOMALY: When one sector moves opposite to macro (e.g., Bio +3% in a red tape day with no news)
- EXTREME: When Fear & Greed < 25 or > 75, VIX term structure inversion, or unusual PCR readings

### 5. Economic Calendar Awareness
If an upcoming economic event (FOMC, CPI, NFP) is within 3 days, analyze current positioning as potential pre-event hedging. Cross-reference with options structure (GEX/PCR) to assess dealer hedging.

### 6. Locale-Specific Depth
- Korean (ko): Write like 삼성증권/미래에셋 리서치센터 수석 애널리스트. Use 원/달러 context, 외국인 수급 관점, KOSPI 연동성 언급.
- English (en): Write like Bloomberg Terminal Morning Brief. Institutional jargon, DXY context, cross-asset correlation language.
- Japanese (ja): Write like 日経QUICK or 野村證券マクロレポート. USD/JPY context, 日銀政策への影響, 円キャリー巻き戻しリスク.

## OUTPUT FORMAT
Return ONLY valid JSON (no markdown fences, no extra text). The JSON must follow this exact structure:

{
  "marketOverview": {
    "tone": "BULLISH|BEARISH|MIXED|CAUTIOUS",
    "summary": {
      "ko": "2문장 이내. 핵심 수치 + Cross-Asset 상관관계 + 원화 맥락. 짧고 임팩트있게.",
      "en": "Max 2 sentences. Key numbers + cross-asset signal + institutional edge.",
      "ja": "2文以内。主要指標 + クロスアセット相関 + 円建てコンテキスト。"
    },
    "keyDrivers": {
      "ko": ["1줄 팩트 (수치 포함)", "1줄 팩트", "1줄 팩트"],
      "en": ["One-line fact with number", "One-line fact", "One-line fact"],
      "ja": ["1行ファクト（数値含む）", "1行ファクト", "1行ファクト"]
    }
  },
  "sectorRotation": {
    "winners": [
      { "sector": "Sector Name", "change": "+X.XX%", "reason": { "ko": "1줄", "en": "1 line", "ja": "1行" } }
    ],
    "losers": [
      { "sector": "Sector Name", "change": "-X.XX%", "reason": { "ko": "1줄", "en": "1 line", "ja": "1行" } }
    ],
    "rotationInsight": {
      "ko": "자금 흐름 패턴 1-2줄. defensive vs growth, 이상 신호 포함.",
      "en": "Capital rotation 1-2 lines. Flag anomalies.",
      "ja": "資金フロー1-2行。異常シグナル含む。"
    }
  },
  "newsImpact": {
    "items": [
      {
        "headline": { "ko": "헤드라인", "en": "Headline", "ja": "ヘッドライン" },
        "impact": { "ko": "시장 영향 1줄", "en": "Market impact 1 line", "ja": "市場影響1行" },
        "sentiment": "positive|negative|neutral",
        "impactLevel": "LOW|MED|HIGH",
        "relatedSectors": ["sector_id_1", "sector_id_2"],
        "impactChain": [
          { "indicator": "US10Y", "direction": "↑", "label": { "ko": "금리 직접 영향", "en": "Direct yield impact", "ja": "金利直接影響" } },
          { "indicator": "NASDAQ", "direction": "↓", "label": { "ko": "밸류에이션 압력", "en": "Valuation pressure", "ja": "バリュエーション圧力" } }
        ]
      }
    ]
  },
  "gammaOptions": {
    "totalGexLabel": "e.g. -$271.6M (Negative Gamma)",
    "avgPcr": 1.05,
    "regime": "LONG|SHORT|MIXED",
    "insight": { "ko": "2줄 이내", "en": "Max 2 lines", "ja": "2行以内" }
  },
  "outlook": {
    "bias": "BULLISH|BEARISH|NEUTRAL|CAUTIOUS",
    "keyLevels": [
      { "label": "S&P 500 Support", "value": "5,800" },
      { "label": "S&P 500 Resistance", "value": "6,200" },
      { "label": "NASDAQ Resistance", "value": "25,000" },
      { "label": "VIX Threshold", "value": "20.0" }
    ],
    "catalysts": {
      "ko": ["IF 조건 → THEN 관찰 (1줄)", "IF → THEN"],
      "en": ["IF condition → THEN observation (1 line)", "IF → THEN"],
      "ja": ["IF条件 → THEN観察（1行）", "IF → THEN"]
    },
    "risks": {
      "ko": ["IF → THEN 리스크"],
      "en": ["IF → THEN risk"],
      "ja": ["IF → THENリスク"]
    },
    "opportunities": {
      "ko": ["조건부 관찰 팩트"],
      "en": ["Conditional observation"],
      "ja": ["条件付き観察"]
    }
  },
  "edgeAlerts": [
    {
      "type": "DIVERGENCE|ANOMALY|EXTREME",
      "title": { "ko": "SPX↑ + VIX↑ Divergence 관측", "en": "SPX↑ + VIX↑ Divergence Detected", "ja": "SPX↑ + VIX↑ ダイバージェンス観測" },
      "detail": { "ko": "1-2줄 상관관계 설명 (수치 포함)", "en": "1-2 line correlation explanation with numbers", "ja": "1-2行相関説明（数値含む）" }
    }
  ]
}

## ANALYSIS REQUIREMENTS
- Provide 3-5 news impact items with impactChain for each
- Provide 2-3 winners and 2-3 losers based on avgAlpha and leader/laggard data
- Provide 3-4 key levels (include VIX threshold if elevated)
- Maximum 3 keyDrivers, 3 catalysts, 3 risks, 3 opportunities per language
- ALL text fields should be CONCISE — no walls of text. 1-2 sentences max per field.
- edgeAlerts: include 0-3 items. Only include if a genuine cross-asset anomaly exists. Don't force it.
- Use IF→THEN conditional framing for catalysts, risks, and opportunities
- Flag any cross-asset divergences explicitly in edgeAlerts`;

        console.log(`[CrossSectorBrief V3] Calling Bedrock Claude with ${sectorSummaries.length} sectors + 13 macro indicators...`);

        const bedrockResult = await callBedrock({
            system: 'You are SIGNUM Intelligence, an elite institutional-grade financial analyst. Return ONLY valid JSON. No markdown fences.',
            userPrompt: prompt,
            maxTokens: 8192,
            temperature: 0.4,
            timeoutMs: 55000,
            label: 'CrossSectorBrief',
        });

        let structured: CrossSectorBriefV3;
        try {
            structured = JSON.parse(bedrockResult.text);
        } catch (parseErr) {
            console.error('[CrossSectorBrief V3] JSON parse failed:', parseErr, 'Raw:', bedrockResult.text.substring(0, 500));
            return NextResponse.json({ error: 'Bedrock returned invalid JSON' }, { status: 500 });
        }

        // Validate required fields
        if (!structured.marketOverview || !structured.sectorRotation || !structured.outlook) {
            return NextResponse.json({ error: 'Bedrock response missing required sections' }, { status: 500 });
        }

        // 8. Build macro indicators array for frontend display (actual index preferred)
        const macroIndicators = [
            redisVix ? { key: 'VIX', value: redisVix.price, changePct: redisVix.changePct, category: 'volatility' } : null,
            redisVix3m ? { key: 'VIX3M', value: redisVix3m.price, changePct: redisVix3m.changePct, category: 'volatility' } : null,
            // US Equity Indices (actual index close, futures fallback)
            idxSpx ? { key: 'S&P 500', value: idxSpx.price, changePct: idxSpx.changePct, category: 'equity' } : null,
            idxNasdaq ? { key: 'NASDAQ', value: idxNasdaq.price, changePct: idxNasdaq.changePct, category: 'equity' } : null,
            idxDow ? { key: 'DOW', value: idxDow.price, changePct: idxDow.changePct, category: 'equity' } : null,
            idxRut ? { key: 'Russell 2K', value: idxRut.price, changePct: idxRut.changePct, category: 'equity' } : null,
            // Bonds & Commodities
            redisTnx ? { key: 'US 10Y', value: redisTnx.price, changePct: redisTnx.changePct, category: 'bond' } : null,
            redisTlt ? { key: 'TLT', value: redisTlt.price, changePct: redisTlt.changePct, category: 'bond' } : null,
            redisGold ? { key: 'Gold', value: redisGold.price, changePct: redisGold.changePct, category: 'commodity' } : null,
            redisOil ? { key: 'WTI Oil', value: redisOil.price, changePct: redisOil.changePct, category: 'commodity' } : null,
            redisBtc ? { key: 'BTC', value: redisBtc.price, changePct: redisBtc.changePct, category: 'crypto' } : null,
            redisFng ? { key: 'Fear & Greed', value: Number(redisFng.value || redisFng.score || 50), changePct: 0, category: 'sentiment' } : null,
            // FX
            redisUsdkrw ? { key: 'USD/KRW', value: redisUsdkrw.price, changePct: redisUsdkrw.changePct, category: 'fx' } : null,
            redisUsdjpy ? { key: 'USD/JPY', value: redisUsdjpy.price, changePct: redisUsdjpy.changePct, category: 'fx' } : null,
        ].filter(Boolean);

        // VIX term structure
        const vixPrice = redisVix?.price || 0;
        const vixTermStructure = vixPrice && redisVix3m ? {
            vix: vixPrice,
            vix3m: redisVix3m.price,
            ratio: +(vixPrice / (redisVix3m.price || 1)).toFixed(3),
            state: vixPrice > redisVix3m.price ? 'BACKWARDATION' : 'CONTANGO',
        } : null;

        // 9. Save to Redis (TTL: 24 hours)
        const today = getTodayET();
        const briefData = {
            structured,
            generatedAt: new Date().toISOString(),
            date: today,
            sectorCount: validSnapshots.length,
            macroSnapshot: macroStr,
            macroIndicators,
            vixTermStructure,
            upcomingEvents,
            version: 'v3',
        };

        await setInCache(getCacheKey(today), briefData, 259200); // 72h TTL — covers weekends (Fri→Mon)
        const elapsed = Date.now() - startTime;

        console.log(`[CrossSectorBrief V3] ✅ Generated Bloomberg-grade brief in ${elapsed}ms (${macroIndicators.length} macro indicators)`);

        return NextResponse.json({
            success: true,
            ...briefData,
            elapsedMs: elapsed,
        });

    } catch (e: any) {
        console.error('[CrossSectorBrief V3] POST error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
