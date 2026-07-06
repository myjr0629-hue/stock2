/**
 * Deploy the XS Engine (scripts/xs-engine.js) as the `signum-xs` Lambda.
 *
 *   1. Creates DynamoDB table `signum-xs-history` (PK ticker / SK date,
 *      on-demand billing) if missing — the engine's ONLY write target.
 *   2. Packages the zero-dependency engine as a single-file Lambda
 *      (nodejs20.x bundles @aws-sdk v3; Upstash via global fetch).
 *   3. Schedules EventBridge `signum-xs-daily`: weekdays 22:10 UTC
 *      (= after US close year-round: 18:10 ET summer / 17:10 ET winter).
 *
 * Shadow mode: nothing in the product reads xsScore yet. The engine only
 * READS signum-unified-cache and writes to its own table + cache:xs:* keys.
 *
 * Run: node scripts/deploy-xs.js
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
const FUNCTION_NAME = 'signum-xs';
const RULE_NAME = 'signum-xs-daily';
const TABLE = 'signum-xs-history';

const env = {
  UPSTASH_REDIS_REST_URL: (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').trim(),
  UPSTASH_REDIS_REST_TOKEN: (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '').trim(),
};

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
      { AttributeName: 'ticker', AttributeType: 'S' },
      { AttributeName: 'date', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'ticker', KeyType: 'HASH' },
      { AttributeName: 'date', KeyType: 'RANGE' },
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

  // package single-file zip
  const lambdaDir = path.join(__dirname, 'lambda-xs');
  fs.mkdirSync(lambdaDir, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'xs-engine.js'), path.join(lambdaDir, 'index.js'));
  const zipPath = path.join(__dirname, 'lambda-xs.zip');
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  const { execSync } = require('child_process');
  execSync(`powershell -command "Compress-Archive -Path '${lambdaDir}\\\\index.js' -DestinationPath '${zipPath}' -Force"`, { stdio: 'pipe' });
  console.log('Zip:', Math.round(fs.statSync(zipPath).size / 1024) + 'KB');

  const lambda = new LambdaClient({ region: REGION });
  const zipBuffer = fs.readFileSync(zipPath);

  let exists = false;
  try { await lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME })); exists = true; } catch {}

  const harvest = await lambda.send(new GetFunctionCommand({ FunctionName: 'signum-harvest' }));
  const roleArn = harvest.Configuration.Role;
  console.log('Role:', roleArn);

  if (exists) {
    await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: FUNCTION_NAME, ZipFile: zipBuffer }));
    await new Promise(r => setTimeout(r, 5000));
    await lambda.send(new UpdateFunctionConfigurationCommand({
      FunctionName: FUNCTION_NAME, Timeout: 600, MemorySize: 1536,
      Handler: 'index.handler', Runtime: 'nodejs20.x', Environment: { Variables: env },
    }));
    console.log('Lambda updated');
  } else {
    await lambda.send(new CreateFunctionCommand({
      FunctionName: FUNCTION_NAME, Runtime: 'nodejs20.x', Handler: 'index.handler',
      Role: roleArn, Code: { ZipFile: zipBuffer }, Timeout: 600, MemorySize: 1536,
      Environment: { Variables: env },
      Description: 'XS cross-sectional absolute score engine (shadow) — daily post-close',
    }));
    console.log('Lambda created');
  }
  await new Promise(r => setTimeout(r, 5000));

  const eb = new EventBridgeClient({ region: REGION });
  await eb.send(new PutRuleCommand({
    Name: RULE_NAME, ScheduleExpression: 'cron(10 22 ? * MON-FRI *)', State: 'ENABLED',
    Description: 'signum-xs daily post-close (22:10 UTC weekdays)',
  }));
  const fn = await lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
  const arn = fn.Configuration.FunctionArn;
  await eb.send(new PutTargetsCommand({ Rule: RULE_NAME, Targets: [{ Id: FUNCTION_NAME + '-target', Arn: arn }] }));
  try {
    await lambda.send(new AddPermissionCommand({
      FunctionName: FUNCTION_NAME, StatementId: 'EventBridgeInvokeXs',
      Action: 'lambda:InvokeFunction', Principal: 'events.amazonaws.com',
      SourceArn: 'arn:aws:events:' + REGION + ':' + arn.split(':')[4] + ':rule/' + RULE_NAME,
    }));
    console.log('EventBridge permission added');
  } catch (e) {
    if (e.name === 'ResourceConflictException') console.log('EventBridge permission exists');
    else console.warn('perm warn:', e.message);
  }
  console.log('\n✅ signum-xs deployed — daily 22:10 UTC (Mon-Fri), table: ' + TABLE);
}

deploy().catch(e => { console.error('Deploy error:', e.message); process.exit(1); });
