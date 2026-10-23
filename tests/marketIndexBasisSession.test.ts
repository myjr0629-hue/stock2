/** 관문 P2: 마지막 1분봉 보존과 낡은 장중 시세의 LIVE 판정 회귀. 외부 I/O 없음. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMarketIndexBasis, guardianCashChange, indexContext } from '@/lib/marketIndexBasis';
import { reconcileIndexQuote } from '@/lib/indexQuoteReconcile';

const ms = Date.parse;
const quote = (symbol: string, marketTime: string, changePct: number | null = -2.6) =>
    ({ symbol, price: 26008.86, changePct, marketTime, source: 'YAHOO' });
const cash = (marketTime: string, now: string, changePct: number | null = -2.6) => buildMarketIndexBasis({
    nasdaq: quote('^IXIC', marketTime, changePct), ndx: quote('^NDX', marketTime, changePct),
    spx: quote('^GSPC', marketTime, changePct),
}, ms(now));

test('기존 수집기의 15:59 보정 봉이 17:00에도 Guardian·뉴스에 남는다', () => {
    const rec = reconcileIndexQuote({ metaPrice: 26703.14, metaPrevClose: 26600,
        metaTimeSec: ms('2026-10-21T20:00:00Z') / 1000,
        bars: [{ ts: ms('2026-10-22T19:59:00Z') / 1000, c: 26008.86 }],
        regularEndSec: ms('2026-10-22T20:00:00Z') / 1000,
        daily: [{ ts: ms('2026-10-21T13:30:00Z') / 1000, c: 26703.14 }],
    });
    assert.equal(rec.priceFromBars, true);
    const marketTime = new Date(rec.marketTimeSec! * 1000).toISOString();
    const changePct = (rec.price / rec.prevClose! - 1) * 100;
    const basis = buildMarketIndexBasis({ nasdaq: { ...quote('^IXIC', marketTime), price: rec.price, changePct } }, ms('2026-10-22T21:00:00Z'));
    assert.equal(basis.cash.nasdaq.price, 26008.86);
    assert.equal(guardianCashChange({ indexBasis: basis }), changePct);
    assert.equal(basis.cash.nasdaq.asOf, marketTime, '15:59를 16:00 또는 조회 시각으로 바꾸지 않는다');
    assert.equal(basis.cash.nasdaq.sessionDate, '2026-10-22');
    assert.equal(basis.cash.nasdaq.live, false);
    assert.match(indexContext(basis).join('\n'), /NASDAQ Composite: 26008.86 \(-2.60%\).*regular-session close.*19:59:00/);
});

test('마지막 1분봉은 주말·휴장·다음 개장 전까지 보존된다', () => {
    for (const now of ['2026-10-23T20:00:00Z', '2026-10-25T23:00:00Z', '2026-10-26T13:29:59Z']) {
        for (const point of Object.values(cash('2026-10-23T19:59:00Z', now).cash)) {
            assert.equal(point.price, 26008.86, now);
            assert.equal(point.live, false);
            assert.equal(point.sessionDate, '2026-10-23');
        }
    }
    assert.equal(cash('2026-11-25T20:59:00Z', '2026-11-26T17:00:00Z').cash.nasdaq.price, 26008.86);
    assert.equal(cash('2026-10-23T19:59:00Z', '2026-10-26T13:30:00Z').cash.nasdaq.price, null);
});

test('정상·조기 마감의 마지막 분만 인정하며 더 이른 장중 값은 종가로 승격하지 않는다', () => {
    for (const [closeBar, older, now] of [
        ['2026-10-22T19:59:00Z', '2026-10-22T19:58:59Z', '2026-10-22T21:00:00Z'],
        ['2026-11-27T17:59:00Z', '2026-11-27T17:58:59Z', '2026-11-27T18:00:00Z'],
    ]) {
        const basis = cash(closeBar, now);
        for (const point of Object.values(basis.cash)) {
            assert.equal(point.price, 26008.86);
            assert.equal(point.changePct, -2.6);
            assert.equal(point.live, false);
        }
        assert.match(indexContext(basis).join('\n'), /regular-session close/);
        for (const point of Object.values(cash(older, now).cash)) {
            assert.equal(point.price, null);
            assert.equal(point.changePct, null);
        }
    }
});

test('마감 봉의 실제 0과 결측 null을 구분한다', () => {
    for (const changePct of [0, null]) {
        const basis = cash('2026-10-22T19:59:00Z', '2026-10-22T21:00:00Z', changePct);
        assert.equal(guardianCashChange({ indexBasis: basis }), changePct);
        assert.equal(basis.cash.spx.changePct, changePct);
    }
});

test('15:00의 당일 09:30 시세는 가격·원시각을 보존하되 LIVE와 뉴스 live 설명을 금지한다', () => {
    const basis = cash('2026-10-23T13:30:00Z', '2026-10-23T19:00:00Z');
    for (const point of Object.values(basis.cash)) {
        assert.equal(point.price, 26008.86);
        assert.equal(point.asOf, '2026-10-23T13:30:00.000Z');
        assert.equal(point.live, false);
    }
    const context = indexContext(basis).join('\n');
    assert.doesNotMatch(context, /regular session live/);
    assert.match(context, /regular-session observation.*13:30:00/);
});

test('현물 LIVE는 기존 선물과 같은 20분 경계 및 원시각으로 판정한다', () => {
    for (const [time, expected] of [
        ['2026-10-23T18:40:00Z', true], ['2026-10-23T18:39:59.999Z', false],
        ['2026-10-23T18:59:00Z', true], ['2026-10-23T19:00:00.001Z', false],
    ] as const) {
        const basis = cash(time, '2026-10-23T19:00:00Z');
        for (const point of Object.values(basis.cash)) assert.equal(point.live, expected, time);
        assert.equal(indexContext(basis).some(line => line.includes('regular session live')), expected);
    }
    for (const time of ['bad', '2026-10-23T13:29:59Z', '2026-10-22T19:59:00Z']) {
        const point = cash(time, '2026-10-23T19:00:00Z').cash.nasdaq;
        assert.equal(point.live, false);
        assert.equal(point.price, null);
    }
});
