
import { fetchMassiveAll } from '../src/services/massiveClient';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    console.log("Starting pagination debug (Limit 250)...");
    const ticker = "TSLA";
    const todayStr = new Date().toISOString().split('T')[0];

    // Test with the same params as CentralDataHub
    const params = {
        limit: '250',
        'expiration_date.gte': todayStr
        // Note: lte removed for simplicity, but basic loop should work
    };

    try {
        const res = await fetchMassiveAll(`/v3/snapshot/options/${ticker}`, params, false);
        console.log(`\n--- RESULT ---`);
        console.log(`Total Count: ${res.count}`);
        console.log(`Status: ${res.status}`);

        if (res.results.length > 0) {
            console.log(`First: ${res.results[0]?.details?.ticker}`);
            console.log(`Last: ${res.results[res.results.length - 1]?.details?.ticker}`);

            const puts = res.results.filter((r: any) => r.details?.contract_type === 'put');
            console.log(`Puts Found: ${puts.length}`);
        } else {
            console.log("No results found.");
        }
    } catch (error) {
        console.error("Error executing fetchMassiveAll:", error);
    }
}

run();
