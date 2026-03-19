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
    // Check tickers visible in the dashboard/watchlist screenshot
    const tickers = ['NVDA', 'TSLA', 'GOOGL', 'AMZN', 'AAPL', 'WDC', 'RIVN', 'MCD', 'CEG', 'AMD', 'MSFT'];

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
                console.log(`[ ] ${ticker}: NO RECORD`);
            } else if (item.qualityTier === 'SSR_V46') {
                console.log(`[V] ${ticker}: SSR_V46 Score=${item.alphaScore} Grade=${item.grade} M=${item.momentum} S=${item.structure} F=${item.flow} R=${item.regime} C=${item.catalyst} Price=${item.price}`);
            } else {
                console.log(`[L] ${ticker}: ${item.qualityTier} Score=${item.alphaScore}`);
            }
        } catch (e) {
            console.log(`[!] ${ticker}: ERROR`);
        }
    }
}
main();
