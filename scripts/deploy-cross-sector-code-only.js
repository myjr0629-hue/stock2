#!/usr/bin/env node
// ============================================================================
// deploy-cross-sector-code-only — signum-cross-sector-intel 코드«만» 올린다.
//
// 왜 별도인가: `deploy-cross-sector.js` 는 ① powershell 로 zip 을 만들어 macOS 에서
// 돌지 않고 ② UpdateFunctionConfiguration 으로 Environment 를 5개짜리로 «통째 치환»한다.
// 라이브 함수엔 FMP·INTRINIO 키 등 9개가 살아 있다 — 그 스크립트로 올리면 4개가 사라진다
// (flow-harvest 에서 실제로 났던 사고). 여기서는 Environment 를 읽지도 쓰지도 않고
// 전후 «개수»로 보존을 확인한다. EventBridge 도 건드리지 않는다.
// ============================================================================
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { LambdaClient, UpdateFunctionCodeCommand, GetFunctionConfigurationCommand } = require('@aws-sdk/client-lambda');

const region = process.env.AWS_REGION || 'us-east-1';
const creds = { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY };
const lambda = new LambdaClient({ region, credentials: creds });

const FN = 'signum-cross-sector-intel';
const SRC = path.resolve('scripts/lambda-cross-sector');
const ZIP = '/tmp/cross-sector-deploy.zip';

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
  console.log(`배포 전: CodeSize ${Math.round(before.CodeSize / 1024)}KB · 환경변수 ${envBefore}개 · 수정 ${before.LastModified}`);

  // 의존성은 배포 시점에 깔끔히 설치한다 (dev 제외).
  execSync(`cd "${SRC}" && npm install --omit=dev --no-audit --no-fund`, { stdio: 'pipe' });
  if (fs.existsSync(ZIP)) fs.unlinkSync(ZIP);
  execSync(`cd "${SRC}" && /usr/bin/zip -q -r "${ZIP}" . -x "*.git*" "*.DS_Store" "*.zip" "_old_lambda.txt"`, { stdio: 'pipe' });
  const buf = fs.readFileSync(ZIP);
  console.log(`zip ${(buf.length / 1048576).toFixed(1)}MB`);

  await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: FN, ZipFile: buf }));
  const after = await ready();
  const envAfter = Object.keys((after.Environment && after.Environment.Variables) || {}).length;
  console.log(`배포 후: ${after.LastUpdateStatus} · CodeSize ${Math.round(after.CodeSize / 1024)}KB · 환경변수 ${envAfter}개 · 수정 ${after.LastModified}`);
  console.log(envAfter === envBefore ? '✅ 환경변수 보존됨' : `❌ 환경변수 변동 ${envBefore}→${envAfter}`);
  if (envAfter !== envBefore) process.exit(1);
})().catch((e) => { console.error('배포 실패:', e.message); process.exit(1); });
