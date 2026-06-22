/**
 * Scan all records in signum-alpha-history to count unique engineVersion values and find dates.
 */
require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

async function main() {
  let lastKey = undefined;
  const versions = {};
  const dates = {};
  let total = 0;
  let countWithVersion = 0;

  console.log("Scanning signum-alpha-history for versions...");
  do {
    const result = await client.send(new ScanCommand({
      TableName: 'signum-alpha-history',
      ExclusiveStartKey: lastKey,
      ProjectionExpression: 'ticker, #d, engineVersion, alphaScore, contextScore',
      ExpressionAttributeNames: {
        '#d': 'date'
      },
      Limit: 5000
    }));

    (result.Items || []).forEach(item => {
      total++;
      const ver = item.engineVersion || 'MISSING';
      versions[ver] = (versions[ver] || 0) + 1;
      if (item.engineVersion) {
        countWithVersion++;
        const d = item.date || 'unknown';
        dates[d] = (dates[d] || 0) + 1;
      }
    });

    lastKey = result.LastEvaluatedKey;
    if (total % 10000 === 0 || !lastKey) {
      console.log(`  Processed ${total} items... Found ${countWithVersion} items with engineVersion.`);
    }
  } while (lastKey);

  console.log('\n=== Version breakdown ===');
  console.log(versions);

  console.log('\n=== Dates with engineVersion (sample) ===');
  const sortedDates = Object.keys(dates).sort();
  console.log(`Found dates from ${sortedDates[0]} to ${sortedDates[sortedDates.length - 1]}`);
  console.log(`Total unique dates with version: ${sortedDates.length}`);
}

main().catch(console.error);
