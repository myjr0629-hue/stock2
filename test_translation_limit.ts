
import { analyzeNewsBatch } from './src/services/newsHubProvider';

// Mock items
const items = Array.from({ length: 15 }).map((_, i) => ({
    id: `test-${i}`,
    title: `US Market Update ${i}: The Dow Jones Industrial Average rose significantly today amidst positive economic data.`,
    description: `Investors are optimistic about the upcoming Federal Reserve meeting. Tech stocks led the rally with Nvidia reaching new highs.`,
    publisher: { name: "Bloomberg" },
    published_utc: new Date().toISOString()
}));

async function runTest() {
    console.log("Starting Translation Rate Limit Test with 15 items...");
    const start = Date.now();

    // We want to force fallback primarily, but if Gemini works that's fine too.
    // However, to test the fallback 429 fix, we ideally want to trigger the fallback path.
    // The code behaves: Gemini -> Catch -> Fallback.
    // We can simulate Gemini failure if we don't have a valid key, or we can just observe.

    // Check if we have a key environment variable
    if (process.env.GEMINI_API_KEY || process.env.GEMINI_VERDICT_KEY || process.env.GEMINI_NEWS_KEY) {
        console.log("Note: Gemini Key found, might use LLM instead of Translate API. Test might not hit Translate Rate Limits.");
    } else {
        console.log("No Gemini Key found, defaulting to Translate API (Fallback Path).");
    }

    try {
        const results = await analyzeNewsBatch(items); // expects any[]
        const duration = (Date.now() - start) / 1000;

        console.log(`Processed ${results.length} items in ${duration.toFixed(2)}s`);

        // Log a few results
        results.slice(0, 3).forEach(r => {
            console.log(`[${r.id}] Rumor: ${r.isRumor} | KR: ${r.summaryKR.substring(0, 50)}...`);
        });

        if (results.length === 0) {
            console.error("FAILED: No results returned.");
            process.exit(1);
        }

        console.log("SUCCESS: Batch processed without crashing.");
    } catch (error) {
        console.error("Test FAILED with error:", error);
        process.exit(1);
    }
}

runTest();
