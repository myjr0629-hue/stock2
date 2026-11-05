import assert from 'node:assert/strict';
import { GIFT_ANNOUNCE_KEY, GIFT_REANNOUNCE_KEY, giftAnnounceBlock, markGiftAnnounced, type StoreLike } from '../src/lib/gift/giftAnnounce';

const now = Date.UTC(2026, 10, 5);
const hour = 3600_000;
function store(initial: Record<string, string> = {}): StoreLike {
  const data = { ...initial };
  return { getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
}
const old = store({ [GIFT_ANNOUNCE_KEY]: JSON.stringify({ n: 3, last: now - 25 * hour, stop: 1 }) });
const input = { live: true, store: old, onboardedAtMount: true, path: '/ko/app-view/dash', dialogOpen: false, now, reannounce: true };
assert.equal(giftAnnounceBlock(input), null);
assert.equal(giftAnnounceBlock({ ...input, dialogOpen: true }), 'busy');
assert.equal(giftAnnounceBlock({ ...input, onboardedAtMount: false }), 'new');
assert.equal(giftAnnounceBlock({ ...input, live: false }), 'off');
assert.equal(markGiftAnnounced(old, now, true), true);
assert.equal(giftAnnounceBlock({ ...input, now: now + 48 * hour }), 'cap');
assert.equal(markGiftAnnounced(old, now + hour, true), false);
const recent = store({ [GIFT_ANNOUNCE_KEY]: JSON.stringify({ n: 1, last: now - hour }) });
assert.equal(giftAnnounceBlock({ ...input, store: recent }), 'gap');
assert.equal(giftAnnounceBlock({ ...input, store: recent, now: now + 23 * hour }), null);
const campaign = store({ [GIFT_REANNOUNCE_KEY]: String(now) });
assert.equal(giftAnnounceBlock({ ...input, store: campaign, reannounce: false, now: now + hour }), 'gap');
assert.equal(giftAnnounceBlock({ ...input, store: campaign, reannounce: false, now: now + 24 * hour }), null);
const broken: StoreLike = { getItem: () => { throw Error(); }, setItem: () => { throw Error(); } };
assert.equal(markGiftAnnounced(broken, now, true), false);
assert.equal(giftAnnounceBlock({ ...input, store: broken }), 'nostore');
console.log('gift reannounce: 12 assertions passed');
