require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

async function purgePatternDB(ticker) {
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
    const patterns = [
        `ANALYST:${ticker}`, `EARNINGS:${ticker}`, `FUND:${ticker}`, `RELATED:${ticker}`, `SI:${ticker}`
    ];
    
    for (const pattern of patterns) {
        try {
            // Query to find ALL records for this partition key
            const res = await client.send(new QueryCommand({
                TableName: 'signum-pattern-db',
                KeyConditionExpression: 'pattern = :p',
                ExpressionAttributeValues: { ':p': pattern }
            }));
            
            if (res.Items && res.Items.length > 0) {
                for (const item of res.Items) {
                    await client.send(new DeleteCommand({
                        TableName: 'signum-pattern-db',
                        Key: { pattern: item.pattern, timestamp: item.timestamp }
                    }));
                    console.log(`Deleted ${pattern} at ${item.timestamp}`);
                }
            } else {
                console.log(`No records found for ${pattern}`);
            }
        } catch (e) {
            console.error(`Failed on ${pattern}:`, e.message);
        }
    }
}

async function run() {
    console.log('Purging Pattern DB for NVDA...');
    await purgePatternDB('NVDA');
    console.log('Done.');
}
run();
