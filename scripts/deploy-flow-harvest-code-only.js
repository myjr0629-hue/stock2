#!/usr/bin/env node
// ============================================================================
// deploy-flow-harvest-code-only — signum-flow-harvest 코드«만» 올린다.
//
// 왜 별도인가 (런북에 적힌 두 가지 사고를 둘 다 피한다):
//   ① `deploy-flow-harvest.js` 는 UpdateFunctionConfiguration 으로 Environment 를
//      넘긴다. 그게 예전에 살아있던 INTRINIO 키를 지워 정규장 내내 수집이 죽었다.
//      → 여기서는 Environment 를 **읽지도 쓰지도** 않고, 전후 «개수»로 보존을 확인한다.
//   ② 그 스크립트는 `signum-flow-harvest-5min` 룰을 **매번 다시 켠다**.
//      그 룰은 샤드 4개와 겹쳐 예산을 두 배로 태우므로 꺼져 있어야 한다.
//      → 여기서는 EventBridge 를 아예 건드리지 않고, 끝나면 상태만 확인해 준다.
// ============================================================================
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { LambdaClient, UpdateFunctionCodeCommand, GetFunctionConfigurationCommand } = require('@aws-sdk/client-lambda');
const { EventBridgeClient, ListRulesCommand } = require('@aws-sdk/client-eventbridge');

const region = process.env.AWS_REGION || 'us-east-1';
const creds = { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY };
const lambda = new LambdaClient({ region, credentials: creds });
const events = new EventBridgeClient({ region, credentials: creds });

const FN = 'signum-flow-harvest';
const SRC = path.resolve('scripts/lambda-flow-harvest');
const ZIP = '/tmp/flow-harvest-deploy.zip';

const ready = async () => {
  for (let i = 0; i < 60; i++) {
    const c = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: FN }));
    if (c.LastUpdateStatus !== 'InProgress' && c.State !== 'Pending') return c;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('배포 대기 시간 초과');
};

(async () => {
  const before = await ready();
  const envBefore = Object.keys((before.Environment && before.Environment.Variables) || {}).length;
  console.log(`배포 전: CodeSize ${Math.round(before.CodeSize / 1024)}KB · 환경변수 ${envBefore}개`);

  if (fs.existsSync(ZIP)) fs.unlinkSync(ZIP);
  execSync(`cd "${SRC}" && /usr/bin/zip -q -r "${ZIP}" . -x "*.git*" "*.DS_Store" "*.zip"`, { stdio: 'pipe' });
  const buf = fs.readFileSync(ZIP);
  console.log(`zip ${(buf.length / 1048576).toFixed(1)}MB`);

  await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: FN, ZipFile: buf }));
  const after = await ready();
  const envAfter = Object.keys((after.Environment && after.Environment.Variables) || {}).length;
  console.log(`배포 후: ${after.LastUpdateStatus} · CodeSize ${Math.round(after.CodeSize / 1024)}KB · 환경변수 ${envAfter}개`);
  console.log(envAfter === envBefore ? '✅ 환경변수 보존됨' : `❌ 환경변수 변동 ${envBefore}→${envAfter}`);

  // 룰 상태 확인 — 켜져 있으면 예산이 두 배로 나간다.
  const r = await events.send(new ListRulesCommand({ NamePrefix: 'signum-flow-harvest' }));
  for (const rule of r.Rules || []) {
    console.log(`${rule.State === 'ENABLED' ? '🟢' : '🔴'} ${rule.Name} ${rule.ScheduleExpression || ''}`);
  }
  const bad = (r.Rules || []).find((x) => x.Name === 'signum-flow-harvest-5min' && x.State === 'ENABLED');
  if (bad) console.log('⚠️ signum-flow-harvest-5min 이 켜져 있다 — 샤드와 겹쳐 예산을 두 배로 태운다. 꺼야 한다.');
})().catch((e) => { console.error('실패:', e.name, e.message); process.exit(1); });
