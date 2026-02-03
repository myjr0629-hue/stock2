// Alpha Engine v2.0 Stress Test - English Version
// All functions implemented inline for direct testing

console.log('\n========================================');
console.log('ALPHA ENGINE v2.0 STRESS TEST');
console.log('========================================\n');

// ============ INLINE IMPLEMENTATIONS ============

function calculateOIHeat(rawChain) {
    if (!rawChain || rawChain.length === 0) return 0;
    const sorted = [...rawChain]
        .filter(c => c.open_interest > 0)
        .sort((a, b) => (b.open_interest || 0) - (a.open_interest || 0));
    if (sorted.length < 3) return 0;
    const top3OI = sorted.slice(0, 3).reduce((sum, c) => sum + (c.open_interest || 0), 0);
    const totalOI = sorted.reduce((sum, c) => sum + (c.open_interest || 0), 0);
    if (totalOI === 0) return 0;
    const concentration = top3OI / totalOI;
    return Math.min(5, Math.max(0, concentration * 15));
}

function getGammaFlipBonus(price, gammaFlipLevel) {
    if (!gammaFlipLevel || gammaFlipLevel <= 0 || price <= 0) return 0;
    const distance = Math.abs(price - gammaFlipLevel) / price;
    if (distance < 0.02) return 5;
    if (distance < 0.05) return 3;
    if (distance < 0.10) return 1;
    return 0;
}

function getWallDistanceScore(price, callWall, putFloor) {
    if (price <= 0) return 0;
    const hasCallWall = callWall > 0 && callWall > price;
    const hasPutFloor = putFloor > 0 && putFloor < price;
    if (hasCallWall && hasPutFloor) {
        const callDist = (callWall - price) / price;
        const putDist = (price - putFloor) / price;
        if (callDist < 0.05 && putDist < 0.05) return 3;
        if (callDist < 0.10 && putDist < 0.10) return 2;
        return 1;
    }
    if (hasCallWall || hasPutFloor) return 1;
    return 0;
}

function getWhaleBonus(whaleIndex) {
    if (!whaleIndex) return 0;
    if (whaleIndex >= 80) return 5;
    if (whaleIndex >= 60) return 3;
    if (whaleIndex >= 40) return 1;
    return 0;
}

function getOffExBonus(offExPct) {
    if (!offExPct) return 0;
    if (offExPct > 0.4) return 3;
    if (offExPct > 0.25) return 2;
    if (offExPct > 0.15) return 1;
    return 0;
}

function getBetaPenalty(beta) {
    if (beta >= 2.0) return 3;
    if (beta >= 1.5) return 2;
    if (beta >= 1.2) return 1;
    return 0;
}

function getVIXTermScore(vixChange) {
    if (vixChange > 5) return 0;
    if (vixChange > 2) return 1;
    if (vixChange < -3) return 4;
    if (vixChange < 0) return 3;
    return 2;
}

function getSafeHavenScore(tltChange, gldChange) {
    const avgFlow = (tltChange + gldChange) / 2;
    if (avgFlow > 2) return 0;
    if (avgFlow > 0.5) return 1;
    if (avgFlow < -1) return 4;
    if (avgFlow < 0) return 3;
    return 2;
}

// ============ UNIT TESTS ============

console.log('[TEST 1] OI Heat Calculation');
const mockChain = [
    { open_interest: 50000 },
    { open_interest: 30000 },
    { open_interest: 20000 },
    { open_interest: 5000 },
    { open_interest: 3000 },
];
const oiHeat = calculateOIHeat(mockChain);
console.log('  Result: ' + oiHeat.toFixed(2) + '/5 ' + (oiHeat > 4 ? 'PASS' : 'CHECK'));

console.log('\n[TEST 2] Gamma Flip Bonus');
console.log('  1% distance: ' + getGammaFlipBonus(100, 101) + ' (expected: 5)');
console.log('  3% distance: ' + getGammaFlipBonus(100, 103) + ' (expected: 3)');
console.log('  8% distance: ' + getGammaFlipBonus(100, 108) + ' (expected: 1)');
console.log('  15% distance: ' + getGammaFlipBonus(100, 115) + ' (expected: 0)');

console.log('\n[TEST 3] Beta Penalty');
console.log('  Beta 2.5: -' + getBetaPenalty(2.5) + ' (expected: -3)');
console.log('  Beta 1.7: -' + getBetaPenalty(1.7) + ' (expected: -2)');
console.log('  Beta 1.3: -' + getBetaPenalty(1.3) + ' (expected: -1)');
console.log('  Beta 0.9: -' + getBetaPenalty(0.9) + ' (expected: 0)');

// ============ FULL SCENARIO SIMULATION ============

console.log('\n========================================');
console.log('FULL SCENARIO SIMULATION');
console.log('========================================');

function simulateFullScore(scenario) {
    const { name, momentum, pcr, oiHeat, gammaFlip, wallDist, gex, whale, offEx, regime, vix, tlt, gld, rsi, volRatio, atr, beta } = scenario;

    const pcrScore = Math.min(8, pcr * 4);
    const oiScore = oiHeat * 0.8;
    const optionsRaw = Math.min(20, pcrScore + oiScore + gammaFlip + wallDist);

    const gexScore = Math.min(12, 10 + gex);
    const structureRaw = Math.min(20, gexScore + whale + offEx);

    const baseRegime = regime === 'Risk-On' ? 12 : regime === 'Neutral' ? 8 : 3;
    const vixScore = getVIXTermScore(vix);
    const safeHaven = getSafeHavenScore(tlt, gld);
    const regimeRaw = Math.min(20, baseRegime + vixScore + safeHaven);

    const momentumRaw = momentum;

    const volPenalty = volRatio > 2 ? Math.min(5, (volRatio - 2) * 2) : 0;
    const atrPenalty = atr > 0.05 ? 3 : atr > 0.03 ? 1 : 0;
    const betaPenalty = getBetaPenalty(beta);
    const rsiPenalty = Math.abs(50 - rsi) / 2.5;
    const riskRaw = Math.min(20, Math.max(0, 20 - rsiPenalty - volPenalty - atrPenalty - betaPenalty));

    const total = momentumRaw + optionsRaw + structureRaw + regimeRaw + riskRaw;

    console.log('\n' + name);
    console.log('  Momentum:  ' + momentumRaw.toFixed(1) + '/20');
    console.log('  Options:   ' + optionsRaw.toFixed(1) + '/20');
    console.log('  Structure: ' + structureRaw.toFixed(1) + '/20');
    console.log('  Regime:    ' + regimeRaw.toFixed(1) + '/20');
    console.log('  Risk:      ' + riskRaw.toFixed(1) + '/20 (RSI:-' + rsiPenalty.toFixed(1) + ' Vol:-' + volPenalty.toFixed(1) + ' ATR:-' + atrPenalty + ' Beta:-' + betaPenalty + ')');
    console.log('  TOTAL:     ' + total.toFixed(1) + '/100');

    return { total, risk: riskRaw };
}

const bull = simulateFullScore({
    name: 'PERFECT BULL (NVDA-like)',
    momentum: 18, pcr: 0.6, oiHeat: 4.5, gammaFlip: 5, wallDist: 3,
    gex: 2, whale: 5, offEx: 3,
    regime: 'Risk-On', vix: -3, tlt: -1, gld: -0.5,
    rsi: 55, volRatio: 1.5, atr: 0.025, beta: 1.1
});

const growth = simulateFullScore({
    name: 'SOLID GROWTH (AAPL-like)',
    momentum: 14, pcr: 0.7, oiHeat: 3, gammaFlip: 3, wallDist: 2,
    gex: 1, whale: 3, offEx: 2,
    regime: 'Risk-On', vix: -1, tlt: 0, gld: 0,
    rsi: 52, volRatio: 1.2, atr: 0.02, beta: 1.0
});

const value = simulateFullScore({
    name: 'CONSERVATIVE VALUE (KO-like)',
    momentum: 12, pcr: 0.8, oiHeat: 2, gammaFlip: 1, wallDist: 2,
    gex: 0, whale: 1, offEx: 1,
    regime: 'Neutral', vix: 0.5, tlt: 0.3, gld: 0.2,
    rsi: 48, volRatio: 0.8, atr: 0.015, beta: 0.5
});

const meme = simulateFullScore({
    name: 'HIGH RISK MEME (GME-like)',
    momentum: 19, pcr: 0.4, oiHeat: 5, gammaFlip: 5, wallDist: 0,
    gex: -2, whale: 4, offEx: 2,
    regime: 'Risk-On', vix: 2, tlt: 0, gld: 0,
    rsi: 78, volRatio: 4.5, atr: 0.08, beta: 2.2
});

const bear = simulateFullScore({
    name: 'BEAR MARKET (Defensive)',
    momentum: 8, pcr: 1.2, oiHeat: 1, gammaFlip: 0, wallDist: 1,
    gex: -1, whale: 0, offEx: 0,
    regime: 'Risk-Off', vix: 6, tlt: 2, gld: 1.5,
    rsi: 35, volRatio: 2.5, atr: 0.04, beta: 1.4
});

// ============ FINAL REPORT ============

console.log('\n========================================');
console.log('FINAL REPORT');
console.log('========================================');

function getTier(score) {
    if (score >= 75) return 'ACTIONABLE';
    if (score >= 55) return 'WATCH';
    return 'FILLER';
}

console.log('\nSCORE SUMMARY:');
console.log('  NVDA-like:  ' + bull.total.toFixed(1) + ' -> ' + getTier(bull.total));
console.log('  AAPL-like:  ' + growth.total.toFixed(1) + ' -> ' + getTier(growth.total));
console.log('  KO-like:    ' + value.total.toFixed(1) + ' -> ' + getTier(value.total));
console.log('  GME-like:   ' + meme.total.toFixed(1) + ' -> ' + getTier(meme.total));
console.log('  Bear:       ' + bear.total.toFixed(1) + ' -> ' + getTier(bear.total));

const avgScore = (bull.total + growth.total + value.total + meme.total + bear.total) / 5;
console.log('\nAVERAGE SCORE: ' + avgScore.toFixed(1) + '/100');

const scores = [bull.total, growth.total, value.total, meme.total, bear.total];
const actionableCount = scores.filter(s => s >= 75).length;
const watchCount = scores.filter(s => s >= 55 && s < 75).length;
const fillerCount = scores.filter(s => s < 55).length;

console.log('\nDISTRIBUTION:');
console.log('  ACTIONABLE: ' + actionableCount + '/5 (' + (actionableCount / 5 * 100).toFixed(0) + '%)');
console.log('  WATCH:      ' + watchCount + '/5 (' + (watchCount / 5 * 100).toFixed(0) + '%)');
console.log('  FILLER:     ' + fillerCount + '/5 (' + (fillerCount / 5 * 100).toFixed(0) + '%)');

console.log('\n========================================');
console.log('DIAGNOSIS');
console.log('========================================');

if (actionableCount >= 2 && watchCount >= 1) {
    console.log('RESULT: Filter is BALANCED - Good selectivity');
} else if (actionableCount === 0) {
    console.log('RESULT: Filter is TOO TIGHT - No ACTIONABLE stocks!');
    console.log('RECOMMENDATION: Reduce penalties');
} else if (actionableCount >= 4) {
    console.log('RESULT: Filter is TOO LOOSE - Too many passing');
    console.log('RECOMMENDATION: Increase thresholds');
}

console.log('\nRISK SCORE ANALYSIS:');
console.log('  NVDA Risk: ' + bull.risk.toFixed(1) + '/20 - ' + (bull.risk >= 15 ? 'Healthy' : 'Check'));
console.log('  GME Risk:  ' + meme.risk.toFixed(1) + '/20 - ' + (meme.risk < 5 ? 'Over-penalized!' : 'OK'));

if (meme.risk < 5) {
    console.log('\nWARNING: High volatility stocks heavily penalized in Risk');
    console.log('CONSIDER: Reduce RSI penalty from /2.5 to /3.0');
}

console.log('\n========================================');
console.log('STRESS TEST COMPLETE');
console.log('========================================\n');
