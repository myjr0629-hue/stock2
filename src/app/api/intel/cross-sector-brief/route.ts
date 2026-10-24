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
import { multiLangJsonGate, collectLocaleStrings, scriptPurityReasons } from '@/lib/ai/ladderGates';
import { restoreCommonTermsDeep } from '@/lib/ai/commonTerms';
import { YAHOO_CACHE_KEYS, type YahooQuote } from '@/services/yahooFinanceHub';
import { fetchMassive } from '@/services/massiveClient';
import { getETOffsetHours } from '@/services/timezoneUtils';
import { publicBase } from '@/lib/net/publicBase';
import { yieldChangeBp, fmtBp } from '@/lib/yieldChange';
import { KEYLEVELS_SCHEMA_EXAMPLE, KEYLEVELS_REQUIREMENT } from '@/lib/ai/keyLevels';
import { selectServedBrief, toServedPayload, buildGenerationGuard, evaluateServedV4 } from '@/lib/ai/crossBriefServe';
import { INDEX_LEVEL_TICKERS, indexLevelRow, buildLevelsBlock, levelsPromptSection, finalizeCrossSectorKeyLevels, type IndexLevelRow } from '@/lib/ai/crossSectorLevels';
import { levelsForExit } from '@/services/structureService';
import * as CLOSING from '../../../../../scripts/lambda-cross-sector/closingReport';
import { sessionCloseMinutes } from '@/lib/marketCalendar';
import type { ClosingNarrative } from '@/lib/ai/closingReport';
import { closingReportProblems } from '@/lib/ai/closingReport';
import { reportDate } from '@/lib/app/reportLink';

// ★2026-10-24 장마감 리포트 v2 — 5단 서사×3언어가 더해져 출력이 약 8천 토큰(옛 5.3~5.5천, a55 23초)이다. 60초 한도·① 30초로는
//   시간 초과→현행 4.5 도 못 끝나 미저장이 된다. 한도 300초 · 모델 예산 240초(① 90초·재시도 1 → 남은 시간 현행).
export const maxDuration = 300;



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

/** 관측 전용 — 언어 혼입(script:*)으로 ① 응답이 버려질 때 어느 칸이었는지 로그에 남긴다(10/24 6차 실측: 사유만 남아 원인 칸을 몰랐다). 판정은 바꾸지 않는다. */
function logScriptCulprits(gate: unknown, text: string): void {
    if (gate === true || !JSON.stringify(gate).includes('script:')) return;
    try {
        const hits = collectLocaleStrings(JSON.parse(text), null).filter((it) => scriptPurityReasons(it.text, it.loc).length);
        if (hits.length) console.warn(`[CrossSectorBrief V4] 언어 혼입 칸: ${hits.slice(0, 4).map((h) => `${h.path}=${h.text.slice(0, 90)}`).join(' | ')}`);
    } catch { /* 관측 실패는 무시 */ }
}

/** The five narrative paragraphs exist in all three languages (detailed checks run after parsing, with repair). */
function narrativeShapeOk(n: any): boolean {
    return !!n && n.version === 1 && Array.isArray(n.causeRefs)
        && CLOSING.FIELDS.every((f: string) => ['ko', 'en', 'ja'].every((l) => typeof n[f]?.[l] === 'string' && n[f][l].trim().length > 0));
}

/** Dry replay clock: the production cron's 17:50 ET for that session, never later than the real clock. */
function dryClock(date: string, real: Date): Date {
    for (const utc of ['21:50', '22:50']) {
        const d = new Date(`${date}T${utc}:00Z`);
        if (d.toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) === '17:50') return d < real ? d : real;
    }
    return real;
}

function getCacheKey(date: string) {
    return `postmarket:cross-brief-v4:${date}`;
}

// ── Structured Types (V3 — Bloomberg-Grade) ──
export interface CrossSectorBriefV3 {
    closingNarrative?: ClosingNarrative;
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
        const requested = new URL(req.url).searchParams.get('date');
        if (requested !== null && !reportDate(requested)) return NextResponse.json({ success: false, error: 'Invalid report date' }, { status: 400 });
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
        const picked = await selectServedBrief((key) => getFromCache<any>(key), requested ? [requested] : dates, (msg) => console.warn(`[CrossSectorBrief] ${msg}`));
        if (picked) {
            return NextResponse.json({ success: true, ...toServedPayload(picked) });
        }
        // A dated push must never open another day's report or trigger a new generation.
        if (requested) return NextResponse.json({ success: false, date: requested, error: 'No cross-sector brief available yet' }, { status: 404 });

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

            // 한 번만, 생성 예산(모델 240초)을 기다린다 — 예전 55초 중단 + 재시도는 생성이 끝나기 전에 POST 를 또 띄웠다(관문 10241205, 장마감 리포트 v2 는 25~150초)
            for (let attempt = 1; attempt <= 1; attempt++) {
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
                        signal: AbortSignal.timeout(285_000),
                    });

                    if (res.ok) {
                        const result = await res.json();
                        if (result.success && result.structured && evaluateServedV4(result, getTodayET()).ok) {
                            console.log(`[CrossSectorBrief] ✅ Self-healing success (attempt ${attempt}): ${result.sectorCount} sectors in ${result.elapsedMs}ms`);
                            return NextResponse.json({ success: true, ...toServedPayload({ source: 'v4', date: getTodayET(), brief: result }), selfHealed: true });
                        }
                        break; // Got a response but no structured data
                    } else {
                        console.error(`[CrossSectorBrief] Self-healing attempt ${attempt}/1 failed: ${res.status}`);
                    }
                } catch (e: any) {
                    console.error(`[CrossSectorBrief] Self-healing attempt ${attempt}/1 error:`, e.message);
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
        // Dry (?dry=1) never writes. Only a dry run may replay a past session (?date=YYYY-MM-DD) — inputs are limited to
        // that ET session as of its 17:50 ET cron time; the scheduled path (no params) is unchanged.
        const params = new URL(req.url).searchParams;
        const dryRun = params.get('dry') === '1';
        const dryDate = dryRun && params.has('date') ? reportDate(params.get('date')) : null;
        if (dryRun && params.has('date') && !dryDate) return NextResponse.json({ error: 'Invalid report date' }, { status: 400 });
        const now = dryDate ? dryClock(dryDate, new Date()) : new Date();
        const todayDate = dryDate || getTodayET();
        const closeMinutes = sessionCloseMinutes(todayDate);
        // 1. Fetch all 10 sector snapshots from Supabase
        console.log('[CrossSectorBrief V3] Fetching 10 sector snapshots...');
        const snapshots = await Promise.all(
            SECTOR_IDS.map(async (id) => {
                if (dryDate) {
                    // snapshot_date is a label; the capture time must also fall on that ET session, before the replay clock.
                    const snap = await getSnapshotByDate(id, dryDate);
                    const at = new Date(String((snap?.data_json as any)?.meta?.snapshot_timestamp || ''));
                    const ok = Number.isFinite(at.getTime()) && at <= now && at.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === dryDate;
                    return { id, sessionDate: snap?.snapshot_date, data: ok ? snap!.data_json : null };
                }
                const snap = await getLatestSnapshot(id);
                return { id, sessionDate: snap?.snapshot_date, data: snap?.snapshot_date === todayDate ? snap.data_json : null };
            })
        );

        const validSnapshots = snapshots.filter(s => s.data);
        if (validSnapshots.length === 0) {
            return NextResponse.json({ error: 'No sector snapshots available' }, { status: 404 });
        }

        // 2. Fetch ALL macro indicators + actual index closes + news + calendar from Redis
        let [
            redisVix, redisVix3m, redisSpx, redisNq, redisTnx,
            redisBtc, redisFng, redisGold, redisOil, redisTlt,
            redisRut, redisUsdkrw, redisUsdjpy,
            // Actual index closing prices (regular session — not futures)
            redisIdxNasdaq, redisIdxDow, redisIdxSpx,
            fmpCalendar, marketNews, redisDxy
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
            fetchMassive('/v2/reference/news', { ticker: 'SPY,QQQ,DIA,TLT,GLD', limit: '10', order: 'desc', sort: 'published_utc', ...(dryDate ? { 'published_utc.lte': now.toISOString() } : {}) }, true)
                .then((res: any) => CLOSING.newsEvidence(res?.results || [], todayDate, now, closeMinutes))
                .catch(() => []),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.DXY),
        ]);

        // All prompt and display readings must belong to the same ET session.
        [redisVix, redisVix3m, redisSpx, redisNq, redisTnx, redisBtc, redisFng,
            redisGold, redisOil, redisTlt, redisRut, redisUsdkrw, redisUsdjpy, redisDxy] =
            [redisVix, redisVix3m, redisSpx, redisNq, redisTnx, redisBtc, redisFng,
                redisGold, redisOil, redisTlt, redisRut, redisUsdkrw, redisUsdjpy, redisDxy]
                .map(q => CLOSING.sessionReading(q, todayDate, now));

        // 2b. Use actual index data from Redis (regular session close, not futures)
        // Only same-session, timestamped actual cash index quotes qualify.
        const cashCloses = {
            spx: CLOSING.regularClose(redisIdxSpx, '^GSPC', todayDate, now, closeMinutes),
            nasdaq: CLOSING.regularClose(redisIdxNasdaq, '^IXIC', todayDate, now, closeMinutes),
            dow: CLOSING.regularClose(redisIdxDow, '^DJI', todayDate, now, closeMinutes),
        };
        if (!cashCloses.spx || !cashCloses.nasdaq) return NextResponse.json({ error: 'Regular-session cash closes unavailable' }, { status: 503 });
        const idxNasdaq = cashCloses.nasdaq;
        const idxSpx = cashCloses.spx;
        const idxDow = cashCloses.dow;

        // 2c. ★2026-10-11 지수 ETF 옵션 구조 레벨(SPY·QQQ·IWM) — 옵션 구조 «한 문»의 판본(structure:v2)에서만 읽는다(계산 없음, 화면과 같은 값·같은 게이트).
        //   입력에 진짜 레벨이 없어 keyLevels 가 [VIX3M] 한 칸·빈 배열이 되던 것(웹 범위 바 소멸·앱 칩 1개)을 푼다. 못 읽으면 블록을 빼고 예전 규칙 그대로(지어내지 않는다).
        let indexRows: IndexLevelRow[] = [];
        try {
            const lvMap = await levelsForExit([...INDEX_LEVEL_TICKERS]);
            const nowMs = dryDate ? now.getTime() : Date.now();
            indexRows = INDEX_LEVEL_TICKERS.map((t) => indexLevelRow(t, lvMap.get(t), nowMs)).filter((r): r is IndexLevelRow => !!r && r.asOf != null && new Date(r.asOf).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === todayDate);
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

            const news = CLOSING.newsEvidence((summary?.newsDigest || []).slice(0, 3), todayDate, now, closeMinutes, s.id);

            return {
                sector: SECTOR_LABELS[s.id] || s.id,
                sectorId: s.id,
                sessionDate: s.sessionDate,
                changePct: sorted.length ? sorted.reduce((sum: number, t: any) => sum + t.change_pct, 0) / sorted.length : null,
                outlook: summary?.outlook || 'NEUTRAL',
                gainers: summary?.gainers || 0,
                losers: summary?.losers || 0,
                avgAlpha: summary?.avg_alpha ?? null,
                avgPcr: summary?.avg_pcr ?? null,
                totalGex: summary?.total_gex ?? null,
                dominantRegime: summary?.dominant_regime || 'NEUTRAL',
                leader: leader ? `${leader.ticker} ${leader.change_pct >= 0 ? '+' : ''}${leader.change_pct.toFixed(2)}%` : '-',
                laggard: laggard ? `${laggard.ticker} ${laggard.change_pct.toFixed(2)}%` : '-',
                newsSentiment: summary?.newsSentimentOverall || 'NEUTRAL',
                news,
            };
        });

        // 4. Build expanded macro string — Actual indices (reg-session close) + Yahoo for commodities/FX
        const fmt = (q: { price: number; changePct: number } | null, label: string, suffix = '') =>
            q ? `${label}: ${q.price.toFixed(suffix === '%' ? 2 : (q.price > 1000 ? 0 : 2))}${suffix} (${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%)` : null;

        const macroStr = [
            // US Indices (actual index close from Yahoo ^IXIC/^DJI/^GSPC)
            fmt(redisVix, 'VIX'),
            fmt(redisVix3m, 'VIX3M'),
            redisVix && redisVix3m ? `VIX/VIX3M Ratio: ${(redisVix.price / (redisVix3m.price || 1)).toFixed(3)} (${redisVix.price > redisVix3m.price ? 'BACKWARDATION ⚠️' : 'CONTANGO ✓'})` : null,
            fmt(idxSpx, 'S&P500'),
            fmt(idxNasdaq, 'NASDAQ'),
            fmt(idxDow, 'DOW'),
            fmt(redisSpx, 'ES=F daily futures change (not since cash close)'),
            fmt(redisNq, 'NQ=F NASDAQ100 daily futures change (not NASDAQ Composite)'),
            fmt(redisRut, 'RTY=F daily futures change (not cash close)'),
            // 금리 변화는 bp — «(+1.08%)»(수익률의 상대 %)를 모델이 «+1.08%p»로 옮겨 쓴다. Lambda 판과 같은 표기
            redisTnx ? `US10Y: ${redisTnx.price.toFixed(2)}% (${fmtBp(yieldChangeBp({ level: redisTnx.price, chgAbs: redisTnx.change, chgPct: redisTnx.changePct }))})` : null,
            fmt(redisDxy, 'DXY'),
            fmt(redisTlt, 'TLT(20Y+Bond)'),
            fmt(redisGold, 'Gold'),
            fmt(redisOil, 'WTI Oil'),
            redisBtc ? `BTC: $${redisBtc.price.toFixed(0)} (${redisBtc.changePct >= 0 ? '+' : ''}${redisBtc.changePct.toFixed(2)}%)` : null,
            redisFng ? `Fear & Greed: ${redisFng.value || redisFng.score || 'N/A'}` : null,
            redisUsdkrw ? `USD/KRW: ${redisUsdkrw.price.toFixed(2)} (${redisUsdkrw.changePct >= 0 ? '+' : ''}${redisUsdkrw.changePct.toFixed(2)}%)` : null,
            redisUsdjpy ? `USD/JPY: ${redisUsdjpy.price.toFixed(2)} (${redisUsdjpy.changePct >= 0 ? '+' : ''}${redisUsdjpy.changePct.toFixed(2)}%)` : null,
        ].filter(Boolean).join(' | ');

        const upcomingEvents = CLOSING.calendarEvidence(fmpCalendar, now);
        if (!process.env.AWS_ACCESS_KEY_ID) {
            return NextResponse.json({ error: 'AWS credentials not configured' }, { status: 500 });
        }

        const readings = { btc: redisBtc, fearGreed: redisFng, vix: redisVix, vix3m: redisVix3m, us10y: redisTnx, dollar: redisDxy,
            usdkrw: redisUsdkrw, usdjpy: redisUsdjpy, gold: redisGold, oil: redisOil, tlt: redisTlt,
            futures: { es: redisSpx, nq: redisNq, rty: redisRut } };
        const reportEvidence = { sessionDate: todayDate, readings, regularClose: cashCloses, news: [...marketNews, ...sectorSummaries.flatMap(s => s.news)], events: upcomingEvents };
        const prompt = CLOSING.buildClosingPrompt({ sessionDate: todayDate, macroStr, levelsSection: levelsPromptSection(levelsBlock.block),
            evidence: reportEvidence, sectorSummaries, keyLevelsSchema: KEYLEVELS_SCHEMA_EXAMPLE, keyLevelsRequirement: KEYLEVELS_REQUIREMENT });

        console.log(`[CrossSectorBrief V3] Calling Bedrock Claude with ${sectorSummaries.length} sectors + 13 macro indicators...`);

        const systemPrompt = 'You are SIGNUM Intelligence, an elite institutional-grade financial analyst. Return ONLY valid JSON. No markdown fences. COMPLIANCE: OBSERVER only — use observational language (observed, noted, indicates). NEVER use predictive/advisory language (will, should, recommended). No investment advice. '
            // ★2026-10-10 Haiku 5.5 가 일본어 칸에 한글/영어를 섞는 일이 있었다(10건 중 1~2건, 규칙을 넣으면 9/10). 현행 모델에도 해가 없는 문장.
            + 'LANGUAGE RULES: write Korean fields in Hangul only and never insert Japanese kana or Chinese characters; write Japanese fields in Japanese only. Keep company names, tickers and other English proper nouns in their original Latin spelling in every language field; never transliterate them by sound into Hangul or katakana.';
        const aiStarted = Date.now();
        const bedrockResult = await callBedrock({
            system: systemPrompt,
            userPrompt: prompt,
            maxTokens: 12000,
            temperature: 0.4,
            timeoutMs: 240_000,
            label: 'CrossSectorBrief',
            expectJson: true,   // ★2026-10-10 사다리 출구 가드: 필수 3개 섹션이 있어야 ①② 응답을 쓴다
            locale: 'multi',
            // ★2026-10-10 필수 3개 섹션 + 3개 언어 칸의 언어 혼입·거절·금액 자릿수(구조화 모드) — 구조만 보던 가드로는 5.5 의 한·일 칸 혼입을 못 거른다
            // ★2026-10-24 서사 세부 검사(길이·언어 간 숫자·뉴스 시각 등)는 여기서 거르지 않고 아래 «고침 요청»으로 넘긴다 —
            //   같은 프롬프트 재생성(피드백 없음)은 운영 측정에서 2회 모두 같은 사유로 탈락하고 현행 4.5(95~118초·서빙 불가)로 떨어졌다.
            validate: (raw) => {
                // 번역 안 된 보조 뉴스 항목은 출구에서 빼므로(아래 alignSummary) 가드도 뺀 모양으로 본다
                let text = raw;
                try { text = JSON.stringify(CLOSING.dropUntranslatedNews(JSON.parse(raw))); } catch { /* JSON 오류는 아래 가드가 판정 */ }
                const base = multiLangJsonGate('CrossSector', prompt, { keys: ['marketOverview', 'sectorRotation', 'outlook', 'closingNarrative'], structured: true })(text);
                logScriptCulprits(base, text);
                if (base !== true) return base;
                try { return narrativeShapeOk(JSON.parse(text)?.closingNarrative) ? true : { ok: false, reasons: ['narrative:shape'] }; } catch { return false; }
            },
        });

        let structured: CrossSectorBriefV3;
        try {
            // ★2026-10-10 금융 공통어 음차(«콜월·맥스페인») 출구 복원 — 모델과 무관하게 영어 이름으로(lib/ai/commonTerms)
            structured = CLOSING.alignSummary(restoreCommonTermsDeep(JSON.parse(bedrockResult.text)), reportEvidence) as CrossSectorBriefV3;
        } catch (parseErr) {
            console.error('[CrossSectorBrief V3] JSON parse failed:', parseErr, 'Raw:', bedrockResult.text.substring(0, 500));
            return NextResponse.json({ error: 'Bedrock returned invalid JSON' }, { status: 500 });
        }

        // 서사 고침 요청(최대 2회) — 탈락한 검사 이름을 그대로 보여 주고 closingNarrative 만 다시 받는다. 나아진 경우에만 바꾼다.
        const providers = [String(bedrockResult.provider || 'legacy')];
        const firstNarrativeReasons = closingReportProblems({ structured, reportEvidence, date: todayDate });
        let narrativeReasons = firstNarrativeReasons;
        let repairs = 0;
        // 고침은 최대 4회 — 한 번에 6~10초라 모델 예산(240초) 안이고, 남은 시간이 30초 미만이면 멈춘다(10/24 18차 실측: 2회로는 일본어 見通し·일정 시각 고침이 모자랐다)
        for (let round = 0; round < 4 && narrativeReasons.length; round++) {
            const left = 240_000 - (Date.now() - aiStarted);
            if (left < 30_000) break;
            const repairPrompt = CLOSING.narrativeRepairPrompt({ sessionDate: todayDate, evidence: reportEvidence, macroStr, narrative: structured.closingNarrative, reasons: narrativeReasons });
            try {
                const fix = await callBedrock({
                    system: systemPrompt, userPrompt: repairPrompt, maxTokens: 8000, temperature: 0.2, timeoutMs: Math.min(100_000, left),
                    label: 'CrossSectorBrief', expectJson: true, locale: 'multi',
                    validate: (text) => {
                        const base = multiLangJsonGate('CrossSector', `${prompt}\n${repairPrompt}`, { keys: ['closingNarrative'], structured: true })(text);
                        if (base !== true) return base;
                        try { return narrativeShapeOk(JSON.parse(text)?.closingNarrative) ? true : { ok: false, reasons: ['narrative:shape'] }; } catch { return false; }
                    },
                });
                repairs++;
                const candidate = CLOSING.alignSummary({ ...structured, marketOverview: { ...structured.marketOverview },
                    closingNarrative: restoreCommonTermsDeep(JSON.parse(fix.text).closingNarrative) }, reportEvidence) as CrossSectorBriefV3;
                const reasons = closingReportProblems({ structured: candidate, reportEvidence, date: todayDate });
                if (reasons.length < narrativeReasons.length) { structured = candidate; narrativeReasons = reasons; providers.push(String(fix.provider || 'legacy')); }
            } catch (e: any) {
                console.warn('[CrossSectorBrief V4] 서사 고침 요청 실패:', e?.message);
                break;
            }
        }
        if (narrativeReasons.length) console.warn(`[CrossSectorBrief V4] 서사 검사 남음(${repairs}회 고침 뒤): ${narrativeReasons.join(', ')}`);
        // 서빙 가드의 제공자 — 한 조각이라도 현행(legacy)이 쓰면 legacy(서빙 대상 아님)
        const servedProvider = providers.includes('legacy') ? 'legacy' : providers[0];
        const aiMs = Date.now() - aiStarted;

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
            redisRut ? { key: 'Russell 2K', value: redisRut.price, changePct: redisRut.changePct, category: 'equity' } : null,
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
        const today = todayDate; // Keep the input session date even if generation crosses midnight.
        const briefData: Record<string, any> = {
            structured,
            reportEvidence,
            sectorInputs: sectorSummaries,
            reportSource: prompt,
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
            provider: servedProvider,
            model: String(bedrockResult.model || ''),
        });
        if (!briefData.guard.ok) console.warn(`[CrossSectorBrief V4] 서빙 가드 탈락(저장은 함, GET 은 v3 로): ${briefData.guard.reasons.join(', ')}`);

        if (!dryRun) await setInCache(getCacheKey(today), briefData, 259200); // 72h TTL — covers weekends (Fri→Mon)
        const elapsed = Date.now() - startTime;

        console.log(`[CrossSectorBrief V3] ✅ Generated Bloomberg-grade brief in ${elapsed}ms (${macroIndicators.length} macro indicators)`);

        return NextResponse.json({
            success: true,
            dryRun,
            ...briefData,
            elapsedMs: elapsed,
            ...(dryRun ? { ai: { provider: servedProvider, providers, model: bedrockResult.model, elapsedMs: aiMs, truncated: !!bedrockResult.truncated, repairs, firstNarrativeReasons, narrativeReasons }, replayClock: now.toISOString() } : {}),
        });

    } catch (e: any) {
        console.error('[CrossSectorBrief V3] POST error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
