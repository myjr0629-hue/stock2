// Backfill ALL tickers missing IV/SI% via Lambda OnDemand
// Scans DynamoDB for tickers with iv=0, invokes Lambda OnDemand for each
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { ScanCommand, DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
require('dotenv').config({ path: '.env.local' });

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
const lambda = new LambdaClient({ region: 'us-east-1' });

async function invoke(ticker) {
  try {
    const r = await lambda.send(new InvokeCommand({
      FunctionName: 'signum-harvest',
      Payload: JSON.stringify({ onDemandTicker: ticker }),
    }));
    const p = JSON.parse(new TextDecoder().decode(r.Payload));
    return p.statusCode === 200 ? 'OK' : 'FAIL:' + p.statusCode;
  } catch (e) {
    return 'ERR:' + e.message.slice(0, 30);
  }
}

async function main() {
  // Step 1: Find all tickers with iv=0
  console.log('Scanning DynamoDB for tickers with iv=0...');
  let items = [];
  let lastKey;
  do {
    const r = await dynamo.send(new ScanCommand({ TableName: 'signum-unified-cache', ExclusiveStartKey: lastKey }));
    items = items.concat(r.Items || []);
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);

  const needsBackfill = items
    .filter(i => !i.data?.volatility?.iv || i.data.volatility.iv === 0)
    .map(i => i.pk);

  console.log(`Found ${needsBackfill.length} tickers needing backfill (out of ${items.length} total)`);

  // Step 2: Invoke Lambda OnDemand in batches of 5
  const BATCH_SIZE = 5;
  let ok = 0, fail = 0;
  const startTime = Date.now();

  for (let i = 0; i < needsBackfill.length; i += BATCH_SIZE) {
    const batch = needsBackfill.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(t => invoke(t)));
    
    for (let j = 0; j < batch.length; j++) {
      if (results[j] === 'OK') ok++;
      else { fail++; console.log(`  FAIL: ${batch[j]} = ${results[j]}`); }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const progress = i + batch.length;
    const rate = progress / elapsed || 1;
    const eta = Math.round((needsBackfill.length - progress) / rate);
    if (progress % 50 === 0 || progress === needsBackfill.length) {
      console.log(`Progress: ${progress}/${needsBackfill.length} (OK:${ok} FAIL:${fail}) ETA:${eta}s`);
    }
  }

  console.log(`\nDONE: ${ok} OK, ${fail} FAIL in ${Math.round((Date.now() - startTime) / 1000)}s`);
}

main().catch(console.error);
