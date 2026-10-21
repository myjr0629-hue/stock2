/** SIGNUMPRO 코드별 만료 회귀 시험. 기존 코드 값은 소스·시험에서 읽고 출력하지 않는다. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isCreatorPromoCode, isLivePromoCode, previewHtml, promoCopy, COPY } from '../src/lib/marketing/linkPreview';
import { giftConfig } from '../src/lib/gift/giftConfig';
import { androidCouponLive } from '../src/lib/marketing/coupon';

const legacyExpiry = Date.parse('2026-10-31T07:00:00Z');
const signumExpiry = Date.parse('2027-01-01T08:00:00Z');
let checks = 0;
function check(actual: unknown, expected: unknown, label: string) {
  assert.deepEqual(actual, expected, label);
  checks++;
}

for (const now of [
  Date.parse('2026-10-21T00:00:00Z'),
  legacyExpiry - 1, legacyExpiry, legacyExpiry + 1,
  Date.parse('2026-12-31T08:00:00Z'),
  signumExpiry - 1, signumExpiry, signumExpiry + 1,
]) {
  const live = now < signumExpiry;
  for (const code of ['SIGNUMPRO', 'signumpro', '  signumpro  ']) {
    check(isLivePromoCode(code, now), live, 'SIGNUMPRO 시각 경계·소문자·공백 정규화');
  }
  const card = previewHtml('signum', 'ko', 'https://www.signumhq.com/app?code=SIGNUMPRO',
    'https://apps.apple.com/', isLivePromoCode('SIGNUMPRO', now));
  check(card.includes(live ? promoCopy('ko', 'SIGNUMPRO').title : COPY.signum.ko.title), true, '만료 판정이 링크 카드에 반영');
  check(giftConfig({ GIFT_PROMO_CODE: 'signumpro', COUPON_ANDROID: '0' }, now),
    live ? { live: true, code: 'SIGNUMPRO', android: false } : { live: false }, '선물 설정 호출자의 만료·정규화');
  check(isLivePromoCode('SIGNUMFREE', now), false, 'SIGNUMFREE는 애플 맞춤 코드에 추가하지 않음');
}

// 이미 존재하는 채널 8종을 재사용한다. 값은 새 파일·로그에 복제하지 않는다.
const source = readFileSync(resolve(__dirname, '../src/lib/marketing/linkPreview.ts'), 'utf8');
const list = source.match(/const LIVE_PROMO_CODES = new Set\(\[([^\]]+)\]\)/)?.[1];
assert.ok(list, '기존 채널 코드 목록을 찾음');
const channelCodes = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
check(channelCodes.length, 8, '기존 채널 8종 유지');

// 기존 형식 시험의 입력을 재사용해 실제 코드·새 코드 값을 쓰지 않는다.
const fixtures = readFileSync(resolve(__dirname, 'redeemLinkPreview.test.ts'), 'utf8');
const creatorCodes = [...fixtures.matchAll(/'([A-Za-z0-9]+)'/g)]
  .map((m) => m[1]).filter((code) => isCreatorPromoCode(code) && code !== 'SIGNUMPRO');
check(creatorCodes.some((code) => code.length === 7), true, '형식 규칙 최소 길이 포함');
check(creatorCodes.some((code) => code.length === 16), true, '형식 규칙 최대 길이 포함');
for (const code of [...channelCodes, ...new Set(creatorCodes)]) {
  for (const now of [legacyExpiry - 1, legacyExpiry, legacyExpiry + 1, signumExpiry - 1]) {
    check(isLivePromoCode(code, now), now < legacyExpiry, '기존 코드의 10/31 경계 유지');
    check(isLivePromoCode(`  ${code.toLowerCase()}  `, now), now < legacyExpiry, '기존 코드 소문자·공백 정규화');
  }
}
check(isLivePromoCode(null, legacyExpiry - 1), false, '코드 없음');
check(isLivePromoCode('', legacyExpiry - 1), false, '빈 코드');
for (const now of [legacyExpiry, signumExpiry - 1]) {
  check(androidCouponLive(now, true), false, 'SIGNUMPRO 연장이 기존 Play 쿠폰 만료를 연장하지 않음');
}
console.log(`SIGNUMPRO 만료 회귀 시험: ${checks}건 통과`);
