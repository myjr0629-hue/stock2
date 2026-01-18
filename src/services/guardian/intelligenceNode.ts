
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
        당신은 기관 투자 전략가입니다.

        **현재 데이터:**
        - NASDAQ 변동: ${ctx.nasdaqChange > 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}%
        - 자금 흐름: [${vectorDesc}]
        - VIX: ${ctx.vix.toFixed(1)}
        - RVOL: ${ctx.rvol.toFixed(2)}x

        **출력 형식 (반드시 이 형식으로):**
        [현황] (섹터 이동 현황 1문장)
        [해석] (의미 1문장)
        [액션] (구체적 행동 지시 1문장)

        **규칙:**
        - 한국어 전문가 스타일
        - 섹터명은 한글 (기술주, 에너지, 부동산 등)
        - 3줄 이내, 간결하게
    `,
    en: (ctx, vectorDesc) => `
        You are an institutional investment strategist.

        **Current Data:**
        - NASDAQ Change: ${ctx.nasdaqChange > 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}%
        - Money Flow: [${vectorDesc}]
        - VIX: ${ctx.vix.toFixed(1)}
        - RVOL: ${ctx.rvol.toFixed(2)}x

        **Output Format (strictly follow):**
        [Status] (sector rotation status in 1 sentence)
        [Interpretation] (meaning in 1 sentence)
        [Action] (specific action directive in 1 sentence)

        **Rules:**
        - Professional English style
        - Use sector names like Tech, Energy, Real Estate
        - 3 lines max, concise
    `,
    ja: (ctx, vectorDesc) => `
        あなたは機関投資戦略家です。

        **現在のデータ:**
        - NASDAQ変動: ${ctx.nasdaqChange > 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}%
        - 資金フロー: [${vectorDesc}]
        - VIX: ${ctx.vix.toFixed(1)}
        - RVOL: ${ctx.rvol.toFixed(2)}x

        **出力形式 (必ずこの形式で):**
        [現況] (セクター移動現況 1文)
        [解釈] (意味 1文)
        [アクション] (具体的行動指示 1文)

        **ルール:**
        - 日本語専門家スタイル
        - セクター名は日本語（テクノロジー、エネルギー、不動産など）
        - 3行以内、簡潔に
    `
};

const REALITY_PROMPTS: Record<Locale, (ctx: IntelligenceContext) => string> = {
    ko: (ctx) => `
        당신은 시장 분석가입니다. 가격과 내부 지표를 비교하여 시장의 본질을 분석합니다.

        **현재 데이터:**
        - RLSI (내부 지표): ${ctx.rlsiScore.toFixed(0)}점
        - NASDAQ 변동: ${ctx.nasdaqChange > 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}%
        - RVOL: ${ctx.rvol.toFixed(2)}x

        **분석 기준:**
        - RLSI 높은데 가격 하락 → 매집 구간 (저가 매수 기회)
        - RLSI 낮은데 가격 상승 → 과열/의심 (추격 매수 위험)
        - 둘 다 정렬 → 추세 유효

        **출력 형식:**
        [진단] 현재 상태 1줄 (가격과 RLSI 비교)
        [결론] 시장 본질 1줄 (진실인지 허구인지)

        **규칙:**
        - 한국어, 명확하고 간결하게
        - 2줄 이내
    `,
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
