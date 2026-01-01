
import { config } from 'dotenv';
import path from 'path';

// Load env
config({ path: path.resolve(process.cwd(), '.env.local') });

import { analyzeNewsBatch } from '../src/services/newsHubProvider';

async function testGeminiDirect() {
    console.log("Testing Gemini DIRECT Integration...");

    const mockItems = [
        {
            id: 'mock-1',
            title: 'Sources say Apple is considering a bid for Disney next year',
            description: 'According to people familiar with the matter, Apple executives have discussed the potential acquisition.'
        },
        {
            id: 'mock-2',
            title: 'NVIDIA Reports Q4 Revenue of $22B, Beating Estimates',
            description: 'The chipmaker posted record earnings driven by data center demand, shares rose 5%.'
        }
    ];

    console.log("Sending mock items to Gemini...");
    const results = await analyzeNewsBatch(mockItems);

    console.log(`\nReceived ${results.length} results.`);

    results.forEach((r, i) => {
        console.log(`\n--- Result ${i + 1} ---`);
        console.log(`ID: ${r.id}`);
        console.log(`Summary (KR): ${r.summaryKR}`);
        console.log(`Is Rumor?: ${r.isRumor}`);
    });
}

testGeminiDirect();
