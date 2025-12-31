
import { fetchMassive } from '../src/services/massiveClient';

async function main() {
    console.log("Testing Massive API for QQQ...");
    try {
        const res = await fetchMassive('/v2/snapshot/locale/us/markets/stocks/tickers/QQQ', {}, true);
        console.log("Result Ticker:", res?.ticker?.ticker);
        console.log("Result Day Close:", res?.ticker?.day?.c);
        console.log("Result Last Trade:", res?.ticker?.lastTrade?.p);
        console.log("Full Object:", JSON.stringify(res?.ticker, null, 2));
    } catch (e) {
        console.error("Massive Fetch Failed:", e);
    }
}

main();
