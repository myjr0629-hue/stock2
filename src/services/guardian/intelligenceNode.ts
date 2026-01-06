
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
        ACT AS A VETERAN HEDGE FUND TRADER.
        ANALYZE SECTOR ROTATION & MONEY FLOW ONLY.
        
        MARKET DATA:
        - NASDAQ CHANGE: ${ctx.nasdaqChange.toFixed(2)}%
        - FLOW VECTORS: [${vectorDesc}]
        - VIX: ${ctx.vix}

        TASK:
        Describe WHERE the money is moving. Is it rotating into defensives? Is it chasing Tech?
        
        CRITICAL OUTPUT RULES:
        1. **NO TICKER SYMBOLS**: DO NOT use codes like XLK, XLU, XLV, XLI.
        2. **USE KOREAN NAMES**: Must use '기술주', '유틸리티', '헬스케어', '금융', '산업재' instead.
        3. Lang: Korean (Professional, Traders Talk).
        4. Detail: 2-3 sentences. Be specific about the flow direction.
        5. Tone: Fast, Observational, Tactical.
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
        ACT AS A MARKET PHILOSOPHER & STRATEGIST.
        ANALYZE THE "TRUTH" OF THE CURRENT MOVE.

        MARKET DATA:
        - RLSI (Internal Strength): ${ctx.rlsiScore.toFixed(0)}/100 (0=Weak, 100=Strong).
        - PRICE (External Move): ${ctx.nasdaqChange.toFixed(2)}%
        - RVOL (Conviction): ${ctx.rvol.toFixed(2)}x (1.0 = Avg, >1.5 = Strong).
        
        TASK:
        Compare Price vs RLSI.
        - If Price is UP but RLSI is LOW (<45): Warn about a "Empty Rally" (Fake).
        - If Price is DOWN but RLSI is HIGH (>55): Hint at "Hidden Strength" (Opportunity).
        - If Both align: Confirm "Healthy Trends".
        
        OUTPUT RULES:
        - Lang: Korean (Profound, Insightful).
        - Detail: 2-3 sentences. Explain WHY this is happening.
        - Tone: Decisive, Clear, Penetrating. (Avoid vague philosophy).
        - Directness: Be explicit about whether the move is Real or Fake.
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
