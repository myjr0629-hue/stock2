/**
 * Inspect V7.0.0 records specifically in signum-alpha-history
 */
require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

async function main() {
  let lastKey = undefined;
  const v7Records = [];
  let total = 0;

  console.log("Scanning signum-alpha-history for V7.0.0...");
  do {
    const result = await client.send(new ScanCommand({
      TableName: 'signum-alpha-history',
      ExclusiveStartKey: lastKey,
      Limit: 5000
    }));

    (result.Items || []).forEach(item => {
      total++;
      if (item.engineVersion === '7.0.0') {
        v7Records.push(item);
      }
    });

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  console.log(`\nFound ${v7Records.length} records with engineVersion === '7.0.0'.`);
  
  // Sort by date
  v7Records.sort((a, b) => a.date.localeCompare(b.date));
  
  // Group by date
  const dateGroups = {};
  v7Records.forEach(r => {
    dateGroups[r.date] = (dateGroups[r.date] || 0) + 1;
  });
  
  console.log('\nGroup by date:', dateGroups);
  
  console.log('\nSample records:');
  v7Records.slice(0, 3).forEach(r => {
    console.log(JSON.stringify(r, null, 2));
  });
}

main().catch(console.error);
