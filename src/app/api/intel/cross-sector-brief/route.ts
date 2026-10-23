// ==========================================================================
// /api/intel/cross-sector-brief — Cross-Sector AI Daily Brief
// POST: Generate structured multi-language JSON via the provider ladder (Anthropic credit Haiku 5.5 -> Bedrock 5.5 -> Bedrock Haiku 4.5)
//       and store it under postmarket:cross-brief-v4:{ET date} together with the generation-time exit-guard verdict (`guard`).
// GET:  Retrieve latest brief for frontend display. Same trading day: v4 first (only if it passes the serving guard), else v3 (AWS Lambda) -> v2.
//       Response carries `source: v4|v3|v2` (lib/ai/crossBriefServe).
// ==========================================================================

import { NextResponse } from 'next/server';
import { getLatestSnapshot, getSnapshotByDate } from '@/lib/supabase/snapshot';
import { getFromCache, setInCache } from '@/services/redisClient';
import { callBedrock } from '@/services/bedrockClient';
import { multiLangJsonGate } from '@/lib/ai/ladderGates';
import { restoreCommonTermsDeep } from '@/lib/ai/commonTerms';
import { YAHOO_CACHE_KEYS, type YahooQuote } from '@/services/yahooFinanceHub';
import { fetchMassive } from '@/services/massiveClient';
import { getETOffsetHours } from '@/services/timezoneUtils';
import { publicBase } from '@/lib/net/publicBase';
import { yieldChangeBp, fmtBp } from '@/lib/yieldChange';
import { KEYLEVELS_SCHEMA_EXAMPLE, KEYLEVELS_REQUIREMENT } from '@/lib/ai/keyLevels';
import { selectServedBrief, toServedPayload, buildGenerationGuard } from '@/lib/ai/crossBriefServe';
import { INDEX_LEVEL_TICKERS, indexLevelRow, buildLevelsBlock, levelsPromptSection, finalizeCrossSectorKeyLevels, type IndexLevelRow } from '@/lib/ai/crossSectorLevels';
import { levelsForExit } from '@/services/structureService';

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
    return `postmarket:cross-brief-v4:${date}`;
}

// ── Structured Types (V3 — Bloomberg-Grade) ──
export interface CrossSectorBriefV3 {
    marketOverview: {
        tone: 'BULLISH' | 'BEARISH' | 'MIXED' | 'CAUTIOUS';
        summary: { ko: string; en: string; ja: string };
        keyDrivers: { ko: string[]; en: string[]; ja: string[] };
    };
    sectorRotation: {
        winners: { sector: string; change: string; changePct?: number; reason: { ko: string; en: string; ja: string } }[];
        losers: { sector: string; change: string; changePct?: number; reason: { ko: string; en: string; ja: string } }[];
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
 * Self-Healing: If no cached brief exists, auto-triggers generation
 */
export async function GET(req: Request) {
    try {
        // Check today + up to 4 days back (covers weekends & holidays)
        const dates: string[] = [];
        for (let daysBack = 0; daysBack <= 4; daysBack++) {
            const d = new Date();
            d.setDate(d.getDate() - daysBack);
            dates.push(d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
        }

        // ★2026-10-11 서빙 우선순위 — 같은 거래일이면 v4(Vercel 크론·Anthropic 크레딧 생성본)가 «서빙 출구 가드를 넘을 때만» 먼저, 아니면 v3(AWS Lambda) → v2.
        //   v4 는 그동안 화면이 읽지 않아 크레딧만 썼다. 가드: 저장본의 생성 때 판정 기록(guard) + 날짜 + 구조 + 문자 체계 + keyLevels 근거(lib/ai/crossBriefServe).
        //   v3·v2 는 예전처럼 입력에 없는 keyLevels 칸만 걸러 내보낸다(lib/ai/keyLevels sanitizeServedBrief). 응답의 `source` = v4|v3|v2 (관측용).
        const picked = await selectServedBrief((key) => getFromCache<any>(key), dates, (msg) => console.warn(`[CrossSectorBrief] ${msg}`));
        if (picked) {
            return NextResponse.json({ success: true, ...toServedPayload(picked) });
        }

        // ══════════════════════════════════════════════════════════
        // SELF-HEALING: No brief cached for last 4 days
        // Auto-trigger generation (rate-limited to prevent stampede)
        // ══════════════════════════════════════════════════════════
        const healingKey = 'cross-brief:healing:lock';
        const lastAttempt = await getFromCache<number>(healingKey);
        const now = Date.now();

        if (!lastAttempt || (now - lastAttempt) > 5 * 60 * 1000) {
            // Set lock (5 min cooldown)
            await setInCache(healingKey, now, 600);

            console.log('[CrossSectorBrief] 🔧 Self-healing: No brief cached, triggering generation...');

            // Retry up to 2 attempts with 10s delay
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    const baseUrl = publicBase(new URL(req.url).origin);
                    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
                        headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
                    }
                    // 생성 본체(POST)는 비밀값을 요구한다(2026-10-04) — 서버 안 호출이라 같은 값을 넘긴다
                    if (process.env.CRON_SECRET) headers['Authorization'] = `Bearer ${process.env.CRON_SECRET}`;

                    const res = await fetch(`${baseUrl}/api/intel/cross-sector-brief`, {
                        method: 'POST',
                        headers,
                        signal: AbortSignal.timeout(55000),
                    });

                    if (res.ok) {
                        const result = await res.json();
                        if (result.success && result.structured) {
                            console.log(`[CrossSectorBrief] ✅ Self-healing success (attempt ${attempt}): ${result.sectorCount} sectors in ${result.elapsedMs}ms`);
                            const { guard: _guard, ...healed } = result;
                            return NextResponse.json({ success: true, ...healed, source: 'v4', selfHealed: true });
                        }
                        break; // Got a response but no structured data
                    } else {
                        console.error(`[CrossSectorBrief] Self-healing attempt ${attempt}/2 failed: ${res.status}`);
                    }
                } catch (e: any) {
                    console.error(`[CrossSectorBrief] Self-healing attempt ${attempt}/2 error:`, e.message);
                }

                if (attempt < 2) {
                    await new Promise(r => setTimeout(r, 10000));
                }
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
export async function POST(req: Request) {
    // [Security 2026-10-04] 생성 본체 — AI 생성 + 저장본(postmarket:cross-brief-v4; v3 는 AWS Lambda 가 쓴다) 덮어쓰기.
    //   공개였다: 누구나 POST 하면 AI 비용·덮어쓰기. 부르는 곳은 서버 안 둘뿐(크론 /api/cron/cross-sector-brief · 아래 GET 자가 치유) —
    //   둘 다 같은 비밀값(CRON_SECRET)을 Authorization 으로 넘긴다. 웹·앱 화면은 GET(저장본 읽기)만 쓴다.
    //   검증은 크론 라우트들과 같은 인라인 방식(헤더 또는 ?secret=).
    const cronSecret = process.env.CRON_SECRET;
    if (process.env.NODE_ENV === 'production' && cronSecret) {
        const authHeader = req.headers.get('authorization');
        const secretParam = new URL(req.url).searchParams.get('secret');
        if (authHeader !== `Bearer ${cronSecret}` && secretParam !== cronSecret) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }
    console.log('[CrossSectorBrief V3] POST handler entered');
    const startTime = Date.now();

    try {
        // [ops/close-dry-current — throwaway comparison deployment, never merged] ?dry=1 no write; ?date= replays that ET session as of 17:50 ET
        const params = new URL(req.url).searchParams;
        const dryRun = params.get('dry') === '1';
        const dryDate = dryRun && /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date')! : null;
        let replayNow = new Date();
        if (dryDate) for (const utc of ['21:50', '22:50']) { const d = new Date(`${dryDate}T${utc}:00Z`); if (d.toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) === '17:50' && d < replayNow) replayNow = d; }
        // 1. Fetch all 10 sector snapshots from Supabase
        console.log('[CrossSectorBrief V3] Fetching 10 sector snapshots...');
        const snapshots = await Promise.all(
            SECTOR_IDS.map(async (id) => {
                const snap = dryDate ? await getSnapshotByDate(id, dryDate) : await getLatestSnapshot(id);
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
            fetchMassive('/v2/reference/news', { ticker: 'SPY,QQQ,DIA,TLT,GLD', limit: '10', order: 'desc', sort: 'published_utc', ...(dryDate ? { 'published_utc.lte': replayNow.toISOString() } : {}) }, true)
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

        // 2c. ★2026-10-11 지수 ETF 옵션 구조 레벨(SPY·QQQ·IWM) — 옵션 구조 «한 문»의 판본(structure:v2)에서만 읽는다(계산 없음, 화면과 같은 값·같은 게이트).
        //   입력에 진짜 레벨이 없어 keyLevels 가 [VIX3M] 한 칸·빈 배열이 되던 것(웹 범위 바 소멸·앱 칩 1개)을 푼다. 못 읽으면 블록을 빼고 예전 규칙 그대로(지어내지 않는다).
        let indexRows: IndexLevelRow[] = [];
        try {
            const lvMap = await levelsForExit([...INDEX_LEVEL_TICKERS]);
            const nowMs = Date.now();
            indexRows = INDEX_LEVEL_TICKERS.map((t) => indexLevelRow(t, lvMap.get(t), nowMs)).filter((r): r is IndexLevelRow => !!r);
        } catch (e: any) {
            console.warn('[CrossSectorBrief V3] 지수 ETF 레벨 판본 읽기 실패(블록 없이 진행):', e?.message);
        }
        const levelsBlock = buildLevelsBlock(indexRows);

        // 3. Build sector summaries
        const sectorSummaries = validSnapshots.map(s => {
            const summary = (s.data as any)?.sector_summary;
            const tickers = (s.data as any)?.tickers || [];

            const sorted = tickers.filter((t: any) => t.change_pct != null && Number.isFinite(t.change_pct))
                .sort((a: any, b: any) => b.change_pct - a.change_pct);
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
                changePct: sorted.length ? sorted.reduce((sum: number, t: any) => sum + t.change_pct, 0) / sorted.length : null,
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
            // 금리 변화는 bp — «(+1.08%)»(수익률의 상대 %)를 모델이 «+1.08%p»로 옮겨 쓴다. Lambda 판과 같은 표기
            redisTnx ? `US10Y: ${redisTnx.price.toFixed(2)}% (${fmtBp(yieldChangeBp({ level: redisTnx.price, chgAbs: redisTnx.change, chgPct: redisTnx.changePct }))})` : null,
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
            const now = dryDate ? replayNow : new Date();
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

        const todayDate = dryDate || getTodayET();
        const dayOfWeek = dryDate ? new Date(`${dryDate}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }) : getDayOfWeekET();

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
${macroStr || 'Macro data unavailable'}${levelsPromptSection(levelsBlock.block)}
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

### 2. FX & International Context — STRICT locale scoping (NEVER cross-contaminate)
- Korean (ko) ONLY: USD/KRW (원/달러) — strong dollar = foreign selling pressure on Korean equities, export competitiveness. The USD/KRW pair must appear ONLY in the "ko" text — NEVER in "en" or "ja".
- Japanese (ja) ONLY: USD/JPY (円/ドル) — intervention levels (155+), yen carry unwind, BOJ policy. USD/JPY must appear ONLY in the "ja" text — NEVER in "en" or "ko".
- English (en) ONLY: DXY / dollar-index strength (global). The "en" text must NEVER reference USD/KRW or USD/JPY — those are region-specific pairs for their own locale only.

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
    ${KEYLEVELS_SCHEMA_EXAMPLE}
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
${KEYLEVELS_REQUIREMENT}
- Maximum 3 keyDrivers, 3 catalysts, 3 risks, 3 opportunities per language
- ALL text fields should be CONCISE — no walls of text. 1-2 sentences max per field.
- edgeAlerts: include 0-3 items. Only include if a genuine cross-asset anomaly exists. Don't force it.
- Use IF→THEN conditional framing for catalysts, risks, and opportunities
- Flag any cross-asset divergences explicitly in edgeAlerts`;

        console.log(`[CrossSectorBrief V3] Calling Bedrock Claude with ${sectorSummaries.length} sectors + 13 macro indicators...`);

        const systemPrompt = 'You are SIGNUM Intelligence, an elite institutional-grade financial analyst. Return ONLY valid JSON. No markdown fences. COMPLIANCE: OBSERVER only — use observational language (observed, noted, indicates). NEVER use predictive/advisory language (will, should, recommended). No investment advice. '
            // ★2026-10-10 Haiku 5.5 가 일본어 칸에 한글/영어를 섞는 일이 있었다(10건 중 1~2건, 규칙을 넣으면 9/10). 현행 모델에도 해가 없는 문장.
            + 'LANGUAGE RULES: write Korean fields in Hangul only and never insert Japanese kana or Chinese characters; write Japanese fields in Japanese only. Keep company names, tickers and other English proper nouns in their original Latin spelling in every language field; never transliterate them by sound into Hangul or katakana.';
        const aiStarted = Date.now();
        const bedrockResult = await callBedrock({
            system: systemPrompt,
            userPrompt: prompt,
            maxTokens: 8192,
            temperature: 0.4,
            timeoutMs: 55000,
            label: 'CrossSectorBrief',
            expectJson: true,   // ★2026-10-10 사다리 출구 가드: 필수 3개 섹션이 있어야 ①② 응답을 쓴다
            locale: 'multi',
            // ★2026-10-10 필수 3개 섹션 + 3개 언어 칸의 언어 혼입·거절·금액 자릿수(구조화 모드) — 구조만 보던 가드로는 5.5 의 한·일 칸 혼입을 못 거른다
            validate: multiLangJsonGate('CrossSector', prompt, { keys: ['marketOverview', 'sectorRotation', 'outlook'], structured: true }),
        });

        let structured: CrossSectorBriefV3;
        try {
            // ★2026-10-10 금융 공통어 음차(«콜월·맥스페인») 출구 복원 — 모델과 무관하게 영어 이름으로(lib/ai/commonTerms)
            structured = restoreCommonTermsDeep(JSON.parse(bedrockResult.text)) as CrossSectorBriefV3;
        } catch (parseErr) {
            console.error('[CrossSectorBrief V3] JSON parse failed:', parseErr, 'Raw:', bedrockResult.text.substring(0, 500));
            return NextResponse.json({ error: 'Bedrock returned invalid JSON' }, { status: 500 });
        }

        // Validate required fields
        if (!structured.marketOverview || !structured.sectorRotation || !structured.outlook) {
            return NextResponse.json({ error: 'Bedrock response missing required sections' }, { status: 500 });
        }

        // 표시용 수치만 실측 종목 평균으로 추가한다. 기존 분류·change·reason은 유지한다.
        for (const row of [...(structured.sectorRotation.winners || []), ...(structured.sectorRotation.losers || [])]) {
            const name = row.sector.trim().toLowerCase();
            const summary = sectorSummaries.find(s => [s.sectorId, s.sector, s.sector.split(' (')[0]]
                .some(label => label.toLowerCase() === name));
            if (summary?.changePct != null && Number.isFinite(summary.changePct)) row.changePct = summary.changePct;
        }

        // ★2026-10-11 keyLevels 출구 — 입력의 매크로 시세 블록(macroStr) + 지수 ETF 옵션 구조 레벨 근거 줄에 없는 수준은 걸러 낸다. 뉴스 본문·섹터 요약·일정의 숫자는 «가격 수준»의 근거가 아니다.
        //   예전 프롬프트 예시가 «S&P 지지·저항 4칸»을 요구해 매일 입력에 없는 수준이 만들어졌다(lib/ai/keyLevels). 이어서 라벨↔값 대조 + 범위 바 순서(Put Floor → Call Wall, 빠진 쪽은 입력의 값 그대로).
        const lvlOut = finalizeCrossSectorKeyLevels(structured, macroStr, indexRows);
        if (lvlOut.dropped) console.warn(`[CrossSectorBrief V3] keyLevels: 입력에 없는/라벨이 어긋난 수준 ${lvlOut.dropped}칸 제거`);
        if (lvlOut.added) console.warn(`[CrossSectorBrief V3] keyLevels: 범위 바 닻 ${lvlOut.added}칸을 입력의 레벨 그대로 채움`);

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
        const today = todayDate;
        const briefData: Record<string, any> = {
            structured,
            generatedAt: new Date().toISOString(),
            date: today,
            sectorCount: validSnapshots.length,
            macroSnapshot: macroStr,
            // 지수 ETF 옵션 구조 레벨(입력에 실제로 넣은 값) — 서빙 출구의 근거 줄 + 웹 범위 바 현재가 표시(ETF 기준가)
            optionLevels: indexRows,
            levelsSnapshot: levelsBlock.ground,
            macroIndicators,
            vixTermStructure,
            upcomingEvents,
            version: 'v4',
        };
        // ★2026-10-11 v4 서빙 출구 가드의 «생성 때 판정» — 입력(프롬프트)을 아는 지금 구조·언어·거절·연도·금액·숫자 근거·keyLevels 근거를 한 번에 판정해 저장본에 남긴다.
        //   GET 은 이 기록(+ 저장본만으로 되는 재검사)이 통과일 때만 v4 를 v3 보다 먼저 보여 준다(lib/ai/crossBriefServe). 제공자는 사다리 응답 단 — 현행 Bedrock Haiku 4.5(legacy)는 서빙 대상이 아니다.
        briefData.guard = buildGenerationGuard({
            brief: briefData as any,
            source: `${systemPrompt}\n${prompt}`,
            provider: String(bedrockResult.provider || 'legacy'),
            model: String(bedrockResult.model || ''),
        });
        if (!briefData.guard.ok) console.warn(`[CrossSectorBrief V4] 서빙 가드 탈락(저장은 함, GET 은 v3 로): ${briefData.guard.reasons.join(', ')}`);

        const aiMs = Date.now() - aiStarted;
        if (!dryRun) await setInCache(getCacheKey(today), briefData, 259200); // 72h TTL — covers weekends (Fri→Mon)
        const elapsed = Date.now() - startTime;

        console.log(`[CrossSectorBrief V3] ✅ Generated Bloomberg-grade brief in ${elapsed}ms (${macroIndicators.length} macro indicators)`);

        return NextResponse.json({
            success: true,
            ...briefData,
            elapsedMs: elapsed,
            ...(dryRun ? { dryRun, reportSource: prompt, ai: { provider: bedrockResult.provider || 'legacy', model: bedrockResult.model, elapsedMs: aiMs }, replayClock: replayNow.toISOString() } : {}),
        });

    } catch (e: any) {
        console.error('[CrossSectorBrief V3] POST error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
