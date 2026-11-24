/**
 * ★11/24 오후 안드로이드 블프 «진짜 할인»(lib/app/androidBf) — Play 개발자 결정 오퍼를 앱 안에서 산다.
 *   ① 오퍼 선택: 연간 annual:bf-annual-50 를 id·태그·단계(1년 1회 → 1년 무한)·가격·통화·정가로 정확히 · 월간은 expired-50-1m 검증 재사용
 *   ② 단추·폴백: 기기에 오퍼가 없으면 그 단추 없음 · 둘 다 없으면 빈 목록(게이트가 안 띄우거나 정가 페이월)
 *   ③ 대상: 무료(권한·구독 0) = 시트 연간+월간 · Play 체험 갱신 끔 = 웜(다른 상품만 — 같은 상품 재구매는 Play 가 «이미 소유»로 거절) · 그 밖 = 없음
 *   ④ 블프 기간·가벼운 문·단계 ⑤ 끄기 스위치('android' = 안드만 · '1' = 전부) ⑥ 고지(Play 정책) ⑦ 배선(레이아웃·결제 경로·정가 폴백·퍼널·라우트)
 * 실행: npx tsx --test tests/androidBf1124.test.ts  (네트워크·실결제 없음)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const a = require('../src/lib/app/androidBf') as typeof import('../src/lib/app/androidBf');
const w = require('../src/lib/app/warmBf') as typeof import('../src/lib/app/warmBf');
const bf = require('../src/lib/app/blackFriday') as typeof import('../src/lib/app/blackFriday');
const eo = require('../src/lib/app/expiredOffer') as typeof import('../src/lib/app/expiredOffer');

const NOW = Date.parse('2026-11-24T05:00:00Z');
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
function mem(init: Record<string, string> = {}) {
  const m = new Map<string, string>(Object.entries(init));
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
}

type Ph = { unit: string; value: number; mode: number | string; cycles?: number | null; micros: number; fmt: string; cur?: string };
const phase = (x: Ph) => ({
  billingPeriod: { unit: x.unit, value: x.value, iso8601: '' }, recurrenceMode: x.mode, billingCycleCount: x.cycles ?? null,
  price: { formatted: x.fmt, amountMicros: x.micros, currencyCode: x.cur ?? 'KRW' }, offerPaymentMode: null,
});
const YEAR_OFF: Ph = { unit: 'YEAR', value: 1, mode: 3, micros: 44_500e6, fmt: '₩44,500' };
const YEAR_FULL: Ph = { unit: 'YEAR', value: 1, mode: 1, micros: 89_000e6, fmt: '₩89,000' };
const MON_OFF: Ph = { unit: 'MONTH', value: 1, mode: 3, micros: 5_950e6, fmt: '₩5,950' };
const MON_FULL: Ph = { unit: 'MONTH', value: 1, mode: 1, micros: 11_900e6, fmt: '₩11,900' };
function opt(id: string, phases: Ph[], over: Record<string, unknown> = {}) {
  return { id, storeProductId: id, productId: '', isBasePlan: false, tags: ['rc-ignore-offer'], pricingPhases: phases.map(phase), ...over };
}
function pkg(product: 'annual' | 'monthly', options: unknown[], price?: number) {
  const id = `com.signumhq.app.pro.${product}:${product}`;
  return { identifier: `$rc_${product}`, packageType: product === 'annual' ? 'ANNUAL' : 'MONTHLY', product: { identifier: id, price: price ?? (product === 'annual' ? 89000 : 11900), priceString: '', currencyCode: 'KRW', subscriptionOptions: options } } as never;
}
const annualOpt = (phases: Ph[] = [YEAR_OFF, YEAR_FULL], over: Record<string, unknown> = {}) => opt('annual:bf-annual-50', phases, over);

test('① 연간 오퍼 선택 — id·태그·단계·가격·통화·정가가 정확할 때만', () => {
  const ok = a.pickAndroidBfAnnual(pkg('annual', [opt('annual:free-trial-7d', [YEAR_FULL]), annualOpt()]));
  assert.ok(ok);
  assert.equal(ok!.plan, 'annual');
  assert.equal(ok!.platform, 'android');
  assert.equal(ok!.priceString, '₩44,500');
  assert.equal(ok!.regularPriceString, '₩89,000');
  assert.equal(ok!.offerAmount, 44500);
  assert.equal(ok!.currency, 'KRW');
  assert.equal(ok!.pct, 50);
  assert.equal((ok!.option as unknown as { id: string }).id, 'annual:bf-annual-50', '결제에 넘기는 옵션 = 그 오퍼');
  assert.ok(a.pickAndroidBfAnnual(pkg('annual', [annualOpt([{ ...YEAR_OFF, unit: 'MONTH', value: 12 }, { ...YEAR_FULL, unit: 'MONTH', value: 12 }])])), 'MONTH·12 도 1년');
  assert.ok(a.pickAndroidBfAnnual(pkg('annual', [annualOpt([{ ...YEAR_OFF, mode: 2, cycles: 1 }, YEAR_FULL])])), '1회 할인 반복(FINITE 1) 허용');
  assert.ok(a.pickAndroidBfAnnual(pkg('annual', [annualOpt([{ ...YEAR_OFF, mode: 'NON_RECURRING' }, { ...YEAR_FULL, mode: 'INFINITE_RECURRING' }])])), '이름 문자열 모드');
  const no: Array<[string, unknown]> = [
    ['다른 오퍼 id', pkg('annual', [opt('annual:bf-annual-40', [YEAR_OFF, YEAR_FULL])])],
    ['무료 체험 옵션만', pkg('annual', [opt('annual:free-trial-7d', [YEAR_FULL])])],
    ['옵션 없음', pkg('annual', [])],
    ['태그 없음(일반 결제에 샐 수 있음)', pkg('annual', [annualOpt(undefined, { tags: [] })])],
    ['기본 요금제 표식', pkg('annual', [annualOpt(undefined, { isBasePlan: true })])],
    ['단계 3개', pkg('annual', [annualOpt([YEAR_OFF, YEAR_OFF, YEAR_FULL])])],
    ['단계 1개', pkg('annual', [annualOpt([YEAR_OFF])])],
    ['할인 1개월(연간 아님)', pkg('annual', [annualOpt([{ ...YEAR_OFF, unit: 'MONTH', value: 1 }, YEAR_FULL])])],
    ['할인 반복 2회', pkg('annual', [annualOpt([{ ...YEAR_OFF, mode: 2, cycles: 2 }, YEAR_FULL])])],
    ['정가 단계가 무한 아님', pkg('annual', [annualOpt([YEAR_OFF, { ...YEAR_FULL, mode: 3 }])])],
    ['할인가 ≥ 정가', pkg('annual', [annualOpt([{ ...YEAR_OFF, micros: 89_000e6 }, YEAR_FULL])])],
    ['할인가 0', pkg('annual', [annualOpt([{ ...YEAR_OFF, micros: 0 }, YEAR_FULL])])],
    ['통화 다름', pkg('annual', [annualOpt([{ ...YEAR_OFF, cur: 'USD' }, YEAR_FULL])])],
    ['문자열 없음', pkg('annual', [annualOpt([{ ...YEAR_OFF, fmt: '' }, YEAR_FULL])])],
    ['정가 단계 ≠ 상품 정가(고지 어긋남)', pkg('annual', [annualOpt()], 99000)],
    ['월간 상품에 붙음', pkg('monthly', [annualOpt()])],
    ['패키지 없음', null],
  ];
  for (const [why, p] of no) assert.equal(a.pickAndroidBfAnnual(p as never), null, why);
});

test('① 월간 첫 달 50% — expired-50-1m 검증(pickExpiredOffer) 재사용', () => {
  const p = pkg('monthly', [opt('monthly:free-trial-7d', [MON_FULL]), opt('monthly:expired-50-1m', [MON_OFF, MON_FULL])]);
  const m = a.pickAndroidBfMonthly(p);
  assert.ok(m);
  assert.equal(m!.plan, 'monthly');
  assert.equal(m!.priceString, '₩5,950');
  assert.equal(m!.regularPriceString, '₩11,900');
  assert.equal(m!.offerAmount, 5950);
  const e = eo.pickExpiredOffer(p, 'android');
  assert.equal((m!.option as unknown as { id: string }).id, (e as { option: { id: string } }).option.id, '같은 옵션');
  assert.equal(a.pickAndroidBfMonthly(pkg('monthly', [opt('monthly:expired-50-1m', [MON_OFF, MON_FULL], { tags: [] })])), null, '태그 없음');
  assert.equal(a.pickAndroidBfMonthly(pkg('monthly', [])), null);
  assert.equal(a.pickAndroidBfMonthly(pkg('annual', [annualOpt()])), null);
});

test('② 단추·폴백 — 상품이 허락되고 기기에 오퍼가 있는 것만 · 앞이 주 단추', () => {
  const A = a.pickAndroidBfAnnual(pkg('annual', [annualOpt()]))!;
  const M = a.pickAndroidBfMonthly(pkg('monthly', [opt('monthly:expired-50-1m', [MON_OFF, MON_FULL])]))!;
  assert.deepEqual(a.androidBfButtons(['annual', 'monthly'], { annual: A, monthly: M }).map((b) => b.plan), ['annual', 'monthly']);
  assert.deepEqual(a.androidBfButtons(['annual', 'monthly'], { annual: null, monthly: M }).map((b) => b.plan), ['monthly'], '연간 오퍼 없음 = 월간만');
  assert.deepEqual(a.androidBfButtons(['annual', 'monthly'], { annual: A, monthly: null }).map((b) => b.plan), ['annual']);
  assert.deepEqual(a.androidBfButtons(['annual', 'monthly'], { annual: null, monthly: null }), [], '둘 다 없음 = 빈 목록(안 띄움·정가 페이월)');
  assert.deepEqual(a.androidBfButtons(['monthly'], { annual: A, monthly: null }), [], '웜(월간만 허락)인데 월간 오퍼 없음');
  assert.deepEqual(a.androidBfButtons(['annual'], { annual: { ...M, plan: 'monthly' } as never, monthly: null }), [], '자리가 다른 값은 안 받음');
});

test('③ 대상 — 무료 = 시트 · Play 체험 갱신 끔 = 웜(다른 상품만) · 그 밖 = 없음', () => {
  const free = { entitlements: { active: {} }, activeSubscriptions: [], nonSubscriptionTransactions: [], allPurchasedProductIdentifiers: [] };
  assert.deepEqual(a.androidBfAudience(free, 'android', NOW), { kind: 'sheet', plans: ['annual', 'monthly'] });
  assert.equal(a.androidBfAudience({ ...free, activeSubscriptions: ['x'] }, 'android', NOW), null, '활성 구독 있음');
  assert.equal(a.androidBfAudience({ ...free, activeSubscriptions: undefined }, 'android', NOW), null, '구독 목록 모름');
  assert.equal(a.androidBfAudience(free, 'ios', NOW), null, 'iOS');
  assert.equal(a.androidBfAudience(free, 'web', NOW), null, '웹');
  assert.equal(a.androidBfAudience(null, 'android', NOW), null);
  const ent = (over: Record<string, unknown> = {}) => ({ isActive: true, periodType: 'TRIAL', store: 'PLAY_STORE', willRenew: false, ownershipType: 'PURCHASED', expirationDate: iso(NOW + 5 * DAY), productIdentifier: 'com.signumhq.app.pro.monthly:monthly', ...over });
  const infoE = (e: Record<string, unknown>) => ({ entitlements: { active: { pro: e } }, activeSubscriptions: ['com.signumhq.app.pro.monthly:monthly'], nonSubscriptionTransactions: [], allPurchasedProductIdentifiers: ['com.signumhq.app.pro.monthly:monthly'] });
  assert.deepEqual(a.androidBfAudience(infoE(ent()), 'android', NOW), { kind: 'warm', target: { expiresAt: NOW + 5 * DAY, product: 'monthly' }, plans: ['annual'] }, '월간 체험 → 연간만');
  const annualTrial = a.androidBfAudience({ ...infoE(ent({ productIdentifier: 'com.signumhq.app.pro.annual:annual' })), activeSubscriptions: ['com.signumhq.app.pro.annual:annual'] }, 'android', NOW);
  assert.deepEqual(annualTrial && annualTrial.plans, ['monthly'], '연간 체험 → 월간만');
  const no: Array<[string, Record<string, unknown>]> = [
    ['갱신 켜진 체험', ent({ willRenew: true })], ['정가 결제', ent({ periodType: 'NORMAL' })], ['소개가', ent({ periodType: 'INTRO' })],
    ['App Store', ent({ store: 'APP_STORE' })], ['프로모션', ent({ store: 'PROMOTIONAL' })], ['가족', ent({ ownershipType: 'FAMILY_SHARED' })],
    ['끝남', ent({ expirationDate: iso(NOW - 1000) })], ['41일', ent({ expirationDate: iso(NOW + 41 * DAY) })], ['모르는 상품', ent({ productIdentifier: 'x' })],
  ];
  for (const [why, e] of no) assert.equal(a.androidBfAudience(infoE(e), 'android', NOW), null, why);
  // 활성 구독이 지금 체험 상품 하나뿐일 때만(관문 11241331 ①)
  assert.equal(a.androidBfAudience({ ...infoE(ent()), activeSubscriptions: ['com.signumhq.app.pro.monthly:monthly', 'com.signumhq.app.pro.annual:annual'] }, 'android', NOW), null, '연간 유료도 활성');
  assert.equal(a.androidBfAudience({ ...infoE(ent()), activeSubscriptions: ['com.signumhq.app.pro.annual:annual'] }, 'android', NOW), null, '활성 구독이 다른 상품');
  assert.equal(a.androidBfAudience({ ...infoE(ent()), activeSubscriptions: [] }, 'android', NOW), null, '활성 구독 0(모양 이상)');
  assert.equal(a.androidBfAudience({ ...infoE(ent()), activeSubscriptions: undefined }, 'android', NOW), null, '구독 목록 모름');
  // 줄 폴백 금지 판정
  assert.equal(a.androidBfOwnsSub(free), false);
  assert.equal(a.androidBfOwnsSub(infoE(ent())), true);
  assert.equal(a.androidBfOwnsSub({ ...free, activeSubscriptions: ['x'] }), true);
  assert.equal(a.androidBfOwnsSub(null), false);
  // warmBf iOS 판정은 그대로(안드로이드 = null)
  assert.equal(w.warmBfTarget(infoE(ent()), 'android', NOW), null);
  assert.equal(w.warmBfTarget(infoE(ent({ store: 'APP_STORE' })), 'ios', NOW)?.product, 'monthly');
  assert.equal(w.warmBfTargetPlay(infoE(ent({ store: 'APP_STORE' })), 'android', NOW), null);
  assert.equal(w.warmBfTargetPlay(infoE(ent()), 'ios', NOW), null);
});

test('④ 블프 기간·가벼운 문·단계', () => {
  const base = { android: true, onboardedAtStart: true, store: mem(), now: NOW };
  assert.equal(a.androidBfPreGate(base), true);
  assert.equal(a.androidBfPreGate({ ...base, now: bf.BF_VALID_UNTIL }), false, '기간 끝(12/2 07:00 UTC)');
  assert.equal(a.androidBfPreGate({ ...base, now: bf.BF_VALID_FROM - 1 }), false, '기간 전');
  assert.equal(a.androidBfPreGate({ ...base, android: false }), false, 'iOS·웹');
  assert.equal(a.androidBfPreGate({ ...base, onboardedAtStart: false }), false, '첫 실행 직후');
  assert.equal(a.androidBfPreGate({ ...base, store: null }), false);
  const seen = mem({ [bf.BF_SEEN_KEY]: String(NOW - DAY) });
  assert.equal(a.androidBfPreGate({ ...base, store: seen }), true, '시트 봤어도 웜 차례면 판정(웜 대상인지 확인)');
  seen.m.set(w.WARM_BF_KEY, w.warmDay(NOW));
  assert.equal(a.androidBfPreGate({ ...base, store: seen }), false, '시트 봄 + 오늘 웜 봄');
  const st = { live: true, sheetSeen: false, warmDue: true, bfToday: false, routeOk: true, otherToday: false, dailyToday: false, dialogOpen: false, visible: true, gateFlow: false, pending: false, redeemBusy: false, osBusy: false };
  assert.equal(a.androidBfStep(st), 'check');
  assert.equal(a.androidBfStep({ ...st, live: false }), 'stop', '기간 밖');
  assert.equal(a.androidBfStep({ ...st, sheetSeen: true, warmDue: false }), 'stop');
  assert.equal(a.androidBfStep({ ...st, sheetSeen: true }), 'check');
  for (const k of ['otherToday', 'dailyToday', 'dialogOpen', 'gateFlow', 'pending', 'redeemBusy', 'osBusy'] as const) assert.equal(a.androidBfStep({ ...st, [k]: true }), 'later', k);
  assert.equal(a.androidBfStep({ ...st, visible: false }), 'later');
  assert.equal(a.androidBfStep({ ...st, routeOk: false }), 'later');
  assert.equal(a.androidBfAutoOk('sheet', { sheetSeen: true, warmDue: true, bfToday: false }), false, '시트는 기기당 1회');
  assert.equal(a.androidBfAutoOk('warm', { sheetSeen: true, warmDue: true, bfToday: false }), true);
  assert.equal(a.androidBfAutoOk('warm', { sheetSeen: false, warmDue: false, bfToday: false }), false, '웜은 이틀에 한 번');
  assert.equal(a.androidBfAutoOk('warm', { sheetSeen: true, warmDue: true, bfToday: true }), false, '오늘 블프 시트를 봤으면 웜 쉼(관문 11241346 ②)');
});

test("⑤ 끄기 스위치 — warm-bf:off 'android' = 안드만 끔(iOS 웜 그대로) · '1' = 전부 · 응답에 android 없으면 꺼짐", () => {
  assert.deepEqual(w.warmSwitchValue({ off: 'android', annual: '1' }), { on: true, annual: true }, 'iOS 는 그대로');
  assert.equal(w.warmSwitchAndroid({ off: 'android' }), false);
  assert.equal(w.warmSwitchAndroid({ off: 'ANDROID ' }), false);
  assert.equal(w.warmSwitchAndroid({ off: '1' }), false);
  assert.deepEqual(w.warmSwitchValue({ off: '1', annual: null }), { on: false, annual: false });
  assert.equal(w.warmSwitchAndroid({ off: null }), true);
  assert.equal(w.warmSwitchAndroid({ off: '' }), true);
  assert.equal(w.warmSwitchAndroid({ env: 'android', off: null }), false, '환경변수도');
  assert.deepEqual(w.warmSwitchValue({ env: 'android', off: null, annual: null }), { on: true, annual: false });
  assert.equal(w.warmAndroidFrom({ on: true, annual: true, android: true }), true);
  assert.equal(w.warmAndroidFrom({ on: true, annual: true }), false, '옛 응답 = 꺼짐');
  assert.equal(w.warmAndroidFrom({ on: true, android: false }), false);
  assert.equal(w.warmAndroidFrom({ on: false, android: true }), false);
  assert.equal(w.warmAndroidFrom({ on: true, android: 'true' }), false);
  assert.equal(w.warmAndroidFrom(null), false);
  const route = read('src/app/api/app/warm-bf/route.ts');
  assert.match(route, /const android = warmSwitchAndroid\(\{ env: process\.env\.WARM_BF_OFF, off: got\[0\]\.value \}\);/);
  assert.match(route, /\{ on: true, annual: v\.annual, android \}/);
});

test('⑥ 고지(Play 정책) — 할인가·기간·이후 정가 자동 갱신·Google Play 해지 · 웜은 오늘 결제·지금 체험', () => {
  const A = a.pickAndroidBfAnnual(pkg('annual', [annualOpt()]))!;
  const M = a.pickAndroidBfMonthly(pkg('monthly', [opt('monthly:expired-50-1m', [MON_OFF, MON_FULL])]))!;
  for (const l of ['ko', 'en', 'ja'] as const) {
    const c = a.ANDROID_BF_COPY[l];
    const f = c.fine(A, M);
    for (const v of ['₩44,500', '₩89,000', '₩5,950', '₩11,900', 'Google Play']) assert.ok(f.includes(v), `${l} ${v}`);
    assert.match(f, /자동 갱신|renews automatically|自動更新/);
    assert.match(f, /해지|Cancel anytime|解約/);
    const fa = c.fine(A, null);
    assert.ok(fa.includes('₩44,500') && !fa.includes('₩5,950'), `${l} 연간만이면 월간 값 없음`);
    const fm = c.fine(null, M);
    assert.ok(fm.includes('₩5,950') && !fm.includes('₩44,500'), `${l} 월간만`);
    const wf = c.warmFine('12/1', A);
    for (const v of ['12/1', '₩44,500', '₩89,000', 'Google Play']) assert.ok(wf.includes(v), `${l} warm ${v}`);
    assert.match(wf, /오늘|today|本日/);
    assert.ok(c.warmFine('12/1', M).includes('₩5,950'));
    assert.ok(!/옵션|option|オプション/i.test(c.titleMonthly));
    assert.ok(!/3개월|3 months|3か月/.test(c.monthlyCta('₩5,950') + c.monthlySub('₩11,900', '₩5,950') + c.monthlyLede), `${l} 안드 월간은 첫 달만`);
  }
});

test('⑦ 배선 — 레이아웃 1개 · 결제는 purchaseOffer(서비스 한 곳) · 오류·오퍼 없음 = 정가 페이월 · 퍼널 · 줄', () => {
  const layout = read('src/app/[locale]/app-view/layout.tsx');
  assert.equal((layout.match(/<AndroidBfHost \/>/g) || []).length, 1);
  assert.equal((layout.match(/<BlackFridayHost \/>/g) || []).length, 1, 'iOS 블프 그대로');
  assert.equal((layout.match(/<WarmBfHost \/>/g) || []).length, 1, 'iOS 웜 그대로');
  const sheet = read('src/components/app/AndroidBfSheet.tsx');
  assert.match(sheet, /purchaseOffer\(pick, src\)/);
  assert.match(sheet, /if \(onFallback && !closedRef\.current\) \{ try \{ moved = await onFallback\(\); \} catch \{ moved = false; \} \}\n    busyRef\.current = false; setBusy\(false\);\n    if \(!moved\) setFailed\(true\);/, '오류 = 시트는 (확인 뒤) 정가 페이월 · 아니면 다시 시도 줄(죽은 단추 없음)');
  assert.match(sheet, /try \{ still = await confirm\(pick\.plan\); \} catch \{ still = 'unknown'; \}\n    if \(closedRef\.current\) \{ busyRef\.current = false; return; \}\n    if \(still === 'no' \|\| !bfLive\(Date\.now\(\)\)\) \{ busyRef\.current = false; setBusy\(false\); close\(\); return; \}/, '결제 직전 새 정보로 재확인(관문 11241339 ①)');
  assert.match(sheet, /if \(closedRef\.current\) \{ busyRef\.current = false; return; \}/, '확인 중 닫으면 결제 창 안 엶(관문 11241343)');
  assert.ok(sheet.indexOf('if (closedRef.current) { busyRef.current = false; return; }') < sheet.indexOf('await purchaseOffer(pick, src)'));
  assert.match(sheet, /useBackToClose\(true, close\);/);
  assert.match(sheet, /useLayer\(true, close, sheetRef\)/);
  assert.match(read('src/components/app/AndroidBfGate.tsx'), /if \(!viewRef\.current\) return false;/);
  assert.match(sheet, /if \(still !== 'ok'\) \{ busyRef\.current = false; setBusy\(false\); setFailed\(true\); return; \}/, '조회 실패 = 다시 시도 줄(관문 11241342)');
  assert.ok(sheet.indexOf('await confirm(pick.plan)') < sheet.indexOf('await purchaseOffer(pick, src)'));
  assert.match(sheet, /if \(ok\) \{[^\n]*\}\n    \/\/ [^\n]*\n    if \(!bfLive\(Date\.now\(\)\)\) \{ busyRef\.current = false; setBusy\(false\); close\(\); return; \}\n    if \(cancelled\)/, '결제 창 사이 블프 끝 = 닫기(관문 11241339 ②)');
  assert.ok(!/data-warm-other/.test(sheet), '안드 웜엔 «다른 요금제 보기» 없음(같은 상품 재구매 = Play 이미 소유 — 관문 11241325 ②)');
  for (const f of ['src/components/app/AndroidBfSheet.tsx', 'src/components/app/AndroidBfGate.tsx', 'src/components/app/AndroidBfHost.tsx', 'src/components/app/AndroidBfRegular.tsx', 'src/lib/app/androidBf.ts']) {
    const t = read(f);
    assert.ok(!/\.(purchaseSubscriptionOption|purchasePackage|purchaseStoreProduct)\(/.test(t), `${f} 는 SDK 결제를 직접 부르지 않는다`);
  }
  const rc = read('src/services/revenueCat.ts');
  assert.equal((rc.match(/Purchases\.purchaseSubscriptionOption\(/g) || []).length, 1, '안드 할인 결제 SDK 호출은 한 곳');
  assert.match(rc, /export async function loadAndroidBfPicks/);
  assert.match(rc, /cap\.getPlatform\(\) !== 'android'\) return null/);
  const gate = read('src/components/app/AndroidBfGate.tsx');
  assert.match(gate, /if \(!v \|\| v === 'owned'\) \{ window\.dispatchEvent\(new CustomEvent\(ANDROID_BF_LINE_HIDE_EVENT\)\); return; \}/, '줄: 못 보이면 줄만 내림 — 정가 페이월을 새로 열지 않음(관문 11241331 ② · 11241338)');
  assert.ok(!/setRegular\(\{ locale, preview: isPreview\(\) \}\)/.test(gate), '줄 경로에 정가 페이월 없음');
  assert.match(gate, /if \(window\.location\.pathname !== fromPath \|\| !lines\.some\(\(n\) => n\.isConnected\)\) return;/, '줄: 늦은 결과는 떠난 화면에 안 뜸(관문 11241339 ③)');
  assert.match(gate, /if \(!info\) return 'unknown';/);
  assert.match(gate, /return !!aud && aud\.kind === view\.kind && aud\.plans\.includes\(plan\) \? 'ok' : 'no';/);
  assert.match(gate, /confirm=\{\(plan\) => stillEligible\(view, plan\)\}/);
  assert.match(gate, /const info = await infoNow\(true\);\n      const aud = info \? androidBfAudience\(.*\) : null;\n      if \(!aud \|\| aud\.kind !== 'sheet' \|\| !alive\.current\) return false;/, '시트 오류 → 정가 페이월은 새 정보로 «지금도 무료» 확인 뒤에만');
  assert.match(gate, /if \(!buttons\.length\) \{ track\('bf_and_noopt'\); return aud\.kind === 'warm' \? 'owned' : null; \}/, '웜 오퍼 없음 = owned(정가 페이월 안 감)');
  assert.match(gate, /if \(!v \|\| v === 'owned'\) \{ run\.done = true; return; \}/);
  assert.match(gate, /if \(!aud \|\| aud\.kind !== aud0\.kind\) return info1 && androidBfOwnsSub\(info1 as Info\) \? 'owned' : null;/);
  assert.match(gate, /onFallback=\{view\.kind === 'sheet' \? \(\) => toRegular\(view\.locale, view\.preview\) : null\}/, '정가 폴백은 무료(시트)만');
  assert.match(gate, /const info1 = await infoNow\(true\);\n  const aud = info1 \? androidBfAudience\(info1 as Info, 'android', Date\.now\(\)\) : null;\n/, '시트·웜 모두 캐시 비운 새 정보로 확인(관문 11241325 ①)');
  const regular = read('src/components/app/AndroidBfRegular.tsx');
  assert.match(regular, /<ProPaywall locale=\{locale\} src="bf_and_reg"/);
  assert.ok(!/keepOpenWhilePro|TrialSavePaywall/.test(regular.replace(/^\/\/.*$/gm, '')), '체험 문구 없는 일반 페이월(관문 11241325 ③)');
  assert.match(gate, /markGateDay\(localDay\(\)\)/);
  assert.match(gate, /if \(!v\.preview\) \{ markGateDay\(localDay\(\)\); track\('bf_and_line'\); \}/, '줄로 연 시트도 게이트 하루 표식');
  assert.match(gate, /bfToday: bfSheetSeenToday\(store, now\)/);
  assert.match(gate, /osBusy: osBusyNow\(now\)/, 'OS 평점 시트·광고 중 대기(관문 11241350 ②)');
  assert.match(gate, /if \(lineBusy\.current \|\| viewRef\.current\) return;/, '줄 연속 누름 무시(관문 11241348)');
  assert.match(gate, /if \(!alive\.current \|\| seq !== lineSeq\.current \|\| viewRef\.current\) return;/);
  assert.match(gate, /const cleared = await capped\(Purchases\.invalidateCustomerInfoCache\(\)/, '캐시 비운 새 정보');
  assert.match(gate, /androidSwitchOn\(\)/);
  const line = read('src/components/app/BlackFridayLine.tsx');
  assert.match(line, /if \(bfIosHere\(\)\) \{ setShow\(true\); return; \}/, 'iOS 줄 동작 그대로');
  assert.match(line, /import\('\.\/AndroidBfGate'\)\.then\(\(m\) => m\.androidLinePlan\(\)\)/, '줄은 무료·스위치·오퍼 확인 뒤에만(관문 11241331 ③)');
  assert.match(line, /plan === 'monthly' \? ANDROID_BF_COPY\[toBfLang\(locale\)\]\.lineMonthly : c\.line/, '줄 문구 = 실제 주 단추');
  assert.match(gate, /if \(!aud \|\| aud\.kind !== 'sheet'\) return null;/, '줄은 시트(무료) 대상만');
  assert.match(gate, /androidSwitchOn\(\), infoNow\(false\)\]\);\n  if \(!on \|\| !info\) return null;/);
  const host = read('src/components/app/AndroidBfHost.tsx');
  assert.match(host, /cap\.getPlatform\?\.\(\) === 'android'/);
  const schema = require('../src/lib/app/funnelSchema') as typeof import('../src/lib/app/funnelSchema');
  const script = read('scripts/mkt-funnel.js');
  for (const s of ['bf_and', 'bf_and_line', 'bf_and_y', 'bf_and_m', 'warm_bf_and', 'warm_bf_and_y', 'warm_bf_and_m', 'bf_and_reg', 'bf_and_noopt']) {
    assert.ok(schema.isFunnelSrc(s), s);
    assert.match(script, new RegExp(`'${s}'`));
  }
  assert.match(line, /if \(!bfLive\(Date\.now\(\)\)\) \{ setShow\(false\); return; \}/, '끝난 뒤 누르면 줄을 내림(관문 11241325 ④)');
  assert.match(line, /window\.setTimeout\(\(\) => setShow\(false\), left \+ 50\)/);
  for (const l of ['ko', 'en', 'ja'] as const) assert.ok(a.ANDROID_BF_COPY[l].buyError.length > 5);
});
