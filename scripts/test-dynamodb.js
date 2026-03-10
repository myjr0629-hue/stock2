// Quick test: DynamoDB connection + write + read
require('dotenv').config({ path: '.env.local' });

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

async function test() {
    console.log('AWS_REGION:', process.env.AWS_REGION);
    console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? '✅ set' : '❌ missing');
    console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '✅ set' : '❌ missing');

    const client = DynamoDBDocumentClient.from(
        new DynamoDBClient({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
        }),
        { marshallOptions: { removeUndefinedValues: true } }
    );

    // Write test
    const ts = Date.now();
    await client.send(new PutCommand({
        TableName: 'signum-gex-history',
        Item: { ticker: 'TEST', timestamp: ts, gex: 12345, price: 180.5, gammaRegime: 'POSITIVE' }
    }));
    console.log('\n✅ PUT success — wrote test item');

    // Read test
    const result = await client.send(new QueryCommand({
        TableName: 'signum-gex-history',
        KeyConditionExpression: 'ticker = :t',
        ExpressionAttributeValues: { ':t': 'TEST' },
    }));
    console.log(`✅ QUERY success — found ${result.Items.length} items`);
    console.log(JSON.stringify(result.Items[0], null, 2));

    console.log('\n🎉 DynamoDB connection working perfectly!');
}

test().catch(e => console.error('❌ ERROR:', e.message));
