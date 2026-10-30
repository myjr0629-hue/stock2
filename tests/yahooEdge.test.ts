/**
 * 야후 접속점 선택(src/lib/cron/yahooEdge.ts) — 무네트워크 시험.
 * 실행: NODE_PATH=<node_modules> node -r ts-node/register -r tsconfig-paths/register --test tests/yahooEdge.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createEdgeFetch, probeEdges, YAHOO_ALT_EDGES, EDGE_PROBE_EVERY_MS, PINNED_TIMEOUT_MS, MAX_CONSECUTIVE_FAILS, chartBodyUsable } from '../src/lib/cron/yahooEdge';

const NOW_SEC = 1_793_390_000;
const chart = (t: number | null) => ({ ok: true, status: 200, json: async () => ({ chart: { result: [{ meta: { regularMarketTime: t, regularMarketPrice: 1 } }] } }) });
const YURL = 'https://query1.finance.yahoo.com/v8/finance/chart/CL%3DF?interval=1m&range=1d';

function rig(times: Record<string, number | null | 'throw' | 'bad'>) {
    const calls: string[] = [];
    const base = async (url: any) => { calls.push(`dns ${String(url)}`); const t = times.dns; if (t === 'throw') throw new Error('x'); return t === 'bad' ? { ok: false, status: 503, json: async () => ({}) } : chart(t as any); };
    const pinned = async (ip: string, url: string) => { calls.push(`${ip} ${url}`); const t = times[ip]; if (t === 'throw' || t === undefined) throw new Error('tls'); return t === 'bad' ? { ok: false, status: 429, json: async () => ({}) } : chart(t as any); };
    return { calls, base, pinned };
}

test('미국 접속점이 늙었으면 아시아 접속점을 고른다(10/30 실측 모양: dns 3219초·아시아 603초)', async () => {
    const r = rig({ dns: NOW_SEC - 3219, [YAHOO_ALT_EDGES[0]]: NOW_SEC - 603, [YAHOO_ALT_EDGES[1]]: NOW_SEC - 602 });
    const p = await probeEdges(r.base, r.pinned);
    assert.equal(p.edge, YAHOO_ALT_EDGES[1]);
});

test('동률·60초 이내 차이·장 마감이면 DNS 기본 유지(지금과 같은 동작)', async () => {
    for (const alt of [NOW_SEC, NOW_SEC + 30]) {
        const r = rig({ dns: NOW_SEC, [YAHOO_ALT_EDGES[0]]: alt, [YAHOO_ALT_EDGES[1]]: alt });
        assert.equal((await probeEdges(r.base, r.pinned)).edge, null);
    }
});

test('대안이 한 심볼이라도 기본보다 늙었거나 실패하면 고르지 않는다(관문 10310524 #2)', async () => {
    const per: Record<string, Record<string, number | null>> = {
        dns: { 'NQ%3DF': NOW_SEC - 3000, 'CL%3DF': NOW_SEC - 7000, '%5ESOX': NOW_SEC - 5 },
        [YAHOO_ALT_EDGES[0]]: { 'NQ%3DF': NOW_SEC - 600, 'CL%3DF': NOW_SEC - 600, '%5ESOX': NOW_SEC - 900 },   // SOX 만 더 늙음
        [YAHOO_ALT_EDGES[1]]: { 'NQ%3DF': NOW_SEC - 600, 'CL%3DF': null, '%5ESOX': NOW_SEC - 5 },            // CL 실패
    };
    const sym = (url: string) => url.split('/chart/')[1].split('?')[0];
    const base = async (url: any) => chart(per.dns[sym(String(url))]);
    const pinned = async (ip: string, url: string) => { const t = per[ip][sym(url)]; if (t == null) throw new Error('x'); return chart(t); };
    assert.equal((await probeEdges(base, pinned)).edge, null);
    per[YAHOO_ALT_EDGES[0]]['%5ESOX'] = NOW_SEC - 3;
    assert.equal((await probeEdges(base, pinned)).edge, YAHOO_ALT_EDGES[0]);
});

test('아시아 접속점이 전부 실패하면 DNS 기본', async () => {
    const r = rig({ dns: NOW_SEC - 3000 });
    assert.equal((await probeEdges(r.base, r.pinned)).edge, null);
});

test('DNS 기본 점검이 실패해도 살아 있는 대안을 고른다', async () => {
    const r = rig({ dns: 'throw', [YAHOO_ALT_EDGES[0]]: NOW_SEC - 600 });
    assert.equal((await probeEdges(r.base, r.pinned)).edge, YAHOO_ALT_EDGES[0]);
});

test('감싼 fetch: 야후 query1 만 고른 접속점으로, 그 외 주소는 기본 fetch 그대로', async () => {
    const r = rig({ dns: NOW_SEC - 3219, [YAHOO_ALT_EDGES[0]]: NOW_SEC - 603, [YAHOO_ALT_EDGES[1]]: 'throw' });
    let clock = 1_000_000;
    const ef = createEdgeFetch(r.base, { pinned: r.pinned, now: () => clock });
    // 첫 요청은 점검을 기다리지 않고 DNS 기본으로 나간다(점검은 뒤에서)
    const first = await ef.fetch(YURL, { headers: { 'User-Agent': 'x' } });
    assert.equal(first.ok, true);
    await ef.refresh();
    assert.equal(ef.state.edge, YAHOO_ALT_EDGES[0]);
    r.calls.length = 0;
    const res = await ef.fetch(YURL, { headers: { 'User-Agent': 'x' } });
    assert.equal(res.ok, true);
    assert.equal((await res.json()).chart.result[0].meta.regularMarketTime, NOW_SEC - 603);
    assert.deepEqual(r.calls, [`${YAHOO_ALT_EDGES[0]} ${YURL}`]);
    r.calls.length = 0;
    await ef.fetch('https://example-redis.upstash.io/get/x');
    await ef.fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata');
    assert.deepEqual(r.calls.map((c) => c.split(' ')[0]), ['dns', 'dns']);
    // 5분 안에는 다시 점검하지 않는다(수집 호출 수 불변)
    r.calls.length = 0; clock += EDGE_PROBE_EVERY_MS - 1;
    await ef.fetch(YURL); await ef.refresh();
    assert.equal(r.calls.length, 1);
    clock += 2;
    await ef.fetch(YURL); await ef.refresh();
    assert.equal(r.calls.length, 1 + 1 + 9, '5분 뒤 수집 1회 + 점검 9회(3심볼×dns+아시아 2)');
});

test('고정 접속점이 실패·4xx·차트 없는 200 이면 같은 요청을 기본 fetch 로 다시 보낸다(기존보다 나빠지지 않음)', async () => {
    for (const fail of ['throw', 'bad', 'empty200', 'noPrice200'] as const) {
        const times: Record<string, any> = { dns: NOW_SEC - 3219, [YAHOO_ALT_EDGES[0]]: NOW_SEC - 603, [YAHOO_ALT_EDGES[1]]: 'throw' };
        const r = rig(times);
        const pinned = async (ip: string, url: string, init?: any) => {
            if (fail === 'empty200' && times[ip] === 'empty200') { r.calls.push(`${ip} ${url}`); return { ok: true, status: 200, json: async () => ({ chart: { result: null, error: { code: 'Not Found' } } }) }; }
            if (fail === 'noPrice200' && times[ip] === 'noPrice200') { r.calls.push(`${ip} ${url}`); return { ok: true, status: 200, json: async () => ({ chart: { result: [{ meta: {} }] } }) }; }
            return r.pinned(ip, url);
        };
        const ef = createEdgeFetch(r.base, { pinned, now: () => 1 });
        await ef.refresh();
        assert.equal(ef.state.edge, YAHOO_ALT_EDGES[0]);
        times[YAHOO_ALT_EDGES[0]] = fail;
        r.calls.length = 0;
        const res = await ef.fetch(YURL);
        assert.equal(res.ok, true, fail);
        assert.deepEqual(r.calls.map((c) => c.split(' ')[0]), [YAHOO_ALT_EDGES[0], 'dns'], fail);
        assert.equal(ef.state.pinnedFails, 1);
    }
});

test('호출자 signal 이 만료돼도 기본 fetch 재시도는 새 제한으로 나간다(관문 10310520 #1)', async () => {
    const seen: any[] = [];
    const base = async (_url: any, init?: any) => { seen.push(init?.signal); if (init?.signal?.aborted) throw new Error('aborted'); return chart(NOW_SEC); };
    const hang = async (_ip: string, _url: string, init?: any) => new Promise<any>((_, rej) => {
        init?.signal?.addEventListener('abort', () => rej(new Error('timeout')), { once: true });
    });
    const ef = createEdgeFetch(base, { pinned: hang, now: () => 1 });
    ef.state.edge = YAHOO_ALT_EDGES[0]; ef.state.checkedAt = 1;   // 점검 없이 고정 상태
    const callerAbort = new AbortController(); callerAbort.abort();
    const t0 = Date.now();
    const keepAlive = setInterval(() => {}, 1000);   // AbortSignal.timeout 타이머는 unref — 시험 동안 루프 유지
    const res = await ef.fetch(YURL, { signal: callerAbort.signal }).finally(() => clearInterval(keepAlive));
    assert.equal(res.ok, true);
    assert.ok(Date.now() - t0 >= PINNED_TIMEOUT_MS - 50 && Date.now() - t0 < PINNED_TIMEOUT_MS + 1500, '고정 접속점은 자체 3초 제한');
    assert.equal(seen.at(-1)?.aborted, false, '재시도 signal 은 살아 있다');
});

test('연속 3번 실패하면 다음 점검까지 DNS 기본으로 돌아간다', async () => {
    const r = rig({ dns: NOW_SEC, [YAHOO_ALT_EDGES[0]]: 'bad' });
    const ef = createEdgeFetch(r.base, { pinned: r.pinned, now: () => 1 });
    ef.state.edge = YAHOO_ALT_EDGES[0]; ef.state.checkedAt = 1;
    for (let i = 0; i < MAX_CONSECUTIVE_FAILS; i++) await ef.fetch(YURL);
    assert.equal(ef.state.edge, null);
    r.calls.length = 0;
    await ef.fetch(YURL);
    assert.deepEqual(r.calls.map((c) => c.split(' ')[0]), ['dns']);
});

test('점검이 동률이면 기본 fetch 만 쓴다(접속점 고정 없음)', async () => {
    const r = rig({ dns: NOW_SEC, [YAHOO_ALT_EDGES[0]]: NOW_SEC, [YAHOO_ALT_EDGES[1]]: NOW_SEC });
    const ef = createEdgeFetch(r.base, { pinned: r.pinned, now: () => 1 });
    await ef.refresh();
    assert.equal(r.calls.length, 9, '점검은 실제로 돌았다(3심볼×3접속점)');
    r.calls.length = 0;
    await ef.fetch(YURL);
    assert.deepEqual(r.calls.map((c) => c.split(' ')[0]), ['dns']);
});

test('차트 본문 판정: 1분봉은 가격, 일봉은 timestamp 가 있어야 쓴다', () => {
    const m = 'https://query1.finance.yahoo.com/v8/finance/chart/NQ%3DF?interval=1m&range=1d';
    const d = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EDJI?interval=1d&range=7d';
    assert.equal(chartBodyUsable(m, { chart: { result: [{ meta: {} }] } }), false);
    assert.equal(chartBodyUsable(m, { chart: { result: [{ meta: { regularMarketPrice: 0 } }] } }), false);
    assert.equal(chartBodyUsable(m, { chart: { result: [{ meta: { regularMarketPrice: 28537 } }] } }), true);
    assert.equal(chartBodyUsable(d, { chart: { result: [{ meta: {}, timestamp: [] }] } }), false);
    assert.equal(chartBodyUsable(d, { chart: { result: [{ meta: {}, timestamp: [1] }] } }), false, '종가 없음');
    assert.equal(chartBodyUsable(d, { chart: { result: [{ meta: {}, timestamp: [1, 2], indicators: { quote: [{ close: [null, null] }] } }] } }), false, '종가 전부 null');
    assert.equal(chartBodyUsable(d, { chart: { result: [{ meta: {}, timestamp: [1, 2], indicators: { quote: [{ close: [null, 99.8] }] } }] } }), true);
    assert.equal(chartBodyUsable(m, { chart: { result: null } }), false);
});

test('워커 배선: fetch 를 감싸고 수집 함수 본문(marketFeedJob)은 건드리지 않는다', () => {
    const worker = fs.readFileSync(path.join(__dirname, '../scripts/ec2-cron/market-feed-worker.ts'), 'utf8');
    assert.match(worker, /createEdgeFetch\(globalThis\.fetch\.bind\(globalThis\)/);
    assert.match(worker, /globalThis\.fetch = yahooEdge\.fetch/);
    const job = fs.readFileSync(path.join(__dirname, '../src/services/jobs/marketFeedJob.ts'), 'utf8');
    assert.doesNotMatch(job, /yahooEdge/);
});
