const http = require('http');
const https = require('https');

function ecGet(key) {
  return new Promise((resolve) => {
    const req = http.get('http://52.23.98.13:8081/get?key=' + encodeURIComponent(key), {
      headers: { 'Authorization': 'Bearer signum-redis-proxy-2026' },
      timeout: 5000
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { const p = JSON.parse(d); resolve(p.result); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function httpsGet(url) {
  return new Promise((resolve) => {
    https.get(url, { timeout: 15000 }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

(async () => {
  const tickers = ['NVDA', 'TSLA', 'AAPL', 'AMD', 'MSFT', 'META', 'AMZN', 'GOOG', 'SPY', 'QQQ'];
  console.log('=== FULL PIPELINE VERIFICATION (' + new Date().toISOString().slice(11, 19) + ') ===\n');

  // 1. ElastiCache (Lambda writes here)
  console.log('--- TIER 1: ElastiCache (EC2 Proxy) — cache:flow:unified ---');
  let ecHits = 0;
  for (const t of tickers) {
    const raw = await ecGet('cache:flow:unified:' + t);
    if (raw) {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const age = Math.round((Date.now() - data.timestamp) / 1000);
      ecHits++;
      console.log(t + ': ✅ age=' + age + 's dp=' + (data.realtimeMetrics?.darkPool?.percent || '?') + '%');
    } else {
      console.log(t + ': ❌ MISS');
    }
  }
  console.log('Result: ' + ecHits + '/' + tickers.length + ' cached\n');

  // 2. Options Snapshot
  console.log('--- TIER 1b: ElastiCache — polygon:snapshot:probe ---');
  let probeHits = 0;
  for (const t of tickers) {
    const raw = await ecGet('polygon:snapshot:probe:' + t);
    if (raw) {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const age = Math.round((Date.now() - (data._ts || 0)) / 1000);
      probeHits++;
      console.log(t + ': ✅ contracts=' + (data.probeResults?.length || '?') + ' age=' + age + 's');
    } else {
      console.log(t + ': ❌ MISS');
    }
  }
  console.log('Result: ' + probeHits + '/' + tickers.length + '\n');

  // 3. Production API — flow/unified
  console.log('--- TIER 2: Production API (signumhq.com/api/flow/unified) ---');
  for (const t of ['NVDA', 'TSLA', 'AAPL']) {
    const flowRes = await httpsGet('https://www.signumhq.com/api/flow/unified?ticker=' + t);
    if (flowRes && flowRes.timestamp) {
      const age = Math.round((Date.now() - flowRes.timestamp) / 1000);
      console.log(t + ': ✅ src=' + (flowRes._source || '?') + ' age=' + age + 's dp=' + (flowRes.realtimeMetrics?.darkPool?.percent || 'N/A') + '% trades=' + ((flowRes.darkPoolTrades || []).length));
    } else {
      console.log(t + ': ❌ FAILED');
    }
  }

  // 4. Live ticker API (OPI source)
  console.log('\n--- TIER 3: Production API (signumhq.com/api/live/ticker) ---');
  const liveRes = await httpsGet('https://www.signumhq.com/api/live/ticker?t=NVDA&skip_alpha=1');
  if (liveRes) {
    console.log('NVDA live/ticker: ✅');
    console.log('  price=$' + liveRes.price + ' session=' + liveRes.session);
    console.log('  rawChain=' + (liveRes.flow?.rawChain?.length || 0) + ' contracts');
    console.log('  allExpiryChain=' + (liveRes.flow?.allExpiryChain?.length || 0) + ' contracts');
    console.log('  maxPain=' + liveRes.flow?.maxPain + ' gammaFlip=' + liveRes.flow?.gammaFlipLevel);
    console.log('  oiPcr=' + liveRes.flow?.oiPcr + ' gex=' + liveRes.flow?.gex);
    console.log('  _cached=' + liveRes._cached + ' _elapsed=' + liveRes._elapsed + 'ms');
  } else {
    console.log('NVDA live/ticker: ❌ FAILED');
  }

  // 5. Lambda CloudWatch status
  console.log('\n--- TIER 4: Lambda Execution Status ---');
  require('dotenv').config({ path: '.env.local' });
  const { CloudWatchLogsClient, FilterLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');
  const cw = new CloudWatchLogsClient({ region: 'us-east-1' });
  const now = Date.now();
  const r = await cw.send(new FilterLogEventsCommand({
    logGroupName: '/aws/lambda/signum-flow-harvest',
    startTime: now - (15 * 60 * 1000), endTime: now,
    filterPattern: 'complete', limit: 5
  }));
  console.log('Completions (last 15min): ' + r.events.length);
  r.events.forEach(e => {
    console.log('  [' + new Date(e.timestamp).toISOString().slice(11, 19) + '] ' + e.message.trim().substring(0, 200));
  });

  const lockSkips = await cw.send(new FilterLogEventsCommand({
    logGroupName: '/aws/lambda/signum-flow-harvest',
    startTime: now - (15 * 60 * 1000), endTime: now,
    filterPattern: 'SKIPPED', limit: 10
  }));
  console.log('Lock skips (last 15min): ' + lockSkips.events.length + ' (expected: several)');

  console.log('\n=== VERDICT ===');
  console.log('ElastiCache flow:unified: ' + ecHits + '/10');
  console.log('ElastiCache snapshot:probe: ' + probeHits + '/10');
  console.log('Lambda completions: ' + r.events.length);
  console.log('Overall: ' + (ecHits >= 8 && probeHits >= 8 && r.events.length > 0 ? '✅ PIPELINE HEALTHY' : '⚠️ NEEDS ATTENTION'));
})().catch(e => console.error(e));
