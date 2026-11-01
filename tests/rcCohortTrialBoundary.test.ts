import assert from 'node:assert/strict';
import { summarize } from '../scripts/rc-cohort.mjs';

const start = Date.parse('2026-10-01T00:00:00Z');
const end = start + 7 * 86400000;
const trial = {user:'u', transaction:'t', type:'INITIAL_PURCHASE', period:'TRIAL', purchased:start, expires:end, at:start, reason:null, environment:'PRODUCTION'};
const oldTrial = {...trial, purchased:start - 30 * 86400000, expires:start - 23 * 86400000, at:start - 30 * 86400000};
const oldRefund = {...oldTrial, type:'CANCELLATION', at:start - 25 * 86400000, reason:'CUSTOMER_SUPPORT'};
const result = summarize([oldTrial, oldRefund, trial], '2026-10-01', '2026-10-02', end + 1);
assert.equal(result.retrial, 1);
assert.equal(result.refund_signal, 0);
console.log('rc cohort: trial boundary test passed');
