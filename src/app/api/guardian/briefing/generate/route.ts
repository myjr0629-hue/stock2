/**
 * POST /api/guardian/briefing/generate
 * 
 * [V8.0] Bloomberg-Grade Morning Briefing Generator
 * Called by EC2 Worker at 08:00 ET (and by the GET self-heal / signum-warm repair) — generates the narrative briefing through the
 * provider ladder (credit Haiku 5.5 → Bedrock Haiku 4.5) and SAVES it to Redis itself (3 locales + legacy key).
 * ★2026-10-14 the EC2 worker no longer runs Bedrock locally (Node 16 has no TransformStream) — it POSTs here and verifies the result.
 * 
 * Input: Market data + news + calendar (from Worker)
 * Output: { ko: "...", en: "...", ja: "..." } narrative briefing
 * 
 * POLICY: Observation-only language. No investment advice.
 */

import { NextResponse } from 'next/server';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { financeTermsRule, restoreCommonTermNames } from '@/lib/ai/commonTerms';
import { runLadder, depthSuffixFor } from '@/lib/ai/llmLadder';
import { dateAnchor } from '@/services/bedrockClient';
import { reserveBedrockSlot, BEDROCK_CLIENT_RETRY } from '@/services/bedrockRateLimit';
import { getFromCache, setInCache } from '@/services/redisClient';
import { fetchBatch8K, buildSECTextBlock } from '@/services/secFilingsService';
import { GuardianDataHub } from '@/services/guardian/unifiedDataStream';
import { yieldChangeBp, fmtBp } from '@/lib/yieldChange';
import { stripForecastSentences } from '@/lib/ai/trustLayer';
import { calendarPromptLines } from '@/lib/fmpCalendarTime';
import { adminAuthorized } from '@/lib/ai/adminAuth';
import { withFreshTier } from '@/lib/ai/freshTier';
import { checkMorningV2, morningV2System, buildMorningV2User, composeMorningText, MORNING_V2_VERSION, type MorningFacts } from '@/lib/ai/morningBriefingV2';
import { collectMorningRaw, morningFactsFromRaw, type MorningRaw, type MorningSim } from '@/services/morningBriefingInputs';

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
    /** ★2026-10-25 v2 사실 계약 판(TRACKER T7) — 읽는 쪽은 모르는 칸을 무시한다(분석·되돌림 판정용) */
    contract?: number;
    session?: string;
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
        const payload = {
            date: meta.date,
            generatedAt,
            briefing: briefing[loc],
            source: meta.source,
            // 읽는 쪽이 «진짜인지»를 판단할 수 있어야 한다. source 만 보면 문자열 비교가
            // 흩어지므로 플래그로 못 박는다.
            degraded: isFallback,
            newsCount: meta.newsCount || 0,
            calendarCount: meta.calendarCount || 0,
            ...(meta.contract ? { contract: meta.contract, session: meta.session } : {}),
        };
        await setInCache(`guardian:morning_briefing:${loc}`, payload, ttl);
        if (!isFallback) await setInCache(`guardian:morning_briefing:lastgood:${loc}`, payload, 7 * 24 * 3600);
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

// ─────────────────────────────────────────────────────────────────────────────
// v1(옛) 프롬프트 — 드라이런 비교(?dryCompare)와 되돌림 스위치(MORNING_BRIEFING_PROMPT=v1)에서만 쓴다. 글자 그대로 보존.
// ─────────────────────────────────────────────────────────────────────────────

async function legacySec8kSection(): Promise<string> {
    try {
        const majorTickers = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA'];
        const sec8kMap = await fetchBatch8K(majorTickers);
        const secLines: string[] = [];
        for (const ticker of majorTickers) {
            const filings = sec8kMap[ticker] || [];
            if (filings.length > 0) secLines.push(`${ticker}: ${buildSECTextBlock(filings)}`);
        }
        return secLines.join('\n');
    } catch (e) {
        console.warn('[Briefing Gen] SEC 8-K fetch failed:', e);
        return '';
    }
}

function legacyPrompts(raw: MorningRaw, sec8kSection: string, nowMs: number): { systemPrompt: string; userPrompt: string; newsCount: number; calendarCount: number } {
    const snapshot = raw.snapshot;
    let marketNews: string[] = raw.polygonNews.map((n: any) => {
        const title = n.title || '';
        const desc = n.description ? ` — ${n.description.slice(0, 200)}` : '';
        return title + desc;
    }).filter(Boolean).slice(0, 7);
    marketNews = [...marketNews, ...raw.fmpNews.map((n: any) => n.title || '').filter(Boolean).slice(0, 5)].slice(0, 10);
    const todayET = new Date(nowMs).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const calendarEvents = calendarPromptLines(raw.calendar, todayET, 5);
    const overnightDisclosures = raw.disclosures.map(h => `${h.ticker} [${h.primary}${h.tertiary ? '/' + h.tertiary : ''}] (${h.date}): ${h.text}`).join('\n');
    let marketDataStr = '';
    const mkt = raw.yahoo;
    if (mkt) {
        const fmt = (q: any, label: string) => {
            if (!q || q.source === 'DEFAULT') return null;
            return `${label}: ${q.price?.toFixed(2)} (${q.changePct >= 0 ? '+' : ''}${q.changePct?.toFixed(2)}%)`;
        };
        marketDataStr = [
            fmt(mkt.spx, 'S&P 500 Futures (ES)'),
            fmt(mkt.nq, 'NASDAQ 100 Futures (NQ)'),
            fmt(mkt.rut, 'Russell 2000 Futures (RTY)'),
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
        ].filter(Boolean).join('\n');
    }
    const rlsi = snapshot?.rlsi?.score ?? 'N/A';
    const vix = snapshot?.rlsi?.components?.vix ?? 'N/A';
    const gex = snapshot?.gammaShield?.gexIndex ?? 'N/A';
    const squeeze = snapshot?.gammaShield?.squeezeRisk ?? 'N/A';
    const breadth = snapshot?.breadth?.breadthPct ?? 'N/A';
    const triggerHigh = snapshot?.gammaShield?.triggerHigh ?? 'N/A';
    const triggerLow = snapshot?.gammaShield?.triggerLow ?? 'N/A';
    const flipPoint = snapshot?.gammaShield?.flipPoint ?? 'N/A';
    const regime = snapshot?.tripleA?.regime ?? 'N/A';
    const sectors = [...(snapshot?.sectors || [])]
        .sort((a: any, b: any) => Math.abs(b.change || 0) - Math.abs(a.change || 0))
        .slice(0, 5)
        .map((s: any) => `${sectorNameForBriefing(s)} ${s.change >= 0 ? '+' : ''}${s.change?.toFixed(1)}%`)
        .join(', ');
    const historyStr = (raw.rlsiHistory || []).slice(-5).map((h: any) => h.score).join(' → ');
    const now = new Date(nowMs);
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' });
    const dayOfWeekKo = now.toLocaleDateString('ko-KR', { weekday: 'long', timeZone: 'America/New_York' });
    const dayOfWeekJa = now.toLocaleDateString('ja-JP', { weekday: 'long', timeZone: 'America/New_York' });

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
    return { systemPrompt, userPrompt, newsCount: marketNews.length, calendarCount: calendarEvents.length };
}

/** 모델 원문 → JSON 정리(앞말 제거) + 금융 공통어 음차 복원(+ v2 는 코드가 쓴 첫 문장 STATE 를 앞에). 실패면 null */
function prepareBriefingJson(text: string, facts?: MorningFacts | null): { json: string; briefing: BriefingTexts } | null {
    let raw = String(text || '').replace(/```json/g, '').replace(/```/g, '').trim();
    const start = raw.indexOf('{');
    if (start < 0) return null;
    if (start > 0) raw = raw.slice(start);
    try {
        const b = JSON.parse(raw);
        const out = {} as BriefingTexts;
        for (const k of ['ko', 'en', 'ja'] as const) {
            const t = typeof b?.[k] === 'string' ? restoreCommonTermNames(b[k]).text : '';
            out[k] = facts && t ? composeMorningText(t, facts, k) : t;
        }
        return { json: JSON.stringify(out), briefing: out };
    } catch { return null; }
}

/** v2 출구 가드(사다리 validate · 최종 검사 공용) — 음차 복원 «뒤» 글로 판정한다(저장되는 글과 같은 글) */
function v2Gate(facts: MorningFacts) {
    return (text: string) => {
        const p = prepareBriefingJson(text, facts);
        if (!p) return { ok: false, reasons: ['mb:json'] };
        const c = checkMorningV2(p.json, facts);
        return { ok: c.ok, reasons: c.reasons };
    };
}

function bedrockLegacy(system: string, user: string) {
    return async (ctx: { elapsedMs: number }) => {
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
                system: financeTermsRule() + system,
                messages: [{ role: 'user', content: user }],
            }),
        });
        await reserveBedrockSlot('guardian-briefing');
        const result = await Promise.race([
            client.send(command),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Claude timeout 60s')), ctx.elapsedMs > 0 ? Math.max(8000, 55000 - ctx.elapsedMs) : 55000)),
        ]);
        const body = JSON.parse(new TextDecoder().decode(result.body));
        const u = body.usage || {};
        return {
            text: (body.content?.[0]?.text || '').replace(/```json/g, '').replace(/```/g, '').trim(),
            model: 'claude-haiku-4.5',
            priceModel: 'haiku-4.5' as const,
            usage: { input: Number(u.input_tokens) || 0, output: Number(u.output_tokens) || 0, cacheWrite: Number(u.cache_creation_input_tokens) || 0, cacheRead: Number(u.cache_read_input_tokens) || 0 },
        };
    };
}

/**
 * 드라이런 비교(관리자 인증, 저장 0) — 같은 원자료로 옛 프롬프트(v1·옛 게이트)와 새 프롬프트(v2·새 검사)를 운영 모델(사다리 ① 크레딧 Haiku 5.5, 증가분 등급 = AWS 로 넘기지 않음)로
 * reps 번씩 생성해 원문·검사 결과를 돌려준다. sim = 주말에 장전·장중 문장을 시험(시세 값은 실제 관측, 세션 표지·기준 시각만).
 */
async function dryCompare(body: any): Promise<Response> {
    const t0 = Date.now();
    const reps = Math.max(1, Math.min(6, Number(body.reps) || 2));
    const which: 'both' | 'old' | 'new' = body.which === 'old' || body.which === 'new' ? body.which : 'both';
    const sim: MorningSim = body.sim === 'pre' || body.sim === 'pre-nofut' || body.sim === 'reg' ? body.sim : null;
    const asOfMs = typeof body.asOf === 'string' && Number.isFinite(Date.parse(body.asOf)) ? Date.parse(body.asOf) : Date.now();
    // 워커와 같은 입력 — EC2 워커가 30초마다 쓰는 스냅샷 키를 읽기만 한다(없을 때만 허브 계산)
    const snapshot = await getFromCache<any>('guardian:snapshot:ko').catch(() => null) ?? await GuardianDataHub.getGuardianSnapshot(false);
    const historyRaw = await getFromCache<any>('guardian:rlsi_history').catch(() => null);
    const raw = await collectMorningRaw(snapshot, Array.isArray(historyRaw) ? historyRaw : [], Date.now());
    const facts = morningFactsFromRaw(raw, { sim, asOfMs, newsMaxAgeH: Number(body.newsMaxAgeH) || 18 });
    const sec8k = which === 'new' ? '' : await legacySec8kSection();
    const old = legacyPrompts(raw, sec8k, asOfMs);
    const oldSystem = dateAnchor(new Date(asOfMs)) + financeTermsRule() + old.systemPrompt + await depthSuffixFor('MorningBriefing', old.systemPrompt);
    const newSystem = dateAnchor(new Date(asOfMs)) + financeTermsRule() + morningV2System(facts.session, facts.indexFacts.some(f => f.kind === 'futures'));
    const newUser = buildMorningV2User(facts);
    const out: Record<'old' | 'new', any[]> = { old: [], new: [] };
    const jobs: Array<() => Promise<void>> = [];
    for (let r = 0; r < reps; r++) for (const w of ['old', 'new'] as const) {
        if (which !== 'both' && which !== w) continue;
        jobs.push(async () => {
            const raws: string[] = [];
            const s0 = Date.now();
            const gate = w === 'old' ? briefingGate : v2Gate(facts);
            try {
                const res = await withFreshTier(() => runLadder({
                    purpose: 'MorningBriefing', system: w === 'old' ? oldSystem : newSystem, userPrompt: w === 'old' ? old.userPrompt : newUser,
                    maxTokens: 4096, jsonPrefill: true, temperature: 0.3, locale: 'multi', timeoutMs: 55000,
                    validate: (text: string) => { raws.push(String(text).slice(0, 6000)); return gate(text); },
                }, async () => { throw new Error('dry: no legacy rung'); }));
                const p = prepareBriefingJson(res.text, w === 'new' ? facts : null);
                out[w].push({ ok: true, text: p?.briefing ?? null, raw: res.text.slice(0, 6000), raws, provider: res.provider, ms: Date.now() - s0,
                    newCheck: p ? checkMorningV2(p.json, facts) : null });
            } catch (e: any) {
                const p = raws.length ? prepareBriefingJson(raws[raws.length - 1], w === 'new' ? facts : null) : null;
                out[w].push({ ok: false, error: String(e?.message || e).slice(0, 200), raws, text: p?.briefing ?? null, ms: Date.now() - s0,
                    newCheck: p ? checkMorningV2(p.json, facts) : null, oldGate: p ? briefingGate(p.json) : null });
            }
        });
    }
    let k = 0;
    await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, async () => { while (k < jobs.length) await jobs[k++](); }));
    return NextResponse.json({
        dry: true, sim, asOf: new Date(asOfMs).toISOString(), ms: Date.now() - t0, reps, facts,
        prompts: { oldSystem, oldUser: old.userPrompt, newSystem, newUser },
        inputs: { snapshotGamma: snapshot?.gammaShield ? { gexIndex: snapshot.gammaShield.gexIndex, gexLevel: snapshot.gammaShield.gexLevel, supportWall: snapshot.gammaShield.supportWall, resistanceWall: snapshot.gammaShield.resistanceWall, gammaFlipPoint: snapshot.gammaShield.gammaFlipPoint } : null,
            rlsi: snapshot?.rlsi?.score ?? null, yahooTnx: raw.yahoo?.tnx ? { price: raw.yahoo.tnx.price, change: raw.yahoo.tnx.change, changePct: raw.yahoo.tnx.changePct } : null,
            macroUs10y: raw.macro?.factors?.us10y ? { level: raw.macro.factors.us10y.level, chgAbs: raw.macro.factors.us10y.chgAbs, chgPct: raw.macro.factors.us10y.chgPct, source: raw.macro.factors.us10y.source } : null },
        old: out.old, new: out.new,
    });
}

export async function POST(req: Request) {
    const startTime = Date.now();
    let snapshotForFallback: any = null;
    let fallbackNewsCount = 0;
    let fallbackCalendarCount = 0;

    // 본문은 try 밖에서 읽는다 — 드라이런은 아래 생성 경로의 catch(템플릿 저장)에 절대 닿지 않게 따로 잡는다(관문 10250102 ①)
    const body = await req.json().catch(() => null);
    if (body?.dryCompare) {
        if (!adminAuthorized(req.headers)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
        try { return await dryCompare(body); } catch (e: any) { return NextResponse.json({ dry: true, error: String(e?.message || e).slice(0, 200) }, { status: 500 }); }
    }

    try {
        if (!body) throw new Error('invalid JSON body');
        let { snapshot, rlsiHistory } = body;

        // [V8.1] Self-Healing Data Injection
        if (!snapshot) {
            console.log('[Briefing Gen] Snapshot missing or null, fetching via GuardianDataHub...');
            snapshot = await GuardianDataHub.getGuardianSnapshot(false);
        }
        snapshotForFallback = snapshot;

        if (!process.env.AWS_ACCESS_KEY_ID) {
            return NextResponse.json({ error: 'AWS credentials not configured' }, { status: 500 });
        }

        // ★2026-10-25 v2(TRACKER T7) — 원자료는 한 번만 모은다. 되돌림 스위치(MORNING_BRIEFING_PROMPT=v1)면 옛 프롬프트·옛 게이트 그대로.
        // 자가복구 경로는 RLSI 이력을 안 준다 — 워커와 같은 키에서 읽는다(추세 낱말용, 실패는 빈 이력)
        if (!Array.isArray(rlsiHistory) || !rlsiHistory.length) rlsiHistory = await getFromCache<any>('guardian:rlsi_history').catch(() => null) || [];
        const raw = await collectMorningRaw(snapshot, rlsiHistory);
        const useV1 = process.env.MORNING_BRIEFING_PROMPT === 'v1';
        const facts = morningFactsFromRaw(raw);
        const legacy = useV1 ? legacyPrompts(raw, await legacySec8kSection(), raw.nowMs) : null;
        const newsCount = legacy ? legacy.newsCount : facts.news.length;
        const calendarCount = legacy ? legacy.calendarCount : facts.events.length + facts.released.length;
        fallbackNewsCount = newsCount;
        fallbackCalendarCount = calendarCount;

        const v2System = morningV2System(facts.session, facts.indexFacts.some(f => f.kind === 'futures'));
        const v2User = buildMorningV2User(facts);
        // v1: 깊이 지시문은 라우트가 붙인다(예전 그대로) · v2: 지시문 안에 <depth_standard> 가 있어 사다리가 일반 깊이 지시를 덧붙이지 않는다
        const system = legacy ? legacy.systemPrompt + await depthSuffixFor('MorningBriefing', legacy.systemPrompt) : v2System;
        const userPrompt = legacy ? legacy.userPrompt : v2User;

        // [V8.2] Fast path for EC2 Worker (return prompt only, skip Bedrock)
        if (body.returnPromptOnly) {
            return NextResponse.json({ success: true, prompts: { systemPrompt: system, userPrompt }, newsCount, calendarCount });
        }

        // ★2026-10-10 제공자 사다리 — ①Anthropic 크레딧 → ②Bedrock 5.5 → ③ Bedrock Haiku 4.5. v2 는 ③ 도 같은 v2 지시(옛 지시로 떨어지면 사실 계약이 깨진다).
        const gate = legacy ? briefingGate : v2Gate(facts);
        const ladder = await runLadder(
            {
                purpose: 'MorningBriefing',
                system: dateAnchor() + financeTermsRule() + system,
                userPrompt,
                maxTokens: 4096,
                jsonPrefill: true,
                temperature: 0.3,
                locale: 'multi',
                timeoutMs: 55000,
                validate: gate,
            },
            bedrockLegacy(legacy ? legacy.systemPrompt : v2System, userPrompt),
        );

        const prepared = prepareBriefingJson(ladder.text, legacy ? null : facts);
        // 빈 응답·깨진 JSON — 예전처럼 아래 catch 의 템플릿(template-error, degraded)으로: 부르는 쪽이 다시 시도한다
        if (!prepared) throw new Error('Claude returned empty or unparseable JSON');
        const briefing = prepared.briefing;

        // [V8.1] AI Refusal / Hallucination Validation — v2 는 사실 계약 검사(lib/ai/morningBriefingV2)까지 통과해야 저장한다
        const v2Check = legacy ? null : checkMorningV2(prepared.json, facts);
        if (
            briefingTextInvalid(briefing.ko) ||
            briefingTextInvalid(briefing.en) ||
            briefingTextInvalid(briefing.ja) ||
            hasWrongLocaleText('en', briefing.en) ||
            hasWrongLocaleText('ja', briefing.ja) ||
            (v2Check && !v2Check.ok)
        ) {
            console.error(`[Briefing Gen] AI text failed the exit check (${ladder.provider}; ${v2Check?.reasons.slice(0, 6).join(',') || 'v1 gate'}). Saving clean template fallback.`);
            const etDateStr = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
            const fallback = buildTemplateBriefing(snapshot, etDateStr);
            await saveBriefingTexts(fallback, {
                date: etDateStr,
                source: 'template-validation',
                newsCount,
                calendarCount,
            });
            return NextResponse.json({
                success: true,
                briefing: fallback,
                newsCount,
                calendarCount,
                savedToRedis: true,
                source: 'template-validation',
                // ★2026-10-14 부르는 쪽(EC2 워커·자가복구)이 «템플릿이니 다시 시도»를 알 수 있게 — 오류 경로(template-error)와 같은 표식
                degraded: true,
                ...(v2Check ? { reasons: v2Check.reasons.slice(0, 12) } : {}),
            });
        }

        // ★2026-10-07 앱 강화 T5 — 저장 전 예측어 문장 제거(남은 글이 쓸 만할 때만). 읽는 쪽(GET /api/guardian/briefing)도 같은 검사를 한다(워커가 만든 글도 덮는다).
        for (const loc of ['ko', 'en', 'ja'] as const) {
            const st = stripForecastSentences(String((briefing as any)[loc] ?? ''), loc);
            if (st.removed.length && st.usable && st.text) { console.warn(`[Briefing Gen] ${loc} 예측어 문장 ${st.removed.length}건 제거`); (briefing as any)[loc] = st.text; }
        }

        const elapsed = Date.now() - startTime;
        const etDateStr = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });

        console.log(`[Briefing Gen] ✅ Narrative briefing generated in ${elapsed}ms (${legacy ? 'v1' : `v${MORNING_V2_VERSION} ${facts.session}`}, ${ladder.provider})`);

        // [AUTO-SAVE] Store directly in Redis — no Worker dependency
        await saveBriefingTexts(briefing, {
            date: etDateStr,
            source: 'claude',
            newsCount,
            calendarCount,
            ...(legacy ? {} : { contract: MORNING_V2_VERSION, session: facts.session }),
        });

        console.log(`[Briefing Gen] ✅ Saved to Redis (3 locales + legacy)`);

        return NextResponse.json({
            success: true,
            briefing,  // { ko: "...", en: "...", ja: "..." }
            newsCount,
            calendarCount,
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
