import { couponSafetyNormalized } from './_couponSafetyBaseline';
// 실행: npx tsx --test tests/giftShare.test.ts
/** 로컬 가짜 저장소만 사용한다. 실제 Lua 동시성은 giftShareLua.test.mjs로 분리한다. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { relative } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// 외부 호출은 시험이 즉시 실패하게 한다. 비밀값·코드는 출력하지 않는다.
let externalCalls = 0;
globalThis.fetch = async () => { externalCalls++; throw new Error('시험 중 외부 접근 금지'); };
const nsPath = require.resolve('next/server');
const ns = require(nsPath);
const afterCalls: Array<() => unknown> = [];
const flushAfter = async () => { for (const fn of afterCalls.splice(0)) await fn(); };
require.cache[nsPath] = { id: nsPath, filename: nsPath, loaded: true, exports: { ...ns, after: (fn: () => unknown) => { afterCalls.push(fn); } } } as Module;
// tsx의 export는 setter 없는 getter다. 의존 라우트를 읽기 전에 캐시의 exports를 교체한다.
const rcPath = require.resolve('../src/services/redisClient');
require.cache[rcPath] = { id: rcPath, filename: rcPath, loaded: true, exports: {
  getFromCache: async () => null, setInCache: async () => true,
} } as Module;
const serverPath = require.resolve('../src/lib/giftShare/server');
const server = { ...require(serverPath), giftStore: () => store };
require.cache[serverPath]!.exports = server;
const inviteStorePath = require.resolve('../src/lib/invite/store');
const inviteStore = { ...require(inviteStorePath) };
require.cache[inviteStorePath]!.exports = inviteStore;
const { giftIdentity } = require('../src/lib/giftShare/http');
const { giftPrefix, giftCap, withGift } = require('../src/lib/giftShare/config');
const { couponHtml } = require('../src/lib/marketing/couponHtml');
const { COUPON_SAFETY } = require('../src/lib/marketing/couponSafety');
const { desktopRedeemHtml } = require('../src/lib/marketing/desktopHandoff');
const route = require('../src/app/app/route');
const issue = require('../src/app/api/gift/issue/route');
const claim = require('../src/app/api/gift/claim/route');
const { memoryInviteStore } = require('../src/lib/invite/memoryStore');
const { arrive, inviteKeys } = require('../src/lib/invite/engine');
const { inviteIpHash, inviteSecret } = require('../src/lib/invite/guard');
const { newInviteKey, inviteRefOf } = require('../src/lib/invite/identity');
const { NextRequest } = ns;
let n = 0;
let stage = '준비';
const t = async (name: string, fn: () => unknown) => { stage = name; afterCalls.length = 0; await fn(); afterCalls.length = 0; n++; console.log(`통과: ${name}`); };
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
process.env.GIFT_SHARE_SECRET = randomBytes(32).toString('hex');
process.env.INVITE_IP_SALT = randomBytes(32).toString('hex');
process.env.VERCEL_ENV = 'preview';
inviteStore.upstashInviteStore = () => memoryInviteStore();
const cookie = () => `sg_gift_recipient=${giftIdentity(req('/app')).cookie}`;
const post = (ua = ios, extra = {}) => req('/api/gift/claim', { method: 'POST', headers: { ...baseHeaders, 'user-agent': ua, cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded', ...extra }, body: new URLSearchParams({ gift: token }) });
const location = (r: Response) => r.headers.get('location') || '';

// 현재 HEAD를 기준으로 삼으면 구현을 자신과 비교하게 된다. 기존 의존 템플릿도 origin/main에서 읽는다.
const baselinePaths = new Set(['src/app/app/route.ts', 'src/lib/marketing/couponHtml.ts', 'src/lib/marketing/desktopHandoff.ts']);
const baselineCache = new Map<string, Module>();
const withoutCouponWarning = couponSafetyNormalized;
function baseline(path: string): any {
  if (baselineCache.has(path)) return baselineCache.get(path)!.exports;
  const source = execFileSync('git', ['show', `origin/main:${path}`], { encoding: 'utf8' });
  const m = new Module(`${process.cwd()}/${path}`, module);
  m.filename = `${process.cwd()}/${path}`;
  m.paths = module.paths;
  baselineCache.set(path, m);
  const originalRequire = m.require.bind(m);
  m.require = ((id: string) => {
    const dependency = relative(process.cwd(), (Module as any)._resolveFilename(id, m));
    return baselinePaths.has(dependency) ? baseline(dependency) : originalRequire(id);
  }) as typeof m.require;
  (m as any)._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText, m.filename);
  return m.exports;
}

// 생성 HTML의 기존 안내가 hidden 조상 안에 남았는지 검사한다. 브라우저·스크립트 실행에 의존하지 않는다.
function visibleHtml(html: string): string {
  const stack: boolean[] = [];
  let visible = '';
  for (const match of html.matchAll(/<\/?([a-z][a-z0-9]*)\b[^>]*>|([^<]+)/gi)) {
    const [raw, tag] = match;
    if (!tag) { if (!stack.includes(true)) visible += raw; continue; }
    if (raw.startsWith('</')) { if (!stack.includes(true)) visible += raw; stack.pop(); continue; }
    const hidden = /\shidden(?:\s|=|>)/.test(raw);
    if (!hidden && !stack.includes(true)) visible += raw;
    if (!/^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(tag)) stack.push(hidden);
  }
  return visible;
}

async function submitLanding(response: Response, pageUrl: string, ua: string): Promise<Response> {
  const html = await response.text();
  const action = html.match(/<form method="post" action="([^"]+)"/)![1];
  const value = html.match(/name="gift" value="([^"]+)"/)![1];
  const destination = new URL(action, pageUrl);
  // Fetch의 비 CORS POST 규칙: no-referrer면 Origin이 null이 된다. 같은 출처 정책은 출처를 보존한다.
  const policy = response.headers.get('referrer-policy');
  assert.equal(policy, 'same-origin');
  assert.equal(destination.origin, new URL(pageUrl).origin);
  const origin = policy === 'no-referrer' ? 'null' : new URL(pageUrl).origin;
  const cookie = response.headers.get('set-cookie')!.split(';')[0];
  return claim.POST(new NextRequest(destination, { method: 'POST', headers: {
    ...baseHeaders, 'user-agent': ua, cookie, origin, 'content-type': 'application/x-www-form-urlencoded',
    'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document',
  }, body: new URLSearchParams({ gift: value }) }));
}

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
  await t('플래그 꺼짐: 안전 경고 외 origin/main /app 상태·헤더·본문 144조합 동일', async () => {
    delete process.env.GIFT_SHARE_ENABLED;
    const old = baseline('src/app/app/route.ts');
    for (const ua of [ios, android, desktop, 'facebookexternalhit/1.1']) {
      for (const lang of ['ko', 'en', 'ja']) for (const query of ['from=threads', 'from=threads&code=THREADSPRO', 'from=gift&code=WEBPRO']) {
        for (const gift of ['', `&gift=${token}`]) for (const method of ['GET', 'HEAD']) {
          const path = `/app?${query}&l=${lang}${gift}`;
          const opts = { method, headers: { ...baseHeaders, 'user-agent': ua } };
          const a = await route.GET(req(path, opts));
          const b = await old.GET(req(path, opts));
          assert.equal(a.status, b.status);
          assert.deepEqual([...a.headers], [...b.headers]);
          assert.equal(withoutCouponWarning(await a.text()), withoutCouponWarning(await b.text()));
        }
      }
    }
    assert.equal(evalCalls, 0);
  });
  await t('기존 쿠폰·QR 템플릿: 안전 경고 외 origin/main 대비 48조합 바이트 동일', async () => {
    const oldCoupon = baseline('src/lib/marketing/couponHtml.ts').couponHtml;
    const oldDesktop = baseline('src/lib/marketing/desktopHandoff.ts').desktopRedeemHtml;
    for (const lang of ['ko', 'en', 'ja']) {
      for (const platform of ['ios', 'android']) for (const inApp of [false, true]) for (const ref of [null, 'abcdefghjkmnpqrs']) {
        const opts = { platform, lang, fromTag: 'gift', code: 'WEBPRO', appleRedeemUrl: '#', playInstallUrl: '#', ref,
          androidInApp: inApp, iosInApp: inApp, iosStayHint: inApp };
        assert.equal(withoutCouponWarning(couponHtml(opts)), withoutCouponWarning(oldCoupon(opts)));
      }
      for (const coupon of [false, true]) for (const androidCoupon of [false, true]) for (const code of ['WEBPRO', 'GZTEST123456789012']) {
        const opts = { lang, fromTag: 'gift', code, coupon, androidCoupon, redeemUrl: 'https://apps.apple.com/redeem?code=WEBPRO' };
        assert.equal(await desktopRedeemHtml(opts), await oldDesktop(opts));
      }
    }
  });
  await t('플래그 꺼짐: 새 API도 재고 호출 없이 일반 설치 폴백', async () => {
    assert.equal((await (await issue.POST(req('/api/gift/issue', { method: 'POST' }))).json()).ok, false);
    const r = await claim.POST(post()); assert.equal(r.status, 303); assert.ok(!location(r).includes('redeem'));
    assert.equal(evalCalls, 0);
  });
  process.env.GIFT_SHARE_ENABLED = '1';
  await t('P1: 선물 토큰·기존 링크 모두 응답 뒤 터치 한 번 → 첫 실행 보상 연결·중복 방지', async () => {
    const ref = inviteRefOf(newInviteKey());
    const ipHash = inviteIpHash(baseHeaders['x-real-ip'], inviteSecret());
    const before = evalCalls;
    for (const from of ['gift', 'share_pick', 'share_line', 'share_earn']) {
      for (const [ua, os] of [[ios, 'ios'], [android, 'android']]) for (const gift of ['', `&gift=${token}`]) {
        const memory = memoryInviteStore();
        let writes = 0;
        const set = memory.set.bind(memory);
        const touchKey = inviteKeys().touch(os, ipHash);
        memory.set = async (key: string, value: string, ttl: number) => { if (key === touchKey) writes++; await set(key, value, ttl); };
        inviteStore.upstashInviteStore = () => memory;
        afterCalls.length = 0;
        await route.GET(req(`/app?from=${from}&ref=${ref}${gift}`, { headers: { ...baseHeaders, 'user-agent': ua,
          'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' } }));
        assert.equal(await memory.get(touchKey), null, '응답 전에 터치를 쓰지 않는다');
        await flushAfter();
        assert.equal(writes, 1, '한 요청은 터치 한 번만 기록한다');
        const key = newInviteKey();
        assert.deepEqual(await arrive(memory, { key, os, ipHash }), { matched: true, credited: true, from, inviterRef: ref });
        assert.deepEqual(await arrive(memory, { key, os, ipHash }), { matched: false, reason: 'again' });
      }
    }
    assert.equal(evalCalls, before, 'GET에서 선물 재고를 호출하지 않는다');
  });
  await t('P1: HEAD·미리보기·봇·prefetch·비탐색·PC·잘못된 ref·비초대·IP 없음은 무귀속', async () => {
    const ref = inviteRefOf(newInviteKey());
    const human = { ...baseHeaders, 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };
    const cases = [
      { method: 'HEAD' }, { headers: { ...human, 'user-agent': 'facebookexternalhit/1.1' } },
      { headers: { ...human, 'user-agent': `${ios} bot` } }, { headers: { ...human, purpose: 'prefetch' } },
      { headers: { ...human, 'accept-language': '' } }, { headers: { ...human, 'sec-fetch-mode': 'cors' } },
      { headers: { ...human, 'user-agent': desktop } }, { ref: '' }, { ref: 'google' }, { from: 'threads' },
      { headers: { ...human, 'x-real-ip': '' } },
    ];
    const before = evalCalls;
    for (const c of cases) {
      const memory = memoryInviteStore(); let writes = 0;
      memory.set = async () => { writes++; };
      memory.hsetExpiring = async () => { writes++; };
      inviteStore.upstashInviteStore = () => memory;
      await route.GET(req(`/app?from=${c.from ?? 'gift'}&ref=${c.ref ?? ref}&gift=${token}`, {
        method: c.method ?? 'GET', headers: c.headers ?? human,
      }));
      await flushAfter(); assert.equal(writes, 0);
    }
    assert.equal(evalCalls, before);
  });
  await t('P1: 추천 저장소 장애도 선물 화면·재고 무소비 유지', async () => {
    const memory = memoryInviteStore(); let attempts = 0;
    memory.set = async () => { attempts++; throw new Error('가짜 추천 저장소 장애'); };
    inviteStore.upstashInviteStore = () => memory;
    const before = evalCalls;
    const r = await route.GET(req(`/app?from=gift&ref=${inviteRefOf(newInviteKey())}&gift=${token}`, {
      headers: { ...baseHeaders, 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' },
    }));
    assert.equal(r.status, 200); assert.ok((await r.text()).includes('/api/gift/claim'));
    await flushAfter(); assert.equal(attempts, 1); assert.equal(evalCalls, before);
    inviteStore.upstashInviteStore = () => memoryInviteStore();
  });
  await t('GET·HEAD·OG·PC QR 무소비 및 코드 미노출', async () => {
    for (const ua of [ios, android, desktop, 'facebookexternalhit/1.1']) {
      for (const method of ['GET', 'HEAD']) {
        const r = await route.GET(req(`/app?gift=${token}&l=ko`, { method, headers: { ...baseHeaders, 'user-agent': ua } }));
        assert.equal(r.status, 200);
        assert.match(r.headers.get('cache-control') || '', /no-store/);
        assert.equal(r.headers.get('referrer-policy'), 'same-origin');
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
  await t('P1: 랜딩 정책·쿠키·폼으로 iOS·Android POST 배정 후 303', async () => {
    for (const ua of [ios, android]) {
      const code = fakeCode(ua === ios ? 'ios' : 'android'); answer = ['new', code];
      const pageUrl = `/app?gift=${token}&l=ko`;
      const landing = await route.GET(req(pageUrl, { headers: { ...baseHeaders, 'user-agent': ua } }));
      const r = await submitLanding(landing, `https://www.signumhq.com${pageUrl}`, ua);
      assert.equal(r.status, 303);
      assert.equal(new URL(location(r)).searchParams.get('code'), code);
      assert.equal(r.headers.get('referrer-policy'), 'same-origin', '외부 스토어에 Referer를 보내지 않는 정책');
    }
  });
  await t('P2 Android: 세 언어 구독·앱 설정 안내가 스크립트 없이 등록 전 표시', async () => {
    for (const lang of ['ko', 'en', 'ja']) {
      const opts = { platform: 'android', lang, fromTag: 'gift', code: '•••• •••• •••• ••••', appleRedeemUrl: '#', playInstallUrl: '#' };
      const old = couponHtml(opts);
      const html = await (await route.GET(req(`/app?gift=${token}&l=${lang}`, { headers: { ...baseHeaders, 'user-agent': android } }))).text();
      const instructions = old.match(/<p class="step2" id="step2">[\s\S]*?<\/p>\n<p class="help">[\s\S]*?<\/p>/)![0];
      assert.ok(visibleHtml(html).includes(instructions), '기존 두 안내가 hidden 조상 밖에 있다');
      assert.equal((html.match(/id="step2"/g) || []).length, 1);
      assert.ok(!html.includes('<script>') && !html.includes('/api/coupon/claim'));
    }
  });
  await t('P2 iPad: 맥 UA 터치 이동 → 같은 토큰 iOS 폼 → Apple 303, PC는 QR 유지', async () => {
    const before = evalCalls;
    const path = `/app?gift=${token}&l=ja`;
    const html = await (await route.GET(req(path, { headers: { ...baseHeaders, 'user-agent': desktop } }))).text();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    let target = '';
    const navigate = (maxTouchPoints: number, userAgent = desktop) => runInNewContext(script, {
      navigator: { maxTouchPoints, userAgent }, location: { replace: (url: string) => { target = url; } },
    });
    navigate(0); assert.equal(target, '', '일반 PC는 QR 유지');
    navigate(5, 'Mozilla/5.0 (Windows NT 10.0)'); assert.equal(target, '', '터치 Windows도 QR 유지');
    navigate(5);
    const url = new URL(target);
    assert.equal(url.searchParams.get('gift'), token); assert.equal(url.searchParams.get('l'), 'ja');
    assert.equal(url.searchParams.get('gift_os'), 'ios');
    const landing = await route.GET(req(url.pathname + url.search, { headers: { ...baseHeaders, 'user-agent': desktop } }));
    assert.equal(evalCalls, before, 'iPad 이동·쿠폰 조회도 무소비');
    const code = fakeCode(); answer = ['new', code];
    const r = await submitLanding(landing, target, desktop);
    assert.equal(r.status, 303); assert.equal(new URL(location(r)).hostname, 'apps.apple.com');
    assert.equal(new URL(location(r)).searchParams.get('code'), code);
  });
  await t('4·5차 P2: PC 선물 링크의 QR·iPad 이동도 초대자 ref 유지 → 폰 스캔·iPad 첫 실행 보상 적립', async () => {
    const ref = inviteRefOf(newInviteKey());
    const ipHash = inviteIpHash(baseHeaders['x-real-ip'], inviteSecret());
    const before = evalCalls;
    for (const from of ['gift', 'share_pick']) {
      const pc = await route.GET(req(`/app?from=${from}&ref=${ref}&gift=${token}&l=ko`, { headers: { ...baseHeaders, 'user-agent': desktop,
        'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' } }));
      const html = await pc.text();
      const scan = new URL(html.match(/data-scan="([^"]+)"/)![1].replace(/&amp;/g, '&'));
      assert.equal(scan.searchParams.get('ref'), ref, 'QR 주소에 ref');
      assert.equal(scan.searchParams.get('from'), from);
      assert.equal(scan.searchParams.get('gift'), token);
      const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
      let target = '';
      runInNewContext(script, { navigator: { maxTouchPoints: 5, userAgent: desktop }, location: { replace: (url: string) => { target = url; } } });
      assert.equal(new URL(target).searchParams.get('ref'), ref, 'iPad 이동 주소에 ref');
      // 5차 P2: 맥 UA iPad 가 이동한 주소를 열면 iOS 터치가 남아 iOS 첫 실행이 적립된다.
      {
        const memory = memoryInviteStore();
        inviteStore.upstashInviteStore = () => memory;
        afterCalls.length = 0;
        const ipad = new URL(target);
        const r = await route.GET(req(ipad.pathname + ipad.search, { headers: { ...baseHeaders, 'user-agent': desktop,
          'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' } }));
        assert.equal(r.status, 200); assert.ok((await r.text()).includes('/api/gift/claim?gift_os=ios'));
        await flushAfter();
        assert.deepEqual(await arrive(memory, { key: newInviteKey(), os: 'ios', ipHash }), { matched: true, credited: true, from, inviterRef: ref }, 'iPad 이동 뒤 iOS 첫 실행 적립');
      }
      for (const [ua, os] of [[ios, 'ios'], [android, 'android']]) {
        const memory = memoryInviteStore();
        inviteStore.upstashInviteStore = () => memory;
        afterCalls.length = 0;
        const phone = await route.GET(req(scan.pathname + scan.search, { headers: { ...baseHeaders, 'user-agent': ua,
          'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' } }));
        assert.equal(phone.status, 200);
        await flushAfter();
        assert.deepEqual(await arrive(memory, { key: newInviteKey(), os, ipHash }), { matched: true, credited: true, from, inviterRef: ref });
      }
    }
    // 힌트 없는 맥 UA(일반 PC)는 여전히 무귀속 — PC 자체 조회로는 터치를 남기지 않는다.
    {
      const memory = memoryInviteStore(); let writes = 0;
      memory.set = async () => { writes++; }; memory.hsetExpiring = async () => { writes++; };
      inviteStore.upstashInviteStore = () => memory;
      afterCalls.length = 0;
      await route.GET(req(`/app?from=gift&ref=${ref}&gift=${token}&l=ko`, { headers: { ...baseHeaders, 'user-agent': desktop,
        'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' } }));
      await flushAfter(); assert.equal(writes, 0, 'PC 조회는 무귀속');
    }
    // ref 가 없거나 잘못되면 QR 주소에 싣지 않는다(기존 동작).
    for (const bad of ['', '&ref=google', '&ref=%3Cx%3E']) {
      const html = await (await route.GET(req(`/app?from=gift${bad}&gift=${token}&l=ko`, { headers: { ...baseHeaders, 'user-agent': desktop } }))).text();
      assert.ok(!new URL(html.match(/data-scan="([^"]+)"/)![1].replace(/&amp;/g, '&')).searchParams.has('ref'));
    }
    assert.equal(evalCalls, before, 'QR·스캔 GET은 재고 무소비');
    inviteStore.upstashInviteStore = () => memoryInviteStore();
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
    for (const r of [post(ios, { origin: 'https://example.invalid' }), post(ios, { origin: 'null' }), post(ios, { origin: '' }),
      post(ios, { 'sec-fetch-site': 'cross-site' }), post(ios, { 'sec-fetch-site': 'same-site' }),
      post('facebookexternalhit/1.1'), post(ios, { cookie: 'sg_gift_recipient=invalid' }), post(desktop)]) {
      assert.ok(!location(await claim.POST(r)).includes('redeem'));
    }
    assert.equal(evalCalls, before);
    assert.equal(await server.claimGift(store, { token: '<bad>', os: 'ios', device: '가짜' }), null);
  });
  assert.equal(externalCalls, 0, '외부 접근 시도 없음');
  console.log(`선물 경로 ${n}개 통과. 실제 Lua 동시성 시험은 별도입니다.`);
})().catch(() => { console.error(`선물 시험 실패: ${stage}(민감값 출력 생략)`); process.exitCode = 1; });
