
const fs = require('fs');
const https = require('https');

// HARDCODED KEY FOR DEBUG (Replace with valid key if expired, but using env var or fallback in client)
// We will try without key first, relying on environment or manual insert if needed.
// Actually let's use the one from massiveClient fallback for safety: "iKNEARt..."
const API_KEY = process.env.MASSIVE_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";

const TICKERS = ["QQQ", "VIXY", "UUP"];

const get = (url) => new Promise((resolve, reject) => {
    https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
});

async function run() {
    console.log("--- DEBUGGING MACRO V3 (JS) ---");

    for (const t of TICKERS) {
        // Construct V3 URL
        const url = `https://api.polygon.io/v3/snapshot?ticker.any_of=${t}&apiKey=${API_KEY}`;
        console.log(`fetching ${t}...`);

        try {
            const res = await get(url);
            const result = res.results ? res.results[0] : null;

            if (result) {
                console.log(`[${t}] FULL RAW:`, JSON.stringify(result, null, 2));
                console.log(`[${t}] RESULTS FOUND`);

                const last = result.last_trade?.p;
                const prev = result.prev_day?.c;
                const changePerc = result.todaysChangePerc;
                const changeAbs = result.todaysChange;

                console.log(`  Last Trade: ${last}`);
                console.log(`  Prev Close: ${prev}`);
                console.log(`  Change % (API): ${changePerc}`);
                console.log(`  Change Abs (API): ${changeAbs}`);

                if (last && prev) {
                    const calcChg = last - prev;
                    const calcPct = (calcChg / prev) * 100;
                    console.log(`  Calculated: ${calcChg.toFixed(2)} (${calcPct.toFixed(2)}%)`);
                }
            } else {
                console.log(`[${t}] NO DATA FOUND`);
                // Dump response if error
                if (res.status) console.log(`  Status: ${res.status}`);
            }
        } catch (e) {
            console.error(e);
        }
        console.log("--------------------------------");
    }
}

run();
