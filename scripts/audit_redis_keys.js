// 전체 인프라 파이프라인 감사 — 누락 항목 찾기
require('dotenv').config({path:'.env.local'});
const http = require('http');

function ecGet(key) {
  return new Promise(resolve => {
    http.get('http://52.23.98.13:8081/get?key=' + encodeURIComponent(key), {
      headers: {'Authorization': 'Bearer signum-redis-proxy-2026'}, timeout: 5000
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { const j = JSON.parse(d); resolve(j.result); } catch { resolve(null); } });
    }).on('error', () => resolve(null)).on('timeout', function() { this.destroy(); resolve(null); });
  });
}

function ecPing() {
  return new Promise(resolve => {
    const start = Date.now();
    http.get('http://52.23.98.13:8081/ping', {
      headers: {'Authorization': 'Bearer signum-redis-proxy-2026'}, timeout: 3000
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ ok: true, latency: Date.now() - start, body: d }));
    }).on('error', e => resolve({ ok: false, error: e.message }))
      .on('timeout', function() { this.destroy(); resolve({ ok: false, error: 'timeout' }); });
  });
}

// Capture worker check (port 3100)
function captureWorkerCheck() {
  return new Promise(resolve => {
    http.get('http://52.23.98.13:3100/health', { timeout: 3000 }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ ok: res.statusCode === 200, status: res.statusCode, body: d.substring(0, 100) }));
    }).on('error', e => resolve({ ok: false, error: e.message }))
      .on('timeout', function() { this.destroy(); resolve({ ok: false, error: 'timeout' }); });
  });
}

(async () => {
  console.log('=== FULL INFRASTRUCTURE AUDIT ===\n');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  // ═══ 1. EC2 PROXY ═══
  console.log('--- 1. EC2 REDIS PROXY (52.23.98.13:8081) ---');
  const ping = await ecPing();
  console.log('Ping:', JSON.stringify(ping));

  // ═══ 2. EC2 CAPTURE WORKER ═══
  console.log('\n--- 2. EC2 CAPTURE WORKER (52.23.98.13:3100) ---');
  const capture = await captureWorkerCheck();
  console.log('Health:', JSON.stringify(capture));

  // ═══ 3. EC2 FLOW ACCUMULATOR (signum-flow-acc) ═══
  console.log('\n--- 3. EC2 FLOW ACCUMULATOR (rt-metrics) ---');
  for (const t of ['NVDA', 'TSLA', 'AAPL', 'SPY']) {
    const v = await ecGet('rt-metrics:' + t);
    if (v) {
      const d = typeof v === 'string' ? JSON.parse(v) : v;
      console.log('rt-metrics:' + t + ': source=' + (d._source||'?') + ' via=' + (d._via||'?') + ' dp=' + (d.darkPool?.percentage||'?'));
    } else {
      console.log('rt-metrics:' + t + ': NULL');
    }
  }

  // ═══ 4. MARKET FEED CRON ═══
  console.log('\n--- 4. MARKET FEED CRON ---');
  const mfKeys = ['yahoo:vix', 'yahoo:vix3m', 'yahoo:spx', 'yahoo:nq', 'yahoo:tnx',
    'yahoo:gold', 'yahoo:oil', 'yahoo:tlt', 'cnn:feargreed', 'market:fear_greed',
    'macro:snapshot', 'yahoo:usdkrw', 'yahoo:usdjpy'];
  for (const k of mfKeys) {
    const v = await ecGet(k);
    if (v) {
      const s = typeof v === 'string' ? v.substring(0, 80) : JSON.stringify(v).substring(0, 80);
      console.log(k + ': EXISTS — ' + s);
    } else {
      console.log(k + ': NULL');
    }
  }

  // ═══ 5. NEWS DIGEST ═══
  console.log('\n--- 5. NEWS DIGEST ---');
  for (const k of ['news:digest:latest', 'news:digest', 'warm:news-digest']) {
    const v = await ecGet(k);
    console.log(k + ': ' + (v ? 'EXISTS' : 'NULL'));
  }

  // ═══ 6. ECONOMIC CALENDAR ═══
  console.log('\n--- 6. ECONOMIC CALENDAR ---');
  for (const k of ['fmp:econ-calendar', 'economic:calendar', 'econ-calendar:latest']) {
    const v = await ecGet(k);
    console.log(k + ': ' + (v ? 'EXISTS' : 'NULL'));
  }

  // ═══ 7. SECTOR SNAPSHOTS ═══
  console.log('\n--- 7. SECTOR SNAPSHOT CRON ---');
  const sectors = ['m7', 'silicon_core', 'power_matrix'];
  for (const s of sectors) {
    for (const k of ['sector:snapshot:' + s, 'sector:' + s + ':latest']) {
      const v = await ecGet(k);
      if (v) console.log(k + ': EXISTS');
    }
  }

  // ═══ 8. PRICE WEBSOCKET ═══
  console.log('\n--- 8. EC2 PRICE WEBSOCKET ---');
  // Check if recent price data exists (WS writes to ElastiCache)
  for (const t of ['NVDA', 'AAPL']) {
    for (const k of ['live:price:' + t, 'ws:price:' + t, 'price:' + t]) {
      const v = await ecGet(k);
      if (v) console.log(k + ': EXISTS — ' + JSON.stringify(v).substring(0, 80));
    }
  }

  // ═══ 9. signum-fmp LAMBDA (DynamoDB data via Redis) ═══
  console.log('\n--- 9. signum-fmp DATA (via signum-harvest relay) ---');
  // FMP data is in DynamoDB, relayed through cache:command:unified
  // Check if analyst/earnings data exists inside command cache
  const nvdaCmd = await ecGet('cache:command:unified:NVDA');
  if (nvdaCmd) {
    const d = typeof nvdaCmd === 'string' ? JSON.parse(nvdaCmd) : nvdaCmd;
    const hasAnalyst = !!(d.analyst || d.analystData);
    const hasEarnings = !!(d.earnings || d.earningsData);
    const hasFund = !!(d.fundamentals || d.fundData);
    console.log('NVDA command cache — analyst:' + hasAnalyst + ', earnings:' + hasEarnings + ', fundamentals:' + hasFund);
    if (d.analyst || d.analystData) {
      const a = d.analyst || d.analystData;
      console.log('  analyst: consensus=' + (a.consensus || a.grade) + ', priceTarget=' + (a.priceTarget?.target || a.priceTarget));
    }
    if (d.earnings || d.earningsData) {
      const e = d.earnings || d.earningsData;
      console.log('  earnings: nextDate=' + (e.nextDate || e.date) + ', forwardEps=' + (e.forwardEps));
    }
  } else {
    console.log('NVDA command cache: NULL');
  }

  // ═══ 10. VIX last_known_good (separate from yahoo:vix) ═══
  console.log('\n--- 10. RLSI ---');
  const rlsi = await ecGet('rlsi:latest');
  console.log('rlsi:latest: ' + (rlsi ? JSON.stringify(rlsi).substring(0, 100) : 'NULL'));

  // ═══ 11. SUPABASE (implicit check via sector data) ═══
  console.log('\n--- 11. SUMMARY ---');
  console.log('Check complete. Review above for any NULL values that should have data.');

  console.log('\n=== AUDIT DONE ===');
})().catch(e => console.error(e));
