/** Offline: npx tsx tests/trialKeepBf1127.test.ts — 갱신 끈 체험 안내 «블프 이어가기»(2026-11-27) 경계 전수 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trialRenewalOffNotice, verifiedTrialRenewalOffNotice, TRIAL_KEEP_BF_KEY, TRIAL_KEEP_BF_MAX_LEFT_MS, TRIAL_OFF_EARLY_KEY, TRIAL_OFF_STORAGE_KEY, TRIAL_OFF_WINDOW_MS } from '../src/lib/app/trialRenewalOff';
import { trialSaveCopy } from '../src/lib/app/trialSave';
import { isFunnelSrc, isFunnelStage } from '../src/lib/app/funnelSchema';
import { warmBfWhy } from '../src/lib/app/warmBf';

const H = 3600_000, D = 86400_000;
const now = Date.parse('2026-11-27T03:00:00Z');
const start = now - 5 * D;                                   // 11/22 에 1개월 코드 체험 시작 · 그날 갱신 끔 · 조기 안내 이미 봄
const base = { productIdentifier: 'com.signumhq.app.pro.monthly', isActive: true, willRenew: false, periodType: 'TRIAL', ownershipType: 'PURCHASED', store: 'APP_STORE', latestPurchaseDate: new Date(start).toISOString(), expirationDate: new Date(start + 30 * D).toISOString() };
const info = (c: Record<string, unknown> = {}) => ({ entitlements: { active: { pro: { ...base, ...c } } } }) as never;
const period = `${start}:${start + 30 * D}`;
const earlySeen = `${period}|2026-11-22`;
type Opt = { seen?: string | null; early?: string | null; bf?: string | null | undefined; day?: string; at?: number; c?: Record<string, unknown>; platform?: string; noBf?: boolean };
const show = ({ seen = null, early = earlySeen, bf = null, day = '2026-11-27', at = now, c = {}, platform = 'ios', noBf = false }: Opt = {}) =>
  trialRenewalOffNotice(info(c), platform, at, seen, day, noBf ? { early } : { early, bf });

assert.ok(new Set([TRIAL_KEEP_BF_KEY, TRIAL_OFF_EARLY_KEY, TRIAL_OFF_STORAGE_KEY]).size === 3, '세 표식은 서로 다른 키');
assert.equal(TRIAL_KEEP_BF_MAX_LEFT_MS, 40 * D, '40일 선(warmBf WARM_BF_MAX_LEFT_MS 와 같은 값)');

// ── 1. 블프를 안 넘기면(블프 기간 밖·안드) 예전 그대로 ──
assert.equal(show({ noBf: true }), null, '조기 안내 이미 봄 + 블프 없음 → 없음(예전 그대로)');
assert.equal(show({ early: null, noBf: true })?.kind, 'early', '조기 안내 안 봄 → 조기 안내(예전 그대로)');

// ── 2. 블프 이어가기 1회 ──
const k = show();
assert.ok(k, '조기 안내를 본 체험자 · 블프 기간 → 한 번 더');
assert.equal(k.kind, 'bf');
assert.equal(k.mark, `${period}|2026-11-27`);
assert.equal(show({ bf: k.mark }), null, '같은 날 다시 → 없음');
assert.equal(show({ bf: k.mark, day: '2026-11-28', at: now + D }), null, '다음 날도 없음(체험 기간당 한 번)');
assert.equal(show({ early: null })?.kind, 'early', '조기 안내를 아직 안 봤으면 조기 안내가 먼저(블프 이어가기 아님)');
assert.equal(show({ early: `${period}|2026-11-27` }), null, '오늘 조기 안내를 봤으면 블프 이어가기는 내일');
assert.equal(show({ early: `${period}|2026-11-27`, day: '2026-11-28', at: now + D })?.kind, 'bf', '…내일은 보인다');
assert.equal(show({ seen: `${period}|2026-11-27` }), null, '오늘 D-3 시트를 봤으면 없음');
assert.equal(show({ early: null, bf: `${period}|2026-11-27` }), null, '오늘 블프 줄을 본 날엔 조기 안내도 내일');
assert.equal(show({ bf: `other:period|2026-11-20` })?.kind, 'bf', '다른 체험 기간 표식은 무관');

// ── 3. 1년 무료 이용권(끝나는 날 40일 밖)은 없음 · 40일 안은 됨 ──
const yr = { latestPurchaseDate: new Date(start).toISOString(), expirationDate: new Date(start + 365 * D).toISOString() };
const yrPeriod = `${start}:${start + 365 * D}`;
assert.equal(show({ c: yr, early: `${yrPeriod}|2026-11-22` }), null, '1년 무료(AppHunt 연간) → 블프 이어가기 없음');
assert.equal(show({ c: yr, early: null })?.kind, 'early', '1년 무료도 조기 안내는 예전 그대로');
const edge = { expirationDate: new Date(now + 40 * D).toISOString() };
assert.equal(show({ c: edge, early: `${start}:${now + 40 * D}|2026-11-22` })?.kind, 'bf', '정확히 40일 → 됨');
const over = { expirationDate: new Date(now + 40 * D + 1).toISOString() };
assert.equal(show({ c: over, early: `${start}:${now + 40 * D + 1}|2026-11-22` }), null, '40일 + 1ms → 없음');

// ── 4. 갱신 켬·유료·가족 공유·다른 스토어 = 없음(예전 규칙 그대로) ──
assert.equal(show({ c: { willRenew: true } }), null, '갱신 켬 → 없음');
assert.equal(show({ c: { periodType: 'NORMAL' } }), null, '유료 → 없음');
assert.equal(show({ c: { ownershipType: 'FAMILY_SHARED' } }), null, '가족 공유 → 없음');
assert.equal(show({ c: { store: 'PLAY_STORE' } }), null, 'iOS 에서 Play 권한 → 없음');

// ── 5. D-3 창: 블프 줄을 본 날엔 하루 쉼 · 다음 날 보임 ──
const wStart = now - 28 * D;
const w = { latestPurchaseDate: new Date(wStart).toISOString(), expirationDate: new Date(wStart + 30 * D).toISOString() };
const wPeriod = `${wStart}:${wStart + 30 * D}`;
assert.ok(wStart + 30 * D - now <= TRIAL_OFF_WINDOW_MS);
assert.equal(show({ c: w, early: `${wPeriod}|2026-10-30` })?.kind, 'window', 'D-3 창 → window(블프 줄은 화면이 붙인다)');
assert.equal(show({ c: w, early: `${wPeriod}|2026-10-30`, bf: `${wPeriod}|2026-11-27` }), null, '오늘 블프 줄 본 날 → D-3 도 내일');
assert.equal(show({ c: w, early: `${wPeriod}|2026-10-30`, bf: `${wPeriod}|2026-11-27`, day: '2026-11-28', at: now + 12 * H })?.kind, 'window', '…다음 날 D-3 보임');

// ── 6. 검증 읽기(두 읽기 모두 같은 종류) ──
assert.equal(verifiedTrialRenewalOffNotice(info(), info(), 'ios', now, null, '2026-11-27', { early: earlySeen, bf: null })?.kind, 'bf');
assert.equal(verifiedTrialRenewalOffNotice(info(), info({ willRenew: true }), 'ios', now, null, '2026-11-27', { early: earlySeen, bf: null }), null, '새 읽기에서 갱신 켬 → 없음');

// ── 7. 웜 대상(시트 안 블프 줄) — 1개월 코드 월간 = 월간 단추 · 1년 무료 = 대상 아님(wb_exp) ──
assert.deepEqual(warmBfWhy(info(), 'ios', now), { expiresAt: start + 30 * D, product: 'monthly' });
assert.equal(warmBfWhy(info({ ...yr, productIdentifier: 'com.signumhq.app.pro.annual' }), 'ios', now), 'wb_exp');

// ── 8. 계측 이름·문구 ──
for (const s of ['trial_off_bf', 'tk_bf', 'tk_bf_m', 'tk_u0', 'tk_u2', 'tk_u5']) assert.ok(isFunnelSrc(s), `출처 ${s}`);
assert.ok(isFunnelStage('tk_use'));
for (const l of ['ko', 'en', 'ja']) {
  const c = trialSaveCopy(l);
  assert.ok(c.usage(3).includes('3'), `${l} 사용일 줄`);
  assert.ok(c.otherPlans.length > 0, `${l} 다른 요금제 보기`);
}
assert.equal(trialSaveCopy('ko').usage(4), '체험 중 4일 SIGNUM을 열었어요');

// ── 9. 화면 배선(소스 대조) ──
const src = readFileSync(new URL('../src/components/app/TrialRenewalOffNotice.tsx', import.meta.url), 'utf8');
assert.ok(src.includes("m.loadWarm(localeRef.current, t)"), '시트 블프 줄은 검증 읽기의 대상으로 준비(고객 정보 재조회 없음)');
assert.ok(src.includes('known={warm.known ?? undefined}'), '요금제 탭 웜 카드에도 검증된 대상을 넘긴다');
assert.ok(src.includes("m.openWarmBfRedeem(plan, src)") && src.includes("'tk_bf' as const : 'tk_bf_m' as const"), '블프 단추 = 애플 오퍼 코드 창(tk_bf·tk_bf_m)');
assert.ok(src.includes('wc.fine(endDate'), '3.1.2 고지(할인 범위·정가 자동 갱신·해지·애플 창 확인)');
assert.ok(src.includes('onClick={onManage}') && src.includes('onClick={onLater}'), '구독 관리·나중에는 그대로(해지·닫기 쉬움)');
assert.ok(!/countdown|setInterval/i.test(src), '카운트다운 없음');
const gate = readFileSync(new URL('../src/components/app/WarmBfGate.tsx', import.meta.url), 'utf8');
assert.ok(gate.includes('known ?? targetNow()'), 'loadWarm 은 known 이 있으면 다시 읽지 않는다');
const fun = readFileSync(new URL('../scripts/mkt-funnel.js', import.meta.url), 'utf8');
assert.ok(fun.includes("'trial_off_bf', '갱신 끈 체험 안내 · 블프 이어가기 1회"), '판독 스크립트에 블프 이어가기 줄');

console.log('trialKeepBf1127 ok');
