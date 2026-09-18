#!/usr/bin/env node
/**
 * TLS 만료 감시 — 2026-09-18 사고 재발 방지.
 *
 * 사고: ws.signumhq.com 인증서가 2026-09-15 만료됐는데 «아무도 몰랐다».
 *   앱·웹의 실시간 소켓이 3일간 전부 죽어 있었고, 본장엔 30초 REST 폴링이
 *   대신 그려 줘서 증상이 가려졌다. 대표가 「프리에 ETF 가 안 움직인다」고
 *   말해서야 드러났다.
 * 기전: /etc/cron.d/ 파일은 /etc/crontab 의 PATH 를 상속하지 않는다.
 *   certbot 의 nginx 플러그인이 /usr/sbin/nginx 를 못 찾아 5주 연속 실패했다.
 *   (8/17·8/24·8/31·9/7·9/14 — letsencrypt.log 에 NoInstallationError 로 남아 있다)
 * 교훈: «조용히 만료되는 것»은 조용히 감시하면 안 된다. 만료 30일 전부터 운다.
 *
 *   node scripts/check-tls-expiry.js            # 사람이 읽는 표
 *   node scripts/check-tls-expiry.js --json     # 기계가 읽는 표
 *   종료코드 1 = 만료됐거나 임계일 이내 → 사이클에서 «막는» 신호로 쓸 것
 */
const tls = require('tls');

const HOSTS = (process.env.TLS_HOSTS || 'ws.signumhq.com,www.signumhq.com,signumhq.com').split(',').map(h => h.trim()).filter(Boolean);
const WARN_DAYS = Number(process.env.TLS_WARN_DAYS || 30);
const asJson = process.argv.includes('--json');

function probe(host) {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host, port: 443, servername: host, rejectUnauthorized: false, timeout: 8000 },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || !cert.valid_to) return resolve({ host, ok: false, error: 'no certificate' });
        const expires = new Date(cert.valid_to);
        const days = Math.floor((expires.getTime() - Date.now()) / 86400000);
        resolve({
          host,
          ok: days > 0,
          days,
          expires: expires.toISOString().slice(0, 19) + 'Z',
          issuer: (cert.issuer && (cert.issuer.O || cert.issuer.CN)) || '?',
          warn: days <= WARN_DAYS,
        });
      }
    );
    socket.on('timeout', () => { socket.destroy(); resolve({ host, ok: false, error: 'timeout' }); });
    socket.on('error', (e) => resolve({ host, ok: false, error: e.message }));
  });
}

(async () => {
  const rows = await Promise.all(HOSTS.map(probe));
  if (asJson) { console.log(JSON.stringify({ checkedAt: new Date().toISOString(), warnDays: WARN_DAYS, rows }, null, 2)); }
  else {
    console.log(`TLS 만료 점검 (경고 임계 ${WARN_DAYS}일)`);
    for (const r of rows) {
      if (!r.ok && r.error) console.log(`  ✗ ${r.host} — ${r.error}`);
      else if (!r.ok) console.log(`  ✗ ${r.host} — 만료됨 (${r.expires}, ${Math.abs(r.days)}일 지남) · 발급자 ${r.issuer}`);
      else if (r.warn) console.log(`  ⚠ ${r.host} — ${r.days}일 남음 (${r.expires}) · 발급자 ${r.issuer}`);
      else console.log(`  ✓ ${r.host} — ${r.days}일 남음 (${r.expires}) · 발급자 ${r.issuer}`);
    }
  }
  const bad = rows.filter(r => !r.ok || r.warn);
  if (bad.length) {
    if (!asJson) console.log(`\n조치 필요 ${bad.length}건. 갱신:\n  node scripts/ec2-ssm.js 'PATH=$PATH:/usr/sbin certbot renew --nginx --non-interactive'`);
    process.exit(1);
  }
})();
