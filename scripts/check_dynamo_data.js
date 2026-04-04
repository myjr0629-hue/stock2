const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
require('dotenv').config({ path: '.env.local' });

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'us-east-1', credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }}),
  { marshallOptions: { removeUndefinedValues: true } }
);

async function main() {
  const tsla = await client.send(new GetCommand({
    TableName: 'signum-unified-cache', Key: { pk: 'TSLA' }
  }));
  const s = tsla.Item?.data?.structure;
  if (s) {
    console.log('TSLA_STRUCTURE_KEYS=' + Object.keys(s).sort().join(','));
    console.log('TSLA_netGex=' + s.netGex);
    console.log('TSLA_maxPain=' + s.maxPain);
    console.log('TSLA_callWall=' + s.callWall);
    console.log('TSLA_putFloor=' + s.putFloor);
    console.log('TSLA_gammaFlipLevel=' + s.gammaFlipLevel);
    console.log('TSLA_pcRatio=' + s.pcRatio);
    console.log('TSLA_expiration=' + s.expiration);
    console.log('TSLA_atmIv=' + s.atmIv);
    console.log('TSLA_squeezeScore=' + s.squeezeScore);
    console.log('TSLA_squeezeRisk=' + s.squeezeRisk);
    console.log('TSLA_gexConfidence=' + s.gexConfidence);
    console.log('TSLA_levels=' + JSON.stringify(s.levels));
    console.log('TSLA_netPremium=' + s.netPremium);
    console.log('TSLA_options_status=' + s.options_status);
    console.log('TSLA_underlyingPrice=' + s.underlyingPrice);
    console.log('TSLA_gammaConcentration=' + s.gammaConcentration);
  } else {
    console.log('NO_STRUCTURE');
  }

  // Check 20 tickers for structure fields
  console.log('---TICKER_CHECK---');
  const tickers = ['TSLA','NVDA','AAPL','MSFT','GOOGL','META','AMZN','AMD','PLTR','COIN',
                   'SPY','QQQ','ARM','SMCI','LLY','JPM','BA','GE','CRWD','PANW'];
  for (const t of tickers) {
    const res = await client.send(new GetCommand({
      TableName: 'signum-unified-cache', Key: { pk: t }
    }));
    const st = res.Item?.data?.structure;
    const exp = st?.expiration || 'NULL';
    const gex = st?.netGex;
    const cw = st?.callWall;
    const pf = st?.putFloor;
    const mp = st?.maxPain;
    const up = res.Item?.updatedAt || 'N/A';
    console.log(`${t}|${!!st}|${exp}|${gex !== undefined ? (gex/1e6).toFixed(1)+'M' : 'N/A'}|${cw||'N/A'}|${pf||'N/A'}|${mp||'N/A'}|${up}`);
  }

  // Flow history check
  console.log('---FLOW_CHECK---');
  const flowScan = await client.send(new ScanCommand({
    TableName: 'signum-flow-history',
    Limit: 20,
  }));
  const flowTickers = new Set();
  for (const item of flowScan.Items || []) {
    flowTickers.add(item.ticker);
  }
  console.log('FLOW_TICKERS=' + [...flowTickers].join(','));
  console.log('FLOW_COUNT=' + (flowScan.Items?.length || 0));
}

main().catch(e => console.error('ERR:', e.message));
