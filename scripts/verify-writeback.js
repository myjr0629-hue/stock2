require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

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
    // Test both user-visited and cron-only tickers
    const tickers = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'SPY', 'AMD', 'CRWD', 'META', 'PLTR', 'CRM'];
    const results = [];

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
            if (item) {
                results.push({
                    ticker,
                    score: item.alphaScore,
                    grade: item.grade || '-',
                    tier: item.qualityTier,
                    M: item.momentum, S: item.structure, F: item.flow,
                    R: item.regime, C: item.catalyst,
                    engine: item.engineVersion || '-',
                    price: item.price,
                });
            } else {
                results.push({ ticker, tier: 'NO_RECORD' });
            }
        } catch (e) {
            results.push({ ticker, tier: 'ERROR: ' + e.message });
        }
    }
    console.log(JSON.stringify(results, null, 2));
}
main();
