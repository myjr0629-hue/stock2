/**
 * Dashboard Data Pipeline Audit Script
 * 
 * Checks ALL 20 dashboard card data sources for real tickers:
 * 1. cache:analysis:{TICKER} — Lambda harvest pre-computed data
 * 2. rt-metrics:{TICKER} via EC2 proxy — Live dark pool
 * 3. Polygon short volume — FINRA daily
 */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const EC2_PROXY = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
const EC2_KEY = process.env.REDIS_PROXY_KEY || 'signum-redis-proxy-2026';

// TEST TICKERS: Mix of ones with DP and without
const TEST_TICKERS = ['TSLA', 'MCD', 'NVDA', 'AAPL', 'GOOGL', 'WDC', 'RIVN', 'AMD', 'PLTR', 'COST', 'CEG', 'ASTS', 'AMZN', 'MSFT'];

async function redisGet(key) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  try {
    const body = JSON.stringify(['GET', key]);
    const res = await fetch(UPSTASH_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
      body
    });
    const data = await res.json();
    if (data.result) {
      try { return JSON.parse(data.result); } catch { return data.result; }
    }
    return null;
  } catch { return null; }
}

async function ec2Get(key) {
  try {
    const res = await fetch(`${EC2_PROXY}/get?key=${encodeURIComponent(key)}`, {
      headers: { 'Authorization': `Bearer ${EC2_KEY}` },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      return data?.result || null;
    }
    return null;
  } catch { return null; }
}

async function main() {
  console.log('========================================');
  console.log('DASHBOARD DATA PIPELINE AUDIT');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');

  // ── 1. Analysis Cache Audit ──
  console.log('═══ 1. ANALYSIS CACHE (cache:analysis:{TICKER}) ═══');
  console.log('Source: Lambda signum-harvest → Redis');
  console.log('');

  const analysisResults = {};
  for (const ticker of TEST_TICKERS) {
    const ac = await redisGet(`cache:analysis:${ticker}`);
    analysisResults[ticker] = ac;
    
    if (!ac) {
      console.log(`  ${ticker}: ❌ NO CACHE`);
      continue;
    }

    const age = ac.timestamp ? Math.round((Date.now() - ac.timestamp) / 60000) : '?';
    console.log(`  ${ticker}: ✅ Cached (${age}min ago)`);
    console.log(`    ├─ darkPoolPct: ${ac.darkPoolPct ?? 'NULL/MISSING'}`);
    console.log(`    ├─ shortVolPct: ${ac.shortVolPct ?? 'NULL/MISSING'}`);
    console.log(`    ├─ netGex (gex): ${ac.gex ?? 'NULL'}`);
    console.log(`    ├─ maxPain: ${ac.maxPain ?? 'NULL'}`);
    console.log(`    ├─ pcr: ${ac.pcr ?? 'NULL'}`);
    console.log(`    ├─ callWall: ${ac.callWall ?? 'NULL'}`);
    console.log(`    ├─ putFloor: ${ac.putFloor ?? 'NULL'}`);
    console.log(`    ├─ gammaFlipLevel: ${ac.gammaFlipLevel ?? 'NULL'}`);
    console.log(`    ├─ iv (atmIv): ${ac.iv ?? 'NULL'}`);
    console.log(`    ├─ squeezeScore: ${ac.squeezeScore ?? 'NULL'}`);
    console.log(`    ├─ rsi: ${ac.rsi ?? 'NULL'}`);
    console.log(`    ├─ return3d: ${ac.return3d ?? 'NULL'}`);
    console.log(`    ├─ relVol: ${ac.relVol ?? 'NULL'}`);
    console.log(`    ├─ vwap: ${ac.vwap ?? 'NULL'}`);
    console.log(`    ├─ impliedMovePct: ${ac.impliedMovePct ?? 'NULL'}`);
    console.log(`    ├─ volumePcr: ${ac.volumePcr ?? 'NULL'}`);
    console.log(`    ├─ whaleIndex: ${ac.whaleIndex ?? 'NULL'}`);
    console.log(`    ├─ sparkline: ${ac.sparkline?.length ?? 0} points`);
    console.log(`    └─ alpha: score=${ac.alphaSnapshot?.score ?? 'N/A'} grade=${ac.alphaSnapshot?.grade ?? 'N/A'}`);
  }

  // ── 2. EC2 rt-metrics Audit ──
  console.log('\n═══ 2. EC2 RT-METRICS (rt-metrics:{TICKER}) ═══');
  console.log('Source: EC2 WebSocket Flow Accumulator → ElastiCache');
  console.log('');

  for (const ticker of TEST_TICKERS) {
    const metrics = await ec2Get(`rt-metrics:${ticker}`);
    
    if (!metrics) {
      console.log(`  ${ticker}: ❌ NO EC2 DATA`);
      continue;
    }

    console.log(`  ${ticker}: ✅ EC2 Live`);
    console.log(`    ├─ darkPool.percent: ${metrics.darkPool?.percent ?? 'NULL'}%`);
    console.log(`    ├─ darkPool.volume: ${metrics.darkPool?.volume?.toLocaleString() ?? 'NULL'}`);
    console.log(`    ├─ darkPool.totalVolume: ${metrics.darkPool?.totalVolume?.toLocaleString() ?? 'NULL'}`);
    console.log(`    ├─ darkPool.buyPct: ${metrics.darkPool?.buyPct ?? 'NULL'}%`);
    console.log(`    ├─ blockTrade.count: ${metrics.blockTrade?.count ?? 'NULL'}`);
    console.log(`    └─ shortVolume: ${metrics.shortVolume?.percent ?? 'NULL'}%`);
  }

  // ── 3. Upstash rt-metrics (Lambda fallback) ──
  console.log('\n═══ 3. UPSTASH RT-METRICS (rt-metrics:{TICKER}) ═══');
  console.log('Source: Lambda flow-harvest → Upstash (V3.0 REMOVED blind push)');
  console.log('');

  for (const ticker of TEST_TICKERS) {
    const metrics = await redisGet(`rt-metrics:${ticker}`);
    
    if (!metrics) {
      console.log(`  ${ticker}: ❌ NO UPSTASH RT-METRICS (expected — Lambda V3.0 removed blind push)`);
      continue;
    }

    console.log(`  ${ticker}: ✅ Upstash has data`);
    console.log(`    ├─ darkPool.percent: ${metrics.darkPool?.percent ?? 'NULL'}%`);
    console.log(`    └─ _source: ${metrics._source ?? 'unknown'}`);
  }

  // ── 4. Summary — Dark Pool Data Path ──
  console.log('\n═══ DARK POOL DATA PATH SUMMARY ═══');
  console.log('');
  console.log('Dashboard rendering uses TWO paths:');
  console.log('');
  console.log('PATH A (Analysis Cache - CACHED data):');
  console.log('  Lambda signum-harvest → reads rt-metrics:{T} from Upstash → stores in cache:analysis:{T}.darkPoolPct');
  console.log('  ⚠️ Problem: Lambda V3.0 REMOVED rt-metrics Upstash writes');
  console.log('     → If EC2 also doesn\'t write to Upstash, darkPoolPct stays 0');
  console.log('');
  console.log('PATH B (Live Fetch - FRESH data):');
  console.log('  dashboard/unified fetchTickerData() → realtimeMetricsService.fetchTradeData()');
  console.log('  → PRIMARY: EC2 ElastiCache rt-metrics:{T} → if OK, returns data');
  console.log('  → FALLBACK: Polygon REST /v3/trades sampling');
  console.log('');
  
  // ── 5. Compare paths ──
  console.log('═══ PATH COMPARISON ═══');
  console.log('');
  console.log('Ticker       | Analysis Cache DP% | EC2 Live DP%  | Match?');
  console.log('-------------|-------------------|---------------|-------');
  
  for (const ticker of TEST_TICKERS) {
    const ac = analysisResults[ticker];
    const ec2 = await ec2Get(`rt-metrics:${ticker}`);
    
    const acDP = ac?.darkPoolPct ?? 0;
    const ec2DP = ec2?.darkPool?.percent ?? 0;
    const match = (acDP > 0 && ec2DP > 0) ? '✅' : (acDP === 0 && ec2DP === 0) ? '⚫ BOTH 0' : '❌ MISMATCH';
    
    console.log(`  ${ticker.padEnd(10)} | ${String(acDP).padEnd(17)} | ${String(ec2DP).padEnd(13)} | ${match}`);
  }

  // ── 6. Universe Check ──
  console.log('\n═══ UNIVERSE MEMBERSHIP CHECK ═══');
  console.log('');
  
  // Check if MCD is in flow-harvest UNIVERSE
  const flowUniverseCheck = ['MCD', 'WDC', 'RIVN', 'CEG', 'ASTS', 'COST'];
  for (const ticker of flowUniverseCheck) {
    const flowData = await redisGet(`cache:flow:unified:${ticker}`);
    console.log(`  ${ticker}: flow-harvest cache = ${flowData ? '✅ IN UNIVERSE' : '❌ NOT IN UNIVERSE'}`);
  }

  console.log('\n========================================');
  console.log('AUDIT COMPLETE');
  console.log('========================================');
}

main().catch(console.error);
