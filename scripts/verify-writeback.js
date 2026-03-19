require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
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

    // Sample tickers from each round-robin group
    const group1 = universe.slice(0, 100);   // AAPL → GIS (alphabetical)
    const group2 = universe.slice(100, 200); // GM → ON
    const group3 = universe.slice(200, 300); // ORCL → ZS

    // Pick 5 from each group for spot-checking
    const sampling = [
        { group: 1, tickers: [group1[0], group1[25], group1[50], group1[75], group1[99]] },
        { group: 2, tickers: [group2[0], group2[25], group2[50], group2[75], group2[99]] },
        { group: 3, tickers: [group3[0], group3[25], group3[50], group3[75], group3[99]] },
    ];

    let totalSSR = 0;
    let totalLIVE = 0;
    let totalNone = 0;

    for (const { group, tickers } of sampling) {
        console.log(`\n--- GROUP ${group} (${group === 1 ? group1[0] + '...' + group1[99] : group === 2 ? group2[0] + '...' + group2[99] : group3[0] + '...' + group3[99]}) ---`);
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
                    console.log(`  [ ] ${ticker}: NO RECORD`);
                    totalNone++;
                } else if (item.qualityTier === 'SSR_V46') {
                    console.log(`  [V] ${ticker}: SSR_V46 Score=${item.alphaScore} Grade=${item.grade} Engine=${item.engineVersion}`);
                    totalSSR++;
                } else {
                    console.log(`  [L] ${ticker}: ${item.qualityTier} Score=${item.alphaScore} (Lambda/old)`);
                    totalLIVE++;
                }
            } catch (e) {
                console.log(`  [!] ${ticker}: ERROR`);
            }
        }
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`SSR_V46: ${totalSSR} / LIVE(old): ${totalLIVE} / No record: ${totalNone} / Total sampled: ${totalSSR + totalLIVE + totalNone}`);
    console.log(`Universe size: ${universe.length}`);
}
main();
