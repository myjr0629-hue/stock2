/**
 * ⚠️ 최초 생성(함수·주간 일정)용. 이미 있는 함수의 코드 갱신은 `node scripts/deploy-13f-code-only.js` — 이 스크립트는 Environment 를 통째로 덮는다.
 *
 * Deploy scripts/build-13f-cache.js as the `signum-13f` Lambda + weekly schedule.
 * (2026-10-07: 원천이 SEC Form 13F Data Sets 로 바뀌었다 — Massive 키는 더 필요 없다. 주 1회 실행하되 새 데이터셋이 없으면 «변경 없음»으로 바로 끝난다.)
 *
 * The builder is zero-dependency (Upstash REST via global fetch), so the Lambda
 * package is just a single index.js — no npm install / node_modules.
 *
 *   - Full-universe quarterly 13-F ingest → CUSIP reverse-index in Redis.
 *   - EventBridge: weekly (Sun 06:00 UTC). 13-F changes only ~4x/year, so weekly
 *     comfortably catches each ~45-day filing window with no stale gaps.
 *   - Reuses the IAM role from signum-harvest.
 *
 * Run: node scripts/deploy-13f.js
 */
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
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

const REGION = 'us-east-1';
const FUNCTION_NAME = 'signum-13f';
const RULE_NAME = 'signum-13f-weekly';

const env = {
  UPSTASH_REDIS_REST_URL: (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').trim(),
  UPSTASH_REDIS_REST_TOKEN: (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '').trim(),
};
if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
  console.error('ERROR: UPSTASH_REDIS_REST_URL/TOKEN not set in .env.local');
  process.exit(1);
}

// Package: single-file Lambda (the builder already exports.handler).
const lambdaDir = path.join(__dirname, 'lambda-13f');
fs.mkdirSync(lambdaDir, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'build-13f-cache.js'), path.join(lambdaDir, 'index.js'));

const AdmZip = (() => { try { return require('adm-zip'); } catch { return null; } })();
const zipPath = path.join(require('os').tmpdir(), 'lambda-13f.zip');
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
if (AdmZip) {
  const z = new AdmZip();
  z.addLocalFile(path.join(lambdaDir, 'index.js'));
  z.writeZip(zipPath);
} else if (process.platform === 'win32') {
  const { execSync } = require('child_process');
  execSync(`powershell -command "Compress-Archive -Path '${lambdaDir}\\\\index.js' -DestinationPath '${zipPath}' -Force"`, { stdio: 'pipe' });
} else {
  const { execSync } = require('child_process');
  execSync(`cd "${lambdaDir}" && /usr/bin/zip -q "${zipPath}" index.js`, { stdio: 'pipe' });
}
console.log('Zip:', Math.round(fs.statSync(zipPath).size / 1024) + 'KB');

async function deploy() {
  const lambda = new LambdaClient({ region: REGION });
  const zipBuffer = fs.readFileSync(zipPath);

  let exists = false;
  try { await lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME })); exists = true; } catch {}

  let roleArn = '';
  try {
    const harvest = await lambda.send(new GetFunctionCommand({ FunctionName: 'signum-harvest' }));
    roleArn = harvest.Configuration.Role;
    console.log('Using role from signum-harvest:', roleArn);
  } catch {
    console.error('ERROR: cannot determine Lambda role from signum-harvest.');
    process.exit(1);
  }

  if (exists) {
    await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: FUNCTION_NAME, ZipFile: zipBuffer }));
    await new Promise(r => setTimeout(r, 5000));
    await lambda.send(new UpdateFunctionConfigurationCommand({
      FunctionName: FUNCTION_NAME,
      Timeout: 900, MemorySize: 3008, Handler: 'index.handler', Runtime: 'nodejs20.x',
      Environment: { Variables: env },
    }));
    console.log('Lambda updated: ' + FUNCTION_NAME + ' (900s, 3008MB) — ⚠️ Environment 를 통째로 덮었다');
  } else {
    await lambda.send(new CreateFunctionCommand({
      FunctionName: FUNCTION_NAME,
      Runtime: 'nodejs20.x', Handler: 'index.handler', Role: roleArn,
      Code: { ZipFile: zipBuffer }, Timeout: 900, MemorySize: 3008,
      Environment: { Variables: env },
      Description: 'SEC Form 13F Data Sets → CUSIP reverse-index in Redis (weekly check, quarterly write)',
    }));
    console.log('Lambda created: ' + FUNCTION_NAME);
  }
  await new Promise(r => setTimeout(r, 5000));

  // EventBridge: weekly Sunday 06:00 UTC.
  const eb = new EventBridgeClient({ region: REGION });
  await eb.send(new PutRuleCommand({
    Name: RULE_NAME,
    ScheduleExpression: 'cron(0 6 ? * SUN *)',
    State: 'ENABLED',
    Description: 'Trigger signum-13f weekly (Sun 06:00 UTC)',
  }));
  const fn = await lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
  const arn = fn.Configuration.FunctionArn;
  await eb.send(new PutTargetsCommand({ Rule: RULE_NAME, Targets: [{ Id: FUNCTION_NAME + '-target', Arn: arn }] }));
  try {
    await lambda.send(new AddPermissionCommand({
      FunctionName: FUNCTION_NAME,
      StatementId: 'EventBridgeInvoke13f',
      Action: 'lambda:InvokeFunction',
      Principal: 'events.amazonaws.com',
      SourceArn: 'arn:aws:events:' + REGION + ':' + arn.split(':')[4] + ':rule/' + RULE_NAME,
    }));
    console.log('EventBridge invoke permission added');
  } catch (e) {
    if (e.name === 'ResourceConflictException') console.log('EventBridge permission already exists');
    else console.warn('Permission warning:', e.message);
  }

  console.log('\n✅ Deploy complete!');
  console.log('  Function: ' + FUNCTION_NAME + ' (900s, 3008MB)');
  console.log('  Schedule: ' + RULE_NAME + ' (weekly, Sun 06:00 UTC)');
}

deploy().catch(e => { console.error('Deploy error:', e.message); process.exit(1); });
