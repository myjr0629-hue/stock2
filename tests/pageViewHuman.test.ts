/**
 * 웹 사람 페이지뷰(lib/marketing/pageViewHuman) — 사람/봇/prefetch/nometa 판정 · 필드 · 키 · 쓰기 상한 · 실패 무시 (2026-10-04)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/pageViewHuman.test.ts
 * 네트워크·Redis 를 건드리지 않는다 — 쓰기는 가짜 전송(PvTransport)과 가짜 시계로 본다.
 */
import assert from 'node:assert/strict';
import {
  classifyPageView, pageViewFields, pvKey, pvbKey, pvLocale, classTotal, recordPageView,
  PvWriter, PV_MIN_GAP_MS, type PvTransport,
} from '../src/lib/marketing/pageViewHuman';

const H = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const KAKAO_AND = 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36;KAKAOTALK 2410430';
const GOOGLEBOT = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const NAV = { 'accept-language': 'ko-KR,ko;q=0.9', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'sec-fetch-site': 'none' };
const ROUTER = { 'accept-language': 'en-US', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty', 'sec-fetch-site': 'same-origin' };

let passed = 0;
const ok = (name: string, fn: () => void) => { fn(); passed++; console.log('✓ ' + name); };
const okA = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log('✓ ' + name); };

// ── 판정(같은 사람 규칙 + 앱 라우터 fetch = router) ──
ok('사람: 아이폰·안드·맥의 문서 이동 = human', () => {
  for (const ua of [IPHONE, ANDROID, MAC]) assert.equal(classifyPageView(H({ ...NAV, 'user-agent': ua })), 'human');
});
ok('사람: 카카오톡 안드 인앱(wv) = human (봇·앱으로 빠지지 않는다)', () => {
  assert.equal(classifyPageView(H({ ...NAV, 'user-agent': KAKAO_AND })), 'human');
  assert.deepEqual(pageViewFields(H({ ...NAV, 'user-agent': KAKAO_AND }), 'GET', false)?.human[0], 'android|human');
});
ok('봇: Googlebot·curl·HeadlessChrome·측정용 monitor UA = bot', () => {
  for (const ua of [GOOGLEBOT, 'curl/8.7.1', MAC.replace('Chrome/', 'HeadlessChrome/'), MAC + ' signum-ttfb-monitor']) {
    assert.equal(classifyPageView(H({ ...NAV, 'user-agent': ua })), 'bot', ua);
  }
});
ok('prefetch: Sec-Purpose·Purpose·Next 라우터 prefetch = prefetch → 쓰기 0(null)', () => {
  for (const extra of [{ 'sec-purpose': 'prefetch;prerender' }, { purpose: 'prefetch' }, { rsc: '1', 'next-router-prefetch': '1' }]) {
    const h = H({ ...NAV, 'user-agent': IPHONE, ...extra });
    assert.equal(classifyPageView(h), 'prefetch');
    assert.equal(pageViewFields(h, 'GET', false), null);
  }
});
ok('router: 앱 라우터 fetch(Next 가 RSC 헤더를 지운 same-origin·cors·empty) = router → 쓰기 0 · 다른 출처 = nonnav · 봇 = bot', () => {
  assert.equal(classifyPageView(H({ ...ROUTER, 'user-agent': IPHONE })), 'router');
  assert.equal(pageViewFields(H({ ...ROUTER, 'user-agent': IPHONE }), 'GET', false), null);
  assert.equal(pageViewFields(H({ ...ROUTER, 'user-agent': IPHONE, rsc: '1' }), 'GET', false), null);   // RSC 헤더가 보이는 곳(라우트 핸들러)에서도 쓰기 0
  assert.equal(classifyPageView(H({ ...ROUTER, 'user-agent': IPHONE, 'sec-fetch-site': 'cross-site' })), 'nonnav');
  assert.equal(classifyPageView(H({ ...ROUTER, 'user-agent': GOOGLEBOT })), 'bot');
});
ok('nometa(Sec-Fetch 없음 — iOS 16.4 미만·흉내 클라이언트) · nolang · iframe = 사람 아님', () => {
  assert.equal(classifyPageView(H({ 'user-agent': IPHONE, 'accept-language': 'ko' })), 'nometa');
  assert.equal(classifyPageView(H({ ...NAV, 'user-agent': MAC, 'accept-language': '' })), 'nolang');
  assert.equal(classifyPageView(H({ ...NAV, 'user-agent': MAC, 'sec-fetch-dest': 'iframe' })), 'nonnav');
});

// ── 필드 ──
ok('사람 착지 필드 = 링크 클릭(clk:)과 같은 칸: 기기|human · site · ref · PC 운영체제', () => {
  const f = pageViewFields(H({ ...NAV, 'user-agent': MAC, 'sec-fetch-site': 'cross-site', referer: 'https://www.google.com/' }), 'GET', false);
  assert.deepEqual(f, { human: ['desktop|human', 'desktop|site:cross-site', 'desktop|ref:google', 'desktop|os:mac'], other: [] });
});
ok('봇·nometa 는 사람 아님 키로', () => {
  assert.deepEqual(pageViewFields(H({ ...NAV, 'user-agent': GOOGLEBOT }), 'GET', false), { human: [], other: ['android|bot'] });
  assert.deepEqual(pageViewFields(H({ 'user-agent': IPHONE, 'accept-language': 'ko' }), 'GET', false), { human: [], other: ['ios|nometa'] });
});
ok('앱 웹뷰(sig_native) = app 칸 — 웹 기기 칸에 안 섞인다', () => {
  assert.deepEqual(pageViewFields(H({ ...NAV, 'user-agent': IPHONE }), 'GET', true), { human: ['app|human'], other: [] });
  assert.equal(pageViewFields(H({ ...ROUTER, 'user-agent': ANDROID }), 'GET', true), null);
});
ok('server action(next-action)·HEAD 는 페이지뷰 아님 → null', () => {
  assert.equal(pageViewFields(H({ ...NAV, 'user-agent': MAC, 'next-action': 'abc' }), 'GET', false), null);
  assert.equal(pageViewFields(H({ ...NAV, 'user-agent': MAC }), 'HEAD', false), null);
});

// ── 키 ──
ok('키: 운영 pv:/pvb: · 미리보기·로컬 pvp:/pvbp: · 로케일 닫힌 목록', () => {
  assert.equal(pvKey('home', 'ko', '2026-10-04', 'production'), 'pv:home:ko:2026-10-04');
  assert.equal(pvKey('home', 'ko', '2026-10-04', 'preview'), 'pvp:home:ko:2026-10-04');
  assert.equal(pvKey('ticker', 'de', '2026-10-04', undefined), 'pvp:ticker:xx:2026-10-04');
  assert.equal(pvbKey('ticker', '2026-10-04', 'production'), 'pvb:ticker:2026-10-04');
  assert.equal(pvbKey('ticker', '2026-10-04', 'development'), 'pvbp:ticker:2026-10-04');
  assert.equal(pvLocale('JA'), 'ja');
  assert.equal(classTotal({ 'ios|human': 2, 'ios|site:none': 2, 'desktop|human': 1, 'desktop|os:mac': 1 }), 3);
});

// ── 쓰기: 가짜 전송·가짜 시계 ──
function fake(init: Record<string, Record<string, number>> = {}) {
  const store = { ...init };
  const c = { get: 0, set: 0 };
  let failGet = false, failSet = false, throwAll = false;
  let gate: Promise<void> | null = null;
  const tr: PvTransport = {
    async get(k) { c.get++; if (throwAll) throw new Error('boom'); if (gate) await gate; return failGet ? undefined : { ...(store[k] || {}) }; },
    async set(k, v) { c.set++; if (throwAll) throw new Error('boom'); if (failSet) return false; store[k] = v; return true; },
  };
  return {
    store, c, tr,
    setFailGet: (v: boolean) => { failGet = v; }, setFailSet: (v: boolean) => { failSet = v; }, setThrow: (v: boolean) => { throwAll = v; },
    hold: () => { let open!: () => void; gate = new Promise<void>((r) => { open = r; }); return () => { gate = null; open(); }; },
  };
}
function clock() {
  let now = 0; const sleeps: number[] = [];
  return { now: () => now, sleep: async (ms: number) => { sleeps.push(ms); now += ms; }, sleeps, tick: (ms: number) => { now += ms; } };
}

(async () => {
  await okA('병합: 동시에 온 5건 = 읽기 1·쓰기 1, 값 5', async () => {
    const f = fake(); const k = clock(); const w = new PvWriter(f.tr, k.now, k.sleep);
    await Promise.all([...Array(5)].map(() => w.add('pvp:home:ko:d', ['ios|human'], 100)));
    assert.deepEqual(f.store['pvp:home:ko:d'], { 'ios|human': 5 });
    assert.deepEqual(f.c, { get: 1, set: 1 });
  });
  await okA('초당 상한: 쓰는 도중 온 것은 다음 묶음으로 합쳐 1초 뒤 한 번 더(경합·유실 없음)', async () => {
    const f = fake(); const k = clock(); const w = new PvWriter(f.tr, k.now, k.sleep);
    const release = f.hold();
    const p1 = w.add('K', ['ios|human'], 100);
    await new Promise((r) => setImmediate(r));                   // 첫 쓰기가 읽기에서 멈춘 사이
    const p2 = w.add('K', ['ios|human'], 100); const p3 = w.add('K', ['desktop|human'], 100);
    release(); await Promise.all([p1, p2, p3]);
    assert.deepEqual(f.store.K, { 'ios|human': 2, 'desktop|human': 1 });
    assert.equal(f.c.set, 2);
    assert.deepEqual(k.sleeps, [PV_MIN_GAP_MS]);                 // 두 번째 쓰기는 1초 간격을 지켰다
  });
  await okA('기존 값에 더한다(덮어쓰지 않는다)', async () => {
    const f = fake({ K: { 'ios|human': 7, 'ios|site:none': 7 } }); const k = clock(); const w = new PvWriter(f.tr, k.now, k.sleep);
    await w.add('K', ['ios|human', 'ios|site:none'], 100);
    assert.deepEqual(f.store.K, { 'ios|human': 8, 'ios|site:none': 8 });
  });
  await okA('일당 상한: 상한에 닿은 키는 더 쓰지 않고, 이후엔 읽지도 않는다', async () => {
    const f = fake({ K: { 'ios|human': 3, 'ios|site:none': 99 } }); const k = clock(); const w = new PvWriter(f.tr, k.now, k.sleep);
    await w.add('K', ['ios|human'], 3);
    assert.equal(f.c.set, 0);
    k.tick(5000); await w.add('K', ['ios|human'], 3);
    assert.deepEqual(f.c, { get: 1, set: 0 });
    assert.equal(f.store.K['ios|human'], 3);
  });
  await okA('읽기 실패 → 쓰지 않는다(부분 값으로 덮어쓰기 금지)', async () => {
    const f = fake({ K: { 'ios|human': 40 } }); const k = clock(); const w = new PvWriter(f.tr, k.now, k.sleep);
    f.setFailGet(true); await w.add('K', ['ios|human'], 100);
    assert.equal(f.c.set, 0); assert.equal(f.store.K['ios|human'], 40);
  });
  await okA('실패 무시: 쓰기 실패·전송 예외에도 던지지 않는다', async () => {
    const f = fake(); const k = clock(); const w = new PvWriter(f.tr, k.now, k.sleep);
    f.setFailSet(true); await w.add('A', ['ios|human'], 100);
    f.setThrow(true); k.tick(2000); await w.add('A', ['ios|human'], 100);
    await recordPageView('home', 'ko', 'd', { human: ['ios|human'], other: ['desktop|bot'] }, w);
  });
  await okA('recordPageView: 사람 → pvp:<군>:<로케일> · 사람 아님 → pvbp:<군> (테스트 환경 = 미리보기 접두사)', async () => {
    const f = fake(); const k = clock(); const w = new PvWriter(f.tr, k.now, k.sleep);
    await recordPageView('ticker', 'ja', '2026-10-04', { human: ['ios|human', 'ios|ref:google'], other: ['desktop|bot'] }, w);
    assert.deepEqual(f.store['pvp:ticker:ja:2026-10-04'], { 'ios|human': 1, 'ios|ref:google': 1 });
    assert.deepEqual(f.store['pvbp:ticker:2026-10-04'], { 'desktop|bot': 1 });
  });
  await okA('시간 상한: 프록시가 응답하지 않아도 마감 시간에 풀린다', async () => {
    const f = fake(); const k = clock(); const w = new PvWriter(f.tr, k.now, k.sleep);
    f.hold();                                                    // 영원히 안 풀리는 읽기
    const t0 = Date.now();
    await recordPageView('home', 'en', 'd', { human: ['ios|human'], other: [] }, w, 50);
    assert.ok(Date.now() - t0 < 1000);
  });
  console.log(`\n✓ 전부 통과 (${passed}건)`);
})().catch((e) => { console.error('✗ 실패:', e); process.exit(1); });
