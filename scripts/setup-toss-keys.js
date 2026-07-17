/**
 * Toss API 키 설치 (운영자 전용 — 키는 채팅/레포를 절대 거치지 않는다)
 *
 * 이 스크립트를 터미널에서 직접 실행하면:
 *   1. Client Id / Client Secret 을 물어본다 (입력값은 이 머신 → EC2로만 이동)
 *   2. EXECUTOR_SECRET(내부 서명키)을 자동 생성한다
 *   3. EC2의 ~/toss-executor/.env.toss 에 기록하고 실행기를 재시작한다
 *   4. Vercel 환경변수에 넣을 값 2개를 화면에 출력한다
 *
 * Run: node scripts/setup-toss-keys.js
 */
const readline = require('readline');
const crypto = require('crypto');
const { execSync } = require('child_process');

const EC2_IP = '52.23.98.13';
const PEM = 'signum-websocket-key.pem';
const USER = 'ec2-user';
const DIR = '/home/ec2-user/toss-executor';
const SSH = `-i ${PEM} -o StrictHostKeyChecking=no -o IdentitiesOnly=yes`;

// 결과를 메모장으로도 보여준다 (터미널에서 못 찾는 문제 방지). 파일은 gitignore 대상.
const fs = require('fs');
function showResult(execSecret) {
  const txt = [
    'Vercel → Settings → Environment Variables 에 아래 2개를 추가하고 Redeploy 하세요.',
    '',
    'EXECUTOR_URL=http://' + EC2_IP + ':8090',
    'EXECUTOR_SECRET=' + execSecret,
    '',
    '(이 파일은 복사 후 삭제해도 됩니다. git에는 올라가지 않습니다.)',
  ].join('\r\n');
  fs.writeFileSync('vercel-env-toss.txt', txt);
  console.log('\n=== ✅ 값을 메모장으로 열었습니다 (vercel-env-toss.txt) ===');
  console.log('  EXECUTOR_URL    = http://' + EC2_IP + ':8090');
  console.log('  EXECUTOR_SECRET = ' + execSecret);
  try { require('child_process').exec('notepad vercel-env-toss.txt'); } catch { /* 수동으로 열기 */ }
}

// 복구 모드: 키 재입력 없이 EC2에 저장된 EXECUTOR_SECRET을 가져와 보여준다.
if (process.argv.includes('--recover')) {
  const out = execSync(`ssh ${'-i signum-websocket-key.pem -o StrictHostKeyChecking=no -o IdentitiesOnly=yes'} ec2-user@52.23.98.13 "grep EXECUTOR_SECRET /home/ec2-user/toss-executor/.env.toss"`).toString();
  const m = out.match(/EXECUTOR_SECRET=(\S+)/);
  if (!m) { console.error('❌ EC2에서 EXECUTOR_SECRET을 찾지 못했습니다 — 전체 설치를 다시 실행하세요.'); process.exit(1); }
  showResult(m[1]);
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

// 붙여넣기에 줄바꿈·공백이 섞여도 안전하게: 형식이 맞을 때까지 다시 묻는다.
async function askUntil(q, prefix) {
  for (;;) {
    const v = (await ask(q)).replace(/\s+/g, '').trim();
    if (v.startsWith(prefix) && v.length > prefix.length + 8) return v;
    console.log(`  ⚠️ ${prefix}… 로 시작하는 전체 값을 붙여넣어 주세요. 다시 →`);
  }
}

(async () => {
  console.log('=== 토스 Open API 키 설치 (재실행 = 처음부터 덮어쓰기) ===');
  console.log('WTS(토스증권 PC) 설정 > Open API 에서 발급한 값을 입력하세요.');
  console.log('⚠️ 먼저 같은 화면의 [허용 IP 관리]에 ' + EC2_IP + ' 를 추가했는지 확인!\n');

  const clientId = await askUntil('Client Id (tsck_live_...): ', 'tsck_');
  const clientSecret = await askUntil('Client Secret (tssk_live_...): ', 'tssk_');
  const acctNo = (await ask('계좌번호 (엔터 = 첫 계좌 자동): ')).trim();
  rl.close();

  const execSecret = 'exsec_' + crypto.randomBytes(32).toString('hex');
  const env = [
    `TOSS_CLIENT_ID=${clientId}`,
    `TOSS_CLIENT_SECRET=${clientSecret}`,
    `EXECUTOR_SECRET=${execSecret}`,
    acctNo ? `TOSS_ACCOUNT=${acctNo}` : null,
  ].filter(Boolean).join('\n') + '\n';

  console.log('\nEC2에 기록 중…');
  const b64 = Buffer.from(env).toString('base64');
  execSync(`ssh ${SSH} ${USER}@${EC2_IP} "mkdir -p ${DIR} && echo ${b64} | base64 -d > ${DIR}/.env.toss && chmod 600 ${DIR}/.env.toss && pm2 restart signum-toss-exec"`, { stdio: 'inherit' });

  const health = await fetch(`http://${EC2_IP}:8090/health`, { signal: AbortSignal.timeout(8000) }).then((r) => r.json()).catch((e) => ({ error: e.message }));
  console.log('health:', JSON.stringify(health));

  showResult(execSecret);
})();
