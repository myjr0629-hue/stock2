// 정책 고정 테스트 — `npx tsx scripts/test-redis-policy.ts`
// ① 순수 정책 함수 ② fetch 를 가로채 EC2 프록시·Upstash 호출 수를 세는 통합 테스트
//    (Upstash 모의 서버는 실제 REST 와 같이 «문자열 저장 + base64 응답 인코딩» 을 흉내낸다)
process.env.EC2_REDIS_PROXY_URL = 'http://ec2.test';
process.env.EC2_REDIS_PROXY_KEY = 'k';
process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 't';
type Mode = 'ok-null' | 'ok-value' | 'http-401' | 'timeout' | 'mojibake';
let ecMode: Mode = 'ok-null';
const calls = { ecGet: 0, ecMget: 0, ecSet: 0, upGet: 0, upSet: 0, upMget: 0, upOther: 0 };
const upstore = new Map<string, string>();
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
(globalThis as any).fetch = async (input: any, init?: any) => {
    const url = String(input);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
    if (url.startsWith('http://ec2.test')) {
        if (url.includes('/mget')) { calls.ecMget++; const n = decodeURIComponent(url.split('keys=')[1]).split(',').length; return json({ results: Array(n).fill(null) }); }
        if (url.includes('/get')) { calls.ecGet++;
            if (ecMode === 'timeout') throw new Error('timeout');
            if (ecMode === 'http-401') return json({ error: 'Unauthorized' }, 401);
            if (ecMode === 'mojibake') return json({ result: '�깨짐' });
            return json({ result: ecMode === 'ok-value' ? { v: 1 } : null }); }
        if (url.includes('/set')) { calls.ecSet++; return json({ ok: true }); }
    }
    if (url.startsWith('https://upstash.test')) {
        const h = Object.fromEntries(Object.entries(init?.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
        const enc = h['upstash-encoding'] === 'base64' ? (s: string | null) => (s === null ? null : b64(s)) : (s: string | null) => s;
        const body = JSON.parse(init?.body || '[]'); const cmds: any[][] = Array.isArray(body[0]) ? body : [body];
        const out = cmds.map((c) => { const op = String(c[0]).toUpperCase();
            if (op === 'GET') { calls.upGet++; return { result: enc(upstore.get(c[1]) ?? null) }; }
            if (op === 'SETEX') { calls.upSet++; upstore.set(c[1], String(c[3])); return { result: 'OK' }; }
            if (op === 'SET') { calls.upSet++; upstore.set(c[1], String(c[2])); return { result: 'OK' }; }
            if (op === 'MGET') { calls.upMget++; return { result: c.slice(1).map((k: string) => enc(upstore.get(k) ?? null)) }; }
            calls.upOther++; return { result: null }; });
        return json(url.endsWith('/pipeline') ? out : out[0]);
    }
    throw new Error('unexpected fetch ' + url);
};
(async () => {
const R = await import('../src/services/redisClient');
let fails = 0; const t = (name: string, cond: boolean, extra = '') => { console.log((cond ? '✓ ' : '✗ ') + name + (cond ? '' : `   ← ${extra || JSON.stringify(calls)}`)); if (!cond) fails++; };
const reset = () => { for (const k of Object.keys(calls)) (calls as any)[k] = 0; R._resetReplicateThrottle(); };
console.log('── ① 순수 정책 함수');
t('내구 키(TTL 없음)는 복제', R.decideReplicate('mkt:killswitch', undefined, true) === 'replicate');
t('래퍼 캐시 키(TTL)는 복제 생략', R.decideReplicate('intrinio:resp:v1:x', 60, true) === 'skip');
t('장애-필수 접두사는 복제', R.decideReplicate('guardian:snapshot:ko', 300, true) === 'replicate');
t('EC2 쓰기 실패면 복제', R.decideReplicate('intrinio:resp:v1:x', 60, false) === 'replicate');
t('lastgood 첫 쓰기는 복제', R.decideReplicate('flow:ticker:lastgood:v2:NVDA', 43200, true, 1000) === 'replicate');
t('lastgood 5분 안 재쓰기는 스로틀', R.decideReplicate('flow:ticker:lastgood:v2:NVDA', 43200, true, 1000 + 60_000) === 'throttled');
t('lastgood 5분 후는 복제', R.decideReplicate('flow:ticker:lastgood:v2:NVDA', 43200, true, 1000 + 301_000) === 'replicate');
t('스로틀은 키별(다른 티커는 독립)', R.decideReplicate('flow:ticker:lastgood:v2:AAPL', 43200, true, 1000 + 60_000) === 'replicate');
t('EC2 비권위(죽음)면 무조건 폴백', R.shouldFallbackToUpstash('intrinio:resp:v1:x', false) === true);
t('EC2 권위 미스 + 래퍼 키 → 폴백 안 함', R.shouldFallbackToUpstash('intrinio:resp:v1:x', true) === false);
t('EC2 권위 미스 + cache:13f → 폴백', R.shouldFallbackToUpstash('cache:13f:cusip:1', true) === true);
t('EC2 권위 미스 + push: → 폴백', R.shouldFallbackToUpstash('push:tokens:abc', true) === true);
t('EC2 권위 미스 + 복제 접두사(guardian:) → 폴백', R.shouldFallbackToUpstash('guardian:snapshot:ko', true) === true);
console.log('── ② 읽기 (EC2 정상)');
reset(); ecMode = 'ok-null'; await R.getFromCache('intrinio:resp:v1:x');
t('EC2 정상 null + 래퍼 키 → Upstash GET 0회', calls.upGet === 0 && calls.ecGet === 1);
reset(); upstore.set('cache:13f:cusip:1', JSON.stringify({ a: 1 })); const v13 = await R.getFromCache<any>('cache:13f:cusip:1');
t('EC2 정상 null + cache:13f → Upstash GET 1회·값 반환', calls.upGet === 1 && v13?.a === 1, JSON.stringify(v13));
reset(); ecMode = 'ok-value'; const vv = await R.getFromCache<any>('intrinio:resp:v1:x');
t('EC2 값 있음 → Upstash 0회', calls.upGet === 0 && vv?.v === 1);
reset(); ecMode = 'mojibake'; upstore.set('guardian:snapshot:ja', JSON.stringify({ clean: true })); const mj = await R.getFromCache<any>('guardian:snapshot:ja');
t('EC2 값이 깨졌으면 → Upstash 깨끗한 사본(예전과 동일)', calls.upGet === 1 && mj?.clean === true, JSON.stringify(mj));
reset(); ecMode = 'ok-null'; const mg = await R.mgetFromCache<any>(['intrinio:resp:v1:a', 'cache:13f:cusip:1']);
t('mget: EC2 전부 null → Upstash 엔 cache:13f 하나만 묻고 채운다', calls.ecMget === 1 && calls.upMget === 1 && mg[0] === null && mg[1]?.a === 1, JSON.stringify(mg));
reset(); const mg2 = await R.mgetFromCache<any>(['intrinio:resp:v1:a', 'intrinio:resp:v1:b']);
t('mget: 래퍼 키만이면 Upstash 0회', calls.upMget === 0 && mg2.every((x) => x === null));
console.log('── ③ 쓰기 (EC2 정상)');
reset(); await R.setInCache('intrinio:resp:v1:x', { v: 1 }, 60);
t('래퍼 캐시 키 쓰기 → EC2 1회·Upstash 0회', calls.ecSet === 1 && calls.upSet === 0);
reset(); await R.setInCache('guardian:snapshot:ko', { v: 1 }, 300);
t('장애-필수 키 쓰기 → EC2 1회·Upstash SETEX 1회', calls.ecSet === 1 && calls.upSet === 1);
reset(); await R.setInCache('mkt:killswitch', { on: true });
t('내구 키(TTL 없음) 쓰기 → Upstash SET 1회', calls.upSet === 1);
reset(); await R.setInCache('flow:ticker:lastgood:v2:NVDA', { big: 1 }, 43200); await R.setInCache('flow:ticker:lastgood:v2:NVDA', { big: 2 }, 43200);
t('lastgood 연속 2회 → EC2 2회·Upstash 1회(스로틀)', calls.ecSet === 2 && calls.upSet === 1);
t('스로틀돼도 setInCache 는 true(EC2 성공)', await R.setInCache('flow:ticker:lastgood:v2:NVDA', { big: 3 }, 43200) === true);
t('null 은 여전히 차단', await R.setInCache('x', null as any, 10) === false);
console.log('── ④ EC2 장애 (쿨다운) — 마지막에 둔다');
reset(); ecMode = 'http-401'; upstore.set('intrinio:resp:v1:x', JSON.stringify({ u: 1 })); const v401 = await R.getFromCache<any>('intrinio:resp:v1:x');
t('EC2 401 → 비권위 → Upstash 폴백(예전과 동일)', calls.upGet === 1 && v401?.u === 1, JSON.stringify(v401));
reset(); ecMode = 'ok-value'; await R.getFromCache('anything');
t('쿨다운 30초 동안 EC2 호출 생략 · Upstash 로(예전과 동일)', calls.ecGet === 0 && calls.upGet === 1);
reset(); await R.setInCache('intrinio:resp:v1:x', { v: 9 }, 60);
t('쿨다운 중 쓰기 → EC2 0회·Upstash 1회(EC2 실패 시 복제 = 예전과 동일)', calls.ecSet === 0 && calls.upSet === 1);
console.log(fails ? `\n✗ 실패 ${fails}건` : '\n✓ 전부 통과'); process.exit(fails ? 1 : 0);
})();
