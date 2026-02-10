// Engine V3.3 Verification - Compare vs V3.2 baseline
async function verify() {
    const tickers = ['NVDA', 'TSLA', 'AAPL', 'SBAC', 'SMCI', 'PLTR', 'META', 'AVGO'];

    console.log('=== ENGINE V3.3 VERIFICATION ===\n');
    console.log('Ticker  Score  Grade  Engine  Gates                          M     S     F     R    C');
    console.log('------  -----  -----  ------  ----------------------------  ---   ---   ---   ---  ---');

    for (const t of tickers) {
        try {
            const d = await (await fetch(`http://localhost:3000/api/live/ticker?t=${t}`)).json();
            const a = d.alpha || {};
            const p = a.pillars || {};
            const gates = (a.gatesApplied || []).join(', ') || 'none';

            const line = [
                t.padEnd(8),
                String(a.score || '?').padStart(5),
                (a.grade || '?').padEnd(5),
                (a.engineVersion || '?').padEnd(6),
                gates.padEnd(30),
                String(p.momentum?.score || 0).padStart(4),
                String(p.structure?.score || 0).padStart(5),
                String(p.flow?.score || 0).padStart(5),
                String(p.regime?.score || 0).padStart(5),
                String(p.catalyst?.score || 0).padStart(4)
            ].join('  ');
            console.log(line);
        } catch (e) {
            console.log(`${t.padEnd(8)}  ERROR: ${e.message}`);
        }
    }

    console.log('\n=== V3.2 → V3.3 COMPARISON ===');
    console.log('V3.2 baseline (from audit):');
    console.log('  NVDA: 54pts WALL_REJECTION');
    console.log('  PLTR: 53pts none');
    console.log('  AVGO: 54pts WALL_REJECTION');
    console.log('  SMCI: ~40pts SHORT_STORM (-10)');
}
verify();
