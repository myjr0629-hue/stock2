import { fetchMassive } from '../src/services/massiveClient';

async function main() {
    try {
        console.log("Fetching trade conditions...");
        // Fetch all conditions with a high limit to ensure we see them all
        const data = await fetchMassive('/v3/reference/conditions', { limit: '1000' });

        if (!data.results) {
            console.error("No results found.");
            return;
        }

        console.log(`Found ${data.results.length} conditions.`);

        const darkPoolConditions = data.results.filter((c: any) =>
            c.name.toLowerCase().includes('dark') ||
            c.name.toLowerCase().includes('pool')
        );

        const blockConditions = data.results.filter((c: any) =>
            c.name.toLowerCase().includes('block')
        );

        const intermarketSweep = data.results.filter((c: any) =>
            c.name.toLowerCase().includes('sweep')
        );

        console.log("\n--- DARK POOL CANDIDATES ---");
        darkPoolConditions.forEach((c: any) => console.log(`${c.id}: ${c.name} (${c.sip_mapping})`));

        console.log("\n--- BLOCK TRADE CANDIDATES ---");
        blockConditions.forEach((c: any) => console.log(`${c.id}: ${c.name} (${c.sip_mapping})`));

        console.log("\n--- SWEEP CANDIDATES ---");
        intermarketSweep.forEach((c: any) => console.log(`${c.id}: ${c.name} (${c.sip_mapping})`));

        // Also just list some common ones manually if known names match
        console.log("\n--- ALL CONDITIONS (First 20) ---");
        data.results.slice(0, 20).forEach((c: any) => console.log(`${c.id}: ${c.name}`));

    } catch (error) {
        console.error("Error:", error);
    }
}

main();
