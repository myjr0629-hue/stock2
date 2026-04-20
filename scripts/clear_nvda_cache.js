// Clear stale Redis cache for NVDA so fresh data flows through the fixed code
require('dotenv').config({ path: '.env.local' });

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisDel(key) {
    const res = await fetch(`${UPSTASH_URL}/del/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
    const data = await res.json();
    console.log(`  DEL ${key}: ${data.result === 1 ? 'DELETED' : 'NOT FOUND'}`);
}

async function main() {
    console.log('Clearing stale NVDA cache...');
    await redisDel('cache:command:unified:NVDA');
    console.log('Done. Next request will trigger fresh data build with fixed IV.');
}

main().catch(e => console.error(e));
