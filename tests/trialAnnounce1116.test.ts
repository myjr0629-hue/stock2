/**
 * ★11/16 밤 기존 무료 사용자 «새로 생긴 PRO 7일 무료 체험» 1회 안내(trial_announce) 판정·표식·겹침 규칙 + 페이월 머리 한 줄.
 *   ① 가벼운 문: 웹·새 설치(이번 실행 중 첫 안내)·이미 봄·first_run 봄·저장소 없음 = 안 실음
 *   ② trialAnnounceStep: 자격 있음 = check · 자격 없음/PRO/코드 PRO(공유 신호)/이미 봄 = stop · 결제 진행 중/다른 시트/오늘 다른 안내/문서 화면/뒤 = later · 모름 = wait
 *   ③ noPurchaseHistory: 이력 0 만 true(체험·구독·1회 결제·필드 없음 = false)
 *   ④ 같은 날 겹침: 게이트 페이월·선물 안내(새/옛 표식·재안내)·체험 종료 안내·만료 페이월 표식이 오늘이면 true, 어제면 false · 반대로 trialAnnouncedToday
 *   ⑤ 표식: 쓰기 실패 = 안 보임 · 한 번 쓰면 다시 안 뜸
 *   ⑥ ProPaywall: trialAnnounce + 체험 = 눈썹 «새로 생긴 무료 체험» + 오늘 체험 문구 그대로 · 체험 없으면 예전 눈썹
 *   ⑦ 상수 일치(첫 실행 표식·온보딩 표식·게이트·선물 키) · 퍼널 출처 등록
 * 실행: npx tsx --test tests/trialAnnounce1116.test.ts  (네트워크·실결제 없음)
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';

function mock(name: string, exports: unknown) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}

const ta = require('../src/lib/app/trialAnnounce') as typeof import('../src/lib/app/trialAnnounce');

function mem(init: Record<string, string> = {}) {
  const m = new Map<string, string>(Object.entries(init));
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
}
const NOW = new Date(2026, 10, 16, 21, 0, 0).getTime();
const YDAY = NOW - 24 * 3600_000;

test('① 가벼운 문(SDK 싣기 전)', () => {
  assert.equal(ta.trialAnnouncePreGate({ native: true, onboardedAtStart: true, store: mem() }), true, '기존 사용자·네이티브·처음');
  assert.equal(ta.trialAnnouncePreGate({ native: false, onboardedAtStart: true, store: mem() }), false, '웹');
  assert.equal(ta.trialAnnouncePreGate({ native: true, onboardedAtStart: false, store: mem() }), false, '새 설치(이번 실행에 첫 안내) = first_run 몫');
  assert.equal(ta.trialAnnouncePreGate({ native: true, onboardedAtStart: true, store: mem({ [ta.TRIAL_ANNOUNCE_KEY]: '1' }) }), false, '이미 봄');
  assert.equal(ta.trialAnnouncePreGate({ native: true, onboardedAtStart: true, store: mem({ [ta.FIRST_RUN_SHOWN_KEY]: '1' }) }), false, 'first_run 을 봄');
  assert.equal(ta.trialAnnouncePreGate({ native: true, onboardedAtStart: true, store: null }), false, '저장소 없음');
  assert.equal(ta.readOnboardedAt(mem({ [ta.ONBOARDED_KEY]: 'accepted' })), true);
  assert.equal(ta.readOnboardedAt(mem()), false);
});

const T7 = [{ plan: 'monthly', trialDays: 7 }, { plan: 'annual', trialDays: 7 }];
const base = { iapAvailable: true, ready: true, isPro: false, sharedPro: false, pending: false, offers: T7, seen: false, routeOk: true, otherToday: false, dialogOpen: false, visible: true };

test('② trialAnnounceStep — 자격 있음/없음/PRO/코드 PRO/이미 봄/겹침', () => {
  assert.equal(ta.trialAnnounceStep(base), 'check', '자격 있음');
  assert.equal(ta.trialAnnounceStep({ ...base, offers: [{ plan: 'monthly' }, { plan: 'annual', trialDays: null }] }), 'stop', '자격 없음(체험·구독 이력 → 스토어가 체험 안 줌)');
  assert.equal(ta.trialAnnounceStep({ ...base, offers: [] }), 'stop', '오퍼링 없음');
  assert.equal(ta.trialAnnounceStep({ ...base, offers: [{ plan: 'lifetime', trialDays: 7 }] }), 'stop', '평생은 체험 아님');
  assert.equal(ta.trialAnnounceStep({ ...base, isPro: true }), 'stop', 'PRO(코드 PRO 포함 — RC 권한)');
  assert.equal(ta.trialAnnounceStep({ ...base, sharedPro: true }), 'stop', '공유 PRO 신호(막 결제·코드 반영)');
  assert.equal(ta.trialAnnounceStep({ ...base, seen: true }), 'stop', '이미 봄');
  assert.equal(ta.trialAnnounceStep({ ...base, iapAvailable: false }), 'stop', '결제 불가');
  assert.equal(ta.trialAnnounceStep({ ...base, ready: false }), 'wait', '모름 = 기다림(체험 없음으로 단정 안 함)');
  assert.equal(ta.trialAnnounceStep({ ...base, pending: true }), 'later', '결제 진행 중');
  assert.equal(ta.trialAnnounceStep({ ...base, dialogOpen: true }), 'later', '다른 시트가 떠 있음');
  assert.equal(ta.trialAnnounceStep({ ...base, otherToday: true }), 'later', '오늘 다른 안내·페이월을 봄');
  assert.equal(ta.trialAnnounceStep({ ...base, routeOk: false }), 'later', '문서·첫 실행 화면');
  assert.equal(ta.trialAnnounceStep({ ...base, visible: false }), 'later', '앱이 뒤');
  assert.equal(ta.trialAnnounceStep({ ...base, gateFlow: true }), 'later', '게이트 흐름(광고 준비·대체 창) 중');
  const a = ta.beginGateFlow(NOW); const b = ta.beginGateFlow(NOW + 500);
  assert.equal(ta.gateFlowActive(NOW + 1000), true);
  ta.endGateFlow(a); assert.equal(ta.gateFlowActive(NOW + 1000), true, '두 게이트 중 하나만 끝남 = 진행 중');
  ta.endGateFlow(b); assert.equal(ta.gateFlowActive(NOW + 1000), false);
  ta.beginGateFlow(NOW); assert.equal(ta.gateFlowActive(NOW + ta.GATE_FLOW_MAX_MS + 1), false, '2분 상한(지워짐)'); assert.equal(ta.gateFlowActive(NOW), false);
  assert.equal(ta.trialAnnounceStep({ ...base, isPro: true, dialogOpen: true }), 'stop', 'PRO 는 겹침과 무관하게 끝');
});

test('③ noPurchaseHistory — 이력 0 만', () => {
  const clean = { entitlements: { active: {}, all: {} }, activeSubscriptions: [], allPurchasedProductIdentifiers: [], nonSubscriptionTransactions: [] };
  assert.equal(ta.noPurchaseHistory(clean), true);
  assert.equal(ta.noPurchaseHistory({ ...clean, entitlements: { active: {}, all: { pro: { isActive: false, periodType: 'TRIAL' } } } }), false, '체험 이력(만료)');
  assert.equal(ta.noPurchaseHistory({ ...clean, entitlements: { active: { pro: {} }, all: { pro: {} } } }), false, '지금 PRO');
  assert.equal(ta.noPurchaseHistory({ ...clean, allPurchasedProductIdentifiers: ['com.signumhq.app.pro.monthly'] }), false, '구독 이력');
  assert.equal(ta.noPurchaseHistory({ ...clean, activeSubscriptions: ['x'] }), false);
  assert.equal(ta.noPurchaseHistory({ ...clean, nonSubscriptionTransactions: [{}] }), false, '1회 결제');
  assert.equal(ta.noPurchaseHistory({ entitlements: { active: {}, all: {} } }), false, '필드 없음 = 모름');
  assert.equal(ta.noPurchaseHistory(null), false);
  assert.equal(ta.noPurchaseHistory({ ...clean, entitlements: null }), false);
});

test('④ 같은 날 겹침 — 오늘이면 쉼, 어제면 아님', () => {
  const today = ta.dayOf(NOW), yday = ta.dayOf(YDAY);
  assert.equal(ta.otherSheetToday(mem(), NOW), false);
  assert.equal(ta.otherSheetToday(mem({ [ta.GATE_DAY_KEY]: today }), NOW), true, '게이트 페이월 오늘');
  assert.equal(ta.otherSheetToday(mem({ [ta.GATE_DAY_KEY]: yday }), NOW), false);
  assert.equal(ta.otherSheetToday(mem({ [ta.GIFT_KEY]: JSON.stringify({ n: 1, last: NOW - 3600_000 }) }), NOW), true, '선물 안내 오늘');
  assert.equal(ta.otherSheetToday(mem({ [ta.GIFT_KEY]: JSON.stringify({ n: 2, last: YDAY }) }), NOW), false);
  assert.equal(ta.otherSheetToday(mem({ [ta.GIFT_KEY]: String(NOW - 60_000) }), NOW), true, '옛 숫자 표식');
  assert.equal(ta.otherSheetToday(mem({ [ta.GIFT_KEY]: 'garbage' }), NOW), false);
  assert.equal(ta.otherSheetToday(mem({ [ta.GIFT_RE_KEY]: String(NOW - 60_000) }), NOW), true, '선물 재안내 오늘');
  assert.equal(ta.otherSheetToday(mem({ [ta.PAYWALL_OPEN_KEY]: String(NOW - 60_000) }), NOW), true, '어느 출처든 페이월 오늘(ad_nofill·설정 등)');
  assert.equal(ta.otherSheetToday(mem({ [ta.PAYWALL_OPEN_KEY]: String(YDAY) }), NOW), false);
  const pst = mem(); ta.notePaywallOpened(pst, NOW); assert.equal(ta.otherSheetToday(pst, NOW), true);
  ta.notePaywallOpened({ getItem: () => null, setItem: () => { throw new Error('q'); } }); ta.notePaywallOpened(null);
  for (const k of ta.TRIAL_OFF_KEYS) {
    assert.equal(ta.otherSheetToday(mem({ [k]: `p123|${today}` }), NOW), true, `${k} 오늘(체험 종료 안내·만료 페이월)`);
    assert.equal(ta.otherSheetToday(mem({ [k]: `p123|${yday}` }), NOW), false);
  }
  // 반대 방향 — 선물 안내가 읽는 «오늘 이 안내가 떴나»
  assert.equal(ta.trialAnnouncedToday(mem({ [ta.TRIAL_ANNOUNCE_KEY]: String(NOW - 60_000) }), NOW), true);
  assert.equal(ta.trialAnnouncedToday(mem({ [ta.TRIAL_ANNOUNCE_KEY]: String(YDAY) }), NOW), false);
  assert.equal(ta.trialAnnouncedToday(mem(), NOW), false);
});

test('⑤ 표식 — 한 번, 쓰기 실패면 안 보임', () => {
  const st = mem();
  assert.equal(ta.readTrialAnnounced(st), false);
  assert.equal(ta.markTrialAnnounced(st, NOW), true);
  assert.equal(ta.readTrialAnnounced(st), true);
  assert.equal(ta.trialAnnouncePreGate({ native: true, onboardedAtStart: true, store: st }), false, '다시 안 뜸');
  assert.equal(ta.markTrialAnnounced({ getItem: () => null, setItem: () => { throw new Error('quota'); } }), false);
  assert.equal(ta.markTrialAnnounced(null), false);
  assert.equal(ta.readTrialAnnounced(null), true, '저장소 없음 = 안 보임');
  assert.equal(ta.readTrialAnnounced({ getItem: () => { throw new Error('x'); }, setItem: () => {} }), true);
});

test('⑤ 경로 — 앱 화면만', () => {
  assert.equal(ta.trialAnnounceRouteOk('/ko/app-view/dash'), true);
  assert.equal(ta.trialAnnounceRouteOk('/en/app-view/intel/NVDA'), true);
  assert.equal(ta.trialAnnounceRouteOk('/ko/app-view/terms'), false);
  assert.equal(ta.trialAnnounceRouteOk('/ko/app-view/privacy'), false);
  assert.equal(ta.trialAnnounceRouteOk('/ko/app-view/onboarding'), false);
  assert.equal(ta.trialAnnounceRouteOk('/ko/app-view/settings'), false, '설정(배너 억제 따로)');
  assert.equal(ta.trialAnnounceRouteOk('/ko/pricing'), false);
});

test('⑦ 상수 일치 · 퍼널 출처 등록', () => {
  const frp = require('../src/lib/app/firstRunPaywall') as typeof import('../src/lib/app/firstRunPaywall');
  assert.equal(ta.FIRST_RUN_SHOWN_KEY, frp.FIRST_RUN_PAYWALL_KEY);
  const gp = require('../src/lib/app/gatePaywall') as typeof import('../src/lib/app/gatePaywall');
  assert.equal(ta.GATE_DAY_KEY, gp.GATE_PAYWALL_DAY_KEY);
  assert.equal(ta.dayOf(NOW), gp.localDay(new Date(NOW)));
  const fs = require('../src/lib/app/funnelSchema') as typeof import('../src/lib/app/funnelSchema');
  assert.ok(fs.isFunnelSrc('trial_announce'));
  const r = require('../scripts/mkt-funnel.js');
  assert.ok(r.SRCS.includes('trial_announce'));
  const src = require('node:fs').readFileSync(require.resolve('../src/lib/gift/giftAnnounce'), 'utf8') as string;
  assert.ok(src.includes(`'${ta.GIFT_KEY}'`) && src.includes(`'${ta.GIFT_RE_KEY}'`) && src.includes(`'${ta.ONBOARDED_KEY}'`));
  const tro = require('node:fs').readFileSync(require.resolve('../src/lib/app/trialRenewalOff'), 'utf8') as string;
  assert.ok(tro.includes(`'${ta.TRIAL_OFF_KEYS[0]}'`) && tro.includes(`'${ta.TRIAL_OFF_KEYS[1]}'`));
  const tex = require('node:fs').readFileSync(require.resolve('../src/lib/app/trialExpired'), 'utf8') as string;
  assert.ok(tex.includes(`'${ta.TRIAL_OFF_KEYS[2]}'`));
});

test('④ 반대 방향 배선 — 오늘 이 안내가 떴으면 선물 안내 busy · 광고 없음 페이월 생략', () => {
  const ga = require('../src/lib/gift/giftAnnounce') as typeof import('../src/lib/gift/giftAnnounce');
  const st = mem({ [ga.ONBOARDING_DONE_KEY]: 'accepted' });
  const input = (store: ReturnType<typeof mem>) => ({ live: true, store, onboardedAtMount: true, path: '/ko/app-view/dash', dialogOpen: false, now: NOW });
  assert.equal(ga.giftAnnounceBlock(input(st)), null, '안내 전 = 선물 가능');
  assert.equal(ga.giftReannounceBlock(input(st)), null);
  st.setItem(ta.TRIAL_ANNOUNCE_KEY, String(NOW - 60_000));
  assert.equal(ga.giftAnnounceBlock(input(st)), 'busy', '오늘 체험 안내 = 선물 안 뜸');
  assert.equal(ga.giftReannounceBlock(input(st)), 'busy');
  st.setItem(ta.TRIAL_ANNOUNCE_KEY, String(YDAY));
  assert.equal(ga.giftAnnounceBlock(input(st)), null, '어제 안내 = 오늘은 선물 가능');
  const v = require('node:fs').readFileSync(require.resolve('../src/components/app/ValueWall.tsx'), 'utf8') as string;
  // ★11/23 announcedTodaySafe() = trialAnnouncedToday || 오늘 daily_open 봄(관문 11231803 ② — tests/dailyPaywall1123 ⑧)
  assert.match(v, /announcedToday = (?:trialAnnouncedToday\(window\.localStorage\)|announcedTodaySafe\(\));[^\n]*\n    if \(\(await runUnlock\(announcedToday\)\) !== 'paywall'\) endFlow\(\);/);
  assert.match(v, /const announcedTodaySafe = \(\) => \{ try \{ return trialAnnouncedToday\(window\.localStorage\)/);
  assert.match(v, /const stillFree = \(\) => !gateProNow\(\) && !proPurchaseState\.getSnapshot\(\) && !announcedTodaySafe\(\);/, '재조회 뒤 gate_first·ad_nofill 도 오늘 안내를 본다');
  const pw = require('node:fs').readFileSync(require.resolve('../src/components/app/ProPaywall.tsx'), 'utf8') as string;
  assert.match(pw, /m\.trackFunnel\('open', \{ src: funnelSrc \}\); \}\)\.catch\(\(\) => \{\}\);\n.*\n    try \{ notePaywallOpened\(window\.localStorage\); \}/, '페이월 열림 표식');
  assert.match(v, /gateFlowAt\.current = Date\.now\(\);\n    endGateFlow\(gateFlowId\.current\);\n    gateFlowId\.current = beginGateFlow\(\);/, '게이트 흐름 시작 알림');
  assert.match(v, /const endFlow = \(\) => \{ gateFlowAt\.current = 0; endGateFlow\(gateFlowId\.current\); gateFlowId\.current = 0; releaseSlot\(\); \};/, '게이트 흐름 끝 알림(+ 앱 전역 페이월 자리 놓기 — 11/17)');
  const g = require('node:fs').readFileSync(require.resolve('../src/components/app/TrialAnnounceGate.tsx'), 'utf8') as string;
  assert.ok(g.includes('gateFlow: gateFlowActive()'), '판정이 게이트 흐름을 본다');
  assert.ok(g.indexOf('markTrialAnnounced(store)') < g.indexOf('markGateDay(localDay())') && g.indexOf('markGateDay(localDay())') < g.indexOf('setShow('), '표식 → 게이트 하루 표식 → 보임');
});

// ── ⑥ ProPaywall 렌더(훅 흉내 · 실제 JSX) ──
const React = require('react');
(globalThis as any).React = React;
let cursor = 0;
let slots: any[] = [];
mock('react', {
  ...React,
  useState: (initial: any) => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], (n: any) => { slots[i] = typeof n === 'function' ? n(slots[i]) : n; }]; },
  useRef: (initial: any) => { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
  useCallback: (fn: any) => fn,
  useLayoutEffect: () => {},
  useEffect: () => { cursor++; },
});
require.extensions['.css'] = (mod) => { mod.exports = { __esModule: true, default: new Proxy({}, { get: (_, name) => String(name) }) }; };
(globalThis as any).window = { setTimeout: () => 0, clearTimeout: () => {} };
(globalThis as any).document = { activeElement: null, body: {}, contains: () => false };
(globalThis as any).HTMLElement = class {};
let offers: any[] = [];
mock('../src/hooks/useProStatus', { useProStatus: () => ({ isPro: false, ready: true, offers, purchasePending: false, iapAvailable: true, refreshOffers: async () => {}, purchase: async () => ({ ok: false, isPro: false, cancelled: true }), purchaseOffer: async () => ({ ok: false }), restore: async () => ({ ok: true, isPro: false }) }) });
mock('next/navigation', { useRouter: () => ({ push: () => {} }) });
mock('../src/lib/app/funnel', { noteFunnelSrc: () => {}, trackFunnel: () => {}, trackFunnelOutcome: () => {} });
mock('../src/lib/app/ratingMoments', { markSessionError: () => {} });
mock('../src/components/app/RedeemCodeLink', { RedeemCodeLink: () => null });
mock('../src/lib/app/watchlist', { FREE_LIMIT: 5, MAX_ITEMS: 100 });
mock('../src/lib/app/watchlistFlags', { WATCHLIST_CHIP_TIERING: false });
mock('../src/components/app/watchlist/BottomSheet', { afterSheetHistory: async () => {} });
const { ProPaywall } = require('../src/components/app/ProPaywall') as typeof import('../src/components/app/ProPaywall');
const { renderToStaticMarkup } = require('react-dom/server');
function html(props: Record<string, unknown> = {}) { cursor = 0; slots = []; return renderToStaticMarkup(ProPaywall({ locale: 'ko', annualTrialDefault: true, onClose: () => {}, ...props } as any)); }

const M = { plan: 'monthly', priceString: '₩11,900', price: 11900, currencyCode: 'KRW', pkg: { identifier: '$rc_monthly' } };
const A = { plan: 'annual', priceString: '₩89,000', price: 89000, currencyCode: 'KRW', pricePerMonthString: '₩7,417', pkg: { identifier: '$rc_annual' } };

test('⑥ 페이월 — 체험 있으면 눈썹 «새로 생긴 무료 체험» + 오늘 체험 문구 그대로', () => {
  offers = [];
  const trial = [{ ...M, trialDays: 7 }, { ...A, trialDays: 7 }];
  const h = html({ trialHead: true, trialAnnounce: true, src: 'trial_announce', offers: trial });
  assert.ok(h.includes('새로 생긴 무료 체험'), '눈썹');
  assert.ok(!h.includes('SIGNUM PRO</span>'), '눈썹 자리 대체');
  assert.ok(h.includes('PRO 7일 무료') && h.includes('7일 무료로 시작'), '오늘 체험 머리·버튼');
  // ★11/19 체험 머리 화면은 버튼 위 한 줄 대신 체험 일정 3단(오늘 무료 · 종료 24시간 전까지 해지 · 7일 뒤 가격·자동 갱신)
  assert.ok(h.includes('₩89,000/년 결제 · 이후 매년 자동 갱신') && h.includes('종료 24시간 전까지') && h.includes('해지하면 결제\u00a0없음'), '버튼 위 일정(가격·자동 갱신·해지)');
  assert.ok(h.indexOf('data-trial-steps') < h.indexOf('7일 무료로 시작'), '일정은 버튼 위');
  assert.ok(h.includes('오늘은 결제되지 않습니다') && h.includes('24시간 전까지 해지하면'), '고지문');
  assert.match(h, /aria-checked="true" data-plan="annual"/, '연간 기본 선택 그대로');
  // 첫 실행 페이월과 눈썹만 다르다(가격·버튼·고지 동일)
  const f = html({ trialHead: true, src: 'first_run', offers: trial });
  assert.equal(h.replace('새로 생긴 무료 체험', 'SIGNUM PRO'), f);
  assert.ok(!/평생|lifetime/i.test(h), '평생 언급 없음');
});

test('⑥ 페이월 — 체험 없으면 trialAnnounce 여도 예전 화면(눈썹 SIGNUM PRO)', () => {
  offers = [M, A];
  const h = html({ trialHead: true, trialAnnounce: true, src: 'trial_announce' });
  assert.ok(!h.includes('새로 생긴 무료 체험') && h.includes('SIGNUM PRO'));
  assert.ok(!/무료로 시작/.test(h));
  // trialAnnounce 를 안 넘긴 다른 화면은 바이트 그대로
  offers = [{ ...M, trialDays: 7 }, { ...A, trialDays: 7 }];
  assert.equal(html({ src: 'settings' }), html({ src: 'settings', trialAnnounce: false }));
  const en = html({ locale: 'en', trialHead: true, trialAnnounce: true, offers: offers.map((o) => ({ ...o, priceString: o.plan === 'annual' ? '$74.99' : '$9.99' })) });
  assert.ok(en.includes('New · Free trial') && en.includes('Start 7-day free trial'));
  const ja = html({ locale: 'ja', trialHead: true, trialAnnounce: true });
  assert.ok(ja.includes('新しい無料体験') && ja.includes('7日間無料で始める'));
});
