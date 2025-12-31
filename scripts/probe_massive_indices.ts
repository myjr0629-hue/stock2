
import { fetchMassive } from '../src/services/massiveClient';

async function main() {
    console.log("Probing Massive API for Indices...");

    // 1. Nasdaq 100
    try {
        const res = await fetchMassive('/v2/aggs/ticker/I:NDX/prev', {}, true);
        console.log("I:NDX Result:", res?.results?.[0] || res);
    } catch (e) {
        console.error("I:NDX Failed:", e.message);
    }

    // 2. VIX
    try {
        const res = await fetchMassive('/v2/aggs/ticker/I:VIX/prev', {}, true);
        console.log("I:VIX Result:", res?.results?.[0] || res);
    } catch (e) {
        console.error("I:VIX Failed:", e.message);
    }
}

main();
