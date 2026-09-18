// 운영 vs 프리뷰 «같은 Redis» 실측 비교 — node scripts/redis-policy-sweep.js --preview <url> [--prod https://www.signumhq.com] [--n 5] [--label x] [--paths 파일]
// 각 경로를 양쪽에 번갈아 n회 호출: 상태·JSON 키집합·값 차이(휘발 필드 제외)·p50/p95 지연.
// 대조군: 운영 1회차 vs 운영 2회차의 «자연 변동»을 같이 세어, 프리뷰 차이가 그 안에 드는지 본다.
const fs = require('fs');
const a = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((s) => { const [k, ...v] = s.trim().split(/\s+/); return [k, v.join(' ') || true]; }));
const PROD = a.prod || 'https://www.signumhq.com', PREV = a.preview, N = parseInt(a.n || '5', 10), LABEL = a.label || 'sweep', BYPASS = a.bypass || process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';
if (!PREV && !a.from) { console.error('--preview <url> 또는 --from <ego 수집 접두사> 필요'); process.exit(2); }
const DEFAULT_PATHS = ['/api/live/market', '/api/market/index-close', '/api/market/movers', '/api/market/macro', '/api/live/premium-metrics?t=NVDA', '/api/debug/guardian', '/api/guardian/briefing', '/api/guardian/economic-calendar', '/api/guardian/fedwatch', '/api/guardian/news-digest', '/api/flow/dark-pool-trades?ticker=NVDA&limit=10', '/api/flow/iv-percentile?t=NVDA', '/api/flow/options-eod?t=NVDA', '/api/command/insider?ticker=NVDA', '/api/intel/cross-sector-brief'];
const PATHS = a.paths ? fs.readFileSync(a.paths, 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#')) : DEFAULT_PATHS;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
// 휘발 필드 = 시각·나이·빌드ID·캐시상태 — 값의 «내용»이 아니라 «언제/어느 배포에서» 를 말하는 것들
const VOLATILE = /(^|_)(ts|time|timestamp|at|cachedat|updatedat|generatedat|fetchedat|asof|latency|took|age|servertime|now|elapsed|requestid|_cb|expires|ttl|cachestatus|source|backend|buildid|ageseconds|agesec|feedagesec|frozensec)$|(ET|ISO|At|Sec|Seconds|Ms)$/;
const hit = async (base, p) => { const t = Date.now(); try { const r = await fetch(`${base}${p}${p.includes('?') ? '&' : '?'}_cb=${t}`, { headers: { 'User-Agent': UA, ...(BYPASS && base === PREV ? { 'x-vercel-protection-bypass': BYPASS } : {}) }, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(30000) }); const txt = await r.text(); return { status: r.status, ms: Date.now() - t, txt, ct: r.headers.get('content-type') || '' }; } catch (e) { return { status: 0, ms: Date.now() - t, txt: '', err: e.message }; } };
const parse = (h) => { try { return JSON.parse(h.txt); } catch { return undefined; } };
function leafDiff(x, y, path = '', out = []) {
    if (out.length > 200) return out;
    if (x === y) return out;
    if (typeof x !== typeof y || x === null || y === null || typeof x !== 'object') { out.push(path || '/'); return out; }
    if (Array.isArray(x) !== Array.isArray(y)) { out.push(path); return out; }
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of keys) { if (VOLATILE.test(k)) continue; leafDiff(x[k], y[k], `${path}.${k}`, out); }
    return out;
}
const q = (arr, p) => { const s = [...arr].sort((u, v) => u - v); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
(async () => {
    const rows = [];
    if (a.from) {
        const P = JSON.parse(fs.readFileSync(`${a.from}-prod.json`, 'utf8')), V = JSON.parse(fs.readFileSync(`${a.from}-preview.json`, 'utf8'));
        console.log(`(ego lite 수집분) 운영 vs 프리뷰 · 경로 ${P.length}개 × ${P[0]?.rounds.length}회\n`);
        console.log('경로'.padEnd(46) + '상태   키집합  차이(프리뷰vs운영 / 운영vs운영)  p50 운영/프리뷰   p95 운영/프리뷰');
        for (let i = 0; i < P.length; i++) {
            const pr = P[i], pv = V.find((x) => x.path === pr.path); if (!pv) continue;
            const J = (b) => { try { return JSON.parse(b); } catch { return undefined; } };
            const jp = J(pr.body0), jv = J(pv.body0), jp2 = J(pr.body1);
            const st = pr.rounds.every((r) => r.status === pr.rounds[0].status) && pv.rounds.every((r) => r.status === pr.rounds[0].status);
            const keysOk = jp && jv ? JSON.stringify(Object.keys(jp).sort()) === JSON.stringify(Object.keys(jv).sort()) : (jp === undefined && jv === undefined);
            const dPV = jp && jv ? leafDiff(jp, jv) : [], dPP = jp && jp2 ? leafDiff(jp, jp2) : [];
            const row = { path: pr.path, status: [pr.rounds[0].status, pv.rounds[0].status], statusOk: st, keysOk, diffPreview: dPV.length, diffProdSelf: dPP.length, diffPaths: dPV.slice(0, 6), p50: [q(pr.rounds.map((r) => r.ms), 0.5), q(pv.rounds.map((r) => r.ms), 0.5)], p95: [q(pr.rounds.map((r) => r.ms), 0.95), q(pv.rounds.map((r) => r.ms), 0.95)], bytes: [pr.rounds[0].bytes, pv.rounds[0].bytes] };
            rows.push(row);
            console.log(pr.path.slice(0, 45).padEnd(46) + `${row.status.join('/')}`.padEnd(7) + (keysOk ? '같음' : '다름').padEnd(8) + `${row.diffPreview} / ${row.diffProdSelf}`.padEnd(30) + `${row.p50[0]}/${row.p50[1]}ms`.padEnd(18) + `${row.p95[0]}/${row.p95[1]}ms` + (row.diffPreview > row.diffProdSelf ? `   ← ${row.diffPaths.join(' ')}` : ''));
        }
        fs.writeFileSync(`/tmp/sweep-${LABEL}.json`, JSON.stringify({ from: a.from, ts: new Date().toISOString(), rows }, null, 1));
        const bad = rows.filter((r) => !r.statusOk || !r.keysOk || r.diffPreview > r.diffProdSelf);
        console.log(`\n합계: 경로 ${rows.length} · 상태 불일치 ${rows.filter((r) => !r.statusOk).length} · 키집합 불일치 ${rows.filter((r) => !r.keysOk).length} · 자연변동 초과 ${rows.filter((r) => r.diffPreview > r.diffProdSelf).length} · p50 중앙값 운영 ${q(rows.map((r) => r.p50[0]), 0.5)}ms / 프리뷰 ${q(rows.map((r) => r.p50[1]), 0.5)}ms · p95 중앙값 운영 ${q(rows.map((r) => r.p95[0]), 0.5)}ms / 프리뷰 ${q(rows.map((r) => r.p95[1]), 0.5)}ms → /tmp/sweep-${LABEL}.json`);
        process.exit(bad.length ? 1 : 0);
    }
    console.log(`운영 ${PROD}  vs  프리뷰 ${PREV}  · 경로 ${PATHS.length}개 × ${N}회\n`);
    console.log('경로'.padEnd(46) + '상태   키집합  차이(프리뷰vs운영 / 운영vs운영)  p50 운영/프리뷰   p95 운영/프리뷰');
    for (const p of PATHS) {
        await Promise.all([hit(PROD, p), hit(PREV, p)]); // 워밍업(콜드스타트 제외)
        const prod = [], prev = [];
        for (let i = 0; i < N; i++) { prod.push(await hit(PROD, p)); prev.push(await hit(PREV, p)); }
        const st = prod.every((r) => r.status === prev[0].status && r.status === prod[0].status) && prev.every((r) => r.status === prod[0].status);
        const jp = parse(prod[0]), jv = parse(prev[0]), jp2 = parse(prod[1] || prod[0]);
        const keysOk = jp && jv ? JSON.stringify(Object.keys(jp).sort()) === JSON.stringify(Object.keys(jv).sort()) : (jp === undefined && jv === undefined);
        const dPV = jp && jv ? leafDiff(jp, jv) : []; // JSON 이 아니면(HTML·nonce) 상태·지연만 본다
        const dPP = jp && jp2 ? leafDiff(jp, jp2) : [];
        const row = { path: p, status: [prod[0].status, prev[0].status], statusOk: st, keysOk, diffPreview: dPV.length, diffProdSelf: dPP.length, diffPaths: dPV.slice(0, 6), p50: [q(prod.map((r) => r.ms), 0.5), q(prev.map((r) => r.ms), 0.5)], p95: [q(prod.map((r) => r.ms), 0.95), q(prev.map((r) => r.ms), 0.95)], bytes: [prod[0].txt.length, prev[0].txt.length], err: [prod.find((r) => r.err)?.err, prev.find((r) => r.err)?.err] };
        rows.push(row);
        console.log(p.slice(0, 45).padEnd(46) + `${row.status.join('/')}`.padEnd(7) + (keysOk ? '같음' : '다름').padEnd(8) + `${row.diffPreview} / ${row.diffProdSelf}`.padEnd(30) + `${row.p50[0]}/${row.p50[1]}ms`.padEnd(18) + `${row.p95[0]}/${row.p95[1]}ms` + (row.diffPreview > row.diffProdSelf ? `   ← ${row.diffPaths.join(' ')}` : ''));
    }
    fs.writeFileSync(`/tmp/sweep-${LABEL}.json`, JSON.stringify({ prod: PROD, preview: PREV, n: N, ts: new Date().toISOString(), rows }, null, 1));
    const bad = rows.filter((r) => !r.statusOk || !r.keysOk || r.diffPreview > r.diffProdSelf);
    console.log(`\n합계: 경로 ${rows.length} · 상태 불일치 ${rows.filter((r) => !r.statusOk).length} · 키집합 불일치 ${rows.filter((r) => !r.keysOk).length} · 자연변동 초과 ${rows.filter((r) => r.diffPreview > r.diffProdSelf).length} · 중앙값 p50 운영 ${q(rows.map((r) => r.p50[0]), 0.5)}ms / 프리뷰 ${q(rows.map((r) => r.p50[1]), 0.5)}ms → /tmp/sweep-${LABEL}.json`);
    process.exit(bad.length ? 1 : 0);
})();
