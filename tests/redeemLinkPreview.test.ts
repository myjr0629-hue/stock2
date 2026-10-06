/**
 * 리딤 코드 링크 카드(2026-10-05) — 우리 맞춤 코드(만료 전)면 «PRO 1개월 무료» 카드, 아니면 예전 카드 그대로
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/redeemLinkPreview.test.ts
 */
import assert from 'node:assert/strict';
import { isLivePromoCode, isCreatorPromoCode, previewHtml, PROMO_COPY, COPY } from '../src/lib/marketing/linkPreview';

const NOW = Date.parse('2026-10-05T00:00:00Z');
const END = Date.parse('2026-10-31T07:00:00Z');
for (const c of ['WEBPRO', 'THREADSPRO', 'XPRO', 'XJPPRO', 'BSKYPRO', 'NOTEJP', 'NAVERPRO', 'IHPRO']) assert.equal(isLivePromoCode(c, NOW), true, c);
assert.equal(isLivePromoCode('notejp', NOW), true, '소문자도 같은 코드');
assert.equal(isLivePromoCode('FAKE1PRO', NOW), false, '남의 코드·오타 = 예전 카드');
assert.equal(isLivePromoCode(null, NOW), false);
assert.equal(isLivePromoCode('WEBPRO', END), false, '만료(10/30 PT 자정) 뒤 = 예전 카드');
assert.equal(isLivePromoCode('WEBPRO', END - 1), true);

// ★2026-10-06 크리에이터 맞춤 코드 — 값은 저장소에 없다. 형식 규칙 ^[A-Z]{4,13}PRO$ (가짜 값으로 시험)
for (const c of ['ABCDPRO', 'ABCDEFGHIJKLMPRO']) { assert.equal(isCreatorPromoCode(c), true, c); assert.equal(isLivePromoCode(c, NOW), true, c); }   // 4자·13자 + PRO
for (const c of ['abcdpro', 'ABCD1PRO', 'ABCDEFGHIJKLMNPRO', 'ABCPRO', 'ABCDPR', 'ABCDPROX', 'ABCD PRO', '', 'PRO']) assert.equal(isCreatorPromoCode(c), false, `형식 밖: «${c}»`);   // 소문자·숫자·14자·3자·PRO 아님
assert.equal(isLivePromoCode('abcdpro', NOW), true, '링크는 채널 코드와 같은 정규화(소문자 → 대문자) — 형식 검사는 그 뒤');
for (const c of ['ABCD1PRO', 'ABCDEFGHIJKLMNPRO', 'ABCPRO', 'ABCDPR', 'ABCDPROX']) assert.equal(isLivePromoCode(c, NOW), false, `형식 밖: «${c}»`);
assert.equal(isLivePromoCode('ABCDPRO', END), false, '크리에이터 코드도 같은 만료');
for (const c of ['XPRO', 'WEBPRO', 'NOTEJP']) assert.equal(isCreatorPromoCode(c), false, `${c} 는 규칙 밖 — 목록으로만 산다`);
const promoCreator = previewHtml('signum', 'en', 'https://www.signumhq.com/app?from=cr_test&code=ABCDPRO', 'https://apps.apple.com/x', isLivePromoCode('ABCDPRO', NOW));
assert.ok(promoCreator.includes(PROMO_COPY.en.title) && promoCreator.includes('/promo/redeem-card-en.png'), '크리에이터 코드 링크 카드 = PRO 1개월 무료 카드');

const promo = previewHtml('signum', 'ko', 'https://www.signumhq.com/app?from=naver_blog&code=NAVERPRO', 'https://apps.apple.com/x', true);
assert.ok(promo.includes(PROMO_COPY.ko.title.replace(/&/g, '&amp;')), '한국어 리딤 제목');
assert.ok(promo.includes('/promo/redeem-card-ko.png'), '리딤 카드 이미지');
assert.ok(promo.includes('자동 갱신'), '«무료» 문장 안 자동 갱신 고지');
const plain = previewHtml('signum', 'ko', 'https://www.signumhq.com/app?from=naver_blog', 'https://apps.apple.com/x');
assert.ok(plain.includes(COPY.signum.ko.title) && plain.includes('/promo/card-app-ko.png'), 'promo 없으면 예전 카드 그대로');
const uc = previewHtml('uc', 'ja', 'https://www.signumhq.com/app-uc?from=note', 'https://apps.apple.com/x', true);
assert.ok(uc.includes(COPY.uc.ja.title), 'UC·WIM 은 promo 무시(SIGNUM 코드만)');
for (const l of ['en', 'ja', 'ko'] as const) assert.ok(/9\.99|1,280|11,900/.test(PROMO_COPY[l].desc), l + ' 가격 고지');
console.log('✅ redeemLinkPreview: 41건 통과');
