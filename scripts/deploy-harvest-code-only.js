#!/usr/bin/env node
// ============================================================================
// deploy-harvest-code-only — signum-harvest 코드«만» 올린다.
//
// 왜 별도 스크립트인가: 기존 배포 경로는 UpdateFunctionConfiguration 으로
// Environment 를 통째로 넘긴다. 그게 예전에 살아있던 INTRINIO 키를 지워
// 정규장 내내 수집이 죽은 적이 있다. 여기서는 Environment 를 읽지도 쓰지도
// 않고, 배포 전후 «개수»를 찍어 보존을 눈으로 확인한다.
// ============================================================================
// 코드만 갱신한다. Environment 는 «읽지도 쓰지도» 않는다 —
// 예전에 Environment 전체 치환으로 살아있던 INTRINIO 키를 지운 적이 있다.
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { LambdaClient, UpdateFunctionCodeCommand, GetFunctionConfigurationCommand } = require('@aws-sdk/client-lambda');
const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
const FN = 'signum-harvest', SRC = path.resolve('harvest_lambda'), ZIP = '/tmp/harvest-deploy.zip';
const ready = async () => {
  for (let i = 0; i < 40; i++) {
    const c = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: FN }));
    if (c.LastUpdateStatus !== 'InProgress' && c.State !== 'Pending') return c;
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('timeout');
};
(async () => {
  const before = await ready();
  const envCount = Object.keys((before.Environment && before.Environment.Variables) || {}).length;
  console.log(`배포 전: CodeSize ${Math.round(before.CodeSize / 1024)}KB · 환경변수 ${envCount}개`);
  if (fs.existsSync(ZIP)) fs.unlinkSync(ZIP);
  execSync(`cd "${SRC}" && /usr/bin/zip -q -r "${ZIP}" . -x "*.git*" "*.DS_Store" "*.zip"`, { stdio: 'pipe' });
  const buf = fs.readFileSync(ZIP);
  console.log(`zip ${(buf.length / 1048576).toFixed(1)}MB`);
  await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: FN, ZipFile: buf }));
  const after = await ready();
  const envAfter = Object.keys((after.Environment && after.Environment.Variables) || {}).length;
  console.log(`배포 후: ${after.LastUpdateStatus} · CodeSize ${Math.round(after.CodeSize / 1024)}KB · 환경변수 ${envAfter}개`);
  console.log(envAfter === envCount ? '✅ 환경변수 보존됨' : `❌ 환경변수 변동 ${envCount}→${envAfter}`);
})().catch(e => { console.error('실패:', e.name, e.message); process.exit(1); });
