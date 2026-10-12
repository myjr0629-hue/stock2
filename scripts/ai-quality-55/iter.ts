/** 프롬프트 다듬기용 빠른 반복 — ON 모드만, 지정 종목·표면을 한 번씩 돌려 글을 찍는다. 사용: iter.ts <ENV> <flow|deep> <TICKER,...> */
import fs from 'node:fs';
import path from 'node:path';
import { boot, runRoute, BASE, OUTDIR } from './harness';
const [envFile, surface = 'flow', tickersArg = 'NVDA', mode = 'on'] = process.argv.slice(2);
(async () => {
    const runner = await boot(envFile);
    const mod = surface === 'flow' ? await import('@/app/api/flow/ai-analysis/route') : await import('@/app/api/command/deep-analysis/route');
    const url = surface === 'flow' ? `${BASE}/api/flow/ai-analysis` : `${BASE}/api/command/deep-analysis`;
    for (const t of tickersArg.split(',')) {
        const cap = JSON.parse(fs.readFileSync(path.join(OUTDIR, 'impl5-inputs', `${surface}-${t}.json`), 'utf8'));
        const r = await runner.run(surface, mode as any, t, 'x', () => runRoute(mod.POST, url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cap.requestBody) }));
        const l = r.ladder[r.ladder.length - 1];
        console.log(`\n===== ${surface} ${t} ${mode} status ${r.status} ${l ? `${l.v} ${(l.ms / 1000).toFixed(1)}s tr=${l.tr}` : ''} calls=${r.body?.calls}`);
        const b = r.body || {};
        const show = (label: string, o: any) => { if (o && typeof o === 'object') for (const loc of ['ko', 'en', 'ja']) if (o[loc]) console.log(`[${loc}] ${label}: ${o[loc]}`); };
        if (surface === 'flow') {
            show('thesis', b.structuralThesis); (b.factorHighlights || []).forEach((h: any) => show(`hl(${h.factor})`, h.insight)); show('repricing', b.repricingCondition);
        } else {
            show('state', b.currentState); (b.sections || []).forEach((s: any, i: number) => show(`sec${i}`, s.content)); show('key', b.keyInsight);
        }
        if (b.error) console.log('ERR', b.error, JSON.stringify(b.reasons || '').slice(0, 300));
        for (const w of r.warns.filter((x) => !/EC2 Proxy/.test(x))) console.log('   warn:', w.slice(0, 200));
    }
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
