
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

// === VERDICT CACHE (Prevents 429 Rate Limiting) ===
let _cachedVerdict: string | null = null;
let _cachedVerdictTime: number = 0;
const VERDICT_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes (strict)

export class IntelligenceNode {

    /**
     * Generate a ruthless, professional tactical verdict.
     * Model Locked: gemini-2.5-flash (Supported by New SDK)
     * NOTE: This method has a 2-minute cache to prevent API rate limiting.
     */
    static async generateVerdict(ctx: IntelligenceContext): Promise<string> {
        // === CACHE CHECK (Priority) ===
        const now = Date.now();
        if (_cachedVerdict && (now - _cachedVerdictTime < VERDICT_CACHE_TTL_MS)) {
            console.log("[IntelligenceNode] Returning CACHED Verdict (TTL Active).");
            return _cachedVerdict;
        }
        // API Key check (User provided key: AIza... starts with AIza, length check)
        const apiKey = getApiKey();
        if (!apiKey) return "SYSTEM_OFFLINE: INTELLIGENCE MODULE DISCONNECTED (NO API KEY).";

        const vectorDesc = ctx.vectors.length > 0
            ? ctx.vectors.slice(0, 2).map(v => `${v.source}->${v.target}(${v.strength}%)`).join(", ")
            : "No significant flow";

        const prompt = `
        ACT AS A VETERAN MARKET STRATEGIST EXPLAINING TO A WEALTHY CLIENT.
        BE INSIGHTFUL BUT CLEAR. AVOID CRYPTIC JARGON.

        ANALYZE THIS MARKET SNAPSHOT:
        1. Internal Health (RLSI): ${ctx.rlsiScore.toFixed(0)}/100 (0=CRASH, 100=EUPHORIA).
        2. External Price (NASDAQ): ${ctx.nasdaqChange.toFixed(2)}%.
        3. REALITY CHECK (RVOL): ${ctx.rvol.toFixed(2)}x.
           - Note: If RVOL is near 0.00x, it implies 'Data Unavailable' or 'Pre-market', DO NOT over-interpret as 'apathy'.
           - RVOL > 1.5: Strong Conviction.
        4. SMART MONEY FLOW (VECTORS): [${vectorDesc}].
           - Convert Sector Codes to Names (e.g., XLK -> Tech, XLF -> Financials).
        5. FEAR (VIX): ${ctx.vix}.

        INSIGHT PROTOCOL:
        - LOOK FOR DIVERGENCES: Is the Index UP but RVOL LOW? -> "Fake Rally".
        - IS MONEY MOVING? If Index is flat but Vectors are strong -> "Sector Rotation".
        - IF RLSI is < 30 but RVOL > 1.2 -> "Smart money is bottom fishing".
        
        OUTPUT FORMAT:
        - A single, clear, high-impact sentence.
        - **TONE**: Professional, Sharp, but Easy to Understand. (Avoid 'translated' feel).
        - **LANGUAGE**: Natural Korean. (e.g., "표면적인 지수 상승에 속지 마십시오. 거래량이 받쳐주지 않는 상승은..." instead of "면적인...").
        - **CONTENT**: If citing sectors, use Korean names (금융, 기술 등).
        `;

        // Retry Logic for Rate Limits (429) - 3 Attempts
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            try {
                attempts++;
                // STRICT: gemini-2.5-flash using New SDK
                const result = await genAI.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: prompt,
                });

                // New SDK response structure
                console.log("[DEBUG] GenAI Result Keys:", Object.keys(result));
                const generatedText = result.text || "";

                // === CACHE UPDATE (Only cache valid responses) ===
                if (generatedText && generatedText.length > 20 && !generatedText.includes("System Busy")) {
                    _cachedVerdict = generatedText;
                    _cachedVerdictTime = Date.now();
                    console.log("[IntelligenceNode] Verdict CACHED for 2 minutes.");
                }

                return generatedText || "Market Data processed.";
            } catch (e: any) {
                console.error(`[IntelligenceNode] Attempt ${attempts} Failed (Model: 2.5-flash):`, e.message);

                // If 429 or 503, wait and retry
                if ((e.status === 429 || e.status === 503) && attempts < maxAttempts) {
                    const delay = Math.pow(2, attempts) * 1000; // 2s, 4s, 8s...
                    console.warn(`[IntelligenceNode] Rate Limited. Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // If not retryable or max attempts reached, check if we should fallback?
                // For now, return friendly error.
                if (attempts === maxAttempts) {
                    return `System Busy: High Intelligence Traffic. (Code: ${e.status || 'ERR'})`;
                }
            }
        }
        return "Market Data processed. Maintain discipline.";
    }
}
