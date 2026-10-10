/**
 * 크론·화면 라우트의 «실제 요청 입력» 재구성 — 사용: build-cron.ts <ENVFILE> <OUTDIR> <purpose[,purpose…]> [fakeNowIso]
 * 라우트를 그대로 실행하고 모델 호출 직전에 가로챈다. 모델은 부르지 않는다.
 */
import path from 'node:path';
import fs from 'node:fs';
import { bootHarness, state, resetCaptured, runRoute, saveSamples } from './core';

const [envFile, outDir, purposesArg, fakeNow] = process.argv.slice(2);
bootHarness({ envFile, fakeNowIso: fakeNow && fakeNow !== '-' ? fakeNow : null });
fs.mkdirSync(outDir, { recursive: true });
const BASE = 'https://www.signumhq.com';

const drivers: Record<string, () => Promise<void>> = {
    CrossSector: async () => {
        const { POST } = await import('@/app/api/intel/cross-sector-brief/route');
        const r = await runRoute(POST, `${BASE}/api/intel/cross-sector-brief`, { method: 'POST' });
        console.error('CrossSector route →', r.status, JSON.stringify(r.body).slice(0, 120));
    },
    SectorHeadlines: async () => {
        const { GET } = await import('@/app/api/cron/sector-headlines/route');
        const r = await runRoute(GET, `${BASE}/api/cron/sector-headlines`);
        console.error('SectorHeadlines route →', r.status, JSON.stringify(r.body).slice(0, 160));
    },
    EarningsBrief: async () => {
        const { GET } = await import('@/app/api/cron/earnings-brief/route');
        const r = await runRoute(GET, `${BASE}/api/cron/earnings-brief`);
        console.error('EarningsBrief route →', r.status, JSON.stringify(r.body).slice(0, 160));
    },
    MorningBriefing: async () => {
        const { POST } = await import('@/app/api/guardian/briefing/generate/route');
        const r = await runRoute(POST, `${BASE}/api/guardian/briefing/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
        console.error('MorningBriefing route →', r.status, JSON.stringify(r.body).slice(0, 160));
    },
};

(async () => {
    for (const p of purposesArg.split(',')) {
        resetCaptured();
        try { await drivers[p](); } catch (e: any) { console.error(`${p} driver error:`, e?.message); }
        const got = state.captured.filter((c) => true);
        console.error(`${p}: 가로챈 요청 ${got.length}건 · 막은 쓰기 ${state.blocked.length}건`);
        if (got.length) saveSamples(path.join(outDir, `${p}.json`), got);
        state.blocked.slice(0, 8).forEach((b) => console.error('   blocked:', b));
        state.blocked = [];
    }
    process.exit(0);
})();
