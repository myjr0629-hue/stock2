/**
 * 리딤 코드 링크 카드(2026-10-05) — 우리 맞춤 코드(만료 전)면 «PRO 1개월 무료» 카드, 아니면 예전 카드 그대로
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/redeemLinkPreview.test.ts
 */
import assert from 'node:assert/strict';
import { isLivePromoCode, previewHtml, PROMO_COPY, COPY } from '../src/lib/marketing/linkPreview';

const NOW = Date.parse('2026-10-05T00:00:00Z');
const END = Date.parse('2026-10-31T07:00:00Z');
for (const c of ['WEBPRO', 'THREADSPRO', 'XPRO', 'XJPPRO', 'BSKYPRO', 'NOTEJP', 'NAVERPRO', 'IHPRO']) assert.equal(isLivePromoCode(c, NOW), true, c);
assert.equal(isLivePromoCode('notejp', NOW), true, '소문자도 같은 코드');
assert.equal(isLivePromoCode('FAKEPRO', NOW), false, '남의 코드·오타 = 예전 카드');
assert.equal(isLivePromoCode(null, NOW), false);
assert.equal(isLivePromoCode('WEBPRO', END), false, '만료(10/30 PT 자정) 뒤 = 예전 카드');
assert.equal(isLivePromoCode('WEBPRO', END - 1), true);

const promo = previewHtml('signum', 'ko', 'https://www.signumhq.com/app?from=naver_blog&code=NAVERPRO', 'https://apps.apple.com/x', true);
assert.ok(promo.includes(PROMO_COPY.ko.title.replace(/&/g, '&amp;')), '한국어 리딤 제목');
assert.ok(promo.includes('/promo/redeem-card-ko.png'), '리딤 카드 이미지');
assert.ok(promo.includes('자동 갱신'), '«무료» 문장 안 자동 갱신 고지');
const plain = previewHtml('signum', 'ko', 'https://www.signumhq.com/app?from=naver_blog', 'https://apps.apple.com/x');
assert.ok(plain.includes(COPY.signum.ko.title) && plain.includes('/promo/card-app-ko.png'), 'promo 없으면 예전 카드 그대로');
const uc = previewHtml('uc', 'ja', 'https://www.signumhq.com/app-uc?from=note', 'https://apps.apple.com/x', true);
assert.ok(uc.includes(COPY.uc.ja.title), 'UC·WIM 은 promo 무시(SIGNUM 코드만)');
for (const l of ['en', 'ja', 'ko'] as const) assert.ok(/9\.99|1,280|11,900/.test(PROMO_COPY[l].desc), l + ' 가격 고지');
console.log('✅ redeemLinkPreview: 17건 통과');
