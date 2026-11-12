/** Offline: npx tsx tests/trialRenewalOffEarly.test.ts — «갱신 끈 직후 1회» 안내(2026-11-11) 경계 전수 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trialRenewalOffNotice, verifiedTrialRenewalOffNotice, TRIAL_OFF_WINDOW_MS, TRIAL_OFF_EARLY_KEY, TRIAL_OFF_STORAGE_KEY } from '../src/lib/app/trialRenewalOff';
import { trialSaveCopy, trialOffLede } from '../src/lib/app/trialSave';
import { scheduleTrialOffExpiry, MAX_TIMER_MS } from '../src/lib/app/trialOffLifecycle';
import { trialPushDecision, TRIAL_PUSH_MAX_MS, TRIAL_PUSH_MIN_MS, type TrialPushRecord } from '../src/lib/push/trialPush';
import { isFunnelSrc, FUNNEL_SRCS } from '../src/lib/app/funnelSchema';

const H = 3600_000, D = 86400_000;
const now = Date.parse('2026-11-11T03:00:00Z');
const start = now - 2 * H;                    // 체험 시작 2시간 뒤(Day 0)에 갱신을 껐다
const base = { productIdentifier: 'com.signumhq.app.pro.monthly', isActive: true, willRenew: false, periodType: 'TRIAL', ownershipType: 'PURCHASED', store: 'APP_STORE', latestPurchaseDate: new Date(start).toISOString(), expirationDate: new Date(start + 30 * D).toISOString() };
const info = (c: Record<string, unknown> = {}) => ({ entitlements: { active: { pro: { ...base, ...c } } } }) as never;
type Opt = { seen?: string | null; early?: string | null; day?: string; platform?: string; at?: number; c?: Record<string, unknown> };
const show = ({ seen = null, early = null, day = '2026-11-11', platform = 'ios', at = now, c = {} }: Opt = {}) =>
  trialRenewalOffNotice(info(c), platform, at, seen, day, { early });

assert.notEqual(TRIAL_OFF_EARLY_KEY, TRIAL_OFF_STORAGE_KEY, '조기 안내 표식은 D-3 표식과 따로');

// ── 1. 갱신을 끈 뒤 첫 복귀 → 한 번 ──
const first = show();
assert.ok(first, 'Day 0 갱신 끔 · 첫 복귀 → 보인다');
assert.equal(first.kind, 'early');
assert.equal(first.mark, `${first.period}|2026-11-11`);
assert.equal(first.expiresAt, start + 30 * D);
assert.equal(show({ early: first.mark }), null, '같은 날 다시 복귀 → 안 보인다');
assert.equal(show({ early: first.mark, day: '2026-11-12', at: now + D }), null, '다음 날에도 → 안 보인다(체험 기간당 한 번)');
assert.equal(show({ early: first.mark, day: '2026-12-01', at: now + 20 * D }), null, '20일 뒤에도 → 안 보인다');
assert.ok(show({ c: { store: 'PLAY_STORE' }, platform: 'android' })?.kind === 'early', '안드(Play) 체험도 같은 규칙');
assert.ok(show({ at: start + 1 }), '시작 직후(1ms)도 갱신이 꺼져 있으면 보인다');
// 정확히 3일 경계: 3일 이하 = D-3 창, 3일+1ms = 조기
assert.equal(show({ at: start + 30 * D - TRIAL_OFF_WINDOW_MS - 1 })?.kind, 'early');
assert.equal(show({ at: start + 30 * D - TRIAL_OFF_WINDOW_MS })?.kind, 'window');
// 다른 체험 기간(새 체험)의 표식은 이번 기간을 막지 않는다
assert.ok(show({ early: `${start - 60 * D}:${start - 30 * D}|2026-11-11`, day: '2026-11-12' }));
// 옛 형식(날짜 없는 값)도 기간으로 읽는다
assert.equal(show({ early: first.period }), null);
// 조기 안내 옵션을 안 넘기면(옛 호출) 창 밖은 예전처럼 안 보인다
assert.equal(trialRenewalOffNotice(info(), 'ios', now, null), null, '옵션 없는 호출 = 예전 동작(D-3 창만)');

// ── 2. D-3 시트와 같은 날 두 번 금지 ──
const winAt = start + 30 * D - TRIAL_OFF_WINDOW_MS - 30 * 60_000;   // 창 30분 전(아직 조기)
const earlyLate = show({ at: winAt, day: '2026-12-08' })!;
assert.equal(earlyLate.kind, 'early');
const inWindow = winAt + H;                                          // 같은 날 1시간 뒤 → 창 안
assert.equal(show({ at: inWindow, day: '2026-12-08', early: earlyLate.mark }), null, '오늘 조기 안내를 봤다 → 같은 날 D-3 안 보인다');
assert.equal(show({ at: inWindow + D, day: '2026-12-09', early: earlyLate.mark })?.kind, 'window', '다음 날 → D-3 보인다');
// 반대로: 오늘 D-3 시트를 봤으면(표식 날짜 = 오늘) 조기 안내 없음
assert.equal(show({ seen: `x:y|2026-11-11` }), null, '오늘 D-3 를 봤다 → 같은 날 조기 안내 없음');
assert.ok(show({ seen: `x:y|2026-11-10` }), '어제 D-3 표식 → 오늘 조기 안내 가능');
assert.ok(show({ seen: 'x:y' }), '날짜 없는 옛 D-3 표식은 «오늘»로 치지 않는다');

// ── 3. D-3 동작 그대로 — 창 안에서 옵션 유무·조기 표식 없음은 같은 결과(kind 제외) ──
const expiresAt = start + 30 * D;
for (const left of [1, 60_000, 12 * H, 2 * D, TRIAL_OFF_WINDOW_MS]) {
  const at = expiresAt - left;
  for (const day of ['2026-12-08', '2026-12-09']) {
    for (const seen of [null, `${start}:${expiresAt}|2026-12-08`, `${start}:${expiresAt}`]) {
      const before = trialRenewalOffNotice(info(), 'ios', at, seen, day);
      const after = trialRenewalOffNotice(info(), 'ios', at, seen, day, { early: null });
      const afterEarlyOld = trialRenewalOffNotice(info(), 'ios', at, seen, day, { early: `${start}:${expiresAt}|2026-11-11` });
      assert.deepEqual(after, before, `D-3 불변 left=${left} day=${day} seen=${seen}`);
      assert.deepEqual(afterEarlyOld, before, `지난날 조기 안내는 D-3 를 막지 않는다 left=${left}`);
      if (before) assert.equal(before.kind, 'window');
    }
  }
}

// ── 4. D-2 푸시(서버) 무관 ──
const tok = 'f'.repeat(64);
const t = Date.parse('2026-11-11T06:00:00Z');
const R = (c: Partial<TrialPushRecord> = {}): TrialPushRecord => ({ token: tok, platform: 'ios', locale: 'ko', expiresAt: t + 40 * H, willRenew: false, periodType: 'TRIAL', store: 'APP_STORE', at: t - 10 * H, verified: true, ...c });
const tr = { app: 'signum', preferences: { enabled: true }, notifPerm: true, tz: 'Asia/Seoul' };
assert.equal(trialPushDecision(R(), tr, t), 'send', 'D-2 그대로 발송');
assert.equal(trialPushDecision(R({ expiresAt: t + 29 * D }), tr, t), 'window', '조기 안내 대상(29일 남음)에게 푸시는 없다');
assert.equal(trialPushDecision(R({ expiresAt: t + TRIAL_PUSH_MAX_MS + 1 }), tr, t), 'window');
assert.equal(trialPushDecision(R({ expiresAt: t + TRIAL_PUSH_MIN_MS }), tr, t), 'window');
// 푸시 서버 코드는 조기 안내를 모른다 · 앱은 푸시 탭이면 D-3 «오늘 봤음»만 건너뛴다(예전 그대로)
for (const f of ['src/lib/push/trialPush.ts', 'src/app/api/cron/trial-push/route.ts', 'src/app/api/push/trial/route.ts', 'src/lib/app/trialPushReport.ts']) {
  assert.doesNotMatch(readFileSync(f, 'utf8'), /early|EARLY/, f);
}
const component = readFileSync('src/components/app/TrialRenewalOffNotice.tsx', 'utf8');
assert.match(component, /const seen = pushTapped\(\) \? null : readSeen\(\);/);
// 푸시 탭(seen=null) → 창 안이면 같은 날이어도 D-3 다시 보인다
assert.equal(show({ at: expiresAt - 40 * H, day: '2026-12-09', seen: null, early: first.mark })?.kind, 'window');

// ── 5. 제외 대상 ──
for (const [c, why] of [
  [{ willRenew: true }, '갱신 켬(전환 예정)'], [{ willRenew: null }, '갱신 값 없음'], [{ periodType: 'NORMAL' }, '유료'],
  [{ periodType: 'NORMAL', willRenew: false }, '유료 해지 예약'], [{ periodType: 'INTRO' }, '도입가'],
  [{ periodType: 'NORMAL', expirationDate: null, productIdentifier: 'com.signumhq.app.pro.lifetime' }, '평생'],
  [{ ownershipType: 'FAMILY_SHARED' }, '가족 공유'], [{ isActive: false }, '비활성'],
  [{ expirationDate: new Date(now).toISOString() }, '만료'], [{ expirationDate: new Date(now - D).toISOString() }, '만료(어제)'],
  [{ expirationDate: null }, '만료일 없음'], [{ latestPurchaseDate: null }, '시작일 없음'], [{ latestPurchaseDate: new Date(now + 1).toISOString() }, '시작이 미래'],
  [{ store: 'UNKNOWN_STORE' }, '모르는 스토어'], [{ store: 'PLAY_STORE' }, '안드 체험을 아이폰에서'],
] as const) assert.equal(show({ c: c as Record<string, unknown> }), null, why);
assert.equal(trialRenewalOffNotice({ entitlements: { active: {} } } as never, 'ios', now, null, '2026-11-11', { early: null }), null, '무료(권한 없음)');
assert.equal(trialRenewalOffNotice(null, 'ios', now, null, '2026-11-11', { early: null }), null, 'SDK 못 읽음');
assert.equal(show({ platform: 'web' }), null, '웹');
// 재검증(캐시 비운 두 번째 읽기)
const v = (fresh: Record<string, unknown>) => verifiedTrialRenewalOffNotice(info(), info(fresh), 'ios', now, null, '2026-11-11', { early: null });
assert.equal(v({})?.kind, 'early', '재검증 통과 → 보인다');
for (const c of [{ willRenew: true }, { isActive: false }, { periodType: 'NORMAL' }, { productIdentifier: 'com.signumhq.app.pro.annual' }, { expirationDate: new Date(start + 31 * D).toISOString() }, { ownershipType: 'FAMILY_SHARED' }, { expirationDate: new Date(now - 1).toISOString() }]) {
  assert.equal(v(c), null, `재검증 실패 ${JSON.stringify(c)}`);
}
// 두 읽기 사이에 창 경계를 넘으면(조기 ↔ D-3) 안 보인다
assert.equal(verifiedTrialRenewalOffNotice(info(), info({ expirationDate: new Date(now + 2 * D).toISOString() }), 'ios', now, null, '2026-11-11', { early: null }), null);
assert.equal(verifiedTrialRenewalOffNotice(info(), info(), 'ios', now, null, '2026-11-11', { early: first.mark }), null, '재검증도 한 번 규칙');
// 재검증 실패 경로(컴포넌트): 두 번째 읽기 실패 = null → 안 보인다
assert.match(component, /const fresh = await attempt\.result\.catch\(\(\) => null\);/);
assert.match(component, /notice = fresh && fresh\.platform === snapshot\.platform\s*\? verifiedTrialRenewalOffNotice\(.*, early\) : null;/);

// ── 6. 만료 타이머: 수십 일 뒤 만료도 즉시 닫히지 않는다(setTimeout 2^31 넘침) ──
const timers: Array<{ fn: () => void; ms: number }> = [];
Object.assign(globalThis, { window: { setTimeout: (fn: () => void, ms: number) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {} } });
let expired = 0;
scheduleTrialOffExpiry(Date.now() + 29 * D, () => { expired++; });
assert.equal(timers.length, 1);
assert.ok(timers[0].ms <= MAX_TIMER_MS && timers[0].ms > 0, '최대 지연 이하로 나눈다');
timers[0].fn();                                       // 24.8일 뒤 깨어남 → 아직 남았으면 다시 건다
assert.equal(expired, 0, '중간 깨어남은 만료가 아니다');
assert.equal(timers.length, 2);
scheduleTrialOffExpiry(Date.now() + 1000, () => { expired++; });
assert.ok(timers[2].ms <= 1000);
timers[2].fn();
assert.equal(expired, 1, '짧은 만료는 예전처럼 한 번에');

// ── 7. 문구(ko·en·ja): 같은 시트 + 짧은 한 줄 · 가짜 긴급함·가격 없음 ──
for (const loc of ['ko', 'en', 'ja']) {
  const c = trialSaveCopy(loc);
  assert.ok(c.earlyNote.length > 8, loc);
  assert.doesNotMatch(c.earlyNote, /마지막 기회|서두르|지금 바로|놓치|한정|곧|수익|hurry|last chance|don.t miss|limited|soon|now only|profit|急いで|最後|今すぐ|見逃|まもなく|利益/i, loc);
  assert.doesNotMatch(c.earlyNote, /[₩$¥]\s?\d|\d+\s?%/, loc);
}
assert.match(component, /\{trialOffLede\(locale, view\.kind === 'early'\)\}/);
for (const loc of ['ko', 'en', 'ja']) assert.equal(trialOffLede(loc, false), trialSaveCopy(loc).lede, `D-3 시트 문구 그대로 ${loc}`);
assert.equal(trialOffLede('ko', true), '자동 갱신이 꺼져 있어서, 끝나도 결제되지 않아요. 체험은 끝나는 날까지 지금처럼 쓸 수 있어요.');
assert.equal(trialOffLede('ja', true), '自動更新はオフのため、終了後も請求はありません。終了日までは、今と同じように体験を使えます。', '일본어는 문장 사이 띄어쓰기 없음');
assert.match(trialOffLede('en', true), /charged when it ends\. Until then/);
assert.equal(trialOffLede('fr', true), trialOffLede('en', true));

// ── 8. 계측: 조기 안내는 출처 trial_off_early 로 따로 · 기기 저장 ──
assert.ok(isFunnelSrc('trial_off_early'));
assert.ok((FUNNEL_SRCS as readonly string[]).indexOf('trial_off_early') === (FUNNEL_SRCS as readonly string[]).indexOf('trial_off') + 1);
assert.match(component, /saveSeen\(view\.mark, view\.kind\)/);
assert.match(component, /localStorage\.setItem\(TRIAL_OFF_EARLY_KEY, mark\)/);
assert.match(component, /trackFunnel\(stage, \{ src: srcOf\(active\.kind\) \}\)/);
assert.match(component, /<TrialSavePaywall locale=\{locale\} src=\{srcOf\(paywall\.kind\)\}/);
assert.match(readFileSync('src/components/app/TrialSavePaywall.tsx', 'utf8'), /src = 'trial_off'/, '기본 출처 그대로');
console.log('trialRenewalOffEarly: first return, same-day D-3, push unaffected, exclusions, timer, copy, funnel passed');
