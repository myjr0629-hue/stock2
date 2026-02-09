// Pipeline Audit Script — Full end-to-end trace for a single ticker
// Usage: node scripts/pipeline_audit.js NVDA

const ticker = process.argv[2] || 'NVDA';
const BASE = 'http://localhost:3000';

async function audit() {
    console.log('='.repeat(80));
    console.log(`PIPELINE AUDIT: ${ticker}`);
    console.log('='.repeat(80));

    // Step 1: CentralDataHub via unified API
    console.log('\n--- STEP 1: RAW DATA (CentralDataHub via dashboard/unified) ---');
    try {
        const res = await fetch(`${BASE}/api/dashboard/unified?tickers=${ticker}`);
        const data = await res.json();
        const item = data.tickers?.[0] || data;
        console.log('Price:', item.price);
        console.log('PrevClose:', item.prevClose);
        console.log('ChangePct:', item.changePct);
        console.log('Volume:', item.volume);
        console.log('RelVol:', item.relVol);
        console.log('VWAP:', item.vwap);
        console.log('RSI14:', item.rsi);
        console.log('GapPct:', item.gapPct);
        console.log('Session:', item.session);
        console.log('PriceSource:', item.priceSource);
        console.log('History3d:', item.history3d?.length, 'bars');
        console.log('Options.pcr:', item.options?.pcr);
        console.log('Options.gex:', item.options?.gex);
        console.log('Options.callWall:', item.options?.callWall);
        console.log('Options.putFloor:', item.options?.putFloor);
        console.log('Options.maxPain:', item.options?.maxPain);
        console.log('Options.status:', item.options?.status);
        console.log('Flow.netPremium:', item.flow?.netPremium);
        console.log('Flow.optionsCount:', item.flow?.optionsCount);
    } catch (e) { console.log('** FAILED:', e.message); }

    // Step 2: Alpha Engine via live/ticker
    console.log('\n--- STEP 2: ALPHA ENGINE (live/ticker API) ---');
    try {
        const res = await fetch(`${BASE}/api/live/ticker?t=${ticker}`);
        const data = await res.json();
        console.log('AlphaScore:', data.alphaScore);
        console.log('AlphaGrade:', data.alphaGrade);
        console.log('WhyKR:', data.whyKR);
        console.log('DataCompleteness:', data.dataCompleteness);
        console.log('Session:', data.session);
        if (data.pillars) {
            console.log('Pillars:');
            for (const [k, v] of Object.entries(data.pillars)) {
                console.log(`  ${k}: ${v.score}/${v.max} (${v.pct}%)`);
            }
        }
    } catch (e) { console.log('** FAILED:', e.message); }

    // Step 3: Check last report data for this ticker
    console.log('\n--- STEP 3: REPORT DATA (draft.json) ---');
    try {
        const fs = require('fs');
        const report = JSON.parse(fs.readFileSync('snapshots/reports/2026-02-08/draft.json', 'utf8'));
        const item = report.items.find(i => i.ticker === ticker);
        if (item) {
            console.log('Found in report. alphaScore(legacy):', item.alphaScore);
            console.log('QualityTier:', item.qualityTier);
            console.log('Complete:', item.complete);
            console.log('Evidence.complete:', item.evidence?.complete);
            console.log('Evidence.price.last:', item.evidence?.price?.last);
            console.log('Evidence.price.rsi14:', item.evidence?.price?.rsi14);
            console.log('Evidence.price.sma20:', item.evidence?.price?.sma20);
            console.log('Evidence.price.return3D:', item.evidence?.price?.return3D);
            console.log('Evidence.flow.vol:', item.evidence?.flow?.vol);
            console.log('Evidence.flow.relVol:', item.evidence?.flow?.relVol);
            console.log('Evidence.options.status:', item.evidence?.options?.status);
            console.log('Evidence.options.pcr:', item.evidence?.options?.pcr);
            console.log('Evidence.options.gex:', item.evidence?.options?.gex);
            console.log('Evidence.options.callWall:', item.evidence?.options?.callWall);
            console.log('Evidence.options.putFloor:', item.evidence?.options?.putFloor);
            console.log('Evidence.macro.ndx:', JSON.stringify(item.evidence?.macro?.ndx));
            console.log('Evidence.macro.vix:', JSON.stringify(item.evidence?.macro?.vix));
            if (item.alphaV3) {
                console.log('--- AlphaV3 ---');
                console.log('V3 Score:', item.alphaV3.score, '(', item.alphaV3.grade, ')');
                console.log('DataCompleteness:', item.alphaV3.dataCompleteness + '%');
                console.log('WhyKR:', item.alphaV3.whyKR);
                console.log('Triggers:', (item.alphaV3.triggerCodes || []).join(', '));
                const p = item.alphaV3.pillars;
                for (const [k, v] of Object.entries(p)) {
                    console.log(`  ${k}: ${v.score}/${v.max} (${v.pct}%) factors=${v.factors.length}`);
                    v.factors.forEach(f => console.log(`    - ${f.name}: ${f.value}/${f.max} "${f.detail || ''}"`));
                }
            } else {
                console.log('** alphaV3: MISSING');
            }
        } else {
            console.log(`${ticker} NOT in report`);
        }
    } catch (e) { console.log('** FAILED:', e.message); }

    // Step 4: Direct Alpha Engine test with the data we have
    console.log('\n--- STEP 4: DATA COMPLETENESS ANALYSIS ---');
    try {
        const fs = require('fs');
        const report = JSON.parse(fs.readFileSync('snapshots/reports/2026-02-08/draft.json', 'utf8'));
        const item = report.items.find(i => i.ticker === ticker);
        if (!item) { console.log('Not in report'); return; }
        const e = item.evidence;
        const fields = [
            ['price', e?.price?.last > 0],
            ['prevClose', e?.price?.prevClose > 0],
            ['changePct', e?.price?.changePct !== undefined],
            ['vwap', !!e?.price?.vwap],
            ['return3D', e?.price?.return3D !== null && e?.price?.return3D !== undefined && e?.price?.return3D !== 0],
            ['rsi14', e?.price?.rsi14 !== null && e?.price?.rsi14 !== undefined],
            ['sma20', e?.price?.sma20 !== null && e?.price?.sma20 !== undefined],
            ['pcr', e?.options?.pcr !== null && e?.options?.pcr !== undefined],
            ['gex', e?.options?.gex !== null && e?.options?.gex !== undefined],
            ['callWall', !!e?.options?.callWall],
            ['putFloor', !!e?.options?.putFloor],
            ['squeezeScore', e?.options?.squeezeScore !== null && e?.options?.squeezeScore !== undefined],
            ['ivSkew', e?.options?.ivSkew !== null && e?.options?.ivSkew !== undefined],
            ['darkPoolPct', e?.stealth?.darkPoolPct !== null && e?.stealth?.darkPoolPct !== undefined],
            ['shortVolPct', e?.stealth?.shortVolPct !== null && e?.stealth?.shortVolPct !== undefined],
            ['whaleIndex', e?.stealth?.whaleIndex !== null && e?.stealth?.whaleIndex !== undefined],
            ['relVol', e?.flow?.relVol !== null && e?.flow?.relVol !== undefined],
            ['blockTrades', e?.stealth?.blockTrades !== null && e?.stealth?.blockTrades !== undefined],
            ['ndxChangePct', e?.macro?.ndx?.changePct !== null && e?.macro?.ndx?.changePct !== undefined],
            ['vixValue', e?.macro?.vix?.value !== null && e?.macro?.vix?.value !== undefined],
            ['tltChangePct', false], // TLT not in evidence
            ['impliedMovePct', e?.options?.impliedMovePct !== null && e?.options?.impliedMovePct !== undefined],
        ];
        let available = 0;
        fields.forEach(([name, ok]) => {
            console.log(`  ${ok ? '✅' : '❌'} ${name}`);
            if (ok) available++;
        });
        console.log(`\nTotal: ${available}/${fields.length} = ${Math.round(available / fields.length * 100)}%`);
    } catch (e) { console.log('** FAILED:', e.message); }
}

audit().catch(console.error);
