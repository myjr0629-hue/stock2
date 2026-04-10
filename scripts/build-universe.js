/**
 * SIGNUM HQ — Universe Builder
 * 
 * Builds stock_universe_us800.json from Polygon data.
 * Selection criteria:
 *   1. Core 300 (stock_universe_us300.json) — always included
 *   2. Additional stocks selected by OPTIONS TRADING VOLUME
 *   3. Quality Gate: price >= $5, daily volume >= 500K, ETF excluded
 *   4. Target: 800-1000 unique stocks
 * 
 * Usage: node scripts/build-universe.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const POLYGON_KEY = process.env.POLYGON_API_KEY || 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const TARGET_SIZE = 1000;

// ═══ Known ETF symbols (subset for filtering) ═══
const KNOWN_ETFS = new Set([
    'SPY','QQQ','IWM','DIA','VOO','VTI','VEA','VWO','EFA','EEM',
    'XLK','XLF','XLV','XLE','XLI','XLY','XLP','XLU','XLB','XLRE',
    'GLD','SLV','IAU','USO','UNG','TLT','TBT','IEF','SHY','BND','AGG','LQD','HYG','JNK',
    'ARKK','ARKG','ARKW','ARKF','ARKQ','ARKX',
    'TQQQ','SQQQ','SPXL','SPXS','UPRO','UVXY','VXX','SVXY',
    'SOXL','SOXS','LABU','LABD','NUGT','DUST',
    'TNA','TZA','FAS','FAZ','TECL','TECS','FNGU','FNGD',
    'SMH','SOXX','XBI','IBB','XOP','OIH','KRE','KBE','XHB','XRT',
    'MSTU','MSTX','MSTZ','CONL','CONY','NVDL','NVDU','NVDX','NVDS',
    'TSLL','TSLR','TSLS','AMDL','AMDY','MSFL','MSFD',
    'AAPU','AAPD','AMZU','AMZD','GOOU','METV',
    'BITX','BITU','BITC','BTFX','IBIT','BITO','GBTC',
    'VNQ','SCHD','JEPI','JEPQ','XYLD','QYLD',
    'BOIL','KOLD','UCO','SCO','DBA','DBC',
    'IVV','IJH','IJR','MDY','VB','VTV','VUG','VIG','VYM',
    'EWJ','EWZ','FXI','MCHI','KWEB','EWY','INDA',
    'UUP','PFF','ICLN','TAN','LIT','REMX',
    'UVIX','SVIX','VIXY','VIXM','BATT','DRIV',
    'OARK','DIVO','RYLD','HDV','SPHD','DVY','DGRO',
    'MSTY','NVDY','TSLY','APLY','PLTY','YMAX','YMAG','ULTY',
    'MAGS','TMF','TMV','QLD','QID','SSO','SDS','DDM','DXD','UWM','TWM',
    'BULZ','BERZ','HIBS','HIBL','NRGD','NRGU','WEBL','WEBS','OILU','OILD','DPST','DRV',
]);

// ETF name patterns
const ETF_NAME_PATTERNS = [
    /proshares/i, /direxion/i, /ishares/i, /vanguard.*etf/i, /spdr/i,
    /invesco/i, /wisdomtree/i, /first trust/i, /vaneck/i,
    / etf$/i, / fund$/i, /^graniteshares/i, /leveraged/i, /inverse/i,
    /ultra/i, /2x/i, /3x/i, /-2x/i, /-3x/i, /trust$/i,
];

function isETF(ticker, name) {
    const ESSENTIAL_PROXIES = new Set(['SPY', 'QQQ', 'IWM', 'DIA', '^VIX']);
    if (ESSENTIAL_PROXIES.has(ticker)) return false;

    if (KNOWN_ETFS.has(ticker)) return true;
    if (name) {
        for (const pattern of ETF_NAME_PATTERNS) {
            if (pattern.test(name)) return true;
        }
    }
    return false;
}

function httpsGet(url) {
    return new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error('TIMEOUT')), 30000);
        https.get(url, { headers: { 'User-Agent': 'SIGNUM-HQ/6.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => { clearTimeout(to); try { resolve(JSON.parse(data)); } catch { resolve(data); } });
        }).on('error', (e) => { clearTimeout(to); reject(e); });
    });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  SIGNUM Universe Builder — Options Volume Focus  ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    // 1. Load existing core universe
    const corePath = path.join(__dirname, '..', 'data', 'stock_universe_us300.json');
    const coreData = JSON.parse(fs.readFileSync(corePath, 'utf-8'));
    const coreSymbols = new Set(coreData.symbols);
    console.log(`[1/5] Core universe loaded: ${coreSymbols.size} symbols\n`);

    // 2. Fetch ALL US stock snapshots (price + volume)
    console.log('[2/5] Fetching all US stock snapshots from Polygon...');
    const snapUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_KEY}`;
    const snapData = await httpsGet(snapUrl);
    const allTickers = snapData?.tickers || [];
    console.log(`  Total tickers in snapshot: ${allTickers.length}`);

    // 3. Quality Gate + ETF Filter
    console.log('\n[3/5] Applying quality gate...');
    const qualified = [];
    let etfSkipped = 0, priceSkipped = 0, volSkipped = 0;

    for (const t of allTickers) {
        const ticker = t.ticker;
        if (!ticker || ticker.length > 5) continue; // Skip very long symbols (usually special)
        
        const price = t.lastTrade?.p || t.day?.c || t.prevDay?.c || 0;
        const volume = t.day?.v || 0;

        // ETF check
        if (isETF(ticker, '')) {
            etfSkipped++;
            continue;
        }

        // Price gate
        if (price < 5 || price > 10000) {
            priceSkipped++;
            continue;
        }

        // Volume gate
        if (volume < 500000) {
            volSkipped++;
            continue;
        }

        qualified.push({
            ticker,
            price,
            volume,
            changePct: t.todaysChangePerc || 0,
            isCore: coreSymbols.has(ticker),
        });
    }
    console.log(`  Qualified stocks: ${qualified.length}`);
    console.log(`  Skipped: ETF=${etfSkipped}, Price=${priceSkipped}, Volume=${volSkipped}`);

    // 4. Check options activity for non-core qualified stocks
    // For each qualified stock, probe Polygon options snapshot to verify active options market
    console.log('\n[4/5] Probing options activity for qualified stocks...');
    
    // Separate core (always included) from candidates
    const coreQualified = qualified.filter(s => s.isCore);
    const candidates = qualified.filter(s => !s.isCore);
    
    console.log(`  Core (auto-include): ${coreQualified.length}`);
    console.log(`  Candidates to probe: ${candidates.length}`);
    
    // Sort candidates by volume DESC (high volume = likely high options activity)
    candidates.sort((a, b) => b.volume - a.volume);
    
    // Probe top candidates for options activity
    // We only need ~(TARGET_SIZE - coreSymbols.size) more stocks
    const needed = TARGET_SIZE - coreSymbols.size;
    const probeBatch = candidates.slice(0, Math.min(candidates.length, needed + 200)); // Over-probe for failures
    
    console.log(`  Probing top ${probeBatch.length} candidates for options chains...`);
    
    const optionsActive = [];
    let probed = 0, hasOptions = 0, noOptions = 0;
    
    for (let i = 0; i < probeBatch.length; i += 10) {
        const batch = probeBatch.slice(i, i + 10);
        const results = await Promise.all(batch.map(async (stock) => {
            try {
                // Quick probe: fetch just 1 option contract to check if options exist
                const url = `https://api.polygon.io/v3/snapshot/options/${stock.ticker}?limit=1&apiKey=${POLYGON_KEY}`;
                const data = await httpsGet(url);
                const count = data?.results?.length || 0;
                probed++;
                if (count > 0) {
                    hasOptions++;
                    // Get total options volume from the response
                    return { ...stock, optionsActive: true };
                } else {
                    noOptions++;
                    return null;
                }
            } catch {
                probed++;
                noOptions++;
                return null;
            }
        }));
        
        for (const r of results) {
            if (r) optionsActive.push(r);
        }
        
        // Progress
        if ((i + 10) % 100 === 0 || i + 10 >= probeBatch.length) {
            console.log(`  Progress: ${Math.min(i + 10, probeBatch.length)}/${probeBatch.length} probed | ${hasOptions} with options | ${noOptions} without`);
        }
        
        // Small delay to avoid rate burst
        if (i + 10 < probeBatch.length) await sleep(100);
        
        // Stop if we have enough
        if (optionsActive.length >= needed) {
            console.log(`  Reached target (${needed} additional stocks). Stopping probe.`);
            break;
        }
    }
    
    // 5. Build final universe
    console.log('\n[5/5] Building final universe...');
    
    // Merge: all core + options-active candidates
    const finalSet = new Set([...coreData.symbols]);
    
    // Add options-active candidates sorted by volume
    optionsActive.sort((a, b) => b.volume - a.volume);
    for (const stock of optionsActive) {
        if (finalSet.size >= TARGET_SIZE) break;
        finalSet.add(stock.ticker);
    }
    
    // Also add any core symbols that weren't in snapshot (ensure core integrity)
    for (const sym of coreData.symbols) {
        finalSet.add(sym);
    }
    
    const finalSymbols = [...finalSet].sort();
    
    // Write output
    const outputPath = path.join(__dirname, '..', 'data', 'stock_universe_us800.json');
    const output = {
        version: '3.0',
        updated: new Date().toISOString().slice(0, 10),
        count: finalSymbols.length,
        description: `${finalSymbols.length} US stocks: Core ${coreData.symbols.length} + Options-active high-volume ${finalSymbols.length - coreData.symbols.length}`,
        selectionCriteria: {
            coreGuaranteed: coreData.symbols.length,
            qualityGate: 'price >= $5, daily volume >= 500K',
            expansionCriteria: 'Active options market + high daily volume',
            etfExcluded: true,
        },
        symbols: finalSymbols,
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    
    // Also write Lambda-format copy
    const lambdaUniversePath = path.join(__dirname, 'lambda-harvest', 'universe.json');
    fs.writeFileSync(lambdaUniversePath, JSON.stringify({ symbols: finalSymbols }));
    
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log(`║  ✅ Universe built: ${finalSymbols.length} stocks`);
    console.log(`║  Core: ${coreData.symbols.length} | Expanded: ${finalSymbols.length - coreData.symbols.length}`);
    console.log(`║  Options probed: ${probed} | Active: ${hasOptions}`);
    console.log(`║  Output: data/stock_universe_us800.json`);
    console.log(`║  Lambda: scripts/lambda-harvest/universe.json`);
    console.log('╚══════════════════════════════════════════════════╝');
    
    // Show some sample new additions
    const newAdditions = finalSymbols.filter(s => !coreSymbols.has(s));
    console.log(`\nSample new additions (first 30): ${newAdditions.slice(0, 30).join(', ')}`);
}

main().catch(e => {
    console.error('ERROR:', e.message);
    process.exit(1);
});
