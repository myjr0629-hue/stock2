#!/usr/bin/env node
// XS-3.0 배포 — Lambda signum-xs3 (신규) · DynamoDB signum-xs3-history (신규) · EventBridge signum-xs3-daily (신규)
// 기존 리소스(signum-xs 등)는 «읽기»만 한다: env 는 signum-xs 의 것을 메모리에서 복사(값 출력 금지). macOS 전용(/usr/bin/zip).
// 사용: node scripts/deploy-xs3.js [--code-only]   (REPO/.env.local 의 AWS 키 사용; /tmp 아닌 저장소 루트에서 실행)
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const { LambdaClient, GetFunctionConfigurationCommand, CreateFunctionCommand, UpdateFunctionCodeCommand, UpdateFunctionConfigurationCommand, AddPermissionCommand, GetFunctionCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient, DescribeTableCommand, CreateTableCommand } = require('@aws-sdk/client-dynamodb');
const { EventBridgeClient, PutRuleCommand, PutTargetsCommand } = require('@aws-sdk/client-eventbridge');
const REGION = 'us-east-1', FN = 'signum-xs3', SRC_FN = 'signum-xs', TABLE = 'signum-xs3-history', RULE = 'signum-xs3-daily', CRON = 'cron(25 22 ? * MON-FRI *)';
const ROOT = path.resolve(__dirname, '..'); const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8'); for (const l of env.split('\n')) { const m = l.match(/^(AWS_[A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ''); }
const codeOnly = process.argv.includes('--code-only');
const lambda = new LambdaClient({ region: REGION }), ddb = new DynamoDBClient({ region: REGION }), eb = new EventBridgeClient({ region: REGION });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitActive() { for (let i = 0; i < 30; i++) { const c = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: FN })); if (c.State === 'Active' && c.LastUpdateStatus !== 'InProgress') return c; await sleep(2000); } throw new Error('lambda not active'); }
(async () => {
  // 1) 테이블
  try { await ddb.send(new DescribeTableCommand({ TableName: TABLE })); console.log(`[table] ${TABLE} exists`); } catch (e) { if (e.name !== 'ResourceNotFoundException') throw e; await ddb.send(new CreateTableCommand({ TableName: TABLE, BillingMode: 'PAY_PER_REQUEST', AttributeDefinitions: [{ AttributeName: 'ticker', AttributeType: 'S' }, { AttributeName: 'date', AttributeType: 'S' }], KeySchema: [{ AttributeName: 'ticker', KeyType: 'HASH' }, { AttributeName: 'date', KeyType: 'RANGE' }], Tags: [{ Key: 'project', Value: 'signum-xs3' }, { Key: 'mode', Value: 'shadow' }] })); console.log(`[table] ${TABLE} created (PAY_PER_REQUEST)`); for (let i = 0; i < 30; i++) { const d = await ddb.send(new DescribeTableCommand({ TableName: TABLE })); if (d.Table.TableStatus === 'ACTIVE') break; await sleep(2000); } }
  // 2) zip
  const dir = path.join(ROOT, 'scripts', 'lambda-xs3'); const zip = '/tmp/signum-xs3.zip'; try { fs.unlinkSync(zip); } catch {} execSync(`cd "${dir}" && /usr/bin/zip -q -r ${zip} index.js`); const code = fs.readFileSync(zip); console.log(`[zip] ${code.length} bytes`);
  // 3) 함수
  let exists = true; try { await lambda.send(new GetFunctionCommand({ FunctionName: FN })); } catch (e) { if (e.name === 'ResourceNotFoundException') exists = false; else throw e; }
  if (!exists) {
    const src = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: SRC_FN }));
    const vars = { ...(src.Environment && src.Environment.Variables) }; // 값은 절대 출력하지 않는다
    const keep = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'REDIS_PROXY_KEY', 'EC2_REDIS_PROXY_KEY', 'EC2_REDIS_PROXY_URL', 'FMP_API_KEY'];
    const Variables = {}; for (const k of keep) if (vars[k]) Variables[k] = vars[k]; Variables.XS3_MODE = 'shadow';
    console.log(`[fn] creating ${FN} · role ${src.Role.split('/').pop()} · env keys ${Object.keys(Variables).join(',')}`);
    await lambda.send(new CreateFunctionCommand({ FunctionName: FN, Runtime: 'nodejs20.x', Role: src.Role, Handler: 'index.handler', Code: { ZipFile: code }, Timeout: 900, MemorySize: 1024, Description: 'SIGNUM XS-3.0 shadow score (S&P 500 trading universe) — no orders, no app/web coupling', Environment: { Variables }, Tags: { project: 'signum-xs3', mode: 'shadow' } }));
  } else { await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: FN, ZipFile: code })); console.log(`[fn] code updated`); if (!codeOnly) { await waitActive(); await lambda.send(new UpdateFunctionConfigurationCommand({ FunctionName: FN, Timeout: 900, MemorySize: 1024 })); } }
  const cfg = await waitActive(); console.log(`[fn] ${FN} ${cfg.State} · ${cfg.Runtime} · ${cfg.Timeout}s/${cfg.MemorySize}MB · sha ${cfg.CodeSha256.slice(0, 12)} · env keys ${Object.keys((cfg.Environment || {}).Variables || {}).join(',')}`);
  // 4) 스케줄
  if (!codeOnly) {
    const rule = await eb.send(new PutRuleCommand({ Name: RULE, ScheduleExpression: CRON, State: 'ENABLED', Description: 'XS-3.0 shadow run after signum-xs (22:10 UTC)' }));
    await eb.send(new PutTargetsCommand({ Rule: RULE, Targets: [{ Id: 'xs3', Arn: cfg.FunctionArn }] }));
    try { await lambda.send(new AddPermissionCommand({ FunctionName: FN, StatementId: 'eventbridge-xs3-daily', Action: 'lambda:InvokeFunction', Principal: 'events.amazonaws.com', SourceArn: rule.RuleArn })); } catch (e) { if (e.name !== 'ResourceConflictException') throw e; }
    console.log(`[rule] ${RULE} ${CRON} → ${FN}`);
  }
  console.log('[done]');
})().catch((e) => { console.error('[deploy-xs3] FAILED', e.name, e.message); process.exit(1); });
