/**
 * PRO «내 종목» 알림 — API(POST/DELETE /api/app/watchlist/alerts) 시험: 메모리 저장소 + 가짜 RevenueCat
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/watchlistAlerts.api.test.ts
 *
 * 계약(UI 브랜치 feat/app-watchlist 와 같다):
 *   POST { rcAppUserId, platform, deviceToken, locale, tickers:[{t, events}], quiet, dailyCap } → 200 {ok:true} | 402 {error:'not_pro'} | 400 {error}
 *   DELETE { rcAppUserId, deviceToken } → 200
 */
import assert from 'node:assert/strict';
import { handleAlertsPost, handleAlertsDelete, RATE_LIMIT_PER_DEVICE, clientIpFrom } from '../src/lib/alerts/api';
import { MemoryAlertStore, deviceHashOf } from '../src/lib/alerts/store';
import { createRevenueCatVerifier, proStatusFromSubscriber, ProVerifyError, type ProVerifier } from '../src/lib/alerts/revenuecat';
import { validateSubscriptionBody } from '../src/lib/alerts/validate';

let n = 0;
const tests: Array<[string, () => Promise<void>]> = [];
const t = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);

const NOW = Date.UTC(2026, 8, 30, 14, 0);
const IOS_TOKEN = 'a1b2c3d4'.repeat(8);                                       // 64 hex
const FCM_TOKEN = 'dQw4w9WgXcQ:APA91bH' + 'x'.repeat(140);                    // 인스턴스ID:본문
const RC_ID = '$RCAnonymousID:0123456789abcdef0123456789abcdef';

const body = (over: Record<string, unknown> = {}) => JSON.stringify({
    rcAppUserId: RC_ID,
    platform: 'ios',
    deviceToken: IOS_TOKEN,
    locale: 'ko',
    tickers: [
        { t: 'nvda', events: ['call_wall_break', 'put_floor_break', 'gamma_flip_cross'] },
        { t: 'MU', events: ['earnings_d1', 'whale_new'] },
    ],
    quiet: { start: '23:00', end: '07:00', tz: 'Asia/Seoul' },
    dailyCap: 5,
    ...over,
});

/** RevenueCat v1 응답 모양(실제 필드 이름) */
const rcSubscriber = (ent: Record<string, unknown> | null) => ({
    request_date: '2026-09-30T14:00:00Z',
    subscriber: {
        original_app_user_id: RC_ID,
        entitlements: ent ? { pro: ent } : {},
        subscriptions: {},
    },
});
const activeEnt = { expires_date: '2026-10-30T14:00:00Z', grace_period_expires_date: null, product_identifier: 'com.signumhq.app.pro.monthly', purchase_date: '2026-09-30T13:00:00Z' };
const expiredEnt = { expires_date: '2026-09-01T00:00:00Z', grace_period_expires_date: null, product_identifier: 'com.signumhq.app.pro.monthly', purchase_date: '2026-08-01T00:00:00Z' };

function fakeFetch(respond: (url: string, init: any) => { status: number; json?: unknown }) {
    const calls: Array<{ url: string; init: any }> = [];
    const fn = (async (url: any, init: any) => {
        calls.push({ url: String(url), init });
        const r = respond(String(url), init);
        return {
            ok: r.status >= 200 && r.status < 300,
            status: r.status,
            json: async () => r.json,
        } as any;
    }) as unknown as typeof fetch;
    return { fn, calls };
}

function setup(ent: Record<string, unknown> | null = activeEnt) {
    const store = new MemoryAlertStore();
    const rc = fakeFetch(() => ({ status: 200, json: rcSubscriber(ent) }));
    const verifyPro = createRevenueCatVerifier({ apiKey: 'sk_test_fake', fetchImpl: rc.fn, now: () => NOW });
    return { store, rc, deps: { store, verifyPro, now: () => NOW } };
}

// ─────────────────────────────────────────────────────────────────────
t('정상 POST → 200 {ok:true} · 종목 역색인·기기 사본 저장 · 키는 토큰 해시(원문은 값에만)', async () => {
    const { store, rc, deps } = setup();
    const r = await handleAlertsPost(body(), '203.0.113.7', deps);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true });
    const h = deviceHashOf(IOS_TOKEN);
    assert.equal(h.length, 32);
    assert.ok(!h.includes(IOS_TOKEN.slice(0, 16)));
    assert.deepEqual(await store.listSubscribedTickers(), ['MU', 'NVDA']);
    const nv = await store.listTokensForTicker('NVDA');
    assert.equal(nv.length, 1);
    assert.equal(nv[0].deviceHash, h);
    assert.equal(nv[0].token, IOS_TOKEN);
    assert.deepEqual(nv[0].events, ['call_wall_break', 'put_floor_break', 'gamma_flip_cross']);
    assert.equal(nv[0].proUntil, Date.parse('2026-10-30T14:00:00Z'));
    // RevenueCat 호출 모양: v1 subscribers + 서버 비밀키 Bearer
    assert.equal(rc.calls.length, 1);
    assert.equal(rc.calls[0].url, 'https://api.revenuecat.com/v1/subscribers/%24RCAnonymousID%3A0123456789abcdef0123456789abcdef');
    assert.equal(rc.calls[0].init.headers.Authorization, 'Bearer sk_test_fake');
});

t('PRO 아님(권한 만료) → 402 not_pro · 이미 있던 사본은 지운다(구독이 끝난 기기에 보내지 않게)', async () => {
    const { store, deps } = setup();
    assert.equal((await handleAlertsPost(body(), '203.0.113.7', deps)).status, 200);
    const expired = createRevenueCatVerifier({ apiKey: 'k', fetchImpl: fakeFetch(() => ({ status: 200, json: rcSubscriber(expiredEnt) })).fn, now: () => NOW });
    const r = await handleAlertsPost(body(), '203.0.113.7', { ...deps, verifyPro: expired });
    assert.equal(r.status, 402);
    assert.deepEqual(r.body, { error: 'not_pro' });
    assert.deepEqual(await store.listSubscribedTickers(), []);
    assert.equal(await store.getDevice(deviceHashOf(IOS_TOKEN)), null);
});

t('권한 없음(entitlements 비어 있음) → 402', async () => {
    const { deps } = setup(null);
    assert.equal((await handleAlertsPost(body(), '203.0.113.7', deps)).status, 402);
});

t('검증 실패는 전부 400 + 고정 코드', async () => {
    const { deps } = setup();
    const cases: Array<[string, string]> = [
        ['{not json', 'invalid_json'],
        [JSON.stringify([1, 2]), 'invalid_body'],
        [body({ rcAppUserId: 'x' }), 'invalid_rc_app_user_id'],
        [body({ rcAppUserId: '$RCAnonymousID:../../admin' }), 'invalid_rc_app_user_id'],
        [body({ platform: 'web' }), 'invalid_platform'],
        [body({ deviceToken: 'zz' + IOS_TOKEN.slice(2) }), 'invalid_device_token'],
        [body({ deviceToken: FCM_TOKEN }), 'invalid_device_token'],                          // iOS 인데 FCM 형식
        [body({ platform: 'android', deviceToken: IOS_TOKEN }), 'invalid_device_token'],     // Android 인데 APNs 형식
        [body({ locale: 'fr' }), 'invalid_locale'],
        [body({ tickers: 'NVDA' }), 'invalid_tickers'],
        [body({ tickers: [{ t: 'NVDA', events: ['moon_landing'] }] }), 'unknown_event'],
        [body({ tickers: [{ t: 'NV DA', events: ['whale_new'] }] }), 'invalid_ticker'],
        [body({ tickers: [{ t: 'NVDA' }] }), 'invalid_events'],
        [body({ tickers: Array.from({ length: 51 }, (_, i) => ({ t: `T${i}`, events: ['whale_new'] })) }), 'too_many_tickers'],
        [body({ quiet: { start: '25:00', end: '07:00', tz: 'Asia/Seoul' } }), 'invalid_quiet'],
        [body({ quiet: { start: '23:00', end: '07:00', tz: 'Mars/Olympus' } }), 'invalid_quiet'],
        [body({ dailyCap: 0 }), 'invalid_daily_cap'],
        [body({ dailyCap: 51 }), 'invalid_daily_cap'],
        [body({ dailyCap: 2.5 }), 'invalid_daily_cap'],
        [body({ dailyCap: '5' }), 'invalid_daily_cap'],
        ['x'.repeat(17 * 1024), 'body_too_large'],
    ];
    for (const [raw, code] of cases) {
        const r = await handleAlertsPost(raw, '203.0.113.7', deps);
        assert.equal(r.status, 400, `${code}: status ${r.status} ${JSON.stringify(r.body)}`);
        assert.deepEqual(r.body, { error: code });
    }
});

t('정규화: 티커 대문자·중복 병합(이벤트 합집합)·이벤트 없는 종목은 저장 안 함·start=end 조용한 시간은 «없음»', async () => {
    const v = validateSubscriptionBody(JSON.parse(body({
        tickers: [
            { t: 'nvda', events: ['call_wall_break'] },
            { t: 'NVDA', events: ['whale_new', 'call_wall_break'] },
            { t: 'AAPL', events: [] },
            { t: 'brk.b', events: ['earnings_d1'] },
        ],
        quiet: { start: '07:00', end: '07:00', tz: 'Asia/Seoul' },
    })));
    assert.ok(v.ok);
    if (!v.ok) return;
    assert.deepEqual(v.value.tickers, [
        { t: 'NVDA', events: ['call_wall_break', 'whale_new'] },
        { t: 'BRK.B', events: ['earnings_d1'] },
    ]);
    assert.equal(v.value.quiet, null);
});

t('Android(FCM 토큰) · 조용한 시간 null 도 받는다', async () => {
    const { store, deps } = setup();
    const r = await handleAlertsPost(body({ platform: 'android', deviceToken: FCM_TOKEN, quiet: null, locale: 'ja' }), '203.0.113.9', deps);
    assert.equal(r.status, 200);
    const mu = await store.listTokensForTicker('MU');
    assert.equal(mu[0].platform, 'android');
    assert.equal(mu[0].locale, 'ja');
    assert.equal(mu[0].quiet, null);
});

t('목록을 바꾸면 빠진 종목의 역색인이 사라진다(끈 종목으로 보내지 않는다)', async () => {
    const { store, deps } = setup();
    await handleAlertsPost(body(), '203.0.113.7', deps);
    await handleAlertsPost(body({ tickers: [{ t: 'MU', events: ['whale_new'] }] }), '203.0.113.7', deps);
    assert.deepEqual(await store.listSubscribedTickers(), ['MU']);
    assert.deepEqual((await store.listTokensForTicker('MU'))[0].events, ['whale_new']);
});

t('같은 내용을 3일 안에 다시 보내면 쓰지 않는다(앱이 열릴 때마다 동기화해도 쓰기 비용이 늘지 않게)', async () => {
    const { store, deps } = setup();
    await handleAlertsPost(body(), '203.0.113.7', deps);
    const w = store.writes;
    assert.equal((await handleAlertsPost(body(), '203.0.113.7', deps)).status, 200);
    await handleAlertsPost(body(), '203.0.113.7', { ...deps, now: () => NOW + 47 * 3600_000 });
    assert.equal(store.writes, w);
    await handleAlertsPost(body(), '203.0.113.7', { ...deps, now: () => NOW + 73 * 3600_000 });
    assert.equal(store.writes, w + 1, '3일이 지나면 TTL(30일)을 늘리려고 다시 쓴다');
});

t('켠 종목이 하나도 없으면(모든 이벤트 끔) 사본을 지운다 → 200', async () => {
    const { store, deps } = setup();
    await handleAlertsPost(body(), '203.0.113.7', deps);
    const r = await handleAlertsPost(body({ tickers: [{ t: 'NVDA', events: [] }] }), '203.0.113.7', deps);
    assert.equal(r.status, 200);
    assert.equal(await store.getDevice(deviceHashOf(IOS_TOKEN)), null);
});

t('DELETE → 200 · 사본·역색인 즉시 삭제 · 없는 기기도 200(이미 꺼진 상태)', async () => {
    const { store, deps } = setup();
    await handleAlertsPost(body(), '203.0.113.7', deps);
    const r = await handleAlertsDelete(JSON.stringify({ rcAppUserId: RC_ID, deviceToken: IOS_TOKEN }), '203.0.113.7', deps);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true });
    assert.deepEqual(await store.listSubscribedTickers(), []);
    assert.equal(await store.getDevice(deviceHashOf(IOS_TOKEN)), null);
    const again = await handleAlertsDelete(JSON.stringify({ rcAppUserId: RC_ID, deviceToken: IOS_TOKEN }), '203.0.113.7', deps);
    assert.equal(again.status, 200);
    const bad = await handleAlertsDelete(JSON.stringify({ rcAppUserId: RC_ID, deviceToken: 'nope' }), '203.0.113.7', deps);
    assert.deepEqual([bad.status, bad.body], [400, { error: 'invalid_device_token' }]);
});

t('끄기(DELETE)는 PRO 확인을 하지 않는다(구독이 끝나도 언제나 끌 수 있다)', async () => {
    const { store, deps } = setup();
    await handleAlertsPost(body(), '203.0.113.7', deps);
    const boom: ProVerifier = async () => { throw new Error('must not be called'); };
    const r = await handleAlertsDelete(JSON.stringify({ rcAppUserId: RC_ID, deviceToken: IOS_TOKEN }), '203.0.113.7', { ...deps, verifyPro: boom });
    assert.equal(r.status, 200);
    assert.deepEqual(await store.listSubscribedTickers(), []);
});

t(`요청 수 제한: 같은 기기 10분에 ${RATE_LIMIT_PER_DEVICE}회 넘으면 429 · 다른 기기는 영향 없음`, async () => {
    const { deps } = setup();
    for (let i = 0; i < RATE_LIMIT_PER_DEVICE; i++) {
        assert.equal((await handleAlertsPost(body(), `198.51.100.${i}`, deps)).status, 200);
    }
    const r = await handleAlertsPost(body(), '198.51.100.99', deps);
    assert.deepEqual([r.status, r.body], [429, { error: 'rate_limited' }]);
    const other = await handleAlertsPost(body({ deviceToken: 'b'.repeat(64) }), '198.51.100.99', deps);
    assert.equal(other.status, 200);
});

t('RevenueCat 키 없음 → 503 verify_unconfigured · RevenueCat 장애 → 503 verify_unavailable · 저장소 없음 → 503', async () => {
    const { deps } = setup();
    const noKey = createRevenueCatVerifier({ apiKey: '', fetchImpl: fakeFetch(() => ({ status: 200 })).fn });
    assert.deepEqual((await handleAlertsPost(body(), '203.0.113.7', { ...deps, verifyPro: noKey })).body, { error: 'verify_unconfigured' });
    const down = createRevenueCatVerifier({ apiKey: 'k', fetchImpl: fakeFetch(() => ({ status: 503 })).fn });
    const r = await handleAlertsPost(body(), '203.0.113.8', { ...deps, verifyPro: down });
    assert.deepEqual([r.status, r.body], [503, { error: 'verify_unavailable' }]);
    const s = await handleAlertsPost(body(), '203.0.113.8', { ...deps, store: null });
    assert.deepEqual([s.status, s.body], [503, { error: 'store_unavailable' }]);
});

t('PRO 판정 캐시: 활성은 5분 재사용(RevenueCat 1회) · 비활성은 30초만', async () => {
    let calls = 0, clock = NOW;
    const f = (async () => { calls++; return { ok: true, status: 200, json: async () => rcSubscriber(activeEnt) } as any; }) as unknown as typeof fetch;
    const v = createRevenueCatVerifier({ apiKey: 'k', fetchImpl: f, now: () => clock });
    await v(RC_ID); await v(RC_ID);
    assert.equal(calls, 1);
    clock += 6 * 60_000;
    await v(RC_ID);
    assert.equal(calls, 2);
    let neg = 0;
    const g = (async () => { neg++; return { ok: true, status: 200, json: async () => rcSubscriber(null) } as any; }) as unknown as typeof fetch;
    const w = createRevenueCatVerifier({ apiKey: 'k', fetchImpl: g, now: () => clock });
    await w(RC_ID); clock += 31_000; await w(RC_ID);
    assert.equal(neg, 2);
});

t('권한 판정(순수): 만료 전 활성 · 만료 후 유예기간 중 활성 · 평생(expires_date null + 구매 기록) 활성 · 빈 객체 비활성', async () => {
    assert.deepEqual(proStatusFromSubscriber(rcSubscriber(activeEnt), NOW), { active: true, expiresAtMs: Date.parse('2026-10-30T14:00:00Z') });
    assert.equal(proStatusFromSubscriber(rcSubscriber(expiredEnt), NOW).active, false);
    const grace = { ...expiredEnt, grace_period_expires_date: '2026-10-05T00:00:00Z' };
    assert.deepEqual(proStatusFromSubscriber(rcSubscriber(grace), NOW), { active: true, expiresAtMs: Date.parse('2026-10-05T00:00:00Z') });
    assert.deepEqual(proStatusFromSubscriber(rcSubscriber({ expires_date: null, purchase_date: '2026-01-01T00:00:00Z' }), NOW), { active: true, expiresAtMs: null });
    assert.equal(proStatusFromSubscriber(rcSubscriber({}), NOW).active, false);
    assert.equal(proStatusFromSubscriber({ subscriber: { entitlements: { other: activeEnt } } }, NOW).active, false);
});

t('ProVerifyError 코드 구분 · IP 추출(x-forwarded-for 첫 값 → x-real-ip)', async () => {
    const e = new ProVerifyError('unconfigured');
    assert.equal(e.code, 'unconfigured');
    const h = (m: Record<string, string>) => ({ get: (k: string) => m[k] ?? null });
    assert.equal(clientIpFrom(h({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })), '203.0.113.7');
    assert.equal(clientIpFrom(h({ 'x-real-ip': '198.51.100.2' })), '198.51.100.2');
    assert.equal(clientIpFrom(h({})), null);
});

(async () => {
    for (const [name, fn] of tests) {
        await fn();
        n++;
        console.log(`  ✓ ${name}`);
    }
    console.log(`\n${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
