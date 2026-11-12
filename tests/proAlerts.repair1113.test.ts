/**
 * PRO 가격 레벨 알림 — 11/13 야간 교차 검토(nightly-20261113) 중간 3건 재현·수리 시험
 *   ① 기기 상한 묶음: 30일 지난 기기 점수가 새 기기 등록을 막지 않는다(Lua — 실제 Redis 시험은 proAlerts.bind.live.ts)
 *   ② 교차 관측 저장 시점: 중간 오류로 실행이 끝나도 알림이 영구 누락되지 않는다
 *   ③ 발송 성공 뒤 «보냄» 기록 실패: 재시도로 화면 상태(fired)와 맞추고 중복 발송을 막는다
 * 실행: TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' node -r ts-node/register/transpile-only -r tsconfig-paths/register tests/proAlerts.repair1113.test.ts
 */
import assert from 'node:assert/strict';
import { PA_BIND_LUA, PA_CFG, PA_KEYS, paDevKey, bindCutoff, type ProAlertRecord, type StoredLevel } from '../src/lib/proAlerts/core';
import { runProAlerts, type PaDeps, type PaOutcome, type PaSendItem, type PaStore } from '../src/lib/proAlerts/run';

const tests: Array<[string, () => void | Promise<void>]> = [];
const t = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

/** 시간(TTL)을 아는 메모리 저장소 — 키마다 만료 시각을 기록하고 clock 으로 지운다 */
class Mem implements PaStore {
    m = new Map<string, string>();
    exp = new Map<string, number>();
    sets = new Map<string, Set<string>>();
    clock = 0;
    fail: ((op: string, keys: string[], value?: string) => boolean) | null = null;
    private gc() { for (const [k, e] of this.exp) if (e <= this.clock) { this.m.delete(k); this.exp.delete(k); } }
    private chk(op: string, keys: string[], value?: string) { this.gc(); if (this.fail?.(op, keys, value)) throw new Error(`redis ${op} failed`); }
    async smembers(k: string) { this.chk('smembers', [k]); return [...(this.sets.get(k) ?? [])]; }
    async mget(keys: string[]) { this.chk('mget', keys); return keys.map((k) => (this.m.has(k) ? JSON.parse(this.m.get(k)!) : null)); }
    async get(k: string) { this.chk('get', [k]); return this.m.has(k) ? JSON.parse(this.m.get(k)!) : null; }
    async setNx(k: string, v: string, ex: number) { this.chk('setNx', [k], v); if (this.m.has(k)) return false; this.put(k, v, ex); return true; }
    async set(k: string, v: string, ex?: number) { this.chk('set', [k], v); this.put(k, v, ex); }
    async incr(k: string) { this.chk('incr', [k]); const n = (Number(this.m.has(k) ? JSON.parse(this.m.get(k)!) : 0) || 0) + 1; this.m.set(k, JSON.stringify(n)); return n; }
    async decr(k: string) { this.chk('decr', [k]); const n = (Number(this.m.has(k) ? JSON.parse(this.m.get(k)!) : 0) || 0) - 1; this.m.set(k, JSON.stringify(n)); return n; }
    async del(keys: string[]) { this.chk('del', keys); for (const k of keys) { this.m.delete(k); this.exp.delete(k); } }
    async srem(k: string, ms: string[]) { this.chk('srem', [k]); for (const x of ms) this.sets.get(k)?.delete(x); }
    async sremIfGone(devs: string[]) { for (const d of devs) if (!this.m.has(PA_KEYS.rec(d))) this.sets.get(PA_KEYS.idx)?.delete(d); }
    put(k: string, v: string, ex?: number) {
        this.m.set(k, JSON.stringify(v.startsWith('{') || v.startsWith('[') ? JSON.parse(v) : v));
        if (ex) this.exp.set(k, this.clock + ex * 1000); else this.exp.delete(k);
    }
    raw(k: string) { this.gc(); return this.m.has(k) ? JSON.parse(this.m.get(k)!) : null; }
    ttlMs(k: string) { return (this.exp.get(k) ?? Infinity) - this.clock; }
    sadd(k: string, x: string) { const s = this.sets.get(k) ?? new Set(); s.add(x); this.sets.set(k, s); }
}

const D = '2026-11-12';
const T10 = Date.parse('2026-11-12T15:00:00Z');   // 10:00 ET(정규장)
const TOK = 'c3'.repeat(32);
const DEV = paDevKey(TOK);
const lv = (extra: Partial<StoredLevel> = {}): StoredLevel => ({ t: 'NVDA', id: 'abcd1', dir: 'up', px: 100, on: true, rev: 1, armedAt: T10 - 3600_000, ...extra });

function setup(levels: StoredLevel[] = [lv()]) {
    const s = new Mem();
    s.clock = T10;
    const rec: ProAlertRecord = {
        v: 1, dev: DEV, token: TOK, platform: 'ios', locale: 'ko', tz: 'America/New_York', uidHash: 'uY', uidEnc: null,
        proUntil: T10 + 86400_000, levels, updatedAt: T10 - 3600_000,
    };
    s.m.set(PA_KEYS.rec(DEV), JSON.stringify(rec));
    s.sadd(PA_KEYS.idx, DEV);
    s.m.set(`push:tokens:${TOK}`, JSON.stringify({ token: TOK, platform: 'ios', app: 'signum', preferences: { enabled: true } }));
    return s;
}

function deps(s: Mem, price: number, at: number, outcome: PaOutcome = 'ok') {
    const sent: PaSendItem[] = [];
    const d: PaDeps = {
        store: s,
        prices: { read: async (tickers) => { const m = new Map<string, { p: number; at: number }>(); for (const x of tickers) m.set(x, { p: price, at }); return { prices: m, hub: m.size, vendor: 0, missing: 0, vendorCalls: 0 }; } },
        sender: { send: async (items) => { sent.push(...items); return new Map(items.map((i) => [i.id, outcome] as const)); } },
        reverify: null,
    };
    return { d, sent };
}

/** 5분 간격 크론 한 번 — 시계를 옮기고 잠금을 푼 뒤 돌린다. 던지면 그 오류를 돌려준다 */
async function tick(s: Mem, minute: number, price: number, outcome: PaOutcome = 'ok') {
    s.clock = T10 + minute * 60_000;
    s.m.delete(PA_KEYS.lock);
    const a = deps(s, price, s.clock - 1000, outcome);
    try { const r = await runProAlerts(a.d, { now: s.clock, kind: 'cron' }); return { r, sent: a.sent, err: null as Error | null }; }
    catch (e) { return { r: null, sent: a.sent, err: e as Error }; }
}

console.log('━━━ ② 교차 관측 저장 시점 ━━━');
t('교차한 실행이 «보냄 기록 조회»에서 죽어도 다음 실행이 보낸다(관측을 앞당겨 저장하지 않음)', async () => {
    const s = setup();
    assert.equal((await tick(s, 0, 99)).sent.length, 0, '기준점');
    s.fail = (op, keys) => op === 'mget' && keys.some((k) => k.startsWith('push:pro-alerts:v1:f:'));
    const r1 = await tick(s, 5, 101);
    assert.ok(r1.err, '중간 오류로 실행이 끝난다');
    assert.equal(r1.sent.length, 0);
    s.fail = null;
    const r2 = await tick(s, 10, 101.2);
    assert.equal(r2.err, null);
    assert.equal(r2.sent.length, 1, '가격이 레벨 위에 머물러 있어도 다음 실행이 보낸다');
    assert.equal(s.raw(PA_KEYS.fired(DEV, 'abcd1', 1))?.s, 'sent');
});
t('claim 을 잡은 뒤 죽은 실행 — 장부가 풀린 뒤(10분) 대기 표식으로 다시 보낸다', async () => {
    const s = setup();
    await tick(s, 0, 99);
    s.fail = (op, keys) => op === 'incr' && keys[0].startsWith('push:pro-alerts:v1:cap:');
    const r1 = await tick(s, 5, 101);
    assert.ok(r1.err);
    assert.equal(s.raw(PA_KEYS.fired(DEV, 'abcd1', 1))?.s, 'claim', '잡는 중 장부가 남았다(10분 뒤 풀림)');
    s.fail = null;
    const r2 = await tick(s, 10, 101.1);
    assert.equal(r2.sent.length, 0, '장부가 살아 있는 동안은 보내지 않는다(이중 발송 방지)');
    assert.ok(s.raw(PA_KEYS.pend(DEV, 'abcd1', 1)), '대신 대기 표식을 남긴다');
    const r3 = await tick(s, 16, 101.3);
    assert.equal(r3.sent.length, 1, '장부가 풀린 뒤 한 번 보낸다');
    const r4 = await tick(s, 21, 101.4);
    assert.equal(r4.sent.length, 0, '한 번만');
    assert.equal(s.raw(PA_KEYS.pend(DEV, 'abcd1', 1)), null);
});
t('못 보낸 교차의 대기 표식 쓰기가 실패하면 그 종목 관측을 넘기지 않는다(다음 실행이 다시 교차로 본다)', async () => {
    const s = setup();
    await tick(s, 0, 99);
    s.fail = (op, keys) => op === 'set' && keys[0].startsWith('push:pro-alerts:v1:pend:');
    const r1 = await tick(s, 5, 101, 'fail');
    assert.equal(r1.err, null);
    assert.equal(s.raw(PA_KEYS.pend(DEV, 'abcd1', 1)), null, '대기 표식 쓰기 실패');
    assert.equal(s.raw(PA_KEYS.tick('NVDA'))?.p, 99, '관측은 99 그대로');
    s.fail = null;
    const r2 = await tick(s, 10, 101.2);
    assert.equal(r2.sent.length, 1);
});
t('정상 흐름은 그대로 — 교차 없는 실행·보낸 실행 모두 관측을 새 값으로', async () => {
    const s = setup();
    await tick(s, 0, 99);
    assert.equal(s.raw(PA_KEYS.tick('NVDA'))?.p, 99);
    const r = await tick(s, 5, 101);
    assert.equal(r.sent.length, 1);
    assert.equal(s.raw(PA_KEYS.tick('NVDA'))?.p, 101);
    await tick(s, 10, 98);
    assert.equal(s.raw(PA_KEYS.tick('NVDA'))?.p, 98);
});

console.log('━━━ ③ 발송 성공 뒤 «보냄» 기록 실패 ━━━');
t('«보냄» 쓰기가 한두 번 실패해도 다시 써서 30일 기록·화면 상태가 맞는다 → 10분 뒤 재교차에도 중복 0', async () => {
    const s = setup();
    await tick(s, 0, 99);
    let left = 2;
    s.fail = (op, keys, v) => op === 'set' && keys[0] === PA_KEYS.fired(DEV, 'abcd1', 1) && !!v && v.includes('"sent"') && left-- > 0;
    const r1 = await tick(s, 5, 101);
    assert.equal(r1.err, null);
    assert.equal(r1.sent.length, 1);
    const f = s.raw(PA_KEYS.fired(DEV, 'abcd1', 1));
    assert.equal(f?.s, 'sent', '앱이 받는 fired 에 «보냄»으로 나온다');
    assert.ok(s.ttlMs(PA_KEYS.fired(DEV, 'abcd1', 1)) > 29 * 86400_000, '30일 기록');
    s.fail = null;
    await tick(s, 11, 99.5);       // 아래로 돌아왔다가
    const r3 = await tick(s, 16, 100.5);   // 장부 10분이 지난 뒤 다시 넘는다
    assert.equal(r3.sent.length, 0, '같은 (id, rev)는 다시 보내지 않는다');
});
t('«보냄» 쓰기가 실행 내내 실패하면 — 오류를 보고에 남기고, 장부가 살아 있는 동안 다음 실행이 기록을 고친다', async () => {
    const s = setup();
    await tick(s, 0, 99);
    s.fail = (op, keys, v) => op === 'set' && keys[0] === PA_KEYS.fired(DEV, 'abcd1', 1) && !!v && v.includes('"sent"');
    const r1 = await tick(s, 5, 101);
    assert.equal(r1.sent.length, 1);
    assert.ok(r1.r!.notes.some((n) => n.startsWith('sent-record-failed')), '보고 notes 에 남는다');
    assert.equal(s.raw(PA_KEYS.fired(DEV, 'abcd1', 1))?.s, 'claim');
    s.fail = null;
    const r2 = await tick(s, 10, 101.2);   // Redis 회복 — 장부(10분)가 아직 살아 있다
    assert.equal(r2.sent.length, 0);
    assert.equal(s.raw(PA_KEYS.fired(DEV, 'abcd1', 1))?.s, 'sent', '다음 실행이 «보냄»으로 고친다');
    assert.ok(s.ttlMs(PA_KEYS.fired(DEV, 'abcd1', 1)) > 29 * 86400_000);
    await tick(s, 15, 99.5);
    const r4 = await tick(s, 20, 100.5);
    assert.equal(r4.sent.length, 0, '중복 0');
});

console.log('━━━ 관문 11130633 ━━━');
t('공급사가 받은 직후 실행이 죽어도(보냄 기록 전) 다음 실행·장부가 풀린 뒤에도 같은 교차로 다시 보내지 않는다', async () => {
    const s = setup();
    await tick(s, 0, 99);
    s.clock = T10 + 5 * 60_000;
    s.m.delete(PA_KEYS.lock);
    const a = deps(s, 101, s.clock - 1000);
    let accepted = 0;
    a.d.sender = { send: async (items) => { accepted += items.length; throw new Error('function timeout after provider accepted'); } };
    await assert.rejects(runProAlerts(a.d, { now: s.clock, kind: 'cron' }));
    assert.equal(accepted, 1);
    assert.equal(s.raw(PA_KEYS.tick('NVDA'))?.p, 101, '관측은 발송 전에 넘어갔다');
    const r2 = await tick(s, 10, 101.2);
    const r3 = await tick(s, 16, 101.3);   // 장부(10분) 풀린 뒤
    assert.equal(r2.sent.length + r3.sent.length, 0, '중복 0');
});
t('대기 재시도로 보내는 중 실행이 죽어도(공급사 수신 뒤) 장부가 풀린 뒤 다시 보내지 않는다 · 재시도가 또 실패하면 대기 표식을 다시 쓴다', async () => {
    const s = setup();
    await tick(s, 0, 99);
    await tick(s, 5, 101, 'fail');
    assert.ok(s.raw(PA_KEYS.pend(DEV, 'abcd1', 1)), '첫 실패 → 대기');
    s.clock = T10 + 10 * 60_000;
    s.m.delete(PA_KEYS.lock);
    const a = deps(s, 101.2, s.clock - 1000);
    let accepted = 0;
    a.d.sender = { send: async (items) => { accepted += items.length; throw new Error('killed after provider accepted'); } };
    await assert.rejects(runProAlerts(a.d, { now: s.clock, kind: 'cron' }));
    assert.equal(accepted, 1);
    const later = [await tick(s, 15, 101.3), await tick(s, 21, 101.4), await tick(s, 26, 101.5)];
    assert.equal(later.reduce((n, x) => n + x.sent.length, 0), 0, '중복 0');
    // 재시도 실패는 다시 대기
    const s2 = setup();
    await tick(s2, 0, 99);
    await tick(s2, 5, 101, 'fail');
    await tick(s2, 10, 101.2, 'fail');
    assert.ok(s2.raw(PA_KEYS.pend(DEV, 'abcd1', 1)), '재시도 실패 → 대기 표식 유지');
    const r = await tick(s2, 15, 101.3);
    assert.equal(r.sent.length, 1);
});
t('대기 표식이 남은 채 가격이 내려갔다 다시 넘으면(새 교차) — 보내는 중 죽어도 중복 0', async () => {
    const s = setup();
    await tick(s, 0, 99);
    await tick(s, 5, 101, 'fail');
    assert.ok(s.raw(PA_KEYS.pend(DEV, 'abcd1', 1)));
    await tick(s, 10, 99.5);   // 레벨 아래 — 대기 재시도 안 함
    s.clock = T10 + 15 * 60_000;
    s.m.delete(PA_KEYS.lock);
    const a = deps(s, 100.4, s.clock - 1000);
    let accepted = 0;
    a.d.sender = { send: async (items) => { accepted += items.length; throw new Error('killed after provider accepted'); } };
    await assert.rejects(runProAlerts(a.d, { now: s.clock, kind: 'cron' }));
    assert.equal(accepted, 1);
    assert.equal(s.raw(PA_KEYS.pend(DEV, 'abcd1', 1)), null, '새 교차로 보낼 때도 표식을 먼저 지운다');
    const later = [await tick(s, 20, 100.6), await tick(s, 26, 100.7), await tick(s, 31, 100.8)];
    assert.equal(later.reduce((n, x) => n + x.sent.length, 0), 0);
});
t('대기 표식을 지우지 못하면 이번엔 보내지 않는다(장부·상한 되돌림) → 다음 실행이 한 번 보낸다', async () => {
    const s = setup();
    await tick(s, 0, 99);
    await tick(s, 5, 101, 'fail');
    s.fail = (op, keys) => op === 'del' && keys.some((k) => k.startsWith('push:pro-alerts:v1:pend:'));
    const r1 = await tick(s, 10, 101.2);
    s.fail = null;
    assert.equal(r1.sent.length, 0);
    assert.ok(r1.r!.notes.some((n) => n.startsWith('pend-clear-failed')));
    assert.equal(s.raw(PA_KEYS.fired(DEV, 'abcd1', 1)), null, '장부 되돌림');
    assert.equal(s.raw(PA_KEYS.cap(D, DEV)), 0, '상한 되돌림');
    const r2 = await tick(s, 15, 101.3);
    assert.equal(r2.sent.length, 1);
    const r3 = await tick(s, 20, 101.4);
    assert.equal(r3.sent.length, 0);
});
t('대기 표식 삭제가 실제로는 처리됐는데 응답만 잃은 경우 — 표식을 다시 써서 다음 실행이 보낸다', async () => {
    const s = setup();
    await tick(s, 0, 99);
    await tick(s, 5, 101, 'fail');
    const realDel = s.del.bind(s);
    let lost = true;
    s.del = async (keys: string[]) => { await realDel(keys); if (lost && keys.some((k) => k.startsWith('push:pro-alerts:v1:pend:'))) { lost = false; throw new Error('response lost'); } };
    const r1 = await tick(s, 10, 101.2);
    assert.equal(r1.sent.length, 0);
    assert.ok(s.raw(PA_KEYS.pend(DEV, 'abcd1', 1)), '표식 다시 씀');
    const r2 = await tick(s, 15, 101.3);
    assert.equal(r2.sent.length, 1);
});
t('수리 표식은 30일 — 장 마감·다음 날을 넘겨도 재교차에 다시 보내지 않고, 앱 fired 에 «보냄»(설정 API 가 대기 키 sent 를 읽음)', async () => {
    const s = setup();
    await tick(s, 0, 99);
    s.fail = (op, keys, v) => op === 'set' && keys[0] === PA_KEYS.fired(DEV, 'abcd1', 1) && !!v && v.includes('"sent"');
    const r1 = await tick(s, 5, 101);
    assert.equal(r1.sent.length, 1);
    s.fail = null;
    const pend = s.raw(PA_KEYS.pend(DEV, 'abcd1', 1));
    assert.ok(Number(pend?.sent) > 0, '수리 표식');
    assert.ok(s.ttlMs(PA_KEYS.pend(DEV, 'abcd1', 1)) > 29 * 86400_000, '30일');
    // 다음 날 장중(장부·대기 30분 모두 지난 뒤) — 첫 실행은 기준점 · 그 다음 재교차
    const day = 24 * 60;
    await tick(s, day, 99);
    const r3 = await tick(s, day + 5, 100.5);
    assert.equal(r3.sent.length, 0, '중복 0');
    assert.equal(s.raw(PA_KEYS.fired(DEV, 'abcd1', 1))?.s, 'sent', '첫 실행이 기록을 고쳤다');
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/app/api/app/watchlist/alerts/route.ts'), 'utf8');
    assert.ok(/PA_KEYS\.pend\(dev, l\.id, l\.rev\)/.test(src) && /pm\.sent/.test(src), '설정 API 가 수리 표식도 보냄으로 알린다');
});
t('발송 실패 뒤 대기 표식을 못 쓰면 관측을 직전 값으로 되돌린다 — 같은 종목의 이미 보낸 레벨은 다시 보내지 않는다', async () => {
    const s = setup([lv(), lv({ id: 'abcd2', px: 100.5 })]);
    await tick(s, 0, 99);
    s.clock = T10 + 5 * 60_000;
    s.m.delete(PA_KEYS.lock);
    const a = deps(s, 101, s.clock - 1000);
    a.d.sender = { send: async (items) => new Map(items.map((i) => [i.id, i.id.endsWith(':abcd1:1') ? 'ok' as const : 'fail' as const])) };
    s.fail = (op, keys) => op === 'set' && keys[0].startsWith('push:pro-alerts:v1:pend:');
    await runProAlerts(a.d, { now: s.clock, kind: 'cron' });
    s.fail = null;
    assert.equal(s.raw(PA_KEYS.tick('NVDA'))?.p, 99, '되돌림');
    const r2 = await tick(s, 10, 101.2);
    assert.deepEqual(r2.sent.map((x) => x.data.lid), ['abcd2'], '못 보낸 것만 다시');
});
t('not_pro 저장은 기록 수명을 늘리지 않는다(KEEPTTL) · 묶음은 기록 만료 10분 뒤에야 걷는다', () => {
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/app/api/app/watchlist/alerts/route.ts'), 'utf8');
    assert.ok(src.includes("JSON.stringify({ ...prev, proUntil: 0 }), { keepTtl: true }"));
    assert.equal(bindCutoff(T10), T10 - PA_CFG.recordTtlSec * 1000 - 10 * 60_000);
});

console.log('━━━ ① 기기 상한 묶음(Lua 문안) ━━━');
t('묶음 Lua 가 확인 전에 30일 지난 점수를 걷는다 · 기준 시각 = 지금 − 기록 수명', () => {
    const i = PA_BIND_LUA.indexOf('ZREMRANGEBYSCORE');
    assert.ok(i >= 0 && i < PA_BIND_LUA.indexOf('ZSCORE') && i < PA_BIND_LUA.indexOf('ZCARD'));
    assert.ok(bindCutoff(T10) < T10 - PA_CFG.recordTtlSec * 1000);
});

(async () => {
    let n = 0;
    const bad: string[] = [];
    for (const [name, fn] of tests) {
        try { await fn(); n++; console.log(`  ✓ ${name}`); }
        catch (e) { bad.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message.split('\n')[0]}`); }
    }
    console.log(`\n${n}개 통과${bad.length ? ` · ${bad.length}개 실패` : ''}`);
    if (bad.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
