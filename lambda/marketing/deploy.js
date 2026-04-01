// ═══════════════════════════════════════════════════════════════════
// Deploy Marketing Lambda + EventBridge Schedules
// 실행: node lambda/marketing/deploy.js
//
// 1. Lambda 함수 생성/업데이트 (signum-marketing)
// 2. EventBridge 스케줄 규칙 생성 (5개 cron)
// 3. 환경변수 설정 (BUFFER_ACCESS_TOKEN 등)
//
// 스위치 ON/OFF: EventBridge 규칙 enable/disable
// ═══════════════════════════════════════════════════════════════════

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });

const { LambdaClient, CreateFunctionCommand, UpdateFunctionCodeCommand,
        UpdateFunctionConfigurationCommand, GetFunctionCommand, AddPermissionCommand } = require('@aws-sdk/client-lambda');
const { EventBridgeClient, PutRuleCommand, PutTargetsCommand,
        EnableRuleCommand, DisableRuleCommand } = require('@aws-sdk/client-eventbridge');
const { IAMClient, GetRoleCommand } = require('@aws-sdk/client-iam');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REGION = process.env.AWS_REGION || 'us-east-1';
const FUNCTION_NAME = 'signum-marketing';
const ROLE_NAME = 'signum-lambda-role';

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

const lambda = new LambdaClient({ region: REGION, credentials });
const events = new EventBridgeClient({ region: REGION, credentials });
const iam = new IAMClient({ region: REGION, credentials });

// EventBridge schedules — 전부 DISABLED로 생성 (스위치 OFF 기본)
const SCHEDULES = [
  { name: 'signum-marketing-pulse',     cron: 'cron(35 20 ? * MON-FRI *)',  action: 'pulse',        desc: 'Daily Market Pulse (20:35 UTC = 장 마감 후)' },
  { name: 'signum-marketing-morning',   cron: 'cron(5 12 ? * MON-FRI *)',   action: 'morning',      desc: 'Morning Briefing (12:05 UTC = 프리마켓)' },
  { name: 'signum-marketing-education', cron: 'cron(0 16 ? * TUE,THU *)',   action: 'education',    desc: 'Education Content (화/목 16:00 UTC)' },
  { name: 'signum-marketing-event',     cron: 'rate(5 minutes)',             action: 'event-detect', desc: 'Event Detection (5분마다)' },
  { name: 'signum-marketing-video',     cron: 'cron(45 20 ? * MON-FRI *)',  action: 'video',        desc: 'Video Render (20:45 UTC = 장 마감 후)' },
];

async function main() {
  const mode = process.argv[2] || 'deploy'; // deploy | enable | disable | test

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  SIGNUM Marketing Lambda — ${mode.toUpperCase()}`);
  console.log(`${'═'.repeat(60)}\n`);

  if (mode === 'deploy') {
    await deployLambda();
    await createSchedules();
    console.log('\n✅ 배포 완료 — 스케줄은 DISABLED 상태');
    console.log('💡 활성화: node lambda/marketing/deploy.js enable');
  } else if (mode === 'enable') {
    await toggleSchedules(true);
    console.log('\n✅ 모든 스케줄 활성화됨 — Buffer 발송 시작!');
  } else if (mode === 'disable') {
    await toggleSchedules(false);
    console.log('\n✅ 모든 스케줄 비활성화됨 — Buffer 발송 중지');
  } else if (mode === 'test') {
    await testInvoke();
  }
}

// ── Lambda 배포 ─────────────────────────────────────────────────
async function deployLambda() {
  console.log('📦 Packaging Lambda...');

  // Create zip with handler + node_modules
  const tmpDir = path.resolve(__dirname, '../../.tmp-lambda-marketing');
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  // Copy handler
  fs.copyFileSync(path.resolve(__dirname, 'index.js'), path.join(tmpDir, 'index.js'));

  // Install dependencies
  const pkg = { name: 'signum-marketing', version: '1.0.0', dependencies: { '@upstash/redis': '*', '@aws-sdk/client-polly': '*', '@aws-sdk/client-s3': '*' } };
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(pkg));
  console.log('📥 Installing dependencies...');
  execSync('npm install --production --silent', { cwd: tmpDir });

  // Create zip
  const zipPath = path.resolve(__dirname, 'marketing-lambda.zip');
  console.log('🗜️ Creating zip...');
  try {
    execSync(`powershell Compress-Archive -Path "${tmpDir}\\*" -DestinationPath "${zipPath}" -Force`);
  } catch {
    execSync(`cd "${tmpDir}" && zip -r "${zipPath}" .`, { shell: true });
  }

  const zipBuffer = fs.readFileSync(zipPath);
  console.log(`📦 Zip size: ${(zipBuffer.length / 1024 / 1024).toFixed(1)} MB`);

  // Get IAM role ARN
  let roleArn;
  try {
    const roleRes = await iam.send(new GetRoleCommand({ RoleName: ROLE_NAME }));
    roleArn = roleRes.Role.Arn;
    console.log(`🔑 Role: ${roleArn}`);
  } catch {
    console.error(`❌ IAM Role '${ROLE_NAME}' not found. Create it first.`);
    console.log('   Role needs: AWSLambdaBasicExecutionRole + AmazonPollyFullAccess + AmazonS3FullAccess');
    return;
  }

  // Environment variables for Lambda
  const envVars = {
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || '',
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || '',
    BUFFER_ACCESS_TOKEN: process.env.BUFFER_ACCESS_TOKEN || '',
    BUFFER_ORGANIZATION_ID: process.env.BUFFER_ORGANIZATION_ID || '',
    S3_MARKETING_BUCKET: process.env.S3_MARKETING_BUCKET || 'signum-marketing',
    AWS_REGION_CUSTOM: REGION,
    DRY_RUN: 'false',
  };

  // Create or update function
  try {
    await lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
    console.log('🔄 Updating existing function...');
    await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: FUNCTION_NAME, ZipFile: zipBuffer }));
    // Wait for update to complete
    await new Promise(r => setTimeout(r, 3000));
    await lambda.send(new UpdateFunctionConfigurationCommand({
      FunctionName: FUNCTION_NAME,
      Environment: { Variables: envVars },
      Timeout: 120,
      MemorySize: 256,
    }));
  } catch (e) {
    if (e.name === 'ResourceNotFoundException') {
      console.log('🆕 Creating new function...');
      await lambda.send(new CreateFunctionCommand({
        FunctionName: FUNCTION_NAME,
        Runtime: 'nodejs20.x',
        Handler: 'index.handler',
        Role: roleArn,
        Code: { ZipFile: zipBuffer },
        Environment: { Variables: envVars },
        Timeout: 120,
        MemorySize: 256,
        Description: 'SIGNUM HQ Marketing Pipeline — Buffer 13ch + TTS + Video',
      }));
    } else throw e;
  }

  console.log('✅ Lambda deployed');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true });
  fs.unlinkSync(zipPath);
}

// ── EventBridge 스케줄 생성 ─────────────────────────────────────
async function createSchedules() {
  console.log('\n⏰ Creating EventBridge schedules...');

  // Get Lambda ARN + extract account ID
  const fn = await lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
  const lambdaArn = fn.Configuration.FunctionArn;
  const accountId = lambdaArn.split(':')[4]; // arn:aws:lambda:region:ACCOUNT_ID:function:name

  for (const sched of SCHEDULES) {
    console.log(`  📅 ${sched.name}: ${sched.cron}`);

    // Create rule (DISABLED by default)
    const ruleResult = await events.send(new PutRuleCommand({
      Name: sched.name,
      ScheduleExpression: sched.cron,
      State: 'DISABLED',
      Description: sched.desc,
    }));
    const ruleArn = ruleResult.RuleArn;

    // Set target
    await events.send(new PutTargetsCommand({
      Rule: sched.name,
      Targets: [{
        Id: `${sched.name}-target`,
        Arn: lambdaArn,
        Input: JSON.stringify({ action: sched.action, dryRun: false }),
      }],
    }));

    // Add permission for EventBridge to invoke Lambda
    try {
      await lambda.send(new AddPermissionCommand({
        FunctionName: FUNCTION_NAME,
        StatementId: `${sched.name}-invoke`,
        Action: 'lambda:InvokeFunction',
        Principal: 'events.amazonaws.com',
        SourceArn: ruleArn || `arn:aws:events:${REGION}:${accountId}:rule/${sched.name}`,
      }));
    } catch (e) {
      if (!e.message?.includes('already exists')) {
        console.warn(`  ⚠️ Permission: ${e.message?.substring(0, 80)}`);
      }
    }
  }

  console.log('✅ All schedules created (DISABLED)');
}

// ── 스케줄 ON/OFF ───────────────────────────────────────────────
async function toggleSchedules(enable) {
  for (const sched of SCHEDULES) {
    if (enable) {
      await events.send(new EnableRuleCommand({ Name: sched.name }));
      console.log(`  ✅ ${sched.name} → ENABLED`);
    } else {
      await events.send(new DisableRuleCommand({ Name: sched.name }));
      console.log(`  ⏸️ ${sched.name} → DISABLED`);
    }
  }
}

// ── 테스트 호출 ─────────────────────────────────────────────────
async function testInvoke() {
  const { InvokeCommand } = require('@aws-sdk/client-lambda');
  console.log('🧪 Test invoke (DRY_RUN)...\n');
  const result = await lambda.send(new InvokeCommand({
    FunctionName: FUNCTION_NAME,
    InvocationType: 'RequestResponse',
    Payload: JSON.stringify({ action: 'pulse', dryRun: true }),
  }));
  const payload = JSON.parse(Buffer.from(result.Payload).toString());
  console.log('Result:', JSON.stringify(payload, null, 2));
}

main().catch(e => console.error('FATAL:', e));
