import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
import { Redis } from '@upstash/redis';

async function main() {
    console.log("Fetching cache:command:unified:NVDA detailed sub-fields...");
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        console.error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN env var");
        process.exit(1);
    }
    const redis = new Redis({ url, token });
    const key = 'cache:command:unified:NVDA';
    const data = await redis.get(key);

    if (data) {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        console.log("--- fundamentals ---");
        console.log(JSON.stringify(parsed.fundamentals, null, 2));

        console.log("\n--- volatility ---");
        console.log(JSON.stringify(parsed.volatility, null, 2));

        console.log("\n--- structure ---");
        console.log(JSON.stringify(parsed.structure, null, 2));

        console.log("\n--- institutional ---");
        console.log(JSON.stringify(parsed.institutional, null, 2));

        console.log("\n--- squeeze ---");
        console.log(JSON.stringify(parsed.squeeze, null, 2));
        
        console.log("\n--- analyst ---");
        console.log(JSON.stringify(parsed.analyst, null, 2));
    } else {
        console.log("NVDA Unified Cache is NULL");
    }
}

main().catch(console.error);
