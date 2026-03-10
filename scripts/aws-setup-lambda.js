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

  // Write Lambda handler
  const handlerCode = `
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
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
const M7_TICKERS = ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'];

// ====== GEX Harvest ======
async function harvestGex() {
  const results = [];
  const ts = Date.now();
  
  for (const ticker of M7_TICKERS) {
    try {
      // Get current price from Polygon
      const snap = await httpsGet(
        \`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/\${ticker}?apiKey=\${POLYGON_KEY}\`
      );
      const price = snap?.ticker?.lastTrade?.p || snap?.ticker?.day?.c || 0;
      
      // Get options chain for GEX calculation
      const chain = await httpsGet(
        \`https://api.polygon.io/v3/snapshot/options/\${ticker}?limit=50&apiKey=\${POLYGON_KEY}\`
      );
      
      let gex = 0, callWall = null, putFloor = null, maxPain = null, flipLevel = null;
      
      if (chain?.results) {
        const strikes = {};
        for (const opt of chain.results) {
          const strike = opt.details?.strike_price;
          if (!strike) continue;
          if (!strikes[strike]) strikes[strike] = { callGex: 0, putGex: 0, callOI: 0, putOI: 0 };
          
          const gamma = opt.greeks?.gamma || 0;
          const oi = opt.open_interest || 0;
          
          if (opt.details?.contract_type === 'call') {
            strikes[strike].callGex += gamma * oi * 100 * price;
            strikes[strike].callOI += oi;
          } else {
            strikes[strike].putGex -= gamma * oi * 100 * price;
            strikes[strike].putOI += oi;
          }
        }
        
        // Calculate total GEX, call wall, put floor
        let maxCallOI = 0, maxPutOI = 0;
        for (const [strike, data] of Object.entries(strikes)) {
          gex += data.callGex + data.putGex;
          if (data.callOI > maxCallOI) { maxCallOI = data.callOI; callWall = parseFloat(strike); }
          if (data.putOI > maxPutOI) { maxPutOI = data.putOI; putFloor = parseFloat(strike); }
        }
        
        // Simplified flip level
        flipLevel = callWall && putFloor ? (callWall + putFloor) / 2 : null;
      }
      
      const gammaRegime = gex > 0 ? 'POSITIVE' : gex < 0 ? 'NEGATIVE' : 'NEUTRAL';
      
      await client.send(new PutCommand({
        TableName: 'signum-gex-history',
        Item: { ticker, timestamp: ts, gex: Math.round(gex), flipLevel, callWall, putFloor, maxPain, price, gammaRegime }
      }));
      
      results.push(ticker + ':OK');
    } catch (e) {
      results.push(ticker + ':ERR');
    }
  }
  return results;
}

// ====== RLSI Harvest (from site API) ======
async function harvestRlsi() {
  try {
    const siteUrl = process.env.SITE_URL || 'https://signumhq.com';
    const data = await httpsGet(siteUrl + '/api/guardian');
    
    if (data?.rlsi !== undefined) {
      await client.send(new PutCommand({
        TableName: 'signum-rlsi-history',
        Item: {
          pk: 'MARKET',
          timestamp: Date.now(),
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
  } catch (e) {
    return 'RLSI:ERR:' + e.message;
  }
}

// ====== Main Handler ======
exports.handler = async (event) => {
  console.log('SIGNUM Harvest Lambda triggered:', new Date().toISOString());
  
  const results = {};
  
  // Check if US market is open (rough check: UTC 13:30-20:00 = EDT 9:30-16:00)
  const hour = new Date().getUTCHours();
  const minute = new Date().getUTCMinutes();
  const utcMinutes = hour * 60 + minute;
  const marketOpen = 13 * 60 + 30;  // 13:30 UTC = 9:30 EDT
  const marketClose = 20 * 60;       // 20:00 UTC = 16:00 EDT
  
  if (utcMinutes < marketOpen || utcMinutes > marketClose) {
    // Check for EST (non-DST): market 14:30-21:00 UTC
    const estMarketOpen = 14 * 60 + 30;
    const estMarketClose = 21 * 60;
    if (utcMinutes < estMarketOpen || utcMinutes > estMarketClose) {
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'Market closed', utcHour: hour }) };
    }
  }
  
  // Harvest GEX
  results.gex = await harvestGex();
  
  // Harvest RLSI
  results.rlsi = await harvestRlsi();
  
  console.log('Harvest results:', JSON.stringify(results));
  
  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, timestamp: new Date().toISOString(), results })
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
