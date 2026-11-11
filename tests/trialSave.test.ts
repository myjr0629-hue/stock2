/** Offline: npx tsx tests/trialSave.test.ts — 체험 종료 되살리기(카드 표시 규칙 · 값 줄 · D-2 푸시 규칙 · 범위) 2026-11-11 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { trialRenewalOffNotice, verifiedTrialRenewalOffNotice, localDayKey, TRIAL_OFF_WINDOW_MS } from '../src/lib/app/trialRenewalOff';
import { trialScorecard, trialWatchlistLine, trialSaveCopy, trialEndDateText, trialPushState, trialPushFingerprint, TRIAL_SCORECARD_MIN_N } from '../src/lib/app/trialSave';
import {
  sanitizeTrialReport, trialPushWanted, trialPushDecision, trialPushContent, localHourIn, validPushToken, TRIAL_PUSH_MAX_MS, TRIAL_PUSH_MIN_MS,
  TRIAL_PUSH_RECENT_OPEN_MS, TRIAL_PUSH_DATA, TRIAL_PUSH_SENT_KEY, TRIAL_PUSH_SENT_TTL_S, type TrialPushRecord,
} from '../src/lib/push/trialPush';
import { isFunnelSrc, isFunnelStage } from '../src/lib/app/funnelSchema';

const H = 3600_000, D = 86400_000;
const now = Date.parse('2026-11-11T03:00:00Z');
const base = { productIdentifier: 'com.signumhq.app.pro.monthly', isActive: true, willRenew: false, periodType: 'TRIAL', ownershipType: 'PURCHASED', store: 'APP_STORE', latestPurchaseDate: new Date(now - 28 * D).toISOString(), expirationDate: new Date(now + 2 * D).toISOString() };
const info = (c: Record<string, unknown> = {}) => ({ entitlements: { active: { pro: { ...base, ...c } } } }) as never;
const show = (c: Record<string, unknown> = {}, seen: string | null = null, day = '2026-11-11', platform = 'ios') => trialRenewalOffNotice(info(c), platform, now, seen, day);

// ── 1. 카드 표시: 마지막 3일 · 갱신 꺼짐 · 체험만 · 하루 한 번 ──
assert.equal(TRIAL_OFF_WINDOW_MS, 3 * D);
assert.ok(show(), '2일 남음 · 갱신 꺼짐 체험 → 보인다');
assert.ok(show({ expirationDate: new Date(now + 3 * D).toISOString() }), '정확히 3일 남음 → 보인다');
assert.equal(show({ expirationDate: new Date(now + 3 * D + 1).toISOString() }), null, '3일 넘게 남음 → 안 보인다');
assert.ok(show({ expirationDate: new Date(now + 60_000).toISOString() }), '1분 남음 → 보인다');
assert.equal(show({ expirationDate: new Date(now).toISOString() }), null, '이미 끝남 → 안 보인다');
assert.equal(show({ willRenew: true }), null, '갱신 켜진 체험(전환 예정) → 안 보인다');
assert.equal(show({ periodType: 'NORMAL' }), null, '유료 구독자 → 안 보인다');
assert.equal(show({ periodType: 'NORMAL', willRenew: false }), null, '유료인데 해지 예약 → 안 보인다(체험 아님)');
assert.equal(show({ periodType: 'INTRO' }), null, '할인 도입가 → 안 보인다');
assert.equal(show({ expirationDate: null, periodType: 'NORMAL', productIdentifier: 'com.signumhq.app.pro.lifetime' }), null, '평생 → 안 보인다');
assert.equal(show({ isActive: false }), null);
assert.equal(show({ ownershipType: 'FAMILY_SHARED' }), null, '가족 공유 → 안 보인다');
assert.equal(trialRenewalOffNotice({ entitlements: { active: {} } } as never, 'ios', now, null), null, '무료 사용자(권한 없음) → 안 보인다');
assert.equal(trialRenewalOffNotice(null, 'ios', now, null), null);
assert.equal(show({}, null, '2026-11-11', 'android'), null, '애플 체험을 안드에서 → 안 보인다');
assert.ok(show({ store: 'PLAY_STORE' }, null, '2026-11-11', 'android'));
// 하루 한 번
const first = show()!;
assert.equal(first.mark, `${first.period}|2026-11-11`);
assert.equal(show({}, first.mark, '2026-11-11'), null, '같은 날 두 번째 → 안 보인다');
assert.ok(show({}, first.mark, '2026-11-12'), '다음 날 → 다시 보인다');
const nextDay = show({}, first.mark, '2026-11-12')!;
assert.equal(show({}, nextDay.mark, '2026-11-12'), null);
// 새 체험(기간이 다르면) → 같은 날이어도 보인다
assert.ok(show({ latestPurchaseDate: new Date(now - 27 * D).toISOString() }, first.mark, '2026-11-11'));
// 이중 읽기(검증)도 같은 하루 규칙
assert.ok(verifiedTrialRenewalOffNotice(info(), info(), 'ios', now, null, '2026-11-11'));
assert.equal(verifiedTrialRenewalOffNotice(info(), info(), 'ios', now, first.mark, '2026-11-11'), null);
assert.equal(verifiedTrialRenewalOffNotice(info(), info({ willRenew: true }), 'ios', now, null, '2026-11-11'), null, '두 번째 읽기에서 갱신을 켰다 → 안 보인다');
assert.match(localDayKey(now), /^\d{4}-\d{2}-\d{2}$/);

// ── 2. 값 줄(실제 숫자만) ──
const week = '2026-11-09', prevWeek = '2026-11-02';
const card = (w: string, n: number, within: number) => ({ week: w, summary: { n, withinCount: within } });
const reader = (m: Record<string, unknown>) => async (w: string) => { if (!(w in m)) throw new Error('404'); return m[w]; };
async function values() {
  assert.deepEqual(await trialScorecard(reader({ [week]: card(week, 12, 9) }), week), { n: 12, within: 9, previous: false });
  assert.deepEqual(await trialScorecard(reader({ [week]: card(week, 2, 1), [prevWeek]: card(prevWeek, 27, 18) }), week), { n: 27, within: 18, previous: true }, '이번 주가 작으면 지난주');
  assert.deepEqual(await trialScorecard(reader({ [week]: card(week, 2, 1) }), week), { n: 2, within: 1, previous: false }, '지난주를 못 읽으면 이번 주');
  assert.deepEqual(await trialScorecard(reader({ [week]: card(week, 0, 0), [prevWeek]: card(prevWeek, 27, 18) }), week), { n: 27, within: 18, previous: true });
  assert.equal(await trialScorecard(reader({}), week), null, '둘 다 실패 → 줄 없음');
  assert.equal(await trialScorecard(reader({ [week]: { week, summary: { n: 3, withinCount: 9 } } }), week), null, '이상한 값 → 줄 없음');
  assert.equal(await trialScorecard(reader({ [week]: card('2026-10-26', 30, 20) }), week), null, '주가 다른 응답 → 줄 없음');
  assert.ok(TRIAL_SCORECARD_MIN_N >= 5);
}
for (const loc of ['ko', 'en', 'ja']) {
  const c = trialSaveCopy(loc);
  assert.match(trialWatchlistLine(12, loc), /12/); assert.match(trialWatchlistLine(12, loc), /5/);
  assert.match(trialWatchlistLine(3, loc), /3/); assert.match(trialWatchlistLine(3, loc), /100/);
  assert.equal(trialWatchlistLine(0, loc), c.watchlistNone);
  assert.match(c.scorecard({ n: 27, within: 18, previous: true }), /27/);
  assert.match(c.scorecard({ n: 27, within: 18, previous: true }), /18/);
  const all = [c.title('X'), c.lede, c.seen, c.keep, c.unlocked, c.cta, c.manage, c.later, c.watchlistNone].join(' ');
  // 가짜 긴급함·과장·투자 권유 낱말 없음
  assert.doesNotMatch(all, /마지막 기회|서두르|지금 바로|놓치|한정|수익|매수|매도|hurry|last chance|don.t miss|limited|profit|buy now|急いで|最後のチャンス|今すぐ|見逃|利益/i, loc);
  // 가격은 카드에 쓰지 않는다(페이월이 스토어 문자열로)
  assert.doesNotMatch(all, /[₩$¥]\s?\d/);
}
assert.match(trialEndDateText(Date.parse('2026-11-13T12:00:00Z'), 'ko', 'Asia/Seoul'), /11월 13일/);
assert.match(trialEndDateText(Date.parse('2026-11-13T12:00:00Z'), 'ja', 'Asia/Tokyo'), /11月13日/);
assert.match(trialEndDateText(Date.parse('2026-11-13T12:00:00Z'), 'en', 'America/New_York'), /Nov 13/);
assert.match(trialEndDateText(Date.parse('2026-11-13T12:00:00Z'), 'en', 'Bad/Zone'), /Nov/);

// ── 3. 기기 → 서버 보고(체험만) ──
assert.deepEqual(trialPushState(info(), now), { expiresAt: now + 2 * D, willRenew: false, periodType: 'TRIAL', store: 'APP_STORE' });
assert.equal(trialPushState(info({ willRenew: true }), now)?.willRenew, true, '갱신 켬도 보고(서버가 대상에서 뺀다)');
assert.equal(trialPushState(info({ periodType: 'NORMAL' }), now), null, '유료는 보고 안 함');
assert.equal(trialPushState(info({ expirationDate: null }), now), null);
assert.equal(trialPushState({ entitlements: { active: {} } } as never, now), null);
const st = trialPushState(info(), now)!;
assert.equal(trialPushFingerprint(st, 'tok', '2026-11-11'), trialPushFingerprint(st, 'tok', '2026-11-11'));
assert.notEqual(trialPushFingerprint(st, 'tok', '2026-11-11'), trialPushFingerprint(st, 'tok', '2026-11-12'));
assert.notEqual(trialPushFingerprint(st, 'tok', '2026-11-11'), trialPushFingerprint({ ...st, willRenew: true }, 'tok', '2026-11-11'));

// ── 4. 서버: 보고 검사 · 대상 · 발송 판정 ──
const tok = 'f'.repeat(64);
const body = { token: tok, platform: 'ios', locale: 'ko', expiresAt: now + 40 * H, willRenew: false, periodType: 'TRIAL', store: 'APP_STORE' };
const rec = sanitizeTrialReport(body, now)!;
assert.ok(rec && trialPushWanted(rec));
assert.equal(rec.at, now);
for (const bad of [{ token: '' }, { token: 'a b' }, { token: 'x'.repeat(600) }, { platform: 'web' }, { expiresAt: now - 1 }, { expiresAt: now + 41 * D },
  { expiresAt: '1' }, { willRenew: 'no' }, { periodType: 'WHATEVER' }]) {
  assert.equal(sanitizeTrialReport({ ...body, ...bad }, now), null, JSON.stringify(bad));
}
assert.equal(sanitizeTrialReport(null, now), null);
assert.equal(sanitizeTrialReport({ ...body, locale: 'fr' }, now)!.locale, 'en');
assert.ok(validPushToken(tok)); assert.ok(validPushToken('dAbc:APA91b_x-y.z')); assert.equal(validPushToken('a b'), false); assert.equal(validPushToken(''), false);
// «보냄» 표식은 토큰당 25일(만료일을 바꿔 보고해도 다시 안 간다 — 남용 차단 · 1개월 체험은 25일 안에 두 번 없다)
assert.equal(TRIAL_PUSH_SENT_KEY(tok), `push:trial:sent:${tok}`);
assert.ok(TRIAL_PUSH_SENT_TTL_S >= 20 * 86400 && TRIAL_PUSH_SENT_TTL_S < 30 * 86400);
assert.equal(trialPushWanted(sanitizeTrialReport({ ...body, willRenew: true }, now)!), false, '갱신 켬 → 대상 아님');
assert.equal(trialPushWanted(sanitizeTrialReport({ ...body, periodType: 'NORMAL' }, now)!), false, '유료 → 대상 아님');

// 발송 판정 — 서울 오후 3시(06:00Z) 기준
const t = Date.parse('2026-11-11T06:00:00Z');
const R = (c: Partial<TrialPushRecord> = {}): TrialPushRecord => ({ token: tok, platform: 'ios', locale: 'ko', expiresAt: t + 40 * H, willRenew: false, periodType: 'TRIAL', store: 'APP_STORE', at: t - 10 * H, ...c });
const tr = { app: 'signum', preferences: { enabled: true }, notifPerm: true, tz: 'Asia/Seoul' };
assert.equal(trialPushDecision(R(), tr, t), 'send');
assert.equal(trialPushDecision(R({ expiresAt: t + TRIAL_PUSH_MAX_MS }), tr, t), 'send', '정확히 48시간 → 보낸다');
assert.equal(trialPushDecision(R({ expiresAt: t + TRIAL_PUSH_MAX_MS + 1 }), tr, t), 'window', '48시간 넘게 → 아직');
assert.equal(trialPushDecision(R({ expiresAt: t + TRIAL_PUSH_MIN_MS }), tr, t), 'window', '12시간 이하 → 안 보낸다');
assert.equal(trialPushDecision(R({ willRenew: true }), tr, t), 'renewing');
assert.equal(trialPushDecision(R({ periodType: 'NORMAL' }), tr, t), 'renewing', '유료 → 안 보낸다');
assert.equal(trialPushDecision(R(), tr, t, true), 'sent', '토큰당 한 번(보냄 표식이 있으면)');
assert.equal(trialPushDecision(R(), null, t), 'unregistered');
assert.equal(trialPushDecision(R(), { ...tr, app: 'wim' }, t), 'unregistered');
assert.equal(trialPushDecision(R(), { ...tr, preferences: { enabled: false } }, t), 'muted', '알림 전체 끔 → 안 보낸다');
assert.equal(trialPushDecision(R(), { ...tr, notifPerm: false }, t), 'no_permission');
assert.equal(trialPushDecision(R({ at: t - TRIAL_PUSH_RECENT_OPEN_MS + 1 }), tr, t), 'recent_open', '방금 앱을 열었다(카드를 봤다)');
assert.equal(trialPushDecision(R(), { ...tr, tz: 'America/New_York' }, t), 'quiet_hours', '뉴욕 새벽 1시 → 다음 회차');
assert.equal(trialPushDecision(R({ locale: 'en' }), { app: 'signum' }, Date.parse('2026-11-11T15:00:00Z')), 'send', '시간대 없음 → 언어로 짐작(뉴욕 10시)');
assert.equal(trialPushDecision(null, tr, t), 'invalid');
assert.equal(localHourIn(t, 'Asia/Seoul'), 15);
assert.equal(localHourIn(t, 'Nope/Zone'), null);
for (const loc of ['ko', 'en', 'ja'] as const) {
  const c = trialPushContent({ locale: loc, expiresAt: Date.parse('2026-11-13T05:00:00Z') }, 'Asia/Seoul');
  assert.ok(c.title.length > 5 && c.body.length > 10);
  assert.doesNotMatch(c.title + c.body, /[₩$¥]\s?\d|마지막 기회|서두르|hurry|last chance|急いで/i);
}
assert.match(trialPushContent({ locale: 'ko', expiresAt: Date.parse('2026-11-13T05:00:00Z') }, 'Asia/Seoul').title, /11월 13일/);
assert.equal(TRIAL_PUSH_DATA.type, 'trial_end');

// ── 5. 계측·범위 ──
assert.ok(isFunnelStage('trial_off_plans'));
assert.ok(isFunnelSrc('push_trial'));
assert.ok(isFunnelSrc('trial_off'));
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: { path: string; schedule: string }[] };
assert.deepEqual(vercel.crons.filter((c) => c.path === '/api/cron/trial-push'), [{ path: '/api/cron/trial-push', schedule: '17 * * * *' }]);
// keepOpenWhilePro(체험 중에도 열린 채)는 체험 종료 안내의 페이월만 넘긴다 — 다른 페이월 호출부는 예전처럼 PRO 면 즉시 닫힌다
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : []; });
const users = walk('src').filter((f) => /keepOpenWhilePro/.test(readFileSync(f, 'utf8')));
assert.deepEqual(users.sort(), ['src/components/app/ProPaywall.tsx', 'src/components/app/TrialSavePaywall.tsx']);
const paywall = readFileSync('src/components/app/ProPaywall.tsx', 'utf8');
assert.match(paywall, /if \(isPro && !keepOpenWhilePro\) onClose\(\)/);
assert.match(paywall, /keepOpenWhilePro = false/);

// 관문 11110911 대응 — 소스 수준 확인
const cron = readFileSync('src/app/api/cron/trial-push/route.ts', 'utf8');
assert.match(cron, /TRIAL_PUSH_SENT_KEY\(token\), String\(rec\.expiresAt\), \{ nx: true, ex: TRIAL_PUSH_SENT_TTL_S \}/, '보내기 전에 자리(SET NX)를 잡는다');
assert.doesNotMatch(cron, /redis\.set\(TRIAL_PUSH_KEY/, '크론은 체험 기록을 덮어쓰지 않는다(앱의 갱신 켬 보고를 지우지 않게)');
assert.match(cron, /const fresh = parseRecord<TrialPushRecord>\(await redis\.get\(TRIAL_PUSH_KEY\(token\)\)\)/, '보내기 직전 재확인');
assert.match(cron, /TRIAL_PUSH_MAX_PER_RUN/);
const reportRoute = readFileSync('src/app/api/push/trial/route.ts', 'utf8');
assert.match(reportRoute, /body\.clear === true/, '유료·평생 전환 → 해제');
assert.match(reportRoute, /stored: false, skipped: 'unknown-token' \}, 202/, '토큰 등록 전 보고는 stored:false');
assert.match(reportRoute, /nx: true, ex: 5/, '토큰당 호출 제한');
const reporter = readFileSync('src/lib/app/trialPushReport.ts', 'utf8');
assert.match(reporter, /j\?\.stored === true/, '서버가 저장했을 때만 «보냈음» 기록');
assert.match(reporter, /clear: true/);
assert.match(readFileSync('src/lib/app/proEntitlement.ts', 'utf8'), /addCustomerInfoUpdateListener\(\(info\) => \{ applyReal\(isProFromCustomerInfo\(info\)\); reportTrial\(info\); \}\)/, '구매·복원 직후 보고');

values().then(() => console.log('trialSave: visibility, value lines, push report/decision and scope passed'));
