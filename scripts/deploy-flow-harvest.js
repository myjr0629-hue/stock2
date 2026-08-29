/**
 * Deploy signum-flow-harvest Lambda v1.0
 * 
 * Flow 페이지 전용 warm Lambda — signum-data-harvest와 완전 독립
 * 
 * Creates or updates:
 *   - Lambda function: signum-flow-harvest
 *   - EventBridge rule: signum-flow-harvest-5min (rate(5 minutes), 오프셋은 자연 발생)
 *   - IAM permissions for EventBridge → Lambda
 * 
 * Usage: node scripts/deploy-flow-harvest.js
 */
require('dotenv').config({ path: process.env.ENV_FILE || '.env.local', quiet: true });
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  LambdaClient,
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  GetFunctionCommand,
  AddPermissionCommand,
} = require('@aws-sdk/client-lambda');
const {
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
} = require('@aws-sdk/client-eventbridge');
const {
  IAMClient,
  GetRoleCommand,
} = require('@aws-sdk/client-iam');

const REGION = 'us-east-1';
const FUNCTION_NAME = 'signum-flow-harvest';
const RULE_NAME = 'signum-flow-harvest-5min';
const ROLE_ARN = process.env.LAMBDA_ROLE_ARN || '';

// Load universe from us800 (same source as signum-harvest)
const universeFile = path.join(__dirname, '..', 'data', 'stock_universe_us800.json');
const universe = JSON.parse(fs.readFileSync(universeFile, 'utf-8')).symbols;
console.log('Universe:', universe.length, 'tickers');

// Read Lambda source
const lambdaDir = path.join(__dirname, 'lambda-flow-harvest');
let handlerCode = fs.readFileSync(path.join(lambdaDir, 'index.js'), 'utf-8');

// Inject universe into Lambda code
handlerCode = handlerCode.replace(
  'const UNIVERSE = [];',
  'const UNIVERSE = ' + JSON.stringify(universe) + ';'
);

// Write injected code
fs.writeFileSync(path.join(lambdaDir, 'index.js'), handlerCode);

// Install dependencies
console.log('Installing dependencies...');
execSync('npm install --production', { cwd: lambdaDir, stdio: 'pipe' });

// Create zip
const zipPath = path.join(__dirname, 'lambda-flow-harvest.zip');
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
// [2026-08-29] PowerShell 전용이라 macOS 에서 배포가 조용히 안 됐다.
// 그 결과 Lambda 가 8/29 01:31 판(= FMP·Intrinio 어댑터 수정 이전)으로 남아
// **정규장 내내 ok=0 fail=501** 이었고, GEX 이력이 8/19 에서 멈췄다.
if (process.platform === 'win32') {
  execSync(`powershell -command "Compress-Archive -Path '${lambdaDir}\\*' -DestinationPath '${zipPath}' -Force"`, { stdio: 'pipe' });
} else {
  execSync(`cd '${lambdaDir}' && zip -qr '${zipPath}' . -x '*.zip'`, { stdio: 'pipe', shell: '/bin/bash' });
}
const zipSize = Math.round(fs.statSync(zipPath).size / 1024 / 1024 * 10) / 10;
console.log('Zip:', zipSize + 'MB');

async function deploy() {
  const lambda = new LambdaClient({ region: REGION });
  const zipBuffer = fs.readFileSync(zipPath);

  // Check if function exists
  let functionExists = false;
  let currentEnv = {};
  try {
    const cur = await lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
    functionExists = true;
    currentEnv = (cur.Configuration && cur.Configuration.Environment
      && cur.Configuration.Environment.Variables) || {};
    console.log('Function exists — updating... (기존 env ' + Object.keys(currentEnv).length + '개)');
  } catch {
    console.log('Function does not exist — creating...');
  }

  // Detect role ARN from existing signum-harvest
  let roleArn = ROLE_ARN;
  if (!roleArn) {
    try {
      const existing = await lambda.send(new GetFunctionCommand({ FunctionName: 'signum-harvest' }));
      roleArn = existing.Configuration.Role;
      console.log('Using role from signum-harvest:', roleArn);
    } catch {
      console.error('ERROR: Cannot determine Lambda role. Set LAMBDA_ROLE_ARN env var.');
      process.exit(1);
    }
  }

  // ★ [2026-08-29] 예전에는 이 4개만 담은 객체를 그대로 Environment 로 보냈다.
  //   UpdateFunctionConfiguration 의 Environment 는 **전체 치환**이라
  //   deploy-lambda-intrinio.js 가 넣어 둔 INTRINIO_API_KEY 가 배포할 때마다 지워졌다.
  //   결과: signum-flow-harvest 만 Intrinio 키가 없어 routeMassiveUrl 이 즉시
  //   undefined 를 돌려주고 죽은 polygon.io 로 나가 **정규장 내내 ok=0 fail=501**.
  //   GEX 이력이 2026-08-19 에서 멈춘 직접 원인이다(SPY 는 8/10).
  //   → 기존 env 를 읽어 **병합**한다. 덮어쓰기 금지.
  const envVars = Object.assign({}, currentEnv, {
    NODE_ENV: 'production',
  });
  // 있으면 갱신, 없으면 기존 값 유지 — 빈 문자열로 덮지 않는다
  for (const k of ['POLYGON_API_KEY', 'INTRINIO_API_KEY', 'FMP_API_KEY',
                   'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
                   'EC2_REDIS_PROXY_URL', 'REDIS_PROXY_KEY']) {
    const v = process.env[k];
    if (v && v !== '[SENSITIVE]') envVars[k] = v;
  }
  if (!envVars.INTRINIO_API_KEY) {
    throw new Error('INTRINIO_API_KEY 가 없다 — 배포를 중단한다. 키 없이 올리면 전건 실패한다(2026-08-29 실화).');
  }
  if (!envVars.INTRINIO_BASE_URL) envVars.INTRINIO_BASE_URL = 'https://api-v2.intrinio.com';
  console.log('Env:', Object.keys(envVars).length, '개 (기존 보존 + 갱신)');

  if (functionExists) {
    // Update code
    await lambda.send(new UpdateFunctionCodeCommand({
      FunctionName: FUNCTION_NAME,
      ZipFile: zipBuffer,
    }));
    console.log('Lambda code updated');

    // Wait for update to propagate
    await new Promise(r => setTimeout(r, 5000));

    // Update configuration
    await lambda.send(new UpdateFunctionConfigurationCommand({
      FunctionName: FUNCTION_NAME,
      Timeout: 900,      // 15 minutes (v2.2+)
      MemorySize: 1024,   // 1GB
      Environment: { Variables: envVars },
    }));
    console.log('Lambda config updated (900s, 1024MB)');
  } else {
    // Create new function
    await lambda.send(new CreateFunctionCommand({
      FunctionName: FUNCTION_NAME,
      Runtime: 'nodejs20.x',
      Handler: 'index.handler',
      Role: roleArn,
      Code: { ZipFile: zipBuffer },
      Timeout: 900,
      MemorySize: 1024,
      Environment: { Variables: envVars },
      Description: 'Flow page warm cache — Dark Pool, Short Volume, Block Trades (independent from signum-harvest)',
    }));
    console.log('Lambda function created: ' + FUNCTION_NAME);

    // Wait for creation
    await new Promise(r => setTimeout(r, 5000));
  }

  // ── EventBridge Schedule ──
  console.log('Setting up EventBridge schedule...');
  const eb = new EventBridgeClient({ region: REGION });

  // Create rule: every 5 minutes
  await eb.send(new PutRuleCommand({
    Name: RULE_NAME,
    ScheduleExpression: 'rate(5 minutes)',
    State: 'ENABLED',
    Description: 'Trigger signum-flow-harvest every 5 minutes (Flow page warm)',
  }));
  console.log('EventBridge rule created: ' + RULE_NAME + ' (rate(5 minutes))');

  // Get Lambda ARN for target
  const fnInfo = await lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
  const lambdaArn = fnInfo.Configuration.FunctionArn;

  // Set Lambda as target
  await eb.send(new PutTargetsCommand({
    Rule: RULE_NAME,
    Targets: [{ Id: FUNCTION_NAME + '-target', Arn: lambdaArn }],
  }));
  console.log('EventBridge target set: ' + lambdaArn);

  // Add permission for EventBridge to invoke Lambda
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
  console.log('  Schedule: ' + RULE_NAME + ' (every 5 min)');
  console.log('  Tickers: ' + universe.length);
  console.log('  Timeout: 900s, Memory: 1024MB');
  console.log('\nTo test manually:');
  console.log('  aws lambda invoke --function-name ' + FUNCTION_NAME + ' --region ' + REGION + ' --no-cli-pager out.json && type out.json');
}

deploy().catch(e => {
  console.error('Deploy error:', e.message);
  process.exit(1);
});
