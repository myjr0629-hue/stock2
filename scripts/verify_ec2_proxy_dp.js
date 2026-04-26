/**
 * Verification: EC2 Proxy Dark Pool fetch — simulates EXACTLY what Lambda will do
 */
const http = require('http');

const EC2_PROXY_URL = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
const EC2_PROXY_KEY = process.env.REDIS_PROXY_KEY || 'signum-redis-proxy-2026';

function ec2ProxyGet(key, timeoutMs) {
  return new Promise((resolve) => {
    const url = EC2_PROXY_URL + '/get?key=' + encodeURIComponent(key);
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 8081,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + EC2_PROXY_KEY },
    };
    const to = setTimeout(() => resolve(null), timeoutMs || 3000);
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        clearTimeout(to);
        try {
          const parsed = JSON.parse(data);
          resolve(parsed?.result || null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => { clearTimeout(to); resolve(null); });
    req.end();
  });
}

// Test the EXACT code path Lambda will use
const PROBLEM_TICKERS = ['MCD', 'WDC', 'RIVN', 'COST', 'TSLA', 'NVDA'];

async function main() {
  console.log('═══ EC2 PROXY VERIFICATION (Lambda-style HTTP) ═══\n');

  const darkPoolMap = {};
  const blockTradesMap = {};

  // Simulate batch fetch (same as Lambda code)
  const results = await Promise.all(PROBLEM_TICKERS.map(t => ec2ProxyGet('rt-metrics:' + t, 3000)));
  results.forEach((metrics, idx) => {
    const ticker = PROBLEM_TICKERS[idx];
    if (metrics) {
      try {
        const parsed = typeof metrics === 'string' ? JSON.parse(metrics) : metrics;
        darkPoolMap[ticker] = parsed?.darkPool?.percent || 0;
        blockTradesMap[ticker] = parsed?.blockTrade?.count || 0;
      } catch { darkPoolMap[ticker] = 0; blockTradesMap[ticker] = 0; }
    } else {
      darkPoolMap[ticker] = 0;
      blockTradesMap[ticker] = 0;
    }
  });

  console.log('Results (darkPoolMap):');
  for (const t of PROBLEM_TICKERS) {
    const status = darkPoolMap[t] > 0 ? '✅' : '❌';
    console.log(`  ${status} ${t}: darkPoolPct=${darkPoolMap[t]}%, blockTrades=${blockTradesMap[t]}`);
  }

  const fixed = PROBLEM_TICKERS.filter(t => darkPoolMap[t] > 0).length;
  const total = PROBLEM_TICKERS.length;
  console.log(`\n결과: ${fixed}/${total} 종목 정상 — ${fixed === total ? '✅ ALL PASS' : '⚠️ PARTIAL'}`);
}

main().catch(console.error);
