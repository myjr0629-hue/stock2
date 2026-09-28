// 프록시 신뢰성 수리 고정 테스트 — `npx tsx scripts/test-redis-reliability.ts`
// 옛 판(origin/main)에서 운영 장애(루프 정체·일시정지 뒤 가짜 타임아웃 → 인스턴스 전체 30초 Upstash)를 그대로 재현하고,
// 새 판에선 같은 조건에서 사라지는지, 그리고 정상 경로는 호출이 한 글자도 안 바뀌었는지를 본다.
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// EC2 프록시는 «진짜» 로컬 HTTP 서버로 흉내낸다 — 응답이 소켓(poll 단계)으로 와야 운영과 같은 순서
// (다음 바퀴의 timers 단계 = 마감 타이머가 poll 보다 먼저)가 재현된다. Upstash 는 fetch 가로채기로 흉내낸다.
import http from 'http';
type Behave = 'ok-null' | 'ok-value' | 'hang' | 'reset' | 'http-401' | 'http-500';
/** 다음 EC2 요청들의 동작 대기열 — 비면 기본값(dflt) */
const plan: Behave[] = [];
let dflt: Behave = 'ok-null';
let log: string[] = [];
const upstore = new Map<string, string>();
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const hdr = (init: any, k: string) => { const h = init?.headers || {}; for (const [kk, v] of Object.entries(h)) if (kk.toLowerCase() === k) return String(v); return ''; };
const hung: http.ServerResponse[] = [];
const server = http.createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://x');
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
        const b: Behave = plan.length ? plan.shift()! : dflt;
        const raw = Buffer.concat(chunks).toString('utf8');
        const what = u.pathname === '/set' ? `set ${JSON.parse(raw || '{}').key}` : u.pathname === '/mget' ? `mget ${u.searchParams.get('keys')}` : `${u.pathname.slice(1)} ${u.searchParams.get('key')}`;
        const ts = req.headers['x-exec-ts'];
        log.push(`ec ${what} [${b}]` + (ts ? ` ts=${ts}` : ''));
        const send = (code: number, body: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
        const val = b === 'ok-value' ? { v: 1 } : null;
        if (b === 'hang') { hung.push(res); return; }
        if (b === 'reset') { req.socket.destroy(); return; }
        if (b === 'http-401') return send(401, { error: 'Unauthorized' });
        if (b === 'http-500') return send(500, { error: 'x' });
        if (u.pathname === '/mget') return send(200, { results: (u.searchParams.get('keys') || '').split(',').map(() => val) });
        if (u.pathname === '/get') return send(200, { result: val });
        return send(200, { ok: true });
    });
});
const realFetch = globalThis.fetch;
(globalThis as any).fetch = (input: any, init?: any) => {
    const url = String(input);
    if (url.startsWith(process.env.EC2_REDIS_PROXY_URL || '\u0000')) return realFetch(input, init);
    return new Promise((resolve, reject) => {
        const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
        if (!url.startsWith('https://upstash.test')) return reject(new Error('unexpected fetch ' + url));
        const enc = hdr(init, 'upstash-encoding') === 'base64' ? (s: string | null) => (s === null ? null : b64(s)) : (s: string | null) => s;
        const bd = JSON.parse(init?.body || '[]'); const cmds: any[][] = Array.isArray(bd[0]) ? bd : [bd];
        const out = cmds.map((c) => {
            const op = String(c[0]).toUpperCase();
            log.push(`up ${op.toLowerCase()} ${c[1]}`);
            if (op === 'GET') return { result: enc(upstore.get(c[1]) ?? null) };
            if (op === 'SETEX') { upstore.set(c[1], String(c[3])); return { result: 'OK' }; }
            if (op === 'SET') { upstore.set(c[1], String(c[2])); return { result: 'OK' }; }
            if (op === 'MGET') return { result: c.slice(1).map((k: string) => enc(upstore.get(k) ?? null)) };
            if (op === 'DEL') return { result: 1 };
            return { result: null };
        });
        resolve(json(url.endsWith('/pipeline') ? out : out[0]));
    });
};
process.env.EC2_REDIS_PROXY_KEY = 'k';
process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 't';
process.env.EXECUTOR_SECRET = 'test-secret-for-hmac';

const realNow = Date.now.bind(Date);
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;
const advance = (ms: number) => { clockOffset += ms; };
const busy = (ms: number) => { const end = performance.now() + ms; while (performance.now() < end) { /* 이벤트 루프를 막는다 */ } };
const tick = () => new Promise((r) => setTimeout(r, 5));
/** 요청을 띄운 «같은 콜백»에서 루프를 blockMs 막는다 — 운영의 무거운 I/O 콜백·인스턴스 일시정지와 같은 순서 */
function duringBlock<T>(fn: () => Promise<T>, blockMs: number): Promise<T> {
    return new Promise((resolve, reject) => { setImmediate(() => { const p = fn(); busy(blockMs); p.then(resolve, reject); }); });
}

type R = typeof import('../src/services/redisClient');
const statAll: any[] = [];
const quiet = () => { const o = { l: console.log, w: console.warn, e: console.error }; const lines: string[] = []; console.log = (...a: any[]) => { const s = a.join(' '); if (s.startsWith('[RedisStats] ')) statAll.push(JSON.parse(s.slice(13))); lines.push(s); }; console.warn = (...a: any[]) => { lines.push(a.join(' ')); }; console.error = () => {}; return { lines, restore: () => { console.log = o.l; console.warn = o.w; console.error = o.e; } }; };

/** 정상 경로 시나리오(프록시 건강) — 두 판의 호출 로그가 같아야 한다 */
async function healthy(R: R): Promise<string[]> {
    const out: string[] = []; const note = (s: string) => { out.push(s); for (const l of log) out.push('  ' + l); log = []; };
    log = []; upstore.clear(); dflt = 'ok-null'; plan.length = 0; R._resetReplicateThrottle();
    note('get miss ' + JSON.stringify(await R.getFromCache('intrinio:resp:v1:a')));
    dflt = 'ok-value'; note('get hit ' + JSON.stringify(await R.getFromCache('intrinio:resp:v1:a')));
    dflt = 'ok-null'; upstore.set('cache:13f:c:1', JSON.stringify({ a: 1 })); note('get 13f ' + JSON.stringify(await R.getFromCache('cache:13f:c:1')));
    note('mget ' + JSON.stringify(await R.mgetFromCache(['intrinio:resp:v1:a', 'cache:13f:c:1'])));
    note('set wrapper ' + await R.setInCache('intrinio:resp:v1:a', { v: 1 }, 60));
    note('set guardian ' + await R.setInCache('guardian:snapshot:ko', { v: 1 }, 300));
    note('set durable ' + await R.setInCache('mkt:x', { v: 1 }));
    note('set lastgood x2 ' + await R.setInCache('flow:ticker:lastgood:v2:N', { v: 1 }, 43200) + await R.setInCache('flow:ticker:lastgood:v2:N', { v: 2 }, 43200));
    note('del ' + await R.deleteFromCache('intrinio:resp:v1:a'));
    note('null blocked ' + await R.setInCache('x', null as any, 10));
    return out;
}

(async () => {
    let fails = 0;
    const t = (name: string, cond: boolean, extra = '') => { console.log((cond ? '✓ ' : '✗ ') + name + (cond ? '' : `   ← ${extra}`)); if (!cond) fails++; };
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    process.env.EC2_REDIS_PROXY_URL = `http://127.0.0.1:${(server.address() as any).port}`;
    const basePath = path.join(__dirname, '.redisClient.base-rel.ts');
    fs.writeFileSync(basePath, execSync('git show origin/main:src/services/redisClient.ts', { encoding: 'utf8' }));
    let q = quiet();
    const Base: R = await import(path.resolve(basePath));
    const Cur: R = await import('../src/services/redisClient');
    q.restore();

    // ── ① 정상 경로 동등성
    console.log('── ① 정상 경로(프록시 건강): 옛 판과 호출 로그 동일');
    q = quiet(); const hb = await healthy(Base); const hc = await healthy(Cur); q.restore();
    let fd = -1; for (let i = 0; i < Math.max(hb.length, hc.length); i++) if (hb[i] !== hc[i]) { fd = i; break; }
    t(`EC2·Upstash 호출 순서·키·반환값 동일(${hb.length}줄)`, fd === -1, fd >= 0 ? `${fd}행: «${hb[fd]}» vs «${hc[fd]}»` : '');

    // 새 판은 시간을 줄여 잰다(옛 판은 예산 6초 그대로 — 재현용으로 한 번만 기다린다)
    Cur._setEcTimingForTest({ budget: { get: 150, mget: 150, set: 150, del: 150 }, lateMs: 50, graceMs: 120, cooldownBaseMs: 5_000, cooldownMaxMs: 30_000 });

    // ── ② 응답은 도착했는데 루프가 예산보다 오래 막힘(운영의 «가짜 타임아웃»)
    console.log('── ② 루프 정체: 응답은 이미 왔는데 마감 타이머가 먼저 울리는 상황');
    q = quiet(); log = []; plan.length = 0; dflt = 'ok-value';
    const vb = await duringBlock(() => Base.getFromCache<any>('intrinio:resp:v1:s'), 6_300);
    const baseLog = log.slice(); const baseLines = q.lines.slice(); q.restore();
    t('옛 판: 도착한 응답을 버리고 타임아웃 → 30초 차단 → Upstash 로(운영 증상 재현)', vb === null && baseLog.some((l) => l.startsWith('up get')) && baseLines.some((l) => l.includes('일시 중단(30초)')), JSON.stringify({ vb, baseLog, baseLines }));
    q = quiet(); log = []; plan.length = 0; dflt = 'ok-value'; Cur._resetEcBreakerForTest();
    const vc = await duringBlock(() => Cur.getFromCache<any>('intrinio:resp:v1:s'), 150 + 200);
    const curLog = log.slice(); const curLines = q.lines.slice(); q.restore();
    t('새 판: 같은 조건에서 응답을 살린다(값 반환·Upstash 0·차단 없음)', vc?.v === 1 && !curLog.some((l) => l.startsWith('up ')) && !curLines.some((l) => l.includes('일시 중단')), JSON.stringify({ vc, curLog, curLines }));
    t('   └ 관측 줄에 «정체 유예로 살린 호출»이 1', Cur._obsSnapshotForTest().rescued === 1, String(Cur._obsSnapshotForTest().rescued));
    q = quiet(); log = []; const after = await Cur.getFromCache<any>('intrinio:resp:v1:t'); const afterLog = log.slice(); q.restore();
    t('   └ 바로 다음 요청도 EC2 로 간다(인스턴스 전체 차단 없음)', after?.v === 1 && afterLog.length === 1 && afterLog[0].startsWith('ec get'), JSON.stringify(afterLog));

    // ── ③ 일시정지로 첫 요청이 죽음(응답 영영 없음) → 정체 유예 뒤 새로 재시도
    console.log('── ③ 일시정지 뒤 죽은 요청: 새 연결로 1회 재시도');
    q = quiet(); log = []; plan.length = 0; plan.push('hang', 'ok-value'); Cur._resetEcBreakerForTest();
    const v3 = await duringBlock(() => Cur.getFromCache<any>('intrinio:resp:v1:u'), 150 + 200); const l3 = log.slice(); const lines3 = q.lines.slice(); q.restore();
    t('재시도로 값을 얻는다·Upstash 0·차단 없음', v3?.v === 1 && l3.filter((l) => l.startsWith('ec get')).length === 2 && !l3.some((l) => l.startsWith('up ')) && !lines3.some((l) => l.includes('일시 중단')), JSON.stringify({ v3, l3, lines3 }));
    q = quiet(); log = []; plan.length = 0; plan.push('hang', 'reset'); Cur._resetEcBreakerForTest(); upstore.set('intrinio:resp:v1:w', JSON.stringify({ up: 1 }));
    const v3b = await duringBlock(() => Cur.getFromCache<any>('intrinio:resp:v1:w'), 150 + 200); const l3b = log.slice(); const lines3b = q.lines.slice(); q.restore();
    t('정체 뒤 재시도가 죽은 소켓이면 → 이 요청만 Upstash, 차단기는 안 연다', v3b?.up === 1 && l3b.some((l) => l.startsWith('up get')) && !lines3b.some((l) => l.includes('일시 중단')), JSON.stringify({ v3b, l3b, lines3b }));

    // ── ④ 진짜 무응답(루프 정상) → 차단 5초 → 반개방 «한 요청만» 시험 → 성공 시 닫힘
    console.log('── ④ 진짜 무응답: 차단기 5초 → 시험 요청 1개');
    q = quiet(); log = []; plan.length = 0; plan.push('hang'); dflt = 'ok-value'; Cur._resetEcBreakerForTest(); upstore.set('intrinio:resp:v1:h', JSON.stringify({ up: 1 }));
    const v4 = await Cur.getFromCache<any>('intrinio:resp:v1:h'); const l4 = q.lines.slice(); q.restore();
    t('타임아웃 → 이 요청 Upstash · 차단 5초(30초 아님)', v4?.up === 1 && l4.some((l) => l.includes('일시 중단(5초)')), JSON.stringify({ v4, l4 }));
    q = quiet(); log = []; await Cur.getFromCache('intrinio:resp:v1:h'); await Cur.setInCache('intrinio:resp:v1:z', { v: 1 }, 60); const l4b = log.slice(); q.restore();
    t('차단 중엔 읽기·쓰기 모두 EC2 를 건너뛴다(예전 쿨다운과 같은 경로)', !l4b.some((l) => l.startsWith('ec ')) && l4b.some((l) => l.startsWith('up get')) && l4b.some((l) => l.startsWith('up setex')), JSON.stringify(l4b));
    advance(5_100);
    q = quiet(); log = []; plan.length = 0; plan.push('hang'); // 시험 요청이 붙잡혀 있는 동안 동시 요청들
    const probeP = Cur.getFromCache<any>('intrinio:resp:v1:h');
    await new Promise((r) => setTimeout(r, 30));
    const others = await Promise.all([Cur.getFromCache('intrinio:resp:v1:o1'), Cur.getFromCache('intrinio:resp:v1:o2'), Cur.getFromCache('intrinio:resp:v1:o3')]);
    const h = hung.pop()!; h.writeHead(200, { 'Content-Type': 'application/json' }); h.end(JSON.stringify({ result: { v: 1 } }));
    const probeV = await probeP; const l4c = log.slice(); const lines4c = q.lines.slice(); q.restore();
    t('쿨다운이 끝나면 동시 4건 중 «1건만» EC2 로 시험, 나머지 3건은 Upstash', l4c.filter((l) => l.startsWith('ec get')).length === 1 && l4c.filter((l) => l.startsWith('up get')).length === 3 && probeV?.v === 1, JSON.stringify({ l4c, others }));
    t('   └ 시험 성공 → 차단기 닫힘(복구 로그)', lines4c.some((l) => l.includes('복구(시험 요청 성공)')), JSON.stringify(lines4c));
    q = quiet(); log = []; await Cur.getFromCache('intrinio:resp:v1:o1'); const l4d = log.slice(); q.restore();
    t('   └ 닫힌 뒤엔 다시 EC2', l4d.length === 1 && l4d[0].startsWith('ec get'), JSON.stringify(l4d));

    // ── ⑤ 시험 실패 → 다음 단계(10초), 그 다음 20초 …
    console.log('── ⑤ 시험 실패 시 지수 증가');
    q = quiet(); log = []; plan.length = 0; plan.push('hang'); Cur._resetEcBreakerForTest();
    await Cur.getFromCache('intrinio:resp:v1:p');        // 5초
    advance(5_100); plan.push('hang'); await Cur.getFromCache('intrinio:resp:v1:p');   // 시험 실패 → 10초
    advance(5_100); log = []; await Cur.getFromCache('intrinio:resp:v1:p'); const l5a = log.slice();   // 아직 10초 안 → 건너뜀
    advance(5_000); plan.push('hang'); await Cur.getFromCache('intrinio:resp:v1:p');   // 시험 실패 → 20초
    const l5 = q.lines.slice(); q.restore();
    t('5초 → 시험 실패 10초 → 시험 실패 20초', l5.some((l) => l.includes('(5초)')) && l5.some((l) => l.includes('(10초)')) && l5.some((l) => l.includes('(20초)')), JSON.stringify(l5));
    t('   └ 10초 차단 도중(5.1초 시점)엔 시험하지 않는다', !l5a.some((l) => l.startsWith('ec ')), JSON.stringify(l5a));
    advance(60_000); q = quiet(); plan.length = 0; dflt = 'ok-value'; log = []; await Cur.getFromCache('intrinio:resp:v1:p'); q.restore();
    q = quiet(); plan.push('hang'); await Cur.getFromCache('intrinio:resp:v1:p'); const l5b = q.lines.slice(); q.restore();
    t('   └ 성공하면 단계가 초기화된다(다음 사건은 다시 5초)', l5b.some((l) => l.includes('(5초)')), JSON.stringify(l5b));

    // ── ⑥ 소켓 오류
    console.log('── ⑥ 네트워크 오류(소켓 끊김)');
    q = quiet(); log = []; plan.length = 0; plan.push('reset', 'ok-value'); Cur._resetEcBreakerForTest();
    const v6 = await Cur.getFromCache<any>('intrinio:resp:v1:n'); const l6 = log.slice(); const lines6 = q.lines.slice(); q.restore();
    t('1회 끊김 → 지터 후 재시도 성공 · Upstash 0 · 차단 없음', v6?.v === 1 && l6.filter((l) => l.startsWith('ec get')).length === 2 && !l6.some((l) => l.startsWith('up ')) && !lines6.some((l) => l.includes('일시 중단')), JSON.stringify({ l6, lines6 }));
    q = quiet(); log = []; plan.push('reset', 'reset'); upstore.set('intrinio:resp:v1:n2', JSON.stringify({ up: 1 }));
    const v6b = await Cur.getFromCache<any>('intrinio:resp:v1:n2'); const lines6b = q.lines.slice(); q.restore();
    t('2회 연속 끊김(GET) → 차단(예전과 같은 판정) · 이 요청은 Upstash', v6b?.up === 1 && lines6b.some((l) => l.includes('일시 중단')), JSON.stringify(lines6b));
    q = quiet(); Cur._resetEcBreakerForTest(); log = []; plan.push('reset', 'reset');
    const s6 = await Cur.setInCache('intrinio:resp:v1:n3', { v: 1 }, 60); const l6c = log.slice(); const lines6c = q.lines.slice(); q.restore();
    t('2회 연속 끊김(SET) → Upstash 가 받는다·차단기는 안 연다(예전과 동일)', s6 === true && l6c.some((l) => l.startsWith('up setex')) && !lines6c.some((l) => l.includes('일시 중단')), JSON.stringify({ l6c, lines6c }));

    // ── ⑦ HTTP 401 → 예전처럼 차단
    console.log('── ⑦ HTTP 401');
    q = quiet(); log = []; plan.length = 0; plan.push('http-401'); Cur._resetEcBreakerForTest();
    await Cur.getFromCache('intrinio:resp:v1:k'); const l7 = q.lines.slice(); q.restore();
    t('401 → 차단(예전과 같은 판정, 기간만 5초부터)', l7.some((l) => l.includes('일시 중단(5초): HTTP 401')), JSON.stringify(l7));

    // ── ⑧ trade:* 서명은 재시도 때 새로 만든다
    console.log('── ⑧ trade:* 재시도 서명');
    q = quiet(); log = []; plan.length = 0; plan.push('reset', 'ok-null'); Cur._resetEcBreakerForTest();
    await Cur.setInCache('trade:auto:test', { on: true }); const l8 = log.filter((l) => l.startsWith('ec set')); q.restore();
    const ts8 = l8.map((l) => (l.match(/ts=(\d+)/) || [])[1]);
    t('두 시도 모두 서명 헤더가 붙고, 재시도 서명은 새로 만든 것(시각이 다르다)', l8.length === 2 && ts8.every(Boolean) && ts8[0] !== ts8[1], JSON.stringify(l8));

    // ── ⑨ 같은 사건의 동시 실패는 단계를 한 번만 올린다
    console.log('── ⑨ 동시 실패 10건');
    q = quiet(); log = []; plan.length = 0; dflt = 'hang'; Cur._resetEcBreakerForTest();
    await Promise.all(Array.from({ length: 10 }, (_, i) => Cur.getFromCache('intrinio:resp:v1:c' + i))); dflt = 'ok-value';
    const l9 = q.lines.filter((l) => l.includes('일시 중단')); q.restore();
    t('차단 로그 1줄(5초) — 10번 가중되지 않는다', l9.length === 1 && l9[0].includes('(5초)'), JSON.stringify(l9));

    // ── ⑩ 관측 줄: 수리 동작이 사유별로 집계되는가
    console.log('── ⑩ [RedisStats] 집계');
    q = quiet(); Cur._obsFlushForTest(); q.restore();
    const S = (f: (l: any) => number) => statAll.reduce((a, l) => a + (f(l) || 0), 0);
    t('정체 유예로 살린 호출(rescued)·재시도(retry·retryOk)·반개방 시험(probes)이 잡힌다', S((l) => l.rescued) >= 1 && S((l) => l.retry) >= 4 && S((l) => l.retryOk) >= 2 && S((l) => l.probes) >= 3, JSON.stringify(statAll.map((l) => [l.rescued, l.retry, l.retryOk, l.probes])));
    t('정체 뒤 실패는 «stall» 로 따로 센다(차단 사유에 안 들어간다)', S((l) => l.ec?.get?.stall) >= 1 && !statAll.some((l) => l.tripWhy && Object.keys(l.tripWhy).some((k) => /stall/.test(k))), JSON.stringify(statAll.map((l) => [l.ec?.get, l.tripWhy])));

    fs.unlinkSync(basePath);
    for (const r of hung) { try { r.destroy(); } catch { /* */ } }
    server.close();
    console.log(fails ? `\n✗ 실패 ${fails}` : '\n✓ 전부 통과');
    process.exit(fails ? 1 : 0);
})();
