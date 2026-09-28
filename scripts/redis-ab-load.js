// Redis A/B 부하·비교 — 같은 경로를 여러 배포에 «번갈아»(순서 무작위) 호출해 상태·지연·내용을 비교한다.
//   node scripts/redis-ab-load.js --target ctl=<프리뷰URL> --target fix=<프리뷰URL> [--target prod=https://www.signumhq.com]
//        [--rounds 10] [--conc 3] [--paths 파일] [--out 결과.jsonl] [--pause 0]
// · 프리뷰는 SSO 보호 → «자동화 우회 토큰»을 Vercel API 에서 메모리로만 읽어 **그 프리뷰 도메인 요청에만** 헤더로 붙인다
//   (값은 출력·파일 어디에도 쓰지 않는다). 운영(커스텀 도메인)엔 붙이지 않는다.
// · 읽기 경로만 부른다(크론·refresh=1·쓰기 API 없음). 경로는 운영 화면이 실제로 부르는 형태 그대로 — 캐시 키가 같아야
//   프리뷰가 무거운 재계산·벤더 호출을 새로 일으키지 않는다(프리뷰와 운영은 같은 Redis 를 쓴다).
// · 결과 줄: {round,target,path,status,ttfb,ms,bytes,hash,keys,err} — 본문은 앞 2라운드만 저장(내용 비교용).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const targets = args.flatMap((a, i) => (a === '--target' ? [args[i + 1]] : [])).map((s) => { const [name, ...u] = s.split('='); return { name, base: u.join('=').replace(/\/$/, '') }; });
if (targets.length < 1) { console.error('--target 이름=URL 이 필요하다'); process.exit(2); }
const ROUNDS = Number(opt('rounds', '10')), CONC = Number(opt('conc', '3')), PAUSE = Number(opt('pause', '0'));
const OUT = opt('out', path.join(os.tmpdir(), `redis-ab-${Date.now()}.jsonl`));
const DEFAULT_PATHS = [
    '/api/market/status', '/api/live/market', '/api/market/index-close', '/api/market/movers', '/api/market/macro',
    '/api/live/ticker?t=NVDA', '/api/live/ticker?t=AAPL', '/api/live/quotes?symbols=NVDA,AAPL,TSLA,MSFT,SPY',
    '/api/live/premium-metrics?t=NVDA', '/api/live/fundamentals?t=NVDA', '/api/ranking?run=all&top=5',
    '/api/debug/guardian', '/api/guardian/briefing', '/api/guardian/economic-calendar', '/api/guardian/fedwatch', '/api/guardian/news-digest',
    '/api/flow/dark-pool-trades?ticker=NVDA&limit=10', '/api/flow/iv-percentile?t=NVDA', '/api/flow/options-eod?t=NVDA',
    '/api/flow/unified?t=NVDA', '/api/flow/realtime-metrics?ticker=NVDA', '/api/command/insider?ticker=NVDA',
    '/api/intel/cross-sector-brief', '/api/intel/m7', '/api/intel/fast', '/api/dashboard/unified?tickers=NVDA,AAPL,TSLA',
    '/api/watchlist/batch?tickers=NVDA,AAPL,TSLA,MSFT,META,AMZN,GOOGL', '/api/undercurrent/ticker?t=NVDA&locale=en', '/api/ticker/overview?ticker=NVDA',
    '/en', '/ko', '/en/tickers', '/en/ticker?ticker=NVDA', '/en/flow/NVDA',
];
const PATHS = opt('paths') ? fs.readFileSync(opt('paths'), 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#')) : DEFAULT_PATHS;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const PREVIEW_HOST = /^stock2-[a-z0-9]+-eunhoons-projects\.vercel\.app$/;

async function bypassToken() {
    const auth = path.join(os.homedir(), 'Library/Application Support/com.vercel.cli/auth.json');
    const tok = JSON.parse(fs.readFileSync(auth, 'utf8')).token;
    const r = await fetch('https://api.vercel.com/v9/projects/stock2?slug=eunhoons-projects', { headers: { Authorization: `Bearer ${tok}` } });
    const txt = (await r.text()).split('\n').join(' ');
    const p = JSON.parse(txt);
    const k = Object.entries(p.protectionBypass || {}).find(([, v]) => v && v.scope === 'automation-bypass');
    return k ? k[0] : '';
}
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

async function hit(target, p, token) {
    const url = `${target.base}${p}`;
    const host = new URL(url).hostname;
    const headers = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' };
    if (PREVIEW_HOST.test(host) && token) headers['x-vercel-protection-bypass'] = token; // 프리뷰 도메인에만
    const t0 = performance.now();
    try {
        const r = await fetch(url, { headers, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(60000) });
        const ttfb = performance.now() - t0;
        const buf = Buffer.from(await r.arrayBuffer());
        const ms = performance.now() - t0;
        let keys = null; let json;
        const ct = r.headers.get('content-type') || '';
        if (ct.includes('json')) { try { json = JSON.parse(buf.toString('utf8')); keys = json && typeof json === 'object' ? Object.keys(json).sort().join(',') : typeof json; } catch { keys = 'bad-json'; } }
        return { status: r.status, ttfb: Math.round(ttfb), ms: Math.round(ms), bytes: buf.length, hash: crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12), keys, ct: ct.split(';')[0], body: buf.toString('utf8') };
    } catch (e) {
        return { status: 0, ttfb: null, ms: Math.round(performance.now() - t0), err: String(e.name || '') + ':' + String(e.message || '').slice(0, 80) };
    }
}

(async () => {
    // 프리뷰 대상이 없으면(운영만) 토큰이 필요 없다 — Vercel 로그인이 끊겨도 운영 기준선은 잰다
    const needToken = targets.some((t) => PREVIEW_HOST.test(new URL(t.base).hostname));
    const token = needToken ? await bypassToken().catch(() => '') : '';
    if (!token && targets.some((t) => PREVIEW_HOST.test(new URL(t.base).hostname))) { console.error('우회 토큰을 못 읽었다 — 프리뷰는 SSO 302 만 잰다. 중단.'); process.exit(3); }
    const out = fs.createWriteStream(OUT);
    console.log(`대상 ${targets.map((t) => t.name).join(' · ')} · 경로 ${PATHS.length} · ${ROUNDS}라운드 · 동시 ${CONC} → ${OUT}`);
    // 워밍업 1회(콜드 스타트 제외) — 기록하지 않는다
    for (const tg of targets) await Promise.all(PATHS.slice(0, 6).map((p) => hit(tg, p, token)));
    for (let round = 1; round <= ROUNDS; round++) {
        // 작업 단위 = (경로, 대상 순서 무작위). 같은 경로의 대상들은 연달아 부른다(시점 차이 최소화)
        const jobs = shuffle(PATHS.map((p) => ({ p, order: shuffle([...targets]) })));
        let idx = 0;
        const worker = async () => {
            while (idx < jobs.length) {
                const j = jobs[idx++];
                for (const tg of j.order) {
                    const r = await hit(tg, j.p, token);
                    const rec = { round, target: tg.name, path: j.p, ...r };
                    if (round > 2) delete rec.body;
                    out.write(JSON.stringify(rec) + '\n');
                }
            }
        };
        const t0 = Date.now();
        await Promise.all(Array.from({ length: CONC }, worker));
        process.stdout.write(`라운드 ${round}/${ROUNDS} ${((Date.now() - t0) / 1000).toFixed(0)}초\n`);
        if (PAUSE) await new Promise((r) => setTimeout(r, PAUSE * 1000));
    }
    out.end();
})().catch((e) => { console.error('실패:', e.message); process.exit(1); });
