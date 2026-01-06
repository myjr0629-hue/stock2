
import { fetchTopGainers } from '../src/services/massiveClient';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    console.log("Testing fetchTopGainers...");
    try {
        const gainers = await fetchTopGainers();
        console.log(`Raw Gainers Count: ${gainers.length}`);
        if (gainers.length > 0) {
            console.log("Sample Gainer:", JSON.stringify(gainers[0], null, 2));

            // Replicate ReportScheduler filtering logic
            const validGainers = gainers.filter((g: any) => {
                const price = g.day?.c || g.min?.c || g.prevDay?.c || 0;
                return price >= 5.0;
            }).map((g: any) => g.ticker);

            console.log(`Filtered Gainers (Price >= $5): ${validGainers.length}`);
            console.log(`Top 5 Valid: ${validGainers.slice(0, 5).join(', ')}`);
        }
    } catch (e) {
        console.error("Error fetching gainers:", e);
    }
}

run();
