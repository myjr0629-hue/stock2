/**
 * ★11/24 웜 블프 카드(warm_bf) — 대상 판정·단추 배치·주기·표식·겹침·스위치·전환 판정·배선.
 *   ① 대상: iOS · App Store · TRIAL · 자동 갱신 꺼짐 · 가족 공유 아님 · 40일 안 · 일회성 구매 없음 · 월간/연간 — 돈 내는 구독자(NORMAL·INTRO)·프로모션·안드 = 안 보임
 *   ② 단추: 월간 구독자 + 연간 모드 꺼짐 = 월간 블프만(월간 groupLevel 1 → 연간 = 다운그레이드라 애플이 코드 거절) · 연간 모드 켜짐 = 연간+월간 · 연간 체험 = 연간
 *   ③ 주기: 처음 · 이틀 간격 · 마지막 24시간 · 기간 밖
 *   ④ 표식·가벼운 문 ⑤ warmStep 겹침 ⑥ 스위치 ⑦ 전환 = willRenew true ⑧ 월 환산 ⑨ 배선(레이아웃·체험 종료 안내 요금제 탭·redeem·퍼널 목록)
 * 실행: npx tsx --test tests/warmBf1124.test.ts  (네트워크·실결제 없음)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const w = require('../src/lib/app/warmBf') as typeof import('../src/lib/app/warmBf');
const bf = require('../src/lib/app/blackFriday') as typeof import('../src/lib/app/blackFriday');

const NOW = Date.parse('2026-11-24T03:00:00Z');
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
function ent(over: Record<string, unknown> = {}) {
  return {
    isActive: true, periodType: 'TRIAL', store: 'APP_STORE', willRenew: false, ownershipType: 'PURCHASED',
    expirationDate: iso(NOW + 15 * DAY), productIdentifier: 'com.signumhq.app.pro.monthly', ...over,
  };
}
const info = (e: Record<string, unknown> | null, extra: Record<string, unknown> = {}) => ({ entitlements: { active: e ? { pro: e } : {} }, nonSubscriptionTransactions: [], allPurchasedProductIdentifiers: ['com.signumhq.app.pro.monthly'], ...extra });
function mem(init: Record<string, string> = {}) {
  const m = new Map<string, string>(Object.entries(init));
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
}
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('① 대상 — 코드·체험 PRO 중 자동 갱신 꺼진 App Store 사람만', () => {
  assert.deepEqual(w.warmBfTarget(info(ent()), 'ios', NOW), { expiresAt: NOW + 15 * DAY, product: 'monthly' });
  assert.equal(w.warmBfTarget(info(ent({ productIdentifier: 'com.signumhq.app.pro.annual' })), 'ios', NOW)?.product, 'annual');
  assert.equal(w.warmBfTarget(info(ent({ productIdentifier: 'com.signumhq.app.pro.monthly:base' })), 'ios', NOW)?.product, 'monthly');
  const no: Array<[string, unknown]> = [
    ['자동 갱신 켜짐', info(ent({ willRenew: true }))],
    ['willRenew 모름', info(ent({ willRenew: undefined }))],
    ['정가 결제(NORMAL)', info(ent({ periodType: 'NORMAL' }))],
    ['소개가 결제(INTRO)', info(ent({ periodType: 'INTRO' }))],
    ['프로모션 권한', info(ent({ store: 'PROMOTIONAL' }))],
    ['Play', info(ent({ store: 'PLAY_STORE' }))],
    ['가족 공유', info(ent({ ownershipType: 'FAMILY_SHARED' }))],
    ['비활성', info(ent({ isActive: false }))],
    ['이미 끝남', info(ent({ expirationDate: iso(NOW - 1000) }))],
    ['41일 남음(1년 이용권 등)', info(ent({ expirationDate: iso(NOW + 41 * DAY) }))],
    ['끝나는 날 모름', info(ent({ expirationDate: null }))],
    ['평생 구매 기록', info(ent(), { allPurchasedProductIdentifiers: ['com.signumhq.app.pro.lifetime'] })],
    ['일회성 구매 기록', info(ent(), { nonSubscriptionTransactions: [{ productIdentifier: 'x' }] })],
    ['모르는 상품', info(ent({ productIdentifier: 'com.signumhq.app.pro.year.promo' }))],
    ['PRO 없음', info(null)],
    ['정보 없음', null],
  ];
  for (const [why, i] of no) assert.equal(w.warmBfTarget(i as Parameters<typeof w.warmBfTarget>[0], 'ios', NOW), null, why);
  assert.equal(w.warmBfTarget(info(ent()), 'android', NOW), null, '안드로이드');
  assert.equal(w.warmBfTarget(info(ent()), 'web', NOW), null, '웹');
});

test('② 단추 — 애플이 받아 주는 코드만 주 단추', () => {
  assert.deepEqual(w.warmPlans('monthly', false), { primary: 'monthly', secondary: null });
  assert.deepEqual(w.warmPlans('monthly', true), { primary: 'annual', secondary: 'monthly' });
  assert.deepEqual(w.warmPlans('annual', false), { primary: 'annual', secondary: null });
  assert.deepEqual(w.warmPlans('annual', true), { primary: 'annual', secondary: null });
});

test('③ 주기 — 처음 · 이틀 간격 · 마지막 24시간 · 기간 밖', () => {
  const d = (ms: number) => w.warmDay(ms);
  assert.equal(w.warmDue(null, d(NOW), NOW), true);
  assert.equal(w.warmDue(d(NOW), d(NOW), NOW), false, '오늘 이미');
  assert.equal(w.warmDue(d(NOW - DAY), d(NOW), NOW), false, '어제 봄');
  assert.equal(w.warmDue(d(NOW - 2 * DAY), d(NOW), NOW), true, '이틀 전');
  const lastDay = bf.BF_VALID_UNTIL - 3 * 3600_000;
  assert.equal(w.warmDue(d(lastDay - DAY), d(lastDay), lastDay), true, '마지막 24시간 — 어제 봤어도');
  assert.equal(w.warmDue(d(lastDay), d(lastDay), lastDay), false, '마지막 날도 하루 한 번');
  assert.equal(w.warmDue(null, d(bf.BF_VALID_UNTIL), bf.BF_VALID_UNTIL), false, '기간 끝');
  assert.equal(w.warmDue(null, d(bf.BF_VALID_FROM - 1), bf.BF_VALID_FROM - 1), false, '기간 전');
  assert.equal(w.warmDue('garbage', d(NOW), NOW), true, '깨진 값 = 다시 차례(하루 한 번 표식은 보이기 직전에 다시 쓴다)');
});

test('④ 표식·가벼운 문', () => {
  const s = mem();
  assert.equal(w.warmShownOn(s, NOW), false);
  assert.equal(w.markWarmShown(s, NOW), true);
  assert.equal(w.warmShownOn(s, NOW), true);
  assert.equal(w.warmShownOn(s, NOW + 2 * DAY), false);
  assert.equal(w.warmPreGate({ ios: true, onboardedAtStart: true, store: mem(), now: NOW }), true);
  assert.equal(w.warmPreGate({ ios: true, onboardedAtStart: true, store: s, now: NOW }), false, '오늘 봄');
  assert.equal(w.warmPreGate({ ios: true, onboardedAtStart: true, store: s, now: NOW + 2 * DAY }), true, '이틀 뒤');
  assert.equal(w.warmPreGate({ ios: false, onboardedAtStart: true, store: mem(), now: NOW }), false, '안드·웹');
  assert.equal(w.warmPreGate({ ios: true, onboardedAtStart: false, store: mem(), now: NOW }), false, '첫 실행 직후 세션');
  assert.equal(w.warmPreGate({ ios: true, onboardedAtStart: true, store: null, now: NOW }), false, '저장소 없음');
  const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
  assert.equal(w.warmPreGate({ ios: true, onboardedAtStart: true, store: broken, now: NOW }), false, '저장소 던짐 = 모름 = 안 실음');
  assert.equal(w.markWarmShown(broken, NOW), false);
  assert.equal(w.warmShownOn(broken, NOW), false);
  // 블프 1회 시트 본 날
  assert.equal(w.bfSheetSeenToday(mem(), NOW), false);
  assert.equal(w.bfSheetSeenToday(mem({ [bf.BF_SEEN_KEY]: String(NOW - 3600_000) }), NOW), w.warmDay(NOW - 3600_000) === w.warmDay(NOW));
  assert.equal(w.bfSheetSeenToday(mem({ [bf.BF_SEEN_KEY]: String(NOW - 3 * DAY) }), NOW), false);
  assert.equal(w.bfSheetSeenToday(broken, NOW), true, '모르면 오늘 쉼');
});

test('⑤ warmStep — 같은 날·같은 순간 겹침 없음', () => {
  const base = { due: true, routeOk: true, otherToday: false, bfToday: false, dailyToday: false, dialogOpen: false, visible: true, gateFlow: false, pending: false, redeemBusy: false };
  assert.equal(w.warmStep(base), 'check');
  assert.equal(w.warmStep({ ...base, due: false }), 'stop');
  for (const k of ['otherToday', 'bfToday', 'dailyToday', 'dialogOpen', 'gateFlow', 'pending', 'redeemBusy'] as const) assert.equal(w.warmStep({ ...base, [k]: true }), 'later', k);
  assert.equal(w.warmStep({ ...base, visible: false }), 'later');
  assert.equal(w.warmStep({ ...base, routeOk: false }), 'later');
});

test('⑥ 스위치 — 모르면 꺼짐 · 연간 모드는 값 1 일 때만', () => {
  assert.deepEqual(w.warmSwitchValue({ off: null, annual: null }), { on: true, annual: false });
  assert.deepEqual(w.warmSwitchValue({ off: null, annual: '1' }), { on: true, annual: true });
  assert.deepEqual(w.warmSwitchValue({ off: '1', annual: '1' }), { on: false, annual: false });
  assert.deepEqual(w.warmSwitchValue({ env: '1', off: null, annual: null }), { on: false, annual: false });
  assert.deepEqual(w.warmSwitchValue({ env: '0', off: '', annual: 'yes' }), { on: true, annual: false });
  assert.deepEqual(w.warmSwitchFrom({ on: true, annual: true }), { on: true, annual: true });
  assert.deepEqual(w.warmSwitchFrom({ on: true }), { on: true, annual: false });
  assert.deepEqual(w.warmSwitchFrom({ on: 'true' }), { on: false, annual: false });
  assert.deepEqual(w.warmSwitchFrom(null), { on: false, annual: false });
});

test('⑦ 전환 = 돌아온 뒤 자동 갱신 켜짐(코드 PRO 는 원래 PRO — PRO 확인만으론 성공 아님)', () => {
  assert.equal(w.warmConverted(info(ent({ willRenew: true }))), true);
  assert.equal(w.warmConverted(info(ent())), false);
  assert.equal(w.warmConverted(info(ent({ willRenew: true, isActive: false }))), false);
  assert.equal(w.warmConverted(null), false);
});

test('⑧ 월 환산·할인가 숫자(애플 값이 확인된 통화만)', () => {
  assert.equal(w.warmAnnualPerMonth(44500, 'KRW', 'ko'), '₩3,708');
  assert.equal(w.warmAnnualPerMonth(6000, 'JPY', 'ja'), '￥500');
  assert.equal(w.warmAnnualPerMonth(37.49, 'USD', 'en'), '$3.12');
  assert.equal(w.warmAnnualPerMonth(30, 'EUR', 'en'), null);
  assert.equal(w.warmAnnualPerMonth(null, 'KRW', 'ko'), null);
  assert.deepEqual(bf.bfOfferAmount('annual', { price: 89000, currencyCode: 'KRW' }), { offer: 44500, currency: 'KRW' });
  assert.equal(bf.bfOfferAmount('annual', { price: 99000, currencyCode: 'KRW' }), null, '정가가 다르면 숫자 없음');
  // 3.1.2 고지: 지금 PRO 유지·애플 창에서 확인 후 결제·할인 범위·정가 자동 갱신·해지
  for (const l of ['ko', 'en', 'ja'] as const) {
    const f = w.WARM_COPY[l].fine('12/9', '₩89,000', '₩11,900');
    assert.match(f, /App Store/);
    assert.match(f, /₩89,000/); assert.match(f, /₩11,900/);
    assert.match(f, /12\/9/);
  }
});

test('⑨ 배선 — 레이아웃 1개 · 요금제 탭 → 웜 카드(블프·App Store) · redeem 전환 계측 · 퍼널 목록', () => {
  const layout = read('src/app/[locale]/app-view/layout.tsx');
  assert.equal((layout.match(/<WarmBfHost \/>/g) || []).length, 1);
  const notice = read('src/components/app/TrialRenewalOffNotice.tsx');
  assert.match(notice, /active\.store === 'APP_STORE' && bfLive\(Date\.now\(\)\)\) setWarm/);
  assert.match(notice, /onFallback=\{\(\) => \{ const w = warm; setWarm\(null\); setPaywall\(w\); \}\}/, '대상 아님·스위치 꺼짐 = 예전 정가 페이월');
  assert.match(notice, /if \(!preview && warmShownTodaySafe\(\)\) \{ notice = null; lapsed = null; \}/, '웜 카드 본 날은 체험 중 안내·만료 페이월 쉼');
  assert.match(notice, /if \(!preview && warmShownTodaySafe\(\)\) return;\n        if \(!notice && lapsed\)/, '새 읽기 뒤 다시 확인(관문 11240032 ②)');
  const redeem = read('src/lib/app/redeem.ts');
  assert.match(redeem, /armReturn\('url', src, false, true, wasOff\)/, '열기 직전 갱신 꺼짐 확인된 경우만 전환 계측(관문 11240021 ③)');
  assert.match(redeem, /if \(p\.warm\) \{ void warmRenewConfirmed\(\)/);
  assert.match(redeem, /if \(p\.warm && !p\.warmCount\) return;/, '꺼짐 확인 못 했으면 웜 경로는 code_pro 를 세지 않는다(관문 11240028 ①)');
  const gate = read('src/components/app/WarmBfGate.tsx');
  assert.match(gate, /markGateDay\(localDay\(\)\)/, '보이면 오늘 다른 페이월·안내 쉼');
  assert.match(gate, /dailyPaywallShownOn\(store, now\)/);
  assert.match(gate, /bfSheetSeenToday\(store, now\)/);
  assert.match(gate, /otherSheetToday\(store, now\)/);
  const schema = require('../src/lib/app/funnelSchema') as typeof import('../src/lib/app/funnelSchema');
  const script = read('scripts/mkt-funnel.js');
  for (const s of ['warm_bf', 'warm_bf_plans', 'warm_bf_m', 'warm_bf_pm', 'warm_bf_reg']) {
    assert.ok(schema.isFunnelSrc(s), s);
    assert.match(script, new RegExp(`'${s}'`));
  }
  const route = read('src/app/api/app/warm-bf/route.ts');
  assert.match(route, /getAuthoritativeCache/);
  assert.match(route, /on: false, reason: 'error'/);
});

test('⑩ 관문 11240021 — 선물 안내는 웜 본 날 busy · 캐시 못 비우면 안 보임 · 늦으면 정가 페이월', () => {
  const g = require('../src/lib/gift/giftAnnounce');
  const store = mem({ [g.GIFT_ANNOUNCE_KEY]: JSON.stringify({ n: 0, last: 0 }), [w.WARM_BF_KEY]: w.warmDay(NOW) });
  const input = { live: true, store, now: NOW, onboardedAtMount: true, moment: true, path: '/ko/app-view/dash', reviewAt: 0, dialogOpen: false };
  assert.equal(g.giftAnnounceBlock(input), 'busy');
  assert.equal(g.giftReannounceBlock(input), 'busy');
  store.m.set(w.WARM_BF_KEY, w.warmDay(NOW - 2 * DAY));
  assert.notEqual(g.giftAnnounceBlock(input), 'busy', '이틀 전이면 막지 않는다');
  const gate = read('src/components/app/WarmBfGate.tsx');
  assert.match(gate, /if \(cleared !== true\) return null;/);
  assert.match(gate, /plans0\.secondary && prices\[plans0\.secondary\]\.regular/, '둘째 단추는 정가 있을 때만(관문 11240028 ②)');
  assert.match(gate, /WARM_BF_OFFER_WAIT_MS\)/);
  assert.match(gate, /if \(!markWarmShown\(localStore\(\)\)\) \{ onFallback\(\); return; \}/, '요금제 탭 경로도 표식 실패 = 카드 안 보임(관문 11240036)');
  assert.equal(w.WARM_BF_OFFER_WAIT_MS <= 4000, true);
});

test('⑪ 관문 11240037 — otherSheetToday 가 웜 표식(오늘)을 읽는다 · 키 일치', () => {
  const ta = require('../src/lib/app/trialAnnounce');
  assert.equal(ta.WARM_BF_DAY_KEY, w.WARM_BF_KEY);
  assert.equal(ta.otherSheetToday(mem({ [w.WARM_BF_KEY]: w.warmDay(NOW) }), NOW), true);
  assert.equal(ta.otherSheetToday(mem({ [w.WARM_BF_KEY]: w.warmDay(NOW - DAY) }), NOW), false);
  assert.match(read('src/components/app/WarmBfGate.tsx'), /markWarmShown\(localStore\(\)\)\) \{ onFallback\(\); return; \} markGateDay\(localDay\(\)\);/);
});

test('⑫ 관문 11240040 — 열린 카드도 블프 기간이 끝나면 닫고, 단추는 기간 밖이면 코드를 열지 않는다', () => {
  const sheet = read('src/components/app/WarmBfSheet.tsx');
  assert.match(sheet, /if \(!bfLive\(Date\.now\(\)\)\) \{ onClose\(\); return; \}/);
  assert.match(sheet, /BF_VALID_UNTIL - Date\.now\(\)/);
});
