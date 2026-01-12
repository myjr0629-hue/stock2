
import dotenv from 'dotenv';
// Native fetch is available in Node 18+

// Load environment variables (try to)
dotenv.config({ path: '.env.local' });

// Fallback key from weekend cache script
const API_KEY = process.env.MASSIVE_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const BASE_URL = 'https://api.polygon.io';

async function checkSnapshot(ticker: string) {
    if (!API_KEY) {
        console.error('No API Key found!');
        return;
    }

    console.log(`Checking SNAPSHOT for ${ticker}...`);

    // Polygon Snapshot URL
    const url = `${BASE_URL}/v3/snapshot?ticker.any_of=${ticker}&apiKey=${API_KEY}`;

    console.log(`Fetching: ${url.replace(API_KEY, '***')}`);

    try {
        const res = await fetch(url);
        if (!res.ok) {
            const txt = await res.text();
            console.error(`Error: ${res.status} ${res.statusText}`, txt);
            return;
        }

        const data = await res.json();
        if (!data.results || data.results.length === 0) {
            console.log('No results found.');
            return;
        }

        const result = data.results[0];
        console.log(`Snapshot Result for ${result.ticker}:`);

        // Check timestamps
        // updated is usually nanoseconds
        const updated = new Date(result.updated / 1000000);
        console.log(`  Updated: ${updated.toISOString()} (Raw: ${result.updated})`);

        if (result.last_trade) {
            const tradeTime = new Date(result.last_trade.t / 1000000); // Nanoseconds
            console.log(`  Last Trade: ${result.last_trade.p} @ ${tradeTime.toISOString()}`);
        } else {
            console.log('  No Last Trade');
        }

        if (result.min) {
            const minTime = new Date(result.min.t); // Milliseconds usually for Aggregate based fields? Check docs.
            // Actually min object usually has 't' in MS in v3?
            // Let's assume MS first.
            console.log(`  Last Min: ${result.min.c} @ ${new Date(result.min.t).toISOString()}`);
        } else {
            console.log('  No Minute Bar');
        }

        console.log(`  Day (Reg): ${result.day?.c}`);
        console.log(`  Prev Day: ${result.prev_day?.c}`);

        // Compare dates
        const today = new Date().toISOString().split('T')[0];
        console.log(`  Local Date Target: ${today}`);

    } catch (err) {
        console.error('Failed to fetch:', err);
    }
}

checkSnapshot('QQQ');
