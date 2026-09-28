// [RedisStats] 집계 — Redis 클라이언트 관측 줄을 Vercel 로그에서 모아 «전/후» 비교표를 만든다.
//   node scripts/redis-stats-report.js --env production --since 2h            (운영)
//   node scripts/redis-stats-report.js --deployment <프리뷰URL> --since 30m    (프리뷰)
//   node scripts/redis-stats-report.js --file a.jsonl [--file b.jsonl]        (저장분)
//   옵션: --window 120(초, 로그 조회 창 — CLI 가 창마다 ~50행만 주므로 잘게 나눈다) --save out.jsonl --json
// 로그 한 줄이 동시 요청 여러 개에 붙어 나오므로(Fluid) «줄 내용 전체»로 중복을 제거한다.
// 값·키 내용은 원래 줄에 없다. 출력은 합계·비율·지연 분포뿐.
const { execFileSync } = require('child_process');
const fs = require('fs');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const opts = (k) => args.flatMap((a, i) => (a === '--' + k ? [args[i + 1]] : []));
const BUCKETS = [2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];

function parseSince(s) {
    const m = String(s).match(/^(\d+)([smhd])$/); if (!m) return new Date(s).getTime();
    return Date.now() - Number(m[1]) * { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[m[2]];
}
function fetchRows() {
    const files = opts('file');
    const raw = [];
    if (files.length) { for (const f of files) raw.push(...fs.readFileSync(f, 'utf8').split('\n')); return raw; }
    const from = parseSince(opt('since', '1h')); const to = opt('until') ? parseSince(opt('until')) : Date.now();
    const win = Number(opt('window', '120')) * 1000;
    const base = ['logs', '--no-branch', '--query', '[RedisStats]', '--limit', '200', '--json'];
    if (opt('deployment')) base.push('--deployment', opt('deployment')); else base.push('--environment', opt('env', 'production'));
    for (let t = from; t < to; t += win) {
        const a = [...base, '--since', new Date(t).toISOString(), '--until', new Date(Math.min(to, t + win)).toISOString()];
        try { raw.push(...execFileSync('vercel', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], cwd: opt('cwd', process.cwd()), maxBuffer: 64 << 20 }).split('\n')); }
        catch (e) { process.stderr.write(`창 ${new Date(t).toISOString()} 실패: ${e.message.slice(0, 80)}\n`); }
    }
    if (opt('save')) fs.writeFileSync(opt('save'), raw.filter(Boolean).join('\n'));
    return raw;
}
function extract(raw) {
    const seen = new Map();
    for (const l of raw) {
        if (!l || !l.includes('[RedisStats]')) continue;
        let r; try { r = JSON.parse(l); } catch { continue; }
        const msgs = (r.logs && r.logs.length ? r.logs : [{ message: r.message }]).map((x) => x.message || '');
        for (const m of msgs) {
            const i = m.indexOf('[RedisStats] '); if (i < 0) continue;
            const body = m.slice(i + 13).trim();
            if (seen.has(body)) continue;
            try { const j = JSON.parse(body); j._ts = r.timestamp; j._dep = r.deploymentId; seen.set(body, j); } catch { /* 잘린 줄 */ }
        }
    }
    return [...seen.values()].sort((a, b) => a._ts - b._ts);
}
function pctFromHist(h, p) {
    const n = h.reduce((a, b) => a + b, 0); if (!n) return null;
    const target = Math.ceil(n * p); let acc = 0;
    for (let i = 0; i < h.length; i++) { acc += h[i]; if (acc >= target) return i < BUCKETS.length ? `≤${BUCKETS[i]}` : '>10000'; }
    return '>10000';
}
function aggregate(lines) {
    const A = { lines: lines.length, instances: new Set(), winSec: 0, ec: {}, up: { get: {}, mget: {}, set: {}, del: 0, getHit: 0, getMiss: 0, err: 0, maxMs: 0 }, trips: 0, tripWhy: {}, cdMs: 0, toMax: 0, loop: { p99: [], max: [] } };
    for (const l of lines) {
        A.instances.add(l.inst); A.winSec += l.win || 0; A.trips += l.trips || 0; A.cdMs += l.cdMs || 0; A.toMax = Math.max(A.toMax, l.toMax || 0);
        for (const [k, v] of Object.entries(l.tripWhy || {})) A.tripWhy[k] = (A.tripWhy[k] || 0) + v;
        for (const [op, s] of Object.entries(l.ec || {})) {
            const t = (A.ec[op] ||= { n: 0, hit: 0, miss: 0, ok: 0, timeout: 0, neterr: 0, http: 0, moji: 0, max: 0, h: new Array(BUCKETS.length + 1).fill(0) });
            for (const k of ['n', 'hit', 'miss', 'ok', 'timeout', 'neterr', 'http', 'moji']) t[k] += s[k] || 0;
            t.max = Math.max(t.max, s.max || 0);
            if (Array.isArray(s.h)) s.h.forEach((c, i) => { t.h[i] += c; });
        }
        const u = l.up || {};
        for (const op of ['get', 'mget', 'set']) for (const [k, v] of Object.entries(u[op] || {})) A.up[op][k] = (A.up[op][k] || 0) + v;
        A.up.del += u.del || 0; A.up.getHit += u.getHit || 0; A.up.getMiss += u.getMiss || 0; A.up.err += u.err || 0; A.up.maxMs = Math.max(A.up.maxMs, u.maxMs || 0);
        if (l.loop) { A.loop.p99.push(l.loop.p99); A.loop.max.push(l.loop.max); }
    }
    return A;
}
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
function report(A, lines) {
    const mins = A.winSec / 60 || 1;
    const pct = (a, b) => (b ? (100 * a / b).toFixed(2) + '%' : '-');
    const sumObj = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    const out = [];
    const span = lines.length ? `${new Date(lines[0]._ts).toISOString()} → ${new Date(lines[lines.length - 1]._ts).toISOString()}` : '-';
    out.push(`관측 줄 ${A.lines} · 인스턴스 ${A.instances.size} · 인스턴스·분 ${mins.toFixed(0)} · 구간 ${span}`);
    for (const op of ['get', 'mget', 'set', 'del']) {
        const s = A.ec[op]; if (!s) continue;
        const fail = s.timeout + s.neterr + s.http;
        out.push(`EC2 ${op.toUpperCase().padEnd(4)} n=${s.n} (${(s.n / mins).toFixed(1)}/인스턴스·분) · 실패 ${pct(fail, s.n)} [타임아웃 ${s.timeout} · 네트워크 ${s.neterr} · HTTP ${s.http}]` +
            (op === 'get' ? ` · 적중 ${pct(s.hit, s.n)} · 미스 ${pct(s.miss, s.n)} · 깨짐 ${s.moji}` : '') +
            ` · 지연 p50 ${pctFromHist(s.h, 0.5)} p95 ${pctFromHist(s.h, 0.95)} p99 ${pctFromHist(s.h, 0.99)} p99.9 ${pctFromHist(s.h, 0.999)} 최대 ${s.max}ms`);
    }
    const upGet = sumObj(A.up.get), upMget = sumObj(A.up.mget), upSet = sumObj(A.up.set);
    const upTotal = upGet + upMget + upSet + A.up.del;
    out.push(`Upstash 호출 ${upTotal} (${(upTotal / mins).toFixed(2)}/인스턴스·분) · GET ${upGet} ${JSON.stringify(A.up.get)} (적중 ${A.up.getHit}/${A.up.getHit + A.up.getMiss}) · MGET ${upMget} ${JSON.stringify(A.up.mget)} · SET ${upSet} ${JSON.stringify(A.up.set)} · DEL ${A.up.del} · 오류 ${A.up.err} · 최대 ${A.up.maxMs}ms`);
    const ecTotal = Object.values(A.ec).reduce((a, s) => a + s.n, 0);
    out.push(`Upstash 비중(전체 Redis 호출 중) ${pct(upTotal, upTotal + ecTotal)} · 그중 «장애성»(cooldown+ecErr+ecFail+moji) ${upTotal ? pct(['cooldown', 'ecErr', 'moji'].reduce((a, k) => a + (A.up.get[k] || 0) + (A.up.mget[k] || 0), 0) + (A.up.set.cooldown || 0) + (A.up.set.ecFail || 0), upTotal) : '-'}`);
    out.push(`쿨다운 진입 ${A.trips} (${(A.trips / mins * 60).toFixed(1)}/인스턴스·시간) 사유 ${JSON.stringify(A.tripWhy)} · 쿨다운 시간 비중 ${pct(A.cdMs, A.winSec * 1000)} · 타임아웃 실제 경과 최대 ${A.toMax}ms`);
    if (A.loop.max.length) out.push(`이벤트 루프 지연(인스턴스·분): p99 중앙 ${med(A.loop.p99)}ms · p99 의 p95 ${q(A.loop.p99, 0.95)}ms · 최대의 중앙 ${med(A.loop.max)}ms · 최대의 p95 ${q(A.loop.max, 0.95)}ms · 최대 ${Math.max(...A.loop.max)}ms · 1초 넘게 막힌 인스턴스·분 ${A.loop.max.filter((x) => x > 1000).length}/${A.loop.max.length}`);
    return out.join('\n');
}
const lines = extract(fetchRows());
const A = aggregate(lines);
if (args.includes('--json')) console.log(JSON.stringify({ ...A, instances: A.instances.size }, null, 1));
else console.log(report(A, lines));
