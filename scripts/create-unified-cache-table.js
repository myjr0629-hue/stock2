/**
 * Create signum-unified-cache DynamoDB table
 * Simple key-value: pk = "TICKER:LOCALE" (e.g., "NVDA:ko")
 * Stores complete unified data for instant reads
 */
require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function main() {
  const tableName = 'signum-unified-cache';
  
  // Check if table exists
  try {
    const desc = await client.send(new DescribeTableCommand({ TableName: tableName }));
    console.log(`✅ Table "${tableName}" already exists (status: ${desc.Table.TableStatus})`);
    return;
  } catch (e) {
    if (e.name !== 'ResourceNotFoundException') throw e;
  }

  // Create table
  console.log(`Creating table "${tableName}"...`);
  await client.send(new CreateTableCommand({
    TableName: tableName,
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: 'S' },  // "NVDA:ko"
    ],
    KeySchema: [
      { AttributeName: 'pk', KeyType: 'HASH' },
    ],
    BillingMode: 'PAY_PER_REQUEST',  // On-demand (no capacity planning needed)
  }));
  
  console.log(`✅ Table "${tableName}" created successfully!`);
  console.log('Schema: pk (String) = "TICKER:LOCALE"');
  console.log('Billing: On-demand (pay per request)');
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
