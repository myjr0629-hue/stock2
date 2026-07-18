/**
 * Deploy REALTIME-1 (paper auto-engine) to the fixed-IP EC2.
 *
 *   1. scp scripts/ec2-auto-engine.js → ~/toss-executor/
 *   2. pm2 start/restart as `signum-auto-engine`.
 *
 * Prereqs:
 *   1. Executor deployed + keys installed (the engine reuses the executor's
 *      OAuth token via localhost HMAC — it never fetches its own).
 *   2. ~/toss-executor/.env.toss must ALSO contain (xs keys are Upstash-only):
 *        UPSTASH_REDIS_REST_URL=...
 *        UPSTASH_REDIS_REST_TOKEN=...
 *      (values = same as Vercel env; executor ignores extra keys)
 * The engine sends NO orders to Toss — paper fills only.
 *
 * Run: node scripts/deploy-auto-engine.js
 */
const { execSync } = require('child_process');

const EC2_IP = '52.23.98.13';
const PEM = 'signum-websocket-key.pem';
const USER = 'ec2-user';
const DIR = '/home/ec2-user/toss-executor';
const SSH = `-i ${PEM} -o StrictHostKeyChecking=no -o IdentitiesOnly=yes`;

(async () => {
  console.log('deploying REALTIME-1 auto engine (paper)…');
  execSync(`ssh ${SSH} ${USER}@${EC2_IP} "mkdir -p ${DIR}"`, { stdio: 'inherit' });
  execSync(`scp ${SSH} scripts/ec2-auto-engine.js ${USER}@${EC2_IP}:${DIR}/`, { stdio: 'inherit' });
  execSync(`ssh ${SSH} ${USER}@${EC2_IP} "cd ${DIR} && (pm2 restart signum-auto-engine 2>/dev/null || pm2 start ec2-auto-engine.js --name signum-auto-engine --time) && pm2 save && pm2 ls"`, { stdio: 'inherit' });
  console.log('\npm2 logs 확인: ssh 후 `pm2 logs signum-auto-engine --lines 30`');
  console.log('✅ 배포 완료 — 콘솔 [자동 → 오토 엔진]에서 심장박동이 뛰는지 확인하세요.');
})().catch((e) => { console.error(e); process.exit(1); });
