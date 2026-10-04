/**
 * 홈 리딤 코드 칩(설계 §4.1) — 플래그 기본 OFF · 운영 도메인에서는 미리보기 켜기 무시 · 안드로이드 숨김 · 만료 후 숨김 (2026-10-04)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/promoCodeChip.test.ts
 */
import assert from 'node:assert/strict';
import { chipVisible, previewOverride } from '../src/components/landing/PromoCodeChip';

const IPH = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const AND = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const NOW = Date.parse('2026-10-05T00:00:00Z');
const AFTER = Date.parse('2026-10-31T07:00:00Z');

assert.equal(process.env.NEXT_PUBLIC_WEB_PROMO_CHIP, undefined, '플래그는 설정이 없어야 한다(기본 OFF)');
assert.equal(chipVisible({ flag: false, override: false, ua: IPH, now: NOW }), false, 'OFF = 아무도 안 보임');
assert.equal(chipVisible({ flag: true, override: false, ua: IPH, now: NOW }), true, 'ON + 아이폰');
assert.equal(chipVisible({ flag: true, override: false, ua: MAC, now: NOW }), true, 'ON + PC');
assert.equal(chipVisible({ flag: true, override: false, ua: AND, now: NOW }), false, '안드로이드 숨김');
assert.equal(chipVisible({ flag: true, override: false, ua: IPH, now: AFTER }), false, '만료(10/30 PT 자정) 뒤 숨김');
assert.equal(chipVisible({ flag: true, override: false, ua: IPH, now: AFTER - 1 }), true, '만료 직전은 보임');
assert.equal(previewOverride('www.signumhq.com', '?promochip=1'), false, '운영 www 에서는 무시');
assert.equal(previewOverride('signumhq.com', '?promochip=1'), false, '운영 apex 에서는 무시');
assert.equal(previewOverride('stock2-git-feat-web-promo-chip-x.vercel.app', '?promochip=1'), true, '미리보기에서만 켜짐');
assert.equal(previewOverride('stock2-git-feat-web-promo-chip-x.vercel.app', ''), false);
assert.equal(chipVisible({ flag: false, override: true, ua: AND, now: NOW }), false, '미리보기 켜기여도 안드로이드는 숨김');
console.log('✅ promoCodeChip: 12건 통과');
