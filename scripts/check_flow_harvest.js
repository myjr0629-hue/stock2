require('dotenv').config({ path: '.env.local' });
const { CloudWatchLogsClient, FilterLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');
const { Redis } = require('@upstash/redis');
const fs = require('fs');

const cw = new CloudWatchLogsClient({ region: 'us-east-1' });
const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });

(async () => {
  let output = '';
  const log = (msg) => { output += msg + '\n'; console.log(msg); };

  // ============ 1. CloudWatch Logs - flow-harvest ============
  log('=== 1. FLOW-HARVEST LAMBDA LOGS (last 2 hours) ===');
  try {
    const now = Date.now();
    const r = await cw.send(new FilterLogEventsCommand({
      logGroupName: '/aws/lambda/signum-flow-harvest',
      startTime: now - (2 * 60 * 60 * 1000),
      endTime: now,
      limit: 100
    }));
    log('Events found: ' + r.events.length);
    r.events.forEach(e => {
      const msg = e.message.trim();
      if (msg.length > 10 && !msg.startsWith('START') && !msg.startsWith('END')) {
        log('[' + new Date(e.timestamp).toISOString().slice(11,19) + '] ' + msg.substring(0, 400));
      }
    });
  } catch (e) {
    log('CloudWatch error: ' + e.message);
  }

  // ============ 2. Redis Keys - flow-harvest data ============
  log('\n=== 2. REDIS FLOW-HARVEST DATA CHECK ===');
  const tickers = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'META'];
  
  for (const ticker of tickers) {
    log('\n--- ' + ticker + ' ---');
    
    // rt-metrics
    const rtMetrics = await redis.get('rt-metrics:' + ticker);
    if (rtMetrics) {
      log('  rt-metrics: DP=' + (rtMetrics.darkPoolPercent || rtMetrics.dp || 'N/A') + 
          '%, Short=' + (rtMetrics.shortVolumePercent || rtMetrics.sv || 'N/A') + 
          '%, Block=' + (rtMetrics.blockTradeCount || rtMetrics.bt || 'N/A'));
    } else {
      log('  rt-metrics: NOT FOUND ❌');
    }
    
    // cache:flow:unified
    const flowUnified = await redis.get('cache:flow:unified:' + ticker);
    if (flowUnified) {
      const keys = Object.keys(flowUnified);
      log('  cache:flow:unified: EXISTS (' + keys.length + ' keys: ' + keys.slice(0, 8).join(', ') + ')');
    } else {
      log('  cache:flow:unified: NOT FOUND ❌');
    }
    
    // polygon:snapshot:probe
    const probe = await redis.get('polygon:snapshot:probe:' + ticker);
    if (probe) {
      const contracts = Array.isArray(probe) ? probe.length : (probe.results?.length || 'unknown');
      log('  polygon:snapshot:probe: EXISTS (' + contracts + ' contracts)');
    } else {
      log('  polygon:snapshot:probe: NOT FOUND ❌');
    }
    
    // darkpool
    const darkpool = await redis.get('darkpool:' + ticker);
    if (darkpool) {
      log('  darkpool: EXISTS');
    } else {
      log('  darkpool: NOT FOUND ❌');
    }
  }

  // ============ 3. Compare signum-harvest vs flow-harvest timing ============
  log('\n=== 3. INTERFERENCE CHECK - signum-harvest vs signum-flow-harvest ===');
  try {
    const now2 = Date.now();
    const mainLogs = await cw.send(new FilterLogEventsCommand({
      logGroupName: '/aws/lambda/signum-harvest',
      startTime: now2 - (30 * 60 * 1000),
      endTime: now2,
      filterPattern: 'Done in',
      limit: 5
    }));
    const flowLogs = await cw.send(new FilterLogEventsCommand({
      logGroupName: '/aws/lambda/signum-flow-harvest',
      startTime: now2 - (30 * 60 * 1000),
      endTime: now2,
      filterPattern: 'Done',
      limit: 5
    }));
    log('signum-harvest completions (last 30min): ' + mainLogs.events.length);
    mainLogs.events.forEach(e => log('  [' + new Date(e.timestamp).toISOString().slice(11,19) + '] ' + e.message.trim().substring(0, 200)));
    log('signum-flow-harvest completions (last 30min): ' + flowLogs.events.length);
    flowLogs.events.forEach(e => log('  [' + new Date(e.timestamp).toISOString().slice(11,19) + '] ' + e.message.trim().substring(0, 200)));
  } catch (e) {
    log('Interference check error: ' + e.message);
  }

  // ============ 4. Check Flow API response ============
  log('\n=== 4. FLOW API CHECK ===');
  const https = require('https');
  const flowApiUrl = 'https://www.signumhq.com/api/live/ticker?ticker=NVDA';
  try {
    const data = await new Promise((resolve, reject) => {
      https.get(flowApiUrl, { timeout: 30000 }, r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => resolve(d));
      }).on('error', reject);
    });
    const j = JSON.parse(data);
    log('Flow API /api/live/ticker?ticker=NVDA:');
    log('  cached: ' + j.cached);
    log('  maxPain: ' + j.maxPain);
    log('  gex: ' + j.gex);
    log('  displayPrice: ' + j.displayPrice);
    log('  callWall: ' + j.callWall);
    log('  putFloor: ' + j.putFloor);
    log('  iv: ' + j.iv);
    log('  darkPoolPercent: ' + j.darkPoolPercent);
    log('  shortVolumePercent: ' + j.shortVolumePercent);
    log('  elapsed: ' + j._elapsed + 'ms');
  } catch (e) {
    log('Flow API error: ' + e.message);
  }

  fs.writeFileSync('flow_harvest_check.txt', output);
  log('\nSaved to flow_harvest_check.txt');
})();
