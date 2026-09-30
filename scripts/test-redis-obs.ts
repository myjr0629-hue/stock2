// 관측(로그 전용) 고정 테스트 — `npx tsx scripts/test-redis-obs.ts [비교할 redisClient 경로]`
// ① 동등성: 같은 시나리오를 «비교 대상(기본 = origin/main 판)»과 «현재 판»에 똑같이 흘려
//    EC2 프록시·Upstash 로 나간 호출 순서(대상·명령·키·타임아웃)와 반환값이 한 글자도 다르지 않은지 본다.
//    → 계측이 동작을 바꾸지 않았다는 기계적 증거.
// ② 통계: [RedisStats] 한 줄이 결과·사유를 맞게 세는지 본다.
// 비교 대상 파일은 `git show origin/main:src/services/redisClient.ts > <경로>` 로 만든다(인자 없으면 자동).
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

process.env.EC2_REDIS_PROXY_URL = 'http://ec2.test';
process.env.EC2_REDIS_PROXY_KEY = 'k';
process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 't';

type Mode = 'ok-null' | 'ok-value' | 'http-401' | 'http-500' | 'timeout' | 'neterr' | 'mojibake';
const env = { ecMode: 'ok-null' as Mode, setMode: 'ok' as 'ok' | 'timeout' | 'neterr' | 'http-500', mgetMode: 'ok' as 'ok' | 'timeout' | 'neterr' | 'http-500' | 'mojibake' };
let log: string[] = [];
const upstore = new Map<string, string>();
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const timeoutErr = () => { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; return e; };
const netErr = () => new TypeError('fetch failed');

(globalThis as any).fetch = async (input: any, init?: any) => {
    const url = String(input);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
    const tmo = (init?.signal && typeof init.signal === 'object') ? 'sig' : 'nosig';
    if (url.startsWith('http://ec2.test')) {
        const u = new URL(url);
        if (u.pathname === '/mget') {
            log.push(`ec mget ${u.searchParams.get('keys')} ${tmo}`);
            if (env.mgetMode === 'timeout') throw timeoutErr();
            if (env.mgetMode === 'neterr') throw netErr();
            if (env.mgetMode === 'http-500') return json({ error: 'x' }, 500);
            const n = (u.searchParams.get('keys') || '').split(',').length;
            if (env.mgetMode === 'mojibake') return json({ results: Array(n).fill('�') });
            return json({ results: Array(n).fill(env.ecMode === 'ok-value' ? { v: 1 } : null) });
        }
        if (u.pathname === '/get') {
            log.push(`ec get ${u.searchParams.get('key')} ${tmo}`);
            if (env.ecMode === 'timeout') throw timeoutErr();
            if (env.ecMode === 'neterr') throw netErr();
            if (env.ecMode === 'http-401') return json({ error: 'Unauthorized' }, 401);
            if (env.ecMode === 'http-500') return json({ error: 'x' }, 500);
            if (env.ecMode === 'mojibake') return json({ result: '�깨짐' });
            return json({ result: env.ecMode === 'ok-value' ? { v: 1 } : null });
        }
        if (u.pathname === '/set') {
            const b = JSON.parse(init?.body || '{}');
            log.push(`ec set ${b.key} ttl=${b.ttl === undefined ? '-' : 'y'} ${tmo}`);
            if (env.setMode === 'timeout') throw timeoutErr();
            if (env.setMode === 'neterr') throw netErr();
            if (env.setMode === 'http-500') return json({ error: 'x' }, 500);
            return json({ ok: true });
        }
        if (u.pathname === '/del') { log.push(`ec del ${u.searchParams.get('key')} ${tmo}`); return json({ ok: true }); }
    }
    if (url.startsWith('https://upstash.test')) {
        const h = Object.fromEntries(Object.entries(init?.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
        const enc = h['upstash-encoding'] === 'base64' ? (s: string | null) => (s === null ? null : b64(s)) : (s: string | null) => s;
        const body = JSON.parse(init?.body || '[]'); const cmds: any[][] = Array.isArray(body[0]) ? body : [body];
        const out = cmds.map((c) => {
            const op = String(c[0]).toUpperCase();
            log.push(`up ${op.toLowerCase()} ${c.slice(1, op === 'MGET' ? undefined : 2).join(',')}`);
            if (op === 'GET') return { result: enc(upstore.get(c[1]) ?? null) };
            if (op === 'SETEX') { upstore.set(c[1], String(c[3])); return { result: 'OK' }; }
            if (op === 'SET') { upstore.set(c[1], String(c[2])); return { result: 'OK' }; }
            if (op === 'MGET') return { result: c.slice(1).map((k: string) => enc(upstore.get(k) ?? null)) };
            if (op === 'DEL') { upstore.delete(c[1]); return { result: 1 }; }
            return { result: null };
        });
        return json(url.endsWith('/pipeline') ? out : out[0]);
    }
    throw new Error('unexpected fetch ' + url);
};

// 가짜 시계 — 쿨다운(30초) 경계를 결정적으로 넘긴다
const realNow = Date.now.bind(Date);
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;
const advance = (ms: number) => { clockOffset += ms; };

type R = typeof import('../src/services/redisClient');
/** 같은 시나리오 — 반환값과 호출 로그를 모은다 */
async function scenario(R: R, withFailures = true): Promise<string[]> {
    const out: string[] = [];
    const note = (s: string) => out.push(s);
    const reset = () => { log = []; upstore.clear(); env.ecMode = 'ok-null'; env.setMode = 'ok'; env.mgetMode = 'ok'; R._resetReplicateThrottle(); };
    const flushLog = (label: string) => { note(`## ${label}`); for (const l of log) note('  ' + l); log = []; };
    reset();
    // 읽기
    note('get wrapper miss → ' + JSON.stringify(await R.getFromCache('intrinio:resp:v1:a'))); flushLog('1');
    env.ecMode = 'ok-value'; note('get hit → ' + JSON.stringify(await R.getFromCache('intrinio:resp:v1:a'))); flushLog('2');
    env.ecMode = 'ok-null'; upstore.set('cache:13f:c:1', JSON.stringify({ a: 1 })); note('get 13f → ' + JSON.stringify(await R.getFromCache('cache:13f:c:1'))); flushLog('3');
    env.ecMode = 'mojibake'; upstore.set('guardian:snapshot:ja', JSON.stringify({ clean: 1 })); note('get moji → ' + JSON.stringify(await R.getFromCache('guardian:snapshot:ja'))); flushLog('4');
    env.ecMode = 'ok-null'; note('mget → ' + JSON.stringify(await R.mgetFromCache(['intrinio:resp:v1:a', 'cache:13f:c:1']))); flushLog('5');
    env.mgetMode = 'mojibake'; note('mget moji → ' + JSON.stringify(await R.mgetFromCache(['intrinio:resp:v1:a', 'cache:13f:c:1']))); flushLog('6');
    env.mgetMode = 'http-500'; note('mget 500 → ' + JSON.stringify(await R.mgetFromCache(['intrinio:resp:v1:a']))); flushLog('7');
    env.mgetMode = 'ok';
    // 쓰기
    note('set wrapper → ' + await R.setInCache('intrinio:resp:v1:a', { v: 1 }, 60)); flushLog('8');
    note('set guardian → ' + await R.setInCache('guardian:snapshot:ko', { v: 1 }, 300)); flushLog('9');
    note('set durable → ' + await R.setInCache('mkt:x', { v: 1 })); flushLog('10');
    note('set lastgood x2 → ' + await R.setInCache('flow:ticker:lastgood:v2:N', { v: 1 }, 43200) + await R.setInCache('flow:ticker:lastgood:v2:N', { v: 2 }, 43200)); flushLog('11');
    note('del → ' + await R.deleteFromCache('intrinio:resp:v1:a')); flushLog('15');
    note('null blocked → ' + await R.setInCache('x', null as any, 10)); flushLog('16');
    note('error blocked → ' + await R.setInCache('x', { error: 'fetch failed' } as any, 10)); flushLog('17');
    if (!withFailures) return out;
    env.setMode = 'timeout'; note('set ec timeout → ' + await R.setInCache('intrinio:resp:v1:b', { v: 1 }, 60)); flushLog('12');
    env.setMode = 'neterr'; note('set ec neterr → ' + await R.setInCache('intrinio:resp:v1:c', { v: 1 }, 60)); flushLog('13');
    env.setMode = 'http-500'; note('set ec 500 → ' + await R.setInCache('intrinio:resp:v1:d', { v: 1 }, 60)); flushLog('14');
    env.setMode = 'ok';
    // 장애 → 쿨다운 → 복구 (가짜 시계)
    env.ecMode = 'timeout'; note('get timeout → ' + JSON.stringify(await R.getFromCache('intrinio:resp:v1:e'))); flushLog('18');
    env.ecMode = 'ok-value';
    note('get in cooldown → ' + JSON.stringify(await R.getFromCache('intrinio:resp:v1:e'))); flushLog('19');
    note('set in cooldown → ' + await R.setInCache('intrinio:resp:v1:f', { v: 1 }, 60)); flushLog('20');
    note('mget in cooldown → ' + JSON.stringify(await R.mgetFromCache(['intrinio:resp:v1:a']))); flushLog('21');
    note('del in cooldown → ' + await R.deleteFromCache('intrinio:resp:v1:a')); flushLog('22');
    advance(31_000);
    note('get after cooldown → ' + JSON.stringify(await R.getFromCache('intrinio:resp:v1:e'))); flushLog('23');
    env.ecMode = 'http-401'; note('get 401 → ' + JSON.stringify(await R.getFromCache('intrinio:resp:v1:g'))); flushLog('24');
    advance(31_000); env.ecMode = 'neterr'; note('get neterr → ' + JSON.stringify(await R.getFromCache('intrinio:resp:v1:h'))); flushLog('25');
    advance(31_000); env.ecMode = 'ok-null';
    // 원본은 mget 실패 때 쿨다운 시각을 갱신하지 않는다(플래그만 false) — 그 특이 동작까지 같아야 한다
    note('get (flag reset) → ' + JSON.stringify(await R.getFromCache('intrinio:resp:v1:a'))); flushLog('26');
    env.mgetMode = 'timeout';
    note('mget timeout → ' + JSON.stringify(await R.mgetFromCache(['intrinio:resp:v1:a']))); flushLog('27');
    note('mget after mget-timeout → ' + JSON.stringify(await R.mgetFromCache(['intrinio:resp:v1:a']))); flushLog('28');
    env.mgetMode = 'ok';
    note('get after mget-timeout → ' + JSON.stringify(await R.getFromCache('intrinio:resp:v1:a'))); flushLog('29');
    note('mget after get → ' + JSON.stringify(await R.mgetFromCache(['intrinio:resp:v1:a']))); flushLog('30');
    env.mgetMode = 'neterr';
    note('mget neterr → ' + JSON.stringify(await R.mgetFromCache(['intrinio:resp:v1:a']))); flushLog('31');
    env.mgetMode = 'ok';
    note('get → ' + JSON.stringify(await R.getFromCache('intrinio:resp:v1:a'))); flushLog('32');
    advance(31_000);
    return out;
}

(async () => {
    let fails = 0;
    const t = (name: string, cond: boolean, extra = '') => { console.log((cond ? '✓ ' : '✗ ') + name + (cond ? '' : `   ← ${extra}`)); if (!cond) fails++; };

    // ── ① 동등성 — 비교 대상 판을 별도 모듈 인스턴스로 올린다
    let basePath = process.argv[2];
    if (!basePath) {
        basePath = path.join(__dirname, '.redisClient.base.ts');
        fs.writeFileSync(basePath, execSync('git show origin/main:src/services/redisClient.ts', { encoding: 'utf8' }));
    }
    const origLog = console.log, origWarn = console.warn, origErr = console.error;
    const silence = () => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; };
    const restore = () => { console.log = origLog; console.warn = origWarn; console.error = origErr; };
    silence();
    const Base: R = await import(path.resolve(basePath));
    const Cur: R = await import('../src/services/redisClient');
    const fixMode = typeof (Cur as any)._setEcTimingForTest === 'function';
    const baseOut = await scenario(Base, !fixMode);
    clockOffset = 0;
    const statLines: string[] = [];
    console.log = (...a: any[]) => { const s = a.join(' '); if (s.startsWith('[RedisStats] ')) statLines.push(s); };
    const curOut = await scenario(Cur, !fixMode);
    restore();
    console.log('── ① 동등성: 비교 대상 = ' + (process.argv[2] || 'origin/main') + (fixMode ? ' · 수리 판 → 정상 경로만(장애 경로는 test-redis-reliability.ts)' : ' · 시나리오 32단계') + ` · 호출 로그 ${baseOut.length}줄`);
    let firstDiff = -1;
    for (let i = 0; i < Math.max(baseOut.length, curOut.length); i++) if (baseOut[i] !== curOut[i]) { firstDiff = i; break; }
    t('EC2·Upstash 호출 순서·대상·키·타임아웃 유무·반환값이 전부 같다', firstDiff === -1,
        firstDiff >= 0 ? `첫 차이 ${firstDiff}행: 기준 «${baseOut[firstDiff]}» vs 현재 «${curOut[firstDiff]}»` : '');
    if (!process.argv[2]) fs.unlinkSync(basePath);

    // ── ② 통계
    console.log('── ② 통계([RedisStats] 한 줄)');
    // 시나리오가 가짜 시계를 60초 넘게 돌렸으므로 창이 이미 몇 번 넘어갔을 수 있다 → 모든 줄을 합산해서 본다
    silence(); console.log = (...a: any[]) => { const s = a.join(' '); if (s.startsWith('[RedisStats] ')) statLines.push(s); };
    Cur._obsFlushForTest();
    restore();
    const lines = statLines.map((s) => JSON.parse(s.slice('[RedisStats] '.length)));
    t('한 줄 이상 나왔다·형식 v1', lines.length >= 1 && lines.every((l) => l.v === 1 && typeof l.inst === 'string'));
    const sum = (f: (l: any) => number) => lines.reduce((a, l) => a + (f(l) || 0), 0);
    if (!fixMode) {
        t('EC2 GET: 적중 3(값 2·깨짐 1)·미스 5·타임아웃 1·HTTP 1·네트워크 1', sum((l) => l.ec.get?.hit) === 3 && sum((l) => l.ec.get?.miss) === 5 && sum((l) => l.ec.get?.timeout) === 1 && sum((l) => l.ec.get?.http) === 1 && sum((l) => l.ec.get?.neterr) === 1,
            JSON.stringify(lines.map((l) => l.ec.get)));
        t('EC2 MGET: 타임아웃 1·네트워크 1·HTTP 1·깨짐 1', sum((l) => l.ec.mget?.timeout) === 1 && sum((l) => l.ec.mget?.neterr) === 1 && sum((l) => l.ec.mget?.http) === 1 && sum((l) => l.ec.mget?.moji) === 1, JSON.stringify(lines.map((l) => l.ec.mget)));
        t('Upstash MGET 사유: fill·moji·ecErr·cooldown', ['fill', 'moji', 'ecErr', 'cooldown'].every((k) => sum((l) => l.up.mget[k]) >= 1), JSON.stringify(lines.map((l) => l.up.mget)));
        t('깨진 값(moji)을 따로 셌다', sum((l) => l.ec.get?.moji) === 1, JSON.stringify(lines.map((l) => l.ec.get)));
        t('EC2 SET: 타임아웃 1·네트워크 1·HTTP 1', sum((l) => l.ec.set?.timeout) === 1 && sum((l) => l.ec.set?.neterr) === 1 && sum((l) => l.ec.set?.http) === 1, JSON.stringify(lines.map((l) => l.ec.set)));
        t('Upstash GET 사유: cooldown·ecErr·moji·policy 가 모두 잡힌다', ['cooldown', 'ecErr', 'moji', 'policy'].every((k) => sum((l) => l.up.get[k]) >= 1), JSON.stringify(lines.map((l) => l.up.get)));
        t('Upstash SET 사유: ecFail 3(타임아웃·네트워크·500)·cooldown 1·replicate ≥3', sum((l) => l.up.set.ecFail) === 3 && sum((l) => l.up.set.cooldown) === 1 && sum((l) => l.up.set.replicate) >= 3, JSON.stringify(lines.map((l) => l.up.set)));
        t('쿨다운 진입 3회(타임아웃·401·네트워크) 사유별', sum((l) => l.trips) === 3 && sum((l) => l.tripWhy?.timeout) === 1 && sum((l) => l.tripWhy?.['HTTP 401']) === 1 && sum((l) => l.tripWhy?.neterr) === 1, JSON.stringify(lines.map((l) => [l.trips, l.tripWhy])));
        t('쿨다운 시간(cdMs)을 잰다', sum((l) => l.cdMs) >= 30_000, JSON.stringify(lines.map((l) => l.cdMs)));
    } else {
        // 수리 판 — 정상 경로만 흘렸다(장애 경로 통계는 test-redis-reliability.ts 가 실제 타임아웃으로 본다)
        t('EC2 GET: 적중 2(값 1·깨짐 1)·미스 2·실패 0', sum((l) => l.ec.get?.hit) === 2 && sum((l) => l.ec.get?.miss) === 2 && !sum((l) => (l.ec.get?.timeout || 0) + (l.ec.get?.neterr || 0) + (l.ec.get?.http || 0)), JSON.stringify(lines.map((l) => l.ec.get)));
        t('EC2 MGET: 깨짐 1·HTTP 1', sum((l) => l.ec.mget?.moji) === 1 && sum((l) => l.ec.mget?.http) === 1, JSON.stringify(lines.map((l) => l.ec.mget)));
        t('Upstash 사유: GET policy·moji / MGET fill·moji·ecErr / SET replicate ≥3', ['policy', 'moji'].every((k) => sum((l) => l.up.get[k]) >= 1) && ['fill', 'moji', 'ecErr'].every((k) => sum((l) => l.up.mget[k]) >= 1) && sum((l) => l.up.set.replicate) >= 3, JSON.stringify(lines.map((l) => l.up)));
        t('정상 경로에선 차단 0', sum((l) => l.trips) === 0, JSON.stringify(lines.map((l) => l.trips)));
    }
    t('이벤트 루프 지연(loop)이 실린다', lines.some((l) => l.loop && typeof l.loop.p99 === 'number'));
    t('창별 CPU 사용(cpuMs)·루프 활용도(elu)가 실린다(일시정지 vs 과부하 판별)', lines.some((l) => typeof l.cpuMs === 'number' && typeof l.elu === 'number'));
    t('값·키 내용은 싣지 않는다(키 이름 0회)', !statLines.join('\n').includes('intrinio:resp') && !statLines.join('\n').includes('guardian:snapshot'));
    console.log(fails ? `\n✗ 실패 ${fails}` : '\n✓ 전부 통과');
    process.exit(fails ? 1 : 0);
})();
