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
t('만기가 지난 판본은 사본 숫자를 재사용하지 않고 비운다', () => {
    const r: any = ucMoneyAtExit(stale, ctx({ levels: lv({ levelsExpiration: '2026-10-09', maxPain: 999 }) }));
    assert.equal(r.maxPain, null); assert.equal(r.callWall, null); assert.equal(r.putFloor, null);
    assert.equal(r.levelsPending, true); assert.equal(r.levelsChainDate, '2026-10-12'); assert.equal(r.levelsAsOf, 1);
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

// ── 만기 롤오버(2026-10-17 감시기: 금 19:02 ET 에 지난 만기 10/16 레벨이 나감) — 사본은 만기를 싣지 않아 «만든 시각»으로 가린다
const ET = (iso: string) => Date.parse(iso);
const copyMoney = { price: 100, maxPain: 100, callWall: 110, putFloor: 90, oiPcr: 0.8 };
const roll = (nowIso: string, genIso: string, levels: any) => ucMoneyAtExit(copyMoney, ctx({
  now: ET(nowIso), generatedAt: genIso, todayET: nowIso.slice(0, 10), lastClosed: nowIso.slice(0, 10), eod: { date: nowIso.slice(0, 10), close: 100 }, levels,
})) as any;
const nulled = (r: any) => r.maxPain === null && r.callWall === null && r.putFloor === null && r.levelsPending === true && r.oiPcr === 0.8;
const kept = (r: any) => r.maxPain === 100 && r.callWall === 110 && r.putFloor === 90 && r.levelsPending !== true;
const THU = '2026-10-15T18:00:00Z';   // 목 14:00 ET 에 만든 사본 = 10/16 만기분
t('★ 금 19:02 ET · 구조 판본 없음 · 이전 만기 사본 → 지난 숫자 100·110·90 을 내지 않는다', () => {
    assert.ok(nulled(roll('2026-10-16T19:02:00-04:00', THU, null)));
});
t('★ 금 19:02 ET · 다음 만기(10/23) 판본이 왔지만 세 레벨이 모두 null → 사본 숫자를 되살리지 않는다', () => {
    assert.ok(nulled(roll('2026-10-16T19:02:00-04:00', THU, lv({ levelsExpiration: '2026-10-23', maxPain: null, callWall: null, putFloor: null }))));
});
t('★ 금 19:02 ET · 다음 만기 판본의 체인이 낡음(levelsStaleReason) → 사본 숫자를 되살리지 않는다', () => {
    assert.ok(nulled(roll('2026-10-16T19:02:00-04:00', THU, lv({ levelsExpiration: '2026-10-23', levelsStaleReason: 'stale' }))));
});
t('금 15:59 ET 는 아직 10/16 만기 살아 있음 → 사본 그대로 / 16:01 부터 비움', () => {
    assert.ok(kept(roll('2026-10-16T15:59:00-04:00', THU, null)));
    assert.ok(nulled(roll('2026-10-16T16:01:00-04:00', THU, null)));
});
t('토·일·월 08:00 ET 에도 이전 만기 사본은 비운다', () => {
    for (const d of ['2026-10-17T12:00:00-04:00', '2026-10-18T12:00:00-04:00', '2026-10-19T08:00:00-04:00']) assert.ok(nulled(roll(d, THU, null)), d);
});
t('마감 «뒤»에 만든 사본(금 17:00 ET = 10/23 만기분)은 월요일 08:00 에도 그대로', () => {
    assert.ok(kept(roll('2026-10-19T08:00:00-04:00', '2026-10-16T21:00:00Z', null)));
});
t('월~목 평일: 같은 주 월요일 사본은 그대로(만기 전)', () => {
    assert.ok(kept(roll('2026-10-14T12:00:00-04:00', '2026-10-12T14:00:00Z', null)));
});
t('금요일이 휴장인 주(2026-04-03 성금요일) — 만기는 목 4/2: 목 16:01 부터 비운다', () => {
    assert.ok(kept(roll('2026-04-02T15:59:00-04:00', '2026-03-30T14:00:00Z', null)));
    assert.ok(nulled(roll('2026-04-02T16:01:00-04:00', '2026-03-30T14:00:00Z', null)));
});
t('★ 금 15:59 에 레벨을 읽고 AI 생성이 16:00:10 에 끝난 사본 → 19:02 에 구조 판본이 없어도 지난 숫자를 내지 않는다', () => {
    assert.ok(nulled(roll('2026-10-16T19:02:00-04:00', '2026-10-16T16:00:10-04:00', null)));
});
t('★ 마감 뒤 16:10 ET 에 읽고 만든 정상 다음 주 사본은 구조 판본 조회가 실패해도 유지', () => {
    assert.ok(kept(roll('2026-10-16T19:02:00-04:00', '2026-10-16T16:10:00-04:00', null)));
});
t('★ 원래 세 레벨이 모두 null 인 사본(옵션 없는 종목)은 금 마감 뒤에도 대기 표시(levelsPending)가 붙지 않는다', () => {
    const r: any = ucMoneyAtExit({ price: 100, maxPain: null, callWall: null, putFloor: null }, ctx({
        now: ET('2026-10-16T19:02:00-04:00'), generatedAt: THU, todayET: '2026-10-16', lastClosed: '2026-10-16', eod: { date: '2026-10-16', close: 100 }, levels: null,
    }));
    assert.equal('levelsPending' in r, false); assert.equal(r.maxPain, null);
});
t('만든 시각을 모르면 판단하지 않는다(기존 동작)', () => {
    assert.ok(kept(roll('2026-10-16T19:02:00-04:00', null as any, null)));
});
t('다음 만기 판본이 숫자와 함께 도착하면 판본 숫자로 복귀', () => {
    const r = roll('2026-10-16T19:02:00-04:00', THU, lv({ levelsExpiration: '2026-10-23', maxPain: 200, callWall: 210, putFloor: 190 }));
    assert.equal(r.maxPain, 200); assert.equal(r.levelsPending, false);
});
t('실제 사본 만기 보존: 16:00:10에 끝난 다음 주 사본은 유지, 16:20에 끝난 지난 만기 사본은 비움', () => {
    for (const [expiry, gen, keep] of [
        ['2026-10-23', '2026-10-16T16:00:10-04:00', true],
        ['2026-10-16', '2026-10-16T16:20:00-04:00', false],
    ] as const) {
        const r: any = ucMoneyAtExit({ ...copyMoney, levelsExpiration: expiry }, ctx({
            now: ET('2026-10-16T19:02:00-04:00'), generatedAt: gen, levels: null,
        }));
        assert.ok(keep ? kept(r) : nulled(r));
    }
});
t('만기 필드 없는 새 사본은 AI 완료시각 대신 레벨 조회시각으로 판정', () => {
    const r: any = ucMoneyAtExit({ ...copyMoney, levelsReadAt: ET('2026-10-16T15:59:00-04:00') }, ctx({
        now: ET('2026-10-16T19:02:00-04:00'), generatedAt: '2026-10-16T16:20:00-04:00', levels: null,
    }));
    assert.ok(nulled(r));
});
console.log(`\n✅ ${n}개 통과`);
