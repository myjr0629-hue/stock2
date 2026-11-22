/** Offline: npx tsx tests/blackFriday.test.ts — 블랙프라이데이 앱 안 안내 순수 규칙 (2026-11-22) */
import assert from 'node:assert/strict';
import {
  bfEligibleInfo, bfPriceView, bfRedeemUrl, bfLive, bfPreGate, bfStep, markBfSeen, readBfSeen, BF_COPY, BF_VALID_UNTIL, BF_SEEN_KEY,
} from '../src/lib/app/blackFriday';
import { FUNNEL_SRCS } from '../src/lib/app/funnelSchema';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok', name); };
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
const NOW = Date.parse('2026-11-22T11:00:00Z');

t('대상: 권한 없음 = 보임 · 다른 권한만 있음 = 안 보임', () => {
  assert.equal(bfEligibleInfo({ entitlements: { active: {} } }), true);
  assert.equal(bfEligibleInfo({ entitlements: { active: { other: { isActive: true } } } }), false);
});
t('대상: 1개월 코드 체험(TRIAL·App Store)·소개가 = 보임', () => {
  assert.equal(bfEligibleInfo({ entitlements: { active: { pro: { periodType: 'TRIAL', store: 'APP_STORE' } } } }), true);
  assert.equal(bfEligibleInfo({ entitlements: { active: { pro: { periodType: 'intro', store: 'app_store' } } } }), true);
});
t('대상: 정가 결제·프로모션·Play·모름 = 안 보임', () => {
  assert.equal(bfEligibleInfo({ entitlements: { active: { pro: { periodType: 'NORMAL', store: 'APP_STORE' } } } }), false);
  assert.equal(bfEligibleInfo({ entitlements: { active: { pro: { periodType: 'NORMAL', store: 'PROMOTIONAL' } } } }), false);
  assert.equal(bfEligibleInfo({ entitlements: { active: { pro: { periodType: 'TRIAL', store: 'PLAY_STORE' } } } }), false);
  assert.equal(bfEligibleInfo(null), false);
  assert.equal(bfEligibleInfo({ entitlements: null }), false);
  assert.equal(bfEligibleInfo({ entitlements: { active: null } }), false);
});
t('가격: KRW·JPY·USD 정가가 맞을 때만 할인가', () => {
  const k = bfPriceView('annual', { price: 89000, currencyCode: 'KRW', priceString: '₩89,000' }, 'ko');
  assert.ok(k.regular && k.offer && /89,000/.test(k.regular) && /44,500/.test(k.offer));
  const km = bfPriceView('monthly', { price: 11900, currencyCode: 'KRW' }, 'ko');
  assert.ok(km.offer && /5,900/.test(km.offer) && /11,900/.test(km.regular!));
  const j = bfPriceView('annual', { price: 12000, currencyCode: 'JPY' }, 'ja');
  assert.ok(j.offer && /6,000/.test(j.offer));
  const jm = bfPriceView('monthly', { price: 1280, currencyCode: 'JPY' }, 'ja');
  assert.ok(jm.offer && /640/.test(jm.offer));
  const u = bfPriceView('annual', { price: 74.99, currencyCode: 'USD' }, 'en');
  assert.ok(u.offer && /37\.49/.test(u.offer) && /74\.99/.test(u.regular!));
  const um = bfPriceView('monthly', { price: 9.99, currencyCode: 'USD' }, 'en');
  assert.ok(um.offer && /4\.99/.test(um.offer));
});
t('가격: 다른 통화·정가 불일치 = 할인가 없음(50%만) · 정가는 스토어 문자열', () => {
  assert.deepEqual(bfPriceView('annual', { price: 34.99 * 2, currencyCode: 'GBP', priceString: '£69.99' }, 'en'), { regular: '£69.99', offer: null });
  assert.deepEqual(bfPriceView('annual', { price: 79.99, currencyCode: 'USD', priceString: '$79.99' }, 'en'), { regular: '$79.99', offer: null });
  assert.deepEqual(bfPriceView('monthly', null, 'en'), { regular: null, offer: null });
});
t('주소: 애플 오퍼 코드 사용 주소 · 앱 id', () => {
  for (const p of ['annual', 'monthly'] as const) {
    const u = bfRedeemUrl(p)!;
    assert.match(u, /^https:\/\/apps\.apple\.com\/redeem\?ctx=offercodes&id=6783130444&code=[A-Z0-9]{4,24}$/);
  }
  assert.notEqual(bfRedeemUrl('annual'), bfRedeemUrl('monthly'));
});
t('기간: 11/22 ~ 12/2 07:00 UTC 전까지', () => {
  assert.equal(bfLive(NOW), true);
  assert.equal(bfLive(BF_VALID_UNTIL - 1), true);
  assert.equal(bfLive(BF_VALID_UNTIL), false);
  assert.equal(bfLive(Date.parse('2026-11-20T00:00:00Z')), false);
});
t('기록: 한 번 보면 끝 · 저장소 없음 = 봤다(안 보임)', () => {
  const s = mem();
  assert.equal(readBfSeen(s), false);
  assert.equal(bfPreGate({ ios: true, onboardedAtStart: true, store: s, now: NOW }), true);
  assert.equal(markBfSeen(s, NOW), true);
  assert.equal(s.getItem(BF_SEEN_KEY), String(NOW));
  assert.equal(readBfSeen(s), true);
  assert.equal(bfPreGate({ ios: true, onboardedAtStart: true, store: s, now: NOW }), false);
  assert.equal(readBfSeen(null), true);
  assert.equal(markBfSeen(null), false);
  const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
  assert.equal(readBfSeen(broken), true);
  assert.equal(markBfSeen(broken), false);
});
t('가벼운 문: 안드·웹·새 설치·기간 밖 = 안 싣는다', () => {
  const s = mem();
  assert.equal(bfPreGate({ ios: false, onboardedAtStart: true, store: s, now: NOW }), false);
  assert.equal(bfPreGate({ ios: true, onboardedAtStart: false, store: s, now: NOW }), false);
  assert.equal(bfPreGate({ ios: true, onboardedAtStart: true, store: s, now: BF_VALID_UNTIL }), false);
});
t('단계: 다른 시트·오늘 다른 페이월·결제 중 = 다음 포그라운드', () => {
  const base = { seen: false, live: true, routeOk: true, otherToday: false, dialogOpen: false, visible: true, gateFlow: false, pending: false };
  assert.equal(bfStep(base), 'check');
  assert.equal(bfStep({ ...base, seen: true }), 'stop');
  assert.equal(bfStep({ ...base, live: false }), 'stop');
  for (const k of ['otherToday', 'dialogOpen', 'gateFlow', 'pending'] as const) assert.equal(bfStep({ ...base, [k]: true }), 'later');
  assert.equal(bfStep({ ...base, routeOk: false }), 'later');
  assert.equal(bfStep({ ...base, visible: false }), 'later');
});
t('문구: 3.1.2(기간·이후 정가 자동 갱신·해지) · «옵션» 없음 · 주어', () => {
  const ko = BF_COPY.ko.fine('₩89,000', '₩11,900');
  assert.ok(/자동 갱신/.test(ko) && /해지/.test(ko) && /₩89,000/.test(ko) && /₩11,900/.test(ko) && /첫 1년/.test(ko) && /첫 3개월/.test(ko));
  const en = BF_COPY.en.fine(null, null);
  assert.ok(/renews automatically/.test(en) && /Cancel anytime/.test(en));
  assert.ok(/自動更新/.test(BF_COPY.ja.fine('¥12,000', '¥1,280')) && /解約/.test(BF_COPY.ja.fine(null, null)));
  for (const l of ['ko', 'en', 'ja'] as const) {
    assert.ok(!/옵션|option|オプション/i.test(BF_COPY[l].title));
    assert.ok(/12\/2|Dec 2/.test(BF_COPY[l].eyebrow));
  }
  assert.ok(BF_COPY.ko.title.startsWith('미국 주식 앱 SIGNUM PRO'));
  assert.ok(BF_COPY.ja.title.startsWith('米国株アプリ SIGNUM PRO'));
  assert.ok(/US stock market app/.test(BF_COPY.en.title));
});
t('퍼널 출처: bf_* 4개 등록', () => {
  for (const s of ['bf_sheet', 'bf_line', 'bf_sy', 'bf_sm']) assert.ok((FUNNEL_SRCS as readonly string[]).includes(s));
});
console.log(`blackFriday: ${n} passed`);
