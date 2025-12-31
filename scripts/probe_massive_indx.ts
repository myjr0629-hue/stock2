
import { fetchMassive } from '../src/services/massiveClient';

async function main() {
    console.log("Testing Massive API for I:NDX...");
    try {
        const res = await fetchMassive('/v2/snapshot/locale/global/markets/indices/tickers/I:NDX', {}, true);
        console.log("Result:", JSON.stringify(res, null, 2));
    } catch (e) {
        console.error("Massive Fetch Failed:", e);
    }
}

main();
