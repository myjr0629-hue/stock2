/**
 * 스마트링크(/app · /app-uc · /app-wim) — 사람 판정·iOS 캠페인 토큰·CPP·안드로이드 리퍼러·기기 분기 (2026-10-04)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/smartLink.test.ts
 *
 * 라우트는 «진짜 GET 핸들러»를 부른다. next/server 의 after() 만 기록용 함수로 바꿔(요청 범위 밖에서는 던지므로)
 * 응답 뒤 집계가 «무엇을» 하려는지는 따로 보고, Redis 는 건드리지 않는다.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';

// ── next/server 의 after 를 가로챈다(라우트 import 보다 먼저) ──
const afterCalls: Array<() => unknown> = [];
const nsPath = require.resolve('next/server');
const realNs = require(nsPath);
require.cache[nsPath] = { id: nsPath, filename: nsPath, loaded: true, exports: { ...realNs, after: (fn: () => unknown) => { afterCalls.push(fn); } } } as unknown as Module;

process.env.APPLE_CAMPAIGN_PT = '129074309';

import { NextRequest } from 'next/server';
import { classifyClick, clickFields, isPreviewBot, clickKey } from '../src/lib/marketing/clickHuman';
import { appleStoreUrl, appleUrlWithCampaign, applePt, playUrlWithReferrer } from '../src/lib/marketing/storeRedirect';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sg = require('../src/app/app/route'); const uc = require('../src/app/app-uc/route'); const wim = require('../src/app/app-wim/route');

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  kakaoAnd: 'Mozilla/5.0 (Linux; Android 13; SM-S911N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36;KAKAOTALK 2410430',
  kakaoIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5',
  instaIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 340.0.0.22.109 (iPhone15,2; iOS 17_5; ko_KR; ko; scale=3.00; 1179x2556; 611206356)',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  kakaoScrap: 'facebookexternalhit/1.1; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/t/scrap/33984',
  headless: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36',
  yandexIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 8_1 like Mac OS X) AppleWebKit/600.1.4 (KHTML, like Gecko) Version/8.0 Mobile/12B411 Safari/600.1.4 (compatible; YandexMobileBot/3.0; +http://yandex.com/bots)',
  adsbotIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1 (compatible; AdsBot-Google-Mobile; +http://www.google.com/mobile/adsbot.html)',
  ahrefsIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1 (compatible; AhrefsSiteAudit/6.1; +http://ahrefs.com/robot/site-audit)',
};
const NAV = { 'accept-language': 'ko-KR,ko;q=0.9', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'sec-fetch-site': 'cross-site', 'sec-fetch-user': '?1' };
const H = (o: Record<string, string>) => new Headers(o);
const req = (path: string, ua: string, extra: Record<string, string> = NAV) => new NextRequest(`https://www.signumhq.com${path}`, { headers: { 'user-agent': ua, ...extra } });

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };
(async () => {
  await t('사람 판정: 아이폰 Safari·안드 Chrome·카톡/인스타 인앱의 «문서 이동»은 human', () => {
    for (const ua of [UA.iphone, UA.android, UA.kakaoAnd, UA.kakaoIos, UA.instaIos, UA.mac]) assert.equal(classifyClick(H({ 'user-agent': ua, ...NAV })), 'human', ua.slice(0, 40));
  });
  await t('봇·헤드리스·감사 도구(폰 UA 를 흉내 내도) → bot', () => {
    for (const ua of [UA.headless, UA.yandexIos, UA.adsbotIos, UA.ahrefsIos, 'python-requests/2.31', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot', '']) {
      assert.equal(classifyClick(H({ 'user-agent': ua, ...NAV })), 'bot', ua.slice(0, 50));
    }
  });
  await t('prefetch·prerender(Sec-Purpose·Purpose·Next 라우터) → prefetch', () => {
    assert.equal(classifyClick(H({ 'user-agent': UA.iphone, ...NAV, 'sec-purpose': 'prefetch;anonymous-client-ip' })), 'prefetch');
    assert.equal(classifyClick(H({ 'user-agent': UA.android, ...NAV, 'sec-purpose': 'prefetch;prerender' })), 'prefetch');
    assert.equal(classifyClick(H({ 'user-agent': UA.mac, ...NAV, purpose: 'prefetch' })), 'prefetch');
    assert.equal(classifyClick(H({ 'user-agent': UA.iphone, ...NAV, 'x-purpose': 'preview' })), 'prefetch');
    assert.equal(classifyClick(H({ 'user-agent': UA.iphone, ...NAV, 'next-router-prefetch': '1', rsc: '1' })), 'prefetch');
  });
  await t('Accept-Language 없음 → nolang · fetch/img/iframe/HEAD → nonnav · Sec-Fetch 없음 → nometa', () => {
    assert.equal(classifyClick(H({ 'user-agent': UA.iphone, 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' })), 'nolang');
    assert.equal(classifyClick(H({ 'user-agent': UA.iphone, ...NAV, 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'empty' })), 'nonnav');
    assert.equal(classifyClick(H({ 'user-agent': UA.iphone, ...NAV, 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' })), 'nonnav');
    assert.equal(classifyClick(H({ 'user-agent': UA.iphone, ...NAV, 'sec-fetch-dest': 'iframe' })), 'nonnav');
    assert.equal(classifyClick(H({ 'user-agent': UA.iphone, ...NAV }), 'HEAD'), 'nonnav');
    assert.equal(classifyClick(H({ 'user-agent': UA.iphone, 'accept-language': 'en-US' })), 'nometa');
  });
  await t('집계 필드: 사람만 site·ref·os 를 덧붙인다 · 키는 운영 clk: / 그 외 clkp:', () => {
    assert.deepEqual(clickFields(H({ 'user-agent': UA.mac, ...NAV, 'sec-fetch-site': 'same-origin' }), 'GET', 'google'), ['desktop|human', 'desktop|site:same-origin', 'desktop|ref:google', 'desktop|os:mac']);
    assert.deepEqual(clickFields(H({ 'user-agent': UA.iphone, ...NAV }), 'GET', 'self'), ['ios|human', 'ios|site:cross-site', 'ios|ref:self']);
    assert.deepEqual(clickFields(H({ 'user-agent': UA.iphone, 'accept-language': 'en' }), 'GET', 'none'), ['ios|nometa']);
    assert.equal(clickKey('sg', 'home', '2026-10-04', 'production'), 'clk:sg:home:2026-10-04');
    assert.equal(clickKey('uc', 'home', '2026-10-04', 'preview'), 'clkp:uc:home:2026-10-04');
  });
  await t('미리보기 봇: 카톡 스크랩 봇은 봇, 카톡 «인앱 브라우저»(사람)는 봇 아님', () => {
    assert.equal(isPreviewBot(UA.kakaoScrap), true);
    assert.equal(isPreviewBot(UA.kakaoAnd), false);
    assert.equal(isPreviewBot(UA.kakaoIos), false);
    assert.equal(isPreviewBot('Mozilla/5.0 (compatible; Twitterbot/1.0)'), true);
  });
  await t('iOS 캠페인 토큰: pt·ct=<from>·mt=8 · CPP(ppid) 유지 · 설정 없거나 태그 없으면 원본', () => {
    const base = 'https://apps.apple.com/app/signum-hq-stock-market-intel/id6783130444';
    assert.equal(applePt('129074309'), '129074309');
    assert.equal(applePt('pt=1'), null); assert.equal(applePt(''), null);   // 설정 없음(빈 값) → 토큰 안 붙임
    assert.equal(appleUrlWithCampaign(base, 'threads', '129074309'), `${base}?pt=129074309&ct=threads&mt=8`);
    assert.equal(appleUrlWithCampaign(base, 'threads', null), base);
    assert.equal(appleUrlWithCampaign(base, null, '129074309'), base);
    assert.equal(appleStoreUrl(base, 'home', 'signum', '129074309'), `${base}?ppid=a0522489-c6f8-4050-8e56-bc89b27f0927&pt=129074309&ct=home&mt=8`);
    for (const tag of ['geeknews', 'threads', 'hf_datasets', 'naver_blog']) assert.ok(appleStoreUrl(base, tag, 'signum', '1234').includes('ppid=8202cd7d-a522-41a8-b372-47e0e2806c8c&pt=1234&ct=' + tag + '&mt=8'), tag);
    for (const tag of ['indiehackers', 'threads_jp', 'bluesky']) assert.ok(!appleStoreUrl(base, tag, 'signum', '1234').includes('ppid='), tag);
  });
  await t('안드로이드 리퍼러: utm_source=<from>·utm_medium=smartlink 그대로(캠페인 토큰은 iOS 에만)', () => {
    const play = playUrlWithReferrer('https://play.google.com/store/apps/details?id=com.signumhq.app', 'geeknews');
    assert.equal(play, 'https://play.google.com/store/apps/details?id=com.signumhq.app&referrer=utm_source%3Dgeeknews%26utm_medium%3Dsmartlink%26utm_campaign%3Dsignumhq_web');
  });
  await t('라우트 분기(/app): 아이폰 → App Store(ppid+pt+ct) · 안드 → Play(referrer) · PC → 넘겨주기 200 · 카톡 인앱 → 302 · 미리보기 봇 → 카드', async () => {
    let r = await sg.GET(req('/app?from=home', UA.iphone));
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), 'https://apps.apple.com/app/signum-hq-stock-market-intel/id6783130444?ppid=a0522489-c6f8-4050-8e56-bc89b27f0927&pt=129074309&ct=home&mt=8');
    r = await sg.GET(req('/app?from=threads', UA.instaIos));
    assert.ok(r.headers.get('location')!.endsWith('?ppid=8202cd7d-a522-41a8-b372-47e0e2806c8c&pt=129074309&ct=threads&mt=8'));
    r = await sg.GET(req('/app?from=geeknews&l=ko', UA.android));
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), 'https://play.google.com/store/apps/details?id=com.signumhq.app&referrer=utm_source%3Dgeeknews%26utm_medium%3Dsmartlink%26utm_campaign%3Dsignumhq_web');
    r = await sg.GET(req('/app?from=home', UA.android));   // home 은 Play 맞춤 등록정보(listing=home)도 그대로
    assert.ok(r.headers.get('location')!.endsWith('utm_source%3Dhome%26utm_medium%3Dsmartlink%26utm_campaign%3Dsignumhq_web&listing=home'));
    r = await sg.GET(req('/app?from=naver_blog', UA.kakaoAnd));
    assert.equal(r.status, 302); assert.ok(r.headers.get('location')!.includes('utm_source%3Dnaver_blog'));
    r = await sg.GET(req('/app?from=naver_blog', UA.kakaoIos));
    assert.equal(r.status, 302); assert.ok(r.headers.get('location')!.includes('ct=naver_blog'));
    r = await sg.GET(req('/app?from=home', UA.mac));
    assert.equal(r.status, 200); const html = await r.text();
    assert.ok(html.includes('utm_medium%3Dpc_play') && html.includes('SIGNUM HQ') && !html.includes('<svg'));
    assert.equal(r.headers.get('cache-control'), 'private, no-store, max-age=0'); assert.equal(r.headers.get('vary'), 'User-Agent');
    r = await sg.GET(req('/app?from=home', UA.kakaoScrap, {}));
    assert.equal(r.status, 200); assert.ok((await r.text()).includes('og:'));
    r = await sg.GET(req('/app?from=threads&code=ABCD1234', UA.iphone));   // 리딤 링크는 예전 그대로
    assert.equal(r.headers.get('location'), 'https://apps.apple.com/redeem?ctx=offercodes&id=6783130444&code=ABCD1234');
  });
  await t('라우트 분기(/app-uc·/app-wim): 아이폰 → ppid+pt+ct · 안드 → Play referrer · 응답 뒤 집계 예약', async () => {
    afterCalls.length = 0;
    let r = await uc.GET(req('/app-uc?from=home', UA.iphone));
    assert.equal(r.headers.get('location'), 'https://apps.apple.com/app/undercurrent-news-money/id6788779895?ppid=f2559d55-be1a-41a1-989b-5940a5ff4d8a&pt=129074309&ct=home&mt=8');
    assert.equal(afterCalls.length, 3);   // 원시 hit · ref · 사람 판정(clk)
    r = await wim.GET(req('/app-wim?from=home', UA.android));
    assert.ok(r.headers.get('location')!.startsWith('https://play.google.com/store/apps/details?id=com.signumhq.wim&referrer=utm_source%3Dhome'));
    r = await wim.GET(req('/app-wim?from=bluesky', UA.iphone));
    assert.equal(r.headers.get('location'), 'https://apps.apple.com/app/whyd-it-move-stock-quiz/id6794356135?pt=129074309&ct=bluesky&mt=8');
  });
  // ── 리딤 코드 링크 G0 (2026-10-04) — 아이폰 = 애플 적용 · 안드 = Play 설치(애플 코드로 Play 리딤 안 감) · PC = QR 화면 ──
  const REDEEM = 'https://apps.apple.com/redeem?ctx=offercodes&id=6783130444&code=THREADSPRO';
  const PLAY_CODE = 'https://play.google.com/store/apps/details?id=com.signumhq.app&referrer=utm_source%3Dthreads%26utm_medium%3Dsmartlink%26utm_campaign%3Dsignumhq_web%26utm_content%3Dcode';
  // ★2026-10-05 쿠폰 화면 — 아이폰은 302 대신 «쿠폰 화면»(쿠폰 번호 + 단추 = 같은 애플 적용 주소). 남의 코드는 예전 302 그대로.
  await t('쿠폰 아이폰(Safari·카톡 인앱·인스타 인앱): 200 쿠폰 화면 · 단추 = 애플 적용 주소(캠페인 토큰 없음) · no-store·Vary UA · 소문자 코드도 대문자로', async () => {
    for (const ua of [UA.iphone, UA.kakaoIos, UA.instaIos]) {
      const r = await sg.GET(req('/app?from=threads&code=THREADSPRO', ua));
      assert.equal(r.status, 200, ua.slice(0, 40));
      assert.equal(r.headers.get('cache-control'), 'private, no-store, max-age=0'); assert.equal(r.headers.get('vary'), 'User-Agent');
      const html = await r.text();
      assert.ok(html.includes(`id="go" href="${REDEEM.replace(/&/g, '&amp;')}"`), ua.slice(0, 40));
      assert.ok(html.includes('🎟 SIGNUM HQ PRO <span class="nw">1개월 무료 쿠폰</span>') && html.includes('Threads 독자 전용 · 선착순 500명 · 10/30까지'), 'ko(태그·Accept-Language)');
    }
    const r = await sg.GET(req('/app?from=threads&code=threadspro', UA.iphone));
    assert.ok((await r.text()).includes('<p class="t-code" id="code">THREADSPRO</p>'));
    const en = await (await sg.GET(req('/app?from=x_us&code=XPRO', UA.iphone, { ...NAV, 'accept-language': 'en-US,en;q=0.9' }))).text();
    assert.ok(en.includes('For X readers only · First 500') && en.includes('US$9.99/mo'), 'en');
    const other = await sg.GET(req('/app?from=threads&code=ABCD1234', UA.iphone));   // 남의 코드 → 예전 302
    assert.equal(other.status, 302); assert.equal(other.headers.get('location'), 'https://apps.apple.com/redeem?ctx=offercodes&id=6783130444&code=ABCD1234');
  });
  await t('쿠폰 안드로이드(COUPON_ANDROID=1): Chrome·카톡 인앱 → 200 쿠폰 화면(«내 쿠폰 받기» · 쿠폰 없이 설치 = Play 리퍼러) · 남의 코드는 예전 302', async () => {
    process.env.COUPON_ANDROID = '1';
    try {
      for (const ua of [UA.android, UA.kakaoAnd]) {
        const r = await sg.GET(req('/app?from=threads&code=THREADSPRO', ua));
        assert.equal(r.status, 200, ua.slice(0, 40)); assert.equal(r.headers.get('vary'), 'User-Agent');
        const html = await r.text();
        assert.ok(html.includes('id="claim"') && html.includes("fetch('/api/coupon/claim'") && html.includes(PLAY_CODE.replace(/&/g, '&amp;')));
        assert.ok(html.includes('🎟 SIGNUM HQ PRO <span class="nw">30일 무료 쿠폰</span>') && html.includes('선착순 200명'));
      }
      const other = await sg.GET(req('/app?from=threads&code=ABCD1234', UA.android));
      assert.equal(other.status, 302); assert.equal(other.headers.get('location'), PLAY_CODE);
      const pc = await (await sg.GET(req('/app?from=threads&code=THREADSPRO', UA.mac))).text();   // PC 안내도 «나만의 30일 무료 쿠폰 번호»
      assert.ok(pc.includes('나만의 30일 무료 쿠폰 번호'));
    } finally { delete process.env.COUPON_ANDROID; }
  });
  await t('G0 안드로이드(Chrome·카톡 인앱, 안드 쿠폰 꺼짐 = 기본): Play «설치»(utm_content=code) · play.google.com/redeem 으로 안 감', async () => {
    for (const ua of [UA.android, UA.kakaoAnd]) {
      const r = await sg.GET(req('/app?from=threads&code=THREADSPRO', ua));
      assert.equal(r.status, 302); assert.equal(r.headers.get('location'), PLAY_CODE, ua.slice(0, 40));
      assert.ok(!r.headers.get('location')!.includes('/redeem'));
    }
    const noTag = await sg.GET(req('/app?code=THREADSPRO', UA.android));   // 태그가 없으면 리퍼러 없는 설치 주소(코드 없는 링크와 같은 규칙)
    assert.equal(noTag.headers.get('location'), 'https://play.google.com/store/apps/details?id=com.signumhq.app');
  });
  await t('G0 PC: 200 HTML(no-store·Vary UA) · QR 안 주소 = 같은 링크 + via=qr · 코드 글자 · 언어(l= > Accept-Language) · 맞춤/일회용 안내', async () => {
    let r = await sg.GET(req('/app?from=threads&code=THREADSPRO', UA.mac));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'private, no-store, max-age=0'); assert.equal(r.headers.get('vary'), 'User-Agent');
    let html = await r.text();
    assert.ok(html.includes('data-scan="https://www.signumhq.com/app?from=threads&amp;code=THREADSPRO&amp;via=qr"'), 'QR 주소');
    assert.ok(html.includes('<svg') && html.includes('>THREADSPRO<'), 'QR·코드 글자');
    assert.ok(html.includes('<h1>🎟 SIGNUM HQ PRO 1개월 무료 쿠폰</h1>') && html.includes('<p class="free">1개월 무료 뒤 월 ₩11,900 자동 갱신 · 언제든 해지</p>'), 'ko 쿠폰 결 + «무료» 문장 안 자동 갱신');
    assert.ok(html.includes('Threads 독자 전용 · 선착순 500명 · 10/30까지') && html.includes('무료 코드는 현재 아이폰 전용'), '안드 쿠폰 꺼짐 = 예전 안드 안내');
    assert.ok(html.includes('signumhq.com/app?code=THREADSPRO') && !html.includes('기프트 카드 또는 코드 사용'), '맞춤 코드 = 링크 안내(손입력 안내 없음)');
    assert.ok(!html.includes('play.google.com/redeem') && !html.includes('itms-apps'));
    r = await sg.GET(req('/app?from=threads&code=THREADSPRO&l=ja', UA.mac)); html = await r.text();
    assert.ok(html.includes('1か月無料クーポン') && html.includes('¥1,280'), 'ja');
    r = await sg.GET(req('/app?from=x_us&code=XPRO', UA.mac, { ...NAV, 'accept-language': 'en-US,en;q=0.9' })); html = await r.text();
    assert.ok(html.includes('1-month free coupon') && html.includes('US$9.99') && html.includes('from=x_us&amp;code=XPRO&amp;via=qr'), 'en');
    r = await sg.GET(req('/app?from=threads&code=TESTCODE1234567890', UA.mac)); html = await r.text();   // 애플 일회용 번호 형식(18자, 가짜 값)
    assert.ok(html.includes('기프트 카드 또는 코드 사용') && !html.includes('class="url"'), '일회용 = App Store 손입력 안내');
    r = await sg.GET(req('/app?from=threads&code=THREADSPRO', UA.headless, {})); assert.equal(r.status, 200);   // 미리보기 봇이 아닌 수집기도 같은 화면(이동 없음)
  });
  await t('G0 미리보기 봇 + 코드: 예전 그대로 카드(코드를 보기 전에 응답)', async () => {
    let r = await sg.GET(req('/app?from=threads&code=THREADSPRO', UA.kakaoScrap, {}));
    let html = await r.text();
    assert.equal(r.status, 200); assert.ok(html.includes('og:title') && html.includes('url=https://apps.apple.com/app/signum-hq-stock-market-intel/id6783130444"'));
    r = await sg.GET(req('/app?from=threads&code=THREADSPRO', 'Mozilla/5.0 (compatible; Twitterbot/1.0)', {})); html = await r.text();
    assert.ok(html.includes('og:title') && !html.includes('THREADSPRO&amp;via'));
  });
  await t('G0 집계: 코드 클릭 = 기존 합계 키 + clk:code(기기·사람) · 폰 QR(via=qr)은 qr 키도 · 형식 밖 코드는 «없는 것»', async () => {
    afterCalls.length = 0; await sg.GET(req('/app?from=threads&code=THREADSPRO', UA.iphone));
    assert.equal(afterCalls.length, 6);   // ref · clk:sg · hit · code 합계 · clk:code · clk:coupon(쿠폰 화면 노출, 2026-10-05)
    afterCalls.length = 0; await sg.GET(req('/app?from=threads&code=THREADSPRO&via=qr', UA.iphone));
    assert.equal(afterCalls.length, 7);   // + qr
    afterCalls.length = 0; await sg.GET(req('/app?from=threads&code=ABCD1234', UA.iphone));
    assert.equal(afterCalls.length, 5);   // 남의 코드 = 쿠폰 화면 없음(예전 그대로)
    afterCalls.length = 0; await sg.GET(req('/app?from=threads&code=THREADSPRO', UA.mac));
    assert.equal(afterCalls.length, 6);   // ref · clk:sg · hit · ua · code 합계 · clk:code
    assert.equal(clickKey('code', 'threads', '2026-10-04', 'production'), 'clk:code:threads:2026-10-04');
    for (const bad of ['AB', 'abc-123', 'X'.repeat(25)]) {
      const r = await sg.GET(req(`/app?from=home&code=${bad}`, UA.iphone));
      assert.equal(r.headers.get('location'), 'https://apps.apple.com/app/signum-hq-stock-market-intel/id6783130444?ppid=a0522489-c6f8-4050-8e56-bc89b27f0927&pt=129074309&ct=home&mt=8', bad);
    }
  });
  console.log(`\n✅ smartLink: ${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
