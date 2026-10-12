/**
 * 배포 뒤 운영 표본 — 운영 URL 에 «화면과 같은 요청»을 보내고 응답·걸린 시간을 저장한다(운영 캐시는 일반 사용과 똑같이 채워진다).
 *   사용: prod-sample.ts <uc|flow|deep|intel> <outName> [tickers] [--force-uc]
 *   입력: raw/impl5-inputs (화면 요청 본문 캡처). 비밀값 없음(공개 라우트). 운영 비용·지연 집계는 별도로 GET /api/admin/ai-ladder?since= 로 본다.
 */
import fs from 'node:fs';
import path from 'node:path';
const BASE = 'https://www.signumhq.com';
const OUT = '/Users/eunhoon/Documents/signum-work/research/DIFF-2026-10-12/raw';
const [surface, outName, tickersArg] = process.argv.slice(2);
const TICKERS = (tickersArg || 'NVDA,TSLA,AAPL,MSFT,AMZN,META,GOOGL,AMD,PLTR,SPY').split(',');
const readIn = (f: string) => { try { return JSON.parse(fs.readFileSync(path.join(OUT, 'impl5-inputs', f), 'utf8')); } catch { return null; } };
const out: any[] = [];
const save = () => fs.writeFileSync(path.join(OUT, outName), JSON.stringify(out));
async function call(url: string, init?: RequestInit) {
    const t0 = Date.now();
    try {
        const r = await fetch(url, { ...init, signal: AbortSignal.timeout(70_000) });
        const txt = await r.text(); let body: any = null; try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 300) }; }
        return { status: r.status, wallMs: Date.now() - t0, body };
    } catch (e: any) { return { status: 0, wallMs: Date.now() - t0, body: { error: String(e?.message || e) } }; }
}
(async () => {
    const t0 = Date.now();
    if (surface === 'uc') {
        for (const t of TICKERS) for (const loc of ['ko', 'ja', 'en']) {
            const r = await call(`${BASE}/api/undercurrent/ticker?t=${t}&locale=${loc}&refresh=1`);
            out.push({ surface: 'UC', mode: 'prod', ticker: t, locale: loc, ...r, requests: [], ladder: [], warns: [], at: Date.now() });
            console.error(`UC ${t} ${loc} ${r.status} ${(r.wallMs / 1000).toFixed(1)}s ${String(r.body?.tickerRead || '').slice(0, 80)}`); save();
        }
    } else if (surface === 'flow' || surface === 'deep') {
        for (const t of TICKERS) {
            const cap = readIn(`${surface}-${t}.json`); if (!cap?.requestBody) continue;
            const r = await call(`${BASE}/api/${surface === 'flow' ? 'flow/ai-analysis' : 'command/deep-analysis'}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cap.requestBody) });
            out.push({ surface: surface === 'flow' ? 'Flow' : 'Deep', mode: 'prod', ticker: t, locale: 'multi', ...r, requests: [], ladder: [], warns: [], at: Date.now() });
            console.error(`${surface} ${t} ${r.status} ${(r.wallMs / 1000).toFixed(1)}s model=${r.body?.model} fromCache=${r.body?.fromCache} aiq=${r.body?.aiq ?? '-'} gen=${r.body?.generatedAt}`); save();
        }
    } else {
        const stocks: any[] = [];
        for (const f of fs.readdirSync(path.join(OUT, 'impl5-inputs'))) {
            if (!/^intel-/.test(f)) continue;
            const j = readIn(f); for (const s of j?.requestBody?.stocks || j?.stocks || []) if (TICKERS.includes(s.ticker) && !stocks.find((x) => x.ticker === s.ticker)) stocks.push(s);
        }
        for (let i = 0; i < stocks.length; i += 5) {
            const g = stocks.slice(i, i + 5);
            const r = await call(`${BASE}/api/intel/perplexity-analysis`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stocks: g }) });
            out.push({ surface: 'Intel', mode: 'prod', ticker: g.map((s) => s.ticker).join('+'), locale: 'multi', ...r, requests: [], ladder: [], warns: [], at: Date.now() });
            console.error(`intel ${g.map((s) => s.ticker).join('+')} ${r.status} ${(r.wallMs / 1000).toFixed(1)}s meta=${JSON.stringify(r.body?.meta)}`); save();
        }
    }
    console.error(`done ${((Date.now() - t0) / 1000).toFixed(0)}s since=${t0}`);
})();
