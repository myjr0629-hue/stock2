import assert from 'node:assert/strict';
import { computeInitialSession } from '@/hooks/useMarketStatus';
import { etPhase } from '@/lib/cache/intelFastCache';
import { clockSession } from '@/utils/liveQuote';

let pass = 0, fail = 0;
function t(name: string, fn: () => void) {
    try {
        fn();
        pass++;
    } catch (e) {
        fail++;
        console.error(name, e);
    }
}

const cases = [
    ['2026-12-24', '09:29', 'pre'],
    ['2026-12-24', '09:30', 'reg'],
    ['2026-12-24', '12:59', 'reg'],
    ['2026-12-24', '13:00', 'post'],
    ['2026-12-24', '13:30', 'post'],
    ['2026-12-24', '19:59', 'post'],
    ['2026-12-24', '20:00', 'night'],
    ['2026-12-23', '15:00', 'reg'],
    ['2026-12-23', '15:59', 'reg'],
    ['2026-12-23', '16:00', 'post'],
    ['2026-12-23', '16:01', 'post'],
    ['2027-11-26', '13:00', 'post'],
] as const;

for (const [date, time, phase] of cases) {
    const ms = Date.parse(`${date}T${time}:00-05:00`);
    t(`useMarketStatus ${date} ${time} ET`, () => {
        const fallback = computeInitialSession(new Date(ms));
        assert.equal(fallback.session, phase === 'reg' ? 'regular' : phase === 'night' ? 'closed' : phase);
        assert.equal(fallback.market, phase === 'night' ? 'closed' : 'open');
    });
    t(`liveQuote ${date} ${time} ET`, () => {
        assert.equal(clockSession(ms), phase === 'night' ? 'closed' : phase);
    });
    t(`intelFastCache ${date} ${time} ET`, () => {
        assert.deepEqual(etPhase(ms), { key: `${date}:${phase}`, open: phase !== 'night' });
    });
}

console.log(`${pass} 통과 · ${fail} 실패`);
if (fail) process.exitCode = 1;
