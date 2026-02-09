// FINAL: DC 100% verification — all 19 DC fields + all AlphaInput fields
const http = require('http');

function fetch(url, timeout = 60000) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('Parse err')); }
            });
        });
        req.on('error', reject);
        req.setTimeout(timeout, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

async function main() {
    console.log('Fetching NVDA (fresh, no cache)...');
    // Force cache bypass by adding timestamp
    const r = await fetch(`http://localhost:3000/api/dashboard/unified?tickers=NVDA&_t=${Date.now()}`);

    const nvda = r.tickers?.NVDA;
    if (!nvda) { console.log('NVDA not found'); return; }

    const alpha = nvda.alpha || {};
    const market = r.market || {};

    console.log('=== AlphaEngine V4.1 — DC 100% Final Audit ===');
    console.log(`Score: ${alpha.score} (${alpha.grade}) | DC: ${alpha.dataCompleteness}%`);
    console.log(`Action: ${alpha.actionKR}`);
    console.log(`Version: ${alpha.engineVersion}\n`);

    // DC fields only (19 fields that alphaEngine checks)
    const dcFields = [
        { group: 'MOMENTUM', name: 'vwap', val: nvda.vwap },
        { group: 'MOMENTUM', name: 'return3D', val: nvda._return3D, hidden: true },
        { group: 'MOMENTUM', name: 'rsi14', val: nvda._rsi14, hidden: true },
        { group: 'MOMENTUM', name: 'sma20', val: nvda._sma20, hidden: true },

        { group: 'STRUCTURE', name: 'pcr', val: nvda.pcr },
        { group: 'STRUCTURE', name: 'gex', val: nvda.netGex },
        { group: 'STRUCTURE', name: 'callWall', val: nvda.levels?.callWall },
        { group: 'STRUCTURE', name: 'putFloor', val: nvda.levels?.putFloor },
        { group: 'STRUCTURE', name: 'squeezeScore', val: nvda.squeezeScore },
        { group: 'STRUCTURE', name: 'ivSkew', val: nvda._ivSkew, hidden: true },

        { group: 'FLOW', name: 'darkPoolPct', val: nvda.darkPoolPct },
        { group: 'FLOW', name: 'shortVolPct', val: nvda.shortVolPct },
        { group: 'FLOW', name: 'whaleIndex', val: 'auto(GEX)', skip: true },
        { group: 'FLOW', name: 'relVol', val: nvda._relVol, hidden: true },
        { group: 'FLOW', name: 'blockTrades', val: nvda._blockTrades, hidden: true },

        { group: 'REGIME', name: 'ndxChangePct', val: market.nq?.change },
        { group: 'REGIME', name: 'vixValue', val: market.vix },
        { group: 'REGIME', name: 'tltChangePct', val: market.tltChangePct },

        { group: 'CATALYST', name: 'impliedMovePct', val: nvda.impliedMovePct },
    ];

    let connected = 0, missing = 0;
    let currentGroup = '';

    dcFields.forEach(f => {
        if (f.group !== currentGroup) {
            currentGroup = f.group;
            console.log(`\n--- ${currentGroup} (DC checked) ---`);
        }
        if (f.skip) {
            console.log(`  ✅ ${f.name}: ${f.val}`);
            connected++;
            return;
        }
        const has = f.val !== undefined && f.val !== null;
        const label = f.hidden ? '(internal)' : '';
        console.log(`  ${has ? '✅' : '❌'} ${f.name}: ${has ? f.val : 'MISSING'} ${label}`);
        if (has) connected++; else missing++;
    });

    // Non-DC but still important fields
    console.log('\n--- EXTRA (not in DC, but used in scoring) ---');
    console.log(`  gldChangePct: ${market.gldChangePct ?? 'MISSING'}`);
    console.log(`  rawChain: ${(nvda._rawChain || []).length > 0 ? (nvda._rawChain || []).length + ' contracts' : 'MISSING'}`);

    console.log('\n--- PILLARS ---');
    if (alpha.pillars) {
        Object.entries(alpha.pillars).forEach(([k, v]) => {
            console.log(`  ${k}: ${v}`);
        });
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`DC FIELDS: ${connected}/${dcFields.length} connected, ${missing} missing`);
    console.log(`ENGINE DC:  ${alpha.dataCompleteness}%`);
    console.log(`${'='.repeat(50)}`);
}

main().catch(e => console.error('Error:', e.message));
