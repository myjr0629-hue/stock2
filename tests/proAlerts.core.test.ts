/**
 * PRO 가격 레벨 알림 — 입력 검증 · 무장 · 교차 판정 · RC 확인(닫힘 정책) · ID 봉인 시험 (2026-11-12)
 * 실행: TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' node -r ts-node/register/transpile-only -r tsconfig-paths/register tests/proAlerts.core.test.ts
 */
import assert from 'node:assert/strict';
import {
    PA_CFG, PA_KEYS, crossed, mergeLevels, paDevKey, paUidHash, parseSaveBody, proExpiryFromSubscriber, proTrustUntil, pushCopy, shouldStoreObs,
    type StoredLevel,
} from '../src/lib/proAlerts/core';
import { openUid, sealUid, verifyProWithRc, type VerifyStore } from '../src/lib/proAlerts/rcVerify';

let n = 0;
const tests: Array<[string, () => void | Promise<void>]> = [];
const t = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const TOKEN = 'a1'.repeat(32);
const UID = '$RCAnonymousID:' + 'ab'.repeat(16);
const body = (levels: unknown[], extra: Record<string, unknown> = {}) => ({ v: 2, rcAppUserId: UID, platform: 'ios', deviceToken: TOKEN, locale: 'ko', tz: 'Asia/Seoul', levels, ...extra });
const L = (t: string, id: string, extra: Record<string, unknown> = {}) => ({ t, id, dir: 'up', px: 200, on: true, rev: 1, ...extra });

console.log('━━━ 1. 입력 검증 ━━━');
t('정상 본문 — 대문자 정리·값 보존', () => {
    const r = parseSaveBody(body([L('nvda', 'abcd1'), L('AMD', 'abcd2', { dir: 'down', px: 99.123456, on: false, rev: 3 })]));
    assert.ok(r.ok);
    if (r.ok) {
        assert.equal(r.levels[0].t, 'NVDA');
        assert.equal(r.levels[1].px, 99.1235);
        assert.equal(r.levels[1].on, false);
        assert.equal(r.tz, 'Asia/Seoul');
    }
});
t('거부 — v1 본문 · 잘못된 토큰·ID·방향·가격·rev · 중복 id', () => {
    assert.deepEqual(parseSaveBody({ ...body([]), v: 1 }), { ok: false, why: 'version' });
    assert.equal(parseSaveBody(body([], { deviceToken: 'x' })).ok, false);
    assert.equal(parseSaveBody(body([], { rcAppUserId: 'a b' })).ok, false);
    assert.equal(parseSaveBody(body([], { platform: 'web' })).ok, false);
    for (const bad of [{ dir: 'side' }, { px: 0 }, { px: -1 }, { px: 'x' }, { px: 1e7 }, { rev: 0 }, { rev: 1.5 }, { on: 'yes' }, { id: 'A!' }, { t: '1ABC' }]) {
        assert.equal(parseSaveBody(body([L('NVDA', 'abcd1', bad)])).ok, false, JSON.stringify(bad));
    }
    assert.equal(parseSaveBody(body([L('NVDA', 'abcd1'), L('AMD', 'abcd1')])).ok, false);
    assert.equal(parseSaveBody(null).ok, false);
});
t('상한 — 종목당 5 · 100종목 · 500 레벨', () => {
    const six = Array.from({ length: 6 }, (_, i) => L('NVDA', `lvl${i}0`));
    assert.deepEqual(parseSaveBody(body(six)), { ok: false, why: 'per_ticker' });
    assert.ok(parseSaveBody(body(six.slice(0, 5))).ok);
    const tick = (i: number) => 'T' + String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));
    const hundred = Array.from({ length: 100 }, (_, i) => L(tick(i), `id${String(i).padStart(3, '0')}`));
    assert.ok(parseSaveBody(body(hundred)).ok);
    const hundredOne = [...hundred, L('ZZZ', 'id999')];
    assert.deepEqual(parseSaveBody(body(hundredOne)), { ok: false, why: 'tickers' });
    assert.deepEqual(parseSaveBody(body(Array.from({ length: 501 }, (_, i) => L('NVDA', `x${i}aaa`)))), { ok: false, why: 'too_many_levels' });
});
t('isPro 같은 기기 주장 칸은 결과에 없다(서버가 RC 로만 판단)', () => {
    const r = parseSaveBody(body([L('NVDA', 'abcd1')], { isPro: true, proUntil: 9e15 }));
    assert.ok(r.ok);
    assert.equal(JSON.stringify(r).includes('isPro'), false);
});

console.log('━━━ 2. 무장 · 교차 ━━━');
const T0 = Date.parse('2026-11-12T15:00:00Z');   // 10:00 ET
const D = '2026-11-12';
const lv = (extra: Partial<StoredLevel> = {}): StoredLevel => ({ t: 'NVDA', id: 'abcd1', dir: 'up', px: 200, on: true, rev: 1, armedAt: T0, ...extra });
t('같은 (id, rev, 값)은 무장 시각 유지 · 바뀌면 지금 무장', () => {
    const prev = [lv()];
    assert.equal(mergeLevels(prev, [{ t: 'NVDA', id: 'abcd1', dir: 'up', px: 200, on: true, rev: 1 }], T0 + 999)[0].armedAt, T0);
    assert.equal(mergeLevels(prev, [{ t: 'NVDA', id: 'abcd1', dir: 'up', px: 201, on: true, rev: 1 }], T0 + 999)[0].armedAt, T0 + 999);
    assert.equal(mergeLevels(prev, [{ t: 'NVDA', id: 'abcd1', dir: 'up', px: 200, on: true, rev: 2 }], T0 + 999)[0].armedAt, T0 + 999);
    assert.equal(mergeLevels(null, [{ t: 'NVDA', id: 'zzzz9', dir: 'up', px: 200, on: true, rev: 1 }], 5)[0].armedAt, 5);
});
t('위로 교차 — prev < px ≤ cur 일 때만', () => {
    const prev = { p: 199, at: T0 + 60_000, d: D };
    assert.equal(crossed(lv(), prev, { p: 200, at: T0 + 360_000, d: D }), true);
    assert.equal(crossed(lv(), prev, { p: 199.9, at: T0 + 360_000, d: D }), false);
    assert.equal(crossed(lv(), { p: 200, at: T0 + 60_000, d: D }, { p: 205, at: T0 + 360_000, d: D }), false, '이미 위에 있던 값은 교차가 아니다');
});
t('아래로 교차 — prev > px ≥ cur', () => {
    const l = lv({ dir: 'down', px: 150 });
    assert.equal(crossed(l, { p: 151, at: T0 + 60_000, d: D }, { p: 150, at: T0 + 360_000, d: D }), true);
    assert.equal(crossed(l, { p: 149, at: T0 + 60_000, d: D }, { p: 140, at: T0 + 360_000, d: D }), false);
});
t('첫 관측은 기준점 — 무장 전 관측을 직전 값으로 쓰지 않는다(저장 직후 이미 넘은 값 발송 금지)', () => {
    const l = lv({ armedAt: T0 + 120_000 });
    assert.equal(crossed(l, { p: 199, at: T0 + 60_000, d: D }, { p: 201, at: T0 + 360_000, d: D }), false);
    assert.equal(crossed(l, null, { p: 201, at: T0 + 360_000, d: D }), false);
});
t('공백(16분 초과)·다른 거래일·이상 점프(20%)·시각 역행은 판정하지 않는다', () => {
    assert.equal(crossed(lv(), { p: 199, at: T0 + 60_000, d: D }, { p: 201, at: T0 + 60_000 + PA_CFG.maxGapMs + 1, d: D }), false);
    assert.equal(crossed(lv(), { p: 199, at: T0 + 60_000, d: '2026-11-11' }, { p: 201, at: T0 + 360_000, d: D }), false);
    assert.equal(crossed(lv({ px: 150 }), { p: 100, at: T0 + 60_000, d: D }, { p: 150, at: T0 + 360_000, d: D }), false);
    assert.equal(crossed(lv(), { p: 199, at: T0 + 360_000, d: D }, { p: 201, at: T0 + 60_000, d: D }), false);
});
t('관측 저장 — 더 새로운 시각만', () => {
    assert.equal(shouldStoreObs(null, { p: 1, at: 2, d: D }), true);
    assert.equal(shouldStoreObs({ p: 1, at: 5, d: D }, { p: 1, at: 2, d: D }), false);
});
t('키·해시 — 무료 신호 키(push:sig:*)와 겹치지 않음 · 원문 토큰·ID 없음', () => {
    const dev = paDevKey(TOKEN);
    for (const k of [PA_KEYS.rec(dev), PA_KEYS.fired(dev, 'abcd1', 1), PA_KEYS.cap(D, dev), PA_KEYS.tick('NVDA'), PA_KEYS.idx, PA_KEYS.uidDevs(paUidHash(UID))]) {
        assert.ok(k.startsWith('push:pro-alerts:v1:'), k);
        assert.equal(k.includes(TOKEN), false);
        assert.equal(k.includes(UID), false);
    }
});
t('푸시 문구 — 3개 언어 · 권유 단어 없음', () => {
    for (const loc of ['ko', 'en', 'ja'] as const) {
        const c = pushCopy(loc, 'NVDA', 'up', 200, 200.35);
        assert.ok(c.title.includes('NVDA') && c.title.includes('200.00'));
        assert.ok(c.body.includes('200.35'));
        assert.equal(/매수|매도|사세요|buy now|sell now|買い|売り/i.test(c.title + c.body), false);
    }
});

console.log('━━━ 3. RC 확인 — 닫힘 정책 ━━━');
const NOW = Date.parse('2026-11-12T15:00:00Z');
const okStore = (): VerifyStore & { calls: number } => { const s = { calls: 0, incr: async (keys: string[]) => { s.calls++; return keys.map(() => 1); } }; return s; };
const fakeFetch = (status: number, json?: unknown) => (async () => ({ status, ok: status >= 200 && status < 300, json: async () => json })) as unknown as typeof fetch;
const sub = (exp: string | null, purchase = '2026-01-01T00:00:00Z') => ({ subscriber: { entitlements: { pro: { expires_date: exp, purchase_date: purchase, product_identifier: 'm' } } } });
t('활성 PRO → pro(만료 시각) · 평생 → Infinity · 만료 → not_pro', async () => {
    const v = await verifyProWithRc(UID, 'ios', '1.2.3.4', { store: okStore(), keys: { ios: 'k' }, fetchImpl: fakeFetch(200, sub('2026-12-01T00:00:00Z')), now: () => NOW });
    assert.deepEqual(v, { kind: 'pro', expiry: Date.parse('2026-12-01T00:00:00Z') });
    assert.equal(proExpiryFromSubscriber(sub(null), 'pro', NOW), Infinity);
    assert.equal(proExpiryFromSubscriber(sub('2026-11-01T00:00:00Z'), 'pro', NOW), null);
    const v2 = await verifyProWithRc(UID, 'ios', null, { store: okStore(), keys: { ios: 'k' }, fetchImpl: fakeFetch(200, sub('2026-11-01T00:00:00Z')), now: () => NOW });
    assert.equal(v2.kind, 'not_pro');
    const v3 = await verifyProWithRc(UID, 'ios', null, { store: okStore(), keys: { ios: 'k' }, fetchImpl: fakeFetch(200, { subscriber: { entitlements: {} } }), now: () => NOW });
    assert.equal(v3.kind, 'not_pro');
});
t('RC 장애·429·키 없음·형식 오류·시간 초과 → 거부(unavailable/limited) — 허용하지 않는다', async () => {
    const base = { store: okStore(), keys: { ios: 'k' }, now: () => NOW };
    assert.equal((await verifyProWithRc(UID, 'ios', null, { ...base, fetchImpl: fakeFetch(500) })).kind, 'unavailable');
    assert.equal((await verifyProWithRc(UID, 'ios', null, { ...base, fetchImpl: fakeFetch(429) })).kind, 'limited');
    assert.equal((await verifyProWithRc(UID, 'ios', null, { ...base, fetchImpl: fakeFetch(200, { nope: 1 }) })).kind, 'unavailable');
    assert.equal((await verifyProWithRc(UID, 'android', null, { ...base, fetchImpl: fakeFetch(200, sub(null)) })).kind, 'unavailable', '안드 키 없음');
    const hang = (async (_u: unknown, init: { signal: AbortSignal }) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('abort'))))) as unknown as typeof fetch;
    assert.equal((await verifyProWithRc(UID, 'ios', null, { ...base, fetchImpl: hang, timeoutMs: 30 })).kind, 'unavailable');
    const throwing: VerifyStore = { incr: async () => { throw new Error('redis down'); } };
    let called = false;
    const spy = (async () => { called = true; return { status: 200, ok: true, json: async () => sub(null) }; }) as unknown as typeof fetch;
    assert.equal((await verifyProWithRc(UID, 'ios', null, { store: throwing, keys: { ios: 'k' }, fetchImpl: spy, now: () => NOW })).kind, 'unavailable');
    assert.equal(called, false, '예산을 셀 수 없으면 RC 를 부르지 않는다');
});
t('예산 초과(IP 30·고객 10·전체 600/10분) → limited · RC 호출 0 · 잘못된 ID → not_pro(호출 0)', async () => {
    let called = false;
    const spy = (async () => { called = true; return { status: 200, ok: true, json: async () => sub(null) }; }) as unknown as typeof fetch;
    const over: VerifyStore = { incr: async (keys) => keys.map((_, i) => (i === 1 ? 11 : 1)) };
    assert.equal((await verifyProWithRc(UID, 'ios', '1.1.1.1', { store: over, keys: { ios: 'k' }, fetchImpl: spy, now: () => NOW })).kind, 'limited');
    assert.equal((await verifyProWithRc('bad id', 'ios', null, { store: okStore(), keys: { ios: 'k' }, fetchImpl: spy, now: () => NOW })).kind, 'not_pro');
    assert.equal(called, false);
});
t('비밀 키가 있으면 플랫폼 머리글 없이 그 키로', async () => {
    let hdr: Record<string, string> = {};
    const spy = (async (_u: unknown, init: { headers: Record<string, string> }) => { hdr = init.headers; return { status: 200, ok: true, json: async () => sub(null) }; }) as unknown as typeof fetch;
    await verifyProWithRc(UID, 'android', null, { store: okStore(), keys: { secret: 'sk_x' }, fetchImpl: spy, now: () => NOW });
    assert.equal(hdr.Authorization, 'Bearer sk_x');
    assert.equal(hdr['X-Platform'], undefined);
});
t('양성 캐시 ≤ 6시간 · 권한 만료가 더 이르면 그 시각', () => {
    assert.equal(proTrustUntil(Infinity, NOW), NOW + 6 * 3600_000);
    assert.equal(proTrustUntil(NOW + 1000, NOW), NOW + 1000);
});
t('RC ID 봉인 — 같은 비밀로만 열린다 · 비밀 없으면 저장 안 함', () => {
    const s = sealUid(UID, 'secret1')!;
    assert.ok(s && !s.includes(UID));
    assert.equal(openUid(s, 'secret1'), UID);
    assert.equal(openUid(s, 'secret2'), null);
    assert.equal(sealUid(UID, undefined), null);
    assert.equal(openUid(s.slice(0, -2) + 'AA', 'secret1'), null);
});

(async () => {
    for (const [name, fn] of tests) { await fn(); n++; console.log(`  ✓ ${name}`); }
    console.log(`\n${n}개 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
