
import { callBedrock, MODELS } from '@/services/bedrockClient';
import { Redis } from "@upstash/redis";
import { SECTOR_MAP } from "@/services/universePolicy";

// Supported locales
type Locale = 'ko' | 'en' | 'ja';

// Redis Keys for persistent cache (per locale)
const getRedisKey = (type: string, locale: Locale) => `guardian:gemini:${type}:${locale}`;

// Get Redis client
function getRedis(): Redis | null {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) return null;
    return new Redis({ url, token });
}

// [FIX] Sanitize text: strip 4-byte UTF-8 (emoji) which breaks Upstash REST API
function sanitizeText(text: string): string {
    // Remove emoji and other 4-byte UTF-8 characters (U+10000+)
    // Also remove common 2-byte symbols that cause issues: ⚠️🛡️📰🎯✍️📊🔍🔥🟢⚡📋
    return text
        .replace(/[\u{10000}-\u{10FFFF}]/gu, '')
        .replace(/[\u2600-\u27BF\u2B50\u2934\u2935\u25AA-\u25FE\u2700-\u27BF\uFE0F\uFFFD\u25C6]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

// Save insight to Redis (for persistence across cold starts)
async function saveInsightToRedis(key: string, text: string): Promise<void> {
    try {
        const redis = getRedis();
        if (!redis) return;
        const cleanText = sanitizeText(text);
        await redis.set(key, JSON.stringify({
            text: cleanText,
            updatedAt: new Date().toISOString()
        }), { ex: 43200 }); // 12 hour expiry
        console.log(`[IntelligenceNode] Saved ${key} to Redis (${cleanText.length} chars)`);
    } catch (e) {
        console.warn("[IntelligenceNode] Redis save error:", e);
    }
}

// Load insight from Redis
async function loadInsightFromRedis(key: string): Promise<string | null> {
    try {
        const redis = getRedis();
        if (!redis) return null;
        const data = await redis.get(key) as { text: string; updatedAt: string } | null;
        if (data?.text) {
            console.log(`[IntelligenceNode] Loaded ${key} from Redis (${data.updatedAt})`);
            return sanitizeText(data.text); // Re-sanitize on read to strip any broken unicode from old cache
        }
    } catch (e) {
        console.warn("[IntelligenceNode] Redis load error:", e);
    }
    return null;
}



interface IntelligenceContext {
    rlsiScore: number;
    nasdaqChange: number;
    vectors: { source: string, target: string, strength: number }[];
    /** 정규장에서만 측정 가능. 시간외/휴장에는 undefined —
     *  0 을 넣으면 AI 가 «거래량 저조»라는 사실 주장으로 바꿔 쓴다. */
    rvol?: number;
    vix: number;
    locale?: Locale;
    // Macro indicators
    us10y?: number;         // Current 10Y yield (e.g., 4.29)
    us10yChange?: number;   // Daily change % (e.g., +0.05)
    spread2s10s?: number;   // 2s10s spread (e.g., 0.72)
    realYield?: number;     // Real yield (e.g., 1.99)
    realYieldStance?: string; // TIGHT, LOOSE, NEUTRAL
    // Breadth indicators
    breadthPct?: number;     // % of advancing stocks (e.g., 81)
    adRatio?: number;        // Advance/Decline ratio (e.g., 4.84)
    volumeBreadth?: number;  // Volume breadth % (e.g., 77.4)
    breadthSignal?: string;  // STRONG, HEALTHY, NEUTRAL, WEAK, CRITICAL
    dxy?: number;            // Dollar index
    // [V6.0] Enhanced Rotation Fields
    rotationRegime?: string;          // e.g. "RISK_OFF_DEFENSE"
    topInflow5d?: string;             // e.g. "Energy(+6.3%), Staples(+4.0%)"
    topOutflow5d?: string;            // e.g. "Comm(-3.3%), Tech(-2.7%)"
    noiseWarning?: string;            // e.g. "XLRE,XLV low consistency"
    trendVsToday?: string;            // e.g. "XLK: today +4% but 5d -2.7%"
    rotationConviction?: string;      // HIGH, MEDIUM, LOW
    // [V6.1] Signal Conflict Detection
    signalConflict?: string;          // e.g. "BULL→NEUTRAL: RLSI 강세 but RISK_OFF HIGH"
    // [V8.0] Market News Headlines for context-aware analysis
    marketNewsHeadlines?: string[];   // e.g. ["CPI rises 3.0% vs 2.9% expected", "Fed signals patience on rate cuts"]
    // [V9.0] Macro Intelligence — full asset class context
    fearGreedScore?: number;          // CNN Fear & Greed Index (0-100)
    fearGreedRating?: string;         // e.g. "Greed", "Extreme Fear"
    spxChangePct?: number;            // S&P 500 daily change %
    goldChangePct?: number;           // Gold (GC=F) daily change %
    oilChangePct?: number;            // Oil (CL=F) daily change %
    btcChangePct?: number;            // BTC daily change %
    tltChangePct?: number;            // TLT (20Y Bond ETF) daily change %
    // [V10.0] GAMMA SHIELD — Options-based volatility intelligence
    gexIndex?: number;                // Normalized GEX (-100 to +100)
    gexLevel?: string;                // LONG_GAMMA, NEUTRAL, SHORT_GAMMA
    squeezeRisk?: number;             // Squeeze probability 0-100%
    squeezeLevel?: string;            // LOW, MEDIUM, HIGH, EXTREME
    triggerSupport?: number | null;    // S&P 500 options-based support
    triggerResistance?: number | null; // S&P 500 options-based resistance
    triggerCurrent?: number | null;    // S&P 500 current price
    gammaFlipPoint?: number | null;    // 감마 부호가 뒤집히는 지점 = 이 판단이 깨지는 자리
    // ★ 「평소와 무엇이 다른가」 축 (2026-09-03 추가).
    //   이게 없으면 AI 는 화면이 이미 보여 주는 숫자를 다시 읽어 주는 것 말고 할 말이 없다.
    gexPercentile?: number;            // 오늘 딜러 감마가 최근 이력에서 몇 번째인가 (0-100)
    gexSamples?: number;               // 그 백분위를 낸 표본 수 — 적으면 말을 아껴야 한다
    gexChange?: number | null;         // 직전 측정 대비 변화
    spyGexIndex?: number;              // SPY 단독
    qqqGexIndex?: number;              // QQQ 단독 — 둘이 갈리면 그 자체가 신호다
    // [V13.0] DIVERGENCE CONTEXT — Surface vs Internal flow mismatch
    divergenceCase?: 'A' | 'B' | 'C' | 'D' | 'N';  // A=FalseRally, B=StealthInflow, C=FullBull, D=DeepFreeze, N=Sync
    divergenceDesc?: string;          // Localized divergence description
    // [V14.0] Institutional Flow Score per sector
    sectorIFS?: { id: string; ifs: number; divergence: string }[];
    stealthAlert?: string;            // e.g. "Healthcare: -0.3% but IFS +55"
    exitAlert?: string;               // e.g. "Energy: +0.8% but IFS -42"
}


/** RVOL 표기 — 측정 불가를 «0.00x»(저조)로 오해시키지 않는다 */
function rvolText(v?: number): string {
    return v === undefined || !(v > 0) ? "측정 불가 (정규장 아님)" : `${v.toFixed(2)}x`;
}

// === TIME-BASED GATING ===
function isOffHours(): boolean {
    const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const hour = nowET.getHours();
    const day = nowET.getDay();
    if (day === 0 || day === 6) return true;
    if (hour >= 20 || hour < 4) return true;
    return false;
}

function isRegularMarketHours(): boolean {
    const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const hour = nowET.getHours();
    const minute = nowET.getMinutes();
    const day = nowET.getDay();
    if (day === 0 || day === 6) return false;
    const totalMinutes = hour * 60 + minute;
    return totalMinutes >= 570 && totalMinutes < 960; // 9:30 AM - 4:00 PM ET
}

// === CACHE SYSTEM (per locale) ===
const ROTATION_TTL_NORMAL = 2 * 60 * 1000;
const REALITY_TTL_NORMAL = 10 * 60 * 1000;
const GAMMA_TTL_NORMAL = 15 * 60 * 1000;
const OFF_HOURS_TTL = 12 * 60 * 60 * 1000;

const _cachedRotation: Record<Locale, string | null> = { ko: null, en: null, ja: null };
const _lastRotationTime: Record<Locale, number> = { ko: 0, en: 0, ja: 0 };
const _cachedReality: Record<Locale, string | null> = { ko: null, en: null, ja: null };
const _lastRealityTime: Record<Locale, number> = { ko: 0, en: 0, ja: 0 };
const _cachedGamma: Record<Locale, string | null> = { ko: null, en: null, ja: null };
const _lastGammaTime: Record<Locale, number> = { ko: 0, en: 0, ja: 0 };

// === LOCALIZED DEFAULT MESSAGES ===
const OFF_HOURS_ROTATION: Record<Locale, string> = {
    ko: "[현황] 장외 시간 - 실시간 분석 대기 중\n[해석] 프리마켓 시작 시 자동 갱신\n[전망] 다음 세션 시작 시 데이터 갱신 예정",
    en: "[Status] Off-hours - waiting for live analysis\n[Interpretation] Auto-refresh at pre-market\n[Outlook] Data will refresh at next session start",
    ja: "[現況] 場外時間 - リアルタイム分析待機中\n[解釈] プレマーケット開始時に自動更新\n[見通し] 次のセッション開始時にデータ更新予定"
};

const OFF_HOURS_REALITY: Record<Locale, string> = {
    ko: "[진단] 장외 시간 - 시장 비활성\n[결론] 프리마켓 04:00 ET 이후 분석 재개",
    en: "[Diagnosis] Off-hours - market inactive\n[Conclusion] Analysis resumes after pre-market 04:00 ET",
    ja: "[診断] 場外時間 - 市場非活性\n[結論] プレマーケット04:00 ET以降分析再開"
};

const OFF_HOURS_GAMMA: Record<Locale, string> = {
    ko: "[변동성] 장외 시간 - 시장 비활성 상태입니다.\n[범위] 프리마켓 시작 시 옵션 흐름 분석이 재개됩니다.",
    en: "[Volatility] Off-hours - market is currently inactive.\n[Range] Option flow analysis resumes at pre-market.",
    ja: "[ボラティリティ] 場外時間 - 市場非活性状態です。\n[範囲] プレマーケット開始時にオプションフロー分析が再開されます。"
};

// [FIX] Detect if cached content is an off-hours placeholder message
function isOffHoursContent(text: string): boolean {
    const markers = [
        '장외 시간', 'Off-hours', '場外時間',
        '시장 비활성', 'market inactive', '市場非活性',
        '실시간 분석 대기', 'waiting for live analysis', 'リアルタイム分析待機',
        '프리마켓 시작 시 자동 갱신', 'Auto-refresh at pre-market', 'プレマーケット開始時に自動更新'
    ];
    return markers.some(m => text.includes(m));
}

// === LOCALIZED PROMPTS ===
const ROTATION_PROMPTS: Record<Locale, (ctx: IntelligenceContext, vectorDesc: string) => string> = {
    ko: (ctx, vectorDesc) => {
        // [V9.0] Build macro asset summary for rotation context
        const macroLines: string[] = [];
        if (ctx.spxChangePct !== undefined) macroLines.push(`S&P 500: ${ctx.spxChangePct >= 0 ? '+' : ''}${ctx.spxChangePct.toFixed(2)}%`);
        if (ctx.dxy !== undefined) macroLines.push(`달러(DXY): ${ctx.dxy.toFixed(1)}`);
        if (ctx.goldChangePct !== undefined) macroLines.push(`금: ${ctx.goldChangePct >= 0 ? '+' : ''}${ctx.goldChangePct.toFixed(2)}%`);
        if (ctx.oilChangePct !== undefined) macroLines.push(`유가(WTI): ${ctx.oilChangePct >= 0 ? '+' : ''}${ctx.oilChangePct.toFixed(2)}%`);
        if (ctx.tltChangePct !== undefined) macroLines.push(`채권(TLT): ${ctx.tltChangePct >= 0 ? '+' : ''}${ctx.tltChangePct.toFixed(2)}%`);
        if (ctx.fearGreedScore !== undefined) macroLines.push(`공포탐욕: ${ctx.fearGreedScore.toFixed(0)} (${ctx.fearGreedRating || ''})`);
        const macroContext = macroLines.length > 0 ? `\n        [거시경제 자산]
        ${macroLines.map(l => `- ${l}`).join('\n        ')}` : '';

        return `
        당신은 기관 투자 전략가입니다. 5일 추세 데이터, 거시경제 자산 동향, 실시간 뉴스를 기반으로 정확한 순환매 분석을 제공합니다.

        **현재 데이터:**
        - NASDAQ 변동: ${ctx.nasdaqChange > 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}%
        - 오늘의 자금 흐름: [${vectorDesc}]
        - VIX: ${ctx.vix.toFixed(1)}
        - RVOL: ${rvolText(ctx.rvol)}
        ${ctx.rotationRegime ? `- 5일 순환매 레짐: ${ctx.rotationRegime}` : ''}
        ${ctx.topInflow5d ? `- 5일 유입 섹터: ${ctx.topInflow5d}` : ''}
        ${ctx.topOutflow5d ? `- 5일 유출 섹터: ${ctx.topOutflow5d}` : ''}
        ${ctx.trendVsToday ? `- 당일 vs 추세 괴리: ${ctx.trendVsToday}` : ''}
        ${ctx.noiseWarning ? `- 노이즈 경고: ${ctx.noiseWarning}` : ''}
        ${ctx.rotationConviction ? `- 순환매 확신도: ${ctx.rotationConviction}` : ''}
        ${macroContext}

        ${ctx.signalConflict ? `- [경고] 신호 충돌: ${ctx.signalConflict}` : ''}

        ${ctx.gexIndex !== undefined ? `**[GAMMA SHIELD]:**
        - GEX 지수: ${ctx.gexIndex >= 0 ? '+' : ''}${ctx.gexIndex} (${ctx.gexLevel || 'N/A'})
        - 스퀴즈 리스크: ${ctx.squeezeRisk}% (${ctx.squeezeLevel || 'N/A'})
        ${ctx.triggerSupport ? `- 옵션 지지선(S&P 500): ${ctx.triggerSupport.toLocaleString()}` : ''}
        ${ctx.triggerResistance ? `- 옵션 저항선(S&P 500): ${ctx.triggerResistance.toLocaleString()}` : ''}
        ${ctx.triggerCurrent ? `- 현재가(S&P 500): ${ctx.triggerCurrent.toLocaleString()}` : ''}` : ''}

        ${ctx.sectorIFS && ctx.sectorIFS.length > 0 ? `**[기관 수급 (Institutional Flow Score)]:**
        ${ctx.sectorIFS.map(s => `- ${s.id}: IFS ${s.ifs > 0 ? '+' : ''}${s.ifs.toFixed(0)} (${s.divergence})`).join('\n        ')}` : ''}
        ${ctx.stealthAlert ? `- [STEALTH 매집] ${ctx.stealthAlert}` : ''}
        ${ctx.exitAlert ? `- [SMART EXIT] ${ctx.exitAlert}` : ''}

        ${ctx.marketNewsHeadlines && ctx.marketNewsHeadlines.length > 0 ? `**[실시간 시장 뉴스]:**
        ${ctx.marketNewsHeadlines.map(h => `- ${h}`).join('\n        ')}` : ''}

        **중요 분석 규칙:**
        - 당일 반등이 있더라도 5일 추세가 하락이면 "일시적 반등"으로 판단
        - 5일 유입/유출 데이터가 당일 데이터보다 우선
        - 노이즈 경고가 있는 섹터는 신뢰도가 낮음을 언급
        - 레짐(RISK_OFF_DEFENSE 등)을 반영한 실질적 조언 제공
        - **신호 충돌 시**: RLSI/나스닥은 강세이나 순환매가 RISK_OFF이면 "겉은 강세, 속은 약세" 같은 표현으로 혼재 신호를 명확히 전달. 반대로 지표는 약세이나 성장주로 자금 유입 시 "저점 매집 가능성" 표현 사용
        - **뉴스가 제공된 경우**: 수치 변동의 원인을 뉴스에서 찾아 반드시 언급 (예: "CPI 예상 상회로 인한 매도세", "연준 발언으로 금리 인하 기대 후퇴"). 단, 뉴스를 번호로 참조하지 말 것 ("뉴스 1번", "뉴스 4번" 등 금지). 뉴스 내용을 자연스럽게 녹여서 서술

        ${ctx.divergenceCase && ctx.divergenceCase !== 'N' ? `**[DIVERGENCE 상황 — 최우선 분석 필수]:**
        현재 지수 표면과 내부 유동성 간 괴리(Divergence)가 관측됩니다.
        - 유형: ${ctx.divergenceCase === 'A' ? 'False Rally (지수↑ 유동성↓)' : ctx.divergenceCase === 'B' ? 'Stealth Inflow (지수↓ 유동성↑)' : ctx.divergenceCase === 'C' ? 'Momentum Surge (지수↑ 유동성↑)' : 'Deep Freeze (지수↓ 유동성↓)'}
        - 상황: ${ctx.divergenceDesc || ''}
        이 Divergence가 순환매 맥락에서 무엇을 의미하는지 반드시 [해석]에 포함하세요. (예: "지수는 상승하나 스마트머니는 이미 방어주로 이동 중으로, 표면 강세의 지속 가능성이 낮다" 또는 "가격 하락 속 기관 자금 유입이 관측되어 저점 매집 가능성")` : ''}
        - **거시경제 자산 교차 검증**: 금+채권(TLT) 동반 상승 시 안전자산 선호 언급, 유가 급등 시 인플레 우려, 달러 강세 시 신흥국/원자재 약세 연결
        - **감마 쉴드 분석**: GEX가 -20 이하면 딜러 매수 헤지로 변동성 확대 경고, +20 이상이면 감마 클램핑으로 안정 언급. 스퀴즈 리스크 45% 이상이면 급변동 가능성 경고. 옵션 지지/저항선 근접 시 해당 레벨 언급

        **출력 형식 (반드시 이 형식으로):**
        [현황] (5일 기준 섹터 이동 현황 + 거시 배경 1문장)
        [해석] (의미 + 뉴스 기반 원인 1문장, 신호 충돌 시 반드시 언급)
        [전망] (향후 시장 방향성 전망 1문장 — 사실과 데이터 기반, 행동 지시 금지)

        **규칙:**
        - 한국어 전문가 스타일
        - 섹터명은 한글 (기술주, 에너지, 부동산 등)
        - 3줄 이내, 간결하게
        - 뉴스에서 핵심 이벤트를 추출하여 수치의 "왜"를 설명
        - 거시경제 자산 동향으로 순환매의 배경을 설명 (예: "유가 급등으로 에너지 유입")
        - 이모지(emoji) 사용 절대 금지. 텍스트만 사용
        - **기관 수급(IFS)이 제공된 경우**: 가격 상승인데 IFS 음수 섹터는 "개인 주도 상승" 언급, 가격 하락인데 IFS 양수는 "기관 스텔스 매집" 패턴으로 분석. STEALTH/EXIT 알러트가 있으면 반드시 [해석]에 포함
    `;
    },
    en: (ctx, vectorDesc) => `
        You are an institutional investment strategist. Analyze sector rotation using 5-day trend data and real-time news.

        **Current Data:**
        - NASDAQ Change: ${ctx.nasdaqChange > 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}%
        - Today's Money Flow: [${vectorDesc}]
        - VIX: ${ctx.vix.toFixed(1)}
        - RVOL: ${rvolText(ctx.rvol)}
        ${ctx.rotationRegime ? `- 5-Day Rotation Regime: ${ctx.rotationRegime}` : ''}
        ${ctx.topInflow5d ? `- 5-Day Inflow Leaders: ${ctx.topInflow5d}` : ''}
        ${ctx.topOutflow5d ? `- 5-Day Outflow Leaders: ${ctx.topOutflow5d}` : ''}
        ${ctx.trendVsToday ? `- Today vs Trend Divergence: ${ctx.trendVsToday}` : ''}
        ${ctx.noiseWarning ? `- Noise Warning: ${ctx.noiseWarning}` : ''}
        ${ctx.rotationConviction ? `- Rotation Conviction: ${ctx.rotationConviction}` : ''}

        ${ctx.signalConflict ? `- [WARNING] Signal Conflict: ${ctx.signalConflict}` : ''}

        ${ctx.gexIndex !== undefined ? `**[GAMMA SHIELD]:**
        - GEX Index: ${ctx.gexIndex >= 0 ? '+' : ''}${ctx.gexIndex} (${ctx.gexLevel || 'N/A'})
        - Squeeze Risk: ${ctx.squeezeRisk}% (${ctx.squeezeLevel || 'N/A'})
        ${ctx.triggerSupport ? `- Options Support (S&P 500): ${ctx.triggerSupport.toLocaleString()}` : ''}
        ${ctx.triggerResistance ? `- Options Resistance (S&P 500): ${ctx.triggerResistance.toLocaleString()}` : ''}
        ${ctx.triggerCurrent ? `- Current Price (S&P 500): ${ctx.triggerCurrent.toLocaleString()}` : ''}` : ''}

        ${ctx.sectorIFS && ctx.sectorIFS.length > 0 ? `**[Institutional Flow Score (IFS)]:**
        ${ctx.sectorIFS.map(s => `- ${s.id}: IFS ${s.ifs > 0 ? '+' : ''}${s.ifs.toFixed(0)} (${s.divergence})`).join('\n        ')}` : ''}
        ${ctx.stealthAlert ? `- [STEALTH ACCUMULATION] ${ctx.stealthAlert}` : ''}
        ${ctx.exitAlert ? `- [SMART MONEY EXIT] ${ctx.exitAlert}` : ''}

        ${ctx.marketNewsHeadlines && ctx.marketNewsHeadlines.length > 0 ? `**[Real-time Market News]:**
        ${ctx.marketNewsHeadlines.map(h => `- ${h}`).join('\n        ')}` : ''}

        **Critical Analysis Rules:**
        - If today shows a bounce but 5-day trend is down, call it a "relief rally"
        - 5-day inflow/outflow data takes priority over single-day data
        - Sectors with noise warnings have low reliability
        - Reflect the regime (RISK_OFF_DEFENSE etc.) in market outlook
        - **Signal Conflict**: When RLSI/NASDAQ are bullish but rotation is RISK_OFF, describe it as "surface strength masks underlying weakness"
        - **When news is provided**: Identify the root cause of market movements from news (e.g., "CPI beat triggered selloff", "Fed hawkish tone pressures growth"). Do NOT reference news by number (e.g., "news #1", "news #4"). Weave news context naturally into analysis
        - **Gamma Shield**: If GEX <= -20, warn about dealer hedging amplifying volatility. If GEX >= +20, note gamma clamping stabilizing prices. If squeeze risk >= 45%, warn about potential sharp moves. Reference options support/resistance levels when price is near them

        ${ctx.divergenceCase && ctx.divergenceCase !== 'N' ? `**[DIVERGENCE ALERT — PRIORITIZE IN ANALYSIS]:**
        A significant divergence between index surface and internal liquidity is detected.
        - Type: ${ctx.divergenceCase === 'A' ? 'False Rally (Index UP, Liquidity DOWN)' : ctx.divergenceCase === 'B' ? 'Stealth Inflow (Index DOWN, Liquidity UP)' : ctx.divergenceCase === 'C' ? 'Momentum Surge (Index UP, Liquidity UP)' : 'Deep Freeze (Index DOWN, Liquidity DOWN)'}
        - Context: ${ctx.divergenceDesc || ''}
        You MUST address what this divergence means for sector rotation in [Interpretation]. (e.g., "Index rises but smart money is already rotating to defensives, questioning rally sustainability" or "Institutional accumulation during selloff suggests potential bottom formation")` : ''}

        **Output Format (strictly follow):**
        [Status] (1 sentence on 5-day sector movement)
        [Interpretation] (1 sentence on meaning + news-based cause, MUST mention signal conflicts if present)
        [Outlook] (1 sentence factual market outlook — no action directives)

        **Rules:**
        - Professional English briefing style
        - Be specific with sector names
        - Max 3 lines, concise
        - Reference key news events to explain the "why" behind the numbers
        - Do NOT use any emoji. Use plain text only
        - **When IFS data is provided**: If a sector shows price rise but negative IFS, describe as "retail-driven rally". If price falls but positive IFS, describe as "stealth institutional accumulation". STEALTH/EXIT alerts MUST be addressed in [Interpretation]
    `,
    ja: (ctx, vectorDesc) => `
        あなたは機関投資戦略家です。5日間のトレンドデータとリアルタイムニュースに基づいてセクターローテーションを分析します。

        **現在のデータ:**
        - NASDAQ変動: ${ctx.nasdaqChange > 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}%
        - 本日の資金フロー: [${vectorDesc}]
        - VIX: ${ctx.vix.toFixed(1)}
        - RVOL: ${rvolText(ctx.rvol)}
        ${ctx.rotationRegime ? `- 5日ローテーションレジーム: ${ctx.rotationRegime}` : ''}
        ${ctx.topInflow5d ? `- 5日流入リーダー: ${ctx.topInflow5d}` : ''}
        ${ctx.topOutflow5d ? `- 5日流出リーダー: ${ctx.topOutflow5d}` : ''}
        ${ctx.trendVsToday ? `- 本日 vs トレンド: ${ctx.trendVsToday}` : ''}
        ${ctx.noiseWarning ? `- ノイズ警告: ${ctx.noiseWarning}` : ''}
        ${ctx.rotationConviction ? `- ローテーション確信度: ${ctx.rotationConviction}` : ''}

        ${ctx.gexIndex !== undefined ? `**[ガンマシールド]:**
        - GEX指数: ${ctx.gexIndex >= 0 ? '+' : ''}${ctx.gexIndex} (${ctx.gexLevel || 'N/A'})
        - スクイーズリスク: ${ctx.squeezeRisk}% (${ctx.squeezeLevel || 'N/A'})
        ${ctx.triggerSupport ? `- オプションサポート(S&P 500): ${ctx.triggerSupport.toLocaleString()}` : ''}
        ${ctx.triggerResistance ? `- オプションレジスタンス(S&P 500): ${ctx.triggerResistance.toLocaleString()}` : ''}` : ''}

        ${ctx.sectorIFS && ctx.sectorIFS.length > 0 ? `**[機関需給 (Institutional Flow Score)]:**
        ${ctx.sectorIFS.map(s => `- ${s.id}: IFS ${s.ifs > 0 ? '+' : ''}${s.ifs.toFixed(0)} (${s.divergence})`).join('\n        ')}` : ''}
        ${ctx.stealthAlert ? `- [ステルス買集] ${ctx.stealthAlert}` : ''}
        ${ctx.exitAlert ? `- [スマートマネー流出] ${ctx.exitAlert}` : ''}

        ${ctx.marketNewsHeadlines && ctx.marketNewsHeadlines.length > 0 ? `**[リアルタイム市場ニュース]:**
        ${ctx.marketNewsHeadlines.map(h => `- ${h}`).join('\n        ')}` : ''}

        **重要な分析ルール:**
        - 本日反発があっても5日トレンドが下降なら「一時的反発」と判断
        - 5日流入/流出データが1日データより優先
        - ノイズ警告のあるセクターは信頼性が低い
        - レジーム(RISK_OFF_DEFENSEなど)を反映した実質的なアドバイス
        - **ニュースが提供された場合**: 数値変動の原因をニュースから特定して必ず言及。ニュースを番号で参照しないこと（「ニュース1番」等禁止）。自然に文脈に織り込む

        ${ctx.divergenceCase && ctx.divergenceCase !== 'N' ? `**[DIVERGENCE アラート — 分析最優先]:**
        指数表面と内部流動性の乖離が観測されています。
        - タイプ: ${ctx.divergenceCase === 'A' ? '偽のラリー(指数↑ 流動性↓)' : ctx.divergenceCase === 'B' ? 'ステルス流入(指数↓ 流動性↑)' : ctx.divergenceCase === 'C' ? 'モメンタムサージ(指数↑ 流動性↑)' : '同時弱体化(指数↓ 流動性↓)'}
        - 状況: ${ctx.divergenceDesc || ''}
        このDivergenceがセクターローテーションの文脈で何を意味するか必ず[解釈]に含めてください。` : ''}

        **出力形式 (必ずこの形式で):**
        [現況] (5日基準セクター移動現況 1文)
        [解釈] (意味 + ニュース基盤の原因 1文)
        [見通し] (市場方向性の見通し 1文 — 事実とデータ基盤、行動指示禁止)

        **ルール:**
        - 日本語専門家スタイル
        - セクター名は日本語（テクノロジー、エネルギー、不動産など）
        - 3行以内、簡潔に
        - ニュースから核心イベントを抽出して「なぜ」を説明
        - 絵文字(emoji)使用禁止。テキストのみ使用
        - **機関需給(IFS)が提供された場合**: 価格上昇だがIFSマイナスのセクターは「個人主導上昇」と言及、価格下落だがIFSプラスは「機関ステルス買集」パターンとして分析
    `
};

const GAMMA_PROMPTS: Record<Locale, (ctx: IntelligenceContext) => string> = {
    ko: (ctx) => {
        const gex = ctx.gexIndex ?? 0;
        const squeeze = ctx.squeezeRisk ?? 0;
        // ⚠️ 이 프롬프트는 2026-09-03 에 다시 썼다. 이유는 아래 셋이다.
        //   ① 예전 규칙 2번은 「학술적 표현 절대 금지」인데 8번은 「'관찰된다·시사한다'
        //      어조 유지」를 요구했다. **그 어조가 바로 학술 문체다.** 프롬프트가
        //      자기모순이라 금지가 먹히지 않았다. 컴플라이언스는 «단정·권유를 안 하는 것»이지
        //      한자어 문체가 아니다 — 평서형으로도 지킬 수 있다.
        //   ② 출력 형식이 GEX·Squeeze·현재가·벽 거리를 «서술»하라고 시켰는데,
        //      그 숫자는 카드가 이미 값으로 보여 준다. 그래서 AI 가 화면을 다시 읽어 줬다.
        //      실측 출력: "현재가 7,714는 풋 플로어 7,650 대비 64포인트 상방…"
        //   ③ 그래서 정작 인사이트인 것 — 오늘이 평소와 어떻게 다른가, 무엇이 이 판단을
        //      뒤집는가 — 이 하나도 없었다. 이제 백분위·직전 대비 변화를 넣어 준다.
        const pct = ctx.gexPercentile;
        const samples = ctx.gexSamples ?? 0;
        const chg = ctx.gexChange;
        return `
        당신은 파생상품 데스크의 시니어 전략가입니다. 아래 데이터로 **오늘 옵션 구조에서 남들이 놓치는 한 가지**를 짚어 주십시오.

        **오늘 값:**
        - GEX 지수 ${gex >= 0 ? '+' : ''}${gex} (${ctx.gexLevel || 'NEUTRAL'}) / SPY ${ctx.spyGexIndex ?? '—'} · QQQ ${ctx.qqqGexIndex ?? '—'}
        - 변동성 압축 ${squeeze}% (${ctx.squeezeLevel || 'LOW'})
        ${typeof chg === 'number' ? `- 직전 측정 대비 GEX 변화: ${chg >= 0 ? '+' : ''}${chg}` : ''}
        ${typeof pct === 'number' && samples >= 10 ? `- 오늘 딜러 감마는 최근 ${samples}거래일 중 상위 ${100 - pct}% 수준 (백분위 ${pct})` : ''}
        ${ctx.triggerCurrent ? `- S&P500 현재가 ${ctx.triggerCurrent.toLocaleString()} / 풋플로어 ${ctx.triggerSupport?.toLocaleString() ?? '—'} / 콜월 ${ctx.triggerResistance?.toLocaleString() ?? '—'}${ctx.gammaFlipPoint ? ` / 감마플립 ${ctx.gammaFlipPoint.toLocaleString()}` : ''}` : ''}

        **화면이 이미 보여 주는 것 (절대 다시 쓰지 마십시오):**
        GEX 숫자와 등급, 압축 %, 현재가·지지·저항까지의 거리. 이 값들을 문장으로 옮겨 적는 것은 실패입니다.

        **당신만 할 수 있는 것 — 이 둘만 쓰십시오:**
        [평소와 다른 점] 오늘 수치가 최근 이력·직전 대비 어떤 위치인지, 그게 무슨 뜻인지 한 문장.
          백분위 자료가 없으면 SPY와 QQQ가 갈리는지, 직전 대비 어디로 움직였는지로 대신하십시오.
        [이 판단이 깨지는 지점] 어떤 가격을 지나면 지금 구조가 반대로 작동하기 시작하는지 한 문장.
          숫자를 쓰되 «왜 그 자리인지»를 붙이십시오 (예: 그 아래에서는 같은 딜러가 반대로 팔기 시작한다).

        **문체:**
        - 한 문장에 한 가지만. 짧게. 「~다」로 끝내는 평서형.
        - 「~함을 시사한다」 「~가 관찰된다」 「~에 기인한다」 금지. 번역투 금지.
        - 전문어를 쓰면 바로 뒤에 일상어로 풀어 주십시오.
        - 비유(압력밥솥·쿠션·에어백) 금지. 이모지 금지.

        **★ 가격 예측 절대 금지 (가장 중요):**
        평서형은 «지금 구조»를 말할 때만 씁니다. **앞으로의 가격에는 쓰지 마십시오.**
        「~할 것이다」뿐 아니라 **「~나타난다」 「~가속된다」 「~하락한다」 처럼
        앞으로 일어날 일을 현재형으로 단정하는 것도 전부 금지**입니다.
        구조가 «어떤 자리에서 어떻게 바뀌는지»만 쓰고, 그래서 무슨 일이 생길지는 쓰지 마십시오.
          나쁜 예: 7,650 아래로 내려가면 하락 가속이 나타난다.
          좋은 예: 7,650 아래는 같은 딜러가 반대로 팔아야 하는 자리로 바뀐다.
          나쁜 예: 변동성이 확대된다 / 상승 흐름이 이어진다
          좋은 예: 그 구간에서는 헤지 방향이 반대가 된다

        **★ 화면과 모순 금지:** 등급이 중립이면 「감마가 변동성을 키운다」처럼
        등급과 어긋나는 말을 쓰지 마십시오. 중립은 «누르지도 키우지도 않는다»는 뜻입니다.

        **분량: 두 문장, 각 60자 이내. 초과하면 실패입니다.**
        `;
    },
    en: (ctx) => {
        const gex = ctx.gexIndex ?? 0;
        const squeeze = ctx.squeezeRisk ?? 0;
        return `
        You are a senior derivatives strategist. Point out the ONE thing about today's options structure that a reader would otherwise miss.

        **Today:**
        - GEX ${gex >= 0 ? '+' : ''}${gex} (${ctx.gexLevel || 'NEUTRAL'}) / SPY ${ctx.spyGexIndex ?? '—'} · QQQ ${ctx.qqqGexIndex ?? '—'}
        - Compression ${squeeze}% (${ctx.squeezeLevel || 'LOW'})
        ${typeof ctx.gexChange === 'number' ? `- GEX change vs prior reading: ${ctx.gexChange >= 0 ? '+' : ''}${ctx.gexChange}` : ''}
        ${typeof ctx.gexPercentile === 'number' && (ctx.gexSamples ?? 0) >= 10 ? `- Today's dealer gamma sits in the top ${100 - ctx.gexPercentile}% of the last ${ctx.gexSamples} sessions (percentile ${ctx.gexPercentile})` : ''}
        ${ctx.triggerCurrent ? `- S&P 500 ${ctx.triggerCurrent.toLocaleString()} / put floor ${ctx.triggerSupport?.toLocaleString() ?? '—'} / call wall ${ctx.triggerResistance?.toLocaleString() ?? '—'}${ctx.gammaFlipPoint ? ` / gamma flip ${ctx.gammaFlipPoint.toLocaleString()}` : ''}` : ''}

        **Already on screen — NEVER restate:**
        The GEX number and label, the compression %, and the distances from price to support/resistance.
        Turning those numbers back into prose is a failure.

        **Only you can supply these two:**
        [What's different from normal] Where today sits versus its own recent history, and what that means. One sentence.
          If no percentile is given, use the SPY vs QQQ split or the change from the prior reading instead.
        [Where this read breaks] The price at which the current structure starts working in reverse. One sentence.
          Give the number AND why that level (e.g. below it the same dealers have to sell instead of buy).

        **Style:**
        - One idea per sentence. Short. Plain English.
        - Banned: "suggests", "is observed", "indicates", "presents", "underscores". No research-report register.
        - Explain any jargon in the same breath.
        - No analogies (pressure cooker, cushion, airbag). No emojis.

        **CRITICAL — never predict price:**
        Describe how the structure works, never what price will do.
        Banned not just as "will" but any present-tense claim about a future outcome
        ("acceleration follows", "volatility expands", "the move extends").
          Bad:  Below 7,650 downside acceleration follows.
          Good: Below 7,650 the same dealers have to sell instead of buy.
          Bad:  Volatility expands from here.
          Good: In that zone the hedging flips direction.

        **Never contradict the label:** if the level says NEUTRAL, do not write that gamma is amplifying moves.

        **Length: two sentences, each under 130 characters. Longer is a failure.**
        `;
    },
    ja: (ctx) => {
        const gex = ctx.gexIndex ?? 0;
        const squeeze = ctx.squeezeRisk ?? 0;
        return `
        あなたはデリバティブ・デスクのシニアストラテジストです。**今日のオプション構造で読者が見落とす一点**を指摘してください。

        **今日の値:**
        - GEX ${gex >= 0 ? '+' : ''}${gex} (${ctx.gexLevel || 'NEUTRAL'}) / SPY ${ctx.spyGexIndex ?? '—'}・QQQ ${ctx.qqqGexIndex ?? '—'}
        - 圧縮 ${squeeze}% (${ctx.squeezeLevel || 'LOW'})
        ${typeof ctx.gexChange === 'number' ? `- 直前計測比のGEX変化: ${ctx.gexChange >= 0 ? '+' : ''}${ctx.gexChange}` : ''}
        ${typeof ctx.gexPercentile === 'number' && (ctx.gexSamples ?? 0) >= 10 ? `- 今日のディーラーガンマは直近${ctx.gexSamples}営業日で上位${100 - ctx.gexPercentile}%（パーセンタイル${ctx.gexPercentile}）` : ''}
        ${ctx.triggerCurrent ? `- S&P500 ${ctx.triggerCurrent.toLocaleString()} / プットフロア ${ctx.triggerSupport?.toLocaleString() ?? '—'} / コールウォール ${ctx.triggerResistance?.toLocaleString() ?? '—'}${ctx.gammaFlipPoint ? ` / ガンマフリップ ${ctx.gammaFlipPoint.toLocaleString()}` : ''}` : ''}

        **画面が既に表示しているもの（絶対に書き直さないこと）:**
        GEXの数値と等級、圧縮%、現在値から支持・抵抗までの距離。これらを文章に置き換えるのは失敗です。

        **あなたにしか書けない二つだけ:**
        [平常との違い] 今日の値が直近の履歴・直前と比べてどの位置にあり、それが何を意味するかを1文で。
          パーセンタイルが無い場合は、SPYとQQQの分かれ方、または直前比の動きで代替してください。
        [この見方が崩れる地点] 今の構造が逆に働き始める価格を1文で。
          数値とともに «なぜその水準か» を添えてください（例：その下では同じディーラーが買いではなく売りに回る）。

        **文体:**
        - 一文に一つだけ。短く。平易な日本語で。
        - 禁止：「示唆する」「観測される」「呈している」「起因する」。研究レポート調にしないこと。
        - 専門用語を使ったらその場で日常語に言い換えること。
        - 比喩（圧力鍋・クッション・エアバッグ）禁止。絵文字禁止。

        **★ 価格予測は絶対禁止:**
        構造が «どう働くか» だけを書き、価格が «どうなるか» は書かないでください。
        「〜だろう」だけでなく、**「加速する」「拡大する」「続く」のように
        これから起きることを現在形で断定するのも全て禁止**です。
          悪い例：7,650を割れば下落が加速する。
          良い例：7,650の下では同じディーラーが買いではなく売りに回る水準に変わる。
          悪い例：ボラティリティが拡大する。
          良い例：その領域ではヘッジの向きが反対になる。

        **★ 等級と矛盾しないこと:** 等級がNEUTRALなら「ガンマが変動を増幅する」とは書かないでください。

        **分量：2文、各60字以内。超えたら失敗です。**
        `;
    }
};

const REALITY_PROMPTS: Record<Locale, (ctx: IntelligenceContext) => string> = {
    ko: (ctx) => {
        // Determine market condition
        const rlsiLevel = ctx.rlsiScore >= 65 ? '건강' : ctx.rlsiScore >= 45 ? '중립' : '취약';
        const priceAction = ctx.nasdaqChange >= 0.5 ? '강세' : ctx.nasdaqChange <= -0.5 ? '약세' : '보합';
        const vixLevel = ctx.vix >= 25 ? '공포' : ctx.vix >= 18 ? '경계' : '안정';
        const rvolLevel = ctx.rvol === undefined || !(ctx.rvol > 0) ? '측정 불가'
            : ctx.rvol >= 1.5 ? '급증' : ctx.rvol >= 1.1 ? '활발' : '저조';

        // Macro context strings
        const yieldLine = ctx.us10y !== undefined
            ? `- US10Y 금리: ${ctx.us10y?.toFixed(2)}% (변동: ${ctx.us10yChange !== undefined ? (ctx.us10yChange >= 0 ? '+' : '') + ctx.us10yChange.toFixed(2) + '%' : '?'})` : '';
        const spreadLine = ctx.spread2s10s !== undefined
            ? `- 장단기 금리차(2s10s): ${ctx.spread2s10s?.toFixed(2)}% ${ctx.spread2s10s! < 0 ? '[경고]역전' : ctx.spread2s10s! < 0.25 ? '[경고]축소' : '정상'}` : '';
        const realYieldLine = ctx.realYield !== undefined
            ? `- 실질금리: ${ctx.realYield?.toFixed(2)}% (${ctx.realYieldStance === 'TIGHT' ? '긴축적 → 성장주 압박' : ctx.realYieldStance === 'LOOSE' ? '완화적 → 성장주 유리' : '중립'})` : '';
        const breadthLine = ctx.breadthPct !== undefined
            ? `- 시장 참여폭(Breadth): 상승 ${Math.round(ctx.breadthPct!)}% / A/D 비율 ${ctx.adRatio?.toFixed(2) || '?'} / 거래량 Breadth ${ctx.volumeBreadth?.toFixed(1) || '?'}% [${ctx.breadthSignal || '?'}]` : '';

        // [V9.0] Cross-asset macro context
        const assetLines: string[] = [];
        if (ctx.spxChangePct !== undefined) assetLines.push(`- S&P 500: ${ctx.spxChangePct >= 0 ? '+' : ''}${ctx.spxChangePct.toFixed(2)}%`);
        if (ctx.dxy !== undefined) assetLines.push(`- 달러 인덱스(DXY): ${ctx.dxy.toFixed(1)}`);
        if (ctx.goldChangePct !== undefined) assetLines.push(`- 금(Gold): ${ctx.goldChangePct >= 0 ? '+' : ''}${ctx.goldChangePct.toFixed(2)}%`);
        if (ctx.oilChangePct !== undefined) assetLines.push(`- 유가(WTI): ${ctx.oilChangePct >= 0 ? '+' : ''}${ctx.oilChangePct.toFixed(2)}%`);
        if (ctx.btcChangePct !== undefined) assetLines.push(`- 비트코인: ${ctx.btcChangePct >= 0 ? '+' : ''}${ctx.btcChangePct.toFixed(2)}%`);
        if (ctx.tltChangePct !== undefined) assetLines.push(`- 채권 ETF(TLT): ${ctx.tltChangePct >= 0 ? '+' : ''}${ctx.tltChangePct.toFixed(2)}%`);
        const assetBlock = assetLines.length > 0 ? `\n        [글로벌 자산 동향]
        ${assetLines.join('\n        ')}` : '';

        // Fear & Greed context
        const fgLine = ctx.fearGreedScore !== undefined
            ? `- CNN 공포탐욕지수: ${ctx.fearGreedScore.toFixed(0)}점 (${ctx.fearGreedRating || '?'}) ${ctx.fearGreedScore < 25 ? '[경고]극단적 공포' : ctx.fearGreedScore < 40 ? '공포' : ctx.fearGreedScore > 75 ? '[경고]탐욕 과열' : ctx.fearGreedScore > 60 ? '탐욕' : '중립'}` : '';

        return `
        당신은 월가 최고의 매크로 전략가이자 기술적 분석가입니다. 모든 지표, 자산군 동향, 실시간 뉴스를 종합하여 **정확한 판단**과 실전 데이터 인사이트를 제공합니다.

        **[중요] 판단 정확성 최우선 원칙:**
        - 수치가 보여주는 사실과 뉴스 해석이 충돌하면 **수치를 우선**
        - 불확실하면 "~가능성" "~주시 필요" 같은 유보적 표현 사용, 확정 표현 금지
        - 하나의 뉴스 헤드라인만으로 전체 시장을 판단하지 말 것
        - 최소 2개 이상 지표가 동일 방향을 가리킬 때만 확신 있는 판단

        **[현재 시장 데이터 -- 종합 대시보드]:**

        [가격 & 내부지표]
        - RLSI (시장 건강도): ${ctx.rlsiScore.toFixed(0)}점 (${rlsiLevel})
        - 나스닥: ${ctx.nasdaqChange >= 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}% (${priceAction})
        - VIX (변동성): ${ctx.vix.toFixed(1)} (${vixLevel})
        - 거래량(RVOL): ${rvolText(ctx.rvol)} (${rvolLevel})

        [매크로 금리 환경]
        ${yieldLine}
        ${spreadLine}
        ${realYieldLine}
        ${assetBlock}

        [시장 심리]
        ${fgLine}

        [시장 참여도 — Breadth]
        ${breadthLine}

        ${ctx.gexIndex !== undefined ? `[옵션 구조 — GAMMA SHIELD]
        - GEX 지수: ${ctx.gexIndex >= 0 ? '+' : ''}${ctx.gexIndex} (${ctx.gexLevel || 'N/A'}) → ${ctx.gexIndex >= 20 ? '딜러 감마 방어(안정)' : ctx.gexIndex <= -20 ? '딜러 매도 증폭(불안정)' : '약한 감마 방어(취약)'}
        - 스퀴즈 리스크: ${ctx.squeezeRisk}% (${ctx.squeezeLevel || 'N/A'}) → ${ctx.squeezeRisk! >= 55 ? '변동성 임계' : ctx.squeezeRisk! >= 30 ? '에너지 축적 중' : '안정'}
        ${ctx.triggerCurrent ? `- S&P 500 현재: ${ctx.triggerCurrent.toLocaleString()}` : ''}
        ${ctx.triggerSupport ? `- 옵션 지지선: ${ctx.triggerSupport.toLocaleString()} (${ctx.triggerCurrent ? (((ctx.triggerCurrent - ctx.triggerSupport) / ctx.triggerCurrent) * 100).toFixed(1) + '% 아래' : ''})` : ''}
        ${ctx.triggerResistance ? `- 옵션 저항선: ${ctx.triggerResistance.toLocaleString()} (${ctx.triggerCurrent ? (((ctx.triggerResistance - ctx.triggerCurrent) / ctx.triggerCurrent) * 100).toFixed(1) + '% 위' : ''})` : ''}` : ''}

        ${ctx.marketNewsHeadlines && ctx.marketNewsHeadlines.length > 0 ? `[실시간 시장 뉴스 -- 거시경제 이벤트]
        ${ctx.marketNewsHeadlines.map(h => `- ${h}`).join('\n        ')}` : ''}

        **[종합 분석 프레임워크] (교차 검증 필수):**

        [기술적 분석]
        1. RLSI 65+ & 상승 & Breadth 70%+ → 건강한 광범위 상승, 추세 추종 유효
        2. RLSI 65+ & 상승 & Breadth 50% 미만 → 대형주 주도 상승, 쏠림 경고
        3. RLSI 65+ & 하락 → 스마트머니 매집 구간, 눌림목 매수 기회
        4. RLSI 45 이하 & 상승 → 가짜 랠리 가능, 추격 매수 금지
        5. RLSI 45 이하 & 하락 → 약세 확인, 리스크 오프

        [거시경제 판단 규칙]
        6. VIX 25+ & 공포탐욕 25 미만 → 극단적 공포, 역발상 매수 구간 검토
        7. 실질금리 2%+ (긴축) → 성장주 밸류에이션 압박, 방어주 선호
        8. 2s10s 역전 → 경기침체 경계, 은행/금융주 약세
        9. 금+TLT 동반 상승 → 안전자산 선호 (위기 신호), 주식 리스크 관리
        10. 유가 급등(+2%↑) + 금리 상승 → 인플레이션 재점화 우려, 연준 정책 변화 주시
        11. 달러(DXY) 강세 + 금 약세 → 긴축 기대, 신흥국/원자재 약세 연결
        12. 공포탐욕 75+ & VIX 15 미만 → 과열 경고, 차익실현 압력 구간
        13. BTC 급락(-3%↓) & 금 상승 → 리스크 자산 회피, 전통 안전자산 선호
        14. Breadth 약한데 지수 상승 → 소수 종목 의존, 지속 어려움

        [뉴스 해석 규칙]
        15. CPI/PPI/고용 관련 뉴스 → 금리 정책 방향 + 시장 반응 함께 평가
        16. 연준 관련 뉴스 → 금리 선물 반영 여부까지 교차 확인
        17. 지정학 뉴스 → 유가/금/달러 반응으로 실제 영향 판단

        [옵션 구조 분석 규칙 — GAMMA SHIELD]
        18. GEX +20 이상 → 딜러 감마 클램핑, 큰 변동 억제, 레인지 바운드 예상
        19. GEX -20 이하 → 딜러 매도 헤지로 하락 가속, 변동성 확대 경고, 하방 리스크 강조
        20. Squeeze 55%+ → 옵션 매도자 강제 청산 임박, 방향 불문 급변동 가능성 경고
        21. 옵션 지지선/저항선 3% 이내 접근 → 해당 레벨 돌파/이탈 시나리오 언급
        22. GEX 약(−19~+19) + Squeeze 30%+ → "감마 방어력 부족, Squeeze 에너지 축적" 언급

        ${ctx.divergenceCase && ctx.divergenceCase !== 'N' ? `
        **[출력] — DIVERGENCE 상황 전용 형식 (반드시 이 형식으로):**
        현재 ${ctx.divergenceCase === 'A' ? '\"가짜 랠리(False Rally)\"' : ctx.divergenceCase === 'B' ? '\"은밀 매집(Stealth Inflow)\"' : ctx.divergenceCase === 'C' ? '\"모멘텀 서지\"' : '\"동반 약세\"'} 패턴이 관측됩니다.
        상황: ${ctx.divergenceDesc || ''}

        자연스러운 한국어 3문장으로 작성하세요.
        - **첫 문장 (필수 — 괴리 진단으로 시작)**: "지수는 ~하고 있으나/~에도 불구하고, 내부 유동성은 ~" 형태로 **표면과 내부의 괴리를 대비**하며 시작. RLSI, Breadth, 거래량 등 괴리를 입증하는 수치를 반드시 포함. 뉴스가 있으면 괴리 발생 원인과 연결
        - **두 번째 문장 (괴리의 배경)**: 왜 이 괴리가 발생했는지 설명. ${ctx.divergenceCase === 'A' ? '소수 대형주 주도 상승인지, 숏커버 반등인지, 특정 뉴스에 의한 일시적 반등인지 판별' : ctx.divergenceCase === 'B' ? '기관이 왜 하락 구간에서 매집하는지, 밸류에이션 매력인지, 정책 기대인지 판별' : '유동성과 가격이 왜 동시에 움직이는지 분석'}. 교차 자산(금/채권/달러/VIX) 으로 뒷받침
        - **세 번째 문장 (괴리 시사점)**: 이 괴리가 지속/해소될 경우 어떤 시나리오가 전개되는지 전망. ${ctx.divergenceCase === 'A' ? '\"Breadth 참여 없는 지수 상승은 역사적으로 후행 조정 패턴\"과 같은 구체적 시사점' : ctx.divergenceCase === 'B' ? '\"유동성 유입이 가격에 선행하는 패턴으로 저점 형성 가능성\"과 같은 구체적 시사점' : '방향성 전망'}. 행동 지시 금지
        - **핵심 원칙**: 모든 문장이 **괴리(Divergence)**를 중심축으로 전개. 뉴스와 지표는 괴리의 원인/근거로만 사용
        - 전문가가 시장 상황을 객관적으로 전달하듯이 작성 (자문/권유 표현 절대 금지)
        - 공백 포함 400자 이내
        - 이모지(emoji) 사용 절대 금지. 텍스트만 사용
        ` : `
        **[출력] — "왜 시장이 이렇게 움직이는가"를 최우선으로 작성:**
        자연스러운 한국어 3문장으로 작성하세요.
        - "[진단]" "[결론]" 같은 레이블 사용 금지
        - **첫 문장 (필수)**: 오늘 시장을 움직인 **핵심 뉴스 이벤트**와 시장 반응의 **인과관계**를 명확히 서술 (예: "2월 CPI 3.2%로 예상 상회하며 6월 금리인하 기대가 후퇴, 10Y 금리 4.31%로 급등하며 성장주 중심 매도세 확산"). 뉴스를 "(뉴스 1번)" 같은 번호로 참조하지 말 것. 뉴스 내용 자체를 자연스럽게 서술
        - **두 번째 문장**: 뉴스 영향이 자산군에 어떻게 전이되었는지 교차 검증 (금/채권/유가/달러 등으로 뒷받침 + RLSI/Breadth 등 핵심 지표로 시장 상태 확인)
        - **세 번째 문장**: 향후 시장 방향의 핵심 변수와 전망 (행동 지시 금지, "~하세요" "~보류" "~권장" 표현 금지)
        - **핵심 원칙**: 지표 나열이 아닌 **뉴스→시장 반응의 인과 스토리**를 전달. 지표는 뉴스의 근거로 사용
        - 전문가가 시장 상황을 객관적으로 전달하듯이 작성 (자문/권유 표현 절대 금지)
        - 공백 포함 350자 이내
        - 이모지(emoji) 사용 절대 금지. 텍스트만 사용
        `}
    `;
    },
    en: (ctx) => {
        const assetLines: string[] = [];
        if (ctx.spxChangePct !== undefined) assetLines.push(`S&P 500: ${ctx.spxChangePct >= 0 ? '+' : ''}${ctx.spxChangePct.toFixed(2)}%`);
        if (ctx.dxy !== undefined) assetLines.push(`DXY: ${ctx.dxy.toFixed(1)}`);
        if (ctx.goldChangePct !== undefined) assetLines.push(`Gold: ${ctx.goldChangePct >= 0 ? '+' : ''}${ctx.goldChangePct.toFixed(2)}%`);
        if (ctx.oilChangePct !== undefined) assetLines.push(`Oil: ${ctx.oilChangePct >= 0 ? '+' : ''}${ctx.oilChangePct.toFixed(2)}%`);
        if (ctx.tltChangePct !== undefined) assetLines.push(`TLT: ${ctx.tltChangePct >= 0 ? '+' : ''}${ctx.tltChangePct.toFixed(2)}%`);
        if (ctx.fearGreedScore !== undefined) assetLines.push(`Fear & Greed: ${ctx.fearGreedScore.toFixed(0)} (${ctx.fearGreedRating || '?'})`);
        const assetBlock = assetLines.length > 0 ? `\n        [Cross-Asset]
        ${assetLines.map(l => `- ${l}`).join('\n        ')}` : '';

        return `
        You are a top macro strategist and market analyst. Synthesize all indicators, cross-asset flows, and news for accurate market assessment.

        **Accuracy Rules:**
        - Data overrides narrative. If numbers contradict news interpretation, trust numbers.
        - Require 2+ confirming signals before making confident calls.
        - Use hedging language ("potential", "watch for") when uncertain.

        **Current Data:**
        - RLSI: ${ctx.rlsiScore.toFixed(0)} points
        - NASDAQ: ${ctx.nasdaqChange > 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}%
        - VIX: ${ctx.vix.toFixed(1)}, RVOL: ${rvolText(ctx.rvol)}
        ${ctx.us10y !== undefined ? `- US10Y: ${ctx.us10y.toFixed(2)}%` : ''}
        ${ctx.breadthPct !== undefined ? `- Breadth: ${Math.round(ctx.breadthPct)}% [${ctx.breadthSignal || '?'}]` : ''}
        ${assetBlock}

        ${ctx.gexIndex !== undefined ? `[Gamma Shield — Options Structure]
        - GEX: ${ctx.gexIndex >= 0 ? '+' : ''}${ctx.gexIndex} (${ctx.gexLevel || 'N/A'})
        - Squeeze: ${ctx.squeezeRisk}% (${ctx.squeezeLevel || 'N/A'})
        ${ctx.triggerCurrent ? `- S&P 500: ${ctx.triggerCurrent.toLocaleString()}` : ''}
        ${ctx.triggerSupport ? `- Support: ${ctx.triggerSupport.toLocaleString()}` : ''}
        ${ctx.triggerResistance ? `- Resistance: ${ctx.triggerResistance.toLocaleString()}` : ''}` : ''}

        ${ctx.marketNewsHeadlines && ctx.marketNewsHeadlines.length > 0 ? `[News]
        ${ctx.marketNewsHeadlines.map(h => `- ${h}`).join('\n        ')}` : ''}

        ${ctx.divergenceCase && ctx.divergenceCase !== 'N' ? `
        **Output — DIVERGENCE MODE (strictly follow this format):**
        A ${ctx.divergenceCase === 'A' ? '"False Rally"' : ctx.divergenceCase === 'B' ? '"Stealth Inflow"' : ctx.divergenceCase === 'C' ? '"Momentum Surge"' : '"Synchronized Weakness"'} pattern is detected.
        Context: ${ctx.divergenceDesc || ''}

        Write 2-3 natural sentences:
        1. **First sentence (REQUIRED — lead with the divergence)**: Start with "Index is [rising/falling] but internal liquidity [contradicts]..." contrasting surface vs internals. Include RLSI, breadth, volume data proving the divergence. Connect to news if available
        2. **Second sentence (divergence cause)**: Why this divergence exists — ${ctx.divergenceCase === 'A' ? 'large-cap driven rally, short-covering bounce, or news-driven temporary rebound?' : ctx.divergenceCase === 'B' ? 'institutional accumulation at value levels, policy expectations, or sector rotation?' : 'analyze why price and liquidity are moving together'}. Cross-validate with gold/bonds/dollar/VIX
        3. **Third sentence (divergence implications)**: What happens if this divergence persists or resolves. ${ctx.divergenceCase === 'A' ? '"Narrow rallies without breadth participation historically precede corrections"' : ctx.divergenceCase === 'B' ? '"Liquidity inflows preceding price recovery suggest potential bottom formation"' : 'directional outlook'}. No action directives
        Core principle: **Every sentence must revolve around the divergence**. News and indicators serve as evidence for the divergence story.
        Max 350 chars. Do NOT use any emoji. Do NOT prefix with labels like "Market Assessment:" — start directly with analysis.
        ` : `
        **Output — "WHY is the market moving this way" is your #1 priority:**
        Write 2-3 natural sentences.
        1. **First sentence (REQUIRED)**: Identify the **key news event** driving today's market and explain the **causal chain**. Do NOT reference news by number (no "news #1"). Weave news context naturally
        2. **Second sentence**: How news impact propagated across asset classes (cross-validate with gold/bonds/oil/dollar + key indicators like RLSI/Breadth)
        3. **Third sentence**: Key variables and factual outlook (no action directives)
        Core principle: Tell the **news → market reaction causal story**, not a list of indicators. Use indicators as evidence for the narrative.
        Max 350 chars. Do NOT use any emoji. Do NOT prefix with labels like "Market Assessment:" — start directly with analysis.
        `}
    `;
    },
    ja: (ctx) => {
        const assetLines: string[] = [];
        if (ctx.spxChangePct !== undefined) assetLines.push(`S&P 500: ${ctx.spxChangePct >= 0 ? '+' : ''}${ctx.spxChangePct.toFixed(2)}%`);
        if (ctx.dxy !== undefined) assetLines.push(`DXY: ${ctx.dxy.toFixed(1)}`);
        if (ctx.goldChangePct !== undefined) assetLines.push(`金: ${ctx.goldChangePct >= 0 ? '+' : ''}${ctx.goldChangePct.toFixed(2)}%`);
        if (ctx.oilChangePct !== undefined) assetLines.push(`原油: ${ctx.oilChangePct >= 0 ? '+' : ''}${ctx.oilChangePct.toFixed(2)}%`);
        if (ctx.tltChangePct !== undefined) assetLines.push(`TLT: ${ctx.tltChangePct >= 0 ? '+' : ''}${ctx.tltChangePct.toFixed(2)}%`);
        if (ctx.fearGreedScore !== undefined) assetLines.push(`恐怖貪欲: ${ctx.fearGreedScore.toFixed(0)} (${ctx.fearGreedRating || '?'})`);
        const assetBlock = assetLines.length > 0 ? `\n        [グローバル資産]
        ${assetLines.map(l => `- ${l}`).join('\n        ')}` : '';

        return `
        あなたはトップマクロ戦略家です。全指標、クロスアセット、ニュースを総合して正確な市場分析を提供します。

        **精度ルール:**
        - データはナラティブに優先。数値とニュース解釈が矛盾する場合、数値を信頼。
        - 2つ以上の確認シグナルがある場合のみ確信ある判断。

        **現在のデータ:**
        - RLSI: ${ctx.rlsiScore.toFixed(0)}点
        - NASDAQ: ${ctx.nasdaqChange > 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}%
        - VIX: ${ctx.vix.toFixed(1)}, RVOL: ${rvolText(ctx.rvol)}
        ${ctx.us10y !== undefined ? `- US10Y: ${ctx.us10y.toFixed(2)}%` : ''}
        ${ctx.breadthPct !== undefined ? `- Breadth: ${Math.round(ctx.breadthPct)}% [${ctx.breadthSignal || '?'}]` : ''}
        ${assetBlock}

        ${ctx.gexIndex !== undefined ? `[ガンマシールド — オプション構造]
        - GEX: ${ctx.gexIndex >= 0 ? '+' : ''}${ctx.gexIndex} (${ctx.gexLevel || 'N/A'})
        - スクイーズ: ${ctx.squeezeRisk}% (${ctx.squeezeLevel || 'N/A'})
        ${ctx.triggerCurrent ? `- S&P 500: ${ctx.triggerCurrent.toLocaleString()}` : ''}
        ${ctx.triggerSupport ? `- サポート: ${ctx.triggerSupport.toLocaleString()}` : ''}
        ${ctx.triggerResistance ? `- レジスタンス: ${ctx.triggerResistance.toLocaleString()}` : ''}` : ''}

        ${ctx.marketNewsHeadlines && ctx.marketNewsHeadlines.length > 0 ? `[ニュース]
        ${ctx.marketNewsHeadlines.map(h => `- ${h}`).join('\n        ')}` : ''}

        ${ctx.divergenceCase && ctx.divergenceCase !== 'N' ? `
        **出力 — DIVERGENCE専用形式（必ずこの形式で）:**
        現在 ${ctx.divergenceCase === 'A' ? '「偽のラリー(False Rally)」' : ctx.divergenceCase === 'B' ? '「ステルス流入(Stealth Inflow)」' : ctx.divergenceCase === 'C' ? '「モメンタムサージ」' : '「同時弱体化」'} パターンが観測されています。
        状況: ${ctx.divergenceDesc || ''}

        自然な日本語3文で作成:
        1. **第1文（必須 — 乖離の診断で開始）**: 「指数は~しているが、内部流動性は~」の形で**表面と内部の乖離を対比**して開始。RLSI、Breadth、出来高等の乖離を証明するデータを必ず含む
        2. **第2文（乖離の背景）**: なぜこの乖離が発生しているか。クロスアセット（金/債券/ドル/VIX）で裏付け
        3. **第3文（乖離の示唆）**: この乖離が持続/解消した場合のシナリオ。行動指示禁止
        核心原則: **全ての文が乖離(Divergence)を中心軸**に展開。ニュースと指標は乖離の原因/根拠としてのみ使用。
        350字以内。絵文字使用禁止。
        ` : `
        **出力 — 「なぜ市場がこう動いているのか」を最優先で記述:**
        自然な日本語3文で作成してください。
        1. **第1文（必須）**: 本日の市場を動かした**核心ニュースイベント**と市場反応の**因果関係**を明確に記述。ニュースを番号で参照しないこと。自然に文脈に織り込む
        2. **第2文**: ニュースの影響が資産クラスにどう波及したか（金/債券/原油/ドルで交差検証 + RLSI/Breadth等の核心指標）
        3. **第3文**: 核心変数と今後の見通し（行動指示禁止）
        核心原則: 指標の羅列ではなく**ニュース→市場反応の因果ストーリー**を伝達。指標はナラティブの根拠として使用。
        350字以内。絵文字使用禁止。
        `}
    `;
    }
};

// [V9.1] Translation helper — translates cached Korean insight to target locale
const LOCALE_NAMES: Record<Locale, string> = { ko: 'Korean', en: 'English', ja: 'Japanese' };

async function translateInsight(koreanText: string, targetLocale: Locale, type: 'rotation' | 'reality' | 'gamma'): Promise<string | null> {
    try {
        const prompt = type === 'rotation'
            ? `Translate the following Korean market rotation analysis to ${LOCALE_NAMES[targetLocale]}. Keep the same format ([Status]/[Interpretation]/[Outlook] for English, [現況]/[解釈]/[見通し] for Japanese). Keep it concise, 3 lines max. Maintain financial terminology accuracy.\n\nKorean text:\n${koreanText}`
            : type === 'reality'
            ? `Translate the following Korean market analysis to natural ${LOCALE_NAMES[targetLocale]}. Do NOT use labels like [Diagnosis] or [Conclusion]. Write 2-3 natural sentences as a professional market strategist providing factual observations, not action recommendations. Keep financial terms accurate. Max 200 characters for English, 250 characters for Japanese.\n\nKorean text:\n${koreanText}`
            : `Translate the following Korean options market volatility analysis to ${LOCALE_NAMES[targetLocale]}. Write 2-3 natural sentences as a professional options strategist. Maintain accuracy for option terms (GEX, Squeeze, Cushion, Floor, Wall). Keep the tone informative and objective. Max 200 characters for English, 250 characters for Japanese.\n\nKorean text:\n${koreanText}`;

        const result = await callBedrock({
            modelId: MODELS.HAIKU_35,
            system: 'You are an expert financial translator.',
            userPrompt: prompt,
            maxTokens: 500,
            temperature: 0.3,
            jsonPrefill: false,
            fallbackModel: null,
            label: `Translate/${type}/${targetLocale}`,
        });

        const text = result.text?.trim();
        if (text && text.length > 10) {
            console.log(`[IntelligenceNode V9.1] Translated ${type} ko→${targetLocale} (${text.length} chars)`);
            return text;
        }
    } catch (e) {
        console.warn(`[IntelligenceNode V9.1] Translation failed (${type} → ${targetLocale}):`, e);
    }
    return null;
}

export class IntelligenceNode {

    static async generateRotationInsight(ctx: IntelligenceContext): Promise<string> {
        const locale = ctx.locale || 'ko';
        const now = Date.now();
        const ttl = isOffHours() ? OFF_HOURS_TTL : ROTATION_TTL_NORMAL;

        if (_cachedRotation[locale] && (now - _lastRotationTime[locale] < ttl)) {
            return _cachedRotation[locale]!;
        }

        // [FIX] Redis TTL check — prevents Gemini call on every Vercel cold start
        // In-memory cache resets on cold start, but Redis persists
        if (!_cachedRotation[locale] || (now - _lastRotationTime[locale] >= ttl)) {
            try {
                const redisCache = await loadInsightFromRedis(getRedisKey('rotation', locale));
                if (redisCache) {
                    // [FIX] Skip off-hours cached content during active hours
                    if (!isOffHours() && isOffHoursContent(redisCache)) {
                        console.log(`[IntelligenceNode] Skipping stale off-hours rotation cache for ${locale} — regenerating`);
                        // Fall through to AI generation
                    } else {
                    // Check Redis updatedAt to see if within TTL
                    const redis = getRedis();
                    if (redis) {
                        const raw = await redis.get(getRedisKey('rotation', locale)) as { text: string; updatedAt: string } | null;
                        if (raw?.updatedAt) {
                            const cacheAge = now - new Date(raw.updatedAt).getTime();
                            if (cacheAge < ttl) {
                                console.log(`[IntelligenceNode] Redis cache hit for rotation/${locale} (age: ${(cacheAge/1000).toFixed(0)}s, TTL: ${ttl/1000}s)`);
                                _cachedRotation[locale] = redisCache;
                                _lastRotationTime[locale] = new Date(raw.updatedAt).getTime();
                                return redisCache;
                            }
                        }
                    }
                    }
                }
            } catch (e) { /* Redis check failed, proceed to generate */ }
        }

        if (isOffHours()) {
            console.log(`[IntelligenceNode] Off-hours: skipping Gemini call for Rotation (${locale})`);
            if (_cachedRotation[locale]) return _cachedRotation[locale]!;
            const redisCache = await loadInsightFromRedis(getRedisKey('rotation', locale));
            if (redisCache) {
                _cachedRotation[locale] = redisCache;
                return redisCache;
            }
            // [V9.1] Fallback: translate from Korean cache
            if (locale !== 'ko') {
                const koCache = _cachedRotation['ko'] || await loadInsightFromRedis(getRedisKey('rotation', 'ko'));
                if (koCache) {
                    const translated = await translateInsight(koCache, locale, 'rotation');
                    if (translated) {
                        _cachedRotation[locale] = translated;
                        _lastRotationTime[locale] = Date.now();
                        saveInsightToRedis(getRedisKey('rotation', locale), translated);
                        return translated;
                    }
                }
            }
            return OFF_HOURS_ROTATION[locale];
        }

        if (!process.env.AWS_ACCESS_KEY_ID) return "SETUP REQUIRED: ADD AWS_ACCESS_KEY_ID";

        // ETF ID → sector name conversion (e.g. SMH → 반도체, HACK → 사이버보안)
        const etfToName = (id: string): string => SECTOR_MAP[id]?.name || id;
        const vectorDesc = ctx.vectors.length > 0
            ? ctx.vectors.slice(0, 3).map(v => `${etfToName(v.source)}->${etfToName(v.target)}`).join(", ")
            : "No significant rotation";

        const prompt = ROTATION_PROMPTS[locale](ctx, vectorDesc);
        const result = await IntelligenceNode.callClaude(prompt, `ROTATION_${locale}`, MODELS.HAIKU_35);

        if (result && !result.includes("failed")) {
            _cachedRotation[locale] = result;
            _lastRotationTime[locale] = Date.now();
            saveInsightToRedis(getRedisKey('rotation', locale), result);
        }
        return result;
    }

    static async generateRealityInsight(ctx: IntelligenceContext): Promise<string> {
        const locale = ctx.locale || 'ko';
        const now = Date.now();
        const ttl = isOffHours() ? OFF_HOURS_TTL : REALITY_TTL_NORMAL;

        if (_cachedReality[locale] && (now - _lastRealityTime[locale] < ttl)) {
            return _cachedReality[locale]!;
        }

        // [FIX] Redis TTL check — prevents Gemini call on every Vercel cold start
        if (!_cachedReality[locale] || (now - _lastRealityTime[locale] >= ttl)) {
            try {
                const redisCache = await loadInsightFromRedis(getRedisKey('reality', locale));
                if (redisCache) {
                    // [FIX] Skip off-hours cached content during active hours
                    if (!isOffHours() && isOffHoursContent(redisCache)) {
                        console.log(`[IntelligenceNode] Skipping stale off-hours reality cache for ${locale} — regenerating`);
                        // Fall through to AI generation
                    } else {
                    const redis = getRedis();
                    if (redis) {
                        const raw = await redis.get(getRedisKey('reality', locale)) as { text: string; updatedAt: string } | null;
                        if (raw?.updatedAt) {
                            const cacheAge = now - new Date(raw.updatedAt).getTime();
                            if (cacheAge < ttl) {
                                console.log(`[IntelligenceNode] Redis cache hit for reality/${locale} (age: ${(cacheAge/1000).toFixed(0)}s, TTL: ${ttl/1000}s)`);
                                _cachedReality[locale] = redisCache;
                                _lastRealityTime[locale] = new Date(raw.updatedAt).getTime();
                                return redisCache;
                            }
                        }
                    }
                    }
                }
            } catch (e) { /* Redis check failed, proceed to generate */ }
        }

        if (isOffHours()) {
            console.log(`[IntelligenceNode] Off-hours: skipping Claude call for Reality (${locale})`);
            if (_cachedReality[locale]) return _cachedReality[locale]!;
            const redisCache = await loadInsightFromRedis(getRedisKey('reality', locale));
            if (redisCache) {
                _cachedReality[locale] = redisCache;
                return redisCache;
            }
            // [V9.1] Fallback: translate from Korean cache
            if (locale !== 'ko') {
                const koCache = _cachedReality['ko'] || await loadInsightFromRedis(getRedisKey('reality', 'ko'));
                if (koCache) {
                    const translated = await translateInsight(koCache, locale, 'reality');
                    if (translated) {
                        _cachedReality[locale] = translated;
                        _lastRealityTime[locale] = Date.now();
                        saveInsightToRedis(getRedisKey('reality', locale), translated);
                        return translated;
                    }
                }
            }
            return OFF_HOURS_REALITY[locale];
        }

        if (!process.env.AWS_ACCESS_KEY_ID) return "SETUP REQUIRED: ADD AWS_ACCESS_KEY_ID";

        const prompt = REALITY_PROMPTS[locale](ctx);
        // [V11.1] Reality Insight downgraded to Haiku 4.5 — 350-char output, sufficient quality, 1/3 cost
        const result = await IntelligenceNode.callClaude(prompt, `REALITY_${locale}`, MODELS.HAIKU_35);

        if (result && !result.includes("failed")) {
            _cachedReality[locale] = result;
            _lastRealityTime[locale] = Date.now();
            saveInsightToRedis(getRedisKey('reality', locale), result);
        }
        return result;
    }

    static async generateGammaInsight(ctx: IntelligenceContext): Promise<string> {
        const locale = ctx.locale || 'ko';
        const now = Date.now();
        
        // Use standard isOffHours gating to align with other AI engines
        const ttl = isOffHours() ? OFF_HOURS_TTL : GAMMA_TTL_NORMAL;

        if (_cachedGamma[locale] && (now - _lastGammaTime[locale] < ttl)) {
            return _cachedGamma[locale]!;
        }

        if (!_cachedGamma[locale] || (now - _lastGammaTime[locale] >= ttl)) {
            try {
                const redisCache = await loadInsightFromRedis(getRedisKey('gamma', locale));
                if (redisCache) {
                    const redis = getRedis();
                    if (redis) {
                        const raw = await redis.get(getRedisKey('gamma', locale)) as { text: string; updatedAt: string } | null;
                        if (raw?.updatedAt) {
                            const cacheAge = now - new Date(raw.updatedAt).getTime();
                            if (cacheAge < ttl) {
                                console.log(`[IntelligenceNode] Redis cache hit for gamma/${locale} (age: ${(cacheAge/1000).toFixed(0)}s, TTL: ${ttl/1000}s)`);
                                _cachedGamma[locale] = redisCache;
                                _lastGammaTime[locale] = new Date(raw.updatedAt).getTime();
                                return redisCache;
                            }
                        }
                    }
                }
            } catch (e) { /* ignore */ }
        }

        // If it's Off-hours (weekends, nights): 
        // DO NOT call Claude API. Use existing cache or fallbacks.
        if (isOffHours()) {
            console.log(`[IntelligenceNode] Off-hours: skipping Claude call for Gamma (${locale})`);
            if (_cachedGamma[locale]) return _cachedGamma[locale]!;
            const redisCache = await loadInsightFromRedis(getRedisKey('gamma', locale));
            if (redisCache) {
                _cachedGamma[locale] = redisCache;
                return redisCache;
            }
            if (locale !== 'ko') {
                const koCache = _cachedGamma['ko'] || await loadInsightFromRedis(getRedisKey('gamma', 'ko'));
                if (koCache) {
                    const translated = await translateInsight(koCache, locale, 'gamma');
                    if (translated) {
                        _cachedGamma[locale] = translated;
                        _lastGammaTime[locale] = Date.now();
                        saveInsightToRedis(getRedisKey('gamma', locale), translated);
                        return translated;
                    }
                }
            }
            return OFF_HOURS_GAMMA[locale];
        }

        if (!process.env.AWS_ACCESS_KEY_ID) return "SETUP REQUIRED: ADD AWS_ACCESS_KEY_ID";

        const prompt = GAMMA_PROMPTS[locale](ctx);
        const result = await IntelligenceNode.callClaude(prompt, `GAMMA_${locale}`, MODELS.HAIKU_35);

        if (result && !result.includes("failed")) {
            _cachedGamma[locale] = result;
            _lastGammaTime[locale] = Date.now();
            saveInsightToRedis(getRedisKey('gamma', locale), result);
        }
        return result;
    }

    private static async callClaude(prompt: string, cacheKeySuffix: string, modelId: string = MODELS.HAIKU_35): Promise<string> {
        try {
            const result = await callBedrock({
                modelId,
                system: 'You are an institutional investment strategist. Provide concise, data-driven market analysis. Do NOT use any emoji or special unicode symbols. Use plain text only. COMPLIANCE: You are an OBSERVER — use ONLY observational language (observed, noted, indicates, suggests). NEVER use predictive language (will, should, recommended, expected to). No investment advice or action directives.',
                userPrompt: prompt,
                maxTokens: 1024,
                temperature: 0.2,
                timeoutMs: 30000,
                fallbackModel: null,
                jsonPrefill: false,
                label: `Guardian/${cacheKeySuffix}`,
            });

            const text = result.text?.trim();
            if (text && text.length > 10) {
                return text;
            }
        } catch (e: any) {
            console.error(`[IntelligenceNode] callClaude failed (${cacheKeySuffix}):`, e.message);
        }
        return "Insight generation failed. Market unstable.";
    }
}
