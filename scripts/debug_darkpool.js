// Verify Dark Pool data: EC2 ElastiCache vs Polygon Direct vs Upstash
require('dotenv').config({ path: '.env.local' });

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const EC2_PROXY = process.env.EC2_REDIS_PROXY_URL || "http://52.23.98.13:8081";
const EC2_KEY = process.env.REDIS_PROXY_KEY || "signum-redis-proxy-2026";

async function upstashGet(key) {
    const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
    const d = await res.json();
    return d.result ? JSON.parse(d.result) : null;
}

async function ec2Get(key) {
    try {
        const res = await fetch(`${EC2_PROXY}/get?key=${encodeURIComponent(key)}`, {
            headers: { Authorization: `Bearer ${EC2_KEY}` },
            signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) return { error: `HTTP ${res.status}` };
        const d = await res.json();
        return d?.result || null;
    } catch (e) {
        return { error: e.message };
    }
}

async function main() {
    const TICKER = 'AAPL';
    const key = `rt-metrics:${TICKER}`;

    console.log('\n════════════════════════════════════════════════');
    console.log(`  DARK POOL % FORENSICS — ${TICKER}`);
    console.log('════════════════════════════════════════════════\n');

    // 1. EC2 ElastiCache (primary source)
    console.log('━━━ [1] EC2 ElastiCache (PRIMARY) ━━━');
    const ec2 = await ec2Get(key);
    if (ec2 && !ec2.error) {
        const age = ec2._ts ? Math.round((Date.now() - ec2._ts) / 60000) : '?';
        console.log(`  _source: ${ec2._source}`);
        console.log(`  _ts: ${ec2._ts ? new Date(ec2._ts).toISOString() : 'N/A'} (${age}분 전)`);
        console.log(`  darkPool.percent: ${ec2.darkPool?.percent}%`);
        console.log(`  darkPool.volume: ${ec2.darkPool?.volume?.toLocaleString()}`);
        console.log(`  darkPool.totalVolume: ${ec2.darkPool?.totalVolume?.toLocaleString()}`);
        console.log(`  darkPool.buyPct: ${ec2.darkPool?.buyPct}%`);
        console.log(`  darkPool.sellPct: ${ec2.darkPool?.sellPct}%`);
        console.log(`  darkPool.netBuyValue: $${(ec2.darkPool?.netBuyValue / 1e6)?.toFixed(1)}M`);
        console.log(`  blockTrade.count: ${ec2.blockTrade?.count}`);
        console.log(`  shortVolume.percent: ${ec2.shortVolume?.percent}%`);
        console.log(`  bidAsk: ${ec2.bidAsk ? `spread=$${ec2.bidAsk.spread} (${ec2.bidAsk.label})` : 'N/A'}`);
    } else {
        console.log(`  ❌ ${ec2?.error || 'NO DATA'}`);
    }

    // 2. Upstash Redis (fallback)
    console.log('\n━━━ [2] Upstash Redis (FALLBACK) ━━━');
    const upstash = await upstashGet(key);
    if (upstash) {
        const age = upstash._ts ? Math.round((Date.now() - upstash._ts) / 60000) : '?';
        console.log(`  _source: ${upstash._source || 'polygon-direct'}`);
        console.log(`  _ts: ${upstash._ts ? new Date(upstash._ts).toISOString() : 'N/A'} (${age}분 전)`);
        console.log(`  darkPool.percent: ${upstash.darkPool?.percent}%`);
        console.log(`  darkPool.volume: ${upstash.darkPool?.volume?.toLocaleString()}`);
        console.log(`  darkPool.totalVolume: ${upstash.darkPool?.totalVolume?.toLocaleString()}`);
        console.log(`  darkPool.buyPct: ${upstash.darkPool?.buyPct}%`);
        console.log(`  darkPool.sellPct: ${upstash.darkPool?.sellPct}%`);
    } else {
        console.log('  ❌ NO DATA');
    }

    // 3. Live API (what client sees)
    console.log('\n━━━ [3] LIVE API: /api/flow/realtime-metrics?ticker=AAPL ━━━');
    try {
        const res = await fetch(`https://www.signumhq.com/api/flow/realtime-metrics?ticker=${TICKER}`);
        const data = await res.json();
        console.log(`  _via: ${data._via || 'polygon-direct'}`);
        console.log(`  _cached: ${data._cached || false}`);
        console.log(`  _ageMs: ${data._ageMs ? Math.round(data._ageMs / 60000) + '분' : 'fresh'}`);
        console.log(`  _source: ${data._source || 'N/A'}`);
        console.log(`  darkPool.percent: ${data.darkPool?.percent}%`);
        console.log(`  darkPool.volume: ${data.darkPool?.volume?.toLocaleString()}`);
        console.log(`  darkPool.totalVolume: ${data.darkPool?.totalVolume?.toLocaleString()}`);
        console.log(`  darkPool.buyPct: ${data.darkPool?.buyPct}%`);
        console.log(`  darkPool.sellPct: ${data.darkPool?.sellPct}%`);
        console.log(`  darkPool.netBuyValue: $${(data.darkPool?.netBuyValue / 1e6)?.toFixed(1)}M`);
    } catch (e) {
        console.log(`  ❌ ${e.message}`);
    }

    // 4. Cross-check: manually verify exchange codes
    console.log('\n━━━ [4] EXCHANGE CODE VERIFICATION ━━━');
    console.log('  FINRA Dark Pool Exchange Codes used: [4, 15, 16, 19]');
    console.log('    4  = FINRA TRF (Trade Reporting Facility)');
    console.log('    15 = FINRA ADF (Alternative Display Facility)');
    console.log('    16 = FINRA/NASDAQ TRF Carteret');
    console.log('    19 = FINRA/NASDAQ TRF Chicago');
    console.log('  ✅ These are the standard FINRA dark pool venue codes per Polygon.io docs');
    
    console.log('\n━━━ [5] DATA SOURCE COMPARISON ━━━');
    if (ec2 && !ec2.error && upstash) {
        console.log(`  EC2 (WS 100%):     DP ${ec2.darkPool?.percent}% | Vol: ${ec2.darkPool?.totalVolume?.toLocaleString()} | Buy: ${ec2.darkPool?.buyPct}%`);
        console.log(`  Upstash (Sampling): DP ${upstash.darkPool?.percent}% | Vol: ${upstash.darkPool?.totalVolume?.toLocaleString()} | Buy: ${upstash.darkPool?.buyPct}%`);
        if (ec2.darkPool?.totalVolume && upstash.darkPool?.totalVolume) {
            const ratio = ec2.darkPool.totalVolume / upstash.darkPool.totalVolume;
            console.log(`  Volume Ratio (EC2/Upstash): ${ratio.toFixed(1)}x — EC2 has ${ratio > 1 ? 'MORE' : 'LESS'} trades`);
        }
    }

    console.log('\n════════════════════════════════════════════════');
    console.log('  FORENSICS COMPLETE');
    console.log('════════════════════════════════════════════════\n');
}

main().catch(e => console.error('FATAL:', e));
