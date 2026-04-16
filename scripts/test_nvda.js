require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));

async function run() {
    try {
        const res = await client.send(new GetCommand({
            TableName: 'signum-pattern-db',
            Key: { pattern: 'ANALYST:NVDA' }
        }));
        console.log("ANALYST:NVDA =>", JSON.stringify(res.Item, null, 2));

        const res2 = await client.send(new GetCommand({
            TableName: 'signum-unified-cache',
            Key: { ticker: 'NVDA', lang: 'en' }
        }));
        console.log("Unified Cache NVDA analyst =>", JSON.stringify(res2.Item?.analyst, null, 2));
        console.log("Unified Cache NVDA institutional =>", JSON.stringify(res2.Item?.institutional, null, 2));
    } catch(err){
        console.error(err);
    }
}
run();
