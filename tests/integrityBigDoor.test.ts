/**
 * 무결성 감시기 — 31개 이상 한 요청 문 판정(scripts/integrity/bigdoor.js) 시험
 * 실행: NODE_PATH=$PWD/node_modules node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/integrityBigDoor.test.ts
 *
 * 출발점(10/14 수리 뒤 첫 회차들): 31개 문이 허브 실시간 체결로 나가자 남은 어긋남은 «문 경로»가 아니라 «공급사 피드 편차»(AMD 595.5 vs 합의 599 — 목록 문·Flow·허브가 전부 같은 값)였고,
 *   다른 문은 20초 뒤 재조회로 일시 어긋남을 거르는데 이 문은 대상이 아니었다. 규칙 완화가 아니라 «문 단위 귀속»:
 *   · 목록 문(30개 이하)은 맞는데 31개 문만 틀린 종목 = 문 경로 결함 → 오류 그대로(10/13 F1 모양)
 *   · 두 문이 같이 틀린 종목 = 같은 피드 편차 → 31개 문에서는 info (목록 문의 LIVE_PRICE 가 따로 오류로 보고)
 */
import assert from 'node:assert/strict';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const clock = require('../scripts/integrity/clock.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const parity = require('./helpers/integrityBaseline.js').installRuleParity();
const rules = require('../scripts/integrity/rules.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const big = require('../scripts/integrity/bigdoor.js');

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const ms = (date: string, hms: string) => clock.etToMs(date, hms);
const daily = (m: Record<string, number>) => ({ ok: true, daily: Object.entries(m).map(([date, c]) => ({ date, o: c, h: c, l: c, c, v: 1 })), events: [] as any[] });
function bars(date: string, from: string, to: string, price: (i: number) => number) {
    const out: any[] = []; let i = 0;
    for (let t0 = ms(date, from); t0 <= ms(date, to); t0 += 60e3, i++) { const c = price(i); out.push({ t: t0, o: c, h: c + 0.1, l: c - 0.1, c, v: 100 }); }
    return out;
}

const date = '2026-10-13', NOW = ms(date, '11:00:30'), S = clock.sessionAt(NOW);
const flat = bars(date, '09:30:00', '11:00:00', () => 226);
const raw = { y1m: { ok: true, bars: flat }, yd: daily({ '2026-10-09': 230, '2026-10-12': 226.32 }), nInfo: null, nPre: null, nPost: null };
const ref = rules.deriveRef(NOW, S, raw);
const q = (price: number) => ({ price, previousClose: 226.32, changePercent: ((price - 226.32) / 226.32) * 100, extendedPrice: 0, extendedLabel: 'PRE', session: 'regular' });
const list = ['AAA', 'BBB', 'CCC', 'DDD'];

console.log('━━━ 31개 문 판정 — 문 단위 귀속 ━━━');
t('둘 다 정상 → 아무것도 없다', () => {
    const v = big.judgeBig({ now: NOW, S, list, data: { AAA: q(226) }, listData: { AAA: q(226) }, refOf: () => ref });
    assert.deepEqual([v.bad.length, v.carry.length, v.sameFeed.length], [0, 0, 0]);
});
t('31개 문만 2% 틀리고 목록 문은 맞다 = 문 경로 결함 → bad (10/13 벌크 경로 모양)', () => {
    const v = big.judgeBig({ now: NOW, S, list, data: { BBB: q(226 * 1.02) }, listData: { BBB: q(226) }, refOf: () => ref });
    assert.deepEqual(v.bad.map((b: any) => b.s), ['BBB']); assert.equal(v.sameFeed.length, 0);
});
t('두 문이 같이 틀리면 = 같은 피드 편차 → sameFeed (bad 아님)', () => {
    const v = big.judgeBig({ now: NOW, S, list, data: { CCC: q(226 * 0.98) }, listData: { CCC: q(226 * 0.98) }, refOf: () => ref });
    assert.equal(v.bad.length, 0); assert.deepEqual(v.sameFeed.map((b: any) => b.s), ['CCC']);
});
t('목록 문 응답이 없으면(읽기 실패) 같은 피드로 보지 않는다 — 예전과 같이 bad', () => {
    const v = big.judgeBig({ now: NOW, S, list, data: { DDD: q(226 * 1.02) }, listData: null, refOf: () => ref });
    assert.deepEqual(v.bad.map((b: any) => b.s), ['DDD']);
    const v2 = big.judgeBig({ now: NOW, S, list, data: { DDD: q(226 * 1.02) }, listData: {}, refOf: () => ref });
    assert.deepEqual(v2.bad.map((b: any) => b.s), ['DDD']);
});
t('섞여 있으면 각자 귀속 · only 로 일부만 다시 판정(확인 재조회)', () => {
    const data = { AAA: q(226), BBB: q(226 * 1.02), CCC: q(226 * 0.98) }, listData = { AAA: q(226), BBB: q(226), CCC: q(226 * 0.98) };
    const v = big.judgeBig({ now: NOW, S, list, data, listData, refOf: () => ref });
    assert.deepEqual([v.bad.map((b: any) => b.s), v.sameFeed.map((b: any) => b.s)], [['BBB'], ['CCC']]);
    const v2 = big.judgeBig({ now: NOW, S, list, data, listData, refOf: () => ref, only: ['CCC'] });
    assert.deepEqual([v2.bad.length, v2.sameFeed.map((b: any) => b.s)], [0, ['CCC']]);
});
t('findings: bad → QUOTES_OVER30 error(syms 포함) · sameFeed → QUOTES_OVER30_SAMEFEED info · carry → delay', () => {
    const v = big.judgeBig({ now: NOW, S, list, data: { BBB: q(226 * 1.02), CCC: q(226 * 0.98) }, listData: { BBB: q(226), CCC: q(226 * 0.98) }, refOf: () => ref });
    const fs = big.toFindings(v, 31);
    const e = fs.find((f: any) => f.code === 'QUOTES_OVER30'); const i = fs.find((f: any) => f.code === 'QUOTES_OVER30_SAMEFEED');
    assert.equal(e.sev, 'error'); assert.deepEqual(e.syms, ['BBB']); assert.match(e.msg, /1\/31/);
    assert.equal(i.sev, 'info'); assert.match(i.msg, /CCC/);
    assert.deepEqual(big.toFindings({ bad: [], carry: ['X'], sameFeed: [] }, 31).map((f: any) => [f.code, f.sev]), [['QUOTES_OVER30_CARRY', 'delay']]);
});
t('마감 뒤 종가 자리에 호가 중간값이 앉은 모양(10/13 F1)은 목록 문이 맞는 한 여전히 오류', () => {
    const NOW2 = ms('2026-10-12', '21:48:00'), S2 = clock.sessionAt(NOW2);
    const ref2 = rules.deriveRef(NOW2, S2, { y1m: { ok: true, bars: bars('2026-10-12', '16:00:00', '20:00:00', () => 226.32) }, yd: daily({ '2026-10-09': 229.28, '2026-10-12': 226.32 }), nInfo: null, nPre: null, nPost: null });
    const good = { price: 226.32, previousClose: 229.28, changePercent: -1.291, extendedPrice: 0, extendedLabel: 'POST', session: 'closed' };
    const mid = { ...good, price: 224.54, changePercent: -2.07 };
    const v = big.judgeBig({ now: NOW2, S: S2, list: ['NVDA'], data: { NVDA: mid }, listData: { NVDA: good }, refOf: () => ref2 });
    assert.deepEqual(v.bad.map((b: any) => b.s), ['NVDA'], JSON.stringify(v));
});
console.log(`integrityBigDoor: ${n} passed`);

parity.report();
