import assert from 'node:assert/strict';
import { summarize } from '../scripts/rc-cohort.mjs';

const start = Date.parse('2026-10-01T00:00:00Z');
const end = start + 7 * 86400000;
const trial = {user:'u', transaction:'t', type:'INITIAL_PURCHASE', period:'TRIAL', purchased:start, expires:end, at:start, reason:null, environment:'PRODUCTION'};
const cancellation = {...trial, type:'CANCELLATION', at:end - 1000, reason:'UNSUBSCRIBE'};
const expiration = {...trial, type:'EXPIRATION', at:end, reason:'UNSUBSCRIBE'};
const renewal = {...trial, type:'RENEWAL', period:'NORMAL', purchased:end + 30 * 86400000, at:end + 30 * 86400000};
const result = summarize([trial, cancellation, expiration, renewal], '2026-10-01', '2026-10-02', renewal.at + 1);
assert.equal(result.first_paid_renewal, 0);
assert.equal(result.ended_on, 0);
assert.equal(result.ended_off, 1);
assert.equal(result.resubscription, 1);
console.log('rc cohort: resubscription test passed');
