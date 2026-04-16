require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));

async function run() {
  const r = await client.send(new GetCommand({
    TableName: 'signum-pattern-db',
    Key: { pattern: 'EARNINGS:AAPL' }
  }));
  console.log(r.Item);
}
run();
