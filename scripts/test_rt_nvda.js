require('dotenv').config({ path: '.env.local' });
const https = require('https');

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisGet(key) {
    const url = new URL(UPSTASH_URL);
    const body = JSON.stringify(['GET', key]);
    return new Promise(resolve => {
        const req = https.request({
            hostname: url.hostname, path: '/', method: 'POST',
            headers: { 'Authorization': 'Bearer ' + UPSTASH_TOKEN, 'Content-Type': 'application/json' }
        }, res => {
            let data = ''; res.on('data', d => data += d);
            res.on('end', () => resolve(JSON.parse(data).result));
        });
        req.write(body); req.end();
    });
}
async function run() {
    const d = await redisGet('rt-metrics:NVDA');
    console.log(d);
}
run();
