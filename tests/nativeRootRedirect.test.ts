/**
 * 미들웨어 «우리 앱 → /app-view» 판정 — 사람 인앱 브라우저는 홈, 우리 3앱은 지금처럼 앱 화면 (2026-10-04)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/nativeRootRedirect.test.ts
 */
import assert from 'node:assert/strict';
import { isOurNativeAppRequest, nativeRootRedirectPath } from '../src/lib/native/nativeRootRedirect';

// 안드로이드 시스템 WebView 기본 UA(우리 셸도 appendUserAgent 가 없어 이 모양 그대로다) · iOS WKWebView 기본 UA
const AW = 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36';
const IW = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

type Case = { label: string; ua: string; xrw?: string; cookie?: string };
const HUMANS: Case[] = [
  { label: '카카오톡 안드', ua: `${AW};KAKAOTALK 2410870`, xrw: 'com.kakao.talk' },
  { label: '인스타그램 안드', ua: `${AW} Instagram 352.0.0.38.100 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918N; dm3q; qcom; ko_KR; 652573150)`, xrw: 'com.instagram.android' },
  { label: '네이버 안드', ua: `${AW} NAVER(inapp; search; 2000; 12.10.3; SM-S918N)`, xrw: 'com.nhn.android.search' },
  { label: '라인 안드', ua: `${AW} Line/14.16.0/IAB`, xrw: 'jp.naver.line.android' },
  { label: '페이스북 안드', ua: `${AW} [FB_IAB/FB4A;FBAV/485.0.0.70.77;IABMV/1;]`, xrw: 'com.facebook.katana' },
  { label: '스레드 안드', ua: `${AW} Barcelona 352.0.0.38.100 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918N)`, xrw: 'com.instagram.barcelona' },
  { label: '표식 없는 안드 웹뷰(헤더도 없음)', ua: AW },
  { label: '카카오톡 iOS', ua: `${IW} KAKAOTALK 10.8.5` },
  { label: '인스타그램 iOS', ua: `${IW} Instagram 352.0.0.25.86 (iPhone15,2; iOS 18_0; ko_KR; ko; scale=3.00; 1179x2556; 652000000)` },
  { label: '네이버 iOS', ua: `${IW} NAVER(inapp; search; 2000; 12.10.3; 15PRO)` },
  { label: '라인 iOS', ua: `${IW} Safari Line/14.16.0` },
  { label: '페이스북 iOS', ua: `${IW} [FBAN/FBIOS;FBAV/485.0.0.43.107;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.0;FBLC/ko_KR]` },
  { label: '스레드 iOS', ua: `${IW} Barcelona 352.0.0.25.86 (iPhone15,2; iOS 18_0; ko_KR)` },
  { label: '안드 크롬', ua: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36' },
  { label: '삼성 인터넷', ua: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36' },
  { label: 'iOS 사파리', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
  { label: 'PC 크롬', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36' },
  { label: '구글봇(스마트폰)', ua: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.100 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
  { label: '카카오 미리보기 봇', ua: 'facebookexternalhit/1.1; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/docs/latest/kakaotalk-link' },
  { label: '네이버 봇(Yeti)', ua: 'Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)' },
  { label: '쿠키 값이 1 이 아님', ua: AW, cookie: '0' },
];
const OUR_APPS: Case[] = [
  { label: 'SIGNUM 안드(쿠키)', ua: AW, cookie: '1' },
  { label: 'SIGNUM 안드(X-Requested-With)', ua: AW, xrw: 'com.signumhq.app' },
  { label: 'SIGNUM 안드(쿠키+헤더)', ua: AW, xrw: 'com.signumhq.app', cookie: '1' },
  { label: 'SIGNUM iOS(쿠키)', ua: IW, cookie: '1' },
  { label: 'UC 안드(X-Requested-With)', ua: AW, xrw: 'com.signumhq.undercurrent' },
  { label: 'WIM 안드(X-Requested-With)', ua: AW, xrw: 'com.signumhq.wim' },
  { label: '앞으로 appendUserAgent 토큰', ua: `${AW} com.signumhq.app/1.10.0` },
];
const sig = (c: Case) => ({ userAgent: c.ua, requestedWith: c.xrw ?? null, nativeCookie: c.cookie ?? null });

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };

t('사람(인앱 6종 안드·iOS·일반 브라우저·봇): 우리 앱 아님 → /ko · / 이동 없음(홈)', () => {
  for (const c of HUMANS) {
    assert.equal(isOurNativeAppRequest(sig(c)), false, c.label);
    for (const p of ['/', '/ko', '/en', '/ja']) assert.equal(nativeRootRedirectPath(p, sig(c)), null, `${c.label} ${p}`);
  }
});

t('우리 앱(쿠키·패키지 헤더·UA 토큰): 지금처럼 /{locale}/app-view/dash, / 는 /en', () => {
  for (const c of OUR_APPS) {
    assert.equal(isOurNativeAppRequest(sig(c)), true, c.label);
    assert.equal(nativeRootRedirectPath('/ko', sig(c)), '/ko/app-view/dash', c.label);
    assert.equal(nativeRootRedirectPath('/ja', sig(c)), '/ja/app-view/dash', c.label);
    assert.equal(nativeRootRedirectPath('/en', sig(c)), '/en/app-view/dash', c.label);
    assert.equal(nativeRootRedirectPath('/', sig(c)), '/en/app-view/dash', c.label);
  }
});

t('루트·언어만 있는 주소가 아니면 우리 앱이어도 이동 없음(앱 화면·딥링크·다른 경로 불변)', () => {
  const app = sig(OUR_APPS[0]);
  for (const p of ['/ko/app-view/dash', '/en/app-view/intel', '/ko/flow', '/ko/', '/kor', '/de', '/en/undercurrent', '/en/wim', '/ko/ticker/NVDA']) {
    assert.equal(nativeRootRedirectPath(p, app), null, p);
  }
});

t('wv 만으로는 절대 우리 앱이 아니다(예전 판정의 회귀 방지)', () => {
  assert.equal(isOurNativeAppRequest({ userAgent: AW }), false);
  assert.equal(isOurNativeAppRequest({ userAgent: 'wv' }), false);
  assert.equal(isOurNativeAppRequest({ userAgent: `${AW};KAKAOTALK 2410870`, requestedWith: 'com.kakao.talk' }), false);
  assert.equal(isOurNativeAppRequest({}), false);
});

t('패키지 헤더는 우리 접두사만(대소문자·공백 무시, 비슷한 이름은 거절)', () => {
  assert.equal(isOurNativeAppRequest({ requestedWith: ' COM.SIGNUMHQ.APP ' }), true);
  assert.equal(isOurNativeAppRequest({ requestedWith: 'com.signumhqfake.app' }), false);
  assert.equal(isOurNativeAppRequest({ requestedWith: 'XMLHttpRequest' }), false);
  assert.equal(isOurNativeAppRequest({ requestedWith: 'com.kakao.talk' }), false);
});

console.log(`nativeRootRedirect: ${n}개 통과`);
