/** Offline: npx tsx tests/comebackPush.test.ts — 체험 만료 D+1 «다시 시작» 할인 코드 푸시 순수 규칙 (2026-11-21) */
import assert from 'node:assert/strict';
import {
  comebackWebhookAction, comebackRcVerdict, comebackDecision, comebackContent, storefrontFromCountry, sealUid, openUid, parseEntry,
  comebackEnvOff, COMEBACK_MIN_AFTER_MS, COMEBACK_MAX_AFTER_MS, comebackPushData,
} from '../src/lib/push/comebackPush';
import { COMEBACK_VALID_FROM, COMEBACK_PRICES, isComebackCode, comebackRedeemUrl, comebackCode } from '../src/lib/app/comebackOffer';

// 실제 코드 값은 저장소에 두지 않는다 — 시험용 가짜 코드
const COMEBACK_CODE = 'TESTBACK99';
process.env.COMEBACK_OFFER_CODE = COMEBACK_CODE.toLowerCase();

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok', name); };
const H = 3600_000, D = 24 * H;
const NOW = Date.parse('2026-11-23T03:00:00Z');   // 서울 12시 · 도쿄 12시 · 뉴욕 22시
const iso = (x: number) => new Date(x).toISOString();
const ev = (e: Record<string, unknown>) => ({ event: { type: 'EXPIRATION', environment: 'PRODUCTION', app_user_id: '$RCAnonymousID:' + 'ab'.repeat(16), period_type: 'TRIAL', store: 'APP_STORE',
  expiration_reason: 'UNSUBSCRIBE', entitlement_ids: ['pro'], country_code: 'KR', currency: 'KRW', expiration_at_ms: NOW - 25 * H, event_timestamp_ms: NOW - 25 * H, ...e } });

t('웹훅: 앱스토어 체험 해지 만료만 적재', () => {
  const a = comebackWebhookAction(ev({}));
  assert.equal(a?.kind, 'enqueue');
  assert.equal((a as any).expiredAt, NOW - 25 * H);
  assert.equal((a as any).storefront, 'KR');
  assert.equal((a as any).currencyOk, true);
  assert.equal((comebackWebhookAction(ev({ country_code: 'US', currency: 'USD' })) as any).storefront, 'US');
  assert.equal(comebackWebhookAction(ev({ country_code: 'US', currency: 'KRW' })), null);   // 나라·통화 어긋남
  assert.equal((comebackWebhookAction(ev({ currency: null })) as any).currencyOk, false);
  assert.equal(comebackWebhookAction(ev({ country_code: 'GB' })), null);   // 가격을 모르는 나라
  assert.equal(comebackWebhookAction(ev({ country_code: undefined })), null);
  assert.equal(comebackWebhookAction(ev({ environment: 'SANDBOX' })), null);
  assert.equal(comebackWebhookAction(ev({ store: 'PLAY_STORE' })), null);
  assert.equal(comebackWebhookAction(ev({ period_type: 'NORMAL' })), null);
  assert.equal(comebackWebhookAction(ev({ expiration_reason: 'BILLING_ERROR' })), null);
  assert.equal(comebackWebhookAction(ev({ entitlement_ids: ['other'] })), null);
  assert.equal(comebackWebhookAction(ev({ type: 'CANCELLATION' })), null);
  assert.equal(comebackWebhookAction(ev({ app_user_id: '' })), null);
  assert.equal(comebackWebhookAction({}), null);
  // 별칭도 후보(최대 5) · 중복 제거
  const b = comebackWebhookAction(ev({ original_app_user_id: 'user_original_1', aliases: ['$RCAnonymousID:' + 'ab'.repeat(16), 'alias_two_22'] }));
  assert.deepEqual((b as any).uids, ['$RCAnonymousID:' + 'ab'.repeat(16), 'user_original_1', 'alias_two_22']);
});

t('웹훅: 다시 결제하면 해제', () => {
  for (const type of ['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'PRODUCT_CHANGE']) {
    assert.equal(comebackWebhookAction(ev({ type, period_type: 'NORMAL', store: 'PLAY_STORE' }))?.kind, 'cancel', type);
  }
  assert.equal(comebackWebhookAction(ev({ type: 'INITIAL_PURCHASE', environment: 'SANDBOX' })), null);
});

const sub = (over: Record<string, unknown> = {}, ent: unknown = { pro: { expires_date: iso(NOW - 25 * H) } }, nonSubs: unknown = {}) => ({ subscriber: {
  entitlements: ent, non_subscriptions: nonSubs,
  subscriptions: { 'com.signumhq.app.pro.monthly': { period_type: 'trial', store: 'app_store', purchase_date: iso(NOW - 8 * D), expires_date: iso(NOW - 25 * H), unsubscribe_detected_at: iso(NOW - 6 * D), billing_issues_detected_at: null, ownership_type: 'PURCHASED', ...over } },
} });

t('RC 재확인: 해지 뒤 만료 · 결제 이력 없음 · 활성 권한 없음만 eligible', () => {
  assert.equal(comebackRcVerdict(sub(), NOW), 'eligible');
  assert.equal(comebackRcVerdict(sub({}, { pro: { expires_date: iso(NOW + D) } }), NOW), 'active');
  assert.equal(comebackRcVerdict(sub({}, { pro: { expires_date: null } }), NOW), 'active');           // 평생·프로모션
  assert.equal(comebackRcVerdict(sub({ expires_date: iso(NOW + D) }), NOW), 'active');
  assert.equal(comebackRcVerdict(sub({ period_type: 'normal' }), NOW), 'paid');
  assert.equal(comebackRcVerdict(sub({ period_type: 'intro' }), NOW), 'paid');
  assert.equal(comebackRcVerdict(sub({}, undefined, { 'com.signumhq.app.pro.year.promo': [{ id: 'x' }] }), NOW), 'paid');
  assert.equal(comebackRcVerdict(sub({ unsubscribe_detected_at: null }), NOW), 'renewing');
  assert.equal(comebackRcVerdict(sub({ billing_issues_detected_at: iso(NOW - D) }), NOW), 'renewing');
  assert.equal(comebackRcVerdict(sub({ ownership_type: 'FAMILY_SHARED' }), NOW), 'family');
  assert.equal(comebackRcVerdict(sub({ store: 'play_store' }), NOW), 'no_trial');
  assert.equal(comebackRcVerdict({ subscriber: { entitlements: {}, subscriptions: {} } }, NOW), 'no_trial');
  assert.equal(comebackRcVerdict(null, NOW), 'no_trial');
});

t('RC ID 암호화 — 원문이 저장값에 없고 같은 비밀값으로만 풀린다', () => {
  const uid = '$RCAnonymousID:' + 'cd'.repeat(16);
  const s = sealUid(uid, 'secret-1')!;
  assert.ok(s.startsWith('v1.'));
  assert.ok(!s.includes('cdcd'));
  assert.equal(openUid(s, 'secret-1'), uid);
  assert.equal(openUid(s, 'secret-2'), null);
  assert.equal(openUid(s.slice(0, -2) + 'AA', 'secret-1'), null);
  assert.equal(sealUid(uid, ''), null);
  assert.equal(openUid('plain', 'secret-1'), null);
});

t('스토어프런트 — 웹훅 country_code 로만', () => {
  assert.equal(storefrontFromCountry('KR'), 'KR');
  assert.equal(storefrontFromCountry('us'), 'US');
  assert.equal(storefrontFromCountry('JPN'), 'JP');
  assert.equal(storefrontFromCountry('CA'), null);
  assert.equal(storefrontFromCountry(undefined), null);
  // RC 거래 통화가 다르면 가격을 단정하지 않는다
  const s2 = sub({ price: { amount: 0, currency: 'USD' } });
  assert.equal(comebackRcVerdict(s2, NOW, 'KR'), 'storefront');
  assert.equal(comebackRcVerdict(s2, NOW, 'US'), 'eligible');
  assert.equal(comebackRcVerdict(sub(), NOW, 'JP'), 'storefront');            // RC·웹훅 통화 둘 다 없으면 보내지 않는다
  assert.equal(comebackRcVerdict(sub(), NOW, 'JP', true), 'eligible');       // 웹훅 통화가 맞았으면
  assert.equal(comebackRcVerdict(sub({ price: { amount: 0, currency: 'KRW' } }), NOW, 'KR', false), 'eligible');
});

t('문구 — 할인가·기간·이후 정가·자동 갱신·해지 가능(3언어) · 이모지·긴급함 없음', () => {
  const cases: Array<[string, 'KR' | 'US' | 'JP', string[]]> = [
    ['ko', 'KR', ['₩5,900', '₩11,900', '첫 2개월', '자동 갱신', '언제든 해지']],
    ['en', 'US', ['$3.99', '$9.99', 'first 2 months', 'Renews automatically', 'cancel anytime']],
    ['ja', 'JP', ['¥600', '¥1,280', '最初の2か月', '自動更新', 'いつでも解約']],
    ['ko', 'US', ['$3.99', '$9.99', '자동 갱신']],   // 한국어 화면이어도 미국 계정이면 달러
  ];
  for (const [locale, sf, must] of cases) {
    const c = comebackContent({ locale }, COMEBACK_CODE, sf)!;
    const all = c.title + ' ' + c.body;
    for (const m of must) assert.ok(all.includes(m), `${locale}/${sf}: ${m}`);
    assert.ok(c.body.includes(COMEBACK_CODE));
    assert.ok(!c.title.includes(COMEBACK_CODE));
    assert.ok(!/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(all), 'no emoji');
    assert.ok(!/선착순|마감 임박|지금 바로|hurry|last chance|今だけ|残りわずか/i.test(all));
    assert.ok(c.title.length <= 60, c.title);
  }
  assert.equal(comebackContent({ locale: 'en' }, COMEBACK_CODE, null), null);
  assert.equal(comebackContent({ locale: 'ko' }, '', 'KR'), null);
  assert.deepEqual(comebackPushData(COMEBACK_CODE), { type: 'comeback', v: '1', c: COMEBACK_CODE });
  assert.equal(COMEBACK_PRICES.KR.offer, '₩5,900');
});

const entry = { x: NOW - 25 * H, u: 'v1.x', at: NOW - 25 * H, sf: 'KR' as const };
const tok = { app: 'signum', platform: 'ios', locale: 'ko', tz: 'Asia/Seoul', notifPerm: true, preferences: { enabled: true }, lastSeenAt: iso(NOW - 2 * D) };
const st = { sent: false, recentPush: false };
t('대상 판정', () => {
  assert.equal(comebackDecision(entry, 'tok', tok, NOW, st), 'send');
  assert.equal(comebackDecision(null, 'tok', tok, NOW, st), 'invalid');
  assert.equal(comebackDecision(entry, 'tok', tok, COMEBACK_VALID_FROM - H, st), 'not_yet');
  assert.equal(comebackDecision({ ...entry, x: NOW - COMEBACK_MIN_AFTER_MS + H }, 'tok', tok, NOW, st), 'early');
  assert.equal(comebackDecision({ ...entry, x: NOW - COMEBACK_MAX_AFTER_MS - H }, 'tok', tok, NOW, st), 'window');
  assert.equal(comebackDecision(entry, 'tok', tok, NOW, { sent: true, recentPush: false }), 'sent');
  assert.equal(comebackDecision(entry, null, tok, NOW, st), 'unbound');
  assert.equal(comebackDecision(entry, 'tok', tok, NOW, { sent: false, recentPush: true }), 'recent_push');
  assert.equal(comebackDecision(entry, 'tok', null, NOW, st), 'unregistered');
  assert.equal(comebackDecision(entry, 'tok', { ...tok, app: 'uc' }, NOW, st), 'unregistered');
  assert.equal(comebackDecision(entry, 'tok', { ...tok, platform: 'android' }, NOW, st), 'not_ios');
  assert.equal(comebackDecision(entry, 'tok', { ...tok, preferences: { enabled: false } }, NOW, st), 'muted');
  assert.equal(comebackDecision(entry, 'tok', { ...tok, notifPerm: undefined }, NOW, st), 'no_permission');
  assert.equal(comebackDecision(entry, 'tok', { ...tok, lastSeenAt: iso(NOW - H) }, NOW, st), 'recent_open');
  assert.equal(comebackDecision(entry, 'tok', { ...tok, tz: 'America/New_York', locale: 'en' }, NOW, st), 'quiet_hours');   // 뉴욕 22시
});

t('끄기·코드 상수', () => {
  assert.equal(comebackEnvOff({ COMEBACK_PUSH: 'off' }), true);
  assert.equal(comebackEnvOff({ COMEBACK_PUSH: '0' }), true);
  assert.equal(comebackEnvOff({}), false);
  assert.equal(comebackEnvOff({ COMEBACK_PUSH: 'on' }), false);
  assert.equal(comebackCode(), COMEBACK_CODE);
  assert.equal(comebackCode({}), null);
  assert.equal(comebackCode({ COMEBACK_OFFER_CODE: 'bad code!' }), null);
  assert.ok(isComebackCode(COMEBACK_CODE.toLowerCase()));
  assert.ok(!isComebackCode('WEBPRO'));
  assert.ok(!isComebackCode(COMEBACK_CODE, {}));   // 설정 없으면 꺼짐
  assert.equal(comebackRedeemUrl(COMEBACK_CODE), 'https://apps.apple.com/redeem?ctx=offercodes&id=6783130444&code=' + COMEBACK_CODE);
  assert.equal(comebackRedeemUrl('https://evil.example'), null);
  assert.equal(comebackRedeemUrl(undefined), null);
  assert.deepEqual(parseEntry(JSON.stringify(entry)), entry);
  assert.deepEqual(parseEntry(entry), entry);
  assert.equal(parseEntry('{bad'), null);
  assert.equal(parseEntry({ ...entry, sf: 'GB' }), null);
});

async function pages() {
  const { desktopRedeemHtml } = await import('../src/lib/marketing/desktopHandoff');
  const base = { fromTag: 'push', redeemUrl: 'https://apps.apple.com/redeem?ctx=offercodes&id=6783130444&code=X' };
  const strip = (h: string) => h.replace(/<svg[\s\S]*?<\/svg>/, '').replace(/<[^>]+>/g, '\n');
  for (const [lang, must, mustNot] of [
    ['ko', ['첫 2개월 월 ₩5,900', '이후 월 ₩11,900 자동 갱신', '한국 App Store', '언제든 해지', '이 할인 코드는 아이폰 전용'], ['첫 달 무료', '무료 코드']],
    ['en', ['2 months, US$3.99/mo', 'then US$9.99/mo (US App Store)', 'auto-renews', 'cancel anytime'], ['first month free', 'free code']],
    ['ja', ['2か月 月額¥600', '月額¥1,280で自動更新', '日本価格', 'いつでも解約'], ['1か月無料', '無料コード']],
  ] as const) {
    const h = await desktopRedeemHtml({ ...base, code: COMEBACK_CODE, lang });
    for (const m of must) assert.ok(h.includes(m), `${lang}: ${m}`);
    for (const m of mustNot) assert.ok(!strip(h).includes(m), `${lang} must not: ${m}`);
    // 다른 코드 화면은 예전 그대로(첫 달 무료)
    const o = await desktopRedeemHtml({ ...base, code: 'OTHERCODE1', lang });
    assert.ok(!o.includes('₩5,900') && !o.includes('$3.99') && !o.includes('¥600'));
    // 같은 배치 — 태그 뼈대(글자 제외)가 같다
    const skel = (x: string) => x.replace(/<svg[\s\S]*?<\/svg>/, '<svg/>').replace(/>[^<]*</g, '><').replace(/"[^"]*"/g, '""');
    assert.equal(skel(h), skel(o), `${lang} same structure`);
  }
  n++; console.log('ok PC 코드 화면 — 이 코드만 할인 문구 · 다른 코드는 그대로 · 뼈대 동일');
}
pages().then(() => console.log(`comebackPush: ${n} passed`)).catch((e) => { console.error(e); process.exit(1); });
