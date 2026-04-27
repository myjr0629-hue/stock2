require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

async function check() {
  // 1. Check signum-alpha-history — context score backtest records
  console.log('═══ 1. SIGNUM-ALPHA-HISTORY (Backtest Data) ═══\n');
  
  // Get today and recent dates
  const today = new Date().toISOString().slice(0, 10);
  const friday = '2026-04-25'; // Last Friday
  const thursday = '2026-04-24';
  
  // Count records per date (sample scan)
  for (const date of [friday, thursday, today]) {
    try {
      // Scan with filter for this date (no GSI, so we scan)
      const result = await client.send(new ScanCommand({
        TableName: 'signum-alpha-history',
        FilterExpression: '#d = :d',
        ExpressionAttributeNames: { '#d': 'date' },
        ExpressionAttributeValues: { ':d': date },
        Select: 'COUNT',
      }));
      console.log(`${date}: ${result.Count} records (scanned: ${result.ScannedCount})`);
    } catch (e) {
      console.log(`${date}: Error - ${e.message}`);
    }
  }
  
  // 2. Sample records from Friday to check field completeness
  console.log('\n═══ 2. SAMPLE FRIDAY RECORDS (field check) ═══\n');
  const sampleTickers = ['NVDA', 'TSLA', 'AAPL', 'RIVN', 'PLTR'];
  for (const ticker of sampleTickers) {
    try {
      const res = await client.send(new QueryCommand({
        TableName: 'signum-alpha-history',
        KeyConditionExpression: 'ticker = :tk AND #d = :d',
        ExpressionAttributeNames: { '#d': 'date' },
        ExpressionAttributeValues: { ':tk': ticker, ':d': friday },
        Limit: 1,
      }));
      const item = res.Items?.[0];
      if (item) {
        const fields = Object.keys(item);
        const hasClose = item.close != null;
        const hasClose3d = item.close_3d != null;
        const hasReturn3d = item.return_3d != null;
        const hasAlpha = item.alphaScore != null || item.contextScore != null;
        const hasSMA = item.sma50 != null;
        console.log(`${ticker}: ${fields.length} fields | close=${hasClose ? item.close : '❌'} | close_3d=${hasClose3d ? item.close_3d?.toFixed(2) : '❌'} | return_3d=${hasReturn3d ? item.return_3d + '%' : '❌'} | alpha=${hasAlpha ? (item.alphaScore || item.contextScore) : '❌'} | sma=${hasSMA ? '✅' : '❌'}`);
      } else {
        console.log(`${ticker}: ❌ No record for ${friday}`);
      }
    } catch (e) {
      console.log(`${ticker}: Error - ${e.message}`);
    }
  }

  // 3. Check total unique tickers in recent records
  console.log('\n═══ 3. UNIQUE TICKERS COUNT (Friday) ═══\n');
  try {
    let uniqueTickers = new Set();
    let lastKey = undefined;
    let scanned = 0;
    do {
      const res = await client.send(new ScanCommand({
        TableName: 'signum-alpha-history',
        FilterExpression: '#d = :d',
        ExpressionAttributeNames: { '#d': 'date' },
        ExpressionAttributeValues: { ':d': friday },
        ProjectionExpression: 'ticker',
        ExclusiveStartKey: lastKey,
      }));
      for (const item of res.Items || []) {
        uniqueTickers.add(item.ticker);
      }
      scanned += res.ScannedCount || 0;
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`Friday (${friday}): ${uniqueTickers.size} unique tickers (scanned ${scanned} total records)`);
    
    // Check a few non-obvious tickers to verify breadth
    const checkTickers = ['ZM', 'BABA', 'COIN', 'SNAP', 'ROKU', 'ABNB'];
    const found = checkTickers.filter(t => uniqueTickers.has(t));
    const missing = checkTickers.filter(t => !uniqueTickers.has(t));
    console.log(`Spot check found: ${found.join(', ')}`);
    if (missing.length > 0) console.log(`Spot check missing: ${missing.join(', ')}`);
  } catch (e) {
    console.log('Scan error:', e.message);
  }

  // 4. Check close_3d backfill status
  console.log('\n═══ 4. CLOSE_3D BACKFILL STATUS (Friday) ═══\n');
  try {
    let withClose3d = 0;
    let withoutClose3d = 0;
    let lastKey = undefined;
    do {
      const res = await client.send(new ScanCommand({
        TableName: 'signum-alpha-history',
        FilterExpression: '#d = :d',
        ExpressionAttributeNames: { '#d': 'date' },
        ExpressionAttributeValues: { ':d': friday },
        ProjectionExpression: 'ticker, close_3d, return_3d',
        ExclusiveStartKey: lastKey,
      }));
      for (const item of res.Items || []) {
        if (item.close_3d != null) withClose3d++;
        else withoutClose3d++;
      }
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`With close_3d: ${withClose3d}`);
    console.log(`Without close_3d: ${withoutClose3d} (pending — needs 3 trading days)`);
  } catch (e) {
    console.log('Error:', e.message);
  }
}

check().catch(e => console.error('Fatal:', e.message));
