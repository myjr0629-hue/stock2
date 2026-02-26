// V5.5 Verification: Test with fresh ticker to bypass Redis cache
// Also check server logs for MACD factor in pillar breakdown
const BASE = 'http://localhost:3000';

async function main() {
    // Use less common ticker that won't be cached
    const ticker = 'AMD';

    console.log(`🔬 Testing ${ticker} (fresh, no Redis cache expected)...`);
    console.log('This will force full engine computation with MACD + VIX3M\n');

    const start = Date.now();
    const res = await fetch(`${BASE}/api/live/ticker?t=${ticker}`);
    const data = await res.json();
    const elapsed = Date.now() - start;

    console.log(`Response in ${elapsed}ms (${data._cached ? 'CACHED ⚠' : 'FRESH ✅'})\n`);

    if (!data.alpha) {
        console.log('❌ No alpha data');
        return;
    }

    console.log('Alpha Score:', data.alpha.score, `(${data.alpha.grade})`);
    console.log('Engine:', data.alpha.engineVersion);
    console.log('Completeness:', data.alpha.dataCompleteness + '%');
    console.log('');
    console.log('Momentum:', data.alpha.pillars.momentum.score + '/' + data.alpha.pillars.momentum.max);
    console.log('Structure:', data.alpha.pillars.structure.score + '/' + data.alpha.pillars.structure.max);
    console.log('Flow:', data.alpha.pillars.flow.score + '/' + data.alpha.pillars.flow.max);
    console.log('Regime:', data.alpha.pillars.regime.score + '/' + data.alpha.pillars.regime.max);
    console.log('Catalyst:', data.alpha.pillars.catalyst.score + '/' + data.alpha.pillars.catalyst.max);

    // The factors are not sent in live/ticker response (only score/max).
    // But we can verify by checking server console logs.
    console.log('\n⚡ Check the dev server terminal for:');
    console.log('   - "macdCross" in the alpha calculation log');
    console.log('   - "vixTerm" in the alpha calculation log');
    console.log('   - "[WARM] Macro loaded: ... VIX3M=..." in warm output');
}

main().catch(console.error);
