
import { fetchMassive } from '../src/services/massiveClient';

async function main() {
    console.log("Testing Massive API for I:TNX...");
    try {
        const res = await fetchMassive('/v2/snapshot/locale/global/markets/indices/tickers/I:TNX', {}, true);
        console.log("Result Ticker:", res?.ticker?.ticker);
        console.log("Result Day Close:", res?.ticker?.day?.c);
        console.log("Full Object:", JSON.stringify(res?.ticker, null, 2));
    } catch (e) {
        // Fallback to aggs if snapshot fails
        console.log("Snapshot failed, trying Aggs...");
        try {
            const aggs = await fetchMassive('/v2/aggs/ticker/I:TNX/prev', {}, true);
            console.log("Aggs Result:", JSON.stringify(aggs, null, 2));
        } catch (e2) {
            console.error("Aggs Failed too:", e2);
        }
    }
}

main();
