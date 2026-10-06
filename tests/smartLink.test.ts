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
  await t('라우트 분기(/app): 아이폰 → App Store(ppid+pt+ct) · 안드 크롬 → Play(referrer) · PC → 넘겨주기 200 · 카톡 안드 인앱 → 앱 안 화면 200(2026-10-05) · 카톡 iOS → 302 · 미리보기 봇 → 카드', async () => {
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
    r = await sg.GET(req('/app?from=naver_blog', UA.kakaoAnd));   // ★2026-10-05 앱 안 안드로이드 → intent 단추 화면(같은 referrer)
    assert.equal(r.status, 200); assert.equal(r.headers.get('vary'), 'User-Agent');
    assert.ok((await r.text()).includes('href="intent://details?id=com.signumhq.app&amp;referrer=utm_source%3Dnaver_blog%26utm_medium%3Dsmartlink%26utm_campaign%3Dsignumhq_web#Intent;scheme=market;package=com.android.vending;'));
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
  // ★2026-10-06 크리에이터 맞춤 코드(형식 ^[A-Z]{4,13}PRO$ — 값은 저장소에 없다, 가짜 ABCDPRO) = 채널 코드 8종과 같은 처리
  await t('크리에이터 코드 ABCDPRO: 아이폰 쿠폰 화면(«구독자 전용») · 안드(켜짐) «내 쿠폰 받기» · PC 쿠폰 결 QR · 링크 카드 PRO · 형식 밖(ABCD1PRO·ABCPRO)은 예전 302', async () => {
    const REDEEM_C = 'https://apps.apple.com/redeem?ctx=offercodes&id=6783130444&code=ABCDPRO';
    const PLAY_C = 'https://play.google.com/store/apps/details?id=com.signumhq.app&referrer=utm_source%3Dcr_test%26utm_medium%3Dsmartlink%26utm_campaign%3Dsignumhq_web%26utm_content%3Dcode';
    let r = await sg.GET(req('/app?from=cr_test&code=ABCDPRO', UA.iphone));
    assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'private, no-store, max-age=0'); assert.equal(r.headers.get('vary'), 'User-Agent');
    let html = await r.text();
    assert.ok(html.includes(`id="go" href="${REDEEM_C.replace(/&/g, '&amp;')}"`) && html.includes('<p class="t-code" id="code">ABCDPRO</p>'));
    assert.ok(html.includes('구독자 전용 · 선착순 500명 · 10/30까지'), '채널·크리에이터 이름을 지어내지 않는다');
    assert.ok(!/Threads|네이버|Bluesky|Indie Hackers|SIGNUM 웹/.test(html), '다른 채널 이름 없음');
    r = await sg.GET(req('/app?from=cr_test&code=abcdpro', UA.iphone, { ...NAV, 'accept-language': 'en-US,en;q=0.9' })); html = await r.text();
    assert.ok(r.status === 200 && html.includes('For subscribers only · First 500 · Until Oct 30') && html.includes('>ABCDPRO<'), '소문자 링크도 같은 코드 · en');
    r = await sg.GET(req('/app?from=cr_test&code=ABCDPRO', UA.android));   // 안드 쿠폰 꺼짐(기본) = 예전 Play 설치 302
    assert.equal(r.status, 302); assert.equal(r.headers.get('location'), PLAY_C);
    process.env.COUPON_ANDROID = '1';
    try {
      for (const ua of [UA.android, UA.kakaoAnd]) {
        r = await sg.GET(req('/app?from=cr_test&code=ABCDPRO', ua)); html = await r.text();
        assert.equal(r.status, 200, ua.slice(0, 40)); assert.equal(r.headers.get('vary'), 'User-Agent');
        assert.ok(html.includes('<button class="cta" id="claim" type="button">내 쿠폰 받기</button>') && html.includes("fetch('/api/coupon/claim'") && html.includes(PLAY_C.replace(/&/g, '&amp;')));
        assert.ok(html.includes('구독자 전용 · 선착순 200명 · 10/30까지') && !html.includes('<p class="t-code" id="code">ABCDPRO</p>'), '안드 화면은 애플 코드를 «쿠폰 번호»로 보여 주지 않는다(배정 API 에 ac 로만 넘긴다 — 예전과 같음)');
      }
      r = await sg.GET(req('/app?from=cr_test&code=ABCDPRO', UA.mac)); html = await r.text();   // PC = 쿠폰 결 QR 화면(안드 안내도 쿠폰)
      assert.equal(r.status, 200);
      assert.ok(html.includes('<h1>🎟 SIGNUM HQ PRO 1개월 무료 쿠폰</h1>') && html.includes('구독자 전용 · 선착순 500명 · 10/30까지') && html.includes('나만의 30일 무료 쿠폰 번호'));
      assert.ok(html.includes('data-scan="https://www.signumhq.com/app?from=cr_test&amp;code=ABCDPRO&amp;via=qr"') && html.includes('>ABCDPRO<'));
    } finally { delete process.env.COUPON_ANDROID; }
    r = await sg.GET(req('/app?from=cr_test&code=ABCDPRO', 'Mozilla/5.0 (compatible; Twitterbot/1.0)', {})); html = await r.text();   // 링크 카드
    assert.equal(r.status, 200); assert.ok(html.includes('1 month free') && html.includes('/promo/redeem-card-en.png'), '카드 = PRO 1개월 무료');
    for (const bad of ['ABCD1PRO', 'ABCPRO', 'ABCDPROX']) {   // 형식 밖 = 남의 코드 = 예전 302(아이폰 애플 적용 · 안드 Play 설치)
      r = await sg.GET(req(`/app?from=cr_test&code=${bad}`, UA.iphone)); assert.equal(r.status, 302, bad); assert.equal(r.headers.get('location'), `https://apps.apple.com/redeem?ctx=offercodes&id=6783130444&code=${bad}`);
      process.env.COUPON_ANDROID = '1';
      try { r = await sg.GET(req(`/app?from=cr_test&code=${bad}`, UA.android)); assert.equal(r.status, 302, bad); assert.equal(r.headers.get('location'), PLAY_C); } finally { delete process.env.COUPON_ANDROID; }
      r = await sg.GET(req(`/app?from=cr_test&code=${bad}`, 'Mozilla/5.0 (compatible; Twitterbot/1.0)', {})); assert.ok(!(await r.text()).includes('redeem-card'), bad + ' 카드는 예전 그대로');
    }
  });
  await t('G0 안드로이드(안드 쿠폰 꺼짐 = 기본): 크롬 → Play «설치» 302(utm_content=code) · 카톡 인앱 → 같은 주소의 앱 안 화면 · play.google.com/redeem 으로 안 감', async () => {
    const r = await sg.GET(req('/app?from=threads&code=THREADSPRO', UA.android));
    assert.equal(r.status, 302); assert.equal(r.headers.get('location'), PLAY_CODE);
    assert.ok(!r.headers.get('location')!.includes('/redeem'));
    const k = await sg.GET(req('/app?from=threads&code=THREADSPRO', UA.kakaoAnd));   // ★2026-10-05 앱 안 → intent 단추 화면(코드 문구 없음)
    assert.equal(k.status, 200); const kh = await k.text();
    assert.ok(kh.includes(`id="web" href="${PLAY_CODE.replace(/&/g, '&amp;')}"`) && kh.includes('intent://details?id=com.signumhq.app&amp;referrer=utm_source%3Dthreads%26utm_medium%3Dsmartlink%26utm_campaign%3Dsignumhq_web%26utm_content%3Dcode#Intent;'));
    assert.ok(!kh.includes('/redeem') && !kh.includes('THREADSPRO'), '코드·리딤 문구 없음');
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
  // ── ★2026-10-05 안드로이드 «앱 안 브라우저» → intent 단추 화면(lib/marketing/androidInApp.ts) — 크롬·삼성·아이폰·PC·봇·우리 앱은 예전 그대로 ──
  const AWV = 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36';
  const IA = {
    threads: `${AWV} Barcelona 352.0.0.38.100 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918N; dm3q; qcom; ko_KR; 652573150)`,
    instagram: `${AWV} Instagram 352.0.0.38.100 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918N; dm3q; qcom; ko_KR; 652573150)`,
    facebook: `${AWV} [FB_IAB/FB4A;FBAV/485.0.0.70.77;IABMV/1;]`,
    naver: `${AWV} NAVER(inapp; search; 2000; 12.10.3; SM-S918N)`,
    line: `${AWV} Line/14.16.0/IAB`,
    kakao: UA.kakaoAnd,
  };
  const PLAY_THREADS = 'https://play.google.com/store/apps/details?id=com.signumhq.app&referrer=utm_source%3Dthreads%26utm_medium%3Dsmartlink%26utm_campaign%3Dsignumhq_web';
  await t('앱 안 안드로이드(스레드·인스타·페북·네이버·라인·카톡): 200 · no-store·Vary UA · 주 단추 intent(같은 referrer) · 보조 https · 집계 = 크롬과 같은 3칸 + clk:inapp 1칸', async () => {
    for (const [k, ua] of Object.entries(IA)) {
      afterCalls.length = 0;
      const r = await sg.GET(req('/app?from=threads', ua));
      assert.equal(r.status, 200, k); assert.equal(r.headers.get('location'), null, k);
      assert.equal(r.headers.get('cache-control'), 'private, no-store, max-age=0'); assert.equal(r.headers.get('vary'), 'User-Agent');
      const h = await r.text();
      assert.ok(h.includes('<a class="cta" id="open" href="intent://details?id=com.signumhq.app&amp;referrer=utm_source%3Dthreads%26utm_medium%3Dsmartlink%26utm_campaign%3Dsignumhq_web#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.signumhq.app%26referrer%3Dutm_source%253Dthreads%2526utm_medium%253Dsmartlink%2526utm_campaign%253Dsignumhq_web;end">Play 스토어에서 열기</a>'), k);
      assert.ok(h.includes(`<a class="alt" id="web" href="${PLAY_THREADS.replace(/&/g, '&amp;')}">안 열리면 여기</a>`), k);
      assert.equal(afterCalls.length, 4, `${k}: ref · clk:sg · hit · clk:inapp`);
    }
    afterCalls.length = 0; await sg.GET(req('/app?from=threads', UA.android));
    assert.equal(afterCalls.length, 3, '크롬 안드: ref · clk:sg · hit(예전 그대로)');
    // 언어: Accept-Language(ja) · ?l=en
    let h = await (await sg.GET(req('/app?from=threads', IA.threads, { ...NAV, 'accept-language': 'ja-JP,ja;q=0.9' }))).text();
    assert.ok(h.includes('>Playストアで開く</a>'));
    h = await (await sg.GET(req('/app?from=home&l=en', IA.instagram))).text();
    assert.ok(h.includes('>Open in Play Store</a>') && h.includes('utm_source%3Dhome%26utm_medium%3Dsmartlink%26utm_campaign%3Dsignumhq_web&amp;listing=home#Intent;'), 'home 은 listing=home 도 intent 에 그대로');
  });
  await t('예전 그대로: 안드 크롬·삼성 인터넷 302 Play · 아이폰(인스타·카톡 인앱 포함) 302 App Store · PC 200 넘겨주기 · 봇(헤드리스 wv) 302 · 미리보기 봇 카드', async () => {
    const samsung = 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36';
    for (const ua of [UA.android, samsung]) {
      const r = await sg.GET(req('/app?from=threads', ua));
      assert.equal(r.status, 302); assert.equal(r.headers.get('location'), PLAY_THREADS);
    }
    for (const ua of [UA.iphone, UA.instaIos, UA.kakaoIos]) {
      const r = await sg.GET(req('/app?from=threads', ua));
      assert.equal(r.status, 302); assert.ok(r.headers.get('location')!.startsWith('https://apps.apple.com/app/signum-hq-stock-market-intel/id6783130444?'));
    }
    let r = await sg.GET(req('/app?from=threads', UA.mac));
    assert.equal(r.status, 200); assert.ok(!(await r.text()).includes('intent://'));
    r = await sg.GET(req('/app?from=threads', 'Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 HeadlessChrome/129.0.0.0 Mobile Safari/537.36'));
    assert.equal(r.status, 302, '수집기(헤드리스) 표지가 있으면 wv 라도 예전 302');
    r = await sg.GET(req('/app?from=threads', 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.100 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', {}));
    assert.equal(r.status, 200); const card = await r.text(); assert.ok(card.includes('og:title') && !card.includes('intent://'), '미리보기 봇은 예전 카드');
  });
  await t('우리 앱(sig_native=1 쿠키 · X-Requested-With com.signumhq.*): 앱 안 화면이 아니라 예전 302 · 남의 앱 X-Requested-With 는 앱 안', async () => {
    let r = await sg.GET(req('/app?from=threads', AWV, { ...NAV, cookie: 'sig_native=1' }));
    assert.equal(r.status, 302); assert.equal(r.headers.get('location'), PLAY_THREADS);
    r = await sg.GET(req('/app?from=threads', AWV, { ...NAV, 'x-requested-with': 'com.signumhq.app' }));
    assert.equal(r.status, 302);
    r = await sg.GET(req('/app?from=threads', AWV, { ...NAV, 'x-requested-with': 'com.kakao.talk' }));
    assert.equal(r.status, 200);
  });
  await t('쿠폰 켜짐(COUPON_ANDROID=1) + 앱 안: 쿠폰 화면 앱 안 변형(설치 intent·https 보조·안내) · 크롬 쿠폰 화면엔 intent 없음 · 집계 clk:coupon + clk:inapp', async () => {
    process.env.COUPON_ANDROID = '1';
    try {
      afterCalls.length = 0;
      const r = await sg.GET(req('/app?from=threads&code=THREADSPRO', IA.threads));
      assert.equal(r.status, 200); const h = await r.text();
      assert.ok(h.includes('id="claim"') && h.includes('id="playw"') && h.includes(`id="instw" href="${PLAY_CODE.replace(/&/g, '&amp;')}"`) && h.includes('<a id="inst" href="intent://details?id=com.signumhq.app&amp;referrer='));
      assert.ok(h.includes('다른 브라우저로 열기'));
      assert.equal(afterCalls.length, 7, 'ref · clk:sg · hit · code 합계 · clk:code · clk:coupon · clk:inapp');
      const c = await (await sg.GET(req('/app?from=threads&code=THREADSPRO', UA.android))).text();
      assert.ok(!c.includes('intent://') && !c.includes('id="playw"'), '크롬 쿠폰 화면은 예전 그대로');
    } finally { delete process.env.COUPON_ANDROID; }
  });
  console.log(`\n✅ smartLink: ${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
