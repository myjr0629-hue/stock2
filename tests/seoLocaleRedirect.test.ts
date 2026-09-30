/**
 * 언어 없는 주소의 영구 리다이렉트 판정 — src/lib/seo/localeRedirect.ts
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/seoLocaleRedirect.test.ts
 */
import assert from 'node:assert/strict';
import { shouldMakeLocaleRedirectPermanent as f } from '../src/lib/seo/localeRedirect';

const base = { status: 307, location: '/en/flow/NIO', pathname: '/flow/NIO', acceptLanguage: null as string | null,
    hasLocaleCookie: false, locales: ['ko', 'en', 'ja'] as const, defaultLocale: 'en' };
let n = 0;
const t = (name: string, over: Partial<typeof base>, want: boolean) => {
    assert.equal(f({ ...base, ...over }), want, name); n++;
};

// 크롤러 모양(언어 선호 없음) → 308
t('구글봇: /flow/NIO → /en/flow/NIO', {}, true);
t('절대 주소 location 도', { location: 'https://www.signumhq.com/en/flow/NIO' }, true);
t('학습 페이지', { pathname: '/learn/put-call-ratio', location: '/en/learn/put-call-ratio' }, true);
t('빈 Accept-Language 는 없음과 같다', { acceptLanguage: '  ' }, true);
// 사람(언어 선호 있음) → 지금처럼 307
t('한국어 브라우저 → /ko 307 유지', { acceptLanguage: 'ko-KR,ko;q=0.9', location: '/ko/flow/NIO' }, false);
t('영어 브라우저도 307 유지(선호가 있는 사람)', { acceptLanguage: 'en-US,en;q=0.9' }, false);
t('언어 쿠키가 있으면 307', { hasLocaleCookie: true }, false);
// 대상이 아닌 것
t('홈(/)은 건드리지 않는다', { pathname: '/', location: '/en' }, false);
t('이미 언어가 붙은 경로', { pathname: '/en/flow/NIO', location: '/en/flow/NIO' }, false);
t('307 이 아니면(200)', { status: 200, location: null }, false);
t('다른 곳으로 가는 리다이렉트', { location: '/en/app-view/dash' }, false);
t('다른 언어로 가는 리다이렉트', { location: '/ko/flow/NIO' }, false);
t('location 없음', { location: null }, false);

console.log(`seoLocaleRedirect: ${n} 통과`);
