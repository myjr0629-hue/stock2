// Engine V3.2 → V3.3 Intelligence Upgrade Audit
// Shows current scores + which gates fire + what would change

async function audit() {
    const tickers = ['NVDA', 'TSLA', 'AAPL', 'SBAC', 'SMCI', 'PLTR', 'META', 'AVGO'];

    console.log('=== ENGINE V3.2 AUDIT ===\n');
    console.log('Ticker | Score | Grade | Gates Applied            | M   | S    | F    | R   | C');
    console.log('-------|-------|-------|--------------------------|-----|------|------|-----|---');

    for (const t of tickers) {
        try {
            const d = await (await fetch(`http://localhost:3000/api/live/ticker?t=${t}`)).json();
            const a = d.alpha || {};
            const p = a.pillars || {};
            const gates = (a.gatesApplied || []).join(', ') || 'none';

            console.log(
                `${t.padEnd(7)}| ${String(a.score).padStart(5)} | ${(a.grade || '?').padEnd(5)} | ${gates.padEnd(24)} | ${String(p.momentum?.score || 0).padStart(3)} | ${String(p.structure?.score || 0).padStart(4)} | ${String(p.flow?.score || 0).padStart(4)} | ${String(p.regime?.score || 0).padStart(3)} | ${String(p.catalyst?.score || 0).padStart(1)}`
            );
        } catch (e) {
            console.log(`${t.padEnd(7)}| ERROR: ${e.message}`);
        }
    }

    console.log('\n=== GATE IMPACT ANALYSIS ===\n');

    for (const t of tickers) {
        try {
            const d = await (await fetch(`http://localhost:3000/api/live/ticker?t=${t}`)).json();
            const a = d.alpha || {};
            const p = a.pillars || {};
            const gates = a.gatesApplied || [];

            if (gates.length === 0) continue;

            const rawSum = (p.momentum?.score || 0) + (p.structure?.score || 0) + (p.flow?.score || 0) + (p.regime?.score || 0) + (p.catalyst?.score || 0);
            const rawNorm = Math.round(rawSum);

            console.log(`${t}: Raw pillar sum = ${rawSum.toFixed(1)} → Final = ${a.score} (Gates: ${gates.join(', ')})`);

            for (const g of gates) {
                if (g === 'WALL_REJECTION') {
                    console.log(`  ⚠️  WALL_REJECTION: 점수가 55점으로 캡됨 → ${rawNorm > 55 ? `${rawNorm - 55}점 손실!` : '영향 없음'}`);
                    console.log(`  → V3.3: GEX/Flow/RelVol 교차 분석으로 돌파 vs 저항 판단`);
                }
                if (g === 'FAKE_PUMP') {
                    console.log(`  ⚠️  FAKE_PUMP: 45점 캡 → ${rawNorm > 45 ? `${rawNorm - 45}점 손실` : '영향 없음'}`);
                    console.log(`  → V3.3: darkPool + 블록매매 교차 검증`);
                }
                if (g === 'SHORT_STORM') {
                    console.log(`  ⚠️  SHORT_STORM: -10점 감점`);
                    console.log(`  → V3.3: 숏커버/스퀴즈 가능성 교차 판단`);
                }
            }
            console.log('');
        } catch (e) { /* skip */ }
    }
}

audit();
