/**
 * Verify Alpha Score Write-back — Check DynamoDB for SSR_V46 records
 * Usage: node scripts/verify-writeback.js
 */
require('dotenv').config({ path: '.env.local' });

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({
        region: 'us-east-1',
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
    }),
    { marshallOptions: { removeUndefinedValues: true } }
);

async function main() {
    const today = new Date().toISOString().slice(0, 10);
    console.log(`\n🔍 Checking signum-alpha-history for SSR_V46 records (date: ${today})...\n`);

    // Check a few well-known tickers
    const tickers = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'SPY'];

    for (const ticker of tickers) {
        try {
            const result = await client.send(new QueryCommand({
                TableName: 'signum-alpha-history',
                KeyConditionExpression: 'ticker = :t AND #d = :d',
                ExpressionAttributeValues: { ':t': ticker, ':d': today },
                ExpressionAttributeNames: { '#d': 'date' },
                Limit: 1,
            }));

            const item = result.Items?.[0];
            if (!item) {
                console.log(`❌ ${ticker}: No record for today`);
                continue;
            }

            const isSSR = item.qualityTier === 'SSR_V46';
            const hasPillars = item.momentum !== undefined && item.structure !== undefined;

            console.log(`${isSSR ? '✅' : '⚠️'} ${ticker}: Score=${item.alphaScore} | Grade=${item.grade || 'N/A'} | Tier=${item.qualityTier}`);
            if (hasPillars) {
                console.log(`   Pillars: M=${item.momentum} S=${item.structure} F=${item.flow} R=${item.regime} C=${item.catalyst} | Engine=${item.engineVersion} | Price=$${item.price}`);
            } else {
                console.log(`   ⚠️ No pillar data (Lambda simplified score)`);
            }
        } catch (e) {
            console.log(`❌ ${ticker}: Error — ${e.message}`);
        }
    }

    // Also check signum-backtest table exists
    console.log(`\n🔍 Checking signum-backtest table...`);
    try {
        const result = await client.send(new ScanCommand({
            TableName: 'signum-backtest',
            Limit: 1,
        }));
        console.log(`✅ signum-backtest table accessible. Items: ${result.Count}`);
    } catch (e) {
        console.log(`❌ signum-backtest: ${e.message}`);
    }
}

main();
