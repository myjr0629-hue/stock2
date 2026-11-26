/**
 * ★11/26 정가 페이월 블프 연간 카드(bf_pw) · 웜 카드 준비 이유(wb_why) · 블프 시트 단추 계측(cta) · 이미 PRO 의 블프 코드 성공 판정
 *   ① 카드 판정: iOS · 스위치 켜짐 · 블프 기간 · 체험 적용 플랜 없음 · 만료 페이월/웜 «다른 요금제»/미리보기 아님 · 애플 할인가 표 통화만
 *   ② 스위치: 서버 값 해석 · 클라이언트 응답 해석 · 앱 실행 중 한 번 읽기(못 읽음 = 꺼짐 + 다음에 다시)
 *   ③ 웜 이유: 조건마다 정확히 한 코드 · 대상이면 warmBfTarget 과 같은 값(규칙 무변경)
 *   ④ 배선: 페이월 카드 = 애플 적용 창(구매 호출 아님) · 기본 선택 · 고지문 · 다른 카드 누르면 예전 구매 · 시트 단추 cta · 퍼널 목록
 * 실행: npx tsx --test tests/bfPaywall1126.test.ts  (네트워크·실결제 없음)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const pw = require('../src/lib/app/bfPaywall') as typeof import('../src/lib/app/bfPaywall');
const w = require('../src/lib/app/warmBf') as typeof import('../src/lib/app/warmBf');
const schema = require('../src/lib/app/funnelSchema') as typeof import('../src/lib/app/funnelSchema');

const NOW = Date.parse('2026-11-26T03:00:00Z');
const DAY = 86_400_000;
const KR = [
  { plan: 'monthly', priceString: '₩11,900', price: 11900, currencyCode: 'KRW' },
  { plan: 'annual', priceString: '₩89,000', price: 89000, currencyCode: 'KRW' },
];
const base = { ios: true, now: NOW, switchOn: true, src: 'trial_off_early', context: false, discount: false, trialHead: false, plans: KR, locale: 'ko' };
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('① 카드: 조건이 다 맞으면 애플 할인가·정가(같은 형식)', () => {
  const c = pw.bfPaywallCard(base);
  assert.ok(c);
  assert.match(c!.offer, /44,500/);
  assert.match(c!.regular, /89,000/);
  const us = pw.bfPaywallCard({ ...base, locale: 'en', plans: [{ plan: 'annual', priceString: '$74.99', price: 74.99, currencyCode: 'USD' }] });
  assert.deepEqual(us, { regular: '$74.99', offer: '$37.49' });
  const jp = pw.bfPaywallCard({ ...base, locale: 'ja', plans: [{ plan: 'annual', priceString: '¥12,000', price: 12000, currencyCode: 'JPY' }] });
  assert.ok(jp && /6,000/.test(jp.offer));
});

test('① 카드: 하나라도 아니면 없음(예전 화면 그대로)', () => {
  assert.equal(pw.bfPaywallCard({ ...base, ios: false }), null, '안드·웹');
  assert.equal(pw.bfPaywallCard({ ...base, switchOn: false }), null, '스위치 꺼짐·못 읽음');
  assert.equal(pw.bfPaywallCard({ ...base, now: Date.parse('2026-12-02T07:00:00Z') }), null, '블프 끝(12/2 07:00 UTC)');
  assert.equal(pw.bfPaywallCard({ ...base, now: Date.parse('2026-11-20T00:00:00Z') }), null, '블프 전');
  assert.equal(pw.bfPaywallCard({ ...base, context: true }), null, '만료 1회 페이월(자체 할인 카드)');
  assert.equal(pw.bfPaywallCard({ ...base, discount: true }), null, '할인 카드가 이미 있음');
  for (const src of ['trial_expired', 'warm_bf_reg', 'preview']) assert.equal(pw.bfPaywallCard({ ...base, src }), null, src);
  // 체험 머리 화면(첫 실행·하루 첫·체험 안내)에서 체험이 적용되면 = 예전 «7일 무료» 화면 그대로
  assert.equal(pw.bfPaywallCard({ ...base, trialHead: true, plans: [KR[0], { ...KR[1], trialDays: 7 }] }), null, '연간 체험');
  assert.equal(pw.bfPaywallCard({ ...base, trialHead: true, plans: [{ ...KR[0], trialDays: 7 }, KR[1]] }), null, '월간 체험');
  // 체험 머리 화면이라도 체험이 없으면(자격 없음) 카드
  assert.ok(pw.bfPaywallCard({ ...base, trialHead: true }));
  // 그 밖의 정가 페이월은 체험이 늦게 와도 카드가 남는다(줄이 사라지며 밀리지 않게) — 기본 선택만 체험 플랜
  assert.ok(pw.bfPaywallCard({ ...base, plans: [KR[0], { ...KR[1], trialDays: 7 }] }));
  assert.equal(pw.bfDefaultSelected(null, KR), true, '체험 없음 = 블프 기본');
  assert.equal(pw.bfDefaultSelected(null, [KR[0], { ...KR[1], trialDays: 7 }]), false, '체험 적용 = 체험 플랜 기본');
  assert.equal(pw.bfDefaultSelected(true, [KR[0], { ...KR[1], trialDays: 7 }]), true, '사용자가 블프를 고름');
  assert.equal(pw.bfDefaultSelected(false, KR), false, '사용자가 다른 카드를 고름');
  assert.equal(pw.bfPaywallCard({ ...base, plans: [KR[0]] }), null, '연간 상품 없음');
  // 애플 할인가 표 밖(통화·정가 다름) = 할인가를 지어내지 않는다
  assert.equal(pw.bfPaywallCard({ ...base, plans: [{ plan: 'annual', priceString: '€79,99', price: 79.99, currencyCode: 'EUR' }] }), null, 'EUR');
  assert.equal(pw.bfPaywallCard({ ...base, plans: [{ plan: 'annual', priceString: '₩99,000', price: 99000, currencyCode: 'KRW' }] }), null, '정가가 표와 다름');
  // 평생 카드의 trialDays 는 무시(체험 없음)
  assert.ok(pw.bfPaywallCard({ ...base, plans: [...KR, { plan: 'lifetime', priceString: '₩199,000', price: 199000, currencyCode: 'KRW', trialDays: 7 }] }));
});

test('② 스위치: 서버·클라이언트 해석', () => {
  assert.equal(pw.bfPwSwitchValue({ off: null }), true);
  assert.equal(pw.bfPwSwitchValue({ off: '1' }), false);
  assert.equal(pw.bfPwSwitchValue({ off: '0' }), true);
  assert.equal(pw.bfPwSwitchValue({ env: '1', off: null }), false);
  assert.equal(pw.bfPwSwitchFrom({ on: true }), true);
  for (const j of [{ on: false }, { on: 'true' }, null, 'x', {}]) assert.equal(pw.bfPwSwitchFrom(j), false);
  assert.equal(pw.BF_PW_OFF_KEY, 'bf-pw:off');
});

test('② 스위치 읽기: 한 번 읽어 두고, 못 읽으면 꺼짐 + 다음에 다시', async () => {
  pw.resetBfPwSwitchForTest();
  let n = 0;
  const ok = (async () => { n++; return { ok: true, json: async () => ({ on: true }) }; }) as unknown as typeof fetch;
  assert.equal(pw.bfPwCachedOn(NOW), false);
  assert.equal(await pw.bfPwSwitch(ok, NOW), true);
  assert.equal(await pw.bfPwSwitch(ok, NOW + 1000), true);
  assert.equal(n, 1, '앱 실행 중 한 번');
  assert.equal(pw.bfPwCachedOn(NOW + 1000), true);
  assert.equal(pw.bfPwCachedOn(NOW + pw.BF_PW_TTL_MS + 1), false, '10분 지나면 다시 읽음');
  pw.resetBfPwSwitchForTest();
  let m = 0;
  const bad = (async () => { m++; throw new Error('net'); }) as unknown as typeof fetch;
  assert.equal(await pw.bfPwSwitch(bad, NOW), false);
  assert.equal(pw.bfPwCachedOn(NOW), false);
  assert.equal(await pw.bfPwSwitch(bad, NOW + 10), false);
  assert.equal(m, 2, '못 읽음은 남기지 않는다');
  pw.resetBfPwSwitchForTest();
  const off = (async () => ({ ok: true, json: async () => ({ on: false, reason: 'switch' }) })) as unknown as typeof fetch;
  assert.equal(await pw.bfPwSwitch(off, NOW), false);
  assert.equal(pw.bfPwCachedOn(NOW), false);
  pw.resetBfPwSwitchForTest();
  const http500 = (async () => ({ ok: false, json: async () => ({ on: true }) })) as unknown as typeof fetch;
  assert.equal(await pw.bfPwSwitch(http500, NOW), false);
  pw.resetBfPwSwitchForTest();
});

test('② 문구: 3.1.2 — 할인가·첫 1년·이후 정가·자동 갱신·해지·App Store 확인 · 카드에 12/2', () => {
  for (const loc of ['ko', 'en', 'ja']) {
    const c = pw.bfPwCopy(loc);
    const f = c.fine('OFFER', 'REG');
    assert.ok(f.includes('OFFER') && f.includes('REG'), loc);
    assert.match(f, loc === 'ko' ? /자동 갱신.*해지/s : loc === 'en' ? /renews automatically.*Cancel anytime/s : /自動更新.*解約/s);
    assert.match(f, /App Store/);
    assert.ok(c.sub('REG').includes('REG'));
    assert.match(c.sub('REG'), /12\/2|Dec 2/, '실제 코드 만료(12/2)는 카드에');
    assert.ok(c.cta('OFFER').includes('OFFER'));
  }
});

const iso = (ms: number) => new Date(ms).toISOString();
function ent(over: Record<string, unknown> = {}) {
  return { isActive: true, periodType: 'TRIAL', store: 'APP_STORE', willRenew: false, ownershipType: 'PURCHASED', expirationDate: iso(NOW + 15 * DAY), productIdentifier: 'com.signumhq.app.pro.monthly', ...over };
}
const info = (e: Record<string, unknown> | null, extra: Record<string, unknown> = {}) => ({ entitlements: { active: e ? { pro: e } : {} }, nonSubscriptionTransactions: [], allPurchasedProductIdentifiers: ['com.signumhq.app.pro.monthly'], ...extra });

test('③ 웜 이유: 조건마다 한 코드 · 대상이면 warmBfTarget 과 같다', () => {
  const t = w.warmBfWhy(info(ent()), 'ios', NOW);
  assert.deepEqual(t, w.warmBfTarget(info(ent()), 'ios', NOW));
  assert.equal(typeof t, 'object');
  const cases: [unknown, string][] = [
    [null, 'wb_noinfo'], [{}, 'wb_noinfo'],
    [info(null), 'wb_nopro'], [info(ent({ isActive: false })), 'wb_nopro'],
    [info(ent({ store: 'PLAY_STORE' })), 'wb_store'],
    [info(ent({ periodType: 'NORMAL' })), 'wb_period'], [info(ent({ periodType: 'INTRO' })), 'wb_period'],
    [info(ent({ willRenew: true })), 'wb_renew'], [info(ent({ willRenew: undefined })), 'wb_renew'],
    [info(ent({ ownershipType: 'FAMILY_SHARED' })), 'wb_family'],
    [info(ent(), { nonSubscriptionTransactions: [{}] }), 'wb_paid'],
    [info(ent(), { allPurchasedProductIdentifiers: ['com.signumhq.app.pro.lifetime'] }), 'wb_paid'],
    [info(ent({ expirationDate: iso(NOW + 45 * DAY) })), 'wb_exp'], [info(ent({ expirationDate: iso(NOW - 1) })), 'wb_exp'], [info(ent({ expirationDate: null })), 'wb_exp'],
    [info(ent({ productIdentifier: 'x.other' })), 'wb_prod'],
  ];
  for (const [i, why] of cases) {
    assert.equal(w.warmBfWhy(i as never, 'ios', NOW), why, why);
    assert.equal(w.warmBfTarget(i as never, 'ios', NOW), null, why);
  }
  assert.equal(w.warmBfWhy(info(ent()), 'android', NOW), 'wb_store');
  // 안드 판정(warmBfTargetPlay)은 그대로
  assert.ok(w.warmBfTargetPlay(info(ent({ store: 'PLAY_STORE' })), 'android', NOW));
  // 퍼널 목록에 이유 코드가 모두 있다
  for (const [, why] of cases) assert.ok((schema.FUNNEL_SRCS as readonly string[]).includes(why), why);
});

test('④ 배선: 페이월 카드 = 애플 적용 창 · 기본 선택 · 다른 카드는 예전 구매', () => {
  const src = read('src/components/app/ProPaywall.tsx');
  const branch = src.slice(src.indexOf('if (bfSelected) {'), src.indexOf('if (offerSelected) {', src.indexOf('if (bfSelected) {')));
  assert.match(branch, /openBlackFridayRedeem\('annual', 'bf_pw'\)/);
  assert.doesNotMatch(branch, /purchase\(|purchaseOffer\(|purchaseWithTrialStart/, '블프 단추는 RevenueCat 구매를 부르지 않는다');
  assert.match(branch, /trackFunnel\('cta', \{ src: 'bf_pw' \}\)/);
  assert.match(src, /useState<boolean \| null>\(null\);\s*\n\s*const bfSelected = !!bfCard && !offerSelected && bfDefaultSelected\(bfPick, plans\);/, '기본 선택');
  assert.match(src, /setBfPick\(false\); setPicked\(p\.plan\)/, '다른 카드 = 블프 해제');
  assert.match(src, /const on = !offerSelected && !bfSelected && p\.plan === selected;/);
  assert.match(src, /data-plan="annual-bf"/);
  assert.match(src, /bfSelected && bfCard \? bfc\.fine\(bfCard\.offer, bfCard\.regular\)/, '고지문');
  // 카드는 radiogroup 맨 위(만료자 할인 카드·기존 카드보다 앞) — 기존 카드 순서는 그대로
  const grp = src.indexOf('role="radiogroup"');
  assert.ok(grp > 0 && src.indexOf('data-plan="annual-bf"', grp) < src.indexOf('data-plan="monthly-offer"', grp));
  assert.ok(src.indexOf('data-plan="monthly-offer"', grp) < src.indexOf('shownPlans.map', grp));
  // 늦게 확인된 스위치는 카드를 끼우지 않는다
  assert.match(src, /Date\.now\(\) - t0 <= BF_PW_LATE_MS/);
});

test('④ 배선: 스위치 라우트·미리 읽기·시트 단추 cta·이미 PRO 성공 판정·웜 이유 계측', () => {
  const route = read('src/app/api/app/bf-pw/route.ts');
  assert.match(route, /getAuthoritativeCache<unknown>\(BF_PW_OFF_KEY\)/);
  assert.match(route, /BF_PW_OFF/);
  assert.match(read('src/components/app/BlackFridayHost.tsx'), /m\.bfPwSwitch\(\)/);
  const sheet = read('src/components/app/BlackFridaySheet.tsx');
  assert.match(sheet, /trackFunnel\('cta', \{ src: from \}\)/);
  assert.match(read('src/components/app/BlackFridayGate.tsx'), /from=\{show\.from\}/);
  const redeem = read('src/lib/app/redeem.ts');
  const bfo = redeem.slice(redeem.indexOf('export async function openBlackFridayRedeem'), redeem.indexOf('export async function openWarmBfRedeem'));
  assert.match(bfo, /warmRenewOffNow\(\)/);
  assert.match(bfo, /if \(!wasNonPro && renewOff\) armReturn\('url', src, false, true, true\);/);
  const gate = read('src/components/app/WarmBfGate.tsx');
  for (const why of ['wb_try', 'wb_off', 'wb_noprice', 'wb_ok', 'wb_late']) assert.ok(gate.includes(`trackWarmWhy('${why}')`), why);
  assert.match(gate, /if \(typeof t === 'string'\) \{ trackWarmWhy\(t\); return null; \}/);
  // 퍼널 목록
  assert.ok((schema.FUNNEL_STAGES as readonly string[]).includes('wb_why'));
  for (const s of ['bf_pw', 'wb_try', 'wb_ok', 'wb_off', 'wb_noprice', 'wb_late']) assert.ok((schema.FUNNEL_SRCS as readonly string[]).includes(s), s);
  const reader = read('scripts/mkt-funnel.js');
  assert.match(reader, /블프 결제 화면/);
  assert.match(reader, /'wb_why'/);
});
