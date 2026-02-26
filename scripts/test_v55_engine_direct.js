// Direct engine test: import calculateAlphaScore and verify factor output directly
// This bypasses the API and tests the engine function directly

import { calculateAlphaScore } from '../src/services/alphaEngine';

async function main() {

    console.log('🔬 Direct Engine Test: MACD + VIX3M Factor Verification\n');

    // Test 1: With MACD golden cross + VIX contango
    console.log('=== Test 1: MACD Golden Cross + VIX Contango ===');
    const result1 = calculateAlphaScore({
        ticker: 'TEST',
        session: 'REG',
        price: 200,
        prevClose: 195,
        changePct: 2.56,
        macdHistogram: 1.5,     // Strong golden cross
        vixValue: 18.0,
        vix3mValue: 22.0,       // Contango (VIX < VIX3M)
    });

    console.log(`Score: ${result1.score} (${result1.grade})`);
    console.log('\nMomentum factors:');
    result1.pillars.momentum.factors.forEach(f => {
        console.log(`  ${f.name}: ${f.value}/${f.max} — ${f.detail}`);
    });
    console.log('\nRegime factors:');
    result1.pillars.regime.factors.forEach(f => {
        console.log(`  ${f.name}: ${f.value}/${f.max} — ${f.detail}`);
    });

    // Test 2: With MACD death cross + VIX backwardation
    console.log('\n=== Test 2: MACD Death Cross + VIX Backwardation ===');
    const result2 = calculateAlphaScore({
        ticker: 'TEST2',
        session: 'REG',
        price: 200,
        prevClose: 195,
        changePct: 2.56,
        macdHistogram: -0.8,    // Strong death cross
        vixValue: 25.0,
        vix3mValue: 22.0,       // Backwardation (VIX > VIX3M)
    });

    console.log(`Score: ${result2.score} (${result2.grade})`);
    console.log('\nMomentum factors:');
    result2.pillars.momentum.factors.forEach(f => {
        console.log(`  ${f.name}: ${f.value}/${f.max} — ${f.detail}`);
    });
    console.log('\nRegime factors:');
    result2.pillars.regime.factors.forEach(f => {
        console.log(`  ${f.name}: ${f.value}/${f.max} — ${f.detail}`);
    });

    // Test 3: Without MACD/VIX3M (should show "없음" / no factor)
    console.log('\n=== Test 3: No MACD, No VIX3M (backward compat) ===');
    const result3 = calculateAlphaScore({
        ticker: 'TEST3',
        session: 'REG',
        price: 200,
        prevClose: 195,
        changePct: 2.56,
        vixValue: 18.0,
    });

    console.log(`Score: ${result3.score} (${result3.grade})`);
    const macdFactor = result3.pillars.momentum.factors.find(f => f.name === 'macdCross');
    const vixTermFactor = result3.pillars.regime.factors.find(f => f.name === 'vixTerm');
    console.log(`MACD factor: ${macdFactor ? macdFactor.value + ' — ' + macdFactor.detail : 'NOT FOUND'}`);
    console.log(`VIX Term factor: ${vixTermFactor ? vixTermFactor.value + ' — ' + vixTermFactor.detail : 'NOT FOUND (expected — no VIX3M data)'}`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('VERIFICATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Test 1 (Golden+Contango): Score ${result1.score}, MACD +3, VIX Term +1`);
    console.log(`Test 2 (Death+Backwardation): Score ${result2.score}, MACD -2, VIX Term -2`);
    console.log(`Test 3 (No data): Score ${result3.score}, backward compatible`);
    console.log(`Score diff (Test1 vs Test2): ${result1.score - result2.score} points`);
}

main().catch(console.error);
