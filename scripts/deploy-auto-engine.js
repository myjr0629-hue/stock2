/**
 * Deploy REALTIME-1 (paper auto-engine) to the fixed-IP EC2 — ONE command:
 *
 *   node scripts/deploy-auto-engine.js
 *
 * What it does (no manual EC2 editing needed):
 *   1. Reads UPSTASH_REDIS_REST_URL/TOKEN from local .env.local and syncs them
 *      into EC2 ~/toss-executor/.env.toss (idempotent; xs signal keys are
 *      Upstash-only, so the engine needs these; executor ignores extra keys).
 *   2. scp scripts/ec2-auto-engine.js → ~/toss-executor/
 *   3. pm2 start/restart `signum-auto-engine` (executor process untouched).
 *   4. Polls the engine heartbeat (trade:auto:state) for up to 2 minutes and
 *      prints the verdict.
 *
 * The engine sends NO orders to Toss — paper fills only. It reuses the
 * executor's OAuth token via localhost HMAC (never fetches its own).
 */
require('dotenv').config({ path: '.env.local' });
const { execSync } = require('child_process');

const EC2_IP = '52.23.98.13';
const PEM = 'signum-websocket-key.pem';
const USER = 'ec2-user';
const DIR = '/home/ec2-user/toss-executor';
const SSH = `-i ${PEM} -o StrictHostKeyChecking=no -o IdentitiesOnly=yes`;
const PROXY_KEY = process.env.EC2_REDIS_PROXY_KEY || 'signum-redis-proxy-2026';

(async () => {
  // ── 1. sync Upstash creds from local .env.local into EC2 .env.toss ────────
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    console.error('❌ .env.local 에서 UPSTASH_REDIS_REST_URL/TOKEN 을 찾지 못했습니다.');
    process.exit(1);
  }
  console.log('1/4 Upstash 키를 EC2 .env.toss 에 동기화…');
  const b64 = Buffer.from(`UPSTASH_REDIS_REST_URL=${url}\nUPSTASH_REDIS_REST_TOKEN=${token}\n`).toString('base64');
  execSync(`ssh ${SSH} ${USER}@${EC2_IP} "mkdir -p ${DIR} && touch ${DIR}/.env.toss && grep -v '^UPSTASH_REDIS_REST_' ${DIR}/.env.toss > ${DIR}/.env.new; echo ${b64} | base64 -d >> ${DIR}/.env.new && mv ${DIR}/.env.new ${DIR}/.env.toss && chmod 600 ${DIR}/.env.toss"`, { stdio: 'inherit' });

  // ── 2+3. ship the engine and (re)start it ────────────────────────────────
  console.log('2/4 엔진 파일 전송…');
  execSync(`scp ${SSH} scripts/ec2-auto-engine.js ${USER}@${EC2_IP}:${DIR}/`, { stdio: 'inherit' });
  console.log('3/4 pm2 기동…');
  execSync(`ssh ${SSH} ${USER}@${EC2_IP} "cd ${DIR} && (pm2 restart signum-auto-engine 2>/dev/null || pm2 start ec2-auto-engine.js --name signum-auto-engine --time) && pm2 save && pm2 ls"`, { stdio: 'inherit' });

  // ── 4. heartbeat check via the public Redis proxy ─────────────────────────
  console.log('4/4 심장박동 확인 (최대 2분)…');
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    try {
      const res = await fetch(`http://${EC2_IP}:8081/get?key=${encodeURIComponent('trade:auto:state')}`, {
        headers: { Authorization: `Bearer ${PROXY_KEY}` }, signal: AbortSignal.timeout(6000),
      }).then((r) => r.json());
      const st = res && res.result;
      if (st && st.updatedAt && Date.now() - st.updatedAt < 120_000) {
        console.log(`\n✅ REALTIME-1 가동 확인 — ${st.ver} ${st.mode} · NAV $${st.nav} · 유니버스 ${st.universeDate || '(다음 리포트 대기)'}`);
        console.log('콘솔 [자동 → 오토 엔진] 에서 실시간 상태를 확인하세요.');
        return;
      }
    } catch { /* retry */ }
    process.stdout.write('.');
  }
  console.log('\n⚠️ 2분 내 심장박동이 잡히지 않았습니다 — EC2에서 `pm2 logs signum-auto-engine --lines 30` 로그를 확인하세요.');
})().catch((e) => { console.error(e); process.exit(1); });
