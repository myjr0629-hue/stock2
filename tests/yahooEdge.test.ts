/**
 * 야후 접속점 선택(src/lib/cron/yahooEdge.ts) — 무네트워크 시험.
 * 실행: NODE_PATH=<node_modules> node -r ts-node/register -r tsconfig-paths/register --test tests/yahooEdge.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createEdgeFetch, probeEdges, YAHOO_ALT_EDGES, EDGE_PROBE_EVERY_MS } from '../src/lib/cron/yahooEdge';

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
    const res = await ef.fetch(YURL, { headers: { 'User-Agent': 'x' } });
    assert.equal(res.ok, true);
    assert.equal(ef.state.edge, YAHOO_ALT_EDGES[0]);
    assert.equal(r.calls.at(-1), `${YAHOO_ALT_EDGES[0]} ${YURL}`);
    r.calls.length = 0;
    await ef.fetch('https://example-redis.upstash.io/get/x');
    await ef.fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata');
    assert.deepEqual(r.calls.map((c) => c.split(' ')[0]), ['dns', 'dns']);
    // 5분 안에는 다시 점검하지 않는다(수집 호출 수 불변)
    r.calls.length = 0; clock += EDGE_PROBE_EVERY_MS - 1;
    await ef.fetch(YURL);
    assert.equal(r.calls.length, 1);
    clock += 2;
    await ef.fetch(YURL);
    assert.equal(r.calls.length, 1 + 3 + 1, '5분 뒤 점검 3회(dns+아시아 2) + 수집 1회');
});

test('고정 접속점이 실패·4xx 면 같은 요청을 기본 fetch 로 다시 보낸다(기존보다 나빠지지 않음)', async () => {
    for (const fail of ['throw', 'bad'] as const) {
        const times: Record<string, any> = { dns: NOW_SEC - 3219, [YAHOO_ALT_EDGES[0]]: NOW_SEC - 603, [YAHOO_ALT_EDGES[1]]: 'throw' };
        const r = rig(times);
        const ef = createEdgeFetch(r.base, { pinned: r.pinned, now: () => 1 });
        await ef.refresh();
        assert.equal(ef.state.edge, YAHOO_ALT_EDGES[0]);
        times[YAHOO_ALT_EDGES[0]] = fail;
        r.calls.length = 0;
        const res = await ef.fetch(YURL);
        assert.equal(res.ok, true);
        assert.deepEqual(r.calls.map((c) => c.split(' ')[0]), [YAHOO_ALT_EDGES[0], 'dns']);
        assert.equal(ef.state.pinnedFails, 1);
    }
});

test('점검이 동률이면 기본 fetch 만 쓴다(접속점 고정 없음)', async () => {
    const r = rig({ dns: NOW_SEC, [YAHOO_ALT_EDGES[0]]: NOW_SEC, [YAHOO_ALT_EDGES[1]]: NOW_SEC });
    const ef = createEdgeFetch(r.base, { pinned: r.pinned, now: () => 1 });
    await ef.refresh();
    assert.equal(r.calls.length, 3, '점검은 실제로 돌았다');
    r.calls.length = 0;
    await ef.fetch(YURL);
    assert.deepEqual(r.calls.map((c) => c.split(' ')[0]), ['dns']);
});

test('워커 배선: fetch 를 감싸고 수집 함수 본문(marketFeedJob)은 건드리지 않는다', () => {
    const worker = fs.readFileSync(path.join(__dirname, '../scripts/ec2-cron/market-feed-worker.ts'), 'utf8');
    assert.match(worker, /createEdgeFetch\(globalThis\.fetch\.bind\(globalThis\)/);
    assert.match(worker, /globalThis\.fetch = yahooEdge\.fetch/);
    const job = fs.readFileSync(path.join(__dirname, '../src/services/jobs/marketFeedJob.ts'), 'utf8');
    assert.doesNotMatch(job, /yahooEdge/);
});
