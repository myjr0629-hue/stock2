import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sessionVwapFromBars } from '../src/lib/vwap';

const bar = (etDate: string, session: string, h: number, l: number, c: number, volume: number) => ({ etDate, session, high: h, low: l, close: c, volume });

test('정규장 봉만, 최신 거래일 하나만, 거래량 가중', () => {
    const rows = [
        bar('2026-10-15', 'REG', 300, 300, 300, 1000),            // 옛 날짜 제외
        bar('2026-10-16', 'PRE', 500, 500, 500, 9999),            // 시간외 제외
        bar('2026-10-16', 'REG', 12, 9, 9, 100),                  // 전형가 10
        bar('2026-10-16', 'REG', 21, 18, 21, 300),                // 전형가 20
        bar('2026-10-16', 'POST', 1, 1, 1, 9999),                 // 시간외 제외
        { etDate: '2026-10-16', session: 'REG', high: null, low: null, close: null, volume: 0 }, // 빈 봉
    ];
    assert.deepEqual(sessionVwapFromBars(rows), { vwap: 17.5, date: '2026-10-16', bars: 2 });
});

test('정규장 봉이 없거나 입력이 이상하면 null(0·무한 금지)', () => {
    assert.equal(sessionVwapFromBars(null), null);
    assert.equal(sessionVwapFromBars({}), null);
    assert.equal(sessionVwapFromBars([bar('2026-10-16', 'PRE', 10, 10, 10, 5)]), null);
    assert.equal(sessionVwapFromBars([bar('2026-10-16', 'REG', 10, 10, 10, 0)]), null);
});
