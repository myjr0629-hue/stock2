require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

async function main() {
  console.log('Scanning unique tickers in signum-alpha-history...');
  let tickers = new Set();
  let totalRecords = 0;
  let scoredRecords = 0;
  let lastKey = undefined;

  do {
    const result = await client.send(new ScanCommand({
      TableName: 'signum-alpha-history',
      ProjectionExpression: 'ticker, alphaScore',
      ExclusiveStartKey: lastKey,
      Limit: 5000,
    }));
    
    (result.Items || []).forEach(r => {
      totalRecords++;
      if (r.ticker) {
        tickers.add(r.ticker);
      }
      if (r.alphaScore && r.alphaScore > 0) {
        scoredRecords++;
      }
    });
    
    lastKey = result.LastEvaluatedKey;
    process.stdout.write(`\rLoaded ${totalRecords} records...`);
  } while (lastKey);

  console.log('\n\nScan Complete!');
  console.log(`Total Records: ${totalRecords}`);
  console.log(`Records with Score > 0: ${scoredRecords}`);
  console.log(`Unique Tickers: ${tickers.size}`);
  console.log('Sample Tickers:', Array.from(tickers).slice(0, 30).join(', '));
}

main().catch(console.error);
