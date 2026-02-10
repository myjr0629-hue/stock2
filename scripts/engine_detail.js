// Detailed factor analysis v2 - stringify pillars
async function detail() {
    const r = await (await fetch('http://localhost:3000/api/live/ticker?t=NVDA')).json();
    const a = r.alpha;

    console.log('NVDA Alpha Score:', a.score, 'Grade:', a.grade);
    console.log('Engine:', a.engineVersion);
    console.log('Gates:', JSON.stringify(a.gatesApplied));
    console.log('');

    const pillarNames = ['momentum', 'structure', 'flow', 'regime', 'catalyst'];
    for (const name of pillarNames) {
        const p = a.pillars[name];
        if (!p) { console.log(name + ': NO DATA'); continue; }
        console.log(`=== ${name.toUpperCase()} (${p.score}/${p.max}) ===`);
        if (p.factors && Array.isArray(p.factors)) {
            for (const f of p.factors) {
                console.log(`  ${f.name}: ${f.value}/${f.max} — ${f.detail || ''}`);
            }
        }
        console.log('');
    }
}
detail();
