// scripts/test_market_feed.mjs
import fs from 'fs';
import path from 'path';

async function main() {
    console.log("Testing market-feed...");
    
    const encoded = encodeURIComponent('^VIX');
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1m&range=1d`;

    console.log("Fetching GET", url);
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

    if (!res.ok) {
        console.error("FAIL", res.status);
    } else {
        const data = await res.json();
        const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
        console.log("SUCCESS! Price:", price);
    }
}
main();
