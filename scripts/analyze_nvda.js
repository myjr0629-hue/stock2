const r = JSON.parse(require('fs').readFileSync('snapshots/reports/2026-02-08/draft.json', 'utf8'));
const nvda = r.items.find(i => i.ticker === 'NVDA');
const v3 = nvda.alphaV3;
console.log('=== NVDA V3 Deep Analysis ===');
console.log('Score:', v3.score, '(' + v3.grade + ')');
console.log('DataCompleteness:', v3.dataCompleteness + '%');
console.log('WhyKR:', v3.whyKR);
console.log('Triggers:', (v3.triggerCodes || []).join(', '));
console.log('Gates:', JSON.stringify(v3.gatesApplied));
console.log('');
const p = v3.pillars;
for (const k of Object.keys(p)) {
    console.log('--- ' + k + ': ' + p[k].score + '/' + p[k].max + ' (' + p[k].pct + '%) ---');
    p[k].factors.forEach(f => {
        console.log('  ' + f.name + ': ' + f.value + '/' + f.max + ' "' + (f.detail || '') + '"');
    });
}

// Also show evidence fields
console.log('\n=== Evidence Fields ===');
const e = nvda.evidence;
console.log('price.last:', e?.price?.last);
console.log('price.prevClose:', e?.price?.prevClose);
console.log('price.changePct:', e?.price?.changePct);
console.log('price.vwap:', e?.price?.vwap);
console.log('price.return3D:', e?.price?.return3D);
console.log('price.rsi14:', e?.price?.rsi14);
console.log('price.sma20:', e?.price?.sma20);
console.log('options.squeezeScore:', e?.options?.squeezeScore);
console.log('options.impliedMovePct:', e?.options?.impliedMovePct);
console.log('flow.whaleIndex:', e?.flow?.whaleIndex);
console.log('flow.relVol:', e?.flow?.relVol);
console.log('stealth.darkPoolPct:', e?.stealth?.darkPoolPct);
console.log('stealth.shortVolPct:', e?.stealth?.shortVolPct);
console.log('stealth.blockTrades:', e?.stealth?.blockTrades);
console.log('macro.ndx:', JSON.stringify(e?.macro?.ndx));
console.log('macro.vix:', JSON.stringify(e?.macro?.vix));
console.log('macro.tlt:', JSON.stringify(e?.macro?.tlt));
