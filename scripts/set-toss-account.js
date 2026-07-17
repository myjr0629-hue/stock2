/**
 * 토스 계좌번호 직접 지정 (키 재입력 없이 이것만 설정)
 *
 * 토스 /accounts 응답이 실주문용 계좌번호를 주지 않는 경우를 위한 확정 경로.
 * 토스증권 앱 > 내 계좌 > 계좌번호를 확인해 입력하세요 (숫자만 입력해도 됨).
 *
 * Run: node scripts/set-toss-account.js
 */
const readline = require('readline');
const { execSync } = require('child_process');

const EC2_IP = '52.23.98.13';
const SSH = `-i signum-websocket-key.pem -o StrictHostKeyChecking=no -o IdentitiesOnly=yes`;
const DIR = '/home/ec2-user/toss-executor';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('토스증권 계좌번호 (예: 8888-1234 또는 숫자만): ', (raw) => {
  rl.close();
  const acct = raw.replace(/[^0-9]/g, '');
  if (acct.length < 5) { console.error('❌ 계좌번호가 너무 짧습니다. 중단.'); process.exit(1); }
  console.log('EC2에 기록 중… (숫자만: ' + acct.slice(0, 2) + '***' + acct.slice(-2) + ')');
  // .env.toss에서 기존 TOSS_ACCOUNT 줄 제거 후 추가 + 계좌 캐시 삭제 + 재시작
  execSync(`ssh ${SSH} ec2-user@${EC2_IP} "cd ${DIR} && grep -v '^TOSS_ACCOUNT=' .env.toss > .env.tmp && mv .env.tmp .env.toss && echo TOSS_ACCOUNT=${acct} >> .env.toss && rm -f account-cache.json && pm2 restart signum-toss-exec"`, { stdio: 'inherit' });
  setTimeout(async () => {
    const h = await fetch(`http://${EC2_IP}:8090/health`).then((r) => r.json()).catch((e) => ({ error: e.message }));
    console.log('health:', JSON.stringify(h));
    console.log('✅ 완료 — 매매 페이지를 새로고침하세요.');
  }, 1500);
});
