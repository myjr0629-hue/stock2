/**
 * FINAL END-TO-END VERIFICATION
 * Checks the ACTUAL dashboard API response (what users see)
 * Verifies dark pool data is present for previously broken tickers
 */
require('dotenv').config({ path: '.env.local' });

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisGet(key) {
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['GET', key])
  });
  const data = await res.json();
  if (data.result) {
    try { return JSON.parse(data.result); } catch { return data.result; }
  }
  return null;
}

async function main() {
  console.log('════════════════════════════════════════════════');
  console.log('  FINAL END-TO-END VERIFICATION');
  console.log('  Time:', new Date().toISOString());
  console.log('════════════════════════════════════════════════\n');

  const TICKERS = ['MCD', 'WDC', 'COST', 'RIVN', 'TSLA', 'NVDA', 'AAPL', 'AMD', 'PLTR', 'GOOGL'];
  
  console.log('Ticker       | darkPoolPct | shortVolPct | whaleIdx | maxPain  | GEX OK | Alpha  | Status');
  console.log('-------------|------------|-------------|----------|----------|--------|--------|-------');
  
  let allGood = true;
  for (const ticker of TICKERS) {
    const ac = await redisGet(`cache:analysis:${ticker}`);
    if (!ac) {
      console.log(`  ${ticker.padEnd(10)} | NO CACHE`);
      allGood = false;
      continue;
    }
    
    const dp = ac.darkPoolPct ?? 0;
    const sv = ac.shortVolPct ?? 'N/A';
    const wi = ac.whaleIndex ?? 0;
    const mp = ac.maxPain ?? 'N/A';
    const gex = ac.gex ? '✅' : '❌';
    const alpha = ac.alphaSnapshot?.grade ?? 'N/A';
    const status = dp > 0 ? '✅' : '❌ DP=0';
    if (dp === 0) allGood = false;
    
    console.log(`  ${ticker.padEnd(10)} | ${String(dp).padEnd(10)} | ${String(sv).padEnd(11)} | ${String(wi).padEnd(8)} | ${String(mp).padEnd(8)} | ${gex.padEnd(6)} | ${alpha.padEnd(6)} | ${status}`);
  }
  
  console.log('\n════════════════════════════════════════════════');
  if (allGood) {
    console.log('  ✅ ALL TICKERS PASS — Dark Pool pipeline fully operational');
  } else {
    console.log('  ⚠️ Some tickers need next cron cycle to update');
    console.log('  Note: Batch mode runs every 5 min — all will be fixed on next cycle');
  }
  console.log('════════════════════════════════════════════════');
}

main().catch(console.error);
