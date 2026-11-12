/** Offline: npx tsx tests/trialVerify.test.ts — 체험 보고 서버 확인(RC v1 응답 해석 · 예산 · 장애) 2026-11-12 야간 검토 ② */
import assert from 'node:assert/strict';
import { trialFromSubscriber, verifyTrialWithRc, TRIAL_VERIFY_LIMIT_UID, type TrialVerifyStore } from '../src/lib/push/trialVerify';

const now = Date.parse('2026-11-12T03:00:00Z');
const D = 86400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const subOf = (c: Record<string, unknown> = {}, key = 'com.signumhq.app.pro.monthly', ent: Record<string, unknown> = {}) => ({ subscriber: {
  entitlements: { pro: { product_identifier: 'com.signumhq.app.pro.monthly', expires_date: iso(now + 2 * D), ...ent } },
  subscriptions: { [key]: { period_type: 'trial', store: 'app_store', expires_date: iso(now + 2 * D), unsubscribe_detected_at: iso(now - D), billing_issues_detected_at: null, ownership_type: 'PURCHASED', ...c } },
} });

// ── 응답 해석 ──
assert.deepEqual(trialFromSubscriber(subOf(), now), { expiresAt: now + 2 * D, willRenew: false, periodType: 'TRIAL', store: 'APP_STORE' });
assert.equal(trialFromSubscriber(subOf({ unsubscribe_detected_at: null }), now)!.willRenew, true, '해지 감지 없음 = 갱신 켜짐');
assert.equal(trialFromSubscriber(subOf({ unsubscribe_detected_at: null, billing_issues_detected_at: iso(now) }), now)!.willRenew, false, '결제 문제 = 갱신 안 됨');
assert.equal(trialFromSubscriber(subOf({ period_type: 'normal' }), now), null, '유료 → 체험 아님');
assert.equal(trialFromSubscriber(subOf({ period_type: 'intro' }), now), null);
assert.equal(trialFromSubscriber(subOf({ ownership_type: 'FAMILY_SHARED' }), now), null, '가족 공유 → 아님');
assert.equal(trialFromSubscriber(subOf({ store: 'promotional' }), now), null, '프로모션 권한 → 아님');
assert.equal(trialFromSubscriber(subOf({}, 'x', { expires_date: iso(now - 1) }), now), null, '권한 만료');
assert.equal(trialFromSubscriber(subOf({ expires_date: iso(now - 1) }), now), null, '구독 만료');
assert.equal(trialFromSubscriber(subOf({}, 'com.signumhq.app.pro.monthly', { expires_date: null }), now), null, '평생(만료 없음) → 아님');
assert.equal(trialFromSubscriber({ subscriber: { entitlements: {}, subscriptions: {} } }, now), null, '없는 고객(GET 이 만든 빈 고객) → 아님');
assert.equal(trialFromSubscriber(null, now), null);
// 안드 기본 요금제 키(상품:기본요금제)
const play = subOf({ store: 'play_store' }, 'pro_monthly:monthly', { product_identifier: 'pro_monthly' });
assert.deepEqual(trialFromSubscriber(play, now), { expiresAt: now + 2 * D, willRenew: false, periodType: 'TRIAL', store: 'PLAY_STORE' });
// 관계없는 상품의 구독은 보지 않는다(만료 시각이 같아도)
assert.equal(trialFromSubscriber(subOf({ store: 'play_store' }, 'other', { product_identifier: 'pro_monthly' }), now), null);
// 같은 상품의 지난 기본 요금제(만료) + 지금 체험 → 지금 체험을 고른다
const multi = { subscriber: { entitlements: { pro: { product_identifier: 'pro_monthly:monthly', expires_date: iso(now + 2 * D) } }, subscriptions: {
  'pro_monthly:old': { period_type: 'normal', store: 'play_store', expires_date: iso(now - 40 * D), unsubscribe_detected_at: null },
  'pro_monthly:monthly': { period_type: 'trial', store: 'play_store', expires_date: iso(now + 2 * D), unsubscribe_detected_at: iso(now - D) },
} } };
assert.deepEqual(trialFromSubscriber(multi, now), { expiresAt: now + 2 * D, willRenew: false, periodType: 'TRIAL', store: 'PLAY_STORE' });
const reversed = { subscriber: { ...multi.subscriber, entitlements: { pro: { product_identifier: 'pro_monthly', expires_date: iso(now + 2 * D) } } } };
assert.equal(trialFromSubscriber(reversed, now)!.willRenew, false, '권한 키가 상품만이어도 접두로 찾고, 끝난 기록은 건너뛴다');

// ── 예산 · 장애 ──
const memStore = (): TrialVerifyStore & { m: Map<string, number> } => {
  const m = new Map<string, number>();
  return { m, incr: async (keys) => keys.map((k) => { const n = (m.get(k) ?? 0) + 1; m.set(k, n); return n; }) };
};
const okFetch = (body: unknown, status = 200) => (async () => ({ ok: status < 300, status, json: async () => body })) as unknown as typeof fetch;
const uid = '$RCAnonymousID:' + 'ab'.repeat(16);
async function run() {
  const keys = { ios: 'appl_x', android: 'goog_x' };
  let v = await verifyTrialWithRc(uid, 'ios', '1.2.3.4', { store: memStore(), keys, fetchImpl: okFetch(subOf()), now: () => now });
  assert.equal(v.kind, 'trial');
  v = await verifyTrialWithRc('bad id', 'ios', null, { store: memStore(), keys, fetchImpl: okFetch(subOf()), now: () => now });
  assert.equal(v.kind, 'not_trial', '형식 틀림 → RC 안 부름');
  assert.equal((await verifyTrialWithRc(uid, 'ios', null, { store: memStore(), keys, fetchImpl: okFetch({}, 500), now: () => now })).kind, 'unavailable');
  assert.equal((await verifyTrialWithRc(uid, 'ios', null, { store: memStore(), keys, fetchImpl: okFetch({}, 429), now: () => now })).kind, 'limited');
  assert.equal((await verifyTrialWithRc(uid, 'ios', null, { store: memStore(), keys: {}, fetchImpl: okFetch(subOf()), now: () => now })).kind, 'unavailable', '키 없음');
  assert.equal((await verifyTrialWithRc(uid, 'ios', null, { store: { incr: async () => { throw new Error('redis'); } }, keys, fetchImpl: okFetch(subOf()), now: () => now })).kind, 'unavailable', 'Redis 장애 → RC 안 부름');
  let called = 0;
  const slow = (async () => { called++; return new Promise(() => {}); }) as unknown as typeof fetch;
  assert.equal((await verifyTrialWithRc(uid, 'ios', null, { store: memStore(), keys, fetchImpl: slow, now: () => now, timeoutMs: 20 })).kind, 'unavailable', '시간 초과');
  assert.equal(called, 1);
  const st = memStore();
  let last = '';
  for (let i = 0; i <= TRIAL_VERIFY_LIMIT_UID; i++) last = (await verifyTrialWithRc(uid, 'ios', `10.0.0.${i}`, { store: st, keys, fetchImpl: okFetch(subOf()), now: () => now })).kind;
  assert.equal(last, 'limited', '고객 ID 예산 초과');
  console.log('trialVerify: RC subscriber parsing, budgets and outages passed');
}
run().catch((e) => { console.error(e); process.exit(1); });
