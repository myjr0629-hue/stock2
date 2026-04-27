require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

async function check() {
  // Check NVDA Friday record — ALL fields
  const res = await client.send(new QueryCommand({
    TableName: 'signum-alpha-history',
    KeyConditionExpression: 'ticker = :tk AND #d = :d',
    ExpressionAttributeNames: { '#d': 'date' },
    ExpressionAttributeValues: { ':tk': 'NVDA', ':d': '2026-04-25' },
    Limit: 1,
  }));
  const item = res.Items?.[0];
  if (item) {
    console.log('NVDA 2026-04-25 full record:');
    console.log(JSON.stringify(item, null, 2));
  }
  
  // Also check today
  const today = new Date().toISOString().slice(0,10);
  const res2 = await client.send(new QueryCommand({
    TableName: 'signum-alpha-history',
    KeyConditionExpression: 'ticker = :tk AND #d = :d',
    ExpressionAttributeNames: { '#d': 'date' },
    ExpressionAttributeValues: { ':tk': 'NVDA', ':d': today },
    Limit: 1,
  }));
  const item2 = res2.Items?.[0];
  if (item2) {
    console.log('\nNVDA ' + today + ' full record:');
    console.log(JSON.stringify(item2, null, 2));
  }
}

check().catch(e => console.error(e.message));
