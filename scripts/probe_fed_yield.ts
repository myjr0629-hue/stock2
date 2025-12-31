
import { fetchMassive } from '../src/services/massiveClient';

async function main() {
    console.log("Testing Massive API Fed Yields...");
    try {
        // Explicitly sort by date desc to get latest
        const url = '/fed/v1/treasury-yields?limit=1&sort=date&order=desc';
        console.log("Fetching URL:", url);
        const res = await fetchMassive(url, {}, true);
        console.log("Response:", JSON.stringify(res, null, 2));
    } catch (e: any) {
        console.error("Fed Yield Fetch Failed:", e.message || e);
    }
}
main();
