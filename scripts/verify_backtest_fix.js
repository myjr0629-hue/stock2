require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { CloudWatchLogsClient, FilterLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});
const logs = new CloudWatchLogsClient({ region: 'us-east-1' });

async function verify() {
  const today = new Date().toISOString().slice(0, 10);
  
  // 1. Check if Lambda has run since deploy (17:17 UTC)
  console.log('═══ 1. LAMBDA EXECUTION SINCE DEPLOY (17:17 UTC) ═══\n');
  try {
    const recentLogs = await logs.send(new FilterLogEventsCommand({
      logGroupName: '/aws/lambda/signum-harvest',
      startTime: Date.now() - 15 * 60 * 1000,
      filterPattern: 'REPORT RequestId',
      limit: 5,
    }));
    if (recentLogs.events?.length > 0) {
      for (const ev of recentLogs.events) {
        console.log(`[${new Date(ev.timestamp).toISOString()}] ${ev.message?.trim().substring(0, 200)}`);
      }
    } else {
      console.log('No REPORT logs in last 15 minutes — Lambda has not run yet since deploy');
    }
  } catch (e) {
    console.log('Log check error:', e.message);
  }

  // 2. Check NVDA today — does it have alphaScore > 0?
  console.log('\n═══ 2. NVDA TODAY RECORD ═══\n');
  const nvdaRes = await client.send(new QueryCommand({
    TableName: 'signum-alpha-history',
    KeyConditionExpression: 'ticker = :tk AND #d = :d',
    ExpressionAttributeNames: { '#d': 'date' },
    ExpressionAttributeValues: { ':tk': 'NVDA', ':d': today },
    Limit: 1,
  }));
  const nvda = nvdaRes.Items?.[0];
  if (nvda) {
    console.log(`qualityTier: ${nvda.qualityTier}`);
    console.log(`alphaScore: ${nvda.alphaScore} ${nvda.alphaScore > 0 ? '✅' : '❌ (still 0)'}`);
    console.log(`alphaGrade: ${nvda.alphaGrade || 'MISSING'}`);
    console.log(`close: ${nvda.close}`);
    console.log(`sma50: ${nvda.sma50 || 'MISSING'}`);
    console.log(`sma200: ${nvda.sma200 || 'MISSING'}`);
    console.log(`gex: ${nvda.gex}`);
    console.log(`pcr: ${nvda.pcr}`);
    console.log(`Fields: ${Object.keys(nvda).length}`);
  } else {
    console.log('No NVDA record for today');
  }
  
  // 3. Spot check multiple tickers
  console.log('\n═══ 3. SPOT CHECK (5 tickers) ═══\n');
  const tickers = ['AAPL', 'TSLA', 'RIVN', 'PLTR', 'META'];
  for (const ticker of tickers) {
    const res = await client.send(new QueryCommand({
      TableName: 'signum-alpha-history',
      KeyConditionExpression: 'ticker = :tk AND #d = :d',
      ExpressionAttributeNames: { '#d': 'date' },
      ExpressionAttributeValues: { ':tk': ticker, ':d': today },
      Limit: 1,
    }));
    const item = res.Items?.[0];
    if (item) {
      const hasAlpha = item.alphaScore > 0;
      const hasSma = item.sma50 != null;
      const hasClose = item.close != null;
      console.log(`${ticker.padEnd(5)} | alpha=${String(item.alphaScore).padEnd(3)} ${hasAlpha ? '✅' : '❌'} | close=${hasClose ? item.close.toFixed(2) : '❌'} | sma=${hasSma ? '✅' : '❌'} | tier=${item.qualityTier} | fields=${Object.keys(item).length}`);
    } else {
      console.log(`${ticker}: No record`);
    }
  }

  // 4. Count today's records  
  console.log('\n═══ 4. TODAY RECORD COUNT ═══\n');
  let total = 0, withAlpha = 0, withSma = 0, withClose = 0;
  let lastKey = undefined;
  do {
    const res = await client.send(new ScanCommand({
      TableName: 'signum-alpha-history',
      FilterExpression: '#d = :d',
      ExpressionAttributeNames: { '#d': 'date' },
      ExpressionAttributeValues: { ':d': today },
      ProjectionExpression: 'ticker, alphaScore, sma50, close',
      ExclusiveStartKey: lastKey,
    }));
    for (const item of res.Items || []) {
      total++;
      if (item.alphaScore > 0) withAlpha++;
      if (item.sma50 != null) withSma++;
      if (item.close != null) withClose++;
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  
  console.log(`Total records: ${total}`);
  console.log(`With alphaScore > 0: ${withAlpha} ${withAlpha > 0 ? '✅' : '❌'}`);
  console.log(`With sma50: ${withSma}`);
  console.log(`With close: ${withClose}`);
  console.log(`\nVerdict: ${withAlpha > 100 ? '✅ Step 6 write-back WORKING' : withAlpha > 0 ? '⚠️ Partially working' : '❌ Not yet — waiting for Lambda cycle'}`);
}

verify().catch(e => console.error('Fatal:', e.message));
