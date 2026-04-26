/**
 * POST-DEPLOY VERIFICATION
 * 1. Trigger Lambda OnDemand for MCD (previously darkPoolPct=0)
 * 2. Wait for completion
 * 3. Read back cache:analysis:MCD from Upstash
 * 4. Verify darkPoolPct > 0
 */
require('dotenv').config({ path: '.env.local' });

const LAMBDA_URL = 'https://luto3y4wmiku6mjhlbzny3hmp40acvqd.lambda-url.us-east-1.on.aws';
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
  console.log('═══ POST-DEPLOY VERIFICATION ═══\n');

  // Step 1: Read BEFORE values
  const TICKERS = ['MCD', 'WDC', 'COST', 'RIVN'];
  
  console.log('BEFORE (current cache:analysis):');
  for (const t of TICKERS) {
    const ac = await redisGet(`cache:analysis:${t}`);
    console.log(`  ${t}: darkPoolPct=${ac?.darkPoolPct ?? 'NULL'}`);
  }

  // Step 2: Trigger Lambda OnDemand for each problem ticker
  console.log('\nTriggering Lambda OnDemand for problem tickers...');
  for (const t of TICKERS) {
    try {
      const res = await fetch(`${LAMBDA_URL}?ticker=${t}`, { signal: AbortSignal.timeout(30000) });
      const data = await res.json();
      console.log(`  ${t}: ${data.success ? '✅' : '❌'} ${data.fields || 0}/5 fields, ${data.duration || '?'}ms`);
    } catch (e) {
      console.log(`  ${t}: ❌ Error: ${e.message}`);
    }
  }

  // Step 3: Wait a moment for Redis propagation
  console.log('\nWaiting 2s for Redis propagation...');
  await new Promise(r => setTimeout(r, 2000));

  // Step 4: Read AFTER values
  console.log('\nAFTER (updated cache:analysis):');
  let allFixed = true;
  for (const t of TICKERS) {
    const ac = await redisGet(`cache:analysis:${t}`);
    const dp = ac?.darkPoolPct ?? 0;
    const status = dp > 0 ? '✅' : '❌';
    if (dp === 0) allFixed = false;
    console.log(`  ${status} ${t}: darkPoolPct=${dp}%`);
  }

  console.log(`\n${allFixed ? '✅ ALL FIXED — Dark Pool data now flowing correctly!' : '⚠️ Some tickers still have issues'}`);
  console.log('\n═══ VERIFICATION COMPLETE ═══');
}

main().catch(console.error);
