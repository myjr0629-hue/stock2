import assert from 'node:assert/strict';
import { parseChart, splitAdjustedShares, alignedBeta } from '../src/lib/guruLens/sources';
const ts = Array.from({ length: 260 }, (_, i) => Date.parse('2025-01-01T00:00:00Z') / 1000 + i * 86400);
const close = ts.map((_, i) => 100 + i),
    high = close.map((v) => v + 2);
const raw = {
    chart: {
        result: [
            {
                meta: { currency: 'USD' },
                timestamp: ts,
                indicators: { quote: [{ close, high }] },
                events: { splits: { one: { date: ts[240], numerator: 25, denominator: 1 } } },
            },
        ],
    },
};
const today = new Date(ts[259] * 1000).toISOString().slice(0, 10);
const parsed = parseChart(raw, today);
assert.equal(parsed.closes.length, 259, 'current-day incomplete candle excluded');
assert.equal(parsed.closes.at(-1)![1], 358);
assert.equal(parsed.high, 360);
assert.equal(parsed.splits[0].ratio, 25);
assert.throws(() => parseChart({}, today), /price_missing/);
const short = structuredClone(raw);
short.chart.result[0].timestamp = ts.slice(0, 100);
assert.throws(() => parseChart(short, today), /price_history_short/);
const invalid = structuredClone(raw);
invalid.chart.result[0].events.splits.one.denominator = 0;
assert.throws(() => parseChart(invalid, today), /split_invalid/);
assert.equal(
    splitAdjustedShares(100, '2026-06-30', '2026-10-16', [
        { date: '2026-07-01', ratio: 25 },
        { date: '2026-11-01', ratio: 2 },
    ]).shares,
    2500,
    'future split not applied',
);
assert.equal(
    splitAdjustedShares(100, '2026-07-01', '2026-10-16', [{ date: '2026-07-01', ratio: 25 }]).shares,
    100,
    'share date already includes split',
);
const market: Array<[string, number]> = parsed.closes;
assert.ok(Math.abs(alignedBeta(market, market)! - 1) < 1e-10);
assert.equal(alignedBeta(market.slice(0, 100), market), null);
assert.equal(
    alignedBeta(
        market,
        market.map(([d]) => [d, 100]),
    ),
    null,
);
console.log(
    'guruLens sources: completed daily bars, short/missing history, split ratios/boundaries, aligned beta passed; supplier calls 0',
);
