/** 로컬 가짜 저장소만 사용한다. 실제 Lua 동시성은 giftShareLua.test.mjs로 분리한다. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import ts from 'typescript';

// 외부 호출은 시험이 즉시 실패하게 한다. 비밀값·코드는 출력하지 않는다.
globalThis.fetch = async () => { throw new Error('시험 중 외부 접근 금지'); };
const nsPath = require.resolve('next/server');
const ns = require(nsPath);
require.cache[nsPath] = { id: nsPath, filename: nsPath, loaded: true, exports: { ...ns, after: () => {} } } as Module;
const rc = require('../src/services/redisClient');
rc.getFromCache = async () => null;
rc.setInCache = async () => true;
const server = require('../src/lib/giftShare/server');
const { giftIdentity } = require('../src/lib/giftShare/http');
const { giftPrefix, giftCap, withGift } = require('../src/lib/giftShare/config');
const { couponHtml } = require('../src/lib/marketing/couponHtml');
const route = require('../src/app/app/route');
const issue = require('../src/app/api/gift/issue/route');
const claim = require('../src/app/api/gift/claim/route');
const { NextRequest } = ns;
let n = 0;
const t = async (name: string, fn: () => unknown) => { await fn(); n++; console.log(`통과: ${name}`); };
const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0.0.0 Mobile Safari/537.36';
const desktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36';
const token = server.newToken();
const fakeCode = (os = 'ios') => randomBytes(16).toString('hex').slice(0, os === 'ios' ? 18 : 23).toUpperCase();
const baseHeaders = { 'user-agent': ios, 'accept-language': 'ko-KR', origin: 'https://www.signumhq.com', 'sec-fetch-site': 'same-origin', 'x-real-ip': '192.0.2.10' };
const req = (path: string, opts: Record<string, unknown> = {}) => new NextRequest(`https://www.signumhq.com${path}`, { headers: baseHeaders, ...opts });
let evalCalls = 0;
let answer: unknown = ['empty'];
const store = { eval: async () => { evalCalls++; if (answer instanceof Error) throw answer; return answer; } };
server.giftStore = () => store;
process.env.GIFT_SHARE_SECRET = randomBytes(32).toString('hex');
const cookie = () => `sg_gift_recipient=${giftIdentity(req('/app')).cookie}`;
const post = (ua = ios, extra = {}) => req('/api/gift/claim', { method: 'POST', headers: { ...baseHeaders, 'user-agent': ua, cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded', ...extra }, body: new URLSearchParams({ gift: token }) });
const location = (r: Response) => r.headers.get('location') || '';

(async () => {
  await t('운영·시험 키 분리 및 기본 OS별 상한 20', () => {
    assert.notEqual(giftPrefix('production'), giftPrefix('preview'));
    delete process.env.GIFT_SHARE_DAILY_CAP_IOS;
    assert.equal(giftCap('ios'), 20);
    process.env.GIFT_SHARE_DAILY_CAP_IOS = '0'; assert.equal(giftCap('ios'), 0);
    delete process.env.GIFT_SHARE_DAILY_CAP_IOS;
    assert.ok(withGift('/app?from=share', token).endsWith(`gift=${token}`));
    assert.equal(withGift('/app', '<bad>'), '/app');
  });
  await t('플래그 꺼짐: 기존 /app 응답과 상태·헤더·본문 동일', async () => {
    delete process.env.GIFT_SHARE_ENABLED;
    const source = execFileSync('git', ['show', 'HEAD:src/app/app/route.ts'], { encoding: 'utf8' });
    const m = new Module(`${process.cwd()}/src/app/app/baseline.ts`, module);
    m.filename = `${process.cwd()}/src/app/app/baseline.ts`;
    m.paths = module.paths;
    (m as any)._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText, m.filename);
    for (const ua of [ios, android, desktop, 'facebookexternalhit/1.1']) {
      for (const suffix of ['', '&code=THREADSPRO']) {
        const path = `/app?from=threads&l=ko&gift=${token}${suffix}`;
        const a = await route.GET(req(path, { headers: { ...baseHeaders, 'user-agent': ua } }));
        const b = await m.exports.GET(req(path, { headers: { ...baseHeaders, 'user-agent': ua } }));
        assert.equal(a.status, b.status);
        assert.deepEqual([...a.headers], [...b.headers]);
        assert.equal(await a.text(), await b.text());
      }
    }
    assert.equal(evalCalls, 0);
  });
  await t('플래그 꺼짐: 새 API도 재고 호출 없이 일반 설치 폴백', async () => {
    assert.equal((await (await issue.POST(req('/api/gift/issue', { method: 'POST' }))).json()).ok, false);
    const r = await claim.POST(post()); assert.equal(r.status, 303); assert.ok(!location(r).includes('redeem'));
    assert.equal(evalCalls, 0);
  });
  process.env.GIFT_SHARE_ENABLED = '1';
  await t('GET·HEAD·OG·PC QR 무소비 및 코드 미노출', async () => {
    for (const ua of [ios, android, desktop, 'facebookexternalhit/1.1']) {
      for (const method of ['GET', 'HEAD']) {
        const r = await route.GET(req(`/app?gift=${token}&l=ko`, { method, headers: { ...baseHeaders, 'user-agent': ua } }));
        assert.equal(r.status, 200);
        assert.match(r.headers.get('cache-control') || '', /no-store/);
        assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
        const html = await r.text();
        if (method === 'HEAD') assert.equal(html, '');
        else if (ua === desktop) { assert.ok(html.includes('data-scan=') && html.includes(`gift=${token}`)); assert.ok(!html.includes('?code=')); }
        else if (ua === ios || ua === android) { assert.ok(html.includes('method="post"') && html.includes('/api/gift/claim')); assert.ok(!html.includes('/api/coupon/claim')); }
      }
    }
    assert.equal(evalCalls, 0);
  });
  await t('쿠폰 CSS와 기존 제목·등록 문구·쿠폰 번호 영역 유지', () => {
    for (const platform of ['ios', 'android']) {
      const opts = { platform, lang: 'ko', fromTag: 'gift', code: '•••• •••• •••• ••••', appleRedeemUrl: '#', playInstallUrl: '#' };
      const old = couponHtml(opts); const gift = couponHtml({ ...opts, gift: token });
      assert.equal(old.match(/<style>([\s\S]*?)<\/style>/)![1], gift.match(/<style>([\s\S]*?)<\/style>/)![1]);
      for (const label of ['쿠폰 번호', platform === 'ios' ? '쿠폰 적용하고 무료로 시작' : '내 쿠폰 받기', '자동 갱신']) assert.ok(gift.includes(label));
    }
  });
  await t('발행은 불투명 토큰만 반환하며 기기·계정·IP 제한 전달', async () => {
    let keys: string[] = []; let args: unknown[] = [];
    const capture = { eval: async (_: string, k: string[], a: unknown[]) => { keys = k; args = a; return 'issued'; } };
    const r = await server.issueGift(capture, { device: '익명기기', account: '검증계정', ip: '해시', app: true });
    assert.deepEqual(Object.keys(r).sort(), ['expiresAt', 'token']);
    assert.equal(keys.length, 5); assert.deepEqual(args.slice(2), [3, 3, 10, 400]);
    await server.issueGift(capture, { device: '익명웹', ip: '해시', app: false });
    assert.equal(args[2], 1);
  });
  await t('발행 API 성공은 코드 없이 토큰만, 발행 상한·Redis 장애는 일반 설치 폴백', async () => {
    answer = 'issued';
    const success = await (await issue.POST(req('/api/gift/issue', { method: 'POST' }))).json();
    assert.deepEqual(Object.keys(success).sort(), ['expiresAt', 'ok', 'token']);
    assert.equal(success.ok, true); assert.match(success.token, /^[A-Za-z0-9_-]{43}$/);
    for (const result of ['cap', new Error('가짜 장애')]) {
      answer = result;
      const body = await (await issue.POST(req('/api/gift/issue', { method: 'POST' }))).json();
      assert.deepEqual(Object.keys(body).sort(), ['ok', 'url']);
      assert.equal(body.ok, false); assert.ok(!body.url.includes('code='));
    }
  });
  await t('동일 배정 재시도는 같은 스토어 주소·OS별 기존 등록 형식', async () => {
    for (const [ua, os] of [[ios, 'ios'], [android, 'android']]) {
      const code = fakeCode(os); answer = ['new', code];
      const first = await claim.POST(post(ua)); answer = ['again', code];
      const retry = await claim.POST(post(ua));
      assert.equal(first.status, 303); assert.equal(location(first), location(retry));
      const u = new URL(location(first));
      assert.equal(u.searchParams.get('code'), code);
      assert.equal(u.hostname, os === 'ios' ? 'apps.apple.com' : 'play.google.com');
      if (os === 'ios') { assert.equal(u.searchParams.get('id'), '6783130444'); assert.equal(u.searchParams.get('ctx'), 'offercodes'); }
    }
  });
  await t('상한·소진·만료·타 수신자·OS 잠금·잘못된 응답·Redis 장애는 코드 없는 303', async () => {
    for (const result of [['cap'], ['empty'], ['expired'], ['taken'], ['recipient'], ['invalid'], ['new', 42], new Error('가짜 장애')]) {
      answer = result; const r = await claim.POST(post());
      assert.equal(r.status, 303); assert.ok(!location(r).includes('code=') && !location(r).includes('redeem'));
    }
  });
  await t('다른 출처·봇·위조 쿠키·알 수 없는 OS·잘못된 토큰 거부', async () => {
    const before = evalCalls;
    for (const r of [post(ios, { origin: 'https://example.invalid' }), post('facebookexternalhit/1.1'), post(ios, { cookie: 'sg_gift_recipient=invalid' }), post(desktop)]) {
      assert.ok(!location(await claim.POST(r)).includes('redeem'));
    }
    assert.equal(evalCalls, before);
    assert.equal(await server.claimGift(store, { token: '<bad>', os: 'ios', device: '가짜' }), null);
  });
  console.log(`선물 경로 ${n}개 통과. 실제 Lua 동시성 시험은 별도입니다.`);
})().catch(() => { console.error('선물 시험 실패(민감값 출력 생략)'); process.exitCode = 1; });
