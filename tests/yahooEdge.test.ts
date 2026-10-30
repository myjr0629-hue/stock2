/**
 * 야후 «심볼별 더 신선한 응답 고르기»(src/lib/cron/yahooEdge.ts) — 무네트워크 시험.
 * 실행: TS_NODE_TRANSPILE_ONLY=1 TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' \
 *       node -r ts-node/register -r tsconfig-paths/register --test tests/yahooEdge.test.ts
 * 관문 10310534 지적 3건(점검 실패를 0초로 계산·접속점을 17심볼 전체에 적용·일봉 종가 1개 통과)을 각각 재현한다.
 * 마지막 묶음은 운영 수집 함수(fetchOneQuote)를 감싼 fetch 로 그대로 돌려 저장될 가격·등락률을 확인한다.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    createEdgeFetch, pickMinute, minuteInfo, ALT_EXCLUDED_SYMBOLS,
    YAHOO_ALT_EDGES, ALT_FAILS_TO_PAUSE, ALT_PAUSE_MS, ALT_PAUSE_429_MS, ALT_MAX_INFLIGHT,
    ALT_GRACE_MS, ALT_LOSSES_TO_BACKOFF, ALT_RECHECK_MS,
} from '../src/lib/cron/yahooEdge';

const NOW_SEC = 1_793_390_000;
const NOW_MS = NOW_SEC * 1000;
const A0 = YAHOO_ALT_EDGES[0];
const A1 = YAHOO_ALT_EDGES[1];
const url1m = (s: string) => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1m&range=1d`;
const url1d = (s: string) => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1d&range=5d`;

type Meta = { price?: number | null; time?: number | null; prev?: number | null };
const minuteBody = (m: Meta) => ({ chart: { result: [{ meta: { regularMarketPrice: m.price, regularMarketTime: m.time, previousClose: m.prev }, timestamp: [], indicators: { quote: [{ close: [] }] } }] } });
const dailyBody = (ts: number[], cl: (number | null)[]) => ({ chart: { result: [{ meta: { regularMarketPrice: cl[cl.length - 1] }, timestamp: ts, indicators: { quote: [{ close: cl }] } }] } });
const ok = (data: any) => ({ kind: 'ok' as const, status: 200, data });
const res = (data: any, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

// 접속점·URL 별 응답 표 — 'throw' 는 연결 실패, 숫자는 상태 코드(본문 없음)
type Reply = any | 'throw' | number;
function rig(table: Record<string, Record<string, Reply>>) {
    const calls: string[] = [];
    const reply = (who: string, url: string) => {
        calls.push(`${who} ${url}`);
        const r = table[who]?.[url];
        if (r === undefined || r === 'throw') return Promise.reject(new Error(`${who} 실패`));
        if (typeof r === 'number') return Promise.resolve(res({}, r));
        return Promise.resolve(res(r));
    };
    const base = (url: any) => reply('dns', String(url));
    const pinned = (ip: string, url: string) => reply(ip, url);
    return { calls, base, pinned };
}

// ── 판정 함수 ──────────────────────────────────────────────

test('1분봉: 대안이 더 새롭고 가격·체결 시각·직전 종가가 모두 유효할 때만 대안(10/30 실측 모양: dns 3219초·대안 603초)', () => {
    const dns = ok(minuteBody({ price: 28380.5, time: NOW_SEC - 3219, prev: 29562 }));
    assert.equal(pickMinute(dns, ok(minuteBody({ price: 28537, time: NOW_SEC - 603, prev: 29562 })), NOW_SEC), 'alt');
    // 직전 종가 없음·가격 없음·체결 시각 없음 → 대안 무효
    for (const bad of [{ price: 28537, time: NOW_SEC - 603, prev: null }, { price: null, time: NOW_SEC - 603, prev: 29562 }, { price: 28537, time: null, prev: 29562 }]) {
        assert.equal(pickMinute(dns, ok(minuteBody(bad)), NOW_SEC), 'dns-alt-invalid');
    }
    // 미래 시각(시계·자료 이상)은 믿지 않는다
    assert.equal(pickMinute(dns, ok(minuteBody({ price: 1, time: NOW_SEC + 3600, prev: 1 })), NOW_SEC), 'dns-alt-invalid');
});

test('1분봉: 동률(장 마감·주말)·대안이 더 늙음이면 DNS(기존 경로)', () => {
    const dns = ok(minuteBody({ price: 20, time: NOW_SEC - 5, prev: 19 }));
    assert.equal(pickMinute(dns, ok(minuteBody({ price: 20, time: NOW_SEC - 5, prev: 19 })), NOW_SEC), 'dns');
    assert.equal(pickMinute(dns, ok(minuteBody({ price: 20, time: NOW_SEC - 900, prev: 19 })), NOW_SEC), 'dns');
});

test('관문 #1 — DNS 판정 불가(가격은 있는데 체결 시각 없음)는 0초로 치지 않고 DNS 그대로', () => {
    const dns = ok(minuteBody({ price: 28537, time: null, prev: 29562 }));
    assert.equal(pickMinute(dns, ok(minuteBody({ price: 28380, time: NOW_SEC - 600, prev: 29562 })), NOW_SEC), 'dns-undecidable');
});

test('DNS 가 못 쓰는 응답(연결 실패·503·가격 없음)이면 유효한 대안, 둘 다 실패면 DNS 결과(기존과 같은 실패)', () => {
    const alt = ok(minuteBody({ price: 28537, time: NOW_SEC - 600, prev: 29562 }));
    assert.equal(pickMinute({ kind: 'err', err: new Error('x') }, alt, NOW_SEC), 'alt-dns-failed');
    assert.equal(pickMinute({ kind: 'bad', status: 503, res: res({}, 503) }, alt, NOW_SEC), 'alt-dns-failed');
    assert.equal(pickMinute(ok(minuteBody({ price: null, time: NOW_SEC, prev: 1 })), alt, NOW_SEC), 'alt-dns-failed');
    assert.equal(pickMinute({ kind: 'err', err: new Error('x') }, { kind: 'err', err: new Error('y') }, NOW_SEC), 'dns-alt-invalid');
    assert.equal(pickMinute({ kind: 'err', err: new Error('x') }, null, NOW_SEC), 'dns-alt-skipped');
});

test('관문 10310534 #3·10310545 #1·#2 — 일봉 요청과 실제 지수(^IXIC·^DJI·^GSPC) 1분봉은 대안을 부르지 않는다(기존 경로 그대로)', async () => {
    const D = 86_400; const t0 = NOW_SEC - 3 * D;
    const daily = dailyBody([t0, t0 + D, t0 + 2 * D], [100, 101, 102]);
    const table: any = { dns: {}, [A0]: {} };
    for (const sym of ['ES=F', 'NQ=F', '^GSPC']) { table.dns[url1d(sym)] = daily; table[A0][url1d(sym)] = dailyBody([t0 + 3 * D], [103]); }
    for (const sym of ALT_EXCLUDED_SYMBOLS) { table.dns[url1m(sym)] = minuteBody({ price: 1, time: NOW_SEC - 86_400, prev: 1 }); table[A0][url1m(sym)] = minuteBody({ price: 2, time: NOW_SEC, prev: 1 }); }
    const r = rig(table);
    const e = createEdgeFetch(r.base, { pinned: r.pinned, now: () => NOW_MS });
    for (const sym of ['ES=F', 'NQ=F', '^GSPC']) assert.deepEqual(await (await e.fetch(url1d(sym), {})).json(), daily);
    for (const sym of ALT_EXCLUDED_SYMBOLS) assert.equal((await (await e.fetch(url1m(sym), {})).json()).chart.result[0].meta.regularMarketPrice, 1);
    assert.equal(r.calls.filter((c) => !c.startsWith('dns')).length, 0);
    assert.equal(e.state.altCalls, 0);
    assert.deepEqual([...ALT_EXCLUDED_SYMBOLS].sort(), ['^DJI', '^GSPC', '^IXIC']);
});

test('minuteInfo: chartPreviousClose 만 있어도 직전 종가 유효(수집 함수와 같은 규칙)', () => {
    const body = { chart: { result: [{ meta: { regularMarketPrice: 5, regularMarketTime: NOW_SEC, chartPreviousClose: 4.9 } }] } };
    assert.equal(minuteInfo(body).complete, true);
});

// ── 감싼 fetch ─────────────────────────────────────────────

test('관문 #2 — 심볼마다 따로 판정: NQ 는 대안, 같은 회차 VIX 는 DNS(대안이 더 늙음)', async () => {
    const t = {
        dns: { [url1m('NQ=F')]: minuteBody({ price: 28380.5, time: NOW_SEC - 3219, prev: 29562 }), [url1m('^VIX')]: minuteBody({ price: 18.2, time: NOW_SEC - 5, prev: 17.9 }) },
        [A0]: { [url1m('NQ=F')]: minuteBody({ price: 28537, time: NOW_SEC - 603, prev: 29562 }), [url1m('^VIX')]: minuteBody({ price: 18.0, time: NOW_SEC - 1200, prev: 17.9 }) },
    };
    const r = rig(t);
    const e = createEdgeFetch(r.base, { pinned: r.pinned, now: () => NOW_MS });
    const nq = await (await e.fetch(url1m('NQ=F'), {})).json();
    const vix = await (await e.fetch(url1m('^VIX'), {})).json();
    assert.equal(nq.chart.result[0].meta.regularMarketPrice, 28537);
    assert.equal(vix.chart.result[0].meta.regularMarketPrice, 18.2);
    assert.equal(e.state.picks['NQ=F@1m'].via, 'alt');
    assert.equal(e.state.picks['^VIX@1m'].via, 'dns');
    // 심볼당 최대 2회(DNS 1 + 대안 1)
    assert.equal(r.calls.filter((c) => c.endsWith(url1m('NQ=F'))).length, 2);
});

test('관문 #1 — 한 심볼의 DNS 실패가 다른 심볼 판정에 번지지 않는다', async () => {
    const t = {
        dns: { [url1m('CL=F')]: minuteBody({ price: 61.2, time: NOW_SEC - 30, prev: 60 }) },   // NQ 는 DNS 실패(표에 없음)
        [A0]: { [url1m('NQ=F')]: minuteBody({ price: 28537, time: NOW_SEC - 600, prev: 29562 }), [url1m('CL=F')]: minuteBody({ price: 61.0, time: NOW_SEC - 600, prev: 60 }) },
    };
    const r = rig(t);
    const e = createEdgeFetch(r.base, { pinned: r.pinned, now: () => NOW_MS });
    assert.equal((await (await e.fetch(url1m('NQ=F'), {})).json()).chart.result[0].meta.regularMarketPrice, 28537);
    assert.equal((await (await e.fetch(url1m('CL=F'), {})).json()).chart.result[0].meta.regularMarketPrice, 61.2);
    assert.equal(e.state.picks['CL=F@1m'].via, 'dns');
});

test('DNS·대안 둘 다 실패면 DNS 실패 그대로(503 응답·예외)', async () => {
    const r = rig({ dns: { [url1m('NQ=F')]: 503 } });
    const e = createEdgeFetch(r.base, { pinned: r.pinned, now: () => NOW_MS });
    const got = await e.fetch(url1m('NQ=F'), {});
    assert.equal(got.ok, false); assert.equal(got.status, 503);
    const r2 = rig({});
    const e2 = createEdgeFetch(r2.base, { pinned: r2.pinned, now: () => NOW_MS });
    await assert.rejects(() => e2.fetch(url1m('NQ=F'), {}), /dns 실패/);
});

test('차트 아닌 요청·다른 호스트는 대안을 부르지 않는다', async () => {
    const r = rig({ dns: { 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata': { fear_and_greed: {} }, 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=X': { q: 1 } } });
    const e = createEdgeFetch(r.base, { pinned: r.pinned, now: () => NOW_MS });
    await e.fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {});
    await e.fetch('https://query1.finance.yahoo.com/v7/finance/quote?symbols=X', {});
    assert.deepEqual(r.calls.map((c) => c.split(' ')[0]), ['dns', 'dns']);
    assert.equal(e.state.altCalls, 0);
});

test('대안 연속 연결 실패 → 그 대안 5분 쉼·다음 대안 / 429 → 15분 쉼 / 전부 쉬면 DNS 만', async () => {
    let nowMs = NOW_MS;
    const dnsBody = minuteBody({ price: 1, time: NOW_SEC, prev: 1 });
    const t: any = { dns: { [url1m('NQ=F')]: dnsBody }, [A1]: { [url1m('NQ=F')]: 429 } };
    const r = rig(t);
    const e = createEdgeFetch(r.base, { pinned: r.pinned, now: () => nowMs });
    for (let i = 0; i < ALT_FAILS_TO_PAUSE; i++) await e.fetch(url1m('NQ=F'), {});
    assert.ok(e.state.alts[A0].pausedUntil >= nowMs + ALT_PAUSE_MS - 1);
    const mark = r.calls.length;
    await e.fetch(url1m('NQ=F'), {});           // 다음 대안 A1 → 429
    assert.ok(r.calls.slice(mark).some((c) => c.startsWith(A1)));
    assert.ok(e.state.alts[A1].pausedUntil >= nowMs + ALT_PAUSE_429_MS - 1);
    const before = r.calls.length;
    await e.fetch(url1m('NQ=F'), {});           // 전부 쉼 → DNS 만
    assert.deepEqual(r.calls.slice(before).map((c) => c.split(' ')[0]), ['dns']);
    nowMs += ALT_PAUSE_MS + 1;                  // A0 쉼 끝
    const mark2 = r.calls.length;
    await e.fetch(url1m('NQ=F'), {});
    assert.ok(r.calls.slice(mark2).some((c) => c.startsWith(A0)));
});

test('대안 내용 미비(직전 종가 없음)는 연결 실패로 세지 않는다 — 한 심볼 사정으로 대안 전체가 쉬지 않게', async () => {
    const r = rig({ dns: { [url1m('X')]: minuteBody({ price: 1, time: NOW_SEC - 900, prev: 1 }) }, [A0]: { [url1m('X')]: minuteBody({ price: 1, time: NOW_SEC, prev: null }) } });
    const e = createEdgeFetch(r.base, { pinned: r.pinned, now: () => NOW_MS });
    for (let i = 0; i < ALT_FAILS_TO_PAUSE + 2; i++) await e.fetch(url1m('X'), {});
    assert.equal(e.state.alts[A0].pausedUntil, 0);
});

test('대안 동시 상한 — 상한을 넘는 요청은 대안 없이 DNS 만', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const calls: string[] = [];
    const body = minuteBody({ price: 1, time: NOW_SEC, prev: 1 });
    const base = async () => { calls.push('dns'); return res(body); };
    const pinned = async (ip: string) => { calls.push(ip); await gate; return res(body); };
    const e = createEdgeFetch(base, { pinned, now: () => NOW_MS });
    const ps = Array.from({ length: ALT_MAX_INFLIGHT + 2 }, () => e.fetch(url1m('NQ=F'), {}));
    await new Promise((r) => setImmediate(r));
    assert.equal(calls.filter((c) => c !== 'dns').length, ALT_MAX_INFLIGHT);
    release(); await Promise.all(ps);
});

test('대안 3초 제한 — 호출자 signal 은 대안에 넘기지 않는다(대안이 느려도 DNS 경로는 호출자 제한 그대로)', async () => {
    let altSignal: AbortSignal | undefined; let dnsSignal: AbortSignal | undefined;
    const caller = AbortSignal.timeout(5000);
    const body = minuteBody({ price: 1, time: NOW_SEC, prev: 1 });
    const e = createEdgeFetch(async (_u: any, init: any) => { dnsSignal = init.signal; return res(body); },
        { pinned: async (_ip, _u, init) => { altSignal = init.signal; return res(body); }, now: () => NOW_MS });
    await e.fetch(url1m('NQ=F'), { signal: caller });
    assert.equal(dnsSignal, caller);
    assert.ok(altSignal && altSignal !== caller);
});

// ── 관문 10310542 지적 3건 ──────────────────────────────────

const barsBody = (m: Meta, ts: number[], cl: (number | null)[]) => ({ chart: { result: [{ meta: { regularMarketPrice: m.price, regularMarketTime: m.time, previousClose: m.prev }, timestamp: ts, indicators: { quote: [{ close: cl }] } }] } });

test('관문 10310542 #1 — 실제 지수: DNS meta 는 어제·1분봉은 오늘, 대안 meta 만 조금 새롭고 1분봉 없음/낡음이면 DNS', async () => {
    const Y = NOW_SEC - 86_400; // 어제
    const dnsBody = barsBody({ price: 7483.2, time: Y, prev: 7450 }, [NOW_SEC - 120, NOW_SEC - 60], [7470, 7472.5]);
    const altNoBars = barsBody({ price: 7483.2, time: Y + 60, prev: 7450 }, [], []);
    const altOldBars = barsBody({ price: 7483.2, time: Y + 60, prev: 7450 }, [Y - 60, Y], [7483, 7483.2]);
    assert.equal(pickMinute(ok(dnsBody), ok(altNoBars), NOW_SEC), 'dns');
    assert.equal(pickMinute(ok(dnsBody), ok(altOldBars), NOW_SEC), 'dns');
    // 대안이 meta·1분봉 둘 다 같거나 새로우면 대안
    const altBetter = barsBody({ price: 7472.5, time: NOW_SEC - 60, prev: 7450 }, [NOW_SEC - 120, NOW_SEC - 60], [7470, 7472.5]);
    assert.equal(pickMinute(ok(dnsBody), ok(altBetter), NOW_SEC), 'alt');
    // 감싼 fetch 에선 실제 지수는 아예 대안을 부르지 않는다(관문 10310545 #1) — DNS 본문(오늘 1분봉) 그대로
    const r = rig({ dns: { [url1m('^GSPC')]: dnsBody }, [A0]: { [url1m('^GSPC')]: altBetter } });
    const e = createEdgeFetch(r.base, { pinned: r.pinned, now: () => NOW_MS });
    const got = await (await e.fetch(url1m('^GSPC'), {})).json();
    assert.deepEqual(got.chart.result[0].timestamp, [NOW_SEC - 120, NOW_SEC - 60]);
    assert.equal(e.state.altCalls, 0);
});

test('관문 10310542 #2 — 느리지만 성공하는 대안은 DNS 뒤 ALT_GRACE_MS 까지만 기다리고 DNS 결과, 3번이면 그 대안 쉼', async () => {
    const dnsBody = minuteBody({ price: 1, time: NOW_SEC - 3000, prev: 1 });
    const altBody = minuteBody({ price: 2, time: NOW_SEC - 600, prev: 1 });
    const e = createEdgeFetch(async () => res(dnsBody), {
        pinned: (_ip, _u, init) => new Promise((resolve, reject) => {
            const t = setTimeout(() => resolve(res(altBody)), ALT_GRACE_MS + 1000);
            init.signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); });
        }),
        now: () => NOW_MS,
    });
    const t0 = Date.now();
    const got = await (await e.fetch(url1m('NQ=F'), {})).json();
    const took = Date.now() - t0;
    assert.equal(got.chart.result[0].meta.regularMarketPrice, 1);
    assert.equal(e.state.picks['NQ=F@1m'].via, 'dns-alt-slow');
    assert.ok(took < ALT_GRACE_MS + 400, `기다린 시간 ${took}ms`);
    await e.fetch(url1m('NQ=F'), {}); await e.fetch(url1m('NQ=F'), {});
    assert.ok(e.state.alts[A0].pausedUntil > NOW_MS, '늦음 3번 → 그 대안 쉼');
});

test('관문 10310542 #3 — DNS 429 를 받으면 대안 전체를 15분 쉰다(같은 IP 로 요청을 더 얹지 않음)', async () => {
    let nowMs = NOW_MS;
    const r = rig({ dns: { [url1m('NQ=F')]: 429, [url1m('CL=F')]: minuteBody({ price: 1, time: NOW_SEC, prev: 1 }) }, [A0]: { [url1m('NQ=F')]: minuteBody({ price: 2, time: NOW_SEC, prev: 1 }) } });
    const e = createEdgeFetch(r.base, { pinned: r.pinned, now: () => nowMs });
    await e.fetch(url1m('NQ=F'), {});
    assert.ok(e.state.allPausedUntil >= NOW_MS + ALT_PAUSE_429_MS - 1);
    const mark = r.calls.length;
    await e.fetch(url1m('CL=F'), {});
    assert.deepEqual(r.calls.slice(mark).map((c) => c.split(' ')[0]), ['dns']);
    nowMs += ALT_PAUSE_429_MS + 1;
    const mark2 = r.calls.length;
    await e.fetch(url1m('CL=F'), {});
    assert.ok(r.calls.slice(mark2).some((c) => c.startsWith(A0)));
});

test('관문 10310545 #3 — 대기 상한 뒤 늦게 온 대안 429 도 그 대안을 15분 쉬게 한다', async () => {
    const dnsBody = minuteBody({ price: 1, time: NOW_SEC, prev: 1 });
    const e = createEdgeFetch(async () => res(dnsBody), {
        pinned: () => new Promise((resolve) => setTimeout(() => resolve(res({}, 429)), ALT_GRACE_MS + 200)),
        now: () => NOW_MS,
    });
    await e.fetch(url1m('NQ=F'), {});
    assert.equal(e.state.picks['NQ=F@1m'].via, 'dns-alt-slow');
    await new Promise((r) => setTimeout(r, 400));
    assert.ok(e.state.alts[A0].pausedUntil >= NOW_MS + ALT_PAUSE_429_MS - 1);
});

test('관문 10310548 — 일봉·실제 지수(대안 대상 밖) 요청의 DNS 429 도 대안 전체 15분 쉼', async () => {
    for (const u of [url1d('NQ=F'), url1m('^GSPC')]) {
        const r = rig({ dns: { [u]: 429, [url1m('CL=F')]: minuteBody({ price: 1, time: NOW_SEC, prev: 1 }) }, [A0]: { [url1m('CL=F')]: minuteBody({ price: 2, time: NOW_SEC, prev: 1 }) } });
        const e = createEdgeFetch(r.base, { pinned: r.pinned, now: () => NOW_MS });
        const got = await e.fetch(u, {});
        assert.equal(got.status, 429);
        assert.ok(e.state.allPausedUntil >= NOW_MS + ALT_PAUSE_429_MS - 1);
        await e.fetch(url1m('CL=F'), {});
        assert.equal(r.calls.filter((c) => c.startsWith(A0)).length, 0);
    }
});

test('호출량 — 대안이 연속 3번 이기지 못한 심볼은 5분에 한 번만 대안에 묻고, 이기면 다시 매번', async () => {
    let nowMs = NOW_MS;
    const t: any = { dns: { [url1m('ES=F')]: minuteBody({ price: 1, time: NOW_SEC, prev: 1 }) }, [A0]: { [url1m('ES=F')]: minuteBody({ price: 1, time: NOW_SEC, prev: 1 }) } };
    const r = rig(t);
    const e = createEdgeFetch(r.base, { pinned: r.pinned, now: () => nowMs });
    for (let i = 0; i < ALT_LOSSES_TO_BACKOFF + 3; i++) { await e.fetch(url1m('ES=F'), {}); nowMs += 30_000; }
    assert.equal(r.calls.filter((c) => c.startsWith(A0)).length, ALT_LOSSES_TO_BACKOFF);
    nowMs += ALT_RECHECK_MS;
    t[A0][url1m('ES=F')] = minuteBody({ price: 2, time: NOW_SEC + 60, prev: 1 });   // DNS 가 늙기 시작 → 대안 승
    await e.fetch(url1m('ES=F'), {}); nowMs += 30_000;
    await e.fetch(url1m('ES=F'), {});
    assert.equal(r.calls.filter((c) => c.startsWith(A0)).length, ALT_LOSSES_TO_BACKOFF + 2);
    assert.equal(e.state.picks['ES=F@1m'].via, 'alt');
});

// ── 운영 수집 함수(fetchOneQuote) 그대로 ─────────────────────

async function withFetch<T>(f: typeof fetch, run: () => Promise<T>): Promise<T> {
    const orig = globalThis.fetch;
    globalThis.fetch = f;
    try { return await run(); } finally { globalThis.fetch = orig; }
}

test('fetchOneQuote — NQ 는 대안의 새 가격으로 저장, 같은 회차 VIX 는 DNS 값', async () => {
    const { fetchOneQuote } = await import('../src/services/jobs/marketFeedJob');
    const r = rig({
        dns: { [url1m('NQ=F')]: minuteBody({ price: 28380.5, time: NOW_SEC - 3219, prev: 29562 }), [url1m('^VIX')]: minuteBody({ price: 18.2, time: NOW_SEC - 5, prev: 17.9 }) },
        [A0]: { [url1m('NQ=F')]: minuteBody({ price: 28537, time: NOW_SEC - 603, prev: 29562 }), [url1m('^VIX')]: minuteBody({ price: 18.0, time: NOW_SEC - 1200, prev: 17.9 }) },
    });
    const e = createEdgeFetch(r.base, { pinned: r.pinned, now: () => NOW_MS });
    const [nq, vix] = await withFetch(e.fetch as any, async () => [await fetchOneQuote('NQ=F'), await fetchOneQuote('^VIX')]);
    assert.equal(nq!.price, 28537);
    assert.equal(nq!.marketTime, new Date((NOW_SEC - 603) * 1000).toISOString());
    assert.equal(vix!.price, 18.2);
});

test('관문 #3 재현 — 직전 종가 복구 일봉: 대안이 «당일 종가 1개만»이면 DNS 일봉으로 등락률 계산(0% 로 뭉개지지 않음)', async () => {
    const { fetchOneQuote } = await import('../src/services/jobs/marketFeedJob');
    const D = 86_400; const t0 = NOW_SEC - 3 * D;
    // 1분봉 previousClose 가 현재가로 «굴러간» 응답(직전 종가 복구 경로 진입) — DNS·대안 같은 시각
    const m = minuteBody({ price: 7443.5, time: NOW_SEC - 30, prev: 7443.5 });
    const r = rig({
        dns: { [url1m('ES=F')]: m, [url1d('ES=F')]: dailyBody([t0, t0 + D, t0 + 2 * D], [7400, 7460, 7443.5]) },
        [A0]: { [url1m('ES=F')]: m, [url1d('ES=F')]: dailyBody([t0 + 2 * D], [7443.5]) },
    });
    const e = createEdgeFetch(r.base, { pinned: r.pinned, now: () => NOW_MS });
    const q = await withFetch(e.fetch as any, () => fetchOneQuote('ES=F'));
    assert.equal(e.state.picks['ES=F@1d'], undefined);
    assert.ok(!r.calls.some((c) => c.startsWith(A0) && c.includes('interval=1d')), '일봉은 대안에 묻지 않는다');
    assert.equal(q!.prevClose, 7460);
    assert.ok(Math.abs(q!.changePct - ((7443.5 - 7460) / 7460) * 100) < 1e-9);
    assert.notEqual(q!.changePct, 0);
});
