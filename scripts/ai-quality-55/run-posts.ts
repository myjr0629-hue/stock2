/** Flow AI · 딥 분석 · 인텔 분석 전·후 — 캡처한 화면 요청 본문(raw/impl5-inputs)을 그대로 재생. 출력: raw/impl5-<surface>.json (실행마다 즉시 저장)
 *  사용: run-posts.ts <ENV> <flow|deep|intel> [tickers] [reps=2] [outName]
 */
import fs from 'node:fs';
import path from 'node:path';
import { boot, runRoute, BASE, write, OUTDIR } from './harness';
const [envFile, surface = 'flow', tickersArg, repsArg, outArg] = process.argv.slice(2);
const TICKERS = (tickersArg || 'NVDA,TSLA,AAPL,MSFT,AMZN,META,GOOGL,AMD,PLTR,SPY').split(',');
const REPS = Number(repsArg) || 2;
const MODES = (process.env.MODES ? process.env.MODES.split(',') : ['off', 'on']) as Array<'off' | 'on'>;   // MODES=on → 새 쪽만(옛 «전» 결과를 재사용할 때)
const IN = path.join(OUTDIR, 'impl5-inputs');
const readIn = (f: string) => { try { return JSON.parse(fs.readFileSync(path.join(IN, f), 'utf8')); } catch { return null; } };
(async () => {
    const runner = await boot(envFile);
    const out: any[] = [];
    const outName = outArg || `impl5-${surface}.json`;
    if (surface === 'flow' || surface === 'deep') {
        const mod = surface === 'flow' ? await import('@/app/api/flow/ai-analysis/route') : await import('@/app/api/command/deep-analysis/route');
        const url = surface === 'flow' ? `${BASE}/api/flow/ai-analysis` : `${BASE}/api/command/deep-analysis`;
        for (let rep = 0; rep < REPS; rep++) for (const t of TICKERS) {
            const cap = readIn(`${surface}-${t}.json`);
            if (!cap?.requestBody) { console.error(`${t}: 입력 없음`); continue; }
            for (const mode of MODES) {
                const body = JSON.stringify(cap.requestBody);
                const r = await runner.run(surface === 'flow' ? 'Flow' : 'Deep', mode, t, `rep${rep}`, () => runRoute(mod.POST, url, { method: 'POST', headers: { 'content-type': 'application/json' }, body }));
                out.push(r);
                const l = r.ladder[r.ladder.length - 1];
                console.error(`${surface} ${t} rep${rep} ${mode} status ${r.status} wall ${(r.wallMs / 1000).toFixed(1)}s ladder×${r.ladder.length} ${l ? `${l.v} ${(l.ms / 1000).toFixed(1)}s $${(l.c || 0).toFixed(4)} tr=${l.tr}` : 'none'} calls=${r.body?.calls ?? '-'} ${r.body?.error ? 'ERR ' + r.body.error + ' ' + JSON.stringify(r.body.reasons || r.body.reason || '').slice(0, 120) : ''}`);
                write(outName, out);
            }
        }
    } else {
        const { POST } = await import('@/app/api/intel/perplexity-analysis/route');
        const stocks: any[] = [];
        for (const f of fs.readdirSync(IN)) {
            if (!/^intel-/.test(f)) continue;
            const j = readIn(f);
            const arr = j?.requestBody?.stocks || j?.stocks || [];
            for (const s of arr) if (TICKERS.includes(s.ticker) && !stocks.find((x) => x.ticker === s.ticker)) stocks.push(s);
        }
        console.error(`인텔 입력 종목: ${stocks.map((s) => s.ticker).join(',')}`);
        // 3종목씩 묶어 요청(화면과 같은 묶음 분할은 라우트가 한다)
        const groups: any[][] = [];
        for (let i = 0; i < stocks.length; i += 5) groups.push(stocks.slice(i, i + 5));
        for (let rep = 0; rep < REPS; rep++) for (const g of groups) for (const mode of MODES) {
            const body = JSON.stringify({ stocks: g });
            const r = await runner.run('Intel', mode, g.map((s) => s.ticker).join('+'), `rep${rep}`, () => runRoute(POST, `${BASE}/api/intel/perplexity-analysis`, { method: 'POST', headers: { 'content-type': 'application/json' }, body }));
            out.push(r);
            console.error(`intel ${g.map((s) => s.ticker).join('+')} rep${rep} ${mode} status ${r.status} wall ${(r.wallMs / 1000).toFixed(1)}s ladder×${r.ladder.length} ${r.ladder.map((l) => `${l.v}:${(l.ms / 1000).toFixed(0)}s`).join(',')} got ${Object.keys(r.body?.analyses || {}).length}/${g.length}`);
            write(outName, out);
        }
    }
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
