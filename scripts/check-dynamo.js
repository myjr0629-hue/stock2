const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });
const ddb = new AWS.DynamoDB.DocumentClient();

async function run() {
  // Full scan for unique tickers in gex-history
  const tickers = new Map(); // ticker -> record count
  let lastKey;
  let scanned = 0;
  do {
    const result = await ddb.scan({
      TableName: 'signum-gex-history',
      ProjectionExpression: 'ticker',
      ExclusiveStartKey: lastKey,
    }).promise();
    result.Items.forEach(i => {
      tickers.set(i.ticker, (tickers.get(i.ticker) || 0) + 1);
    });
    lastKey = result.LastEvaluatedKey;
    scanned += result.Items.length;
    process.stdout.write(`\rScanned: ${scanned}...`);
  } while (lastKey);

  console.log(`\n\nTotal scanned: ${scanned}`);
  console.log(`Unique tickers in GEX history: ${tickers.size}`);
  
  // Sort by record count
  const sorted = Array.from(tickers.entries()).sort((a,b) => b[1] - a[1]);
  console.log(`\nTop 20 by record count:`);
  sorted.slice(0, 20).forEach(([t, c]) => console.log(`  ${t}: ${c}`));
  console.log(`\nBottom 20 by record count:`);
  sorted.slice(-20).forEach(([t, c]) => console.log(`  ${t}: ${c}`));
}

run().catch(e => console.error(e));
