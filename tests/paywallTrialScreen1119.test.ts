/**
 * ★11/19 체험 머리 화면(ProPaywall trialHead · 체험 적용 시) — 첫 실행 first_run · 기존 사용자 trial_announce 공용.
 *   ① 가치 3줄(미국 주식 앱 핵심 · 옵션/퀀트/대가 렌즈 앞세우지 않음) · 머리 설명(24시간 해지 문장) 없음
 *   ② 버튼 바로 위 체험 일정 3단 — 오늘 무료 · 종료 24시간 전까지 해지(장소) · N일 뒤 «스토어 가격 문자열»·주기·자동 갱신
 *   ③ 연간 카드가 위 · 연간 기본 선택 · 월 환산은 스토어 문자열(pricePerMonthString) 그대로
 *   ④ 3.1.2 고지(오늘 결제 없음·자동 갱신·24시간 전 해지·해지 장소) · 복원·약관·개인정보 링크 유지
 *   ⑤ 종료 전 알림·카운트다운·후기·평생 같은 약속/긴급함 문구 없음
 *   ⑥ 체험 없거나 다른 화면(설정 등)은 예전 그대로(가치 3줄·일정 없음)
 * 실행: npx tsx --test tests/paywallTrialScreen1119.test.ts  (네트워크·실결제 없음)
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';

function mock(name: string, exports: unknown) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}
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
const win: any = { setTimeout: () => 0, clearTimeout: () => {} };
(globalThis as any).window = win;
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
function html(props: Record<string, unknown> = {}) { cursor = 0; slots = []; return renderToStaticMarkup(ProPaywall({ locale: 'ko', onClose: () => {}, ...props } as any)); }

const M = { plan: 'monthly', priceString: '₩11,900', price: 11900, currencyCode: 'KRW', pkg: { identifier: '$rc_monthly' } };
const A = { plan: 'annual', priceString: '₩89,000', price: 89000, currencyCode: 'KRW', pricePerMonthString: '₩7,417', pkg: { identifier: '$rc_annual' } };
const TRIAL = [{ ...M, trialDays: 7 }, { ...A, trialDays: 7 }];

test('① 가치 3줄 · 머리 설명 없음 · 옵션 앞세우지 않음', () => {
  offers = [];
  const h = html({ trialHead: true, src: 'first_run', offers: TRIAL });
  assert.ok(h.includes('PRO 7일 무료 체험'));
  assert.ok(h.includes('잠긴 AI 종목 분석이 광고 보기 없이 바로 열림') && h.includes('미국 주식 시세·장마감 리포트·실적 일정을 광고\u00a0없이') && h.includes('내 종목 100개'));
  assert.equal((h.match(/class="val[ "]/g) || []).length, 3, '가치 3줄');
  assert.ok(!/옵션|감마|다크풀|퀀트|대가 렌즈/.test(h), '옵션·고급 지표 앞세우지 않음');
  assert.ok(!h.includes('class="lede"'), '머리 설명 문단 없음');
  // 시세 지연(시간외 15분·허브 폴백)이 있어 체험 화면은 «실시간»을 약속하지 않는다(관문 11192142·11192148)
  for (const loc of ['ko', 'en', 'ja']) assert.ok(!/실시간|real-?time|live|リアルタイム/i.test(html({ locale: loc, trialHead: true, offers: TRIAL }).split('data-trial-vals')[1].split('</ul>')[0]), loc);
});

test('② 일정 3단 — 버튼 바로 위 · 스토어 가격 문자열 · 연간/월간 주기', () => {
  offers = [];
  const h = html({ trialHead: true, src: 'first_run', offers: TRIAL });
  const steps = h.slice(h.indexOf('data-trial-steps'), h.indexOf('</ol>'));
  assert.ok(steps.includes('오늘') && steps.includes('PRO 전부 무료로 열림'));
  assert.ok(steps.includes('종료 24시간 전까지') && steps.includes('기기의 구독 관리에서 해지하면 결제 없음'), '웹·시험 = 기기의 구독 관리');
  assert.ok(steps.includes('7일 뒤') && steps.includes('연 ₩89,000 결제 · 이후 자동 갱신'));
  assert.ok(h.indexOf('data-trial-steps') < h.indexOf('7일 무료로 시작'), '일정 → 버튼');
  assert.ok(!h.includes('class="trialTerms"'), '같은 말 한 줄 중복 없음');
  // 월간을 고르면(월간만 체험) 월 가격
  const fm = html({ trialHead: true, src: 'first_run', offers: [{ ...M, trialDays: 7 }, A] });
  assert.ok(fm.includes('월 ₩11,900 결제 · 이후 자동 갱신'));
  // 가격은 받은 문자열 그대로(다른 통화)
  const e = html({ locale: 'en', trialHead: true, offers: [{ ...M, priceString: '$9.99', trialDays: 7 }, { ...A, priceString: '$74.99', pricePerMonthString: '$6.25', trialDays: 7 }] });
  assert.ok(e.includes('$74.99/year, renews automatically') && e.includes('$6.25/mo') && e.includes('Start 7-day free trial'));
  const j = html({ locale: 'ja', trialHead: true, offers: [{ ...M, priceString: '¥1,280', trialDays: 7 }, { ...A, priceString: '¥12,000', pricePerMonthString: '¥1,000', trialDays: 7 }] });
  assert.ok(j.includes('年額¥12,000を請求・以後自動更新') && j.includes('7日間無料で始める'));
});

test('② 해지 장소 — iOS App Store · 안드 Google Play', () => {
  offers = [];
  win.Capacitor = { getPlatform: () => 'ios' };
  assert.ok(html({ trialHead: true, offers: TRIAL }).includes('App Store 구독 관리에서 해지하면'));
  win.Capacitor = { getPlatform: () => 'android' };
  assert.ok(html({ trialHead: true, offers: TRIAL }).includes('Google Play 정기 결제에서 해지하면'));
  assert.ok(html({ locale: 'en', trialHead: true, offers: TRIAL }).includes('Cancel in Google Play subscriptions'));
  delete win.Capacitor;
});

test('③ 연간 카드가 위 · 연간 기본 선택 · 월 환산 스토어 문자열', () => {
  offers = [];
  const h = html({ trialHead: true, offers: TRIAL });
  assert.ok(h.indexOf('data-plan="annual"') < h.indexOf('data-plan="monthly"'), '연간이 위');
  assert.match(h, /aria-checked="true" data-plan="annual"/);
  assert.ok(h.includes('월 ₩7,417 · 7일 무료 체험'));
  // 체험 없는 화면(설정)은 예전 순서(월간 → 연간)
  offers = TRIAL;
  const st = html({ src: 'settings' });
  assert.ok(st.indexOf('data-plan="monthly"') < st.indexOf('data-plan="annual"'));
});

test('④ 3.1.2 고지·링크 유지 · ⑤ 약속/긴급함 문구 없음', () => {
  offers = [];
  for (const loc of ['ko', 'en', 'ja']) {
    const h = html({ locale: loc, trialHead: true, offers: TRIAL });
    if (loc === 'ko') assert.ok(h.includes('오늘은 결제되지 않습니다') && h.includes('자동 갱신') && h.includes('24시간 전까지 해지하면') && h.includes('구독 관리 화면'));
    if (loc === 'en') assert.ok(h.includes('won’t be charged today') && h.includes('renews automatically') && h.includes('24 hours'));
    if (loc === 'ja') assert.ok(h.includes('本日は請求されません') && h.includes('自動更新') && h.includes('24時間前'));
    assert.ok(/구매 복원|Restore purchase|購入を復元/.test(h) && /이용약관|Terms of Use|利用規約/.test(h) && /개인정보처리방침|Privacy Policy|プライバシーポリシー/.test(h));
    assert.ok(!/알림을 보내|remind|リマインド|남은 시간|countdown|선착순|limited time|평생|lifetime|買い切り|★★★★/i.test(h), loc);
  }
});

test('⑥ 체험 없음·다른 화면 = 가치 3줄·일정 없음(예전 화면)', () => {
  offers = [];
  const noTrial = html({ trialHead: true, src: 'first_run', offers: [M, A] });
  assert.ok(!noTrial.includes('data-trial-vals') && !noTrial.includes('data-trial-steps') && noTrial.includes('PRO로 바로 열기'));
  offers = TRIAL;
  const settings = html({ src: 'settings' });
  assert.ok(!settings.includes('data-trial-vals') && !settings.includes('data-trial-steps'));
  assert.ok(settings.includes('class="trialTerms"') && settings.includes('7일 무료로 시작'), '설정 페이월은 11/16 그대로(한 줄 조건)');
  const ctx = html({ trialHead: true, context: { title: 't', lede: 'l', cta: 'c', sections: [] } });
  assert.ok(!ctx.includes('data-trial-steps'), '만료 페이월(context)은 체험 화면 아님');
});
