'use strict';
// Offline only: node scripts/integrity/ext-date-label.test.js
// 10/18 오탐(EXT_VALUE BRK.B·FITB·WTFC) 재현·수리 시험 — 나스닥 시간외 페이지 표기 날짜가 주말에 하루 앞으로 찍혀
// 감시기가 나스닥 «통합 마지막 체결»을 버리고 단주가 빠진 야후 분봉 종가로 판정하던 것.
const assert = require('node:assert/strict');
const path = require('node:path');
const clock = require('./clock');
const rules = require('./rules');
const FX = require(path.join(__dirname, 'fixtures', 'ext-date-label-2026-10-18.json'));

// 앱이 운영에서 낸 값(/api/live/quotes 10/18 13:3x KST · extendedTime 10/16 ET) — BRK.B 19:59:59.875 · FITB 19:43:23.032 · WTFC 19:30:05.070
const APP = { 'BRK.B': 532.16, FITB: 50.9, WTFC: 144.83, AAPL: 342.812 };
const YAHOO_ONLY = { 'BRK.B': 533, FITB: 50.4, WTFC: 144.08 };   // 고치기 전 감시기가 «기준»으로 쓴 값(단주 없는 분봉 종가)

let n = 0;
function test(name, fn) {
    if (process.argv[2] && !name.includes(process.argv[2])) return;
    fn(); n++; console.log(`  ✓ ${name}`);
}
function raw(sym, nPostOverride) {
    const x = FX[sym];
    const bars = x.bars.map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v }));
    const reg16 = bars.filter((b) => clock.windowOf(b.t, '2026-10-16') === 'regular');
    const c0 = reg16[reg16.length - 1].c;
    return {
        y1m: { ok: true, bars, meta: null },
        yd: { ok: true, daily: [{ date: '2026-10-15', c: c0 * 0.99 }, { date: '2026-10-16', c: c0 }], events: [] },
        nInfo: null, nPre: null,
        nPost: Object.assign({}, x.nPost, nPostOverride || {}),
    };
}
const at = (date, hms) => clock.etToMs(date, hms);
const extErrors = (now, S, ref, sym, ext) => rules.judgeExtFlow(now, S, ref, sym, 'quotes', { extPrice: ext, extLabel: 'POST', extPctKnown: false })
    .filter((f) => f.code === 'EXT_VALUE' || f.code === 'EXT_LABEL');

console.log('ext-date-label');

test('일요일(마감): 나스닥 표기 «Oct 15» 여도 체결이 10/16 분봉과 맞으면 나스닥 통합 마지막 체결을 기준으로 쓴다', () => {
    const now = at('2026-10-18', '00:32:40');
    const S = clock.sessionAt(now);
    assert.equal(S.session, 'closed'); assert.equal(S.lastClosed, '2026-10-16');
    for (const sym of Object.keys(APP)) {
        const ref = rules.deriveRef(now, S, raw(sym));
        assert.ok(ref.postClose, `${sym} postClose`);
        assert.equal(ref.postClose.src, 'n', `${sym} 기준 출처`);
        assert.equal(ref.postClose.price, FX[sym].nPost.last, `${sym} 기준값`);
        assert.ok(ref.notes.some((s) => /체결 대조로 2026-10-16/.test(s)), `${sym} 근거 메모`);
        assert.deepEqual(extErrors(now, S, ref, sym, APP[sym]), [], `${sym} 앱 값은 정상`);
    }
});

test('일요일(마감): 감시기가 눈멀지 않는다 — 앱이 단주 없는 분봉 값(옛 기준)을 내면 오류', () => {
    const now = at('2026-10-18', '00:32:40');
    const S = clock.sessionAt(now);
    for (const sym of Object.keys(YAHOO_ONLY)) {
        const ref = rules.deriveRef(now, S, raw(sym));
        const errs = extErrors(now, S, ref, sym, YAHOO_ONLY[sym]);
        assert.equal(errs.length, 1, `${sym}`); assert.equal(errs[0].code, 'EXT_VALUE'); assert.equal(errs[0].ref, FX[sym].nPost.last);
    }
});

test('진짜 낡은 페이지(체결이 기대 날짜 분봉과 안 맞는다)는 여전히 버린다 — 야후로 떨어진다', () => {
    // 10/16 01:00 ET(금요일 장 전): 기대 = 10/15 애프터. 나스닥 목록은 10/16 체결이고 표기는 «Oct 14» 라고 가정.
    const now = at('2026-10-16', '01:00:00');
    const S = clock.sessionAt(now);
    assert.equal(S.lastClosed, '2026-10-15');
    for (const sym of ['BRK.B', 'FITB', 'AAPL']) {
        const ref = rules.deriveRef(now, S, raw(sym, { asOf: 'Data last updated Oct 14, 2026 08:00 PM ET.' }));
        assert.ok(ref.postClose, `${sym}`);
        assert.equal(ref.postClose.src, 'y', `${sym} — 낡은 나스닥 값을 받아들이면 안 된다`);
        assert.equal(ref.notes.length, 0);
    }
});

test('프리(월 04:30 ET): 금요일 애프터 기준도 같은 규칙 — 표기가 틀려도 체결 대조로 받아들인다', () => {
    const now = at('2026-10-19', '04:30:00');
    const S = clock.sessionAt(now);
    assert.equal(S.session, 'pre'); assert.equal(S.lastClosed, '2026-10-16');
    const ref = rules.deriveRef(now, S, raw('FITB'));
    assert.equal(ref.postClose.src, 'n'); assert.equal(ref.postClose.price, 50.9);
});

test('표기 날짜 분봉이 조회 범위 밖이면 가를 수 없다 — 낡은 페이지를 승인하지 않는다(관문 재현)', () => {
    // 10/18 감시 · 표기 «Oct 12» 낡은 페이지(마지막 90) · 10/16 분봉 마지막 101 · 중간 체결 2/3 만 겹친다
    const now = at('2026-10-18', '00:32:40');
    const S = clock.sessionAt(now);
    const b = (hms, c) => ({ t: at('2026-10-16', hms), o: c, h: c, l: c, c, v: 100 });
    const r = {
        y1m: { ok: true, bars: [b('15:59:00', 100), b('17:00:00', 95), b('18:00:00', 96), b('19:59:00', 101)], meta: null },
        yd: { ok: true, daily: [{ date: '2026-10-15', c: 99 }, { date: '2026-10-16', c: 100 }], events: [] },
        nInfo: null, nPre: null,
        nPost: { ok: true, last: 90, asOf: 'Data last updated Oct 12, 2026 08:00 PM ET.', trades: [{ hms: '19:50:00', price: 90, size: 100 }, { hms: '18:00:10', price: 96, size: 100 }, { hms: '17:00:10', price: 95, size: 100 }] },
    };
    const ref = rules.deriveRef(now, S, r);
    assert.equal(ref.postClose.src, 'y'); assert.equal(ref.postClose.price, 101);
    assert.equal(extErrors(now, S, ref, 'TEST', 101).length, 0, '진짜 마지막 값 101 은 정상');
    assert.equal(extErrors(now, S, ref, 'TEST', 90)[0].code, 'EXT_VALUE', '낡은 90 은 오류');
    // 같은 입력에 표기 날짜(10/12) 분봉이 있고 그 날짜와 더 맞으면 역시 거부
    r.y1m.bars.push({ t: at('2026-10-12', '19:50:00'), o: 90, h: 90, l: 90, c: 90, v: 100 }, { t: at('2026-10-12', '18:00:00'), o: 96, h: 96, l: 96, c: 96, v: 100 }, { t: at('2026-10-12', '17:00:00'), o: 95, h: 95, l: 95, c: 95, v: 100 });
    assert.equal(rules.deriveRef(now, S, r).postClose.src, 'y');
});

test('애프터(금 18:00 ET): 세션 중엔 표기와 무관하게 나스닥 값을 쓴다(기존 규칙 유지)', () => {
    const now = at('2026-10-16', '18:00:00');
    const S = clock.sessionAt(now);
    assert.equal(S.session, 'post');
    const ref = rules.deriveRef(now, S, raw('WTFC'));
    assert.equal(ref.postClose.src, 'n'); assert.equal(ref.postClose.price, 144.83);
});

test('정규장·표기 일치: 표기가 기대 날짜와 같으면 대조하지 않고 그대로 쓴다(기존 규칙 유지)', () => {
    const now = at('2026-10-16', '11:00:00');
    const S = clock.sessionAt(now);
    assert.equal(S.session, 'regular'); assert.equal(S.lastClosed, '2026-10-15');
    const ref = rules.deriveRef(now, S, raw('BRK.B'));
    assert.equal(ref.postClose.src, 'n');
    assert.equal(ref.notes.length, 0);
    // 일요일인데 표기가 10/16 이면(나스닥이 바르게 표기한 날) 대조 없이 쓴다
    const now2 = at('2026-10-18', '00:32:40');
    const ref2 = rules.deriveRef(now2, clock.sessionAt(now2), raw('BRK.B', { asOf: 'Data last updated Oct 16, 2026 08:00 PM ET.' }));
    assert.equal(ref2.postClose.src, 'n'); assert.equal(ref2.notes.length, 0);
});

test('표기가 틀렸는데 분봉이 없다(야후 실패) — 단정하지 않고 버린다', () => {
    const now = at('2026-10-18', '00:32:40');
    const S = clock.sessionAt(now);
    const r = raw('FITB'); r.y1m = { ok: false, bars: [] };
    const ref = rules.deriveRef(now, S, r);
    assert.equal(ref.postClose, null);
});

console.log(`${n} passed`);
