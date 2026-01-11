
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
import { Redis } from '@upstash/redis';

async function verify() {
    console.log("Verifying Redis Data...");
    if (!process.env.KV_REST_API_URL) {
        console.error("Missing KV_REST_API_URL env var");
        process.exit(1);
    }
    const redis = Redis.fromEnv();

    // Check keys
    const keysToCheck = [
        'reports:latest:eod',
        'reports:latest:morning',
        'reports:latest:final'
    ];

    for (const key of keysToCheck) {
        const data = await redis.get(key);
        if (data) {
            const r = typeof data === 'string' ? JSON.parse(data) : data;
            console.log(`[KEY: ${key}]`);
            console.log(`   ID: ${r.meta?.id}`);
            console.log(`   Date: ${r.meta?.date}`);
            console.log(`   GeneratedAt: ${r.meta?.generatedAtET}`);
            console.log('-----------------------------------');
        } else {
            console.log(`[KEY: ${key}] -> NULL (Not Found)`);
            console.log('-----------------------------------');
        }
    }
}

verify();
