// =================================================================
// FMP API RATE LIMIT DEFINITIVE TEST — Clean State
// =================================================================
// Strategy: 5 min cooldown → Send exactly 10 req/s sustained → find where 429 starts
// This measures the EXACT per-minute limit by counting calls in a rolling 60s window
//
// Pattern: Sequential single-request bursts with precise timing
// =================================================================
const https = require('https');
const KEY = 'JXjTgPslXAIdRg1aDQNLpa7ZkN2BhRnm';
const d = require('../data/stock_universe_us800.json');
const syms = d.symbols.slice(600, 1000); // Use tickers NOT used in any previous test

let ok = 0, fail = 0, r429 = 0;
let firstR429At = null;
let timestamps = []; // Track all request timestamps for rolling window analysis
const start = Date.now();

function singleCall(sym, ep) {
  const suf = ep === 'analyst-estimates' ? '&period=annual' : '';
  const url = `https://financialmodelingprep.com/stable/${ep}?symbol=${sym}${suf}&apikey=${KEY}`;
  return new Promise((resolve) => {
    const r = https.get(url, { timeout: 8000 }, (res) => {
      timestamps.push(Date.now());
      if (res.statusCode === 429) {
        r429++;
        if (!firstR429At) {
          firstR429At = { call: ok + fail + r429, elapsed: Date.now() - start, okSoFar: ok };
        }
      }
      if (res.statusCode === 200) ok++; else fail++;
      resolve(res.statusCode);
      res.resume();
    });
    r.on('error', () => { fail++; resolve(0); });
  });
}

async function run() {
  // Phase 1: Send batches of 5 (15 calls) with 1s sleep — Lambda exact pattern
  // Goal: find the EXACT call count where first 429 appears
  console.log(`Phase 1: Lambda-exact pattern test (batch 5 × 3 APIs, 1s sleep)`);
  console.log(`Using ${syms.length} unique tickers from universe slot 600-1000`);
  
  const endpoints = ['grades-consensus', 'price-target-consensus', 'analyst-estimates'];
  let totalCalls = 0;
  let batchNum = 0;
  
  for (let i = 0; i < syms.length && i < 200; i += 5) {
    const batch = syms.slice(i, i + 5);
    const promises = [];
    
    for (const sym of batch) {
      for (const ep of endpoints) {
        promises.push(singleCall(sym, ep));
        totalCalls++;
      }
    }
    
    await Promise.all(promises);
    batchNum++;
    
    // Report every 10 batches OR on first 429
    if (batchNum % 10 === 0 || r429 > 0) {
      const elapsed = Date.now() - start;
      const elapsedMin = elapsed / 60000;
      const rate = Math.round(totalCalls / elapsedMin);
      console.log(
        `Batch ${batchNum}: total=${totalCalls} ok=${ok} 429=${r429} ` +
        `elapsed=${(elapsed/1000).toFixed(1)}s rate=${rate}/min`
      );
    }
    
    // Stop if we hit 429
    if (r429 > 0) {
      console.log(`\n!!! FIRST 429 DETECTED !!!`);
      console.log(`  Occurred at call #${firstR429At.call}`);
      console.log(`  After ${(firstR429At.elapsed/1000).toFixed(1)}s elapsed`);
      console.log(`  Successful calls before 429: ${firstR429At.okSoFar}`);
      
      // Calculate rolling 60s window at time of 429
      const r429Time = start + firstR429At.elapsed;
      const window60s = timestamps.filter(t => t >= r429Time - 60000 && t <= r429Time);
      console.log(`  Calls in 60s window at 429: ${window60s.length}`);
      console.log(`  → CONFIRMED RATE LIMIT: ~${window60s.length} req/min`);
      break;
    }
    
    await new Promise(r => setTimeout(r, 1000)); // 1s sleep (current Lambda value)
  }
  
  if (r429 === 0) {
    const elapsed = Date.now() - start;
    const elapsedMin = elapsed / 60000;
    console.log(`\nNo 429 detected in ${totalCalls} calls over ${(elapsed/1000).toFixed(1)}s`);
    console.log(`Sustained rate: ${Math.round(totalCalls / elapsedMin)} req/min`);
  }
  
  console.log(`\nFINAL: ok=${ok} fail=${fail} 429=${r429} total=${totalCalls}`);
}

// 5-minute cooldown for absolutely clean state
const COOLDOWN = 300;
console.log(`Waiting ${COOLDOWN}s (5 min) for complete rate limit cooldown...`);
console.log(`Start time: ${new Date().toISOString()}`);
setTimeout(() => {
  console.log(`Cooldown complete at: ${new Date().toISOString()}`);
  run();
}, COOLDOWN * 1000);
