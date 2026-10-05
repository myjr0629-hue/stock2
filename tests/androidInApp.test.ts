/**
 * 안드로이드 «앱 안 브라우저» → Play 스토어 앱 열기(2026-10-05) — 판정(실제 UA 예) · intent 주소 인코딩(Intent.parseUri 규칙) ·
 *   앱 안 화면 HTML · 쿠폰 화면 앱 안 변형 · 단추 비콘 API
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/androidInApp.test.ts
 *
 * 번호는 전부 «가짜»(ZZTEST…)다 — 진짜 Play·애플 일회용 번호는 저장소 어디에도 쓰지 않는다.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';

// ── next/server 의 after 를 가로챈다(라우트 import 보다 먼저) — 응답 뒤 집계는 «무엇을 하려는지»만 본다 ──
const afterCalls: Array<() => unknown> = [];
const nsPath = require.resolve('next/server');
const realNs = require(nsPath);
require.cache[nsPath] = { id: nsPath, filename: nsPath, loaded: true, exports: { ...realNs, after: (fn: () => unknown) => { afterCalls.push(fn); } } } as unknown as Module;

import { NextRequest } from 'next/server';
import {
  isAndroidInAppBrowser, inAppFamily, inAppViewFields, playIntentUrl, playRedeemIntentUrl, androidInAppHtml, isInAppTap, IN_APP_TEXT,
} from '../src/lib/marketing/androidInApp';
import { couponHtml } from '../src/lib/marketing/couponHtml';
import { playUrlWithReferrer } from '../src/lib/marketing/storeRedirect';
import { isCouponTap } from '../src/lib/marketing/coupon';
const eventRoute = require('../src/app/api/inapp/event/route');

// ── 실제 UA 예(2024~2026 기기·앱 버전 모양) ──
const AW = 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36';
const IW = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const UA = {
  threads: `${AW} Barcelona 352.0.0.38.100 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918N; dm3q; qcom; ko_KR; 652573150)`,
  instagram: `${AW} Instagram 352.0.0.38.100 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918N; dm3q; qcom; ko_KR; 652573150)`,
  facebook: `${AW} [FB_IAB/FB4A;FBAV/485.0.0.70.77;IABMV/1;]`,
  kakao: 'Mozilla/5.0 (Linux; Android 13; SM-S911N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36;KAKAOTALK 2410430',
  kakaoNew: `${AW} KAKAOTALK/25.8.1`,
  naver: `${AW} NAVER(inapp; search; 2000; 12.10.3; SM-S918N)`,
  line: `${AW} Line/14.16.0/IAB`,
  daum: `${AW} DaumApps/8.10.0 DaumDevice/mobile`,
  bareWebView: AW,
  // WebView 표지(`; wv`)를 지운 앱 — 앱 표지로 잡는다
  instaNoWv: 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.100 Mobile Safari/537.36 Instagram 352.0.0.38.100 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918N; dm3q; qcom; ko_KR; 652573150)',
  chrome: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  edge: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 EdgA/129.0.0.0',
  whale: 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.146 Whale/3.27.1.31 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  instaIos: `${IW} Instagram 352.0.0.25.86 (iPhone15,2; iOS 18_0; ko_KR; ko; scale=3.00; 1179x2556; 652000000)`,
  kakaoIos: `${IW} KAKAOTALK 10.8.5`,
  threadsIos: `${IW} Barcelona 352.0.0.25.86 (iPhone15,2; iOS 18_0; ko_KR)`,
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  googlebotPhone: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.100 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
};

/**
 * android.content.Intent.parseUri(uri, Intent.URI_INTENT_SCHEME) 의 필요한 부분만 옮긴 것(AOSP frameworks/base Intent.java):
 *   마지막 '#' 이 «#Intent;» 여야 하고, 그 앞이 data, 뒤가 name=value; 목록(…;end). 값은 Uri.decode 한 번(= decodeURIComponent).
 *   data 가 "intent:" 로 시작하면 그것을 떼고 scheme 값을 붙인다 → market://… / https://…
 */
function parseIntentUri(uri: string): { data: string; pkg: string | null; extras: Record<string, string> } {
  assert.ok(uri.startsWith('intent:'), 'intent: 로 시작');
  let i = uri.lastIndexOf('#');
  assert.ok(i >= 0 && uri.startsWith('#Intent;', i), '마지막 # 이 #Intent; 여야 한다(값 안에 # 이 남으면 안 된다)');
  let data = uri.substring(0, i);
  i += 8;
  let scheme: string | null = null; let pkg: string | null = null; const extras: Record<string, string> = {};
  while (i >= 0 && !uri.startsWith('end', i)) {
    let eq = uri.indexOf('=', i); if (eq < 0) eq = i - 1;
    const semi = uri.indexOf(';', i);
    assert.ok(semi > i, '항목은 ; 로 끝난다');
    const value = eq < semi ? decodeURIComponent(uri.substring(eq + 1, semi)) : '';
    if (uri.startsWith('scheme=', i)) scheme = value;
    else if (uri.startsWith('package=', i)) pkg = value;
    else if (uri.startsWith('S.', i)) extras[decodeURIComponent(uri.substring(i + 2, eq))] = value;
    else assert.fail(`모르는 항목 ${uri.substring(i, semi)}`);
    i = semi + 1;
  }
  assert.ok(uri.endsWith(';end'), '…;end 로 끝난다');
  if (data.startsWith('intent:')) { data = data.substring(7); if (scheme != null) data = `${scheme}:${data}`; }
  return { data, pkg, extras };
}
/** Play 가 data 의 쿼리를 읽는 방식(Uri.getQueryParameter — 한 번 디코드) */
const q = (url: string, name: string) => new URL(url.replace(/^market:\/\//, 'https://market.invalid/')).searchParams.get(name);
const textOf = (html: string) => html.replace(/<wbr>/g, '').replace(/<[^>]+>/g, '');
const FAKE = 'ZZTEST00000000000000042';   // 23자 가짜 Play 번호
const BASE = 'https://play.google.com/store/apps/details?id=com.signumhq.app';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };

(async () => {
  console.log('━━━ 1. 판정 ━━━');
  await t('앱 안(스레드·인스타·페북·카톡 2종·네이버·라인·다음·표지 없는 WebView·wv 지운 인스타) → true', () => {
    for (const k of ['threads', 'instagram', 'facebook', 'kakao', 'kakaoNew', 'naver', 'line', 'daum', 'bareWebView', 'instaNoWv'] as const) {
      assert.equal(isAndroidInAppBrowser({ userAgent: UA[k] }), true, k);
    }
  });
  await t('예전 그대로(크롬·삼성 인터넷·파이어폭스·엣지·웨일·아이폰 Safari/인앱·PC·구글봇 폰) → false', () => {
    for (const k of ['chrome', 'samsung', 'firefox', 'edge', 'whale', 'iphone', 'instaIos', 'kakaoIos', 'threadsIos', 'mac', 'googlebotPhone'] as const) {
      assert.equal(isAndroidInAppBrowser({ userAgent: UA[k] }), false, k);
    }
  });
  await t('우리 앱(쿠키 sig_native=1 · X-Requested-With com.signumhq.* · UA 토큰) → false(예전처럼 302)', () => {
    assert.equal(isAndroidInAppBrowser({ userAgent: AW, nativeCookie: '1' }), false);
    assert.equal(isAndroidInAppBrowser({ userAgent: AW, requestedWith: 'com.signumhq.app' }), false);
    assert.equal(isAndroidInAppBrowser({ userAgent: AW, requestedWith: 'com.signumhq.undercurrent' }), false);
    assert.equal(isAndroidInAppBrowser({ userAgent: AW, requestedWith: 'com.signumhq.wim' }), false);
    assert.equal(isAndroidInAppBrowser({ userAgent: `${AW} com.signumhq.app/1.10.0` }), false);
    assert.equal(isAndroidInAppBrowser({ userAgent: AW, nativeCookie: '0' }), true, '쿠키 값이 1 이 아니면 우리 앱 아님');
  });
  await t('X-Requested-With: 패키지 이름이면 앱 안(표지 없는 UA라도) · 크롬·삼성 패키지·XMLHttpRequest·빈 값은 무시', () => {
    assert.equal(isAndroidInAppBrowser({ userAgent: UA.chrome, requestedWith: 'com.kakao.talk' }), true);
    assert.equal(isAndroidInAppBrowser({ userAgent: UA.chrome, requestedWith: 'com.android.chrome' }), false);
    assert.equal(isAndroidInAppBrowser({ userAgent: UA.samsung, requestedWith: 'com.sec.android.app.sbrowser' }), false);
    assert.equal(isAndroidInAppBrowser({ userAgent: UA.chrome, requestedWith: 'XMLHttpRequest' }), false);
    assert.equal(isAndroidInAppBrowser({ userAgent: UA.chrome, requestedWith: '' }), false);
    assert.equal(isAndroidInAppBrowser({ userAgent: UA.iphone, requestedWith: 'com.kakao.talk' }), false, '안드로이드가 아니면 false');
  });
  await t('앱 이름(측정 필드, 닫힌 목록): 스레드는 인스타보다 먼저 · 패키지로도 · 모르면 other', () => {
    assert.equal(inAppFamily(UA.threads), 'threads');
    assert.equal(inAppFamily(AW, 'com.instagram.barcelona'), 'threads');
    assert.equal(inAppFamily(UA.instagram), 'instagram');
    assert.equal(inAppFamily(UA.facebook), 'facebook');
    assert.equal(inAppFamily(UA.kakao), 'kakao'); assert.equal(inAppFamily(UA.kakaoNew), 'kakao');
    assert.equal(inAppFamily(UA.naver), 'naver'); assert.equal(inAppFamily(UA.line), 'line'); assert.equal(inAppFamily(UA.daum), 'daum');
    assert.equal(inAppFamily(AW, 'com.nhn.android.band'), 'band');
    assert.equal(inAppFamily(AW, 'jp.naver.line.android'), 'line');
    assert.equal(inAppFamily(AW), 'other'); assert.equal(inAppFamily(AW, null), 'other');
  });
  await t('노출 필드: view:<사람 판정> + app:<앱> (+ code / coupon)', () => {
    assert.deepEqual(inAppViewFields('android|human', 'threads', 'link'), ['android|view:human', 'android|app:threads']);
    assert.deepEqual(inAppViewFields('android|nometa', 'kakao', 'code'), ['android|view:nometa', 'android|app:kakao', 'android|code']);
    assert.deepEqual(inAppViewFields(undefined, 'other', 'coupon'), ['android|view:human', 'android|app:other', 'android|coupon']);
    for (const e of ['market', 'web']) assert.ok(isInAppTap(e));
    for (const e of ['play', 'install', '', null, 'market2']) assert.ok(!isInAppTap(e));
    for (const e of ['play_web', 'install_web']) assert.ok(isCouponTap(e), `쿠폰 단추 목록에 ${e}`);
  });

  console.log('━━━ 2. intent 주소(Intent.parseUri 규칙) ━━━');
  await t('설치: data = market://details?<https 와 같은 쿼리> · package = Play 스토어 · referrer 한 번 인코딩', () => {
    const https = playUrlWithReferrer(BASE, 'threads');
    const intent = playIntentUrl(https);
    assert.equal(intent, 'intent://details?id=com.signumhq.app&referrer=utm_source%3Dthreads%26utm_medium%3Dsmartlink%26utm_campaign%3Dsignumhq_web'
      + '#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url='
      + 'https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.signumhq.app%26referrer%3Dutm_source%253Dthreads%2526utm_medium%253Dsmartlink%2526utm_campaign%253Dsignumhq_web;end');
    const p = parseIntentUri(intent);
    assert.equal(p.pkg, 'com.android.vending');
    assert.equal(p.data, 'market://details?id=com.signumhq.app&referrer=utm_source%3Dthreads%26utm_medium%3Dsmartlink%26utm_campaign%3Dsignumhq_web');
    assert.equal(q(p.data, 'id'), 'com.signumhq.app');
    assert.equal(q(p.data, 'referrer'), 'utm_source=threads&utm_medium=smartlink&utm_campaign=signumhq_web', 'Play 가 읽는 referrer = https 와 같다');
  });
  await t('설치 fallback: https 주소 «전체»를 이중 인코딩(%253D·%2526) → 디코드 한 번 뒤 원래 https 주소 · 그 안 referrer 도 그대로', () => {
    const https = playUrlWithReferrer(BASE, 'threads');
    const intent = playIntentUrl(https);
    const fb = intent.slice(intent.indexOf('S.browser_fallback_url=') + 23, intent.length - 4);
    assert.ok(fb.includes('%253D') && fb.includes('%2526'), 'referrer 안 = & 는 이중 인코딩');
    assert.ok(!/[;#&=?/:]/.test(fb), 'fallback 값에 날 ; # & = ? / : 가 없다(intent 문법을 깨지 않는다)');
    const p = parseIntentUri(intent);
    assert.equal(p.extras.browser_fallback_url, https);
    assert.equal(new URL(p.extras.browser_fallback_url).searchParams.get('referrer'), 'utm_source=threads&utm_medium=smartlink&utm_campaign=signumhq_web');
  });
  await t('설치 변형: home(listing=home 유지) · 코드 링크(utm_content=code) · 태그 없음(리퍼러 없음) · 우리 Play 주소가 아니면 원본 그대로', () => {
    for (const https of [playUrlWithReferrer(BASE, 'home'), playUrlWithReferrer(BASE, 'threads', 'signum', 'smartlink', 'code'), playUrlWithReferrer(BASE, null)]) {
      const p = parseIntentUri(playIntentUrl(https));
      assert.equal(p.data, https.replace('https://play.google.com/store/apps/details?', 'market://details?'), https);
      assert.equal(p.extras.browser_fallback_url, https);
      assert.equal(p.pkg, 'com.android.vending');
    }
    assert.ok(playIntentUrl(playUrlWithReferrer(BASE, 'home')).startsWith('intent://details?id=com.signumhq.app&referrer=utm_source%3Dhome%26utm_medium%3Dsmartlink%26utm_campaign%3Dsignumhq_web&listing=home#Intent;'));
    assert.equal(q(parseIntentUri(playIntentUrl(playUrlWithReferrer(BASE, 'threads', 'signum', 'smartlink', 'code'))).data, 'referrer'),
      'utm_source=threads&utm_medium=smartlink&utm_campaign=signumhq_web&utm_content=code');
    assert.equal(playIntentUrl('https://apps.apple.com/app/x/id1'), 'https://apps.apple.com/app/x/id1');
    assert.equal(playIntentUrl(`${BASE}#frag`), `${BASE}#frag`);
  });
  await t('리딤: intent://play.google.com/redeem?code=…#Intent;scheme=https;package=Play 스토어;fallback=같은 https 주소', () => {
    const intent = playRedeemIntentUrl(FAKE);
    assert.equal(intent, `intent://play.google.com/redeem?code=${FAKE}#Intent;scheme=https;package=com.android.vending;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fredeem%3Fcode%3D${FAKE};end`);
    const p = parseIntentUri(intent);
    assert.equal(p.data, `https://play.google.com/redeem?code=${FAKE}`);
    assert.equal(p.pkg, 'com.android.vending');
    assert.equal(p.extras.browser_fallback_url, `https://play.google.com/redeem?code=${FAKE}`);
  });

  console.log('━━━ 3. 앱 안 화면 HTML ━━━');
  const PLAY = playUrlWithReferrer(BASE, 'threads');
  await t('ko: 주 단추 = intent(Play 스토어 앱) · 보조 = 지금의 https · 안내 «⋮ → 다른 브라우저로 열기» · 자동 이동 없음 · 가볍게', () => {
    const h = androidInAppHtml({ lang: 'ko', fromTag: 'threads', playUrl: PLAY });
    assert.ok(h.startsWith('<!doctype html><html lang="ko">'));
    assert.ok(h.includes(`<a class="cta" id="open" href="${playIntentUrl(PLAY).replace(/&/g, '&amp;')}">Play 스토어에서 열기</a>`));
    assert.ok(h.includes(`<a class="alt" id="web" href="${PLAY.replace(/&/g, '&amp;')}">안 열리면 여기</a>`));
    assert.ok(textOf(h).includes('안 열리면 오른쪽 위 ⋮ → 다른 브라우저로 열기'));
    assert.ok(h.includes('<h1>SIGNUM HQ 앱 설치</h1>'));
    assert.ok(!/http-equiv="refresh"|location\.(href|replace|assign)|window\.open/.test(h), '자동 이동(JS·meta refresh) 없음 — 누른 이동만');
    assert.ok(h.includes("sgBeacon('market')") && h.includes("sgBeacon('web')") && h.includes('/api/inapp/event?ev='));
    assert.ok(!/<script[^>]+src=|<link[^>]+stylesheet/.test(h), '외부 스크립트·스타일 없음');
    assert.equal((h.slice(h.indexOf('<script>')).match(/<\/script>/g) || []).length, 1);
    assert.ok(h.length < 8_000, `가볍게(${h.length}B)`);
    assert.ok(!/쿠폰|coupon|아이폰 전용/i.test(textOf(h)), '쿠폰·기기 전용 약속 문구 없음');
  });
  await t('ja·en: 문구가 언어별 · 같은 단추 구조', () => {
    const ja = androidInAppHtml({ lang: 'ja', fromTag: 'note', playUrl: PLAY });
    assert.ok(ja.includes('>Playストアで開く</a>') && ja.includes('>開かない場合はこちら</a>') && textOf(ja).includes('開かない場合は右上の ⋮ → 他のブラウザで開く'));
    const en = androidInAppHtml({ lang: 'en', fromTag: null, playUrl: PLAY });
    assert.ok(en.includes('>Open in Play Store</a>') && en.includes('>Not opening? Tap here</a>') && textOf(en).includes('Still not opening? Top right ⋮ → Open in browser'));
    assert.ok(en.includes('var C={"f":""}'), '태그 없으면 비콘은 f 없이(서버가 안 센다)');
    for (const l of ['ko', 'ja', 'en'] as const) assert.ok(IN_APP_TEXT[l].cta && IN_APP_TEXT[l].alt, l);
  });

  console.log('━━━ 4. 쿠폰 화면(안드) 앱 안 변형 ━━━');
  const REDEEM = 'https://apps.apple.com/redeem?ctx=offercodes&id=6783130444&code=THREADSPRO';
  const PLAYI = playUrlWithReferrer(BASE, 'threads', 'signum', 'smartlink', 'code');
  await t('앱 안: 적용 단추 = 리딤 intent(스크립트가 번호로 채움 — 서버 함수와 같은 글자) + https 보조 · 쿠폰 없이 설치 = 설치 intent + https 보조 · 안내 한 줄', () => {
    const h = couponHtml({ platform: 'android', lang: 'ko', fromTag: 'threads', code: 'THREADSPRO', appleRedeemUrl: REDEEM, playInstallUrl: PLAYI, androidInApp: true });
    const C = JSON.parse(h.slice(h.indexOf('var C=') + 6, h.indexOf(';function sgBeacon')));
    assert.equal(C.ri.split(C.ph).join(FAKE), playRedeemIntentUrl(FAKE), '스크립트가 만드는 적용 주소 = playRedeemIntentUrl(번호)');
    assert.ok(/^[A-Z0-9]+$/.test(C.ph) && C.ph.length < 23, '자리표시는 대문자·숫자(인코딩해도 그대로) · 23자 번호 형식 아님');
    assert.ok(h.includes("$('play').href=C.ri?C.ri.split(C.ph).join(c):w;if($('playw'))$('playw').href=w;"));
    assert.ok(h.includes('<a class="cta2" id="playw" href="https://play.google.com/redeem">안 열리면 여기</a>'));
    assert.ok(h.includes(`<a id="inst" href="${playIntentUrl(PLAYI).replace(/&/g, '&amp;')}">쿠폰 없이 앱만 설치하기</a> · <a id="instw" href="${PLAYI.replace(/&/g, '&amp;')}">안 열리면 여기</a>`));
    assert.ok(textOf(h).includes('안 열리면 오른쪽 위 ⋮ → 다른 브라우저로 열기'));
    assert.ok(h.includes("sgBeacon('play_web')") && h.includes("sgBeacon('install_web')"));
    assert.ok(!/[A-Z0-9]{23}/.test(h), '번호(23자)는 서버 HTML 에 실리지 않는다 — 누른 뒤 API 로만');
  });
  await t('크롬(앱 안 아님): 예전 화면 그대로 — intent·보조 단추·안내 없음', () => {
    const h = couponHtml({ platform: 'android', lang: 'ko', fromTag: 'threads', code: 'THREADSPRO', appleRedeemUrl: REDEEM, playInstallUrl: PLAYI });
    assert.ok(!h.includes('intent://') && !h.includes('id="playw"') && !h.includes('id="instw"') && !h.includes('다른 브라우저로 열기'));
    assert.ok(h.includes(`<a id="inst" href="${PLAYI.replace(/&/g, '&amp;')}">쿠폰 없이 앱만 설치하기</a></p>`));
    const C = JSON.parse(h.slice(h.indexOf('var C=') + 6, h.indexOf(';function sgBeacon')));
    assert.equal(C.ri, undefined, '크롬은 https 적용 주소(예전과 같은 값)');
    const ios = couponHtml({ platform: 'ios', lang: 'ko', fromTag: 'threads', code: 'THREADSPRO', appleRedeemUrl: REDEEM, playInstallUrl: PLAYI, androidInApp: true });
    assert.ok(!ios.includes('intent://') && !ios.includes('play.google.com'), '아이폰 화면은 플래그와 무관');
  });

  console.log('━━━ 5. 단추 비콘 API(/api/inapp/event) ━━━');
  await t('닫힌 목록 단추 + 태그 + 사람 → 집계 1건 · 모르는 단추·태그 없음·봇·남의 오리진 → 0건 · 항상 204', async () => {
    const ev = (qs: string, ua: string, extra: Record<string, string> = {}) => eventRoute.POST(new NextRequest(`https://www.signumhq.com/api/inapp/event?${qs}`, { method: 'POST', headers: { 'user-agent': ua, 'accept-language': 'ko', ...extra } }));
    afterCalls.length = 0;
    let r = await ev('ev=market&f=threads', UA.threads); assert.equal(r.status, 204); assert.equal(afterCalls.length, 1);
    r = await ev('ev=web&f=threads', UA.kakao); assert.equal(afterCalls.length, 2);
    r = await ev('ev=play&f=threads', UA.threads); assert.equal(r.status, 204); assert.equal(afterCalls.length, 2, '모르는 단추');
    r = await ev('ev=market', UA.threads); assert.equal(afterCalls.length, 2, '태그 없음');
    r = await ev('ev=market&f=threads', 'Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Mobile Safari/537.36'); assert.equal(afterCalls.length, 2, '봇');
    r = await ev('ev=market&f=threads', UA.threads, { origin: 'https://evil.example' }); assert.equal(afterCalls.length, 2, '남의 오리진');
    r = await ev('ev=market&f=threads', UA.threads, { 'accept-language': '' }); assert.equal(afterCalls.length, 2, '언어 없음');
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });

  console.log(`\n✅ androidInApp: ${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
