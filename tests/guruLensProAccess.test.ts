/** 대가 렌즈 서버 PRO 판정 — 관문 4회(10/21) 재현 전부. 메모리 저장소·합성 공급사만, 실제 네트워크·운영 쓰기 0. */
import assert from 'node:assert/strict';
import {
    createGuruProAccess, LIMIT_GLOBAL, LIMIT_PER_IP, NEGATIVE_SEC, POSITIVE_MAX_SEC, type ProAccessStore,
} from '../src/lib/guruLens/proAccess';

globalThis.fetch = async () => { throw new Error('실제 네트워크 금지'); };
let now = Date.parse('2026-10-21T01:00:00Z');
const clock = () => now;
const flush = () => new Promise(r => setImmediate(r));

/** Upstash 와 같은 의미의 메모리 저장소(인스턴스 사이 공유). */
function memoryStore() {
    const data = new Map<string, { v: unknown; until: number }>();
    let broken: 'throw' | 'hang' | null = null;
    const live = (k: string) => { const e = data.get(k); if (e && e.until > now) return e; data.delete(k); return undefined; };
    const guard = async () => {
        if (broken === 'throw') throw new Error('합성 저장소 장애');
        if (broken === 'hang') await new Promise(() => {});
    };
    const store: ProAccessStore & { data: typeof data; break(b: typeof broken): void; ttl(k: string): number } = {
        data,
        break(b) { broken = b; },
        ttl: k => Math.round(((live(k)?.until ?? now) - now) / 1000),
        async get(k) { await guard(); const v = live(k)?.v; return v === '1' ? 1 : v === '0' ? 0 : v ?? null; },
        async set(k, v, ttl) { await guard(); data.set(k, { v, until: now + ttl * 1000 }); return 'OK'; },
        async incr(keys, ttl) {
            await guard();
            return keys.map(k => { const n = Number(live(k)?.v ?? 0) + 1; data.set(k, { v: n, until: now + ttl * 1000 }); return n; });
        },
    };
    return store;
}

const ent = (exp: string | null, extra: object = {}) => ({ subscriber: { entitlements: { pro: { expires_date: exp, purchase_date: '2026-10-01T00:00:00Z', ...extra } } } });
const PRO_ID = '$RCAnonymousID:' + 'a'.repeat(32);
const FREE_ID = '$RCAnonymousID:' + 'b'.repeat(32);
const anon = (i: number) => '$RCAnonymousID:' + i.toString(16).padStart(32, '0');

function provider(answer: (id: string) => Response | Promise<Response>) {
    const calls: { id: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
        const id = decodeURIComponent(String(url).split('/subscribers/')[1]);
        calls.push({ id, init });
        return answer(id);
    }) as unknown as typeof fetch;
    return { calls, fetchImpl };
}
const keys = { ios: 'appl_fixture', android: 'goog_fixture' };
const standard = (id: string) => Response.json(id === PRO_ID ? ent('2026-11-12T08:56:44Z') : { subscriber: { entitlements: {} } });

async function main() {
    // ① 형식이 틀린 ID 는 공급사 0회
    {
        const p = provider(standard);
        const access = createGuruProAccess({ store: memoryStore(), keys, fetchImpl: p.fetchImpl, now: clock });
        for (const id of ['bad/id', 'short', '$RCAnonymousID:invalid', '', null])
            assert.deepEqual(await access(id as any, { ip: '1.1.1.1' }), { pro: false, via: 'invalid' });
        assert.equal(p.calls.length, 0);
    }
    // ② (관문 10211030) 같은 ID 동시 24건 → 공급사 1회 · 서로 다른 ID 24개(같은 IP) → IP 예산까지만
    {
        const p = provider(async id => { await flush(); return standard(id); });
        const store = memoryStore();
        const access = createGuruProAccess({ store, keys, fetchImpl: p.fetchImpl, now: clock });
        const same = await Promise.all(Array.from({ length: 24 }, () => access(PRO_ID, { ip: '2.2.2.2' })));
        assert.ok(same.every(d => d.pro));
        assert.equal(p.calls.length, 1, '같은 ID 동시 요청은 1회로 합친다');
        assert.equal(p.calls[0].init.method, 'GET');
        assert.equal(p.calls[0].init.cache, 'no-store');
        assert.equal((p.calls[0].init.headers as any).Authorization, 'Bearer appl_fixture');
        const many = await Promise.all(Array.from({ length: 24 }, (_, i) => access(anon(i), { ip: '3.3.3.3' })));
        assert.equal(p.calls.length - 1, LIMIT_PER_IP, `다른 ID 24개도 IP 예산 ${LIMIT_PER_IP}회까지만 공급사`);
        assert.equal(many.filter(d => d.via === 'limited').length, 24 - LIMIT_PER_IP);
        assert.ok(many.every(d => !d.pro));
        // 음성 판정은 60초 저장 — 같은 ID 반복은 공급사·예산 0
        const before = p.calls.length;
        assert.deepEqual(await access(anon(0), { ip: '9.9.9.9' }), { pro: false, via: 'denied' });
        assert.equal(p.calls.length, before);
    }
    // ③ (관문 10211120·10211252) 전역 예산을 익명이 다 써도, 확인된 PRO 는 «새 인스턴스»에서도 통과 — 저장된 양성은 예산·공급사를 거치지 않는다
    {
        const p = provider(standard);
        const store = memoryStore();
        const instanceA = createGuruProAccess({ store, keys, fetchImpl: p.fetchImpl, now: clock });
        assert.deepEqual(await instanceA(PRO_ID, { ip: '4.4.4.4' }), { pro: true, via: 'provider' });
        for (let i = 0; i < LIMIT_GLOBAL + 30; i++) await instanceA(anon(1000 + i), { ip: `10.0.${i >> 8}.${i & 255}` });
        const reads = p.calls.length;
        assert.equal(reads, LIMIT_GLOBAL, `전역 예산(${LIMIT_GLOBAL}/10분) 밖 공급사 호출 0`);
        assert.equal((await instanceA(anon(5000), { ip: '5.5.5.5' })).via, 'limited', '예산 소진 확인');
        const instanceB = createGuruProAccess({ store, keys, fetchImpl: p.fetchImpl, now: clock });
        assert.deepEqual(await instanceB(PRO_ID, { ip: '6.6.6.6' }), { pro: true, via: 'cache' }, '새 인스턴스·예산 소진에도 기존 PRO 유지');
        assert.equal(p.calls.length, reads, '저장된 PRO 는 공급사 0회');
        // 양성 수명 = 권한 만료와 6시간 중 이른 쪽
        const posKey = [...store.data.keys()].find(k => k.startsWith('gl:pro:v1:') && store.data.get(k)!.v === '1')!;
        assert.equal(store.ttl(posKey), POSITIVE_MAX_SEC);
        // 다음 창에서는 새 ID 도 다시 확인된다
        now += 11 * 60_000;
        assert.equal((await instanceB(FREE_ID, { ip: '7.7.7.7' })).via, 'denied');
        now -= 11 * 60_000;
    }
    // ④ 양성 수명은 권한 만료를 넘지 않는다 · 음성은 60초 뒤 재확인(방금 결제한 사람)
    {
        let paid = false;
        const p = provider(id => Response.json(id === PRO_ID ? ent(new Date(now + 3600_000).toISOString()) : paid ? ent('2026-11-30T00:00:00Z') : { subscriber: { entitlements: {} } }));
        const store = memoryStore();
        const access = createGuruProAccess({ store, keys, fetchImpl: p.fetchImpl, now: clock });
        await access(PRO_ID, { ip: '1.2.3.4' });
        const k = [...store.data.keys()].find(k => k.startsWith('gl:pro:v1:'))!;
        assert.equal(store.ttl(k), 3600, '만료 1시간 남은 권한은 1시간만 저장');
        assert.equal((await access(FREE_ID, { ip: '1.2.3.4' })).pro, false);
        paid = true;
        assert.equal((await access(FREE_ID, { ip: '1.2.3.4' })).via, 'denied', '60초 음성 저장');
        now += (NEGATIVE_SEC + 1) * 1000;
        assert.deepEqual(await access(FREE_ID, { ip: '1.2.3.4' }), { pro: true, via: 'provider' }, '음성 만료 뒤 결제 반영');
        now -= (NEGATIVE_SEC + 1) * 1000;
    }
    // ⑤ (관문 10211120 P2) 헤더 뒤 본문만 멈춰도 시간 제한이 끝낸다 — 취소·합치기 해제·다음 요청 진행
    {
        let aborts = 0, hang = true;
        const p = provider(async id => {
            if (!hang) return standard(id);
            const call = p.calls.at(-1)!;
            (call.init.signal as AbortSignal).addEventListener('abort', () => aborts++);
            return { ok: true, status: 200, json: () => new Promise(() => {}) } as unknown as Response;
        });
        const access = createGuruProAccess({ store: memoryStore(), keys, fetchImpl: p.fetchImpl, now: clock, timeoutMs: 20 });
        const t0 = Date.now();
        const results = await Promise.all([1, 2, 3, 4].map(i => access(anon(200 + i), { ip: '8.8.8.8' })));
        assert.ok(Date.now() - t0 < 500, '20ms 제한 모형이 500ms 안에 끝난다');
        assert.equal(aborts, 4, '본문 대기 4건 모두 취소');
        assert.ok(results.every(r => r.via === 'provider_unavailable'));
        hang = false;
        assert.deepEqual(await access(PRO_ID, { ip: '8.8.8.8' }), { pro: true, via: 'provider' }, '다섯 번째 조회 정상 시작');
    }
    // ⑥ 공급사 상태별: 429·404·400 은 잠금, 장애(5xx·401·설정 없음·통신 실패)는 PRO 를 잠그지 않되 저장하지 않는다
    {
        for (const [status, pro, via] of [[429, false, 'limited'], [404, false, 'denied'], [400, false, 'denied'],
            [500, true, 'provider_unavailable'], [503, true, 'provider_unavailable'], [401, true, 'provider_unavailable']] as const) {
            const store = memoryStore();
            const p = provider(() => new Response('{}', { status }));
            const access = createGuruProAccess({ store, keys, fetchImpl: p.fetchImpl, now: clock });
            assert.deepEqual(await access(PRO_ID, { ip: '1.1.1.1' }), { pro, via }, `상태 ${status}`);
            assert.equal([...store.data.keys()].filter(k => k.startsWith('gl:pro:')).length, status === 404 || status === 400 ? 1 : 0);
        }
        const offline = createGuruProAccess({ store: memoryStore(), keys, now: clock,
            fetchImpl: (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch });
        assert.deepEqual(await offline(PRO_ID, { ip: null }), { pro: true, via: 'provider_unavailable' });
        const unconfigured = createGuruProAccess({ store: memoryStore(), keys: {}, now: clock, fetchImpl: provider(standard).fetchImpl });
        assert.deepEqual(await unconfigured(PRO_ID, { ip: null }), { pro: true, via: 'provider_unavailable' });
        const malformed = createGuruProAccess({ store: memoryStore(), keys, now: clock, fetchImpl: provider(() => Response.json({ nope: 1 })).fetchImpl });
        assert.equal((await malformed(PRO_ID, { ip: null })).via, 'provider_unavailable');
        // 만료된 권한·빈 권한은 비활성
        const expired = createGuruProAccess({ store: memoryStore(), keys, now: clock, fetchImpl: provider(() => Response.json(ent('2026-10-20T00:00:00Z'))).fetchImpl });
        assert.equal((await expired(PRO_ID, { ip: null })).pro, false);
        const grace = createGuruProAccess({ store: memoryStore(), keys, now: clock,
            fetchImpl: provider(() => Response.json(ent('2026-10-20T00:00:00Z', { grace_period_expires_date: '2026-10-25T00:00:00Z' }))).fetchImpl });
        assert.equal((await grace(PRO_ID, { ip: null })).pro, true, '유예 기간은 활성');
    }
    // ⑦ 저장소 장애(예외·무응답)에도 요청은 붙잡히지 않고, 인스턴스 예산으로 제한이 이어진다
    {
        for (const mode of ['throw', 'hang'] as const) {
            const store = memoryStore();
            store.break(mode);
            const p = provider(standard);
            const access = createGuruProAccess({ store, keys, fetchImpl: p.fetchImpl, now: clock, storeTimeoutMs: 10 });
            assert.deepEqual(await access(PRO_ID, { ip: '1.1.1.1' }), { pro: true, via: 'provider' }, `저장소 ${mode}: PRO 확인`);
            const r = [];
            for (let i = 0; i < LIMIT_PER_IP + 5; i++) r.push(await access(anon(300 + i), { ip: '2.2.2.2' }));
            assert.equal(r.filter(d => d.via === 'limited').length, 5, `저장소 ${mode}: 인스턴스 IP 예산`);
        }
        const noStore = createGuruProAccess({ store: null, keys, fetchImpl: provider(standard).fetchImpl, now: clock });
        assert.equal((await noStore(PRO_ID, { ip: null })).pro, true);
    }
    console.log('대가 렌즈 서버 PRO 판정: 관문 4회 재현(무제한 조회·전역 예산 차단·본문 시간 제한·새 인스턴스 차단) + 상태별·저장소 장애 통과');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
