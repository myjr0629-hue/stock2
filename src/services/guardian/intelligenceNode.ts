
import { GoogleGenAI } from "@google/genai";
import * as fs from 'fs';
import * as path from 'path';

// Robust API Key Loader
const getApiKey = (): string => {
    // 1. Try Process Env (SWAPPED: Use NEWS KEY for Verdict)
    if (process.env.GEMINI_NEWS_KEY) return process.env.GEMINI_NEWS_KEY;
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
    if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY;

    // 2. Try Manual File Read (.env.local)
    try {
        const envPath = path.join(process.cwd(), '.env.local');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            const lines = content.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                // Match key=value (Prioritize VERDICT_KEY)
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
// Use New SDK Client
const genAI = new GoogleGenAI({ apiKey: API_KEY });

interface IntelligenceContext {
    rlsiScore: number;
    nasdaqChange: number;
    vectors: { source: string, target: string, strength: number }[];
    rvol: number; // Nasdaq RVOL
    vix: number;
}

// === INTELLIGENCE CACHE SYSTEM ===
// Rotation: Fast-moving (2 mins)
let _cachedRotation: string | null = null;
let _lastRotationTime = 0;
const ROTATION_TTL = 2 * 60 * 1000;

// Reality: Slow-moving Deep Insight (10 mins)
let _cachedReality: string | null = null;
let _lastRealityTime = 0;
const REALITY_TTL = 10 * 60 * 1000;

export class IntelligenceNode {

    /**
     * [PART 1] TACTICAL ROTATION (Sidebar)
     * Focus: Sector Rotation & Money Flow.
     */
    static async generateRotationInsight(ctx: IntelligenceContext): Promise<string> {
        // Cache Check
        const now = Date.now();
        if (_cachedRotation && (now - _lastRotationTime < ROTATION_TTL)) {
            return _cachedRotation;
        }

        const apiKey = getApiKey();
        if (!apiKey) return "SETUP REQUIRED: ADD GEMINI_API_KEY";

        const vectorDesc = ctx.vectors.length > 0
            ? ctx.vectors.slice(0, 3).map(v => `${v.source}->${v.target}`).join(", ")
            : "No significant rotation";

        const prompt = `
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

        **예시:**
        [현황] 부동산/헬스케어에서 에너지/AI인프라로 자금 이동 중
        [해석] Risk-On 순환매, 성장주 선호 심화
        [액션] AI/에너지 섹터 ETF 비중 확대 유효

        **규칙:**
        - 한국어 전문가 스타일
        - 섹터명은 한글 (기술주, 에너지, 부동산 등)
        - 3줄 이내, 간결하게
        `;

        const result = await this.callGemini(prompt, "ROTATION");
        if (result && !result.includes("failed")) {
            _cachedRotation = result;
            _lastRotationTime = Date.now();
        }
        return result;
    }

    /**
     * [PART 2] REALITY CHECK (Center)
     * Focus: RLSI vs Price (Market Essence).
     */
    static async generateRealityInsight(ctx: IntelligenceContext): Promise<string> {
        // Cache Check
        const now = Date.now();
        if (_cachedReality && (now - _lastRealityTime < REALITY_TTL)) {
            return _cachedReality;
        }

        const apiKey = getApiKey();
        if (!apiKey) return "SETUP REQUIRED: ADD GEMINI_API_KEY";

        const prompt = `
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

        **예시:**
        [진단] NASDAQ +0.85% 상승에도 RLSI 45점으로 유동성 부족
        [결론] 상승의 지속 가능성 낮음, 추격 매수 자제 권장

        **규칙:**
        - 한국어, 명확하고 간결하게
        - 2줄 이내
        `;

        const result = await this.callGemini(prompt, "REALITY");
        if (result && !result.includes("failed")) {
            _cachedReality = result;
            _lastRealityTime = Date.now();
        }
        return result;
    }

    // Shared Helper for API Calls
    private static async callGemini(prompt: string, cacheKeySuffix: string): Promise<string> {
        // Simple Memory Cache (Map)
        // Note: In serverless, static props persist per instance.
        // We'll use a global var pattern if needed, but simple separate cache keys are fine.

        // Retry Logic
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
