/**
 * Deploy signum-fmp Lambda v1.0
 * 
 * FMP 데이터 전용 Lambda — signum-harvest와 완전 독립
 * 
 * 수집 항목:
 *   - Analyst Grades (grades-consensus)
 *   - Price Target (price-target-consensus)
 *   - Forward Estimates (analyst-estimates) → forwardEps/Revenue
 *   - Earnings Calendar (earnings-calendar) → nextDate/epsEstimate
 *   - Revision 계산 (전일 대비 EPS/Revenue 변동)
 * 
 * 저장:
 *   - DynamoDB signum-pattern-db: ANALYST:{ticker}, EARNINGS:{ticker}
 * 
 * 스케줄:
 *   - EventBridge: 15분마다 트리거; handler가 평일 ET 10:15~20:00만 처리(커서 재개)
 * 
 * Usage: node scripts/deploy-fmp.js
 */
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  LambdaClient,
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  GetFunctionCommand,
  GetFunctionConfigurationCommand,
  AddPermissionCommand,
} = require('@aws-sdk/client-lambda');
const {
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
} = require('@aws-sdk/client-eventbridge');

const REGION = 'us-east-1';
const FUNCTION_NAME = 'signum-fmp';
const RULE_NAME = 'signum-fmp-daily';
// Values come from the shell/.env.local when present, otherwise the deployed
// function keeps its own. Existing Environment keys are never dropped (a full
// replacement once erased a live key on another Lambda). Values are never printed.
const LOCAL_ENV = {
  FMP_API_KEY: process.env.FMP_API_KEY || '',
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '',
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '',
  FMP_ACCOUNT_RPM: process.env.FMP_ACCOUNT_RPM || '',
};

// Load universe (same source as signum-harvest)
const universeFile = path.join(__dirname, '..', 'data', 'stock_universe_us800.json');
const universe = JSON.parse(fs.readFileSync(universeFile, 'utf-8')).symbols;
console.log('Universe:', universe.length, 'tickers');

// Runtime source is maintained in lambda-fmp; never regenerate/overwrite its handler.
const lambdaDir = path.join(__dirname, 'lambda-fmp');
fs.copyFileSync(path.join(__dirname, '../src/lib/fmp/accountGuard.cjs'), path.join(lambdaDir, 'accountGuard.cjs'));

console.log('Installing deps...');
execSync('npm install --production', { cwd: lambdaDir, stdio: 'pipe' });

const zipPath = path.join(__dirname, 'lambda-fmp.zip');
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
if (process.platform === 'win32') {
  execSync(`powershell -command "Compress-Archive -Path '${lambdaDir}\\\\*' -DestinationPath '${zipPath}' -Force"`, { stdio: 'pipe' });
} else {
  execSync(`cd "${lambdaDir}" && /usr/bin/zip -q -r "${zipPath}" . -x "*.DS_Store" "*.zip"`, { stdio: 'pipe' });
}
const zipSize = Math.round(fs.statSync(zipPath).size / 1024 / 1024 * 10) / 10;
console.log('Zip:', zipSize + 'MB');

async function deploy() {
  const lambda = new LambdaClient({ region: REGION });
  const zipBuffer = fs.readFileSync(zipPath);

  // Check if function exists
  let functionExists = false;
  try {
    await lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
    functionExists = true;
    console.log('Function exists — updating...');
  } catch {
    console.log('Function does not exist — creating...');
  }

  // Detect role ARN from existing signum-harvest
  let roleArn = '';
  try {
    const existing = await lambda.send(new GetFunctionCommand({ FunctionName: 'signum-harvest' }));
    roleArn = existing.Configuration.Role;
    console.log('Using role from signum-harvest:', roleArn);
  } catch {
    console.error('ERROR: Cannot determine Lambda role.');
    process.exit(1);
  }

  const existingEnv = functionExists
    ? ((await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: FUNCTION_NAME }))).Environment?.Variables || {})
    : {};
  const envVars = { ...existingEnv, NODE_ENV: 'production' };
  for (const [name, value] of Object.entries(LOCAL_ENV)) if (value) envVars[name] = value;
  if (!envVars.FMP_ACCOUNT_RPM) envVars.FMP_ACCOUNT_RPM = '300';
  for (const name of ['FMP_API_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) {
    if (!envVars[name]) throw new Error(`Missing ${name}: the collector fails closed without the shared FMP Redis authority`);
  }
  const dropped = Object.keys(existingEnv).filter(k => !(k in envVars));
  if (dropped.length) throw new Error('Refusing to drop existing Lambda environment keys');
  console.log('Environment keys:', Object.keys(envVars).sort().join(','));
  const settle = async () => {
    for (let i = 0; i < 60; i++) {
      const c = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: FUNCTION_NAME }));
      if (c.LastUpdateStatus !== 'InProgress') {
        if (c.LastUpdateStatus === 'Failed') throw new Error('Lambda update failed');
        return c;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('Lambda update did not settle');
  };

  if (functionExists) {
    // Environment first, so the new code never starts without the shared guard.
    await lambda.send(new UpdateFunctionConfigurationCommand({
      FunctionName: FUNCTION_NAME,
      Timeout: 900,      // 15 minutes
      MemorySize: 512,    // 512MB (lightweight — no Polygon/GEX)
      Environment: { Variables: envVars },
    }));
    await settle();
    console.log('Lambda config updated (900s, 512MB)');
    await lambda.send(new UpdateFunctionCodeCommand({
      FunctionName: FUNCTION_NAME,
      ZipFile: zipBuffer,
    }));
    const after = await settle();
    console.log('Lambda code updated', after.LastModified, after.CodeSha256);
  } else {
    await lambda.send(new CreateFunctionCommand({
      FunctionName: FUNCTION_NAME,
      Runtime: 'nodejs20.x',
      Handler: 'index.handler',
      Role: roleArn,
      Code: { ZipFile: zipBuffer },
      Timeout: 900,
      MemorySize: 512,
      Environment: { Variables: envVars },
      Description: 'FMP analyst/earnings/forward data — independent from signum-harvest (resumable ET 10:15 onward)',
    }));
    console.log('Lambda function created: ' + FUNCTION_NAME);
    await new Promise(r => setTimeout(r, 5000));
  }

  // ── Repeated UTC ticks; runtime ET gate handles DST and opening protection ──
  console.log('Setting up EventBridge schedule...');
  const eb = new EventBridgeClient({ region: REGION });

  await eb.send(new PutRuleCommand({
    Name: RULE_NAME,
    ScheduleExpression: 'cron(0/15 * * * ? *)',
    State: 'ENABLED',
    Description: 'Resume signum-fmp every 15 minutes; handler gates ET 10:15-20:00 weekdays',
  }));
  console.log('EventBridge rule: ' + RULE_NAME + ' (15min ticks, ET runtime gate)');

  const fnInfo = await lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
  const lambdaArn = fnInfo.Configuration.FunctionArn;

  await eb.send(new PutTargetsCommand({
    Rule: RULE_NAME,
    Targets: [{ Id: FUNCTION_NAME + '-target', Arn: lambdaArn }],
  }));
  console.log('EventBridge target set: ' + lambdaArn);

  try {
    await lambda.send(new AddPermissionCommand({
      FunctionName: FUNCTION_NAME,
      StatementId: 'EventBridgeInvoke',
      Action: 'lambda:InvokeFunction',
      Principal: 'events.amazonaws.com',
      SourceArn: 'arn:aws:events:' + REGION + ':' + lambdaArn.split(':')[4] + ':rule/' + RULE_NAME,
    }));
    console.log('EventBridge invoke permission added');
  } catch (e) {
    if (e.name === 'ResourceConflictException') {
      console.log('EventBridge permission already exists');
    } else {
      console.warn('Permission warning:', e.message);
    }
  }

  console.log('\n✅ Deploy complete!');
  console.log('  Function: ' + FUNCTION_NAME);
  console.log('  Schedule: ' + RULE_NAME + ' (15min ticks, ET runtime gate)');
  console.log('  Tickers: ' + universe.length);
  console.log('  Timeout: 900s, Memory: 512MB');
}

deploy().catch(e => {
  console.error('Deploy error:', e.message);
  process.exit(1);
});
