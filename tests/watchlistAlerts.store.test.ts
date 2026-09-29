/**
 * PRO «내 종목» 알림 — DynamoDB 저장소(store-dynamo.ts) 시험: AWS 없이 «가짜 DocumentClient»로 명령 모양·순서·조건을 확인한다
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/watchlistAlerts.store.test.ts
 *
 * 가짜 클라이언트는 이 저장소가 쓰는 표현식만 해석한다(조건부 쓰기·원자적 ADD·페이지 넘김·UnprocessedItems 재시도).
 * 표 이름·키 모양이 코드와 다르면(오타) 여기서 걸린다 — 운영 표는 만들지 않았고, 이 시험은 네트워크를 쓰지 않는다.
 */
import assert from 'node:assert/strict';
import { DynamoAlertStore } from '../src/lib/alerts/store-dynamo';
import { deviceHashOf } from '../src/lib/alerts/store';
import type { StoredDevice, TickerSnapshot } from '../src/lib/alerts/types';

let n = 0;
const tests: Array<[string, () => Promise<void>]> = [];
const t = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);

const TABLE = 'signum-watchlist-alerts';
type Item = Record<string, any>;

class FakeDoc {
    items = new Map<string, Item>();
    log: string[] = [];
    /** BatchWrite 첫 시도에서 이 개수만큼을 UnprocessedItems 로 돌려준다(재시도 검증) */
    unprocessOnce = 0;
    pageSize = 2;
    private k(pk: string, sk: string) { return `${pk}\u0000${sk}`; }
    private cond(fail: boolean) { if (fail) { const e: any = new Error('The conditional request failed'); e.name = 'ConditionalCheckFailedException'; throw e; } }

    async send(cmd: any): Promise<any> {
        const name = cmd.constructor.name as string;
        const inp = cmd.input;
        if (inp.TableName && inp.TableName !== TABLE) throw new Error(`wrong table ${inp.TableName}`);
        switch (name) {
            case 'GetCommand': {
                this.log.push(`get ${inp.Key.pk}`);
                const it = this.items.get(this.k(inp.Key.pk, inp.Key.sk));
                return { Item: it ? JSON.parse(JSON.stringify(it)) : undefined };
            }
            case 'PutCommand': {
                const it = inp.Item;
                this.log.push(`put ${it.pk}|${it.sk}`);
                if (inp.ConditionExpression) {
                    assert.equal(inp.ConditionExpression, 'attribute_not_exists(pk)');
                    this.cond(this.items.has(this.k(it.pk, it.sk)));
                }
                this.items.set(this.k(it.pk, it.sk), JSON.parse(JSON.stringify(it)));
                return {};
            }
            case 'DeleteCommand': {
                this.log.push(`del ${inp.Key.pk}|${inp.Key.sk}`);
                this.items.delete(this.k(inp.Key.pk, inp.Key.sk));
                return {};
            }
            case 'UpdateCommand': {
                const key = this.k(inp.Key.pk, inp.Key.sk);
                const cur = this.items.get(key) ?? { pk: inp.Key.pk, sk: inp.Key.sk };
                const v = inp.ExpressionAttributeValues;
                assert.equal(inp.UpdateExpression, 'ADD n :one SET #ttl = if_not_exists(#ttl, :ttl), kind = :k');
                const lim = v[':cap'] ?? v[':limit'];
                this.cond(!(cur.n === undefined || cur.n < lim));
                cur.n = (cur.n ?? 0) + v[':one'];
                if (cur.ttl === undefined) cur.ttl = v[':ttl'];
                cur.kind = v[':k'];
                this.items.set(key, cur);
                this.log.push(`upd ${inp.Key.pk}`);
                return {};
            }
            case 'QueryCommand': {
                assert.equal(inp.KeyConditionExpression, 'pk = :pk');
                const pk = inp.ExpressionAttributeValues[':pk'];
                const all = Array.from(this.items.values()).filter((x) => x.pk === pk).sort((a, b) => (a.sk < b.sk ? -1 : 1));
                const start = inp.ExclusiveStartKey ? all.findIndex((x) => x.sk === inp.ExclusiveStartKey.sk) + 1 : 0;
                const size = Math.min(this.pageSize, inp.Limit ?? Infinity);
                const page = all.slice(start, start + size);
                const more = start + size < all.length;
                this.log.push(`query ${pk}`);
                return { Items: JSON.parse(JSON.stringify(page)), LastEvaluatedKey: more ? { pk, sk: page[page.length - 1].sk } : undefined };
            }
            case 'BatchWriteCommand': {
                let reqs: any[] = inp.RequestItems[TABLE];
                assert.ok(reqs.length <= 25, 'BatchWrite 는 25개 이하');
                const keys = reqs.map((r) => (r.PutRequest ? `${r.PutRequest.Item.pk}|${r.PutRequest.Item.sk}` : `${r.DeleteRequest.Key.pk}|${r.DeleteRequest.Key.sk}`));
                assert.equal(new Set(keys).size, keys.length, '한 BatchWrite 안에 같은 키가 두 번 있으면 DynamoDB 가 거절한다');
                let unprocessed: any[] = [];
                if (this.unprocessOnce > 0) { unprocessed = reqs.slice(-this.unprocessOnce); reqs = reqs.slice(0, -this.unprocessOnce); this.unprocessOnce = 0; }
                for (const r of reqs) {
                    if (r.PutRequest) this.items.set(this.k(r.PutRequest.Item.pk, r.PutRequest.Item.sk), JSON.parse(JSON.stringify(r.PutRequest.Item)));
                    else this.items.delete(this.k(r.DeleteRequest.Key.pk, r.DeleteRequest.Key.sk));
                }
                this.log.push(`batchWrite ${reqs.length}${unprocessed.length ? ` (+${unprocessed.length} unprocessed)` : ''}`);
                return { UnprocessedItems: unprocessed.length ? { [TABLE]: unprocessed } : {} };
            }
            case 'BatchGetCommand': {
                const keys: any[] = inp.RequestItems[TABLE].Keys;
                assert.ok(keys.length <= 100, 'BatchGet 은 100개 이하');
                const found = keys.map((k) => this.items.get(this.k(k.pk, k.sk))).filter(Boolean);
                this.log.push(`batchGet ${keys.length}`);
                return { Responses: { [TABLE]: JSON.parse(JSON.stringify(found)) }, UnprocessedKeys: {} };
            }
        }
        throw new Error(`unexpected command ${name}`);
    }
}

const NOW = Date.UTC(2026, 8, 30, 14, 0);
const TOKEN = 'f'.repeat(64);
const H = deviceHashOf(TOKEN);
const dev = (tickers: StoredDevice['tickers'], over: Partial<StoredDevice> = {}): StoredDevice => ({
    deviceHash: H, rcAppUserId: '$RCAnonymousID:' + 'a'.repeat(32), platform: 'ios', token: TOKEN, locale: 'ko',
    tickers, quiet: null, dailyCap: 3, proUntil: NOW + 30 * 86400_000, updatedAt: NOW, ...over,
});
const mk = () => { const db = new FakeDoc(); return { db, store: new DynamoAlertStore(db as any, TABLE) }; };

t('구독 쓰기: META(원문 토큰·RC ID) → 종목 역색인(T#)·색인(IDX), 키에는 해시만 · TTL 30일', async () => {
    const { db, store } = mk();
    const r = await store.putSubscription(dev([{ t: 'NVDA', events: ['call_wall_break'] }, { t: 'MU', events: ['whale_new'] }]), NOW);
    assert.deepEqual(r, { written: true, removedTickers: [] });
    assert.equal(db.log[0], `get D#${H}`);
    assert.equal(db.log[1], `put D#${H}|META`, 'META 가 종목 항목보다 먼저');
    const meta = db.items.get(`D#${H}\u0000META`)!;
    assert.equal(meta.token, TOKEN);
    assert.equal(meta.ttl, Math.floor(NOW / 1000) + 30 * 86400);
    const sub = db.items.get(`T#NVDA\u0000D#${H}`)!;
    assert.deepEqual(sub.events, ['call_wall_break']);
    assert.ok(db.items.has('IDX\u0000T#MU'));
    for (const k of db.items.keys()) assert.ok(!k.includes(TOKEN), `키에 원문 토큰: ${k}`);
    assert.deepEqual(await store.listSubscribedTickers(), ['MU', 'NVDA']);
    const rs = await store.listTokensForTicker('NVDA');
    assert.deepEqual(rs.map((x) => [x.deviceHash, x.token, x.platform, x.dailyCap]), [[H, TOKEN, 'ios', 3]]);
});

t('종목을 빼면: META(합집합) → 쓰기 → 빠진 T# 삭제 → META 확정 → 구독자 없는 종목은 색인에서도 삭제', async () => {
    const { db, store } = mk();
    await store.putSubscription(dev([{ t: 'NVDA', events: ['call_wall_break'] }, { t: 'MU', events: ['whale_new'] }]), NOW);
    db.log = [];
    const r = await store.putSubscription(dev([{ t: 'NVDA', events: ['call_wall_break', 'gamma_flip_cross'] }], { updatedAt: NOW + 1000 }), NOW + 1000);
    assert.deepEqual(r.removedTickers, ['MU']);
    const order = db.log.filter((x) => x.startsWith('put') || x.startsWith('batchWrite') || x.startsWith('query'));
    assert.deepEqual(order, [`put D#${H}|META`, 'batchWrite 2', 'batchWrite 1', `put D#${H}|META`, 'query T#MU', 'batchWrite 1']);
    assert.equal(db.items.has(`T#MU\u0000D#${H}`), false);
    assert.equal(db.items.has('IDX\u0000T#MU'), false);
    assert.deepEqual((await store.getDevice(H))!.tickers.map((x) => x.t), ['NVDA']);
});

t('같은 내용 3일 안 재동기화는 GetItem 1번뿐(쓰기 0)', async () => {
    const { db, store } = mk();
    const d = dev([{ t: 'NVDA', events: ['call_wall_break'] }]);
    await store.putSubscription(d, NOW);
    db.log = [];
    const r = await store.putSubscription({ ...d, updatedAt: NOW + 3600_000 }, NOW + 3600_000);
    assert.equal(r.written, false);
    assert.deepEqual(db.log, [`get D#${H}`]);
});

t('BatchWrite 의 UnprocessedItems 는 다시 보낸다(조용히 버리지 않는다) · 25개씩 나눈다', async () => {
    const { db, store } = mk();
    db.unprocessOnce = 3;
    const tickers = Array.from({ length: 20 }, (_, i) => ({ t: `T${String(i).padStart(2, '0')}`, events: ['whale_new' as const] }));
    await store.putSubscription(dev(tickers), NOW);
    assert.equal(Array.from(db.items.keys()).filter((k) => k.startsWith('T#')).length, 20);
    assert.equal(Array.from(db.items.keys()).filter((k) => k.startsWith('IDX')).length, 20);
    assert.ok(db.log.some((x) => x.includes('unprocessed')));
});

t('삭제: 종목 항목 → META 순 · META 가 없어도 힌트 종목의 고아 항목을 지운다', async () => {
    const { db, store } = mk();
    await store.putSubscription(dev([{ t: 'NVDA', events: ['call_wall_break'] }]), NOW);
    assert.deepEqual(await store.deleteSubscription(H), { deleted: true });
    assert.equal(db.items.size, 0);
    // 고아: META 없이 T# 만 남은 경우(쓰기 도중 실패의 흔적)
    db.items.set(`T#AAPL\u0000D#${H}`, { pk: 'T#AAPL', sk: `D#${H}`, token: TOKEN });
    db.items.set('IDX\u0000T#AAPL', { pk: 'IDX', sk: 'T#AAPL' });
    assert.deepEqual(await store.deleteSubscription(H), { deleted: false }, '힌트 없이 META 도 없으면 찾을 수 없다');
    assert.deepEqual(await store.deleteSubscription(H, ['AAPL']), { deleted: true });
    assert.equal(db.items.size, 0);
});

t('중복 억제(조건부 쓰기): 첫 기록만 true · 이미 있으면 false · wasSent', async () => {
    const { db, store } = mk();
    assert.equal(await store.recordSent('NVDA', 'call_wall_break', '2026-09-30', NOW), true);
    assert.equal(await store.recordSent('NVDA', 'call_wall_break', '2026-09-30', NOW), false);
    assert.equal(await store.recordSent('NVDA', 'call_wall_break', '2026-10-01', NOW), true);
    assert.equal(await store.wasSent('NVDA', 'call_wall_break', '2026-09-30'), true);
    assert.equal(await store.wasSent('NVDA', 'put_floor_break', '2026-09-30'), false);
    const it = db.items.get('S#NVDA#call_wall_break#2026-09-30\u0000S')!;
    assert.equal(it.ttl, Math.floor(NOW / 1000) + 4 * 86400);
});

t('하루 상한(원자적 ADD + 조건): 상한 3 → 3번 true, 4번째 false · 요청 수 제한도 같은 방식', async () => {
    const { store } = mk();
    const got = [];
    for (let i = 0; i < 4; i++) got.push(await store.tryConsumeDaily(H, '2026-09-30', 3, NOW));
    assert.deepEqual(got, [true, true, true, false]);
    assert.equal(await store.sentCount(H, '2026-09-30'), 3);
    assert.equal(await store.sentCount(H, '2026-10-01'), 0);
    const rl = [];
    for (let i = 0; i < 3; i++) rl.push(await store.rateHit('ip:abc', 600, 2, NOW));
    assert.deepEqual(rl, [true, true, false]);
    assert.equal(await store.rateHit('ip:abc', 600, 2, NOW + 600_000), true, '다음 창은 새로 센다');
});

t('스냅샷: 단계별 입력(장외 이력·고래·실적)은 저장하지 않는다 · 100개씩 읽기 · 색인 페이지 넘김', async () => {
    const { db, store } = mk();
    const s: TickerSnapshot = {
        ticker: 'NVDA', at: NOW, session: '2026-09-30', bar: { close: 250, endMs: NOW, session: '2026-09-30' }, levels: null,
        arms: { callWall: { level: 260, side: 'below', armedAt: NOW, session: '2026-09-30', levelAsOf: NOW } },
        darkPool: { date: '2026-09-30', pct: 50, series: { dates: ['2026-09-29'], pct: [40] } },
        whale: { date: '2026-09-29', contracts: [] },
        earnings: { date: '2026-10-01', timing: 'amc', impliedMovePct: 5 },
    };
    await store.saveSnapshots([s], NOW);
    const saved = db.items.get('P#NVDA\u0000SNAP')!;
    assert.equal(saved.snap.darkPool, undefined);
    assert.equal(saved.snap.whale, undefined);
    assert.equal(saved.snap.earnings, undefined);
    assert.equal(saved.snap.arms.callWall.level, 260);
    const loaded = await store.loadSnapshots(['NVDA', 'MU']);
    assert.deepEqual(Object.keys(loaded), ['NVDA']);
    for (const x of ['A', 'B', 'C', 'D', 'E']) db.items.set(`IDX\u0000T#${x}`, { pk: 'IDX', sk: `T#${x}`, ttl: Math.floor(NOW / 1000) + 100 });
    db.items.set('IDX\u0000T#OLD', { pk: 'IDX', sk: 'T#OLD', ttl: 1 });   // TTL 지났는데 아직 안 지워진 항목
    assert.deepEqual(await store.listSubscribedTickers(), ['A', 'B', 'C', 'D', 'E']);
});

t('PRO 만료 갱신은 META 와 모든 종목 항목에 같이 쓴다(발송 경로가 한 번의 Query 로 보는 값)', async () => {
    const { store } = mk();
    await store.putSubscription(dev([{ t: 'NVDA', events: ['call_wall_break'] }, { t: 'MU', events: ['whale_new'] }]), NOW);
    const until = NOW + 60 * 86400_000;
    await store.updateProUntil(H, until, NOW + 1);
    assert.equal((await store.getDevice(H))!.proUntil, until);
    assert.deepEqual((await store.listTokensForTicker('MU')).map((x) => x.proUntil), [until]);
    assert.deepEqual((await store.listTokensForTicker('NVDA')).map((x) => x.proUntil), [until]);
});

t('표 이름·완료 표식', async () => {
    const { db, store } = mk();
    assert.equal(await store.getMarker('whale:2026-09-29'), null);
    await store.setMarker('whale:2026-09-29', 'x', 3 * 86400, NOW);
    assert.equal(await store.getMarker('whale:2026-09-29'), 'x');
    const bad = new DynamoAlertStore(db as any, 'other-table');
    await assert.rejects(() => bad.getMarker('x'), /wrong table/);
});

(async () => {
    for (const [name, fn] of tests) {
        await fn();
        n++;
        console.log(`  ✓ ${name}`);
    }
    console.log(`\n${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
