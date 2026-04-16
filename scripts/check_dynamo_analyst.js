require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));

async function run() {
  console.log('Scanning signum-pattern-db for ANALYST patterns...');
  
  let lastEvaluatedKey = undefined;
  let totalAnalysts = 0;
  let withPriceTarget = 0;
  let withoutPriceTarget = 0;
  
  do {
    const res = await client.send(new ScanCommand({
      TableName: 'signum-pattern-db',
      FilterExpression: 'begins_with(pattern, :p)',
      ExpressionAttributeValues: { ':p': 'ANALYST:' },
      ExclusiveStartKey: lastEvaluatedKey
    }));
    
    totalAnalysts += res.Items.length;
    for (const item of res.Items) {
        if (item.priceTarget && item.priceTarget.targetHigh) {
            withPriceTarget++;
        } else {
            withoutPriceTarget++;
        }
    }
    lastEvaluatedKey = res.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  
  console.log(`\n=== SCAN RESULT ===`);
  console.log(`Total Analyst Records: ${totalAnalysts}`);
  console.log(`Has new 'priceTarget' (M7 force synced): ${withPriceTarget}`);
  console.log(`Missing 'priceTarget' (Waiting for 14:30 UTC): ${withoutPriceTarget}`);
}

run();
