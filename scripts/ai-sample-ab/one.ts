/** 한 용도의 5.5 만 몇 번 돌려 실패 사유를 본다(현행 호출 없음): one.ts <ENV> <Purpose> <rounds> [variantsJson] */
import { bootHarness, setClock, state, resetCaptured, runRoute, type Captured } from './core';
import { runAB, summarize, printSummary, dumpRows } from './ab-lib';
const [envFile, purpose, rounds, variantsArg] = process.argv.slice(2);
bootHarness({ envFile });
(async () => {
    setClock('2026-10-09T21:30:00Z'); resetCaptured();
    if (purpose === 'IntelSnapshot') {
        const { POST } = await import('@/app/api/intel/snapshot/route');
        for (const sector of ['m7', 'physical_ai', 'silicon_core', 'power_matrix', 'bio_pulse', 'cyber_shield', 'orbit_defense', 'quantum_edge', 'fintech_pulse', 'cloud_fortress']) {
            await runRoute(POST, 'https://www.signumhq.com/api/intel/snapshot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sector }) });
        }
    }
    if (purpose === 'CrossSector') { const { POST } = await import('@/app/api/intel/cross-sector-brief/route'); await runRoute(POST, 'https://www.signumhq.com/api/intel/cross-sector-brief', { method: 'POST' }); }
    setClock(null);
    const items: Captured[] = state.captured.slice(0, Number(process.env.MAXITEMS) || 1);
    const variants = JSON.parse(variantsArg || '[{"name":"low-off","effort":"low","thinking":"disabled"}]');
    const rows = await runAB(items, { rounds: Number(rounds) || 2, variants, skipLegacy: true, concurrency: 3 });
    dumpRows(`${process.env.OUT || '/tmp'}/one-${purpose}.json`, rows);
    for (const v of variants) console.log(printSummary(summarize(rows, v.name)));
    process.exit(0);
})();
