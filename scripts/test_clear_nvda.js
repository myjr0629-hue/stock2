require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const https = require('https');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisDel(key) {
    const url = new URL(UPSTASH_URL);
    const body = JSON.stringify(['DEL', key]);
    return new Promise(resolve => {
        const req = https.request({
            hostname: url.hostname, path: '/', method: 'POST',
            headers: { 'Authorization': 'Bearer ' + UPSTASH_TOKEN, 'Content-Type': 'application/json' }
        }, res => {
            let data = ''; res.on('data', d => data += d);
            res.on('end', () => resolve(data));
        });
        req.write(body); req.end();
    });
}

async function run() {
    console.log("Clearing NVDA Cache...");
    await redisDel('swranalyst:NVDA');
    await redisDel('swr:live/analyst?t=NVDA');
    await redisDel('swrunified:NVDA:en');
    await redisDel('swrunified:NVDA:ko');
    await redisDel('swrunified:NVDA:ja');
    await redisDel('cache:command:unified:NVDA');
    
    try {
        await client.send(new DeleteCommand({ TableName: 'signum-unified-cache', Key: { ticker: 'NVDA', lang: 'en' } }));
        await client.send(new DeleteCommand({ TableName: 'signum-unified-cache', Key: { ticker: 'NVDA', lang: 'ko' } }));
    } catch(e) { console.log("Dynamo clear err", e.message); }
    console.log("Done.");
}
run();
