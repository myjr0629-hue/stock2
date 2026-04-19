// Debug script: Check actual Upstash Redis + Live API data for NVDA
// Uses Upstash REST API (no ioredis needed)
require('dotenv').config({ path: '.env.local' });

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisGet(key) {
    const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
    const data = await res.json();
    if (data.result) {
        try { return JSON.parse(data.result); } catch { return data.result; }
    }
    return null;
}

async function main() {
    console.log('\n════════════════════════════════════════════');
    console.log('  NVDA IV & RELATED — LIVE DATA FORENSICS');
    console.log('════════════════════════════════════════════\n');

    // 1. Redis unified cache
    console.log('━━━ [1] REDIS: cache:command:unified:NVDA ━━━');
    const unified = await redisGet('cache:command:unified:NVDA');
    if (unified) {
        const ageMin = Math.round((Date.now() - (unified.timestamp || 0)) / 60000);
        console.log(`  timestamp: ${new Date(unified.timestamp).toISOString()} (${ageMin}분 전)`);
        console.log('  --- structure ---');
        console.log(`    atmIV: ${JSON.stringify(unified.structure?.atmIV)}`);
        console.log(`    atmIv: ${JSON.stringify(unified.structure?.atmIv)}`);
        console.log(`    netGex: ${unified.structure?.netGex}`);
        console.log(`    options_status: ${unified.structure?.options_status}`);
        console.log(`    expiration: ${unified.structure?.expiration}`);
        console.log(`    validation: ${JSON.stringify(unified.structure?.validation)}`);
        console.log(`    all structure keys: ${Object.keys(unified.structure || {}).join(', ')}`);
        console.log('  --- volatility ---');
        console.log(`    iv: ${JSON.stringify(unified.volatility?.iv)}`);
        console.log(`    regime: ${unified.volatility?.regime}`);
        console.log(`    regimeScore: ${unified.volatility?.regimeScore}`);
        console.log(`    gex: ${unified.volatility?.gex}`);
        console.log(`    gexLabel: ${unified.volatility?.gexLabel}`);
        console.log(`    validation: ${JSON.stringify(unified.volatility?.validation)}`);
        console.log(`    _ts: ${unified.volatility?._ts ? new Date(unified.volatility._ts).toISOString() : 'N/A'}`);
        console.log('  --- related ---');
        if (unified.related?.topRelated) {
            unified.related.topRelated.forEach(r => {
                console.log(`    ${r.ticker}: price=${r.price}, change=${r.change}, prevClose=${r.prevClose || 'MISSING'}`);
            });
        }
    } else {
        console.log('  ❌ NO UNIFIED CACHE');
    }

    // 2. Lambda probe cache (raw options chain)
    console.log('\n━━━ [2] REDIS: polygon:snapshot:probe:NVDA ━━━');
    const probe = await redisGet('polygon:snapshot:probe:NVDA');
    if (probe) {
        console.log(`  _ts: ${new Date(probe._ts).toISOString()} (${Math.round((Date.now() - probe._ts) / 60000)}분 전)`);
        console.log(`  weeklyExpiry: ${probe.weeklyExpiry}`);
        console.log(`  exactResults count: ${probe.exactResults?.length || 0}`);
        console.log(`  expirations: ${JSON.stringify(probe.expirations?.slice(0, 5))}`);
        if (probe.exactResults?.length > 0) {
            // Find ATM contract (closest to NVDA ~$201)
            const sortedByStrike = [...probe.exactResults].sort((a, b) => {
                const aK = a.details?.strike_price || 0;
                const bK = b.details?.strike_price || 0;
                return Math.abs(aK - 201) - Math.abs(bK - 201);
            });
            const atm = sortedByStrike[0];
            console.log(`  ATM contract (strike ${atm.details?.strike_price}):`);
            console.log(`    implied_volatility: ${atm.implied_volatility}`);
            console.log(`    greeks.implied_volatility: ${atm.greeks?.implied_volatility}`);
            console.log(`    greeks.gamma: ${atm.greeks?.gamma}`);
            console.log(`    greeks.delta: ${atm.greeks?.delta}`);
            console.log(`    open_interest: ${atm.open_interest}`);
            console.log(`    contract_type: ${atm.details?.contract_type}`);

            const withIV = probe.exactResults.filter(c => 
                (c.implied_volatility && c.implied_volatility > 0) || 
                (c.greeks?.implied_volatility && c.greeks.implied_volatility > 0)
            ).length;
            console.log(`  Contracts with IV: ${withIV}/${probe.exactResults.length}`);
        }
    } else {
        console.log('  ❌ NO PROBE CACHE');
    }

    // 3. DynamoDB GEX data (check if signum-gex has IV)
    console.log('\n━━━ [3] REDIS: signum-gex DynamoDB keys ━━━');
    // Check if Lambda stores IV in any key
    const gexKeys = ['cache:gex:NVDA', 'gex:NVDA', 'signum-gex:NVDA'];
    for (const k of gexKeys) {
        const d = await redisGet(k);
        if (d) {
            console.log(`  ${k}: EXISTS`);
            console.log(`    keys: ${Object.keys(d).join(', ')}`);
            if (d.atmIv !== undefined) console.log(`    atmIv: ${d.atmIv}`);
            if (d.iv !== undefined) console.log(`    iv: ${d.iv}`);
        }
    }

    // 4. Full volatility dump
    console.log('\n━━━ [4] VOLATILITY FULL OBJECT ━━━');
    if (unified?.volatility) {
        console.log(JSON.stringify(unified.volatility, null, 2));
    }

    // 5. Live API: related
    console.log('\n━━━ [5] LIVE API: /api/live/related?t=NVDA ━━━');
    try {
        const res = await fetch('https://www.signumhq.com/api/live/related?t=NVDA');
        const data = await res.json();
        console.log(`  _source: ${data._source}`);
        if (data.topRelated) {
            data.topRelated.forEach(r => {
                console.log(`    ${r.ticker}: price=${r.price}, change=${r.change}, prevClose=${r.prevClose || 'MISSING'}`);
            });
        }
    } catch (e) {
        console.log(`  ❌ ${e.message}`);
    }

    // 6. Live API: volatility-regime
    console.log('\n━━━ [6] LIVE API: /api/live/volatility-regime?t=NVDA ━━━');
    try {
        const res = await fetch('https://www.signumhq.com/api/live/volatility-regime?t=NVDA');
        const data = await res.json();
        console.log(`  iv: ${data.iv}`);
        console.log(`  regime: ${data.regime}`);
        console.log(`  regimeScore: ${data.regimeScore}`);
        console.log(`  gex: ${data.gex}`);
        console.log(`  gexLabel: ${data.gexLabel}`);
        console.log(`  flipDistance: ${data.flipDistance}`);
    } catch (e) {
        console.log(`  ❌ ${e.message}`);
    }

    // 7. Live API: unified (what the client actually gets)
    console.log('\n━━━ [7] LIVE API: /api/command/unified?t=NVDA ━━━');
    try {
        const res = await fetch('https://www.signumhq.com/api/command/unified?t=NVDA&lang=ko');
        const data = await res.json();
        console.log(`  _source: ${data._source}`);
        console.log(`  _ageMs: ${data._ageMs}`);
        console.log(`  structure.atmIV: ${JSON.stringify(data.structure?.atmIV)}`);
        console.log(`  volatility.iv: ${data.volatility?.iv}`);
        console.log(`  volatility.regime: ${data.volatility?.regime}`);
        console.log(`  volatility.regimeScore: ${data.volatility?.regimeScore}`);
        if (data.related?.topRelated) {
            console.log('  related:');
            data.related.topRelated.forEach(r => {
                console.log(`    ${r.ticker}: change=${r.change}, prevClose=${r.prevClose || 'MISSING'}`);
            });
        }
    } catch (e) {
        console.log(`  ❌ ${e.message}`);
    }

    // 8. Check DynamoDB unified-cache
    console.log('\n━━━ [8] REDIS: DynamoDB unified-cache key ━━━');
    const dynKeys = ['dynamo:unified:NVDA', 'cache:dynamo:unified:NVDA'];
    for (const k of dynKeys) {
        const d = await redisGet(k);
        if (d) {
            console.log(`  ${k}: EXISTS`);
            console.log(`    volatility.iv: ${d.volatility?.iv}`);
        }
    }

    console.log('\n════════════════════════════════════════════');
    console.log('  FORENSICS COMPLETE');
    console.log('════════════════════════════════════════════\n');
}

main().catch(e => console.error('FATAL:', e));
