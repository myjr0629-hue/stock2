/**
 * UC 종목 응답이 사본에서 나갈 때 가격·레벨을 현재 판본으로 바로잡는가 — src/lib/seo/ucMoneyExit.ts
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/ucMoneyExit.test.ts
 *
 * 10/13 22:00 ET 실측 사본(월요일 09:35 ET 생성, _stale): NVDA price 229.28·맥스페인 215 / MU 풋플로어 1000 — 구조 판본·실제 종가는 NVDA 226.32·220 / MU 800.
 */
import assert from 'node:assert/strict';
import { ucMoneyAtExit } from '../src/lib/seo/ucMoneyExit';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const lv = (o: any = {}) => ({ maxPain: 220, callWall: 250, putFloor: 220, pinZone: 220, gammaFlipLevel: 220, levelsExpiration: '2026-10-16', levelsChainDate: '2026-10-12', levelsSource: 'structure', levelsAsOf: 1, levelsSpot: 226.18, levelsStaleReason: null, ...o });
const ctx = (o: any = {}) => ({ generatedAt: '2026-10-12T13:35:56.032Z', lastClosed: '2026-10-12', now: Date.parse('2026-10-13T02:00:00Z'), regularNow: false, todayET: '2026-10-12', eod: { date: '2026-10-12', close: 226.32 }, levels: lv(), ...o });
const stale = { price: 229.28, maxPain: 215, callWall: 250, putFloor: 220, oiPcr: 0.75, darkPoolPct: 43.8 };

t('★ 사본 가격 229.28 → 월요일 종가 226.32, 레벨 → 구조 판본(맥스페인 215 → 220), 다른 필드는 그대로', () => {
    const r: any = ucMoneyAtExit(stale, ctx());
    assert.equal(r.price, 226.32); assert.equal(r.maxPain, 220); assert.equal(r.callWall, 250); assert.equal(r.putFloor, 220);
    assert.equal(r.oiPcr, 0.75); assert.equal(r.darkPoolPct, 43.8);
});
t('MU 풋플로어 1000(사본) → 800(구조)', () => {
    const r: any = ucMoneyAtExit({ price: 975, maxPain: 980, callWall: 1100, putFloor: 1000 }, ctx({ eod: { date: '2026-10-12', close: 989.04 }, levels: lv({ maxPain: 980, callWall: 1100, putFloor: 800, levelsSpot: 989 }) }));
    assert.equal(r.putFloor, 800); assert.equal(r.price, 989.04);
});
t('구조 판본이 없으면 레벨은 사본 그대로(가격만 바로잡는다)', () => {
    const r: any = ucMoneyAtExit(stale, ctx({ levels: null }));
    assert.equal(r.maxPain, 215); assert.equal(r.price, 226.32);
});
t('구조 판본에 «낡음» 표식(levelsStaleReason)이 있으면 덮지 않는다 — 사본보다 나쁜 값을 내지 않는다', () => {
    const r: any = ucMoneyAtExit(stale, ctx({ levels: lv({ levelsStaleReason: 'stale', maxPain: 999 }) }));
    assert.equal(r.maxPain, 215);
});
t('만기가 지난 판본은 덮지 않는다', () => {
    const r: any = ucMoneyAtExit(stale, ctx({ levels: lv({ levelsExpiration: '2026-10-09', maxPain: 999 }) }));
    assert.equal(r.maxPain, 215);
});
t('EOD 가 그 세션을 못 따라왔고 사본이 마감 전 것이면 가격은 null(틀린 숫자를 말하지 않는다)', () => {
    const r: any = ucMoneyAtExit(stale, ctx({ eod: { date: '2026-10-09', close: 229.28 } }));
    assert.equal(r.price, null);
});
t('money 가 없거나 가격이 없으면 그대로', () => {
    assert.equal(ucMoneyAtExit(null as any, ctx()), null);
    const r: any = ucMoneyAtExit({ maxPain: 215, callWall: 250, putFloor: 220 }, ctx());
    assert.equal('price' in r, false); assert.equal(r.maxPain, 220);
});
console.log(`\n✅ ${n}개 통과`);
