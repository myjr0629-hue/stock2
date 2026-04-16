require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const Redis = require('ioredis');

async function run() {
    console.log('Purging NVDA caches...');
    
    // 1. DynamoDB Purge
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
    
    const tablesAndKeys = [
        { table: 'signum-unified-cache', key: { pk: 'NVDA' } },
        { table: 'signum-unified-cache', key: { pk: 'NVDA:en' } },
        { table: 'signum-unified-cache', key: { pk: 'NVDA:ko' } },
        { table: 'signum-unified-cache', key: { pk: 'NVDA:ja' } },
        { table: 'signum-pattern-db', key: { pattern: 'ANALYST:NVDA' } },
        { table: 'signum-pattern-db', key: { pattern: 'EARNINGS:NVDA' } },
        { table: 'signum-pattern-db', key: { pattern: 'FUND:NVDA' } },
        { table: 'signum-pattern-db', key: { pattern: 'RELATED:NVDA' } },
        { table: 'signum-pattern-db', key: { pattern: 'SI:NVDA' } },
    ];
    
    for (const item of tablesAndKeys) {
        try {
            await client.send(new DeleteCommand({ TableName: item.table, Key: item.key }));
            console.log(`Deleted DynamoDB [${item.table}] key:`, item.key);
        } catch(e) {
            console.log(`Failed DynamoDB [${item.table}]`, item.key, e.message);
        }
    }

    // 2. Redis Purge
    const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
    const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (UPSTASH_URL && UPSTASH_TOKEN) {
        try {
            const https = require('https');
            const url = new URL(UPSTASH_URL);
            
            const redisKeys = [
                'cmd:data:NVDA',
                'cache:command:unified:NVDA',
                'overview:NVDA:ko',
                'overview:NVDA:en',
                'rt-metrics:NVDA',
                'cache:flow:unified:NVDA'
            ];
            
            for (const key of redisKeys) {
                const body = JSON.stringify(['DEL', key]);
                const options = {
                    hostname: url.hostname, port: 443, path: '/', method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + UPSTASH_TOKEN, 'Content-Type': 'application/json' },
                };
                await new Promise(resolve => {
                    const req = https.request(options, (res) => { res.on('data', ()=>{}); res.on('end', resolve); });
                    req.write(body); req.end();
                });
                console.log(`Deleted Redis key: ${key}`);
            }
        } catch(e) {
            console.log("Redis delete failed:", e.message);
        }
    }
    
    console.log('Purge Complete.');
}
run();
