
import { CentralDataHub } from '../src/services/centralDataHub';
import { fetchMassive } from '../src/services/massiveClient';

async function run() {
    const ticker = 'TSLA'; // Volatile pre-market stock
    console.log(`--- Debugging Data Fetch for ${ticker} ---`);

    // 1. Direct Massive Fetch (Simulate Cache)
    console.log('\n1. Direct Massive Fetch (Default Cache):');
    try {
        const res1 = await fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, {}, true);
        console.log('   Price:', res1.ticker?.lastTrade?.p);
        console.log('   Min (Pre):', res1.ticker?.min?.c);
        console.log('   Timestamp:', new Date().toISOString());
    } catch (e) {
        console.error(e);
    }

    // 2. Direct Massive Fetch (Force Fresh)
    console.log('\n2. Direct Massive Fetch (No Cache / Explicit Budget):');
    try {
        // Pass a dummy budget to trigger 'no-store' policy
        const dummyBudget = { current: 0, cap: 100 };
        const res2 = await fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, {}, true, dummyBudget);
        console.log('   Price:', res2.ticker?.lastTrade?.p);
        console.log('   Min (Pre):', res2.ticker?.min?.c);
        console.log('   Timestamp:', new Date().toISOString());
    } catch (e) {
        console.error(e);
    }

    // 3. Central Data Hub (Current - No Budget passed)
    console.log('\n3. CentralDataHub.getUnifiedData (Current):');
    const u1 = await CentralDataHub.getUnifiedData(ticker);
    console.log('   Main Price:', u1.price);
    console.log('   Ext Price:', u1.extendedPrice);
    console.log('   Source:', u1.priceSource);

    // 4. Central Data Hub (Forced)
    console.log('\n4. CentralDataHub.getUnifiedData (Forced):');
    const u2 = await CentralDataHub.getUnifiedData(ticker, true);
    console.log('   Main Price:', u2.price);
    console.log('   Ext Price:', u2.extendedPrice);
    console.log('   Source:', u2.priceSource);

}

run().catch(console.error);
