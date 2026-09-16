#!/usr/bin/env node
// ============================================================================
// deploy-xs-code-only — upload CODE ONLY to `signum-xs` and/or `signum-xs-paper`.
//
// Why not scripts/deploy-xs.js: it ① zips with powershell (never runs on macOS)
// and ② calls UpdateFunctionConfiguration with a 3-key Environment, which
// REPLACES the live env (6 keys today: POLYGON/UPSTASH×2/FMP/INTRINIO×2) and
// would silently strip the Intrinio key — the exact accident flow-harvest had.
// Same pattern as deploy-cross-sector-code-only.js: env is neither read nor
// written; the before/after key COUNT proves it survived. EventBridge untouched.
//
// Usage:
//   node scripts/deploy-xs-code-only.js xs            # scripts/lambda-xs → signum-xs
//   node scripts/deploy-xs-code-only.js paper         # scripts/lambda-xs-paper → signum-xs-paper
//   node scripts/deploy-xs-code-only.js all
//   node scripts/deploy-xs-code-only.js xs --timeout 900   # also raise Timeout (partial update: Timeout only)
// ============================================================================
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { LambdaClient, UpdateFunctionCodeCommand, UpdateFunctionConfigurationCommand, GetFunctionConfigurationCommand } = require('@aws-sdk/client-lambda');

const region = process.env.AWS_REGION || 'us-east-1';
const lambda = new LambdaClient({ region, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } });

const TARGETS = {
  xs: { fn: 'signum-xs', dir: 'scripts/lambda-xs' },
  paper: { fn: 'signum-xs-paper', dir: 'scripts/lambda-xs-paper' },
};
const args = process.argv.slice(2);
const which = args[0] === 'all' ? ['xs', 'paper'] : [args[0] || 'xs'];
const toIdx = args.indexOf('--timeout');
const timeout = toIdx >= 0 ? Number(args[toIdx + 1]) : null;
for (const w of which) if (!TARGETS[w]) { console.error(`unknown target "${w}" — use xs | paper | all`); process.exit(2); }

const ready = async (fn) => {
  for (let i = 0; i < 60; i++) {
    const c = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: fn }));
    if (c.LastUpdateStatus !== 'InProgress' && c.State !== 'Pending') return c;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('배포 대기 시간 초과');
};
const envCount = (c) => Object.keys((c.Environment && c.Environment.Variables) || {}).length;

(async () => {
  for (const w of which) {
    const { fn, dir } = TARGETS[w];
    const src = path.resolve(dir);
    for (const f of fs.readdirSync(src)) if (f.endsWith('.js')) execSync(`node --check "${path.join(src, f)}"`, { stdio: 'pipe' });
    const before = await ready(fn);
    const envBefore = envCount(before);
    console.log(`[${fn}] 배포 전: CodeSize ${Math.round(before.CodeSize / 1024)}KB · 환경변수 ${envBefore}개 · Timeout ${before.Timeout}s · 수정 ${before.LastModified}`);

    const zip = `/tmp/${fn}-deploy.zip`;
    if (fs.existsSync(zip)) fs.unlinkSync(zip);
    // zero-dependency Lambdas (@aws-sdk v3 ships in nodejs20.x) — only the .js files go up
    execSync(`cd "${src}" && /usr/bin/zip -q "${zip}" *.js`, { stdio: 'pipe' });
    const buf = fs.readFileSync(zip);
    console.log(`[${fn}] zip ${Math.round(buf.length / 1024)}KB (${fs.readdirSync(src).filter((f) => f.endsWith('.js')).join(', ')})`);

    await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: fn, ZipFile: buf }));
    let after = await ready(fn);
    if (timeout && after.Timeout !== timeout) {
      // partial update: ONLY Timeout is sent → Environment untouched (verified by the count below)
      await lambda.send(new UpdateFunctionConfigurationCommand({ FunctionName: fn, Timeout: timeout }));
      after = await ready(fn);
      console.log(`[${fn}] Timeout ${before.Timeout}s → ${after.Timeout}s`);
    }
    const envAfter = envCount(after);
    console.log(`[${fn}] 배포 후: ${after.LastUpdateStatus} · CodeSize ${Math.round(after.CodeSize / 1024)}KB · 환경변수 ${envAfter}개 · 수정 ${after.LastModified}`);
    console.log(envAfter === envBefore ? `[${fn}] ✅ 환경변수 보존됨` : `[${fn}] ❌ 환경변수 변동 ${envBefore}→${envAfter}`);
    if (envAfter !== envBefore) process.exit(1);
  }
})().catch((e) => { console.error('배포 실패:', e.message); process.exit(1); });
