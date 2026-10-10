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
import { financeTermsRule } from '@/lib/ai/commonTerms';
import { runLadder } from '@/lib/ai/llmLadder';
import { dateAnchor } from '@/services/bedrockClient';
import { reserveBedrockSlot, BEDROCK_CLIENT_RETRY } from '@/services/bedrockRateLimit';
import { fetchMassive } from '@/services/massiveClient';
import { getFromCache, setInCache } from '@/services/redisClient';
import { getYahooDataSSOT } from '@/services/yahooFinanceHub';
import { fetchBatch8K, buildSECTextBlock } from '@/services/secFilingsService';
import { getOvernightHighlights } from '@/services/disclosures';
import { GuardianDataHub } from '@/services/guardian/unifiedDataStream';
import { yieldChangeBp, fmtBp } from '@/lib/yieldChange';
import { stripForecastSentences } from '@/lib/ai/trustLayer';
import { calendarPromptLines } from '@/lib/fmpCalendarTime';

export const maxDuration = 60;

/** 모닝 브리핑 한 건이 «쓸 수 있는 글인가» — 아래 본문의 검증과 같은 규칙(사다리의 출구 가드로도 쓴다) */
function briefingTextInvalid(text: string): boolean {
    if (!text || text.length < 50) return true;
    const lower = text.toLowerCase();
    return lower.includes('temporarily unavailable') ||
           lower.includes('cannot generate') ||
           lower.includes('할 수 없습니다') ||
           lower.includes('불가능');
}
function briefingGate(text: string): boolean {
    try {
        const b = JSON.parse(text);
        return !(briefingTextInvalid(b?.ko) || briefingTextInvalid(b?.en) || briefingTextInvalid(b?.ja) ||
                 hasWrongLocaleText('en', b.en) || hasWrongLocaleText('ja', b.ja));
    } catch { return false; }
}

// [2026-09-09] us. 한도 통 소진 → 같은 모델의 global. 통으로. (bedrockClient 주석 참조)
const BEDROCK_MODEL = 'global.anthropic.claude-haiku-4-5-20251001-v1:0';

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

    // ★ [2026-09-10] 「어떤 날은 되고 어떤 날은 안 된다」의 원인이 여기 있었다.
    //   AI 생성이 실패하면 숫자 나열 템플릿으로 떨어지는데(source: template-error),
    //   그것을 **진짜 AI 와 똑같은 24시간 TTL** 로 저장했다.
    //   → 아침에 한 번 실패하면 그 키가 하루 종일 자리를 잡고 앉아
    //     이후 어떤 시도도 «이미 있으니 됐다»가 되어 하루가 통째로 템플릿이 됐다.
    //   실측(2026-09-09): 세 로케일 모두 source=template-error 로 11.7시간째.
    //
    //   고치는 방법으로 «폴백 TTL 을 짧게» 를 먼저 검토했는데, 그러면 만료된 순간
    //   화면이 빈다(그리고 그 순간 들어온 «사용자» 요청이 재생성을 떠안아 55초를 기다린다).
    //   → TTL 은 24시간 그대로 두어 화면이 절대 비지 않게 하고, 대신 «폴백이라는 사실»을
    //     플래그로 남겨 **크론·EC2 워커가** 그걸 보고 덮어쓰게 한다.
    //     사용자 경로는 언제나 즉시 응답한다.
    const isFallback = meta.source !== 'claude';
    const ttl = 24 * 60 * 60;

    for (const loc of locales) {
        await setInCache(`guardian:morning_briefing:${loc}`, {
            date: meta.date,
            generatedAt,
            briefing: briefing[loc],
            source: meta.source,
            // 읽는 쪽이 «진짜인지»를 판단할 수 있어야 한다. source 만 보면 문자열 비교가
            // 흩어지므로 플래그로 못 박는다.
            degraded: isFallback,
            newsCount: meta.newsCount || 0,
            calendarCount: meta.calendarCount || 0,
        }, ttl);
    }

    await setInCache('guardian:morning_briefing', {
        date: meta.date,
        generatedAt,
        text: briefing.ko || briefing.en,
        briefing: briefing.ko || briefing.en,
        source: meta.source,
        degraded: isFallback,
    }, ttl);
}

/** 폴백은 45분만 산다 — 다음 시도(크론·워밍)가 진짜 AI 로 덮을 수 있어야 한다 */
const FALLBACK_TTL_SEC = 24 * 60 * 60;

let _bedrockClient: BedrockRuntimeClient | null = null;
function getBedrock(): BedrockRuntimeClient {
    if (_bedrockClient) return _bedrockClient;
    _bedrockClient = new BedrockRuntimeClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
        ...BEDROCK_CLIENT_RETRY,
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
                // ★2026-10-07 FMP 캘린더의 date·time 은 UTC — «ET» 라고 붙이려면 먼저 바꿔야 한다(운영 브리핑 «FOMC Minutes 18:00 ET»(실제 14:00 ET)). lib/fmpCalendarTime
                calendarEvents = calendarPromptLines(calRaw.events, todayET, 5);
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
                // 금리는 «4.72% (+5bp)» — «4.72 (+1.08%)»(수익률의 상대 %)를 모델이 «+1.08%p»로 옮겨 쓴다.
                // 이 브리핑은 guardian:morning_briefing 으로 소셜 게시물까지 간다
                mkt.tnx && mkt.tnx.source !== 'DEFAULT'
                    ? `US 10Y Yield: ${mkt.tnx.price?.toFixed(2)}% (${fmtBp(yieldChangeBp({ level: mkt.tnx.price, chgAbs: mkt.tnx.change, chgPct: mkt.tnx.changePct }))})`
                    : null,
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
- NO FORECASTS: describe what the data shows now and the key variables to observe. Never write what WILL happen: no future tense, no "expected to", "likely to", "will", 〜할 것이다, 예상된다, 임박, 〜見込み, 予想される. (Reporting a named source's forecast is fine: "Goldman Sachs said …".)
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
- End with the key variable to observe for the trading day ahead, stated as a present-tense fact (e.g. "the CPI print at 12:30 ET is the key variable") — not as a prediction.
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
KO example: "수요일 개장 전 거래에서 S&P 500 선물이 5,650(+0.45%), NASDAQ 100 선물이 19,840(+0.72%)으로 상승 출발함. Fed 파월 의장의 '추가 금리 인하 검토 중' 발언이 전해지며 기술주 중심 매수세가 유입된 것으로 관찰됨. 한편 Nvidia가 차세대 AI칩 GB300 발표를 예고하며 반도체 섹터가 +1.2% 상승, 에너지 섹터는 원유 재고 증가 보도에 -0.8% 하락함. RLSI 62 수준에서 시장 건전성은 보통으로 관찰되며, VIX 18.5와 롱 감마(GEX +45) 환경에서 안정적 변동성이 나타남. 오늘 12:30 ET CPI 발표가 최대 변수이며, 발표값과 시장 예상치의 차이가 금리 경로 판단의 기준임."
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

        // ★2026-10-10 제공자 사다리 — 허용 목록에 오른 용도만 ①Anthropic 크레딧·②Bedrock 5.5 를 먼저 시도한다.
        //   아니면(또는 둘 다 실패·가드 불통과면) 아래 legacy = 예전 코드 그대로(Bedrock Haiku 4.5, 같은 시간 제한·같은 오류 모양).
        const ladder = await runLadder(
            {
                purpose: 'MorningBriefing',
                system: dateAnchor() + financeTermsRule() + systemPrompt,
                userPrompt,
                maxTokens: 4096,
                jsonPrefill: true,
                temperature: 0.3,
                locale: 'multi',
                timeoutMs: 55000,
                validate: briefingGate,
            },
            async (ctx) => {
                const client = getBedrock();
                const command = new InvokeModelCommand({
                    modelId: BEDROCK_MODEL,
                    contentType: 'application/json',
                    accept: 'application/json',
                    body: JSON.stringify({
                        anthropic_version: 'bedrock-2023-05-31',
                        max_tokens: 4096,
                        temperature: 0.3,
                        // ★2026-10-08 금융 공통어(GEX·Max Pain·Call Wall·Gamma Flip …)는 한국어·일본어 브리핑에서도 번역하지 않는다(lib/ai/commonTerms)
                        system: financeTermsRule() + systemPrompt,
                        messages: [
                            { role: 'user', content: userPrompt },
                            // Note: Sonnet 4.6 does NOT support assistant prefill
                        ],
                    }),
                });

                await reserveBedrockSlot('guardian-briefing');
                const result = await Promise.race([
                    client.send(command),
                    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Claude timeout 60s')), ctx.elapsedMs > 0 ? Math.max(8000, 55000 - ctx.elapsedMs) : 55000))
                ]);

                const body = JSON.parse(new TextDecoder().decode(result.body));
                const u = body.usage || {};
                return {
                    text: (body.content?.[0]?.text || '').replace(/```json/g, '').replace(/```/g, '').trim(),
                    model: 'claude-haiku-4.5',
                    priceModel: 'haiku-4.5' as const,
                    usage: { input: Number(u.input_tokens) || 0, output: Number(u.output_tokens) || 0, cacheWrite: Number(u.cache_creation_input_tokens) || 0, cacheRead: Number(u.cache_read_input_tokens) || 0 },
                };
            },
        );

        let rawText = ladder.text;
        // Extract JSON object from response (may have preamble text)
        const jsonStart = rawText.indexOf('{');
        if (jsonStart > 0) rawText = rawText.slice(jsonStart);
        if (!rawText || !rawText.startsWith('{')) {
            return NextResponse.json({ error: 'Claude returned empty response' }, { status: 500 });
        }

        const briefing = JSON.parse(rawText);

        // [V8.1] AI Refusal / Hallucination Validation
        const isInvalid = briefingTextInvalid;

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

        // ★2026-10-07 앱 강화 T5 — 저장 전 예측어 문장 제거(남은 글이 쓸 만할 때만). 읽는 쪽(GET /api/guardian/briefing)도 같은 검사를 한다(워커가 만든 글도 덮는다).
        for (const loc of ['ko', 'en', 'ja'] as const) {
            const st = stripForecastSentences(String((briefing as any)[loc] ?? ''), loc);
            if (st.removed.length && st.usable && st.text) { console.warn(`[Briefing Gen] ${loc} 예측어 문장 ${st.removed.length}건 제거`); (briefing as any)[loc] = st.text; }
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
            // ★ success:true 는 유지한다 — 화면은 비면 안 되므로 «무언가»를 줘야 한다.
            //   그러나 **부르는 쪽이 실패를 알 수 있어야 한다.** 예전엔 이 응답이
            //   성공과 구분되지 않아 워커의 재시도 루프가 첫 시도에 «성공»으로 끝났다.
            return NextResponse.json({
                success: true,
                degraded: true,          // ← 부르는 쪽은 이걸 보고 다시 시도한다
                briefing: fallback,
                newsCount: fallbackNewsCount,
                calendarCount: fallbackCalendarCount,
                savedToRedis: true,
                source: 'template-error',
                ttlSec: FALLBACK_TTL_SEC,
                warning: e.message,
            });
        } catch (fallbackError: any) {
            return NextResponse.json({ error: e.message, fallbackError: fallbackError.message }, { status: 500 });
        }
    }
}
