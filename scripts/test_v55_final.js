// Final E2E test: call warm-analysis result via API and verify MACD/VIX3M
const BASE = 'http://localhost:3000';

async function main() {
    // Test 1: Call warm-analysis directly (it returns full results with pillar data)
    console.log('=== Testing warm-analysis for SINGLE ticker (AAPL) ===');
    console.log('This re-triggers analysis with MACD + VIX3M in the pipeline\n');

    // We need to test the analysis cache or dashboard/unified which returns full pillar data
    // Let's use the dashboard/unified endpoint which returns analysis with full pillar factors

    console.log('=== Step 1: Check dashboard/unified for NVDA (includes full pillar factors) ===');
    try {
        const res = await fetch(`${BASE}/api/dashboard/unified?ticker=NVDA`);
        const data = await res.json();

        if (data?.alpha?.pillars?.momentum?.factors) {
            console.log('\n✅ Full pillar factor data available!\n');
            console.log('MOMENTUM factors:');
            data.alpha.pillars.momentum.factors.forEach(f => {
                const marker = f.name === 'macdCross' ? ' ←←← MACD' : '';
                console.log(`  ${f.name}: ${f.value}/${f.max} — ${f.detail}${marker}`);
            });

            console.log('\nREGIME factors:');
            data.alpha.pillars.regime.factors.forEach(f => {
                const marker = f.name === 'vixTerm' ? ' ←←← VIX3M' : '';
                console.log(`  ${f.name}: ${f.value}/${f.max} — ${f.detail}${marker}`);
            });

            // Verify MACD factor exists
            const macd = data.alpha.pillars.momentum.factors.find(f => f.name === 'macdCross');
            const vixTerm = data.alpha.pillars.regime.factors.find(f => f.name === 'vixTerm');

            console.log('\n' + '='.repeat(50));
            console.log('MACD Factor:', macd ? `✅ ${macd.value} — ${macd.detail}` : '❌ NOT FOUND');
            console.log('VIX Term Factor:', vixTerm ? `✅ ${vixTerm.value} — ${vixTerm.detail}` : '⚠ Not present (VIX3M data may be null)');
        } else {
            console.log('⚠ No factor breakdown in dashboard response');
            console.log('Alpha:', JSON.stringify(data?.alpha).substring(0, 300));
        }
    } catch (e) {
        console.log('❌ Dashboard unified error:', e.message);
    }

    // Test 2: Test a second ticker to confirm it's not just NVDA
    console.log('\n=== Step 2: Check TSLA for MACD factor ===');
    try {
        const res = await fetch(`${BASE}/api/dashboard/unified?ticker=TSLA`);
        const data = await res.json();

        if (data?.alpha?.pillars?.momentum?.factors) {
            const macd = data.alpha.pillars.momentum.factors.find(f => f.name === 'macdCross');
            const vixTerm = data.alpha.pillars.regime.factors.find(f => f.name === 'vixTerm');
            console.log('TSLA MACD:', macd ? `✅ ${macd.value} — ${macd.detail}` : '❌ NOT FOUND');
            console.log('TSLA VIX Term:', vixTerm ? `✅ ${vixTerm.value} — ${vixTerm.detail}` : '⚠ Not present');
        } else {
            console.log('⚠ No factor data');
        }
    } catch (e) {
        console.log('❌ Error:', e.message);
    }

    // Test 3: Test AMD
    console.log('\n=== Step 3: Check AMD for MACD factor ===');
    try {
        const res = await fetch(`${BASE}/api/dashboard/unified?ticker=AMD`);
        const data = await res.json();

        if (data?.alpha?.pillars?.momentum?.factors) {
            const macd = data.alpha.pillars.momentum.factors.find(f => f.name === 'macdCross');
            const vixTerm = data.alpha.pillars.regime.factors.find(f => f.name === 'vixTerm');
            console.log('AMD MACD:', macd ? `✅ ${macd.value} — ${macd.detail}` : '❌ NOT FOUND');
            console.log('AMD VIX Term:', vixTerm ? `✅ ${vixTerm.value} — ${vixTerm.detail}` : '⚠ Not present');
        } else {
            console.log('⚠ No factor data');
        }
    } catch (e) {
        console.log('❌ Error:', e.message);
    }
}

main().catch(console.error);
