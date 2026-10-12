/** UC 종목 카드 전·후 — 10종목 × ko/ja/en × (aiq55 OFF → ON). 출력: raw/impl5-uc.json (실행마다 즉시 저장) */
import { boot, runRoute, BASE, write } from './harness';
const [envFile, tickersArg, outName = 'impl5-uc.json'] = process.argv.slice(2);
const TICKERS = (tickersArg || 'NVDA,TSLA,AAPL,MSFT,AMZN,META,GOOGL,AMD,PLTR,SPY').split(',');
(async () => {
    const runner = await boot(envFile);
    const { GET } = await import('@/app/api/undercurrent/ticker/route');
    const out: any[] = [];
    for (const t of TICKERS) for (const loc of ['ko', 'ja', 'en']) for (const mode of ['off', 'on'] as const) {
        const r = await runner.run('UC', mode, t, loc, () => runRoute(GET, `${BASE}/api/undercurrent/ticker?t=${t}&locale=${loc}&refresh=1`));
        out.push(r);
        const l = r.ladder[r.ladder.length - 1];
        console.error(`${t} ${loc} ${mode} status ${r.status} wall ${(r.wallMs / 1000).toFixed(1)}s ladder ${l ? `${l.v} ${(l.ms / 1000).toFixed(1)}s $${(l.c || 0).toFixed(5)} g=${l.g}` : 'none'} warns ${r.warns.filter((w) => !/EC2 Proxy/.test(w)).length}`);
        write(outName, out);
    }
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
