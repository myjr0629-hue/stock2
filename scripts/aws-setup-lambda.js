/**
 * SIGNUM HQ — AWS Phase 0 Completion
 * Creates: Lambda IAM Role, Lambda Functions, EventBridge Schedules
 * 
 * Usage: node scripts/aws-setup-lambda.js
 */

require('dotenv').config({ path: '.env.local' });

const { IAMClient, CreateRoleCommand, AttachRolePolicyCommand, GetRoleCommand } = require('@aws-sdk/client-iam');
const { LambdaClient, CreateFunctionCommand, GetFunctionCommand, UpdateFunctionCodeCommand } = require('@aws-sdk/client-lambda');
const { SchedulerClient, CreateScheduleCommand, GetScheduleCommand } = require('@aws-sdk/client-scheduler');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REGION = 'us-east-1';
const ACCOUNT_ID = '071378139897';
const PROJECT = 'signum';

const config = {
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
};

if (!config.credentials.accessKeyId) {
  console.error('ERROR: Set AWS credentials in .env.local');
  process.exit(1);
}

const iam = new IAMClient(config);
const lambda = new LambdaClient(config);
const scheduler = new SchedulerClient(config);
const s3 = new S3Client(config);

function log(emoji, msg) { console.log(`${emoji}  ${msg}`); }

// ============ Step 1: Lambda Execution Role ============
async function createLambdaRole() {
  log('🔐', 'Step 1: Lambda Execution Role...');

  const roleName = `${PROJECT}-lambda-role`;

  try {
    const existing = await iam.send(new GetRoleCommand({ RoleName: roleName }));
    log('✅', `Role already exists: ${existing.Role.Arn}`);
    return existing.Role.Arn;
  } catch (e) {
    // Create new role
  }

  const assumeRolePolicy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Principal: { Service: ['lambda.amazonaws.com', 'scheduler.amazonaws.com'] },
      Action: 'sts:AssumeRole'
    }]
  });

  const role = await iam.send(new CreateRoleCommand({
    RoleName: roleName,
    AssumeRolePolicyDocument: assumeRolePolicy,
    Description: 'SIGNUM HQ Lambda execution role',
    Tags: [{ Key: 'Project', Value: PROJECT }],
  }));

  // Attach policies
  const policies = [
    'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
    'arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess',
    'arn:aws:iam::aws:policy/AmazonElastiCacheFullAccess',
    'arn:aws:iam::aws:policy/AmazonS3FullAccess',
    'arn:aws:iam::aws:policy/AmazonVPCFullAccess',
  ];

  for (const policyArn of policies) {
    await iam.send(new AttachRolePolicyCommand({ RoleName: roleName, PolicyArn: policyArn }));
  }

  log('✅', `Role created: ${role.Role.Arn}`);

  // Wait for role propagation
  log('⏳', 'Waiting 10s for IAM role propagation...');
  await new Promise(r => setTimeout(r, 10000));

  return role.Role.Arn;
}

// ============ Step 2: Create Lambda Zip Package ============
async function createLambdaPackage() {
  log('📦', 'Step 2: Creating Lambda deployment package...');

  const lambdaDir = path.join(__dirname, 'lambda-harvest');
  const zipPath = path.join(__dirname, 'lambda-harvest.zip');

  // Create lambda source directory
  if (!fs.existsSync(lambdaDir)) fs.mkdirSync(lambdaDir, { recursive: true });

  // Write Lambda handler — FULL UNIVERSE (150+ tickers)
  const handlerCode = `
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const https = require('https');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'SIGNUM-HQ/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    }).on('error', reject);
  });
}

const POLYGON_KEY = process.env.POLYGON_API_KEY || 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';

// ====== Full Universe (150+ tickers) ======
const UNIVERSE = [
  'AAPL','MSFT','AMZN','NVDA','GOOGL','META','TSLA',
  'AMD','AVGO','QCOM','MU','LRCX','AMAT','KLAC','MRVL','ASML',
  'CRWD','PANW','ZS','FTNT','OKTA',
  'AMGN','GILD','REGN','VRTX','BIIB',
  'ISRG','TER','ROK','MBLY','PONY',
  'VST','CEG','VRT','ETN','PWR',
  'RTX','LMT','GD','NOC','BA',
  'IBM','IONQ','RGTI','QUBT',
  'V','MA','SQ','PYPL','COIN',
  'CRM','NOW','SNOW',
  'EQIX','DLR','AMT','CCI','SBAC',
  'JPM','BAC','GS','WFC','C',
  'JNJ','UNH','LLY','PFE','ABBV','MRK','TMO',
  'XOM','CVX','COP','SLB',
  'HD','COST','WMT','TGT','LOW',
  'PG','KO','PEP','MCD','SBUX','NKE',
  'DIS','NFLX','CMCSA',
  'CAT','GE','HON','UPS','DE',
  'NEE','DUK','SO',
  'PLD','O','VICI',
  'TXN','ON','INTC',
  'UBER','ABNB','DASH','SHOP','SE',
  'AI','PLTR','SMCI','ARM','DELL',
  'FCX','NEM','LIN','SHW',
  'BLK','SCHW','AXP',
  'CRM','ADBE','TSM','HOOD','DKNG','NET',
];
const UNIQUE_UNIVERSE = [...new Set(UNIVERSE)];

// GEX deep analysis tickers (get FULL options chain with pagination)
const GEX_TICKERS = [
  'AAPL','MSFT','AMZN','NVDA','GOOGL','META','TSLA',
  'AMD','PLTR','SMCI','ARM','COIN','CRWD','AI','MRVL','AVGO','MU',
  'UBER','ABNB','SHOP','SQ','PYPL',
  'JPM','BAC','GS',
  'XOM','CVX','LLY','UNH'
];

// ====== Paginated Options Fetch ======
async function getAllOptions(ticker) {
  let allResults = [];
  let url = \\\"https://api.polygon.io/v3/snapshot/options/\\\" + ticker + \\\"?limit=250&apiKey=\\\" + POLYGON_KEY;
  let pages = 0;
  while (url && pages < 20) {
    const data = await httpsGet(url);
    if (data?.results) allResults = allResults.concat(data.results);
    url = data?.next_url ? data.next_url + \\\"&apiKey=\\\" + POLYGON_KEY : null;
    pages++;
  }
  return allResults;
}

// ====== Batch DynamoDB Write ======
async function batchWrite(tableName, items) {
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25);
    try {
      await client.send(new BatchWriteCommand({
        RequestItems: { [tableName]: batch.map(item => ({ PutRequest: { Item: item } })) }
      }));
    } catch (e) {
      for (const item of batch) {
        await client.send(new PutCommand({ TableName: tableName, Item: item })).catch(() => {});
      }
    }
  }
}

// ====== Step 1: Price Snapshot for ALL tickers ======
async function harvestPrices() {
  console.log('Step 1: Price snapshot for ' + UNIQUE_UNIVERSE.length + ' tickers...');
  const ts = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  
  // Use Polygon full snapshot API (single call, all US stocks)
  const snap = await httpsGet('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=' + POLYGON_KEY);
  const allTickers = snap?.tickers || [];
  
  const items = [];
  const priceMap = {};
  
  for (const t of allTickers) {
    if (!UNIQUE_UNIVERSE.includes(t.ticker)) continue;
    const price = t.lastTrade?.p || t.day?.c || t.prevDay?.c || 0;
    const changePct = t.todaysChangePerc || 0;
    priceMap[t.ticker] = price;
    
    items.push({
      ticker: t.ticker,
      date: today,
      alphaScore: 0,
      qualityTier: 'LIVE',
      changePct: Math.round(changePct * 100) / 100,
      open: t.day?.o || 0,
      high: t.day?.h || 0,
      low: t.day?.l || 0,
      close: t.day?.c || price,
      volume: t.day?.v || 0,
      vwap: t.day?.vw || 0,
      gex: 0,
      pcr: 0,
    });
  }
  
  if (items.length > 0) {
    await batchWrite('signum-alpha-history', items);
  }
  
  console.log('Prices: ' + items.length + '/' + UNIQUE_UNIVERSE.length + ' tickers saved');
  return { count: items.length, priceMap };
}

// ====== Step 2: GEX + IV for key tickers ======
async function harvestGex(priceMap) {
  console.log('Step 2: GEX harvest for ' + GEX_TICKERS.length + ' tickers (full chain)...');
  const ts = Date.now();
  const results = [];
  
  // Process 3 at a time
  for (let i = 0; i < GEX_TICKERS.length; i += 3) {
    const batch = GEX_TICKERS.slice(i, i + 3);
    
    await Promise.all(batch.map(async (ticker) => {
      try {
        const price = priceMap[ticker] || 0;
        if (!price) { results.push(ticker + ':NO_PRICE'); return; }
        
        const allOptions = await getAllOptions(ticker);
        if (allOptions.length === 0) { results.push(ticker + ':NO_OPT'); return; }
        
        let gex = 0, callWall = null, putFloor = null;
        let maxCallOI = 0, maxPutOI = 0;
        let totalCallOI = 0, totalPutOI = 0;
        
        for (const opt of allOptions) {
          const strike = opt.details?.strike_price;
          if (!strike) continue;
          const gamma = opt.greeks?.gamma || 0;
          const oi = opt.open_interest || 0;
          const type = opt.details?.contract_type;
          
          if (type === 'call') {
            gex += gamma * oi * 100 * price;
            totalCallOI += oi;
            if (oi > maxCallOI) { maxCallOI = oi; callWall = strike; }
          } else {
            gex -= gamma * oi * 100 * price;
            totalPutOI += oi;
            if (oi > maxPutOI) { maxPutOI = oi; putFloor = strike; }
          }
        }
        
        const flipLevel = callWall && putFloor ? (callWall + putFloor) / 2 : null;
        const gammaRegime = gex > 0 ? 'POSITIVE' : gex < 0 ? 'NEGATIVE' : 'NEUTRAL';
        const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;
        
        await client.send(new PutCommand({
          TableName: 'signum-gex-history',
          Item: { ticker, timestamp: ts, gex: Math.round(gex), flipLevel, callWall, putFloor, maxPain: null, price, gammaRegime, totalContracts: allOptions.length, totalCallOI, totalPutOI, pcr: Math.round(pcr * 100) / 100 }
        }));
        
        // Flow history
        await client.send(new PutCommand({
          TableName: 'signum-flow-history',
          Item: { ticker, timestamp: ts, compositeScore: 0, opi: totalCallOI - totalPutOI, whaleScore: 0, dex: 0, ivSkew: 0, squeezeProbability: 0, smartMoneyScore: 0, totalCallOI, totalPutOI, pcr: Math.round(pcr * 100) / 100 }
        })).catch(() => {});
        
        results.push(ticker + ':' + allOptions.length + 'c');
      } catch (e) {
        results.push(ticker + ':ERR');
      }
    }));
  }
  
  console.log('GEX: ' + results.join(', '));
  return results;
}

// ====== Step 3: RLSI from site ======
async function harvestRlsi() {
  try {
    const siteUrl = process.env.SITE_URL || 'https://signumhq.com';
    const data = await httpsGet(siteUrl + '/api/guardian');
    if (data?.rlsi !== undefined) {
      await client.send(new PutCommand({
        TableName: 'signum-rlsi-history',
        Item: {
          pk: 'MARKET', timestamp: Date.now(),
          rlsi: data.rlsi || 0,
          momentum: data.subScores?.momentum || 0,
          participation: data.subScores?.participation || 0,
          priceTrend: data.subScores?.priceTrend || 0,
          rotation: data.subScores?.rotation || 0,
          sentiment: data.subScores?.sentiment || 0,
          regime: data.regime || 'NEUTRAL',
        }
      }));
      return 'RLSI:' + data.rlsi;
    }
    return 'RLSI:NO_DATA';
  } catch (e) { return 'RLSI:ERR:' + e.message; }
}

// ====== Main Handler ======
exports.handler = async (event) => {
  const start = Date.now();
  console.log('SIGNUM Harvest Lambda v2 — ' + new Date().toISOString());
  console.log('Universe: ' + UNIQUE_UNIVERSE.length + ' price + ' + GEX_TICKERS.length + ' GEX');
  
  // Market hours check (UTC) — Extended hours included
  const hour = new Date().getUTCHours();
  const minute = new Date().getUTCMinutes();
  const utcMin = hour * 60 + minute;
  
  // Pre-market: 4:00 ET = 08:00/09:00 UTC (EDT/EST)
  // Regular:    9:30 ET = 13:30/14:30 UTC
  // Close:     16:00 ET = 20:00/21:00 UTC
  // After:     20:00 ET = 00:00/01:00 UTC (next day)
  // Wide window: 08:00 UTC ~ 01:00 UTC (next day) covers all DST variations
  const isExtendedHours = (utcMin >= 8*60) || (utcMin <= 1*60);
  
  // Regular hours only (for options/GEX): 13:30~21:00 UTC
  const isRegularHours = (utcMin >= 13*60+30 && utcMin <= 21*60);
  
  if (!isExtendedHours) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'All markets closed', utcHour: hour }) };
  }
  
  const results = {};
  
  // Step 1: Price snapshot — ALWAYS during extended hours
  const { count, priceMap } = await harvestPrices();
  results.prices = count;
  
  // Step 2: GEX harvest — ONLY during regular hours (options don't trade pre/post)
  if (isRegularHours) {
    results.gex = await harvestGex(priceMap);
  } else {
    results.gex = 'SKIPPED:extended_hours';
    console.log('GEX skipped — extended hours (options closed)');
  }
  
  // Step 3: RLSI — ALWAYS during extended hours
  results.rlsi = await harvestRlsi();
  
  const duration = Math.round((Date.now() - start) / 1000);
  console.log('Done in ' + duration + 's — Prices:' + count + ' GEX:' + results.gex.length);
  
  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, timestamp: new Date().toISOString(), duration, results })
  };
};
`;

  fs.writeFileSync(path.join(lambdaDir, 'index.js'), handlerCode);

  // Create package.json for Lambda
  fs.writeFileSync(path.join(lambdaDir, 'package.json'), JSON.stringify({
    name: 'signum-harvest-lambda',
    version: '1.0.0',
    dependencies: {
      '@aws-sdk/client-dynamodb': '^3.0.0',
      '@aws-sdk/lib-dynamodb': '^3.0.0'
    }
  }, null, 2));

  // Install dependencies
  log('📦', 'Installing Lambda dependencies...');
  execSync('npm install --production', { cwd: lambdaDir, stdio: 'pipe' });

  // Create zip
  log('📦', 'Creating zip package...');

  // Use PowerShell to create zip
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execSync(`powershell -command "Compress-Archive -Path '${lambdaDir}\\*' -DestinationPath '${zipPath}' -Force"`, { stdio: 'pipe' });

  const zipSize = fs.statSync(zipPath).size;
  log('✅', `Lambda package created: ${(zipSize / 1024 / 1024).toFixed(1)}MB`);

  return zipPath;
}

// ============ Step 3: Deploy Lambda Function ============
async function deployLambda(roleArn, zipPath) {
  log('⚡', 'Step 3: Deploying Lambda Function...');

  const functionName = `${PROJECT}-harvest`;
  const zipBuffer = fs.readFileSync(zipPath);

  try {
    await lambda.send(new GetFunctionCommand({ FunctionName: functionName }));
    // Update existing
    await lambda.send(new UpdateFunctionCodeCommand({
      FunctionName: functionName,
      ZipFile: zipBuffer,
    }));
    log('✅', `Lambda updated: ${functionName}`);
  } catch (e) {
    // Create new
    await lambda.send(new CreateFunctionCommand({
      FunctionName: functionName,
      Runtime: 'nodejs20.x',
      Handler: 'index.handler',
      Role: roleArn,
      Code: { ZipFile: zipBuffer },
      Timeout: 300, // 5 minutes
      MemorySize: 512,
      Environment: {
        Variables: {
          SITE_URL: 'https://signumhq.com',
          NODE_ENV: 'production',
        }
      },
      Tags: { Project: PROJECT },
    }));
    log('✅', `Lambda created: ${functionName}`);
  }

  return functionName;
}

// ============ Step 4: EventBridge Schedules ============
async function createSchedules(lambdaArn, roleArn) {
  log('⏰', 'Step 4: EventBridge Schedules...');

  const schedules = [
    {
      name: `${PROJECT}-harvest-5min`,
      expression: 'rate(5 minutes)',
      description: 'Harvest GEX/RLSI data every 5 minutes during market hours',
    },
  ];

  for (const sched of schedules) {
    try {
      await scheduler.send(new GetScheduleCommand({ Name: sched.name }));
      log('✅', `Schedule ${sched.name} already exists`);
      continue;
    } catch (e) {
      // Create new
    }

    try {
      await scheduler.send(new CreateScheduleCommand({
        Name: sched.name,
        ScheduleExpression: sched.expression,
        Description: sched.description,
        FlexibleTimeWindow: { Mode: 'OFF' },
        Target: {
          Arn: lambdaArn,
          RoleArn: roleArn,
        },
        State: 'ENABLED',
      }));
      log('✅', `Schedule created: ${sched.name} (${sched.expression})`);
    } catch (e) {
      log('❌', `Schedule ${sched.name} failed: ${e.message}`);
    }
  }
}

// ============ Main ============
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  SIGNUM HQ — Lambda + EventBridge Setup     ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  try {
    // Step 1: IAM Role
    const roleArn = await createLambdaRole();

    // Step 2: Lambda Package
    const zipPath = await createLambdaPackage();

    // Step 3: Deploy Lambda
    const functionName = await deployLambda(roleArn, zipPath);
    const lambdaArn = `arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${functionName}`;

    // Step 4: EventBridge Schedules
    await createSchedules(lambdaArn, roleArn);

    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║  ✅ Lambda + EventBridge Complete!            ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  Role:       ${roleArn.split('/')[1]}`);
    console.log(`║  Lambda:     ${functionName}`);
    console.log('║  Schedule:   Every 5 min (auto data harvest) ║');
    console.log('╚══════════════════════════════════════════════╝');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error);
  }
}

main();
