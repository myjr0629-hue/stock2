/**
 * POST /api/guardian/briefing/generate
 * 
 * [V8.0] Bloomberg-Grade Morning Briefing Generator
 * Called by EC2 Worker at 08:00 ET — generates narrative-driven briefing via Claude Sonnet 4.
 * 
 * Input: Market data + news + calendar (from Worker)
 * Output: { ko: "...", en: "...", ja: "..." } narrative briefing
 * 
 * POLICY: Observation-only language. No investment advice.
 */

import { NextResponse } from 'next/server';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { fetchMassive } from '@/services/massiveClient';
import { getFromCache, setInCache } from '@/services/redisClient';
import { getYahooDataSSOT } from '@/services/yahooFinanceHub';
import { fetchBatch8K, buildSECTextBlock } from '@/services/secFilingsService';
import { getOvernightHighlights } from '@/services/disclosures';
import { GuardianDataHub } from '@/services/guardian/unifiedDataStream';

export const maxDuration = 60;

const BEDROCK_MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

const SECTOR_NAMES_EN: Record<string, string> = {
    XLK: 'Technology',
    XLC: 'Communication Services',
    XLY: 'Consumer Discretionary',
    XLE: 'Energy',
    XLF: 'Financials',
    XLV: 'Health Care',
    XLI: 'Industrials',
    XLB: 'Materials',
    XLP: 'Consumer Staples',
    XLRE: 'Real Estate',
    XLU: 'Utilities',
    AI_PWR: 'AI Power Grid',
    SMH: 'Semiconductors',
    HACK: 'Cybersecurity',
    ICLN: 'Clean Energy',
    SAFE_HAVEN: 'Safe Haven Assets',
};

function sectorNameForBriefing(sector: any): string {
    const id = String(sector?.id || sector?.sectorId || sector?.ticker || '').toUpperCase();
    if (id && SECTOR_NAMES_EN[id]) return SECTOR_NAMES_EN[id];

    const rawName = typeof sector?.name === 'string' ? sector.name.trim() : '';
    if (rawName && /^[\x20-\x7E]+$/.test(rawName)) return rawName;

    return id || 'Sector';
}

const HANGUL_RE = /[\u3131-\u318E\uAC00-\uD7A3]/;
const JAPANESE_KANA_RE = /[\u3040-\u30FF]/;

function hasWrongLocaleText(locale: 'ko' | 'en' | 'ja', text: string): boolean {
    if (locale === 'en') return HANGUL_RE.test(text) || JAPANESE_KANA_RE.test(text);
    if (locale === 'ja') return HANGUL_RE.test(text);
    return false;
}

type BriefingTexts = Record<'ko' | 'en' | 'ja', string>;

function buildTemplateBriefing(snapshot: any, dateStr: string): BriefingTexts {
    const rlsi = Number(snapshot?.rlsi?.score ?? NaN);
    const vix = Number(snapshot?.rlsi?.components?.vix ?? NaN);
    const gex = Number(snapshot?.gammaShield?.gexIndex ?? NaN);
    const breadth = Number(snapshot?.breadth?.breadthPct ?? NaN);
    const sectors = (snapshot?.sectors || [])
        .sort((a: any, b: any) => Math.abs(b.change || 0) - Math.abs(a.change || 0))
        .slice(0, 3)
        .map((s: any) => `${sectorNameForBriefing(s)}(${s.change >= 0 ? '+' : ''}${(s.change || 0).toFixed(1)}%)`)
        .join(', ');

    const rlsiEn = Number.isFinite(rlsi) ? `Market health (RLSI) is ${rlsi.toFixed(0)}.` : 'Market health data is limited.';
    const vixEn = Number.isFinite(vix) ? `VIX is ${vix.toFixed(1)}, defining the current volatility backdrop.` : 'Volatility data is limited.';
    const gexEn = Number.isFinite(gex) ? `Gamma positioning is ${gex >= 0 ? 'long gamma' : 'short gamma'} with GEX ${gex.toFixed(0)}.` : 'Gamma positioning is not available.';
    const breadthEn = Number.isFinite(breadth) ? `Market breadth is ${breadth.toFixed(0)}%, showing ${breadth >= 60 ? 'broad participation' : breadth >= 45 ? 'mixed participation' : 'weak participation'}.` : 'Breadth data is limited.';
    const sectorsEn = sectors ? `Notable sector moves: ${sectors}.` : 'No notable sector move is available.';

    return {
        ko: [
            `${dateStr} 프리마켓 브리핑입니다.`,
            Number.isFinite(rlsi) ? `시장 건강도(RLSI)는 ${rlsi.toFixed(0)}로 관찰됩니다.` : '시장 건강도 데이터는 제한적입니다.',
            Number.isFinite(vix) ? `VIX는 ${vix.toFixed(1)}로 현재 변동성 배경을 형성합니다.` : '변동성 데이터는 제한적입니다.',
            Number.isFinite(gex) ? `감마 환경은 ${gex >= 0 ? '롱 감마' : '숏 감마'}이며 GEX는 ${gex.toFixed(0)}입니다.` : '감마 데이터는 아직 제한적입니다.',
            Number.isFinite(breadth) ? `시장 참여도는 ${breadth.toFixed(0)}%로 ${breadth >= 60 ? '넓은 참여' : breadth >= 45 ? '혼조 참여' : '약한 참여'}가 관찰됩니다.` : '시장 참여도 데이터는 제한적입니다.',
            sectors ? `주요 섹터 움직임: ${sectors}.` : '뚜렷한 섹터 움직임은 아직 확인되지 않습니다.',
        ].join(' '),
        en: [`Pre-market conditions as of ${dateStr}.`, rlsiEn, vixEn, gexEn, breadthEn, sectorsEn].join(' '),
        ja: [
            `${dateStr}のプレマーケットブリーフィングです。`,
            Number.isFinite(rlsi) ? `市場健全性(RLSI)は${rlsi.toFixed(0)}として観測されています。` : '市場健全性データは限定的です。',
            Number.isFinite(vix) ? `VIXは${vix.toFixed(1)}で、現在のボラティリティ環境を示しています。` : 'ボラティリティデータは限定的です。',
            Number.isFinite(gex) ? `ガンマ環境は${gex >= 0 ? 'ロングガンマ' : 'ショートガンマ'}で、GEXは${gex.toFixed(0)}です。` : 'ガンマデータはまだ限定的です。',
            Number.isFinite(breadth) ? `市場参加度は${breadth.toFixed(0)}%で、${breadth >= 60 ? '広い参加' : breadth >= 45 ? 'まちまちな参加' : '弱い参加'}が観測されています。` : '市場参加度データは限定的です。',
            sectors ? `主なセクターの動き: ${sectors}.` : '明確なセクターの動きはまだ確認されていません。',
        ].join(' '),
    };
}

async function saveBriefingTexts(briefing: BriefingTexts, meta: {
    date: string;
    source: string;
    newsCount?: number;
    calendarCount?: number;
}) {
    const locales = ['ko', 'en', 'ja'] as const;
    const generatedAt = new Date().toISOString();

    for (const loc of locales) {
        await setInCache(`guardian:morning_briefing:${loc}`, {
            date: meta.date,
            generatedAt,
            briefing: briefing[loc],
            source: meta.source,
            newsCount: meta.newsCount || 0,
            calendarCount: meta.calendarCount || 0,
        }, 24 * 60 * 60);
    }

    await setInCache('guardian:morning_briefing', {
        date: meta.date,
        generatedAt,
        text: briefing.ko || briefing.en,
        briefing: briefing.ko || briefing.en,
        source: meta.source,
    }, 24 * 60 * 60);
}

let _bedrockClient: BedrockRuntimeClient | null = null;
function getBedrock(): BedrockRuntimeClient {
    if (_bedrockClient) return _bedrockClient;
    _bedrockClient = new BedrockRuntimeClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
    });
    return _bedrockClient;
}

export async function POST(req: Request) {
    const startTime = Date.now();
    let snapshotForFallback: any = null;
    let fallbackNewsCount = 0;
    let fallbackCalendarCount = 0;

    try {
        const body = await req.json();
        let { snapshot, rlsiHistory } = body;

        // [V8.1] Self-Healing Data Injection
        if (!snapshot) {
            console.log('[Briefing Gen] Snapshot missing or null, fetching via GuardianDataHub...');
            snapshot = await GuardianDataHub.getGuardianSnapshot(false);
        }
        snapshotForFallback = snapshot;

        // 1. Fetch Polygon broad market news (stock/sector)
        let marketNews: string[] = [];
        try {
            const newsData = await fetchMassive(
                '/v2/reference/news',
                { ticker: 'SPY,QQQ,DIA,TLT,GLD', limit: '10', order: 'desc', sort: 'published_utc' },
                true
            );
            marketNews = (newsData?.results || []).map((n: any) => {
                const title = n.title || '';
                const desc = n.description ? ` — ${n.description.slice(0, 200)}` : '';
                return title + desc;
            }).filter(Boolean).slice(0, 7);
        } catch (e) {
            console.warn('[Briefing Gen] Polygon news fetch failed:', e);
        }

        // 1.5 Fetch FMP General News (macro/geopolitical — not covered by Polygon)
        try {
            const fmpKey = process.env.FMP_API_KEY;
            if (fmpKey) {
                const fmpRes = await fetch(
                    `https://financialmodelingprep.com/stable/news/general-latest?limit=8&apikey=${fmpKey}`,
                    { signal: AbortSignal.timeout(6000) }
                );
                if (fmpRes.ok) {
                    const fmpData = await fmpRes.json();
                    if (Array.isArray(fmpData)) {
                        const fmpNews = fmpData
                            .map((n: any) => n.title || '')
                            .filter(Boolean)
                            .slice(0, 5);
                        // Append FMP news (geopolitical/macro) after Polygon news
                        marketNews = [...marketNews, ...fmpNews].slice(0, 10);
                        console.log(`[Briefing Gen] FMP General: +${fmpNews.length} headlines merged`);
                    }
                }
            }
        } catch (e) {
            console.warn('[Briefing Gen] FMP news fetch failed:', e);
        }
        fallbackNewsCount = marketNews.length;

        // 2. Get economic calendar from Redis
        let calendarEvents: string[] = [];
        try {
            const calRaw = await getFromCache<any>('fmp:econ-calendar');
            if (calRaw?.events) {
                const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
                calendarEvents = calRaw.events
                    .filter((e: any) => e.date === todayET && e.impact === 'HIGH')
                    .map((e: any) => `${e.time} ET: ${e.event} (Est: ${e.estimate || 'N/A'}, Prev: ${e.previous || 'N/A'})`)
                    .slice(0, 5);
            }
        } catch (e) {
            console.warn('[Briefing Gen] Calendar fetch failed:', e);
        }
        fallbackCalendarCount = calendarEvents.length;

        // 2.3. Fetch SEC 8-K filings for major tickers
        let sec8kSection = '';
        try {
            const majorTickers = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA'];
            const sec8kMap = await fetchBatch8K(majorTickers);
            const secLines: string[] = [];
            for (const ticker of majorTickers) {
                const filings = sec8kMap[ticker] || [];
                if (filings.length > 0) {
                    secLines.push(`${ticker}: ${buildSECTextBlock(filings)}`);
                }
            }
            if (secLines.length > 0) {
                sec8kSection = secLines.join('\n');
                console.log(`[Briefing Gen] SEC 8-K: ${secLines.length} tickers with filings`);
            }
        } catch (e) {
            console.warn('[Briefing Gen] SEC 8-K fetch failed:', e);
        }

        // [8-K DISCLOSURES] High-impact categorized events from the coverage
        // universe (last 3 days) → one "밤사이 주요 공시" sentence in the brief.
        // Empty on failure/no events → the sentence is simply omitted.
        let overnightDisclosures = '';
        try {
            const highlights = await getOvernightHighlights(3);
            if (highlights.length > 0) {
                overnightDisclosures = highlights
                    .map(h => `${h.ticker} [${h.primary}${h.tertiary ? '/' + h.tertiary : ''}] (${h.date}): ${h.text}`)
                    .join('\n');
                console.log(`[Briefing Gen] Overnight disclosures: ${highlights.length}`);
            }
        } catch (e) {
            console.warn('[Briefing Gen] Overnight disclosures fetch failed:', e);
        }

        // 2.5. Fetch ALL market data from Redis (cron-updated every minute)
        let marketDataStr = '';
        try {
            const mkt = await getYahooDataSSOT();
            const fmt = (q: any, label: string) => {
                if (!q || q.source === 'DEFAULT') return null;
                return `${label}: ${q.price?.toFixed(2)} (${q.changePct >= 0 ? '+' : ''}${q.changePct?.toFixed(2)}%)`;
            };
            const lines = [
                fmt(mkt.spx, 'S&P 500 Futures (ES)'),
                fmt(mkt.nq, 'NASDAQ 100 Futures (NQ)'),
                fmt(mkt.rut, 'Russell 2000 Futures (RTY)'),
                fmt(mkt.tnx, 'US 10Y Yield'),
                fmt(mkt.tlt, 'TLT (20Y+ Bond ETF)'),
                fmt(mkt.btc, 'Bitcoin (BTC)'),
                fmt(mkt.gold, 'Gold (GC)'),
                fmt(mkt.oil, 'WTI Oil (CL)'),
                mkt.vix && mkt.vix3m && mkt.vix.source !== 'DEFAULT' && mkt.vix3m.source !== 'DEFAULT'
                    ? `VIX Term Structure: VIX ${mkt.vix.price?.toFixed(2)} / VIX3M ${mkt.vix3m.price?.toFixed(2)} (Ratio: ${(mkt.vix.price / (mkt.vix3m.price || 1)).toFixed(3)}, ${mkt.vix.price > mkt.vix3m.price ? 'BACKWARDATION' : 'CONTANGO'})`
                    : null,
            ].filter(Boolean);
            marketDataStr = lines.join('\n');
            console.log(`[Briefing Gen] Market data: ${lines.length} indicators loaded`);
        } catch (e) {
            console.warn('[Briefing Gen] Market data fetch failed:', e);
        }

        // 3. Extract key metrics from snapshot
        const rlsi = snapshot?.rlsi?.score ?? 'N/A';
        const vix = snapshot?.rlsi?.components?.vix ?? 'N/A';
        const gex = snapshot?.gammaShield?.gexIndex ?? 'N/A';
        const squeeze = snapshot?.gammaShield?.squeezeRisk ?? 'N/A';
        const breadth = snapshot?.breadth?.breadthPct ?? 'N/A';
        const triggerHigh = snapshot?.gammaShield?.triggerHigh ?? 'N/A';
        const triggerLow = snapshot?.gammaShield?.triggerLow ?? 'N/A';
        const flipPoint = snapshot?.gammaShield?.flipPoint ?? 'N/A';
        const regime = snapshot?.tripleA?.regime ?? 'N/A';

        // Top moving sectors
        const sectors = (snapshot?.sectors || [])
            .sort((a: any, b: any) => Math.abs(b.change || 0) - Math.abs(a.change || 0))
            .slice(0, 5)
            .map((s: any) => `${sectorNameForBriefing(s)} ${s.change >= 0 ? '+' : ''}${s.change?.toFixed(1)}%`)
            .join(', ');

        // RLSI trend
        const historyStr = (rlsiHistory || []).slice(-5)
            .map((h: any) => h.score).join(' → ');

        // 4. Build Claude Prompt — NARRATIVE-DRIVEN
        if (!process.env.AWS_ACCESS_KEY_ID) {
            return NextResponse.json({ error: 'AWS credentials not configured' }, { status: 500 });
        }

        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' });
        const dayOfWeekKo = new Date().toLocaleDateString('ko-KR', { weekday: 'long', timeZone: 'America/New_York' });
        const dayOfWeekJa = new Date().toLocaleDateString('ja-JP', { weekday: 'long', timeZone: 'America/New_York' });

        const systemPrompt = `You are a Bloomberg Terminal Pre-Market Analyst writing the MORNING BRIEFING.
Your briefing must read like a NARRATIVE STORY that weaves together overnight news, market data, and risk indicators.

<critical_rules>
- TODAY IS: ${todayStr} — ${dayOfWeek} / ${dayOfWeekKo} / ${dayOfWeekJa}
- In Korean: use "${dayOfWeekKo}" (e.g., "${dayOfWeekKo} 개장 전 거래에서...")
- In English: use "${dayOfWeek}" (e.g., "${dayOfWeek} pre-market trading...")
- In Japanese: use "${dayOfWeekJa}" (e.g., "${dayOfWeekJa}のプレマーケットで...")
- FORBIDDEN: Do NOT use any other day of the week. Using a wrong day is a CRITICAL ERROR.
- Write exactly 6-8 sentences per language. CONCISE but COMPLETE.
- NEVER give investment advice. ONLY observational language: "관찰됨", "나타남", "observed", "noted".
- Each language must be NATIVE quality — not a translation, but written as if by a native analyst.
- The market data uses English canonical sector names. Keep them in English for the English briefing; translate them naturally only in Korean/Japanese.
- STRICT LOCALE SEPARATION: English output must contain no Korean or Japanese text. Korean output must be Korean. Japanese output must be Japanese.
- Do NOT use any emoji or special Unicode symbols. Plain text only.
- JSON SAFETY: DO NOT use double quotes (") anywhere inside your sentences. If you must quote a title, word, or headline, use single quotes (') instead. Unescaped double quotes will CRASH the system.
- FORMATTING: Do NOT use line breaks (\\n) inside your translated strings. Keep each language's briefing as a single continuous paragraph.
</critical_rules>

<structure>
Your briefing MUST follow this 3-part narrative flow:

PART 1 (2 sentences): Market Overview
- Start with day of week + S&P 500 and NASDAQ 100 actual prices and % changes.
- Include key commodities/bonds/crypto if they show significant moves.

PART 2 (2-3 sentences): News & Catalysts
- MANDATORY: Pick the 2-3 most impactful headlines from <overnight_news> and weave them naturally into the narrative.
- If <overnight_disclosures> is present, add EXACTLY ONE additional sentence summarizing those SEC 8-K material events (company + what happened). If absent, do not mention disclosures at all.
- If there are economic calendar events, mention them as upcoming catalysts.
- Connect the news to WHY the market is moving the way it is.

PART 3 (2-3 sentences): Risk Assessment
- Reference RLSI, VIX, GEX, Breadth to assess the current risk environment.
- End with the key thing to watch for the trading day ahead.
</structure>`;

        const userPrompt = `<market_snapshot>
- RLSI: ${rlsi} | Recent Trend: ${historyStr || 'N/A'}
- VIX: ${vix} | GEX: ${gex} | Squeeze Risk: ${squeeze}%
- Breadth: ${breadth}% | Regime: ${regime}
- Gamma: Resistance ${triggerHigh}, Support ${triggerLow}, Flip ${flipPoint}
- Top Sectors: ${sectors || 'N/A'}
</market_snapshot>

<live_prices>
${marketDataStr || 'Market data unavailable'}
</live_prices>

<economic_calendar>
${calendarEvents.length > 0 ? calendarEvents.join('\n') : 'No HIGH impact events today'}
</economic_calendar>

<overnight_news>
${marketNews.length > 0 ? marketNews.map((n, i) => `${i + 1}. ${n}`).join('\n') : 'No major headlines'}
</overnight_news>
${sec8kSection ? `
<recent_sec_filings note="Major company 8-K filings from recent days">
${sec8kSection}
</recent_sec_filings>` : ''}${overnightDisclosures ? `
<overnight_disclosures note="High-impact categorized 8-K events (leadership changes, M&A, distress) from covered large caps — summarize in ONE sentence in PART 2">
${overnightDisclosures}
</overnight_disclosures>` : ''}

<style_examples>
KO example: "수요일 개장 전 거래에서 S&P 500 선물이 5,650(+0.45%), NASDAQ 100 선물이 19,840(+0.72%)으로 상승 출발함. Fed 파월 의장의 '추가 금리 인하 검토 중' 발언이 전해지며 기술주 중심 매수세가 유입된 것으로 관찰됨. 한편 Nvidia가 차세대 AI칩 GB300 발표를 예고하며 반도체 섹터가 +1.2% 상승, 에너지 섹터는 원유 재고 증가 보도에 -0.8% 하락함. RLSI 62 수준에서 시장 건전성은 보통으로 관찰되며, VIX 18.5와 롱 감마(GEX +45) 환경에서 안정적 변동성이 나타남. 오늘 12:30 ET CPI 발표가 최대 변수로, 예상치 상회 시 변동성 확대 가능성이 관찰됨."
</style_examples>

Output ONLY valid JSON (no markdown fences):
{"ko": "한국어 브리핑 (6-8문장)", "en": "English briefing (6-8 sentences)", "ja": "日本語ブリーフィング (6-8文)"}`;

        // [V8.2] Fast path for EC2 Worker (return prompt only, skip Bedrock)
        if (body.returnPromptOnly) {
            return NextResponse.json({
                success: true,
                prompts: { systemPrompt, userPrompt },
                newsCount: marketNews.length,
                calendarCount: calendarEvents.length
            });
        }

        const client = getBedrock();
        const command = new InvokeModelCommand({
            modelId: BEDROCK_MODEL,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
                anthropic_version: 'bedrock-2023-05-31',
                max_tokens: 4096,
                temperature: 0.3,
                system: systemPrompt,
                messages: [
                    { role: 'user', content: userPrompt },
                    // Note: Sonnet 4.6 does NOT support assistant prefill
                ],
            }),
        });

        const result = await Promise.race([
            client.send(command),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Claude timeout 60s')), 55000))
        ]);

        const responseBody = JSON.parse(new TextDecoder().decode(result.body));
        let rawText = (responseBody.content?.[0]?.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
        // Extract JSON object from response (may have preamble text)
        const jsonStart = rawText.indexOf('{');
        if (jsonStart > 0) rawText = rawText.slice(jsonStart);
        if (!rawText || !rawText.startsWith('{')) {
            return NextResponse.json({ error: 'Claude returned empty response' }, { status: 500 });
        }

        const briefing = JSON.parse(rawText);

        // [V8.1] AI Refusal / Hallucination Validation
        const isInvalid = (text: string) => {
            if (!text || text.length < 50) return true;
            const lower = text.toLowerCase();
            return lower.includes('temporarily unavailable') || 
                   lower.includes('cannot generate') || 
                   lower.includes('할 수 없습니다') ||
                   lower.includes('불가능');
        };

        if (
            isInvalid(briefing.ko) ||
            isInvalid(briefing.en) ||
            isInvalid(briefing.ja) ||
            hasWrongLocaleText('en', briefing.en) ||
            hasWrongLocaleText('ja', briefing.ja)
        ) {
            console.error('[Briefing Gen] AI generated invalid/mixed-locale text. Saving clean template fallback.');
            const etDateStr = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
            const fallback = buildTemplateBriefing(snapshot, etDateStr);
            await saveBriefingTexts(fallback, {
                date: etDateStr,
                source: 'template-validation',
                newsCount: marketNews.length,
                calendarCount: calendarEvents.length,
            });
            return NextResponse.json({
                success: true,
                briefing: fallback,
                newsCount: marketNews.length,
                calendarCount: calendarEvents.length,
                savedToRedis: true,
                source: 'template-validation',
            });
        }

        const elapsed = Date.now() - startTime;
        const etDateStr = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });

        console.log(`[Briefing Gen] ✅ Narrative briefing generated in ${elapsed}ms`);

        // [AUTO-SAVE] Store directly in Redis — no Worker dependency
        await saveBriefingTexts(briefing as BriefingTexts, {
            date: etDateStr,
            source: 'claude',
            newsCount: marketNews.length,
            calendarCount: calendarEvents.length,
        });

        console.log(`[Briefing Gen] ✅ Saved to Redis (3 locales + legacy)`);

        return NextResponse.json({
            success: true,
            briefing,  // { ko: "...", en: "...", ja: "..." }
            newsCount: marketNews.length,
            calendarCount: calendarEvents.length,
            elapsedMs: elapsed,
            savedToRedis: true,
        });

    } catch (e: any) {
        console.error('[Briefing Gen] Error:', e.message);
        try {
            const etDateStr = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
            const fallback = buildTemplateBriefing(snapshotForFallback, etDateStr);
            await saveBriefingTexts(fallback, {
                date: etDateStr,
                source: 'template-error',
                newsCount: fallbackNewsCount,
                calendarCount: fallbackCalendarCount,
            });
            return NextResponse.json({
                success: true,
                briefing: fallback,
                newsCount: fallbackNewsCount,
                calendarCount: fallbackCalendarCount,
                savedToRedis: true,
                source: 'template-error',
                warning: e.message,
            });
        } catch (fallbackError: any) {
            return NextResponse.json({ error: e.message, fallbackError: fallbackError.message }, { status: 500 });
        }
    }
}
