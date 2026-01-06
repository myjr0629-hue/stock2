
// Standalone Verification Script for IntelligenceNode (New SDK)
const { GoogleGenAI } = require("@google/genai");
const fs = require('fs');
const path = require('path');

// Mock Context
const ctx = {
    rlsiScore: 50,
    nasdaqChange: 1.2,
    vectors: [],
    rvol: 2.0,
    vix: 15
};

async function test() {
    console.log("Starting Intelligence Verification...");

    // Manual Key Load
    const envPath = path.join(process.cwd(), '.env.local');
    let key = "";
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.trim().startsWith('GEMINI_NEWS_KEY=')) {
                key = line.split('=')[1].trim();
                break;
            }
        }
    }

    if (!key) {
        console.error("No Key Found in .env.local");
        return;
    }

    console.log("Key Loaded (Masked):", key.substring(0, 10) + "...");

    const genAI = new GoogleGenAI({ apiKey: key });

    try {
        console.log("Generating Content with gemini-2.5-flash...");
        const result = await genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: "Test prompt: Explain 'Alpha' in 1 sentence.",
        });

        console.log("Result Keys:", Object.keys(result));
        console.log("Result Full:", JSON.stringify(result, null, 2));

        // Test property access
        console.log("Trace Access 'result.text':", result.text);
        if (typeof result.text === 'function') {
            console.log("Trace Access 'result.text()':", result.text());
        }

    } catch (e) {
        console.error("Verification Failed:");
        console.error("Error Name:", e.name);
        console.error("Error Message:", e.message);
        console.error("Full Error:", JSON.stringify(e, null, 2));
    }
}

test();
