
import { fetchMassive } from '../src/services/massiveClient';

async function main() {
    console.log("Testing Massive API for TLT...");
    try {
        const res = await fetchMassive('/v2/snapshot/locale/us/markets/stocks/tickers/TLT', {}, true);
        console.log("TLT Price:", res?.ticker?.day?.c);
    } catch (e) {
        console.error("TLT Fetch Failed:", e);
    }
}
main();
