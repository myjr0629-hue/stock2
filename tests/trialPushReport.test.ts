/** Offline: npx tsx tests/trialPushReport.test.ts — 기기 → 서버 체험 보고(체험만 · 해제 · stored:true 일 때만 기록 · 중복 방지) */
import assert from 'node:assert/strict';

const store = new Map<string, string>();
const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, String(v)); }, removeItem: (k: string) => { store.delete(k); } };
const calls: any[] = [];
let reply: { status: number; body: unknown } = { status: 200, body: { ok: true, stored: true } };
Object.assign(globalThis, {
  window: { localStorage: ls }, localStorage: ls,
  fetch: async (url: string, init: { body: string }) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: reply.status < 300, status: reply.status, json: async () => reply.body }; },
});

const now = Date.now();
const D = 86400_000;
const info = (c: Record<string, unknown> = {}) => ({ entitlements: { active: { pro: { isActive: true, willRenew: false, periodType: 'TRIAL', store: 'APP_STORE', expirationDate: new Date(now + 2 * D).toISOString(), ...c } } } }) as never;
const free = { entitlements: { active: {} } } as never;

async function main() {
  const { reportTrialPush } = await import('../src/lib/app/trialPushReport');
  const { TRIAL_PUSH_REPORT_KEY } = await import('../src/lib/app/trialSave');
  // 토큰 없음 → 아무것도 안 보낸다
  assert.equal(await reportTrialPush({ customerInfo: info(), platform: 'ios' }), 'skip');
  assert.equal(calls.length, 0);
  store.set('signumhq.push.token', 'tok123');
  store.set('signumhq.app.locale', 'ja');
  // 웹·이상한 플랫폼 → 안 보낸다
  assert.equal(await reportTrialPush({ customerInfo: info(), platform: 'web' }), 'skip');
  // 무료 사용자(예전 보고 없음) → 안 보낸다
  assert.equal(await reportTrialPush({ customerInfo: free, platform: 'ios' }), 'skip');
  assert.equal(calls.length, 0);
  // 토큰 등록 전(stored:false) → 기록하지 않아 다음에 다시 보낸다
  reply = { status: 202, body: { ok: true, stored: false, skipped: 'unknown-token' } };
  assert.equal(await reportTrialPush({ customerInfo: info(), platform: 'ios' }), 'skip');
  assert.equal(store.get(TRIAL_PUSH_REPORT_KEY), undefined);
  reply = { status: 200, body: { ok: true, stored: true } };
  assert.equal(await reportTrialPush({ customerInfo: info(), platform: 'ios' }), 'sent');
  const sentBody = calls[calls.length - 1].body;
  assert.deepEqual(Object.keys(sentBody).sort(), ['expiresAt', 'locale', 'periodType', 'platform', 'store', 'token', 'willRenew']);
  assert.equal(sentBody.locale, 'ja'); assert.equal(sentBody.willRenew, false); assert.equal(sentBody.periodType, 'TRIAL');
  // 같은 내용 → 다시 안 보낸다
  const n = calls.length;
  assert.equal(await reportTrialPush({ customerInfo: info(), platform: 'ios' }), 'skip');
  assert.equal(calls.length, n);
  // 갱신을 다시 켰다 → 보낸다(서버가 대상에서 뺀다)
  assert.equal(await reportTrialPush({ customerInfo: info({ willRenew: true }), platform: 'ios' }), 'sent');
  assert.equal(calls[calls.length - 1].body.willRenew, true);
  // 유료(NORMAL)·평생으로 바뀌었다 → 해제 한 번
  assert.equal(await reportTrialPush({ customerInfo: info({ periodType: 'NORMAL', expirationDate: null }), platform: 'ios' }), 'cleared');
  assert.deepEqual(calls[calls.length - 1].body, { token: 'tok123', clear: true });
  const m = calls.length;
  assert.equal(await reportTrialPush({ customerInfo: free, platform: 'ios' }), 'skip', '해제는 한 번만');
  assert.equal(calls.length, m);
  // 서버 오류 → 기록 안 함
  store.delete(TRIAL_PUSH_REPORT_KEY);
  reply = { status: 500, body: { error: 'x' } };
  assert.equal(await reportTrialPush({ customerInfo: info(), platform: 'android' }), 'skip');
  assert.equal(store.get(TRIAL_PUSH_REPORT_KEY), undefined);
  console.log('trialPushReport: trial-only report, clear on conversion, stored-only marking passed');
}
main().catch((e) => { console.error(e); process.exit(1); });
