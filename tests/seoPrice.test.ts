/**
 * 웹 종목 페이지 «최근가» — src/lib/seo/freshness.ts seoPrice
 * 실행: node_modules/.bin/ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/seoPrice.test.ts
 *
 * 사고(10/13): /flow/NVDA 가 마감 뒤에 «최근가 $229.28»(월요일 09:35 ET 에 만든 사본의 값 · 실제 월요일 종가 $226.32)을 말했다.
 */
import assert from 'node:assert/strict';
import { seoPrice, etCloseMs } from '../src/lib/seo/freshness';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };

t('16:00 ET 시각(일광절약 EDT·EST 모두)', () => {
    assert.equal(new Date(etCloseMs('2026-10-12')!).toISOString(), '2026-10-12T20:00:00.000Z');
    assert.equal(new Date(etCloseMs('2026-11-02')!).toISOString(), '2026-11-02T21:00:00.000Z');
    assert.equal(etCloseMs('bad'), null);
});
t('★ NVDA 사고: 사본 가격 229.28(월요일 09:35 ET 생성)은 버리고 EOD 종가 226.32 를 쓴다', () => {
    assert.equal(seoPrice({ payloadPrice: 229.28, generatedAt: '2026-10-12T13:35:56.032Z', lastClosed: '2026-10-12', eod: { date: '2026-10-12', close: 226.32 } }), 226.32);
});
t('EOD 행이 아직 그 세션을 못 따라왔고 사본이 마감 전에 만든 것이면 null(틀린 숫자를 말하지 않는다)', () => {
    assert.equal(seoPrice({ payloadPrice: 229.28, generatedAt: '2026-10-12T13:35:56.032Z', lastClosed: '2026-10-12', eod: { date: '2026-10-09', close: 229.28 } }), null);
    assert.equal(seoPrice({ payloadPrice: 229.28, generatedAt: '2026-10-12T13:35:56.032Z', lastClosed: '2026-10-12', eod: null }), null);
});
t('사본이 마감(16:00 ET) 뒤에 만든 것이면 사본의 가격을 쓴다', () => {
    assert.equal(seoPrice({ payloadPrice: 226.3, generatedAt: '2026-10-12T20:30:00Z', lastClosed: '2026-10-12', eod: null }), 226.3);
    assert.equal(seoPrice({ payloadPrice: 226.3, generatedAt: '2026-10-12T19:59:59Z', lastClosed: '2026-10-12', eod: null }), null);
});
t('주말: 금요일 종가가 정답 — 토요일에 만든 사본도 금요일 마감 뒤라 통과', () => {
    assert.equal(seoPrice({ payloadPrice: 100.5, generatedAt: '2026-10-10T15:00:00Z', lastClosed: '2026-10-09', eod: null }), 100.5);
    assert.equal(seoPrice({ payloadPrice: 100.5, generatedAt: '2026-10-09T14:00:00Z', lastClosed: '2026-10-09', eod: { date: '2026-10-09', close: 100.2 } }), 100.2);
});
t('값이 0·음수·NaN 이면 null', () => {
    assert.equal(seoPrice({ payloadPrice: 0, generatedAt: '2026-10-12T21:00:00Z', lastClosed: '2026-10-12', eod: null }), null);
    assert.equal(seoPrice({ payloadPrice: NaN, generatedAt: '2026-10-12T21:00:00Z', lastClosed: '2026-10-12', eod: { date: '2026-10-12', close: -1 } }), null);
});
t('★ 정규장 중 방금(30분 안) 만든 사본의 가격은 지금가 — 전일 종가로 덮지 않는다', () => {
    const now = Date.parse('2026-10-13T15:00:00Z');   // 11:00 ET
    assert.equal(seoPrice({ payloadPrice: 227.9, generatedAt: '2026-10-13T14:45:00Z', lastClosed: '2026-10-12', eod: { date: '2026-10-12', close: 226.32 }, now, regularNow: true }), 227.9);
    // 3시간 묵은 사본이면 전일 종가(레벨의 체인과 같은 세션)
    assert.equal(seoPrice({ payloadPrice: 227.9, generatedAt: '2026-10-13T12:00:00Z', lastClosed: '2026-10-12', eod: { date: '2026-10-12', close: 226.32 }, now, regularNow: true }), 226.32);
    // 정규장이 아니면 방금 만든 사본이어도 종가가 우선
    assert.equal(seoPrice({ payloadPrice: 227.9, generatedAt: '2026-10-13T14:45:00Z', lastClosed: '2026-10-12', eod: { date: '2026-10-12', close: 226.32 }, now, regularNow: false }), 226.32);
});
console.log(`\n✅ ${n}개 통과`);
