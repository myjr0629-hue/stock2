require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');

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
    const universe = JSON.parse(fs.readFileSync('data/stock_universe_us300.json', 'utf-8')).symbols;
    const group1 = [universe[0], universe[25], universe[50], universe[75], universe[99]];
    const group2 = [universe[100], universe[125], universe[150], universe[175], universe[199]];
    const group3 = [universe[200], universe[225], universe[250], universe[275], universe[299]];
    const sampling = [
        { group: 1, tickers: group1 },
        { group: 2, tickers: group2 },
        { group: 3, tickers: group3 },
    ];
    let ssr=0, live=0, none=0;
    for (const { group, tickers } of sampling) {
        console.log(`\n--- GROUP ${group} ---`);
        for (const t of tickers) {
            const r = await client.send(new QueryCommand({
                TableName: 'signum-alpha-history',
                KeyConditionExpression: 'ticker = :t AND #d = :d',
                ExpressionAttributeValues: { ':t': t, ':d': today },
                ExpressionAttributeNames: { '#d': 'date' },
                Limit: 1,
            }));
            const i = r.Items?.[0];
            if (!i) { console.log(`  [ ] ${t}: NONE`); none++; }
            else if (i.qualityTier === 'SSR_V46') { console.log(`  [V] ${t}: SSR_V46 Score=${i.alphaScore} Grade=${i.grade}`); ssr++; }
            else { console.log(`  [L] ${t}: ${i.qualityTier} Score=${i.alphaScore}`); live++; }
        }
    }
    console.log(`\n=== RESULT: SSR_V46=${ssr} LIVE=${live} NONE=${none} ===`);
}
main();
