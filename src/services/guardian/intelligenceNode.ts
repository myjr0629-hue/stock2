
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
        ACT AS AN ELITE INSTITUTIONAL STRATEGIST (WALL STREET VETERAN).
        ANALYZE SECTOR ROTATION WITH HIGH-RESOLUTION PRECISION.
        
        MARKET DATA:
        - NASDAQ CHANGE: ${ctx.nasdaqChange.toFixed(2)}%
        - FLOW VECTORS: [${vectorDesc}]
        - VIX: ${ctx.vix}

        TASK:
        Provide a professional analysis of money flow.
        - Is this a "Risk-On" rotation into Tech/Cyclicals?
        - Is this a "Flight to Safety" (Risk-Off) into Utilities/Staples?
        - Is liquidity concentrating in specific themes (e.g., AI Infra)?
        
        CRITICAL OUTPUT RULES:
        1. **VOICE**: PROFESSIONAL, ANALYTICAL, SHARP. Use industry-standard terminology (Risk-On, Beta, Sector Rotation).
        2. **TONE**: Confident but grounded in data. Avoid "Commander" drama, use "Analyst" precision.
        3. **NO TICKER SYMBOLS**: Use Korean sector names only (기술주, 헬스케어, etc.).
        4. **AI INFRA**: If 'AI 전력망' is active, explicitly mention "AI 인프라 슈퍼사이클에 따른 수급 집중".
        5. **Lang**: Korean (High-level Expert Style - e.g., "판단됩니다" is okay here if backed by strong logic, or "관측됩니다").
        6. **Length**: 2-3 sentences. Dense with insight.
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
        ACT AS "THE ORACLE OF TRUTH".
        YOUR MISSION: REVEAL THE CORE REALITY BEHIND THE PRICE.
        
        MARKET DATA:
        - RLSI (Internal Truth): ${ctx.rlsiScore.toFixed(0)}/100.
        - PRICE (External Mask): ${ctx.nasdaqChange.toFixed(2)}%.
        - RVOL (Conviction): ${ctx.rvol.toFixed(2)}x.
        
        TASK:
        Compare Price vs RLSI and DECLARE the verdict.
        
        CONTEXTUAL VOCABULARY RULE (CRITICAL):
        1. **IF ALIGNED (Good)**: Use "입증합니다 (Prove)", "확증합니다 (Confirm)", "지목합니다 (Point to)". 
           - Example: "내부 데이터가 상승의 정당성을 입증합니다."
           - BAD Example: "견고함을 폭로합니다" (Awkward).
        2. **IF DIVERGENT (Bad/Fake)**: Use "폭로합니다 (Expose)", "경고합니다 (Warn)", "간파했습니다 (Detected)".
           - Example: "상승의 허구성을 폭로합니다."
        
        SCENARIOS:
        - Price UP / RLSI LOW: "지수의 상승은 기만입니다 (DECEPTION). 내부는 썩어가고 있음을 폭로합니다."
        - Price DOWN / RLSI HIGH: "하락은 속임수입니다 (TRAP). 세력은 바닥을 쓸어담고 있음을 간파했습니다."
        - Both ALIGN: "시장의 방향성은 진실입니다 (TRUE). 상승/하락 추세가 데이터로 확증되었습니다."
        
        OUTPUT RULES:
        1. **VOICE**: PROPHETIC, ABSOLUTE, BUT NATURAL.
        2. **Lang**: Korean (High-Impact).
        3. **Structure**: [Fact] -> [Revelation]. 2 sentences.
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
