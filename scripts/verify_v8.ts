/**
 * V8 Engine Verification — directly call calculateAlphaScore
 * Tests that V8 Contrarian scoring works correctly
 */
const path = require('path');

// Use ts-node/esm to import the TypeScript module
async function main() {
  // We'll use tsx to run this
  const { calculateAlphaScore } = await import('../src/services/alphaEngine.ts');

  console.log('=== V8 ENGINE VERIFICATION ===\n');

  // Test 1: Big drop + low RSI + below VWAP = should score HIGH (contrarian)
  const test1 = calculateAlphaScore({
    ticker: 'TEST1',
    session: 'REG',
    price: 95,
    prevClose: 100,
    changePct: -5.0,
    vwap: 100,
    rsi14: 22,
    return3D: -10,
    ndxChangePct: -1.5,
    vixValue: 28,
    vixChangePct: 8,
    sentiment: 'NEGATIVE',
    hasEarningsSoon: false,
    hasFOMCSoon: false,
    wasInPrevReport: false,
  });
  console.log(`Test 1 (BIG DROP + LOW RSI + BELOW VWAP):`);
  console.log(`  Score: ${test1.score} | Grade: ${test1.grade} | Action: ${test1.action}`);
  console.log(`  Engine: ${test1.engineVersion}`);
  console.log(`  Gates: ${test1.gatesApplied.join(', ') || 'none'}`);
  console.log(`  Expected: HIGH score (contrarian buy signal)`);
  console.log(`  ${test1.score >= 70 ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 2: Big rally + high RSI + above VWAP = should score LOW (contrarian)
  const test2 = calculateAlphaScore({
    ticker: 'TEST2',
    session: 'REG',
    price: 110,
    prevClose: 100,
    changePct: 5.0,
    vwap: 100,
    rsi14: 78,
    return3D: 12,
    ndxChangePct: 1.5,
    vixValue: 12,
    vixChangePct: -3,
    sentiment: 'POSITIVE',
    hasEarningsSoon: false,
    hasFOMCSoon: false,
    wasInPrevReport: false,
  });
  console.log(`Test 2 (BIG RALLY + HIGH RSI + ABOVE VWAP):`);
  console.log(`  Score: ${test2.score} | Grade: ${test2.grade} | Action: ${test2.action}`);
  console.log(`  Engine: ${test2.engineVersion}`);
  console.log(`  Expected: LOW score (overbought, contrarian avoid)`);
  console.log(`  ${test2.score <= 45 ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 3: Neutral market
  const test3 = calculateAlphaScore({
    ticker: 'TEST3',
    session: 'REG',
    price: 100.5,
    prevClose: 100,
    changePct: 0.5,
    vwap: 100.2,
    rsi14: 52,
    return3D: 1,
    ndxChangePct: 0.2,
    vixValue: 17,
    vixChangePct: -1,
    sentiment: 'NEUTRAL',
    hasEarningsSoon: false,
    hasFOMCSoon: false,
    wasInPrevReport: false,
  });
  console.log(`Test 3 (NEUTRAL MARKET):`);
  console.log(`  Score: ${test3.score} | Grade: ${test3.grade} | Action: ${test3.action}`);
  console.log(`  Engine: ${test3.engineVersion}`);
  console.log(`  Expected: MID score (40-60)`);
  console.log(`  ${test3.score >= 35 && test3.score <= 65 ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 4: FEAR_RESOLUTION gate test
  const test4 = calculateAlphaScore({
    ticker: 'TEST4',
    session: 'REG',
    price: 92,
    prevClose: 100,
    changePct: -3.0,
    vwap: 98,
    rsi14: 28,
    return3D: -8,
    ndxChangePct: -1.0,
    vixValue: 25,
    vixChangePct: -5,
    macdHistogram: -0.5,
    sentiment: 'NEGATIVE',
    hasEarningsSoon: false,
    hasFOMCSoon: false,
    wasInPrevReport: false,
  });
  console.log(`Test 4 (FEAR_RESOLUTION — NDX down + VIX dropping + RSI<40):`);
  console.log(`  Score: ${test4.score} | Grade: ${test4.grade} | Action: ${test4.action}`);
  console.log(`  Engine: ${test4.engineVersion}`);
  console.log(`  Gates: ${test4.gatesApplied.join(', ') || 'none'}`);
  console.log(`  Expected: VERY HIGH score + FEAR_RESOLUTION gate`);
  const hasFR = test4.gatesApplied.includes('FEAR_RESOLUTION') || test4.gatesApplied.includes('FEAR_RESOLUTION_MACD');
  console.log(`  ${test4.score >= 75 && hasFR ? '✅ PASS' : '❌ FAIL'}\n`);

  // Summary
  console.log('=== VERSION CHECK ===');
  console.log(`Engine Version: ${test1.engineVersion}`);
  console.log(`Expected: 8.0.0`);
  console.log(`${test1.engineVersion === '8.0.0' ? '✅ VERSION CORRECT' : '❌ VERSION WRONG'}\n`);

  // Test score spread
  console.log('=== SCORE SPREAD CHECK ===');
  console.log(`Contrarian (drop): ${test1.score}`);
  console.log(`Momentum (rally): ${test2.score}`);
  console.log(`Spread: ${test1.score - test2.score} (should be positive)`);
  console.log(`${test1.score > test2.score ? '✅ CONTRARIAN LOGIC WORKING' : '❌ CONTRARIAN LOGIC BROKEN'}`);
}

main().catch(console.error);
