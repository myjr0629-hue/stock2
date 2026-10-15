/** 확정 계산 공정 순번·저장 완료·호출 상한. 외부 I/O 없는 독립 VM/저장소/시계. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import * as calendar from '../src/lib/marketCalendar';

const D = '2026-10-14';
const symbols = ['BAC', 'MS', 'BLK', 'PGR', 'FAST', 'STT', 'HOMB'];
const key = (s: string, kind = 'pre', date = D) => `ext:close:v1:${kind}:${s}:${date}`;
const trade = { price: 206.98, time: `${D}T13:30:01.440Z`, source: 'utp_delayed' };
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/extendedSessionClose.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const lastSessionSource = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/lastSession.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(r => { resolve = r; });
    return { promise, resolve };
}
function harness() {
    let now = Date.parse(`${D}T14:02:00Z`);
    const store = new Map<string, { value: any; expiry: number }>();
    const attempts: string[] = [], warnings: string[] = [];
    let active = 0, peak = 0;
    const behavior = new Map<string, 'error' | 'pending' | 'none'>();
    let vendorGate: Promise<void> | null = null;
    let writeGate: Promise<void> | null = null;
    let failClaim = false, failWrite = false;
    let hasKey = true, historyDate: string | null = D;
    const historyCalls: string[] = [];
    const get = (k: string) => {
        const entry = store.get(k);
        return entry && entry.expiry > now ? entry.value : null;
    };
    const put = (k: string, value: any, ttl = 3600) => { store.set(k, { value, expiry: now + ttl * 1000 }); };
    class ClockDate extends Date { static now() { return now; } }
    const deps = {
        'next/server': { after: () => {} },
        '@/lib/marketCalendar': calendar,
        './redisClient': {
            getFromCache: async (k: string) => get(k),
            mgetFromCache: async (keys: string[]) => keys.map(get),
            setInCache: async (k: string, value: any, ttl: number) => {
                if (k.endsWith(':claim')) { if (failClaim) return false; }
                else { if (writeGate) await writeGate; if (failWrite) return false; }
                put(k, value, ttl); return true;
            },
        },
        './intrinioClient': {
            hasIntrinioKey: () => hasKey,
            getLastExtendedTradeIntrinio: async (s: string, date: string, start: string, end: string, opts: any) => {
                assert.equal(opts.maxPages, 3);
                assert.deepEqual([start, end, opts.pageSize], start === '04:00:00'
                    ? ['04:00:00', '09:30:03', 5000] : ['16:00:00', '20:00:03', 500]);
                attempts.push(s); active++; peak = Math.max(peak, active);
                try {
                    if (vendorGate) await vendorGate;
                    if (behavior.get(s) === 'error') throw new Error('simulated vendor failure');
                    if (behavior.get(s) === 'pending') return undefined;
                    if (behavior.get(s) === 'none') return null;
                    return { ...trade, time: trade.time.replace(D, date) };
                } finally { active--; }
            },
        },
    };
    const load = (code: string, dependencies: Record<string, unknown>) => {
        const exports = {};
        const context = vm.createContext({ exports, module: { exports }, Date: ClockDate,
            // 선점 대기 5회는 가상 타이머로 즉시 진행한다. wall-clock/TTL 은 별도 제어.
            setTimeout: (fn: () => void) => setTimeout(fn, 0), clearTimeout,
            console: { warn: (s: string) => warnings.push(s) },
            require: (name: string) => { assert.ok(name in dependencies); return dependencies[name]; },
        });
        vm.runInContext(code, context);
        return context.module.exports;
    };
    const fresh = () => {
        return load(source, deps) as typeof import('../src/services/extendedSessionClose');
    };
    const svc = fresh();
    const lastSession = load(lastSessionSource, {
        '@/services/redisClient': deps['./redisClient'],
        '@/services/extendedSessionClose': svc,
        '@/services/massiveClient': {
            CACHE_POLICY: { LIVE: {} },
            fetchMassive: async (url: string) => {
                historyCalls.push(url);
                return { results: [{ c: 200, t: historyDate ? Date.parse(`${historyDate}T13:30:00Z`) : undefined }, { c: 190 }] };
            },
        },
    }) as typeof import('../src/services/lastSession');
    const request = async (list = symbols, max = 3, kind: 'pre' | 'post' = 'pre', date = D) => {
        const before = attempts.length;
        const result = await svc.peekExtendedSessionClosesAndWarm(list, date, kind, max);
        await result.warm;
        assert.ok(attempts.length - before <= Math.max(0, max), '요청당 계산 상한');
        return result.values;
    };
    return { svc, fresh, lastSession, historyCalls, attempts, warnings, behavior, get, put, request,
        advance: (ms: number) => { now += ms; },
        time: (iso: string) => { now = Date.parse(iso); },
        vendorGate: (p: Promise<void> | null) => { vendorGate = p; },
        writeGate: (p: Promise<void> | null) => { writeGate = p; },
        failClaim: (v: boolean) => { failClaim = v; }, failWrite: (v: boolean) => { failWrite = v; },
        hasKey: (v: boolean) => { hasKey = v; }, historyDate: (v: string | null) => { historyDate = v; },
        peak: () => peak,
    };
}

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
    await fn(); passed++; console.log(`✓ ${name}`);
}
(async () => {
    for (const kind of ['pre', 'post'] as const) {
        await test(`${kind}: 7종목 / 요청당 3개 → 3회 계산, 4번째 응답 전부 확정`, async () => {
            const h = harness(); h.time(`${D}T${kind === 'pre' ? '14:02' : '00:18'}:00Z`);
            if (kind === 'post') h.time('2026-10-15T00:18:00Z');
            for (const expected of [3, 6, 7]) {
                await h.request(symbols, 3, kind); assert.equal(h.attempts.length, expected);
            }
            const values = await h.request(symbols, 3, kind);
            assert.ok(values.every(v => v?.price === 206.98));
            assert.equal(h.attempts.length, 7); assert.equal(h.peak(), 1);
        });
    }
    await test('실패·페이지 상한·선점 대기 앞 3종목 → 뒤 4종목은 3회 안에 확정', async () => {
        // 기존 고정 앞 3개 선정식 대조. 61초 간격으로 쿨다운을 지나도 뒤 종목은 못 간다.
        const old = harness();
        old.behavior.set('BAC', 'error'); old.behavior.set('MS', 'pending'); old.put(`${key('BLK')}:claim`, 1);
        for (let i = 0; i < 3; i++) {
            const values = await old.svc.peekExtendedSessionCloses(symbols, D, 'pre');
            for (const s of symbols.filter((_, j) => values[j] === undefined).slice(0, 3)) {
                await old.svc.getExtendedSessionClose(s, D, 'pre');
            }
            old.advance(61_000);
        }
        assert.equal(old.attempts.length, 6);
        assert.ok(symbols.slice(3).every(s => old.get(key(s)) === null));
        const h = harness();
        h.behavior.set('BAC', 'error'); h.behavior.set('MS', 'pending');
        h.put(`${key('BLK')}:claim`, 1);
        for (let i = 0; i < 3; i++) { await h.request(); h.advance(61_000); }
        for (const s of symbols.slice(3)) assert.equal(h.get(key(s))?.p, 206.98, s);
        assert.deepEqual(h.attempts.slice(0, 5), ['BAC', 'MS', 'PGR', 'FAST', 'STT']);
        assert.equal(h.attempts.length, 8, '3요청의 최대 9계산 이내: 실패 4 + 뒤 종목 성공 4');
        assert.equal(h.get(key('MS')), null, '페이지 상한은 체결 없음으로 저장하지 않음');
    });
    await test('모든 종목 실패해도 첫 순회에서 7종목 모두 기회·복구 뒤 전부 확정', async () => {
        const h = harness(); symbols.forEach(s => h.behavior.set(s, 'error'));
        for (let i = 0; i < 3; i++) { await h.request(); h.advance(61_000); }
        assert.deepEqual(h.attempts.slice(0, 7), symbols);
        h.behavior.clear();
        for (let i = 0; i < 3; i++) await h.request();
        assert.ok((await h.request()).every(v => v?.price === 206.98));
    });
    await test('겹치는 동시 목록·단일 조회 합계 동시 계산 ≤3, 같은 종목 중복 없음', async () => {
        const h = harness(), gate = deferred(); h.vendorGate(gate.promise);
        const batches = await Promise.all(Array.from({ length: 6 }, () => h.svc.peekExtendedSessionClosesAndWarm(symbols, D, 'pre', 3)));
        const direct = symbols.map(s => h.svc.getExtendedSessionClose(s, D, 'pre'));
        await turn(); assert.ok(h.peak() <= 3); assert.equal(new Set(h.attempts).size, h.attempts.length);
        gate.resolve(); await Promise.all([...batches.map(b => b.warm), ...direct]);
        for (let i = 0; i < 3; i++) await h.request();
        assert.ok((await h.request()).every(v => v?.price === 206.98));
        assert.equal(h.attempts.length, 7); assert.ok(h.peak() <= 3);
    });
    await test('독립 인스턴스가 기존 선점을 보면 공급사 중복 호출 없음', async () => {
        const h = harness(), gate = deferred(); h.vendorGate(gate.promise);
        const first = h.svc.getExtendedSessionClose('PGR', D, 'pre');
        await turn();
        assert.equal(await h.fresh().getExtendedSessionClose('PGR', D, 'pre'), undefined);
        assert.equal(h.attempts.length, 1); gate.resolve(); await first;
    });
    for (const none of [false, true]) {
        await test(`${none ? '체결 없음' : '확정값'} 저장 완료 전 warm 종료 금지·다음 읽기 반영`, async () => {
            const h = harness(), gate = deferred(); h.writeGate(gate.promise);
            if (none) h.behavior.set('PGR', 'none');
            const result = await h.svc.peekExtendedSessionClosesAndWarm(['PGR'], D, 'pre', 3);
            let done = false; const pending = result.warm!.then(() => { done = true; });
            await turn(); assert.equal(done, false); assert.equal(result.values[0], undefined);
            gate.resolve(); await pending;
            const values = await h.svc.peekExtendedSessionCloses(['PGR'], D, 'pre');
            assert.equal(none ? values[0] : values[0]?.price, none ? null : 206.98);
            assert.equal(h.get(key('PGR'))?.none === true, none);
        });
        await test(`${none ? '체결 없음' : '확정값'} 저장 false 감지·재시도 억제·복구`, async () => {
            const h = harness(); h.failWrite(true);
            if (none) h.behavior.set('PGR', 'none');
            await h.request(['PGR']); await h.request(['PGR']);
            assert.equal(h.get(key('PGR')), null); assert.equal(h.attempts.length, 1);
            assert.equal(h.warnings.length, 1);
            h.failWrite(false); h.advance(61_000); await h.request(['PGR']);
            assert.ok(h.get(key('PGR'))); assert.equal(h.attempts.length, 2);
        });
    }
    await test('선점 쓰기 실패 시 공급사 호출 0', async () => {
        const h = harness(); h.failClaim(true); await h.request();
        assert.equal(h.attempts.length, 0); assert.equal(h.warnings.length, 3);
    });
    await test('확정 허용 전·주말·warmMax=0·중복 심볼은 호출을 늘리지 않음', async () => {
        const h = harness(); h.time(`${D}T13:46:59Z`); await h.request();
        assert.equal(h.attempts.length, 0); h.time(`${D}T13:47:00Z`);
        await h.request(symbols, 0); await h.request(symbols, 3, 'pre', '2026-10-10');
        assert.equal(h.attempts.length, 0);
        await h.request(['pgr', 'PGR', 'BAC'], 3); assert.deepEqual(h.attempts, ['PGR', 'BAC']);
    });
    await test('PGR 잠정 208.37은 live·기존 시각 유지 → 공정 순번 후 실제 확정 206.98 close', async () => {
        const h = harness();
        symbols.slice(0, 3).forEach(s => h.behavior.set(s, 'pending'));
        const recalled = { p: 208.37, t: `${D}T13:17:00.000Z` };
        await h.request();
        const pending = h.svc.pickRegularPreClose({ today: D, recalled });
        assert.equal(pending?.kind, 'live'); assert.equal(pending?.price, 208.37); assert.equal(pending?.time, recalled.t);
        await h.request();
        const [final] = await h.svc.peekExtendedSessionCloses(['PGR'], D, 'pre');
        const result = h.svc.pickRegularPreClose({ today: D, recalled, final });
        assert.equal(result?.kind, 'close'); assert.equal(result?.price, 206.98);
        assert.equal(result?.time, trade.time); assert.equal(result?.source, 'tape');
    });
    await test('동시 상한 초과는 undefined, 같은 종목 합류·캐시 조회는 상한 중에도 허용', async () => {
        const h = harness(), gate = deferred(); h.vendorGate(gate.promise);
        const running = symbols.slice(0, 3).map(s => h.svc.getExtendedSessionClose(s, D, 'pre'));
        await turn();
        assert.equal(h.peak(), 3); assert.equal(h.attempts.length, 3);
        for (const s of symbols.slice(3)) {
            assert.equal(await h.svc.getExtendedSessionClose(s, D, 'pre'), undefined);
            assert.equal(h.get(key(s)), null); assert.equal(h.get(`${key(s)}:claim`), null);
        }
        h.put(key('CACHED'), { p: 210, t: trade.time, src: trade.source });
        h.put(key('NONE'), { none: true });
        assert.equal((await h.svc.getExtendedSessionClose('CACHED', D, 'pre'))?.price, 210);
        assert.equal(await h.svc.getExtendedSessionClose('NONE', D, 'pre'), null);
        assert.equal((await h.svc.getExtendedSessionCloseWithin('PGR', D, 'pre', 3500)).value, null);
        const joined = h.svc.getExtendedSessionClose('BAC', D, 'pre');
        gate.resolve(); await Promise.all([...running, joined]);
        assert.equal(h.attempts.length, 3);
    });
    const holiday = '2026-09-07', completedDate = '2026-09-04';
    const lsKey = (s: string) => `lastsession:v2:${holiday}:${s}`;
    const holidayHarness = () => {
        const h = harness(); h.time(`${holiday}T16:00:00Z`); h.historyDate(completedDate); return h;
    };
    await test('휴장일 7종목 동시 복원 → 뒤 4종목 미확정은 캐시 없음 → 뒤늦은 확정 즉시 반영', async () => {
        assert.equal(calendar.isNonTradingDay(holiday), true);
        const h = holidayHarness(), gate = deferred(); h.vendorGate(gate.promise);
        const first = h.lastSession.reconstructLastSession(symbols);
        await turn(); assert.equal(h.attempts.length, 3); assert.equal(h.peak(), 3);
        gate.resolve(); const initial = await first;
        assert.equal(Object.keys(initial).length, 7, 'POST 보류 중에도 정규장 복원은 유지');
        for (const s of symbols) {
            assert.equal(initial[s].regClose, 200); assert.equal(initial[s].prevClose, 190);
            assert.equal(initial[s].changePct, 10 / 190 * 100);
            if (symbols.indexOf(s) < 3) assert.equal(h.get(lsKey(s))?.postPrice, trade.price);
            else {
                assert.equal(initial[s].postPrice, 0);
                assert.equal(h.get(lsKey(s)), null, '보류 POST 0은 6시간 저장 금지');
                assert.equal(h.get(key(s, 'post', completedDate)), null);
            }
        }
        // 후속 배경 확정이 완료되어도 기존 복원 캐시가 0을 우선하지 않아야 한다.
        for (const s of symbols.slice(3)) await h.svc.getExtendedSessionClose(s, completedDate, 'post');
        assert.equal(h.attempts.length, 7);
        const final = await h.lastSession.reconstructLastSession(symbols);
        for (const s of symbols) {
            assert.equal(final[s].postPrice, trade.price);
            assert.equal(final[s].postChangePct, (trade.price - 200) / 200 * 100);
            assert.equal(h.get(lsKey(s))?.postPrice, trade.price);
        }
        const historyCount = h.historyCalls.length;
        await h.lastSession.reconstructLastSession(symbols);
        assert.equal(h.attempts.length, 7); assert.equal(h.historyCalls.length, historyCount);
    });
    await test('휴장일 후속 복원만으로 7종목 모두 확정·동시 상한 3 유지', async () => {
        const h = holidayHarness();
        for (let i = 0; i < 3; i++) await h.lastSession.reconstructLastSession(symbols);
        const final = await h.lastSession.reconstructLastSession(symbols);
        assert.ok(symbols.every(s => final[s].postPrice === trade.price));
        assert.equal(h.attempts.length, 7); assert.ok(h.peak() <= 3);
    });
    for (const reason of ['error', 'pending', 'claim', 'claim-write', 'close-write', 'no-key'] as const) {
        await test(`휴장일 ${reason}: 미확정 POST 장기 캐시 금지·복구 후 확정`, async () => {
            const h = holidayHarness(), s = 'PGR', closeKey = key(s, 'post', completedDate);
            if (reason === 'error' || reason === 'pending') h.behavior.set(s, reason);
            if (reason === 'claim') h.put(`${closeKey}:claim`, 1, 20);
            if (reason === 'claim-write') h.failClaim(true);
            if (reason === 'close-write') h.failWrite(true);
            if (reason === 'no-key') h.hasKey(false);
            await h.lastSession.reconstructLastSession([s]);
            assert.equal(h.get(lsKey(s)), null); assert.equal(h.get(closeKey), null);
            assert.equal(await h.svc.getExtendedSessionClose(s, completedDate, 'post'), undefined);
            h.behavior.clear(); h.failClaim(false); h.failWrite(false); h.hasKey(true); h.advance(61_000);
            const final = await h.lastSession.reconstructLastSession([s]);
            assert.equal(final[s].postPrice, trade.price); assert.equal(h.get(lsKey(s))?.postPrice, trade.price);
        });
    }
    await test('휴장일 실제 체결 없음은 null·0 캐시 허용, 정규장 종가와 같은 POST도 보존', async () => {
        const h = holidayHarness(); h.behavior.set('NONE', 'none');
        h.put(key('SAME', 'post', completedDate), { p: 200, t: trade.time, src: trade.source });
        const result = await h.lastSession.reconstructLastSession(['NONE', 'SAME']);
        assert.equal(result.NONE.postPrice, 0); assert.equal(h.get(lsKey('NONE'))?.postPrice, 0);
        assert.equal(await h.svc.getExtendedSessionClose('NONE', completedDate, 'post'), null);
        assert.equal(result.SAME.postPrice, 200); assert.equal(result.SAME.postChangePct, 0);
        assert.equal(h.get(lsKey('SAME'))?.postPrice, 200);
        await h.lastSession.reconstructLastSession(['NONE', 'SAME']); assert.equal(h.attempts.length, 1);
    });
    await test('휴장일 세션 날짜 누락은 캐시 금지, 날짜 복구 후 POST 반영', async () => {
        const h = holidayHarness(); h.historyDate(null);
        const initial = await h.lastSession.reconstructLastSession(['PGR']);
        assert.equal(initial.PGR.regClose, 200); assert.equal(h.get(lsKey('PGR')), null);
        assert.equal(h.attempts.length, 0);
        h.historyDate(completedDate);
        assert.equal((await h.lastSession.reconstructLastSession(['PGR'])).PGR.postPrice, trade.price);
    });
    await test('확정 전은 undefined·저장 없음, 예산 래퍼는 기존 null 응답 유지', async () => {
        const h = harness(); h.time(`${D}T13:46:59Z`);
        assert.equal(await h.svc.getExtendedSessionClose('PGR', D, 'pre'), undefined);
        const result = await h.svc.getExtendedSessionCloseWithin('PGR', D, 'pre', 3500);
        assert.equal(result.value, null); assert.equal(result.pending, null);
        assert.equal(h.attempts.length, 0); assert.equal(h.get(key('PGR')), null);
    });
    console.log(`${passed} passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
