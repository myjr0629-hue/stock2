#!/usr/bin/env node
// ============================================================================
// deploy-13f-code-only — signum-13f 코드«만» 올린다 (SEC Form 13F Data Sets 빌더, 2026-10-07).
//
// 왜 별도인가: `deploy-13f.js` 는 UpdateFunctionConfiguration 으로 Environment 를 «통째로» 넘긴다
//   (Upstash 토큰이 로컬에 없으면 실행도 안 되고, 있어도 Lambda 의 살아 있는 값을 덮는다 — flow-harvest 에서 키가 지워져 수집이 죽은 사고와 같은 모양).
//   → 여기서는 Environment 를 읽지도 쓰지도 않고, 전후 «개수»로 보존을 확인한다. EventBridge 룰도 건드리지 않고 상태만 보여 준다.
//
// 사용(저장소 루트 — .env.local 의 AWS 키를 쓴다):
//   node scripts/deploy-13f-code-only.js           # 코드 업로드(+ 상태 확인)
//   node scripts/deploy-13f-code-only.js --invoke  # 올린 뒤 한 번 실행하고 로그 꼬리를 보여 준다(FORCE=1 아님 — 같은 파일이면 «변경 없음»으로 끝난다)
//
// 코드 정본은 scripts/build-13f-cache.js — 이 스크립트가 scripts/lambda-13f/index.js 로 복사해 압축한다(의존성 0, 파일 하나).
// ============================================================================
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
// AWS 키: ENV_FILE(워크트리에서 돌릴 때 주 저장소의 .env.local 경로) → 없으면 현재 폴더의 .env.local
for (const l of fs.readFileSync(process.env.ENV_FILE || path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { LambdaClient, UpdateFunctionCodeCommand, GetFunctionConfigurationCommand, InvokeCommand } = require('@aws-sdk/client-lambda');
const { EventBridgeClient, ListRulesCommand } = require('@aws-sdk/client-eventbridge');

const region = process.env.AWS_REGION || 'us-east-1';
const creds = { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY };
const lambda = new LambdaClient({ region, credentials: creds });
const events = new EventBridgeClient({ region, credentials: creds });

const FN = 'signum-13f';
const SRC_DIR = path.resolve('scripts/lambda-13f');
const BUILDER = path.resolve('scripts/build-13f-cache.js');
const ZIP = path.join(require('os').tmpdir(), 'signum-13f-deploy.zip');

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
  console.log(`배포 전: ${before.Runtime} · ${before.MemorySize}MB · ${before.Timeout}s · CodeSize ${Math.round(before.CodeSize / 1024)}KB · 환경변수 ${envBefore}개 · 최종수정 ${before.LastModified}`);

  fs.mkdirSync(SRC_DIR, { recursive: true });
  fs.copyFileSync(BUILDER, path.join(SRC_DIR, 'index.js'));
  if (fs.existsSync(ZIP)) fs.unlinkSync(ZIP);
  execSync(`cd "${SRC_DIR}" && /usr/bin/zip -q -r "${ZIP}" . -x "*.git*" "*.DS_Store" "*.zip"`, { stdio: 'pipe' });
  const buf = fs.readFileSync(ZIP);
  console.log(`zip ${(buf.length / 1024).toFixed(1)}KB (${execSync(`unzip -Z1 "${ZIP}"`).toString().trim().split('\n').join(', ')})`);

  await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: FN, ZipFile: buf }));
  const after = await ready();
  const envAfter = Object.keys((after.Environment && after.Environment.Variables) || {}).length;
  console.log(`배포 후: ${after.LastUpdateStatus} · CodeSize ${Math.round(after.CodeSize / 1024)}KB · 환경변수 ${envAfter}개 · ${after.LastModified}`);
  console.log(envAfter === envBefore ? '✅ 환경변수 보존됨' : `❌ 환경변수 변동 ${envBefore}→${envAfter}`);

  const r = await events.send(new ListRulesCommand({ NamePrefix: 'signum-13f' }));
  for (const rule of r.Rules || []) console.log(`${rule.State === 'ENABLED' ? '🟢' : '🔴'} ${rule.Name} ${rule.ScheduleExpression || ''}`);

  if (process.argv.includes('--invoke')) {
    console.log('\n실행 중(동기)…');
    const t0 = Date.now();
    const res = await lambda.send(new InvokeCommand({ FunctionName: FN, InvocationType: 'RequestResponse', LogType: 'Tail', Payload: Buffer.from('{}') }));
    console.log(`응답 ${res.StatusCode}${res.FunctionError ? ' · 함수 오류: ' + res.FunctionError : ''} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    if (res.LogResult) console.log(Buffer.from(res.LogResult, 'base64').toString('utf8'));
    if (res.Payload) console.log('Payload:', Buffer.from(res.Payload).toString('utf8').slice(0, 1500));
  }
})().catch((e) => { console.error('실패:', e.name, e.message); process.exit(1); });
