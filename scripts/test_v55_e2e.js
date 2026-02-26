// Full E2E Pipeline Verification for V5.5+ MACD + VIX3M
import { getFromCache } from '../src/services/redisClient';

async function main() {
    console.log('=== Step 1: VIX3M Redis Key Check ===');
    try {
        const vix3m = await getFromCache('yahoo:vix3m');
        if (vix3m) {
            console.log('✅ VIX3M Redis data:', JSON.stringify(vix3m));
        } else {
            console.log('❌ VIX3M Redis key is NULL/empty — market-feed cron may not have run yet');
        }
    } catch (e) {
        console.log('❌ VIX3M Redis read error:', e.message);
    }

    console.log('\n=== Step 2: VIX Redis Key Check (control) ===');
    try {
        const vix = await getFromCache('yahoo:vix');
        if (vix) {
            console.log('✅ VIX Redis data:', JSON.stringify(vix));
        } else {
            console.log('❌ VIX Redis key is NULL');
        }
    } catch (e) {
        console.log('❌ VIX Redis read error:', e.message);
    }

    console.log('\n=== Step 3: Trigger warm-analysis cron ===');
    try {
        const res = await fetch('http://localhost:3000/api/cron/warm-analysis');
        const data = await res.json();
        console.log(`Status: ${res.status}`);
        console.log(`Total tickers: ${data.total || 'N/A'}`);
        console.log(`Success: ${data.success || 'N/A'}`);
        console.log(`Failed: ${data.failed || 'N/A'}`);

        if (data.results) {
            const successCount = data.results.filter(r => r.ok).length;
            const failedCount = data.results.filter(r => !r.ok).length;
            console.log(`\nResults: ${successCount} success / ${failedCount} failed`);

            // Show first few results
            const first3 = data.results.slice(0, 3);
            first3.forEach(r => {
                console.log(`  ${r.ticker}: ${r.ok ? '✅' : '❌'} (${r.ms}ms)`);
            });

            // Show failed ones
            const failed = data.results.filter(r => !r.ok);
            if (failed.length > 0) {
                console.log(`\nFailed tickers:`);
                failed.forEach(r => console.log(`  ❌ ${r.ticker} (${r.ms}ms)`));
            }
        }

        console.log(`\nFull response (first 500 chars): ${JSON.stringify(data).substring(0, 500)}`);
    } catch (e) {
        console.log('❌ warm-analysis cron error:', e.message);
    }

    console.log('\n=== Step 4: Check analysis cache for MACD factor ===');
    try {
        // Check if NVDA's cached alpha has MACD factor
        const cacheData = await getFromCache('analysis:NVDA');
        if (cacheData) {
            console.log('✅ NVDA analysis cache exists');
            const snapshot = cacheData.alphaSnapshot;
            if (snapshot?.pillars?.momentum?.factors) {
                const macdFactor = snapshot.pillars.momentum.factors.find(f => f.name === 'macdCross');
                console.log(`MACD factor in cache: ${macdFactor ? `${macdFactor.value} — ${macdFactor.detail}` : '❌ NOT FOUND'}`);
            } else {
                console.log('⚠ Pillars/factors not in cache (cache may only store score/max)');
            }
        } else {
            console.log('⚠ NVDA analysis cache not found (will be written after warm-analysis)');
        }
    } catch (e) {
        console.log('❌ Analysis cache check error:', e.message);
    }
}

main().catch(console.error).finally(() => process.exit(0));
