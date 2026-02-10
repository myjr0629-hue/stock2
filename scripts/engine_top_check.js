// Quick top-10 check
async function check() {
    const tickers = ['NVDA', 'PLTR', 'AVGO', 'META', 'MSFT', 'AAPL', 'GOOGL', 'AMZN', 'TSLA', 'SMCI', 'NFLX', 'AMD', 'LLY', 'COIN', 'CRWD', 'VST', 'ARM', 'PANW'];
    const results = [];
    for (const t of tickers) {
        try {
            const d = await (await fetch(`http://localhost:3000/api/live/ticker?t=${t}`)).json();
            const a = d.alpha || {};
            results.push({
                t, s: a.score || 0, g: a.grade || '?', v: a.engineVersion,
                m: a.pillars?.momentum?.score || 0,
                st: a.pillars?.structure?.score || 0,
                f: a.pillars?.flow?.score || 0,
                r: a.pillars?.regime?.score || 0,
                c: a.pillars?.catalyst?.score || 0,
                gates: (a.gatesApplied || []).join(',') || '-'
            });
        } catch (e) { }
    }
    results.sort((a, b) => b.s - a.s);
    console.log('Ticker  Score Grade  M     S     F    R    C   Gates');
    console.log('------  ----- -----  ---  ---   ---  ---  ---  -----');
    for (const r of results) {
        const line = `${r.t.padEnd(7)} ${String(r.s).padStart(5)} ${r.g.padEnd(5)}  ${String(r.m).padStart(3)}  ${String(r.st).padStart(4)}  ${String(r.f).padStart(4)} ${String(r.r).padStart(4)} ${String(r.c).padStart(4)}  ${r.gates}`;
        console.log(line);
    }
    console.log('\nEngine:', results[0]?.v);
    const above70 = results.filter(r => r.s >= 70);
    console.log(`\n70+ ACTIONABLE: ${above70.length}/${results.length}`);
    above70.forEach(r => console.log(`  ★ ${r.t}: ${r.s}점 (${r.g})`));
}
check();
