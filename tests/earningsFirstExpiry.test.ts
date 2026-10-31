import assert from 'node:assert/strict';
import { firstExpiryAfterDate } from '../src/services/impliedMoveService';

assert.equal(firstExpiryAfterDate(['2026-11-20', '2026-11-06', '2026-11-05'], '2026-11-05', 'amc'), '2026-11-06');
assert.equal(firstExpiryAfterDate(['2026-11-06', '2026-11-02'], '2026-11-02', 'bmo'), '2026-11-02');
assert.equal(firstExpiryAfterDate(['2026-11-05'], '2026-11-05', 'amc'), null);
console.log('earnings first expiry: 3 cases passed');
