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
const UID = '$RCAnonymousID:' + '0123456789abcdef'.repeat(2);
const tick = () => new Promise<void>((r) => setImmediate(r));

async function main() {
  const { reportTrialPush } = await import('../src/lib/app/trialPushReport');
  const { TRIAL_PUSH_REPORT_KEY } = await import('../src/lib/app/trialSave');
  const R = (ci: unknown, fresh: unknown = ci, platform = 'ios') => reportTrialPush({ customerInfo: ci as never, platform }, same(fresh), noWait, async () => UID);
  // 토큰 없음 → 아무것도 안 보낸다
  assert.equal(await R(info()), 'skip');
  assert.equal(calls.length, 0);
  store.set('signumhq.push.token', 'tok123');
  store.set('signumhq.app.locale', 'ja');
  assert.equal(await R(info(), info(), 'web'), 'skip', '웹 → 안 보낸다');
  assert.equal(await R(free), 'skip', '무료 사용자(예전 보고 없음) → 안 보낸다');
  assert.equal(calls.length, 0);
  // ★11/12 RC 앱 사용자 ID 를 못 읽으면 상태 보고를 보내지 않는다(서버가 확인할 수 없다 — 다음 진입에 다시)
  assert.equal(await reportTrialPush({ customerInfo: info(), platform: 'ios' }, same(info()), noWait, async () => null), 'skip');
  assert.equal(calls.length, 0);
  assert.equal(store.get(TRIAL_PUSH_REPORT_KEY), undefined);
  // 갱신을 다시 켠 보고(빼기)는 ID 를 못 읽어도 보낸다(관문 11121015 ①) — ID 없이
  assert.equal(await reportTrialPush({ customerInfo: info({ willRenew: true }), platform: 'ios' }, same(info({ willRenew: true })), noWait, async () => null), 'sent');
  assert.equal(calls[calls.length - 1].body.willRenew, true); assert.equal('rcUid' in calls[calls.length - 1].body, false);
  calls.length = 0; store.delete(TRIAL_PUSH_REPORT_KEY);
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
  assert.deepEqual(Object.keys(sentBody).sort(), ['expiresAt', 'locale', 'periodType', 'platform', 'rcUid', 'store', 'token', 'willRenew']);
  assert.equal(sentBody.rcUid, UID, '★11/12 서버가 RC 에서 확인할 앱 사용자 ID');
  assert.equal(sentBody.locale, 'ja'); assert.equal(sentBody.willRenew, false); assert.equal(sentBody.periodType, 'TRIAL');
  // 같은 내용 → 새로 읽기는 한다(체험 중 — 그사이 스토어에서 갱신을 켰을 수 있다) · 같으면 보내지 않는다
  let reads = 0;
  const n = calls.length;
  assert.equal(await reportTrialPush({ customerInfo: info(), platform: 'ios' }, async () => { reads++; return info(); }, noWait), 'skip');
  assert.equal(calls.length, n); assert.equal(reads, 1);
  // 캐시는 지난번과 같지만 새로 읽으니 갱신 켬 → 보낸다(관문 11110920 ①)
  assert.equal(await R(info(), info({ willRenew: true })), 'sent');
  assert.equal(calls[calls.length - 1].body.willRenew, true);
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
  // 설정에서 캐시를 지워 기록이 없어도 «유료·평생 PRO»면 해제 한 번(관문 11110920 ②) · 무료는 여전히 아무것도 안 보낸다
  store.delete(TRIAL_PUSH_REPORT_KEY);
  reply = { status: 200, body: { ok: true, stored: true } };
  assert.equal(await R(free), 'skip');
  assert.equal(await R(info({ periodType: 'NORMAL', willRenew: true, expirationDate: new Date(now + 300 * D).toISOString() })), 'cleared');
  assert.equal(store.get(TRIAL_PUSH_REPORT_KEY), 'cleared');
  let r2 = 0;
  assert.equal(await reportTrialPush({ customerInfo: info({ periodType: 'NORMAL' }) as never, platform: 'ios' }, async () => { r2++; return info({ periodType: 'NORMAL' }); }, noWait), 'skip');
  assert.equal(r2, 0, '해제 뒤 유료 사용자는 새로 읽지도 않는다');
  // 서버 오류 → 기록 안 함
  store.delete(TRIAL_PUSH_REPORT_KEY);
  reply = { status: 500, body: { error: 'x' } };
  assert.equal(await R(info(), info(), 'android'), 'skip');
  assert.equal(store.get(TRIAL_PUSH_REPORT_KEY), undefined);
  console.log('trialPushReport: fresh-read report, clear on conversion, queue, 429 retry and stored-only marking passed');
}
main().catch((e) => { console.error(e); process.exit(1); });
