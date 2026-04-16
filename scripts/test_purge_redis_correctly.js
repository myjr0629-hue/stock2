require('dotenv').config({ path: '.env.local' });
const EC2_PROXY_URL = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
const EC2_PROXY_KEY = process.env.EC2_REDIS_PROXY_KEY || 'signum-redis-proxy-2026';

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function run() {
    const keys = [
        'swranalyst:NVDA',
        'swr:analyst:NVDA',
        'cache:command:unified:NVDA',
        'cmd:data:NVDA'
    ];

    for (const key of keys) {
        console.log(`Deleting ${key}...`);
        
        // EC2
        try {
            const res = await fetch(`${EC2_PROXY_URL}/del?key=${encodeURIComponent(key)}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${EC2_PROXY_KEY}` }
            });
            console.log(`  EC2 Proxy: ${res.ok ? 'OK' : 'Failed ' + res.status}`);
        } catch (e) {
            console.log(`  EC2 Proxy Error: ${e.message}`);
        }

        // Upstash
        try {
            if (UPSTASH_URL && UPSTASH_TOKEN) {
                const res = await fetch(UPSTASH_URL, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` },
                    body: JSON.stringify(['DEL', key])
                });
                const json = await res.json();
                console.log(`  Upstash: ${json.result}`);
            }
        } catch (e) {
            console.log(`  Upstash Error: ${e.message}`);
        }
    }
}
run();
