/**
 * 안드로이드 Play 프로모션 정의(2026-10-05) — 값은 환경변수로만(공개 저장소에 코드 값 없음) · 꺼짐 = 예전 Play 설치
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/androidPromo.test.ts
 */
import assert from 'node:assert/strict';
import { parseAndroidPromo, androidRedeemUrl, ANDROID_PROMO } from '../src/lib/marketing/androidPromo';

assert.equal(ANDROID_PROMO, null, '환경변수가 없으면 꺼짐(시험 환경)');
assert.equal(parseAndroidPromo(undefined, undefined), null);
assert.equal(parseAndroidPromo('TESTCODE', ''), null, '만료 없으면 꺼짐');
assert.equal(parseAndroidPromo('', '2026-10-31T00:00:00Z'), null, '코드 없으면 꺼짐');
assert.equal(parseAndroidPromo('bad code!', '2026-10-31T00:00:00Z'), null, '형식 틀리면 꺼짐');
const p = parseAndroidPromo(' testcode ', '2026-10-31T00:00:00Z');
assert.deepEqual(p, { code: 'TESTCODE', until: Date.parse('2026-10-31T00:00:00Z') }, '대문자·공백 정리');
const NOW = Date.parse('2026-10-05T03:00:00Z');
assert.equal(androidRedeemUrl(p, NOW), 'https://play.google.com/redeem?code=TESTCODE', '켜짐·만료 전 = Play 코드 사용 창');
assert.equal(androidRedeemUrl(p, Date.parse('2026-10-31T00:00:00Z')), null, '만료(10/31 00:00 GMT) = 꺼짐');
assert.equal(androidRedeemUrl(null, NOW), null, '정의 없음 = 꺼짐');
console.log('✅ androidPromo: 9건 통과');
