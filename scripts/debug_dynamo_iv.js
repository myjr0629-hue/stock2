// Direct DynamoDB check with correct table/key schema
require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const raw = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
const client = DynamoDBDocumentClient.from(raw);

async function main() {
    console.log('\n════════════════════════════════════════════');
    console.log('  DynamoDB DIRECT — NVDA IV DATA TRACE');
    console.log('════════════════════════════════════════════\n');

    // 1. signum-unified-cache (pk = "NVDA")
    console.log('━━━ [1] signum-unified-cache (pk=NVDA) ━━━');
    try {
        const r = await client.send(new GetCommand({
            TableName: 'signum-unified-cache',
            Key: { pk: 'NVDA' },
            ConsistentRead: true,
        }));
        if (r.Item) {
            const data = r.Item.data;
            const ts = r.Item.timestamp;
            const age = Math.round((Date.now() - ts) / 60000);
            console.log(`  updatedAt: ${r.Item.updatedAt} (${age}분 전)`);
            console.log(`  structure keys: ${Object.keys(data?.structure || {}).join(', ')}`);
            console.log(`  structure.atmIV: ${JSON.stringify(data?.structure?.atmIV)}`);
            console.log(`  structure.atmIv: ${JSON.stringify(data?.structure?.atmIv)}`);
            console.log(`  volatility.iv: ${data?.volatility?.iv}`);
            console.log(`  volatility.regime: ${data?.volatility?.regime}`);
            console.log(`  volatility.regimeScore: ${data?.volatility?.regimeScore}`);
            console.log(`  volatility.validation: ${JSON.stringify(data?.volatility?.validation)}`);
            console.log(`  volatility keys: ${Object.keys(data?.volatility || {}).join(', ')}`);
            // Check Related
            if (data?.related?.topRelated) {
                console.log('  related.topRelated:');
                data.related.topRelated.forEach(r => {
                    console.log(`    ${r.ticker}: price=${r.price}, change=${r.change}, prevClose=${r.prevClose || 'MISSING'}`);
                });
            }
        } else {
            console.log('  ❌ NULL');
        }
    } catch (e) {
        console.log(`  ❌ ${e.message}`);
    }

    // Also try old key format
    console.log('\n━━━ [1b] signum-unified-cache (pk=NVDA:ko) ━━━');
    try {
        const r = await client.send(new GetCommand({
            TableName: 'signum-unified-cache',
            Key: { pk: 'NVDA:ko' },
        }));
        if (r.Item) {
            const data = r.Item.data;
            console.log(`  updatedAt: ${r.Item.updatedAt}`);
            console.log(`  structure.atmIv: ${JSON.stringify(data?.structure?.atmIv)}`);
            console.log(`  volatility.iv: ${data?.volatility?.iv}`);
        } else {
            console.log('  ❌ NULL');
        }
    } catch (e) {
        console.log(`  ❌ ${e.message}`);
    }

    // 2. signum-gex-history (latest record)
    console.log('\n━━━ [2] signum-gex-history (NVDA, latest 1) ━━━');
    try {
        const r = await client.send(new QueryCommand({
            TableName: 'signum-gex-history',
            KeyConditionExpression: 'ticker = :t',
            ExpressionAttributeValues: { ':t': 'NVDA' },
            ScanIndexForward: false,
            Limit: 1,
        }));
        if (r.Items?.length > 0) {
            const item = r.Items[0];
            console.log(`  keys: ${Object.keys(item).join(', ')}`);
            // Show all data
            Object.keys(item).forEach(k => {
                console.log(`  ${k}: ${JSON.stringify(item[k])}`);
            });
        } else {
            console.log('  ❌ No records');
        }
    } catch (e) {
        console.log(`  ❌ ${e.message}`);
    }

    // 3. dynamoDataProvider.getLatestGex check
    console.log('\n━━━ [3] dynamoDataProvider.getLatestGex equiv ━━━');
    try {
        const r = await client.send(new QueryCommand({
            TableName: 'signum-gex-history',
            KeyConditionExpression: 'ticker = :t',
            ExpressionAttributeValues: { ':t': 'NVDA' },
            ScanIndexForward: false,
            Limit: 3,
        }));
        if (r.Items?.length > 0) {
            r.Items.forEach((item, i) => {
                const ivKeys = Object.keys(item).filter(k => k.toLowerCase().includes('iv') || k.toLowerCase().includes('atm'));
                console.log(`  Record ${i}: ts=${item.timestamp}, gex=${item.gex}, flipLevel=${item.flipLevel}`);
                console.log(`    IV-related keys: ${ivKeys.length > 0 ? ivKeys.map(k => `${k}=${item[k]}`).join(', ') : 'NONE'}`);
            });
        }
    } catch (e) {
        console.log(`  ❌ ${e.message}`);
    }

    // 4. Check if Lambda probe cache has IV in it
    console.log('\n━━━ [4] Lambda probe: polygon:snapshot:probe:NVDA ━━━');
    const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
    const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
    try {
        const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent('polygon:snapshot:probe:NVDA')}`, {
            headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
        });
        const rd = await res.json();
        if (rd.result) {
            const probe = JSON.parse(rd.result);
            // Find ATM contracts near $201
            const calls = probe.exactResults?.filter(c => c.details?.contract_type === 'call' && Math.abs(c.details?.strike_price - 200) < 5) || [];
            const puts = probe.exactResults?.filter(c => c.details?.contract_type === 'put' && Math.abs(c.details?.strike_price - 200) < 5) || [];
            console.log(`  ATM CALLS (near $200):`);
            calls.forEach(c => {
                console.log(`    Strike ${c.details?.strike_price}: IV=${c.implied_volatility}, greeks.IV=${c.greeks?.implied_volatility}`);
            });
            console.log(`  ATM PUTS (near $200):`);
            puts.forEach(c => {
                console.log(`    Strike ${c.details?.strike_price}: IV=${c.implied_volatility}, greeks.IV=${c.greeks?.implied_volatility}`);
            });
        }
    } catch (e) {
        console.log(`  ❌ ${e.message}`);
    }

    console.log('\n════════════════════════════════════════════');
    console.log('  TRACE COMPLETE');
    console.log('════════════════════════════════════════════\n');
}

main().catch(e => console.error('FATAL:', e));
