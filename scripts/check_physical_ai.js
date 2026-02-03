// Check options availability for Physical AI candidates
const POLYGON_API_KEY = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const BASE_URL = 'https://api.polygon.io';

const PHYSICAL_AI_CANDIDATES = ['ISRG', 'TER', 'ROK', 'MBLY', 'QCOM', 'PONY'];

async function checkOptions() {
    console.log('\nPhysical AI Options Check\n');

    for (const ticker of PHYSICAL_AI_CANDIDATES) {
        try {
            const url = `${BASE_URL}/v3/snapshot/options/${ticker}?limit=5&apiKey=${POLYGON_API_KEY}`;
            const res = await fetch(url);
            const data = await res.json();
            const contracts = data?.results?.length || 0;
            const status = contracts > 0 ? '✅ YES' : '❌ NO';
            console.log(`${ticker.padEnd(5)}: ${status} (${contracts} contracts)`);
        } catch (e) {
            console.log(`${ticker.padEnd(5)}: ❌ ERROR`);
        }
        await new Promise(r => setTimeout(r, 200));
    }
}
checkOptions();
