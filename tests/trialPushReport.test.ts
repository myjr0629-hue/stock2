/** Offline: npx tsx tests/trialPushReport.test.ts — 기기 → 서버 체험 보고(체험만 · 새로 읽은 값 · 해제 · stored:true 일 때만 기록 · 대기열 · 429 재시도) */
import assert from 'node:assert/strict';

const store = new Map<string, string>();
const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, String(v)); }, removeItem: (k: string) => { store.delete(k); } };
const calls: any[] = [];
let replies: Array<{ status: number; body: unknown }> = [];
let reply: { status: number; body: unknown } = { status: 200, body: { ok: true, stored: true } };
let gate: Promise<void> | null = null;
Object.assign(globalThis, {
  window: { localStorage: ls }, localStorage: ls,
  fetch: async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) });
    if (gate) await gate;
    const r = replies.shift() ?? reply;
    return { ok: r.status < 300, status: r.status, json: async () => r.body };
  },
});

const now = Date.now();
const D = 86400_000;
const info = (c: Record<string, unknown> = {}) => ({ entitlements: { active: { pro: { isActive: true, willRenew: false, periodType: 'TRIAL', store: 'APP_STORE', expirationDate: new Date(now + 2 * D).toISOString(), ...c } } } }) as never;
const free = { entitlements: { active: {} } } as never;
const same = (i: unknown) => async () => i as never;
const noWait = async () => {};
const tick = () => new Promise<void>((r) => setImmediate(r));

async function main() {
  const { reportTrialPush } = await import('../src/lib/app/trialPushReport');
  const { TRIAL_PUSH_REPORT_KEY } = await import('../src/lib/app/trialSave');
  const R = (ci: unknown, fresh: unknown = ci, platform = 'ios') => reportTrialPush({ customerInfo: ci as never, platform }, same(fresh), noWait);
  // 토큰 없음 → 아무것도 안 보낸다
  assert.equal(await R(info()), 'skip');
  assert.equal(calls.length, 0);
  store.set('signumhq.push.token', 'tok123');
  store.set('signumhq.app.locale', 'ja');
  assert.equal(await R(info(), info(), 'web'), 'skip', '웹 → 안 보낸다');
  assert.equal(await R(free), 'skip', '무료 사용자(예전 보고 없음) → 안 보낸다');
  assert.equal(calls.length, 0);
  // 새로 읽기 실패 → 안 보낸다
  assert.equal(await reportTrialPush({ customerInfo: info(), platform: 'ios' }, async () => null, noWait), 'skip');
  assert.equal(calls.length, 0);
  // 캐시는 «갱신 꺼짐»인데 새로 읽으니 «갱신 켜짐» → 새 값으로 보낸다(관문 11110917 ③)
  assert.equal(await R(info(), info({ willRenew: true })), 'sent');
  assert.equal(calls[calls.length - 1].body.willRenew, true);
  store.delete(TRIAL_PUSH_REPORT_KEY);
  // 토큰 등록 전(stored:false) → 기록하지 않아 다음에 다시 보낸다
  reply = { status: 202, body: { ok: true, stored: false, skipped: 'unknown-token' } };
  assert.equal(await R(info()), 'skip');
  assert.equal(store.get(TRIAL_PUSH_REPORT_KEY), undefined);
  reply = { status: 200, body: { ok: true, stored: true } };
  assert.equal(await R(info()), 'sent');
  const sentBody = calls[calls.length - 1].body;
  assert.deepEqual(Object.keys(sentBody).sort(), ['expiresAt', 'locale', 'periodType', 'platform', 'store', 'token', 'willRenew']);
  assert.equal(sentBody.locale, 'ja'); assert.equal(sentBody.willRenew, false); assert.equal(sentBody.periodType, 'TRIAL');
  // 같은 내용 → 다시 안 보낸다(새로 읽지도 않는다)
  let reads = 0;
  const n = calls.length;
  assert.equal(await reportTrialPush({ customerInfo: info(), platform: 'ios' }, async () => { reads++; return info(); }, noWait), 'skip');
  assert.equal(calls.length, n); assert.equal(reads, 0);
  // 유료(NORMAL)·평생으로 바뀌었다 → 해제 한 번
  assert.equal(await R(info({ periodType: 'NORMAL', expirationDate: null })), 'cleared');
  assert.deepEqual(calls[calls.length - 1].body, { token: 'tok123', clear: true });
  const m = calls.length;
  assert.equal(await R(free), 'skip', '해제는 한 번만');
  assert.equal(calls.length, m);
  // 호출 제한(429) → 6초 뒤 한 번 더(관문 11110917 ①)
  store.delete(TRIAL_PUSH_REPORT_KEY);
  replies = [{ status: 429, body: { stored: false } }, { status: 200, body: { stored: true } }];
  assert.equal(await R(info()), 'sent');
  assert.equal(calls.length, m + 2);
  // 보내는 중에 새 상태(유료 전환)가 오면 버리지 않고 이어서 보낸다(관문 11110917 ①)
  store.delete(TRIAL_PUSH_REPORT_KEY);
  let open!: () => void;
  gate = new Promise<void>((r) => { open = r; });
  const first = R(info());
  await tick();
  assert.equal(await R(info({ periodType: 'NORMAL', expirationDate: null })), 'queued');
  gate = null; open();
  assert.equal(await first, 'sent');
  for (let i = 0; i < 10; i++) await tick();
  assert.deepEqual(calls[calls.length - 1].body, { token: 'tok123', clear: true }, '대기열의 해제가 이어서 나갔다');
  assert.equal(store.get(TRIAL_PUSH_REPORT_KEY), 'cleared');
  // 서버 오류 → 기록 안 함
  store.delete(TRIAL_PUSH_REPORT_KEY);
  reply = { status: 500, body: { error: 'x' } };
  assert.equal(await R(info(), info(), 'android'), 'skip');
  assert.equal(store.get(TRIAL_PUSH_REPORT_KEY), undefined);
  console.log('trialPushReport: fresh-read report, clear on conversion, queue, 429 retry and stored-only marking passed');
}
main().catch((e) => { console.error(e); process.exit(1); });
