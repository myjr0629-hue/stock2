/** Offline: npx tsx tests/trialValuePush.test.ts — 체험 중 가치 알림(3일째·6일째) 순수 규칙 · 문구 · 탭 목적지 · RC 시작 시각 (2026-11-19) */
import assert from 'node:assert/strict';
import {
  trialValueSchedule, trialValueStepAt, trialValueDecision, trialValueContent, trialValueData, trialValueTapPath, firstWatchTicker,
  TRIAL_VALUE_TAP_PATHS, type TrialValueTokenRec,
} from '../src/lib/push/trialValuePush';
import { trialFromSubscriber } from '../src/lib/push/trialVerify';
import type { TrialPushRecord } from '../src/lib/push/trialPush';

const H = 3600_000, D = 24 * H;
// 기준: UTC 정오(현지 09~21시 안)
const S = Date.parse('2026-11-16T12:00:00Z');

// ── 일정 ──
{
  const w = trialValueSchedule(S, S + 7 * D);
  assert.deepEqual(w, [{ step: 'd3', from: S + 2 * D, to: S + 3 * D }, { step: 'd6', from: S + 5 * D, to: S + 6 * D }], '7일 체험 = 3일째·6일째(마지막 24시간 전)');
  const c = trialValueSchedule(S, S + 30 * D);
  assert.deepEqual(c, [{ step: 'd3', from: S + 6 * D, to: S + 7 * D }, { step: 'd6', from: S + 24 * D, to: S + 25 * D }], '1개월 코드 체험 = 7일째·만료 6~5일 전(25일째)');
  const m31 = trialValueSchedule(S, S + 31 * D);
  assert.equal(m31[1].from, S + 25 * D, '31일 체험도 만료 기준');
  assert.deepEqual(trialValueSchedule(S, S + 3 * D), [], '4일 미만은 보내지 않는다');
  assert.deepEqual(trialValueSchedule(S, S + 45 * D), [], '40일 초과(1년 등)는 보내지 않는다');
  assert.deepEqual(trialValueSchedule(NaN, S), []);
  // 5일 체험: 6일째 창은 마지막 24시간에 걸려 잘린다(없어진다)
  const five = trialValueSchedule(S, S + 5 * D);
  assert.deepEqual(five.map((x) => x.step), ['d3']);
  assert.equal(trialValueStepAt({ expiresAt: S + 7 * D, startedAt: S }, S + 2 * D + H)!.step, 'd3');
  assert.equal(trialValueStepAt({ expiresAt: S + 7 * D, startedAt: S }, S + 4 * D), null, '창 사이');
  assert.equal(trialValueStepAt({ expiresAt: S + 7 * D }, S + 2 * D + H), null, '시작 시각 없는 기록은 일정 없음');
}

// ── 대상 판정 ──
const rec = (c: Partial<TrialPushRecord> = {}): TrialPushRecord => ({
  token: 't'.repeat(64), platform: 'ios', locale: 'ko', expiresAt: S + 7 * D, startedAt: S, willRenew: true, periodType: 'TRIAL', store: 'APP_STORE',
  at: S, verified: true, ...c,
});
const tok = (c: Partial<TrialValueTokenRec> = {}): TrialValueTokenRec => ({ app: 'signum', platform: 'ios', preferences: { enabled: true, morning: true, closing: true }, notifPerm: true, tz: 'UTC', ...c });
const none = { sent: () => false, recentPush: false };
const d3At = S + 2 * D + 2 * H;   // 3일째 · UTC 14시
const d6At = S + 5 * D + 2 * H;   // 6일째 · 남은 46시간
const dec = (r: TrialPushRecord | null, t: TrialValueTokenRec | null, now: number, st = none) => {
  const d = trialValueDecision(r, t, now, st);
  return d.kind === 'send' ? `send:${d.step}` : d.reason;
};
assert.equal(dec(rec(), tok(), d3At), 'send:d3');
assert.equal(dec(rec(), tok(), d6At), 'send:d6', '갱신 켬이면 6일째도 보낸다');
assert.equal(dec(rec({ willRenew: false }), tok(), d3At), 'send:d3', '갱신 끔이어도 3일째는 보낸다(D-2 와 겹치지 않음)');
assert.equal(dec(rec({ willRenew: false }), tok(), d6At), 'd2_overlap', '갱신 끔 + 남은 48시간 이하 = D-2 사실 알림 차례(같은 날 두 통 금지)');
assert.equal(dec(rec({ verified: undefined }), tok(), d3At), 'unverified', 'RC 확인 안 된 기록은 안 보낸다');
assert.equal(dec(rec({ periodType: 'NORMAL' }), tok(), d3At), 'not_trial');
assert.equal(dec(rec({ startedAt: undefined }), tok(), d3At), 'no_start');
assert.equal(dec(rec(), tok(), S + D), 'window', '1일째는 창 밖');
assert.equal(dec(null, tok(), d3At), 'invalid');
assert.equal(dec(rec(), tok(), d3At, { sent: (s) => s === 'd3', recentPush: false }), 'sent', '같은 단계는 한 번');
assert.equal(dec(rec(), tok(), d6At, { sent: (s) => s === 'd3', recentPush: false }), 'send:d6', '3일째를 보냈어도 6일째는 따로');
assert.equal(dec(rec(), tok(), d3At, { sent: () => false, recentPush: true }), 'recent_push', '20시간 안 체험 알림이 있으면 건너뜀');
assert.equal(dec(rec(), null, d3At), 'unregistered');
assert.equal(dec(rec(), tok({ app: 'wim' }), d3At), 'unregistered');
assert.equal(dec(rec(), tok({ platform: 'android' }), d3At), 'unregistered');
assert.equal(dec(rec(), tok({ preferences: { enabled: false } }), d3At), 'muted');
assert.equal(dec(rec(), tok({ preferences: { enabled: true, morning: false } }), d3At), 'muted', '3일째 = 아침 브리핑 쪽 — 아침 알림 끔이면 안 보냄');
assert.equal(dec(rec(), tok({ preferences: { enabled: true, closing: false } }), d3At), 'send:d3');
assert.equal(dec(rec(), tok({ preferences: { enabled: true, closing: false } }), d6At), 'muted', '6일째 = 장마감 쪽');
// iOS: 권한 «허용» 보고가 있어야(4.5.4) · 안드: «없음» 보고만 제외
assert.equal(dec(rec(), tok({ notifPerm: undefined }), d3At), 'no_permission', 'iOS 권한 모름 → 안 보냄');
assert.equal(dec(rec(), tok({ notifPerm: false }), d3At), 'no_permission');
assert.equal(dec(rec({ platform: 'android', store: 'PLAY_STORE' }), tok({ platform: 'android', notifPerm: undefined }), d3At), 'send:d3');
assert.equal(dec(rec({ platform: 'android', store: 'PLAY_STORE' }), tok({ platform: 'android', notifPerm: false }), d3At), 'no_permission');
assert.equal(dec(rec({ at: d3At - H }), tok(), d3At), 'recent_open', '6시간 안에 앱을 열었으면 미룸');
// 현지 시간: UTC 14시 = 서울 23시 → 조용한 시간 · 뉴욕 9시 → 보냄
assert.equal(dec(rec(), tok({ tz: 'Asia/Seoul' }), d3At), 'quiet_hours');
assert.equal(dec(rec(), tok({ tz: 'America/New_York' }), d3At), 'send:d3');
assert.equal(dec(rec({ locale: 'ko' }), tok({ tz: undefined }), d3At), 'quiet_hours', '시간대 없으면 언어로 짐작(ko → 서울)');
assert.equal(dec(rec({ locale: 'en' }), tok({ tz: 'Not/AZone' }), d3At), 'send:d3', '잘못된 시간대 → 언어 시간대(en → 뉴욕 9시)로');
assert.equal(dec(rec({ locale: 'ko' }), tok({ tz: 'Not/AZone' }), d3At), 'quiet_hours', '잘못된 시간대 → 언어 시간대(ko → 서울 23시)로');
// 1개월 코드 체험
const code = rec({ expiresAt: S + 30 * D });
assert.equal(dec(code, tok(), d3At), 'window', '코드 체험은 3일째에 보내지 않는다');
assert.equal(dec(code, tok(), S + 6 * D + 2 * H), 'send:d3', '코드 체험 7일째');
assert.equal(dec(code, tok(), S + 24 * D + 2 * H), 'send:d6', '코드 체험 만료 6~5일 전');
assert.equal(dec({ ...code, willRenew: false }, tok(), S + 24 * D + 2 * H), 'send:d6', '코드 체험 6일 전은 D-2 창(48시간)과 겹치지 않는다');
assert.equal(dec(code, tok(), S + 28 * D + 2 * H), 'window');

// ── 문구 ──
{
  const wl = tok({ watchlist: { t: ['NVDA', 'AAPL'] } });
  const c = trialValueContent('d3', 'ko', wl);
  assert.equal(c.variant, 'd3'); assert.match(c.title, /^NVDA,/);
  assert.equal(trialValueContent('d3', 'en', wl).title, 'What moved NVDA? See the AI one-liner');
  assert.match(trialValueContent('d3', 'ja', wl).title, /^NVDAの/);
  assert.equal(trialValueContent('d3', 'ko', tok()).variant, 'd3b', '내 종목 없음 → AI 브리핑');
  assert.equal(trialValueContent('d3', 'ko', tok({ watchlist: { t: ['<b>x'] } })).variant, 'd3b', '형식 틀린 종목은 쓰지 않는다');
  assert.equal(firstWatchTicker(tok({ watchlist: { t: ['BRK.B'] } })), 'BRK.B');
  assert.equal(trialValueContent('d6', 'ja', wl).variant, 'd6');
  assert.equal(trialValueContent('d6', 'xx', wl).title, 'US market close report', '모르는 언어 → 영어');
  // 금지: 가격·할인·긴급함·투자 권유·방향 예측·«옵션 앱»·이모지
  for (const step of ['d3', 'd6'] as const) for (const loc of ['ko', 'en', 'ja']) for (const t of [wl, tok()]) {
    const x = trialValueContent(step, loc, t);
    const all = `${x.title} ${x.body}`;
    assert.doesNotMatch(all, /[$₩¥€]|\d+\s*(원|円|%)|할인|무료|free|割引|無料|지금 바로|서두|마감 임박|hurry|now only|急いで|今すぐ|사세요|매수|매도|buy|sell|買い|売り|오를|내릴|급등|급락|surge|plunge|옵션|option|オプション|!|！/i, `${step}/${loc}: ${all}`);
    assert.doesNotMatch(all, /\p{Extended_Pictographic}/u, '이모지 없음');
  }
}

// ── 푸시 데이터 · 탭 목적지(닫힌 목록) ──
assert.deepEqual(trialValueData('d6'), { type: 'trial_value', v: 'd6', path: '/app-view/intel?tab=report' });
assert.equal(trialValueTapPath('d3'), '/app-view/watchlist');
assert.equal(trialValueTapPath('d3b'), TRIAL_VALUE_TAP_PATHS.d3b);
assert.equal(trialValueTapPath('https://evil.example'), null);
assert.equal(trialValueTapPath('__proto__'), null);
assert.equal(trialValueTapPath('toString'), null);
assert.equal(trialValueTapPath(undefined), null);
for (const v of Object.values(trialValueData('d3'))) assert.equal(typeof v, 'string', 'FCM 데이터는 문자열만');

// ── RC 체험 시작 시각(purchase_date) ──
{
  const now = Date.parse('2026-11-19T03:00:00Z');
  const iso = (ms: number) => new Date(ms).toISOString();
  const sub = (purchase: unknown, entPurchase?: unknown) => ({ subscriber: {
    entitlements: { pro: { product_identifier: 'com.signumhq.app.pro.monthly', expires_date: iso(now + 4 * D), ...(entPurchase ? { purchase_date: entPurchase } : {}) } },
    subscriptions: { 'com.signumhq.app.pro.monthly': { period_type: 'trial', store: 'app_store', expires_date: iso(now + 4 * D), purchase_date: purchase, unsubscribe_detected_at: null, billing_issues_detected_at: null, ownership_type: 'PURCHASED' } },
  } });
  assert.equal(trialFromSubscriber(sub(iso(now - 3 * D)), now)!.startedAt, now - 3 * D);
  assert.equal('startedAt' in trialFromSubscriber(sub(undefined), now)!, false, '시작 시각 없으면 칸을 만들지 않는다(옛 결과 그대로)');
  assert.equal('startedAt' in trialFromSubscriber(sub(iso(now + D)), now)!, false, '미래 시작은 믿지 않는다');
  assert.equal(trialFromSubscriber(sub(undefined, iso(now - 2 * D)), now)!.startedAt, now - 2 * D, '구독에 없으면 권한 purchase_date');
}

console.log('trialValuePush: schedule, targeting, copy, tap paths and RC start time passed');
