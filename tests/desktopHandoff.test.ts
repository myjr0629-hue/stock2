/**
 * PC 넘겨주기(/app 데스크톱) — 방문자 언어·«폰으로 보내기»·PC→폰 원격 설치(Play) (2026-09-30)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/desktopHandoff.test.ts
 */
import assert from 'node:assert/strict';
import { visitorLang } from '../src/lib/marketing/linkPreview';
import { sendLinks, desktopHandoffHtml } from '../src/lib/marketing/desktopHandoff';
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
  await t('sendLinks: 공유 URL 만(via=send·원래 태그·언어) · 일본은 LINE 먼저 · 한국·영어는 메일 먼저', () => {
    const ko = sendLinks('ko', 'home');
    assert.deepEqual(ko.map((l) => l.key), ['mail', 'wa', 'tg', 'line']);
    assert.ok(decodeURIComponent(ko[0].href).includes('https://www.signumhq.com/app?from=home&via=send&l=ko'));
    const ja = sendLinks('ja', 'note');
    assert.equal(ja[0].key, 'line');
    assert.ok(ja[0].href.startsWith('https://line.me/R/share?text='));
    const en = sendLinks('en', null);
    assert.ok(decodeURIComponent(en[1].href).includes('from=desktop&via=send') && !decodeURIComponent(en[1].href).includes('&l='));
  });
  await t('Play 리퍼러: 기본 smartlink 그대로 · PC 버튼은 utm_medium=pc_play', () => {
    const base = 'https://play.google.com/store/apps/details?id=com.signumhq.app';
    assert.ok(decodeURIComponent(playUrlWithReferrer(base, 'home')).includes('utm_medium=smartlink'));
    assert.ok(decodeURIComponent(playUrlWithReferrer(base, 'home', 'signum', 'pc_play')).includes('utm_medium=pc_play'));
  });
  await t('화면: 안드로이드 원격 설치 버튼·안내 · 보내기 4개 · QR 유지 · 권유 표현 없음(ko)', async () => {
    const html = await desktopHandoffHtml({ fromTag: 'home', lang: 'ko', appStoreUrl: 'https://apps.apple.com/app/id6783130444', playStoreUrl: 'https://play.google.com/store/apps/details?id=com.signumhq.app&referrer=x' });
    assert.ok(html.includes('안드로이드 폰이라면') && html.includes('Google Play 에서 설치') && html.includes('내 휴대폰을 고르면'));
    assert.equal((html.match(/data-k="/g) || []).length, 4);
    assert.ok(html.includes('<svg'));   // QR(주소 via=qr 는 그림 안에만 있다)
    assert.ok(!/매수|(?<!공)매도|수익 보장|추천 종목/.test(html));   // «공매도»는 사실어(부분일치 함정)
  });
  console.log(`\n✅ desktopHandoff: ${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
