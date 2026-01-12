/**
 * Script to pre-populate weekend cache with current options data
 * Run this on Friday or manually to prepare weekend cache
 */

import { saveOptionsToCache, loadOptionsFromCache, listCachedTickers, isWeekend } from '../src/services/weekendOptionsCache';

// Universe of tickers to cache (from report)
const TICKERS = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AMD', 'INTC', 'PLTR', 'COIN', 'SNAP'];

async function fetchAndCacheOptions(ticker: string) {
    const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";

    // Calculate date range
    const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const todayStr = nowET.toISOString().split('T')[0];
    const maxDate = new Date(nowET);
    maxDate.setDate(maxDate.getDate() + 35);
    const maxDateStr = maxDate.toISOString().split('T')[0];

    const url = `https://api.polygon.io/v3/snapshot/options/${ticker}?limit=250&expiration_date.gte=${todayStr}&expiration_date.lte=${maxDateStr}&apiKey=${MASSIVE_API_KEY}`;

    try {
        console.log(`Fetching ${ticker}... (${todayStr} ~ ${maxDateStr})`);
        const res = await fetch(url);
        console.log(`  Status: ${res.status}`);
        const data = await res.json();

        if (data?.results?.length > 0) {
            // Transform to expected format
            const contracts = data.results.map((c: any) => ({
                strike_price: c.details?.strike_price || c.strike_price || 0,
                contract_type: (c.details?.contract_type || c.contract_type || "call").toLowerCase(),
                open_interest: Number(c.open_interest) || 0,
                greeks: c.greeks || { gamma: 0 },
                expiry: c.details?.expiration_date || c.expiration_date
            }));

            // Get spot price
            const spotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${MASSIVE_API_KEY}`;
            const spotRes = await fetch(spotUrl);
            const spotData = await spotRes.json();
            const t = spotData?.ticker;
            const spot = t?.lastTrade?.p || t?.min?.c || t?.day?.c || t?.prevDay?.c || 0;

            const cacheData = { contracts, expiry: `Aggregated (<14d)`, spot };
            saveOptionsToCache(ticker, cacheData);
            console.log(`  ✅ ${ticker}: Cached ${contracts.length} contracts, spot=${spot}`);
            return true;
        } else {
            console.log(`  ❌ ${ticker}: No results - API said:`, JSON.stringify(data).substring(0, 200));
            return false;
        }
    } catch (e) {
        console.error(`  ❌ ${ticker}: Error:`, e);
        return false;
    }
}

async function main() {
    console.log('=== Weekend Cache Population ===');
    console.log(`Is Weekend: ${isWeekend()}`);
    console.log(`Currently Cached: ${listCachedTickers().join(', ') || 'none'}`);
    console.log('');

    let success = 0;
    let fail = 0;

    for (const ticker of TICKERS) {
        const ok = await fetchAndCacheOptions(ticker);
        if (ok) success++;
        else fail++;

        // Rate limiting
        await new Promise(r => setTimeout(r, 200));
    }

    console.log('');
    console.log(`=== Complete ===`);
    console.log(`Success: ${success}, Failed: ${fail}`);
    console.log(`Cached tickers: ${listCachedTickers().join(', ')}`);
}

main();
