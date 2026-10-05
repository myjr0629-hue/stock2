/**
 * PC 넘겨주기(/app 데스크톱) — 방문자 언어·PC→폰 원격 설치(Play)·아이폰 «App Store 에서 검색» 안내 (2026-09-30, 10/4 단순화)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/desktopHandoff.test.ts
 */
import assert from 'node:assert/strict';
import { visitorLang } from '../src/lib/marketing/linkPreview';
import { desktopHandoffHtml, desktopRedeemHtml, redeemScanUrl, APP_SEARCH_NAME } from '../src/lib/marketing/desktopHandoff';
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
  await t('리딤 코드 PC 화면(G0): 3개 언어 «무료» 문장 안 자동 갱신 · QR 주소 · 맞춤/일회용 안내 · iPadOS 는 적용 주소로', async () => {
    const redeemUrl = 'https://apps.apple.com/redeem?ctx=offercodes&id=6783130444&code=NOTEJP';
    assert.equal(redeemScanUrl('note', 'NOTEJP'), 'https://www.signumhq.com/app?from=note&code=NOTEJP&via=qr');
    assert.equal(redeemScanUrl(null, 'NOTEJP'), 'https://www.signumhq.com/app?code=NOTEJP&via=qr');
    const want = { ko: /무료<span class="renew">, 이후 월 ₩11,900 자동 갱신\(언제든 해지\)/, en: /first month free<span class="renew">, then renews at the regular price \(US\$9\.99\/mo\) — cancel anytime/, ja: /無料<span class="renew">、以降は月額¥1,280で自動更新/ };
    for (const lang of ['ko', 'en', 'ja'] as const) {
      const html = await desktopRedeemHtml({ fromTag: 'note', code: 'NOTEJP', lang, redeemUrl });
      assert.ok(want[lang].test(html), `${lang}: 무료+자동 갱신 한 문장`);
      assert.ok(html.includes('data-scan="https://www.signumhq.com/app?from=note&amp;code=NOTEJP&amp;via=qr"') && html.includes('<svg'), `${lang}: QR`);
      assert.ok(html.includes('signumhq.com/app?code=NOTEJP'), `${lang}: 맞춤 코드 = 링크 안내`);
      assert.ok(html.includes(`location.replace("${redeemUrl}")`), `${lang}: iPadOS 적용 주소`);
      assert.ok(!/매수|(?<!공)매도|수익 보장/.test(html));
    }
    const one = await desktopRedeemHtml({ fromTag: null, code: 'TESTCODE1234567890', lang: 'en', redeemUrl });
    assert.ok(one.includes('Redeem Gift Card or Code') && !one.includes('class="url"'), '일회용 = 손입력 안내(링크 안내 없음)');
  });
  await t('리딤 코드 PC 화면 «쿠폰» 결(2026-10-05): 🎟 제목 · 채널·한도·날짜 · «무료» 줄 안 자동 갱신 · 안드 안내는 안드 쿠폰이 켜졌을 때만', async () => {
    const redeemUrl = 'https://apps.apple.com/redeem?ctx=offercodes&id=6783130444&code=NOTEJP';
    const ja = await desktopRedeemHtml({ fromTag: 'note', code: 'NOTEJP', lang: 'ja', redeemUrl, coupon: true });
    assert.ok(ja.includes('<h1>🎟 SIGNUM HQ PRO 1か月無料クーポン</h1>') && ja.includes('note読者限定 · 先着500名 · 10/30まで'));
    assert.ok(ja.includes('<p class="free">1か月無料、以降は月額¥1,280で自動更新・いつでも解約可</p>') && ja.includes('クーポンコード'));
    assert.ok(ja.includes('無料コードは現在iPhoneのみ'), '안드 쿠폰 꺼짐 = 예전 안드 안내');
    const on = await desktopRedeemHtml({ fromTag: 'threads', code: 'THREADSPRO', lang: 'ko', redeemUrl, coupon: true, androidCoupon: true });
    assert.ok(on.includes('나만의 30일 무료 쿠폰 번호') && !on.includes('무료 코드는 현재 아이폰 전용'));
    assert.ok(on.includes('<title>🎟 SIGNUM HQ PRO 1개월 무료 쿠폰 · 1개월 무료 뒤 월 ₩11,900 자동 갱신 · 언제든 해지</title>'));
  });
  console.log(`\n✅ desktopHandoff: ${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
