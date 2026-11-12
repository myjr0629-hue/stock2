/**
 * PRO 가격 레벨 알림 실행기 — 기준점·교차·중복 claim·하루 상한·PRO 재확인 실패·장 시간·무료 경로 불변 시험 (2026-11-12)
 * 실행: TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' node -r ts-node/register/transpile-only -r tsconfig-paths/register tests/proAlerts.run.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { PA_CFG, PA_KEYS, paDevKey, type ProAlertRecord, type StoredLevel } from '../src/lib/proAlerts/core';
import { runProAlerts, tokenAllows, type PaDeps, type PaOutcome, type PaSendItem, type PaStore } from '../src/lib/proAlerts/run';

const ROOT = path.join(__dirname, '..');
const tests: Array<[string, () => void | Promise<void>]> = [];
const t = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

class Mem implements PaStore {
    m = new Map<string, string>();
    sets = new Map<string, Set<string>>();
    writes: string[] = [];
    async smembers(k: string) { return [...(this.sets.get(k) ?? [])]; }
    async mget(keys: string[]) { return keys.map((k) => (this.m.has(k) ? JSON.parse(this.m.get(k)!) : null)); }
    async get(k: string) { return this.m.has(k) ? JSON.parse(this.m.get(k)!) : null; }
    async setNx(k: string, v: string) { this.writes.push(k); if (this.m.has(k)) return false; this.m.set(k, JSON.stringify(v)); return true; }
    async set(k: string, v: string) { this.writes.push(k); this.m.set(k, JSON.stringify(v.startsWith('{') || v.startsWith('[') ? JSON.parse(v) : v)); }
    async incr(k: string) { this.writes.push(k); const n = (Number(this.m.has(k) ? JSON.parse(this.m.get(k)!) : 0) || 0) + 1; this.m.set(k, JSON.stringify(n)); return n; }
    async decr(k: string) { this.writes.push(k); const n = (Number(this.m.has(k) ? JSON.parse(this.m.get(k)!) : 0) || 0) - 1; this.m.set(k, JSON.stringify(n)); return n; }
    async del(keys: string[]) { for (const k of keys) { this.writes.push(k); this.m.delete(k); } }
    async srem(k: string, ms: string[]) { this.writes.push(k); for (const x of ms) this.sets.get(k)?.delete(x); }
    sadd(k: string, x: string) { const s = this.sets.get(k) ?? new Set(); s.add(x); this.sets.set(k, s); }
}

const D = '2026-11-12';
const T10 = Date.parse('2026-11-12T15:00:00Z');   // 10:00 ET(정규장)
const TOK = 'b2'.repeat(32);
const DEV = paDevKey(TOK);
const lv = (extra: Partial<StoredLevel> = {}): StoredLevel => ({ t: 'NVDA', id: 'abcd1', dir: 'up', px: 200, on: true, rev: 1, armedAt: T10 - 3600_000, ...extra });

function setup(opts: { levels?: StoredLevel[]; proUntil?: number; tokenRec?: unknown; tz?: string } = {}) {
    const s = new Mem();
    const rec: ProAlertRecord = {
        v: 1, dev: DEV, token: TOK, platform: 'ios', locale: 'ko', tz: opts.tz ?? 'Asia/Seoul', uidHash: 'uX', uidEnc: null,
        proUntil: opts.proUntil ?? T10 + 3600_000, levels: opts.levels ?? [lv()], updatedAt: T10 - 3600_000,
    };
    s.m.set(PA_KEYS.rec(DEV), JSON.stringify(rec));
    s.sadd(PA_KEYS.idx, DEV);
    s.m.set(`push:tokens:${TOK}`, JSON.stringify(opts.tokenRec ?? { token: TOK, platform: 'ios', app: 'signum', preferences: { enabled: true, morning: true, closing: true } }));
    return s;
}

function deps(s: Mem, price: Record<string, number>, at: number, o: { outcome?: PaOutcome; reverify?: PaDeps['reverify'] } = {}) {
    const sent: PaSendItem[] = [];
    let vendorAllowed: boolean | null = null;
    const d: PaDeps = {
        store: s,
        prices: { read: async (tickers, _now, opts) => { vendorAllowed = opts.allowVendor; const m = new Map<string, { p: number; at: number }>(); for (const x of tickers) if (price[x]) m.set(x, { p: price[x], at }); return { prices: m, hub: m.size, vendor: 0, missing: tickers.length - m.size, vendorCalls: 0 }; } },
        sender: { send: async (items) => { sent.push(...items); return new Map(items.map((i) => [i.id, o.outcome ?? 'ok'] as const)); } },
        reverify: o.reverify ?? null,
    };
    return { d, sent, vendorAllowed: () => vendorAllowed };
}

const run = (d: PaDeps, now: number, kind: 'cron' | 'preview' = 'cron') => runProAlerts(d, { now, kind });
const freeLock = (s: Mem) => s.m.delete(PA_KEYS.lock);

console.log('━━━ 실행기 ━━━');
t('첫 관측 = 기준점(발송 0) → 다음 관측이 레벨을 건너면 1통', async () => {
    const s = setup();
    const a = deps(s, { NVDA: 199 }, T10);
    const r1 = await run(a.d, T10 + 1000);
    assert.equal(r1.status, 'ok'); assert.equal(a.sent.length, 0);
    freeLock(s);
    const b = deps(s, { NVDA: 200.5 }, T10 + 300_000);
    const r2 = await run(b.d, T10 + 301_000);
    assert.equal(b.sent.length, 1);
    assert.equal(r2.sent?.ok, 1);
    const it = b.sent[0];
    assert.equal(it.token, TOK);
    assert.equal(it.data.type, 'wl_signal'); assert.equal(it.data.src, 'push_sig_price'); assert.equal(it.data.path, '/app-view/flow?t=NVDA&from=sig');
    assert.ok(it.title.includes('NVDA') && it.title.includes('200.00'));
    assert.ok(s.m.has(PA_KEYS.fired(DEV, 'abcd1', 1)));
});
t('중복 claim — 같은 (id, rev)는 다시 건너도 보내지 않는다 · rev 를 올리면 다시 무장', async () => {
    const s = setup();
    s.m.set(PA_KEYS.fired(DEV, 'abcd1', 1), JSON.stringify({ at: 1, px: 200 }));
    s.m.set(PA_KEYS.tick('NVDA'), JSON.stringify({ p: 199, at: T10, d: D }));
    const a = deps(s, { NVDA: 201 }, T10 + 300_000);
    const r = await run(a.d, T10 + 301_000);
    assert.equal(a.sent.length, 0);
    assert.equal(r.crossings[0].why, 'sent');
    // rev 2 (무장 시각이 직전 관측보다 앞)
    const s2 = setup({ levels: [lv({ rev: 2 })] });
    s2.m.set(PA_KEYS.fired(DEV, 'abcd1', 1), JSON.stringify({ at: 1, px: 200 }));
    s2.m.set(PA_KEYS.tick('NVDA'), JSON.stringify({ p: 199, at: T10, d: D }));
    const b = deps(s2, { NVDA: 201 }, T10 + 300_000);
    await run(b.d, T10 + 301_000);
    assert.equal(b.sent.length, 1);
});
t('동시 실행 경합 — 잠금이 두 번째 실행을 막고, 잠금이 없어도 claim(SET NX)이 한 통만 남긴다', async () => {
    const s = setup();
    s.m.set(PA_KEYS.tick('NVDA'), JSON.stringify({ p: 199, at: T10, d: D }));
    const a = deps(s, { NVDA: 201 }, T10 + 300_000);
    const [r1, r2] = await Promise.all([run(a.d, T10 + 301_000), run(a.d, T10 + 301_000)]);
    assert.deepEqual([r1.status, r2.status].sort(), ['locked', 'ok']);
    assert.equal(a.sent.length, 1);
    // 잠금을 지운 뒤 같은 직전 값으로 다시 돌려도(크론 겹침 흉내) claim 때문에 0
    freeLock(s);
    s.m.set(PA_KEYS.tick('NVDA'), JSON.stringify({ p: 199, at: T10, d: D }));
    const b = deps(s, { NVDA: 201 }, T10 + 300_000);
    await run(b.d, T10 + 302_000);
    assert.equal(b.sent.length, 0);
});
t('하루 상한(PRO 전용 키) — 넘으면 보내지 않고 claim 을 되돌린다 · 무료 상한 키는 건드리지 않는다', async () => {
    const levels = Array.from({ length: 5 }, (_, i) => lv({ id: `lvl0${i}`, px: 200 + i * 0.1 }));
    const s = setup({ levels });
    s.m.set(PA_KEYS.cap(D, DEV), JSON.stringify(PA_CFG.deviceDailyCap - 1));
    s.m.set(PA_KEYS.tick('NVDA'), JSON.stringify({ p: 199, at: T10, d: D }));
    const a = deps(s, { NVDA: 205 }, T10 + 300_000);
    const r = await run(a.d, T10 + 301_000);
    assert.equal(a.sent.length, 1, '상한까지 1통');
    assert.equal(r.sent?.capped, 1, '상한에 닿으면 그 기기는 이번 실행에서 멈춘다');
    assert.equal(s.m.get(PA_KEYS.cap(D, DEV)), JSON.stringify(PA_CFG.deviceDailyCap));
    const claims = [...s.m.keys()].filter((k) => k.startsWith(`push:pro-alerts:v1:f:${DEV}:`));
    assert.equal(claims.length, 1, '상한에 걸린 레벨은 claim 이 남지 않는다(다음 교차에 다시)');
    assert.equal(s.writes.some((k) => k.startsWith('push:sig:')), false, '무료 신호 키(push:sig:*) 쓰기 0');
});
t('한 실행 한 기기 최대 3통', async () => {
    const levels = Array.from({ length: 5 }, (_, i) => lv({ id: `lvl1${i}`, px: 200 + i * 0.1 }));
    const s = setup({ levels });
    s.m.set(PA_KEYS.tick('NVDA'), JSON.stringify({ p: 199, at: T10, d: D }));
    const a = deps(s, { NVDA: 205 }, T10 + 300_000);
    await run(a.d, T10 + 301_000);
    assert.equal(a.sent.length, PA_CFG.perRunPerDevice);
});
t('PRO 캐시 만료 + 재확인 실패/불가 → 발송 0 · not_pro 면 기록 proUntil=0', async () => {
    for (const verdict of [null, { kind: 'unavailable' as const }, { kind: 'limited' as const }]) {
        const s = setup({ proUntil: T10 - 1 });
        s.m.set(PA_KEYS.tick('NVDA'), JSON.stringify({ p: 199, at: T10, d: D }));
        const a = deps(s, { NVDA: 201 }, T10 + 300_000, { reverify: async () => verdict });
        const r = await run(a.d, T10 + 301_000);
        assert.equal(a.sent.length, 0); assert.equal(r.sent?.unverified, 1);
        assert.equal(s.m.has(PA_KEYS.fired(DEV, 'abcd1', 1)), false, 'claim 도 잡지 않는다');
    }
    const s = setup({ proUntil: T10 - 1 });
    s.m.set(PA_KEYS.tick('NVDA'), JSON.stringify({ p: 199, at: T10, d: D }));
    const a = deps(s, { NVDA: 201 }, T10 + 300_000, { reverify: async () => ({ kind: 'not_pro' }) });
    const r = await run(a.d, T10 + 301_000);
    assert.equal(a.sent.length, 0); assert.equal(r.sent?.notPro, 1);
    assert.equal(JSON.parse(s.m.get(PA_KEYS.rec(DEV))!).proUntil, 0);
    // 재확인 양성 → 보내고 proUntil 갱신
    const s2 = setup({ proUntil: T10 - 1 });
    s2.m.set(PA_KEYS.tick('NVDA'), JSON.stringify({ p: 199, at: T10, d: D }));
    const b = deps(s2, { NVDA: 201 }, T10 + 300_000, { reverify: async () => ({ kind: 'pro', expiry: T10 + 30 * 86400_000 }) });
    await run(b.d, T10 + 301_000);
    assert.equal(b.sent.length, 1);
    assert.ok(JSON.parse(s2.m.get(PA_KEYS.rec(DEV))!).proUntil > T10 + 301_000);
});
t('확정 실패 → claim·상한 복원 · 죽은 토큰 → 기록·색인 삭제', async () => {
    const s = setup();
    s.m.set(PA_KEYS.tick('NVDA'), JSON.stringify({ p: 199, at: T10, d: D }));
    const a = deps(s, { NVDA: 201 }, T10 + 300_000, { outcome: 'fail' });
    await run(a.d, T10 + 301_000);
    assert.equal(s.m.has(PA_KEYS.fired(DEV, 'abcd1', 1)), false);
    assert.equal(s.m.get(PA_KEYS.cap(D, DEV)), '0');
    const s2 = setup();
    s2.m.set(PA_KEYS.tick('NVDA'), JSON.stringify({ p: 199, at: T10, d: D }));
    const b = deps(s2, { NVDA: 201 }, T10 + 300_000, { outcome: 'dead' });
    await run(b.d, T10 + 301_000);
    assert.equal(s2.m.has(PA_KEYS.rec(DEV)), false);
    assert.equal(s2.sets.get(PA_KEYS.idx)?.has(DEV), false);
});
t('장 시간 밖·모드 off·겹침 금지 창 → 아무것도 하지 않는다', async () => {
    const s = setup();
    const a = deps(s, { NVDA: 201 }, T10);
    assert.equal((await run(a.d, Date.parse('2026-11-12T13:00:00Z'))).status, 'closed');   // 08:00 ET
    assert.equal((await run(a.d, Date.parse('2026-11-14T15:00:00Z'))).status, 'closed');   // 토요일
    assert.equal((await run(a.d, Date.parse('2026-11-12T21:30:00Z'))).status, 'closed');   // 16:30 ET
    s.m.set(PA_KEYS.mode, JSON.stringify('off'));
    assert.equal((await run(a.d, T10)).status, 'off');
    assert.equal(s.writes.length, 0);
    assert.equal(a.sent.length, 0);
});
t('미리보기 — 쓰기 0 · 발송 0 · 공급사 예비 호출 금지', async () => {
    const s = setup();
    s.m.set(PA_KEYS.tick('NVDA'), JSON.stringify({ p: 199, at: T10, d: D }));
    const a = deps(s, { NVDA: 201 }, T10 + 300_000);
    const r = await run(a.d, T10 + 301_000, 'preview');
    assert.equal(r.crossings.length, 1);
    assert.equal(s.writes.length, 0);
    assert.equal(a.sent.length, 0);
    assert.equal(a.vendorAllowed(), false);
});
t('마스터 알림 끔·시스템 권한 꺼짐·다른 앱·토큰 없음 → 대상 아님', async () => {
    assert.equal(tokenAllows({ app: 'signum', preferences: { enabled: false } }), false);
    assert.equal(tokenAllows({ app: 'signum', notifPerm: false }), false);
    assert.equal(tokenAllows({ app: 'wim' }), false);
    assert.equal(tokenAllows(null), false);
    assert.equal(tokenAllows({ app: 'signum', preferences: { enabled: true, signals: false } }), true, '무료 신호 토글은 PRO 가격 알림과 별개');
    const s = setup({ tokenRec: { app: 'signum', preferences: { enabled: false } } });
    s.m.set(PA_KEYS.tick('NVDA'), JSON.stringify({ p: 199, at: T10, d: D }));
    const a = deps(s, { NVDA: 201 }, T10 + 300_000);
    assert.equal((await run(a.d, T10 + 301_000)).status, 'no-devices');
});
t('조용한 시간(기기 현지 23~07시) → 소리 없이', async () => {
    const s = setup({ tz: 'Asia/Seoul' });   // 15:00Z = 00:00 KST
    s.m.set(PA_KEYS.tick('NVDA'), JSON.stringify({ p: 199, at: T10, d: D }));
    const a = deps(s, { NVDA: 201 }, T10 + 300_000);
    await run(a.d, T10 + 301_000);
    assert.equal(a.sent[0].quiet, true);
});

console.log('━━━ 무료 경로 불변 ━━━');
t('무료 신호 파일(크론·실행기·계획·발송·등록) 변경 0 — origin/main 대비', () => {
    const files = ['src/app/api/cron/signal-alerts/route.ts', 'src/lib/signals/run.ts', 'src/lib/signals/plan.ts', 'src/lib/signals/types.ts', 'src/services/signalAlertsService.ts', 'src/lib/push/sendSignal.ts', 'src/lib/push/prefs.ts', 'src/app/api/push/register/route.ts'];
    const out = execSync(`git diff --name-only origin/main -- ${files.join(' ')}`, { cwd: ROOT }).toString().trim();
    assert.equal(out, '', out);
});
t('무료 예약(vercel.json signal-alerts) 그대로 · PRO 크론은 따로 정규장 시간대만', () => {
    const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    const sig = v.crons.filter((c: any) => c.path === '/api/cron/signal-alerts').map((c: any) => c.schedule);
    assert.deepEqual(sig, ['40 14 * * 1-5', '25 16,18,20 * * 1-5', '10 0 * * 2-6', '40 1 * * 2-6']);
    const pa = v.crons.filter((c: any) => c.path === '/api/cron/pro-alerts').map((c: any) => c.schedule);
    assert.deepEqual(pa, ['*/5 13-21 * * 1-5']);
});
t('PRO 실행기 소스에 FMP·무료 신호 키 쓰기 없음', () => {
    const src = ['src/lib/proAlerts/run.ts', 'src/lib/proAlerts/core.ts', 'src/services/proAlertsService.ts', 'src/app/api/cron/pro-alerts/route.ts', 'src/app/api/app/watchlist/alerts/route.ts']
        .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
    assert.equal(/fmp|financialmodelingprep/i.test(src.replace(/FMP 쓰지 않음|FMP 금지/g, '')), false);
    assert.equal(/push:sig:/.test(src.replace(/push:sig:\*/g, '')), false);
});

(async () => {
    let n = 0;
    for (const [name, fn] of tests) { await fn(); n++; console.log(`  ✓ ${name}`); }
    console.log(`\n${n}개 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
