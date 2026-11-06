/**
 * Deploy the XS paper-trade engine (scripts/lambda-xs-paper/index.js) as `signum-xs-paper`.
 *
 *   1. Creates DynamoDB `signum-trade-journal` (PK pk / SK sk, on-demand) if missing.
 *   2. Packages the zero-dependency engine as a single-file Lambda.
 *   3. EventBridge `signum-xs-paper-daily`: weekdays 22:40 UTC (30 min after signum-xs).
 *
 * Stage A of .agent/XS_AUTOTRADE_PREREG.md — paper fills only, no broker, no creds.
 * Run: node scripts/deploy-xs-paper.js   (first-time setup / schedule)
 * Code-only updates of the live function: node scripts/deploy-xs-code-only.js paper --publish
 * (never touches Environment/schedule; verifies the uploaded CodeSha256 and VERSION).
 */
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const {
  LambdaClient, CreateFunctionCommand, UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand, GetFunctionCommand, AddPermissionCommand,
} = require('@aws-sdk/client-lambda');
const { EventBridgeClient, PutRuleCommand, PutTargetsCommand } = require('@aws-sdk/client-eventbridge');
const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

const REGION = 'us-east-1';
const FUNCTION_NAME = 'signum-xs-paper';
const RULE_NAME = 'signum-xs-paper-daily';
const TABLE = 'signum-trade-journal';

const env = {
  UPSTASH_REDIS_REST_URL: (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').trim(),
  UPSTASH_REDIS_REST_TOKEN: (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '').trim(),
};
for (const name of ['INTRINIO_API_KEY', 'INTRINIO_BASE_URL']) {
  if (process.env[name]?.trim()) env[name] = process.env[name].trim();
}

async function ensureTable() {
  const db = new DynamoDBClient({ region: REGION });
  try {
    await db.send(new DescribeTableCommand({ TableName: TABLE }));
    console.log(`Table ${TABLE} exists`);
    return;
  } catch (e) {
    if (e.name !== 'ResourceNotFoundException') throw e;
  }
  await db.send(new CreateTableCommand({
    TableName: TABLE,
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: 'S' },
      { AttributeName: 'sk', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'pk', KeyType: 'HASH' },
      { AttributeName: 'sk', KeyType: 'RANGE' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  }));
  console.log(`Table ${TABLE} creating…`);
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const d = await db.send(new DescribeTableCommand({ TableName: TABLE }));
    if (d.Table.TableStatus === 'ACTIVE') { console.log('Table ACTIVE'); return; }
  }
  throw new Error('table did not become ACTIVE');
}

async function deploy() {
  await ensureTable();

  const lambdaDir = path.join(__dirname, 'lambda-xs-paper');
  const zipPath = path.join(__dirname, 'lambda-xs-paper.zip');
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  const { execSync } = require('child_process');
  if (process.platform === 'win32') execSync(`powershell -command "Compress-Archive -Path '${lambdaDir}\\\\index.js' -DestinationPath '${zipPath}' -Force"`, { stdio: 'pipe' });
  else execSync(`/usr/bin/zip -q -j "${zipPath}" "${path.join(lambdaDir, 'index.js')}"`, { stdio: 'pipe' });
  console.log('Zip:', Math.round(fs.statSync(zipPath).size / 1024) + 'KB');

  const lambda = new LambdaClient({ region: REGION });
  const zipBuffer = fs.readFileSync(zipPath);

  let existing;
  try { existing = await lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME })); } catch (e) {
    if (e.name !== 'ResourceNotFoundException') throw e;
  }

  const harvest = await lambda.send(new GetFunctionCommand({ FunctionName: 'signum-harvest' }));
  const roleArn = harvest.Configuration.Role;
  console.log('Role:', roleArn);

  if (existing) {
    await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: FUNCTION_NAME, ZipFile: zipBuffer }));
    await new Promise(r => setTimeout(r, 5000));
    await lambda.send(new UpdateFunctionConfigurationCommand({
      FunctionName: FUNCTION_NAME, Timeout: 300, MemorySize: 768,
      Handler: 'index.handler', Runtime: 'nodejs20.x', Environment: { Variables: { ...existing.Configuration.Environment?.Variables, ...Object.fromEntries(Object.entries(env).filter(([, value]) => value)) } },
    }));
    console.log('Lambda updated');
  } else {
    await lambda.send(new CreateFunctionCommand({
      FunctionName: FUNCTION_NAME, Runtime: 'nodejs20.x', Handler: 'index.handler',
      Role: roleArn, Code: { ZipFile: zipBuffer }, Timeout: 300, MemorySize: 768,
      Environment: { Variables: env },
      Description: 'XS paper-trade validation engine (PREREG stage A) — daily post-XS',
    }));
    console.log('Lambda created');
  }
  await new Promise(r => setTimeout(r, 5000));

  const eb = new EventBridgeClient({ region: REGION });
  await eb.send(new PutRuleCommand({
    Name: RULE_NAME, ScheduleExpression: 'cron(40 22 ? * MON-FRI *)', State: 'ENABLED',
    Description: 'signum-xs-paper daily (22:40 UTC weekdays, 30 min after signum-xs)',
  }));
  const fn = await lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
  const arn = fn.Configuration.FunctionArn;
  await eb.send(new PutTargetsCommand({ Rule: RULE_NAME, Targets: [{ Id: FUNCTION_NAME + '-target', Arn: arn }] }));
  try {
    await lambda.send(new AddPermissionCommand({
      FunctionName: FUNCTION_NAME, StatementId: 'EventBridgeInvokeXsPaper',
      Action: 'lambda:InvokeFunction', Principal: 'events.amazonaws.com',
      SourceArn: 'arn:aws:events:' + REGION + ':' + arn.split(':')[4] + ':rule/' + RULE_NAME,
    }));
    console.log('EventBridge permission added');
  } catch (e) {
    if (e.name === 'ResourceConflictException') console.log('EventBridge permission exists');
    else console.warn('perm warn:', e.message);
  }
  console.log('\n✅ signum-xs-paper deployed — daily 22:40 UTC (Mon-Fri), table: ' + TABLE);
}

deploy().catch(e => { console.error(e); process.exit(1); });
