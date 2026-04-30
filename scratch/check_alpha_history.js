require('dotenv').config({path:'.env.local'});
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));

async function checkAlphaHistory() {
  console.log('--- Checking signum-alpha-history in DynamoDB ---');
  
  // 1. Check AAPL latest data
  console.log('\n[1] AAPL Alpha History (Last 5 days):');
  try {
    const aaplData = await client.send(new QueryCommand({
      TableName: 'signum-alpha-history',
      KeyConditionExpression: 'ticker = :t',
      ExpressionAttributeValues: { ':t': 'AAPL' },
      ScanIndexForward: false, // Descending order
      Limit: 5
    }));
    console.table(aaplData.Items.map(i => ({ date: i.date, score: i.alphaScore, close: i.close, vwap: i.vwap })));
  } catch(e) { console.error('Error fetching AAPL:', e.message); }

  // 2. Scan recent items (limit 100) to check overall distribution
  console.log('\n[2] Random sample of Alpha Scores across tickers:');
  try {
    const scanData = await client.send(new ScanCommand({
      TableName: 'signum-alpha-history',
      Limit: 100
    }));
    
    const validScores = scanData.Items.filter(i => i.alphaScore !== undefined && i.alphaScore !== null);
    console.log('Total items scanned:', scanData.Items.length);
    console.log('Items with alphaScore:', validScores.length);
    
    if(validScores.length > 0) {
      const scores = validScores.map(i => i.alphaScore);
      const avg = scores.reduce((a,b)=>a+b,0)/scores.length;
      console.log('Average score:', Math.round(avg*10)/10);
      console.log('Min score:', Math.min(...scores));
      console.log('Max score:', Math.max(...scores));
      
      console.log('\nSample entries:');
      console.table(validScores.slice(0, 10).map(i => ({ ticker: i.ticker, date: i.date, score: i.alphaScore })));
    }
  } catch(e) { console.error('Error scanning:', e.message); }
}

checkAlphaHistory();
