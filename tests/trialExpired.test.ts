/**
 * 체험 «만료 뒤» 첫 실행 1회 페이월 (2026-11-11) — 판정 경우 전수 + 화면 연결 대조.
 *   뜨는 사람: 체험(TRIAL)이 갱신 꺼진 채 최근 만료 · 지금 PRO 아님 · 스토어=기기 · 실결제 고객(샌드박스 아님)
 *   안 뜨는 사람: 체험 중 · 유료 구독자(활성·만료 모두) · 코드 체험 중(애플 오퍼 코드·Play 프로모션) · 시험 고객(샌드박스)
 *     · 가족 공유 · 결제 문제 · 갱신 켜짐 · 오래전 만료 · 다른 스토어 · 이미 본 체험 기간 · 오늘 체험 시트를 본 날
 * 네트워크·실제 결제 없음. 실행: npx tsx --test tests/trialExpired.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { TRIAL_EXPIRED_RECENT_MS, TRIAL_EXPIRED_STORAGE_KEY, trialExpiredContext, trialExpiredCopy, trialExpiredNotice, trialUsageDays, verifiedTrialExpiredNotice } from '../src/lib/app/trialExpired';
import { TRIAL_OFF_EARLY_KEY, TRIAL_OFF_STORAGE_KEY, localDayKey, trialRenewalOffNotice } from '../src/lib/app/trialRenewalOff';
import { isFunnelSrc } from '../src/lib/app/funnelSchema';

const ROOT = path.resolve(__dirname, '..');
const H = 3600_000, D = 86400_000;
const start = Date.parse('2026-10-13T01:00:00Z');
const expiresAt = start + 30 * D;                 // 2026-11-12 01:00Z
const now = expiresAt + 5 * H;                    // 만료 5시간 뒤 첫 실행
const DAY = '2026-11-12';
const ent = { identifier: 'pro', productIdentifier: 'com.signumhq.app.pro.monthly', isActive: false, willRenew: false, periodType: 'TRIAL', ownershipType: 'PURCHASED', store: 'APP_STORE', isSandbox: false, billingIssueDetectedAt: null, unsubscribeDetectedAt: new Date(start + H).toISOString(), latestPurchaseDate: new Date(start).toISOString(), originalPurchaseDate: new Date(start).toISOString(), expirationDate: new Date(expiresAt).toISOString() };
/** 만료된 체험 고객(기본) — c 로 권한 필드를 바꾸고, active 로 활성 권한을, subs 로 활성 구독을 넣는다 */
const info = ({ c = {}, active, subs = [] as string[] }: { c?: Record<string, unknown>; active?: Record<string, unknown>; subs?: string[] } = {}) =>
  ({ entitlements: { all: { pro: { ...ent, ...c } }, active: active ? { pro: { ...ent, isActive: true, ...active } } : {} }, activeSubscriptions: subs }) as never;
type Opt = { platform?: string; at?: number; seen?: string | null; day?: string; offSeen?: string | null; early?: string | null };
const show = (i: never, { platform = 'ios', at = now, seen = null, day = DAY, offSeen = null, early = null }: Opt = {}) =>
  trialExpiredNotice(i, platform, at, seen, day, { offSeen, early });

test('뜬다: 갱신 끈 체험이 막 만료 · 첫 실행 — 기간·표식·날짜가 맞다', () => {
  const n = show(info());
  assert.ok(n);
  assert.equal(n.store, 'APP_STORE');
  assert.equal(n.startedAt, start);
  assert.equal(n.expiresAt, expiresAt);
  assert.equal(n.period, `${start}:${expiresAt}`);
  assert.equal(n.mark, `${start}:${expiresAt}|${DAY}`);
  assert.ok(show(info({ c: { store: 'PLAY_STORE' } }), { platform: 'android' }), '안드(Play) 체험 만료도 같은 규칙');
  assert.ok(show(info(), { at: expiresAt }), '만료 시각 정각');
  assert.ok(show(info(), { at: expiresAt + TRIAL_EXPIRED_RECENT_MS }), '14일 경계 안');
});

test('체험 중(활성 권한)에는 안 뜬다 — 체험 중 시트(trialRenewalOff)와 겹치지 않는다', () => {
  const trialing = info({ active: { periodType: 'TRIAL', willRenew: false } });
  assert.equal(show(trialing, { at: expiresAt - D }), null);
  assert.equal(show(trialing), null, '만료 시각이 지났어도 SDK 가 아직 활성으로 주면 안 뜬다');
  // 반대로 만료된 고객에게 체험 중 시트는 안 뜬다
  assert.equal(trialRenewalOffNotice(info(), 'ios', now, null, DAY, { early: null }), null);
});

test('유료 구독자에게는 안 뜬다 — 활성(월간·연간·평생)·체험 뒤 전환·만료된 유료', () => {
  for (const pid of ['com.signumhq.app.pro.monthly', 'com.signumhq.app.pro.annual', 'com.signumhq.app.pro.lifetime']) {
    assert.equal(show(info({ active: { periodType: 'NORMAL', willRenew: pid !== 'com.signumhq.app.pro.lifetime', productIdentifier: pid } })), null, pid);
  }
  // 체험 뒤 유료로 넘어간 사람: all.pro 가 NORMAL·활성
  assert.equal(show(info({ c: { periodType: 'NORMAL', isActive: true, willRenew: true }, active: { periodType: 'NORMAL', willRenew: true } })), null);
  // 유료였다가 만료(체험 아님) → 이 페이월 대상 아님
  assert.equal(show(info({ c: { periodType: 'NORMAL' } })), null);
  // 권한 판정이 어긋나도 활성 구독이 하나라도 있으면 안 뜬다
  assert.equal(show(info({ subs: ['com.signumhq.app.pro.monthly'] })), null);
});

test('코드 체험 중에는 안 뜬다 — 애플 오퍼 코드(TRIAL 활성)·Play 프로모션(NORMAL ₩0 활성)', () => {
  assert.equal(show(info({ active: { periodType: 'TRIAL', willRenew: true } })), null, '애플 오퍼 코드 체험 중');
  assert.equal(show(info({ c: { periodType: 'NORMAL', store: 'PLAY_STORE' }, active: { periodType: 'NORMAL', store: 'PLAY_STORE' } }), { platform: 'android' }), null, 'Play 프로모션 코드 이용 중');
  assert.equal(show(info({ c: { periodType: 'INTRO' } })), null, '도입가(INTRO) 만료는 체험이 아니다');
});

test('시험 고객(샌드박스 — TestFlight·Play 라이선스 테스터)에게는 안 뜬다', () => {
  assert.equal(show(info({ c: { isSandbox: true } })), null);
  assert.equal(show(info({ c: { isSandbox: true, store: 'PLAY_STORE' } }), { platform: 'android' }), null);
});

test('그 밖의 제외: 가족 공유 · 결제 문제 · 갱신 켜짐(결제 재시도) · 다른 스토어 · 오래전 만료 · 아직 만료 전 · 깨진 날짜', () => {
  assert.equal(show(info({ c: { ownershipType: 'FAMILY_SHARED' } })), null);
  assert.equal(show(info({ c: { billingIssueDetectedAt: new Date(expiresAt).toISOString() } })), null);
  assert.equal(show(info({ c: { willRenew: true } })), null);
  assert.equal(show(info(), { platform: 'android' }), null, '애플 체험을 안드 기기에서');
  assert.equal(show(info({ c: { store: 'PLAY_STORE' } })), null, 'Play 체험을 아이폰에서');
  assert.equal(show(info({ c: { store: 'STRIPE' } })), null);
  assert.equal(show(info(), { platform: 'web' }), null);
  assert.equal(show(info(), { at: expiresAt + TRIAL_EXPIRED_RECENT_MS + 1 }), null, '14일 넘게 지난 만료');
  assert.equal(show(info(), { at: expiresAt - 1 }), null, '만료 전');
  assert.equal(show(info({ c: { expirationDate: 'x' } })), null);
  assert.equal(show(info({ c: { latestPurchaseDate: null } })), null);
  assert.equal(show(info({ c: { expirationDate: new Date(start - D).toISOString() } }), { at: start }), null, '만료가 시작보다 앞');
  assert.equal(trialExpiredNotice(null, 'ios', now, null), null);
  assert.equal(trialExpiredNotice({ entitlements: { all: {}, active: {} } } as never, 'ios', now, null), null, '권한 이력 없음(체험한 적 없음)');
  assert.equal(show(info(), { at: Number.NaN }), null);
});

test('체험 기간당 한 번 · 오늘 체험 시트(D-3·조기)를 봤으면 내일 — 하루 1회 상한 공유', () => {
  const first = show(info())!;
  assert.equal(show(info(), { seen: first.mark }), null, '같은 날 다시 → 안 뜬다');
  assert.equal(show(info(), { seen: first.mark, day: '2026-11-13', at: now + D }), null, '다음 날에도 → 안 뜬다');
  assert.equal(show(info(), { seen: first.period }), null, '날짜 없는 표식도 기간으로 읽는다');
  assert.ok(show(info(), { seen: `${start - 60 * D}:${start - 30 * D}|2026-10-01` }), '다른(옛) 기간 표식은 막지 않는다');
  // 같은 날 D-3 시트를 봤다(만료 당일 아침 D-3 → 저녁 만료) → 오늘은 안 뜨고 내일 뜬다
  assert.equal(show(info(), { offSeen: `${start}:${expiresAt}|${DAY}` }), null);
  assert.ok(show(info(), { offSeen: `${start}:${expiresAt}|${DAY}`, day: '2026-11-13', at: now + D }));
  assert.equal(show(info(), { early: `${start}:${expiresAt}|${DAY}` }), null, '오늘 조기 안내를 봤다');
  assert.ok(show(info(), { early: `${start}:${expiresAt}|2026-10-13` }), '조기 안내는 오래전 — 막지 않는다');
  assert.ok(show(info(), { offSeen: `${start}:${expiresAt}` }), '날짜 없는 옛 D-3 표식은 «오늘»로 치지 않는다');
  assert.notEqual(TRIAL_EXPIRED_STORAGE_KEY, TRIAL_OFF_STORAGE_KEY);
  assert.notEqual(TRIAL_EXPIRED_STORAGE_KEY, TRIAL_OFF_EARLY_KEY);
});

test('검증(캐시 비운 새 읽기): 둘 다 만료일 때만 · 그새 구매·복원했으면(활성) 안 뜬다 · 기간이 다르면 안 뜬다', () => {
  assert.ok(verifiedTrialExpiredNotice(info(), info(), 'ios', now, null, DAY));
  assert.equal(verifiedTrialExpiredNotice(info(), info({ active: { periodType: 'NORMAL', willRenew: true } }), 'ios', now, null, DAY), null, '새 읽기에서 구독 중');
  assert.equal(verifiedTrialExpiredNotice(info(), info({ subs: ['com.signumhq.app.pro.annual'] }), 'ios', now, null, DAY), null);
  assert.equal(verifiedTrialExpiredNotice(info(), info({ c: { expirationDate: new Date(expiresAt + H).toISOString() } }), 'ios', now, null, DAY), null, '기간이 바뀌었다');
  assert.equal(verifiedTrialExpiredNotice(info({ active: { periodType: 'TRIAL' } }), info(), 'ios', now, null, DAY), null, '첫 읽기가 활성');
});

test('사용일: 체험 기간(현지 날짜, 양 끝 포함) 안의 서로 다른 날만 · 깨진 기록 = 0', () => {
  const a = localDayKey(start), b = localDayKey(expiresAt);
  const raw = JSON.stringify([localDayKey(start - D), a, a, localDayKey(start + 3 * D), localDayKey(start + 10 * D), b, localDayKey(expiresAt + D), 'garbage', 7]);
  assert.equal(trialUsageDays(raw, start, expiresAt), 4);
  assert.equal(trialUsageDays(null, start, expiresAt), 0);
  assert.equal(trialUsageDays('{', start, expiresAt), 0);
  assert.equal(trialUsageDays('{"a":1}', start, expiresAt), 0);
});

test('페이월 내용: 실제 값만 — 없으면 줄·묶음을 뺀다 · 내 종목 5개 초과면 «더 담을 수 없어요»', () => {
  const none = trialExpiredContext('ko', { expiresAt, usageDays: 1, watchCount: 0, score: null });
  assert.equal(none.sections.length, 1, '쓴 것 값이 없으면 «체험 동안» 묶음 자체가 없다');
  assert.equal(none.sections[0].label, '무료 플랜에서 달라지는 것');
  assert.match(none.sections[0].items[0], /내 종목은 5개까지 \(PRO 100개\)/);
  const full = trialExpiredContext('ko', { expiresAt, usageDays: 9, watchCount: 7, score: { n: 27, within: 18, previous: false } });
  assert.deepEqual(full.sections[0], { label: '체험 동안', items: ['9일 동안 SIGNUM을 열었어요', '내 종목 7개를 담았어요', '이번 주 실적 채점: 27종목 중 18종목이 발표 전 예상 변동폭 안'] });
  assert.match(full.sections[1].items[0], /담아 둔 내 종목 7개 — 무료는 5개까지라 더 담을 수 없어요/);
  assert.equal(full.cta, 'PRO 다시 시작하기');
  assert.match(full.title, /^PRO 무료 체험이 11월 12일[\s\S]*끝났어요$/);
  // 이상한 채점 값은 줄을 그리지 않는다(숫자를 지어내지 않는다)
  for (const score of [{ n: 0, within: 0, previous: false }, { n: 5, within: 6, previous: false }, { n: Number.NaN, within: 1, previous: false }]) {
    assert.equal(trialExpiredContext('ko', { expiresAt, usageDays: 0, watchCount: 0, score }).sections.length, 1);
  }
  const en = trialExpiredContext('en', { expiresAt, usageDays: 3, watchCount: 1, score: { n: 12, within: 9, previous: true } });
  assert.deepEqual(en.sections[0].items, ['You opened SIGNUM on 3 days', 'You added 1 stock to your watchlist', 'Last week’s earnings scorecard: 9 of 12 stocks moved within the expected range']);
  const ja = trialExpiredContext('ja', { expiresAt, usageDays: 2, watchCount: 6, score: null });
  assert.equal(ja.sections[0].label, '体験中に');
  assert.match(ja.sections[1].items[0], /6銘柄/);
});

test('문구: 3개 언어 모두 가격·긴급함·과장·투자 권유 낱말 없음(가격·자동 갱신 고지는 페이월이 스토어 문자열로)', () => {
  const banned = /[₩$¥]\s?\d|\d+\s?(원|円)|평생|lifetime|買い切り|지금 바로|서두르|마지막 기회|today only|hurry|last chance|急いで|今すぐ|수익|profit|利益|매수|매도|buy now|保証|보장|guarantee/i;
  for (const loc of ['ko', 'en', 'ja']) {
    const c = trialExpiredCopy(loc);
    const ctx = trialExpiredContext(loc, { expiresAt, usageDays: 5, watchCount: 8, score: { n: 20, within: 14, previous: false } });
    const all = [ctx.title, ctx.lede, ctx.cta, ...ctx.sections.flatMap((s) => [s.label, ...s.items]), c.watchLimit];
    for (const line of all) assert.doesNotMatch(line, banned, `${loc}: ${line}`);
    assert.ok(ctx.sections[1].items.length === 4, `${loc}: 잃는 것 4줄`);
  }
});

test('화면 연결: 체험 중 시트가 없을 때만 만료 판정 · 새 읽기로 재확인 · 페이월은 trial_expired 출처 · keepOpenWhilePro 없음', () => {
  const notice = fs.readFileSync(path.join(ROOT, 'src/components/app/TrialRenewalOffNotice.tsx'), 'utf8');
  assert.match(notice, /let lapsed: TrialExpiredNotice \| null = notice \? null :/);
  assert.match(notice, /verifiedTrialExpiredNotice\(snapshot\.customerInfo, fresh\.customerInfo, fresh\.platform/);
  assert.match(notice, /src="trial_expired" context=\{context\}/);
  assert.match(notice, /const marks = \{ offSeen: readSeen\(\), early: early\.early \};/);
  // 만료 페이월은 suspend(앱 뒤로 — 안드 결제 창) 때 닫히지 않는다: suspend 는 시트 view 만 걷는다
  assert.match(notice, /const suspend = \(\) => \{ suspended = true; \+\+generation; stopWaiting\?\.\(\); stopWaiting = undefined; current\.current = null; setView\(null\); \};/);
  const sheet = fs.readFileSync(path.join(ROOT, 'src/components/app/TrialSavePaywall.tsx'), 'utf8');
  assert.match(sheet, /if \(context\) return <ProPaywall locale=\{locale\} src=\{src\} onClose=\{onClose\} onNavigate=\{onNavigate\} context=\{context\} previewPlans=\{previewPlans\} \/>;/);
  assert.ok(isFunnelSrc('trial_expired'));
  const funnelScript = fs.readFileSync(path.join(ROOT, 'scripts/mkt-funnel.js'), 'utf8');
  assert.match(funnelScript, /'trial_expired'\]/);
});

test('다른 페이월 호출부는 context 를 넘기지 않는다(기존 화면 그대로)', () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.tsx$/.test(e.name)) files.push(p); } };
  walk(path.join(ROOT, 'src'));
  const users = files.filter((f) => /<ProPaywall\b[^>]*\bcontext=/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(ROOT, f));
  assert.deepEqual(users, ['src/components/app/TrialSavePaywall.tsx']);
  const pw = fs.readFileSync(path.join(ROOT, 'src/components/app/ProPaywall.tsx'), 'utf8');
  // context 가 없으면 예전 머리·혜택 목록 그대로
  assert.match(pw, /const head = context\n\s+\? \{ title: context\.title, lede: context\.lede, cta: context\.cta \}\n\s+: keepOpenWhilePro/);
  assert.match(pw, /\{context \? context\.sections\.map\(/);
});
