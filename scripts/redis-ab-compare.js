// redis-ab-load.js 결과 비교 — node scripts/redis-ab-compare.js <결과.jsonl> [--base ctl] [--cand fix] [--json]
// · 경로별: 상태 일치·오류율·지연 p50/p95(전체 ms, TTFB)
// · 전체: 대상별 p50/p95/p99, 짝지은 차이(같은 라운드·같은 경로의 cand−base)의 중앙값과 부트스트랩 95% 신뢰구간
// · 내용: 앞 2라운드 JSON 본문을 휘발 필드(시각·나이·빌드ID 등) 빼고 잎 단위 비교 — base↔cand 차이가 base 자체의
//         라운드 간 자연 변동보다 크면 표시한다.
const fs = require('fs');
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && !['--base', '--cand'].includes(args[args.indexOf(a) - 1]));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const targets = [...new Set(rows.map((r) => r.target))];
const BASE = opt('base', targets[0]), CAND = opt('cand', targets[1] || targets[0]);
const VOLATILE = /(^|_)(ts|time|timestamp|at|cachedat|updatedat|generatedat|fetchedat|asof|latency|took|age|servertime|now|elapsed|requestid|_cb|expires|ttl|cachestatus|cache|source|backend|buildid|ageseconds|agesec|feedagesec|frozensec|stalesec|redisagesec|timings|meta|deploymentid|nonce)$|(ET|ISO|At|Sec|Seconds|Ms)$/i;
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
function leafDiff(x, y, p = '', out = []) {
    if (out.length > 50) return out;
    if (x === y) return out;
    if (typeof x !== typeof y || x === null || y === null || typeof x !== 'object') { out.push(p || '/'); return out; }
    if (Array.isArray(x) !== Array.isArray(y)) { out.push(p); return out; }
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) { if (VOLATILE.test(k)) continue; leafDiff(x[k], y[k], `${p}.${k}`, out); }
    return out;
}
const J = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
const paths = [...new Set(rows.map((r) => r.path))];
const table = [];
for (const p of paths) {
    const by = (t) => rows.filter((r) => r.path === p && r.target === t);
    const a = by(BASE), b = by(CAND);
    const okA = a.filter((r) => r.status >= 200 && r.status < 400), okB = b.filter((r) => r.status >= 200 && r.status < 400);
    const stA = [...new Set(a.map((r) => r.status))].join('/'), stB = [...new Set(b.map((r) => r.status))].join('/');
    // 내용: 라운드 1·2
    const a1 = a.find((r) => r.round === 1), a2 = a.find((r) => r.round === 2), b1 = b.find((r) => r.round === 1), b2 = b.find((r) => r.round === 2);
    let dAB = null, dAA = null, dBB = null;
    if (a1?.body && b1?.body && (a1.ct || '').includes('json')) {
        const ja1 = J(a1.body), jb1 = J(b1.body), ja2 = J(a2?.body), jb2 = J(b2?.body);
        if (ja1 !== undefined && jb1 !== undefined) {
            dAB = Math.min(leafDiff(ja1, jb1).length, jb2 !== undefined ? leafDiff(ja1, jb2).length : 99, ja2 !== undefined ? leafDiff(ja2, jb1).length : 99);
            dAA = ja2 !== undefined ? leafDiff(ja1, ja2).length : null;
            dBB = jb2 !== undefined ? leafDiff(jb1, jb2).length : null;
        }
    }
    const keysSame = a1 && b1 ? a1.keys === b1.keys : null;
    table.push({
        path: p, st: `${stA}|${stB}`, stSame: stA === stB, errA: a.length - okA.length, errB: b.length - okB.length, n: [a.length, b.length],
        p50: [q(a.map((r) => r.ms), 0.5), q(b.map((r) => r.ms), 0.5)], p95: [q(a.map((r) => r.ms), 0.95), q(b.map((r) => r.ms), 0.95)],
        ttfb50: [q(a.map((r) => r.ttfb).filter((x) => x != null), 0.5), q(b.map((r) => r.ttfb).filter((x) => x != null), 0.5)],
        keysSame, dAB, dAA, dBB,
    });
}
// 짝지은 차이
const pairs = [];
for (const r of rows.filter((x) => x.target === CAND)) {
    const b = rows.find((x) => x.target === BASE && x.path === r.path && x.round === r.round);
    if (b && r.status && b.status) pairs.push(r.ms - b.ms);
}
function bootMedianCI(d, n = 2000) {
    if (!d.length) return [null, null];
    const meds = [];
    for (let i = 0; i < n; i++) { const s = Array.from({ length: d.length }, () => d[Math.floor(Math.random() * d.length)]); meds.push(q(s, 0.5)); }
    return [q(meds, 0.025), q(meds, 0.975)];
}
const all = (t) => rows.filter((r) => r.target === t && r.status);
const errs = (t) => rows.filter((r) => r.target === t && (!r.status || r.status >= 500)).length;
if (args.includes('--json')) { console.log(JSON.stringify({ table, pairs: { n: pairs.length, median: q(pairs, 0.5), ci: bootMedianCI(pairs) } }, null, 1)); process.exit(0); }
console.log(`비교 ${BASE}(기준) vs ${CAND}(후보) · 경로 ${paths.length} · 요청 ${rows.length}`);
console.log('경로'.padEnd(52) + '상태(기준|후보)'.padEnd(18) + '오류'.padEnd(7) + 'p50 기준/후보'.padEnd(17) + 'p95 기준/후보'.padEnd(17) + '내용차이 AB(AA/BB)');
for (const r of table) {
    const flag = (!r.stSame ? ' ← 상태 다름' : '') + (r.keysSame === false ? ' ← 키집합 다름' : '') + (r.dAB != null && r.dAA != null && r.dAB > Math.max(r.dAA, r.dBB ?? 0) ? ' ← 자연변동 초과' : '');
    console.log(r.path.slice(0, 51).padEnd(52) + r.st.padEnd(18) + `${r.errA}/${r.errB}`.padEnd(7) + `${r.p50[0]}/${r.p50[1]}`.padEnd(17) + `${r.p95[0]}/${r.p95[1]}`.padEnd(17) + `${r.dAB ?? '-'}(${r.dAA ?? '-'}/${r.dBB ?? '-'})` + flag);
}
// 꼬리 비교 — 경로별로 층화한 부트스트랩: 각 경로 안에서 요청을 복원추출해 전체 분위수 차이(후보−기준)를 본다
function bootQuantDiff(p, n = 1000) {
    const strata = paths.map((pp) => [rows.filter((r) => r.path === pp && r.target === BASE && r.status).map((r) => r.ms), rows.filter((r) => r.path === pp && r.target === CAND && r.status).map((r) => r.ms)]);
    const diffs = [];
    for (let i = 0; i < n; i++) {
        const a = [], b = [];
        for (const [sa, sb] of strata) { for (let k = 0; k < sa.length; k++) a.push(sa[Math.floor(Math.random() * sa.length)]); for (let k = 0; k < sb.length; k++) b.push(sb[Math.floor(Math.random() * sb.length)]); }
        diffs.push(q(b, p) - q(a, p));
    }
    return [q(diffs, 0.025), q(diffs, 0.5), q(diffs, 0.975)];
}
const [lo, hi] = bootMedianCI(pairs);
for (const p of [0.5, 0.95, 0.99]) { const [l, m, h] = bootQuantDiff(p); console.log(`전체 p${Math.round(p * 100)} 차이(후보−기준) 부트스트랩 중앙 ${m}ms · 95% 신뢰구간 [${l}, ${h}]ms ${l <= 0 && h >= 0 ? '→ 0 포함(유의한 차이 없음)' : h < 0 ? '→ 후보가 유의하게 빠름' : '→ 후보가 유의하게 느림'}`); }
for (const t of [BASE, CAND]) { const a = all(t).map((r) => r.ms); console.log(`${t}: 요청 ${all(t).length} · 5xx/실패 ${errs(t)} (${(100 * errs(t) / Math.max(1, rows.filter((r) => r.target === t).length)).toFixed(2)}%) · p50 ${q(a, 0.5)} · p95 ${q(a, 0.95)} · p99 ${q(a, 0.99)} ms`); }
console.log(`짝지은 차이(후보−기준, 같은 라운드·경로) n=${pairs.length} · 중앙값 ${q(pairs, 0.5)}ms · 95% 신뢰구간 [${lo}, ${hi}]ms · 경로별 p50 중앙값 기준 ${q(table.map((r) => r.p50[0]), 0.5)} / 후보 ${q(table.map((r) => r.p50[1]), 0.5)} · 경로별 p95 중앙값 기준 ${q(table.map((r) => r.p95[0]), 0.5)} / 후보 ${q(table.map((r) => r.p95[1]), 0.5)}`);
const bad = table.filter((r) => !r.stSame || r.keysSame === false || (r.dAB != null && r.dAA != null && r.dAB > Math.max(r.dAA, r.dBB ?? 0)));
console.log(`표시된 경로 ${bad.length}: ${bad.map((r) => r.path).join(' · ') || '없음'}`);
