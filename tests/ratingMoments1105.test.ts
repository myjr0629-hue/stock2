import assert from 'node:assert/strict';
import { countRatingPush, markRatingError, markReactionSeen, ratingSessionEligible } from '../src/lib/app/ratingMoments';
import { attemptReview } from '../src/hooks/useReviewPrompt';

class Mem {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
}
const local = new Mem();
let session = new Mem();
local.setItem('signum.appSessions', '2');
assert.equal(ratingSessionEligible(local, session), false);
local.setItem('signum.appSessions', '3');
assert.equal(ratingSessionEligible(local, session), true);
assert.equal(markReactionSeen(session), true);
assert.equal(markReactionSeen(session), false);
markRatingError(session);
assert.equal(ratingSessionEligible(local, session), false);
assert.equal(countRatingPush('morning', local, session), 0);
assert.equal(countRatingPush('wl_signal', local, session), 1);
assert.equal(countRatingPush('wl_signal', local, session), 0);
session = new Mem();
assert.equal(countRatingPush('wl_signal', local, session), 2);
session = new Mem();
assert.equal(countRatingPush('wl_signal', local, session), 3);

let requests = 0; const timers: Array<() => void> = [];
(globalThis as any).localStorage = local;
(globalThis as any).window = { setTimeout: (fn: () => void) => timers.push(fn), Capacitor: { Plugins: { InAppReview: { requestReview: () => { requests++; } } } } };
(globalThis as any).document = { visibilityState: 'visible', querySelector: () => null };
let allowed = true;
attemptReview('signum.test1105', 1, 3000, true, () => {}, () => allowed);
allowed = false; timers.shift()!();
assert.equal(requests, 0);
assert.equal(local.getItem('signum.test1105.attempt.1'), null);
local.setItem('signum_interstitial_frequency', JSON.stringify({ lastShownAt: Date.now() }));
attemptReview('signum.test1105', 1, 0, true, () => {}, () => true);
assert.equal(timers.length, 0);
local.setItem('signum_interstitial_frequency', '{}');
attemptReview('signum.test1105', 1, 0, true, () => {}, () => true); timers.shift()!();
assert.equal(requests, 1);
local.setItem('signum.test1105.attempt.1', '2');
attemptReview('signum.test1105', 1, 0, true, () => {}, () => true);
assert.equal(timers.length, 0);
console.log('새 평점 순간 조건 통과');
