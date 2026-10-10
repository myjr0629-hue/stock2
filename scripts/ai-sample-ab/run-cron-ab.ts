/**
 * 크론 라우트 입력 재구성 + 현행/5.5 비교 — 사용: run-cron-ab.ts <ENVFILE> <OUTDIR> <Purpose[,Purpose…]> [variantsJson]
 * 라우트를 그대로 실행하고 모델 호출 직전에 가로챈다(모델·쓰기는 막힘). 그 요청을 현행(라우트의 legacy 그대로)과 Haiku 5.5 로 나란히 돌린다.
 */
import path from 'node:path';
import { bootHarness, setClock, state, resetCaptured, runRoute, type Captured } from './core';
import { runAB, summarize, printSummary, dumpRows, type Variant } from './ab-lib';

const [envFile, outDir, purposesArg, variantsArg] = process.argv.slice(2);
bootHarness({ envFile });
const BASE = 'https://www.signumhq.com';
const FRI_CLOSE = '2026-10-09T21:30:00Z';   // 금요일 17:30 ET — 장 마감 뒤 크론이 도는 시각
const FRI_PRE = '2026-10-09T12:30:00Z';     // 금요일 08:30 ET — 모닝 브리핑이 도는 시각
const OFF: Variant = { name: 'low-off', effort: 'low', thinking: 'disabled' };
const AD: Variant = { name: 'low-ad', effort: 'low' };

const cfg: Record<string, { clock: string; rounds: number; max: number; variants: Variant[]; build: () => Promise<void> }> = {
    SectorHeadlines: { clock: FRI_CLOSE, rounds: 10, max: 1, variants: [OFF, AD], build: async () => { const { GET } = await import('@/app/api/cron/sector-headlines/route'); await runRoute(GET, `${BASE}/api/cron/sector-headlines`); } },
    CrossSector: { clock: FRI_CLOSE, rounds: 10, max: 1, variants: [OFF, AD], build: async () => { const { POST } = await import('@/app/api/intel/cross-sector-brief/route'); await runRoute(POST, `${BASE}/api/intel/cross-sector-brief`, { method: 'POST' }); } },
    EarningsBrief: { clock: FRI_CLOSE, rounds: 1, max: 10, variants: [OFF], build: async () => { const { GET } = await import('@/app/api/cron/earnings-brief/route'); await runRoute(GET, `${BASE}/api/cron/earnings-brief`); } },
    IntelSnapshot: { clock: FRI_CLOSE, rounds: 1, max: 10, variants: [OFF], build: async () => {
        const { POST } = await import('@/app/api/intel/snapshot/route');
        for (const sector of ['m7', 'physical_ai', 'silicon_core', 'power_matrix', 'bio_pulse', 'cyber_shield', 'orbit_defense', 'quantum_edge', 'fintech_pulse', 'cloud_fortress']) {
            const r = await runRoute(POST, `${BASE}/api/intel/snapshot`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sector }) });
            console.error(`  snapshot ${sector} → ${r.status} ${JSON.stringify(r.body).slice(0, 80)} (누적 가로챔 ${state.captured.length})`);
        }
    } },
    MorningBriefing: { clock: FRI_PRE, rounds: 10, max: 1, variants: [OFF, AD], build: async () => { const { POST } = await import('@/app/api/guardian/briefing/generate/route'); await runRoute(POST, `${BASE}/api/guardian/briefing/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) }); } },
};

(async () => {
    for (const purpose of purposesArg.split(',')) {
        const c = cfg[purpose];
        setClock(c.clock);
        resetCaptured();
        await c.build();
        setClock(null);
        const seen = new Set<string>(); const items: Captured[] = [];
        for (const x of state.captured) { const k = x.system + '\u0000' + x.userPrompt; if (seen.has(k)) continue; seen.add(k); items.push(x); }
        const use = items.slice(0, c.max);
        console.error(`\n### ${purpose}: 가로챈 ${state.captured.length}건 → 서로 다른 입력 ${items.length}건 중 ${use.length}건 × ${c.rounds}회 · 막은 쓰기 ${state.blocked.length}건`);
        state.blocked = [];
        const variants = variantsArg ? (JSON.parse(variantsArg) as Variant[]) : c.variants;
        const rows = await runAB(use, { rounds: Number(process.env.ROUNDS) || c.rounds, variants, concurrency: Number(process.env.CONC) || 3 });
        dumpRows(path.join(outDir, `ab-${purpose}.json`), rows);
        for (const v of variants) console.log(printSummary(summarize(rows, v.name)));
    }
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
