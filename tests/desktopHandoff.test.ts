/**
 * PC 넘겨주기(/app 데스크톱) — 방문자 언어·PC→폰 원격 설치(Play)·아이폰 «App Store 에서 검색» 안내 (2026-09-30, 10/4 단순화)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/desktopHandoff.test.ts
 */
import assert from 'node:assert/strict';
import { visitorLang } from '../src/lib/marketing/linkPreview';
import { desktopHandoffHtml, APP_SEARCH_NAME } from '../src/lib/marketing/desktopHandoff';
import { playUrlWithReferrer } from '../src/lib/marketing/storeRedirect';
let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };
(async () => {
  await t('visitorLang: ?l= 우선 · 한·일 태그 · 중립 태그는 브라우저 언어', () => {
    assert.equal(visitorLang('home', 'ja', 'ko-KR'), 'ja');
    assert.equal(visitorLang('naver_blog', null, 'en-US'), 'ko');
    assert.equal(visitorLang('note', null, 'en-US'), 'ja');
    assert.equal(visitorLang('home', null, 'ko-KR,ko;q=0.9,en;q=0.8'), 'ko');
    assert.equal(visitorLang('bluesky', null, 'ja-JP,ja;q=0.9'), 'ja');
    assert.equal(visitorLang('bluesky', null, 'en-US,en;q=0.9'), 'en');
    assert.equal(visitorLang('home', 'en', 'ko-KR'), 'en');   // 명시적 영어는 존중
    assert.equal(visitorLang(null, null, null), 'en');
  });
  await t('Play 리퍼러: 기본 smartlink 그대로 · PC 버튼은 utm_medium=pc_play', () => {
    const base = 'https://play.google.com/store/apps/details?id=com.signumhq.app';
    assert.ok(decodeURIComponent(playUrlWithReferrer(base, 'home')).includes('utm_medium=smartlink'));
    assert.ok(decodeURIComponent(playUrlWithReferrer(base, 'home', 'signum', 'pc_play')).includes('utm_medium=pc_play'));
  });
  await t('화면(10/4 단순화): Play 원격 설치 버튼 + 아이폰 «App Store 에서 SIGNUM HQ 검색» 안내만 · QR·보내기·App Store 링크 없음', async () => {
    for (const lang of ['ko', 'en', 'ja'] as const) {
      const play = 'https://play.google.com/store/apps/details?id=com.signumhq.app&referrer=x';
      const html = await desktopHandoffHtml({ fromTag: 'home', lang, playStoreUrl: play });
      assert.ok(html.includes(`href="${play.replace(/&/g, '&amp;')}"`), `${lang}: Play 버튼`);
      assert.ok(html.includes(APP_SEARCH_NAME) && /App Store/.test(html), `${lang}: 검색 안내`);
      assert.ok(!html.includes('<svg') && !html.includes('data-k=') && !html.includes('via=qr') && !html.includes('via=send'), `${lang}: QR·보내기 없음`);
      assert.ok(!html.includes('apps.apple.com'), `${lang}: App Store 링크 없음(검색 안내만)`);
      assert.equal((html.match(/<a /g) || []).length, 1, `${lang}: 링크는 Play 하나`);
    }
    const ko = await desktopHandoffHtml({ fromTag: 'home', lang: 'ko', playStoreUrl: 'https://play.google.com/x' });
    assert.ok(ko.includes('안드로이드 폰이라면') && ko.includes('Google Play 에서 설치') && ko.includes('아이폰이라면'));
    assert.ok(!/매수|(?<!공)매도|수익 보장|추천 종목/.test(ko));   // «공매도»는 사실어(부분일치 함정)
  });
  console.log(`\n✅ desktopHandoff: ${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
