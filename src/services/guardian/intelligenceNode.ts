
import { GoogleGenAI } from "@google/genai";
import { Redis } from "@upstash/redis";
import * as fs from 'fs';
import * as path from 'path';

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

// Save insight to Redis (for persistence across cold starts)
async function saveInsightToRedis(key: string, text: string): Promise<void> {
    try {
        const redis = getRedis();
        if (!redis) return;
        await redis.set(key, JSON.stringify({
            text,
            updatedAt: new Date().toISOString()
        }), { ex: 43200 }); // 12 hour expiry
        console.log(`[IntelligenceNode] Saved ${key} to Redis`);
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
            return data.text;
        }
    } catch (e) {
        console.warn("[IntelligenceNode] Redis load error:", e);
    }
    return null;
}

// Robust API Key Loader
const getApiKey = (): string => {
    if (process.env.GEMINI_NEWS_KEY) return process.env.GEMINI_NEWS_KEY;
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
    if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY;

    try {
        const envPath = path.join(process.cwd(), '.env.local');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            const lines = content.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('GEMINI_VERDICT_KEY=')) {
                    return trimmed.split('=')[1].trim();
                }
                if (trimmed.startsWith('GEMINI_API_KEY=')) {
                    return trimmed.split('=')[1].trim();
                }
                if (trimmed.startsWith('GOOGLE_API_KEY=')) {
                    return trimmed.split('=')[1].trim();
                }
            }
        }
    } catch (e) {
        console.warn("[IntelligenceNode] Failed to read .env.local manually:", e);
    }
    return "";
};

const API_KEY = getApiKey();
const genAI = new GoogleGenAI({ apiKey: API_KEY });

interface IntelligenceContext {
    rlsiScore: number;
    nasdaqChange: number;
    vectors: { source: string, target: string, strength: number }[];
    rvol: number;
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

// === CACHE SYSTEM (per locale) ===
const ROTATION_TTL_NORMAL = 2 * 60 * 1000;
const REALITY_TTL_NORMAL = 10 * 60 * 1000;
const OFF_HOURS_TTL = 12 * 60 * 60 * 1000;

const _cachedRotation: Record<Locale, string | null> = { ko: null, en: null, ja: null };
const _lastRotationTime: Record<Locale, number> = { ko: 0, en: 0, ja: 0 };
const _cachedReality: Record<Locale, string | null> = { ko: null, en: null, ja: null };
const _lastRealityTime: Record<Locale, number> = { ko: 0, en: 0, ja: 0 };

// === LOCALIZED DEFAULT MESSAGES ===
const OFF_HOURS_ROTATION: Record<Locale, string> = {
    ko: "[현황] 장외 시간 - 실시간 분석 대기 중\n[해석] 프리마켓 시작 시 자동 갱신\n[액션] 다음 세션까지 기존 포지션 유지",
    en: "[Status] Off-hours - waiting for live analysis\n[Interpretation] Auto-refresh at pre-market\n[Action] Maintain current positions until next session",
    ja: "[現況] 場外時間 - リアルタイム分析待機中\n[解釈] プレマーケット開始時に自動更新\n[アクション] 次のセッションまで既存ポジション維持"
};

const OFF_HOURS_REALITY: Record<Locale, string> = {
    ko: "[진단] 장외 시간 - 시장 비활성\n[결론] 프리마켓 04:00 ET 이후 분석 재개",
    en: "[Diagnosis] Off-hours - market inactive\n[Conclusion] Analysis resumes after pre-market 04:00 ET",
    ja: "[診断] 場外時間 - 市場非活性\n[結論] プレマーケット04:00 ET以降分析再開"
};

// === LOCALIZED PROMPTS ===
const ROTATION_PROMPTS: Record<Locale, (ctx: IntelligenceContext, vectorDesc: string) => string> = {
    ko: (ctx, vectorDesc) => `
        당신은 기관 투자 전략가입니다. 5일 추세 데이터를 기반으로 정확한 순환매 분석을 제공합니다.

        **현재 데이터:**
        - NASDAQ 변동: ${ctx.nasdaqChange > 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}%
        - 오늘의 자금 흐름: [${vectorDesc}]
        - VIX: ${ctx.vix.toFixed(1)}
        - RVOL: ${ctx.rvol.toFixed(2)}x
        ${ctx.rotationRegime ? `- 5일 순환매 레짐: ${ctx.rotationRegime}` : ''}
        ${ctx.topInflow5d ? `- 5일 유입 섹터: ${ctx.topInflow5d}` : ''}
        ${ctx.topOutflow5d ? `- 5일 유출 섹터: ${ctx.topOutflow5d}` : ''}
        ${ctx.trendVsToday ? `- 당일 vs 추세 괴리: ${ctx.trendVsToday}` : ''}
        ${ctx.noiseWarning ? `- 노이즈 경고: ${ctx.noiseWarning}` : ''}
        ${ctx.rotationConviction ? `- 순환매 확신도: ${ctx.rotationConviction}` : ''}

        ${ctx.signalConflict ? `- ⚠️ 신호 충돌: ${ctx.signalConflict}` : ''}

        **중요 분석 규칙:**
        - 당일 반등이 있더라도 5일 추세가 하락이면 "일시적 반등"으로 판단
        - 5일 유입/유출 데이터가 당일 데이터보다 우선
        - 노이즈 경고가 있는 섹터는 신뢰도가 낮음을 언급
        - 레짐(RISK_OFF_DEFENSE 등)을 반영한 실질적 조언 제공
        - **신호 충돌 시**: RLSI/나스닥은 강세이나 순환매가 RISK_OFF이면 "겉은 강세, 속은 약세" 같은 표현으로 혼재 신호를 명확히 전달. 반대로 지표는 약세이나 성장주로 자금 유입 시 "저점 매집 가능성" 표현 사용

        **출력 형식 (반드시 이 형식으로):**
        [현황] (5일 기준 섹터 이동 현황 1문장)
        [해석] (의미 + 레짐 맥락 1문장, 신호 충돌 시 반드시 언급)
        [액션] (구체적 행동 지시 1문장)

        **규칙:**
        - 한국어 전문가 스타일
        - 섹터명은 한글 (기술주, 에너지, 부동산 등)
        - 3줄 이내, 간결하게
    `,
    en: (ctx, vectorDesc) => `
        You are an institutional investment strategist. Analyze sector rotation using 5-day trend data.

        **Current Data:**
        - NASDAQ Change: ${ctx.nasdaqChange > 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}%
        - Today's Money Flow: [${vectorDesc}]
        - VIX: ${ctx.vix.toFixed(1)}
        - RVOL: ${ctx.rvol.toFixed(2)}x
        ${ctx.rotationRegime ? `- 5-Day Rotation Regime: ${ctx.rotationRegime}` : ''}
        ${ctx.topInflow5d ? `- 5-Day Inflow Leaders: ${ctx.topInflow5d}` : ''}
        ${ctx.topOutflow5d ? `- 5-Day Outflow Leaders: ${ctx.topOutflow5d}` : ''}
        ${ctx.trendVsToday ? `- Today vs Trend Divergence: ${ctx.trendVsToday}` : ''}
        ${ctx.noiseWarning ? `- Noise Warning: ${ctx.noiseWarning}` : ''}
        ${ctx.rotationConviction ? `- Rotation Conviction: ${ctx.rotationConviction}` : ''}

        ${ctx.signalConflict ? `- ⚠️ Signal Conflict: ${ctx.signalConflict}` : ''}

        **Critical Analysis Rules:**
        - If today shows a bounce but 5-day trend is down, call it a "relief rally"
        - 5-day inflow/outflow data takes priority over single-day data
        - Sectors with noise warnings have low reliability
        - Reflect the regime (RISK_OFF_DEFENSE etc.) in actionable advice
        - **Signal Conflict**: When RLSI/NASDAQ are bullish but rotation is RISK_OFF, describe it as "surface strength masks underlying weakness" or similar. Conversely, when indicators are bearish but growth sees inflows, note "institutional accumulation at lows"

        **Output Format (strictly follow):**
        [Status] (1 sentence on 5-day sector movement)
        [Interpretation] (1 sentence on meaning + regime context, MUST mention signal conflicts if present)
        [Action] (1 concrete action directive)

        **Rules:**
        - Professional English briefing style
        - Be specific with sector names
        - Max 3 lines, concise
    `,
    ja: (ctx, vectorDesc) => `
        あなたは機関投資戦略家です。5日間のトレンドデータに基づいてセクターローテーションを分析します。

        **現在のデータ:**
        - NASDAQ変動: ${ctx.nasdaqChange > 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}%
        - 本日の資金フロー: [${vectorDesc}]
        - VIX: ${ctx.vix.toFixed(1)}
        - RVOL: ${ctx.rvol.toFixed(2)}x
        ${ctx.rotationRegime ? `- 5日ローテーションレジーム: ${ctx.rotationRegime}` : ''}
        ${ctx.topInflow5d ? `- 5日流入リーダー: ${ctx.topInflow5d}` : ''}
        ${ctx.topOutflow5d ? `- 5日流出リーダー: ${ctx.topOutflow5d}` : ''}
        ${ctx.trendVsToday ? `- 本日 vs トレンド: ${ctx.trendVsToday}` : ''}
        ${ctx.noiseWarning ? `- ノイズ警告: ${ctx.noiseWarning}` : ''}
        ${ctx.rotationConviction ? `- ローテーション確信度: ${ctx.rotationConviction}` : ''}

        **重要な分析ルール:**
        - 本日反発があっても5日トレンドが下降なら「一時的反発」と判断
        - 5日流入/流出データが1日データより優先
        - ノイズ警告のあるセクターは信頼性が低い
        - レジーム(RISK_OFF_DEFENSEなど)を反映した実質的なアドバイス

        **出力形式 (必ずこの形式で):**
        [現況] (5日基準セクター移動現況 1文)
        [解釈] (意味 + レジームコンテキスト 1文)
        [アクション] (具体的行動指示 1文)

        **ルール:**
        - 日本語専門家スタイル
        - セクター名は日本語（テクノロジー、エネルギー、不動産など）
        - 3行以内、簡潔に
    `
};

const REALITY_PROMPTS: Record<Locale, (ctx: IntelligenceContext) => string> = {
    ko: (ctx) => {
        // Determine market condition
        const rlsiLevel = ctx.rlsiScore >= 65 ? '건강' : ctx.rlsiScore >= 45 ? '중립' : '취약';
        const priceAction = ctx.nasdaqChange >= 0.5 ? '강세' : ctx.nasdaqChange <= -0.5 ? '약세' : '보합';
        const vixLevel = ctx.vix >= 25 ? '공포' : ctx.vix >= 18 ? '경계' : '안정';
        const rvolLevel = ctx.rvol >= 1.5 ? '폭발적' : ctx.rvol >= 1.1 ? '활발' : '저조';

        // Macro context strings
        const yieldLine = ctx.us10y !== undefined
            ? `- US10Y 금리: ${ctx.us10y?.toFixed(2)}% (변동: ${ctx.us10yChange !== undefined ? (ctx.us10yChange >= 0 ? '+' : '') + ctx.us10yChange.toFixed(2) + '%' : '?'})` : '';
        const spreadLine = ctx.spread2s10s !== undefined
            ? `- 장단기 금리차(2s10s): ${ctx.spread2s10s?.toFixed(2)}% ${ctx.spread2s10s! < 0 ? '⚠역전' : ctx.spread2s10s! < 0.25 ? '⚠축소' : '정상'}` : '';
        const realYieldLine = ctx.realYield !== undefined
            ? `- 실질금리: ${ctx.realYield?.toFixed(2)}% (${ctx.realYieldStance === 'TIGHT' ? '긴축적 → 성장주 압박' : ctx.realYieldStance === 'LOOSE' ? '완화적 → 성장주 유리' : '중립'})` : '';
        const breadthLine = ctx.breadthPct !== undefined
            ? `- 시장 광폭(Breadth): 상승 ${Math.round(ctx.breadthPct!)}% / A/D 비율 ${ctx.adRatio?.toFixed(2) || '?'} / 거래량 Breadth ${ctx.volumeBreadth?.toFixed(1) || '?'}% [${ctx.breadthSignal || '?'}]` : '';

        return `
        당신은 월가 최고의 매크로 + 기술적 분석가입니다. 모든 지표를 종합하여 투자자에게 실전 매매 인사이트를 제공합니다.

        **📊 현재 시장 데이터 — 종합 대시보드:**
        [가격 & 내부지표]
        - RLSI (시장 건강도): ${ctx.rlsiScore.toFixed(0)}점 (${rlsiLevel})
        - 나스닥: ${ctx.nasdaqChange >= 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}% (${priceAction})
        - VIX (공포지수): ${ctx.vix.toFixed(1)} (${vixLevel})
        - 거래량(RVOL): ${ctx.rvol.toFixed(2)}x (${rvolLevel})

        [매크로 환경]
        ${yieldLine}
        ${spreadLine}
        ${realYieldLine}

        [시장 참여도 — Breadth]
        ${breadthLine}

        **🎯 종합 분석 프레임워크:**
        1. RLSI 65+ & 상승 & Breadth 70%+ → 건강한 광범위 상승, 추세 추종 유효
        2. RLSI 65+ & 상승 & Breadth 50% 미만 → 대형주 주도 상승, 쏠림 경고
        3. RLSI 65+ & 하락 → 스마트머니 매집 구간, 눌림목 매수 기회
        4. RLSI 45 이하 & 상승 → 가짜 랠리 가능, 추격 매수 금지
        5. RLSI 45 이하 & 하락 → 약세 확인, 리스크 오프
        6. VIX 25+ → 공포 극대화, 역발상 매수 검토
        7. 실질금리 2%+ (긴축) → 성장주 밸류에이션 압박, 방어주 선호
        8. 2s10s 역전 → 경기침체 신호, 은행/금융주 약세
        9. Breadth 약하면서 지수 상승 → 소수 종목 의존, 지속 어려움

        **✍️ 출력 (정확히 이 형식으로):**
        현재 시장의 핵심 상태를 투자자가 바로 이해할 수 있도록 자연스러운 한국어 2-3문장으로 작성하세요.
        - "[진단]" "[결론]" 같은 레이블 사용 금지
        - 가격/RLSI/Breadth/금리 중 가장 중요한 조합을 선택해서 핵심만 전달
        - 전문가가 투자자에게 설명하듯이 작성
        - 구체적인 행동 관점 포함 (매수 유효, 관망, 리스크 관리 등)
        - 공백 포함 120자 이내

        **예시 (참고용, 그대로 복사 금지):**
        - "나스닥의 강한 상승은 긍정적이나 RLSI는 아직 중립 구간입니다. 선부른 추격매수보다 눌림목 기회를 기다리세요."
        - "광범위한 매수세(Breadth 81%)와 RLSI 동반 상승이 확인됩니다. 건강한 상승세로 추세 추종 유효합니다."
        - "지수는 상승하나 참여 종목이 40%에 불과합니다. 소수 대형주 의존 상승으로 추격보다는 선별 매수를 권장합니다."
        - "실질금리 2% 돌파와 VIX 경계 수준이 성장주에 부담입니다. 포지션 축소 또는 방어적 전환을 검토하세요."
    `;
    },
    en: (ctx) => `
        You are a market analyst. Compare price and internal indicators to analyze market essence.

        **Current Data:**
        - RLSI (internal indicator): ${ctx.rlsiScore.toFixed(0)} points
        - NASDAQ Change: ${ctx.nasdaqChange > 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}%
        - RVOL: ${ctx.rvol.toFixed(2)}x

        **Analysis Criteria:**
        - High RLSI with falling price → Accumulation zone (buying opportunity)
        - Low RLSI with rising price → Overheated/Suspicious (chase risk)
        - Both aligned → Trend valid

        **Output Format:**
        [Diagnosis] Current state in 1 line (price vs RLSI comparison)
        [Conclusion] Market essence in 1 line (truth or fiction)

        **Rules:**
        - English, clear and concise
        - 2 lines max
    `,
    ja: (ctx) => `
        あなたは市場アナリストです。価格と内部指標を比較して市場の本質を分析します。

        **現在のデータ:**
        - RLSI (内部指標): ${ctx.rlsiScore.toFixed(0)}点
        - NASDAQ変動: ${ctx.nasdaqChange > 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}%
        - RVOL: ${ctx.rvol.toFixed(2)}x

        **分析基準:**
        - RLSI高いのに価格下落 → 買い集め区間（低価買いチャンス）
        - RLSI低いのに価格上昇 → 過熱/疑惑（追撃買いリスク）
        - 両方整列 → トレンド有効

        **出力形式:**
        [診断] 現在状態 1行（価格とRLSI比較）
        [結論] 市場本質 1行（真実か虚構か）

        **ルール:**
        - 日本語、明確で簡潔に
        - 2行以内
    `
};

export class IntelligenceNode {

    static async generateRotationInsight(ctx: IntelligenceContext): Promise<string> {
        const locale = ctx.locale || 'ko';
        const now = Date.now();
        const ttl = isOffHours() ? OFF_HOURS_TTL : ROTATION_TTL_NORMAL;

        if (_cachedRotation[locale] && (now - _lastRotationTime[locale] < ttl)) {
            return _cachedRotation[locale]!;
        }

        if (isOffHours()) {
            console.log(`[IntelligenceNode] Off-hours: skipping Gemini call for Rotation (${locale})`);
            if (_cachedRotation[locale]) return _cachedRotation[locale]!;
            const redisCache = await loadInsightFromRedis(getRedisKey('rotation', locale));
            if (redisCache) {
                _cachedRotation[locale] = redisCache;
                return redisCache;
            }
            return OFF_HOURS_ROTATION[locale];
        }

        const apiKey = getApiKey();
        if (!apiKey) return "SETUP REQUIRED: ADD GEMINI_API_KEY";

        const vectorDesc = ctx.vectors.length > 0
            ? ctx.vectors.slice(0, 3).map(v => `${v.source}->${v.target}`).join(", ")
            : "No significant rotation";

        const prompt = ROTATION_PROMPTS[locale](ctx, vectorDesc);
        const result = await this.callGemini(prompt, `ROTATION_${locale}`);

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

        if (isOffHours()) {
            console.log(`[IntelligenceNode] Off-hours: skipping Gemini call for Reality (${locale})`);
            if (_cachedReality[locale]) return _cachedReality[locale]!;
            const redisCache = await loadInsightFromRedis(getRedisKey('reality', locale));
            if (redisCache) {
                _cachedReality[locale] = redisCache;
                return redisCache;
            }
            return OFF_HOURS_REALITY[locale];
        }

        const apiKey = getApiKey();
        if (!apiKey) return "SETUP REQUIRED: ADD GEMINI_API_KEY";

        const prompt = REALITY_PROMPTS[locale](ctx);
        const result = await this.callGemini(prompt, `REALITY_${locale}`);

        if (result && !result.includes("failed")) {
            _cachedReality[locale] = result;
            _lastRealityTime[locale] = Date.now();
            saveInsightToRedis(getRedisKey('reality', locale), result);
        }
        return result;
    }

    private static async callGemini(prompt: string, cacheKeySuffix: string): Promise<string> {
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            try {
                attempts++;
                const result = await genAI.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: prompt,
                });
                const text = result.text || "";
                if (text.length > 10 && !text.includes("System Busy")) {
                    return text.trim();
                }
            } catch (e: any) {
                if ((e.status === 429 || e.status === 503) && attempts < maxAttempts) {
                    await new Promise(r => setTimeout(r, 2000 * attempts));
                    continue;
                }
            }
        }
        return "Insight generation failed. Market unstable.";
    }
}
