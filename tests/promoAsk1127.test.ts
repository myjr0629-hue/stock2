/** Offline: node -r ./scripts/offline-test-typescript.cjs --test tests/promoAsk1127.test.ts — 혜택·할인 알림 동의 한 번 묻기(lib/app/promoAsk · lib/push/promoSave · 시트·판정기·레이아웃 · 저장 끝까지) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PROMO_ASK_COPY, PROMO_ASK_KEY, PROMO_ASK_REASK_MS, PROMO_ASK_FG_MS, PROMO_ASK_QUIET_MS, PROMO_ASK_PAYWALL_MS, PUSH_TOKEN_KEY,
  askDue, askRound, claimAsk, needsAsk, nextStoredPrefs, paidPro, promoAskSrc, promoAskStep, promoRouteOk, readAsk, recordAnswer,
  type PromoAskState,
} from '../src/lib/app/promoAsk';
import { savePromoConsent } from '../src/lib/push/promoSave';
import { mergePrefs, mergeRegistration, promoChangedAt, sanitizePrefs, PUSH_PREFS_STORAGE_KEY } from '../src/lib/push/prefs';
import { promoAllowed, promoToast } from '../src/lib/push/promoConsent';
import { bfPushDecision, type BfTokenRec } from '../src/lib/push/bfPush';
import { comebackDeviceGate } from '../src/lib/push/comebackPush';
import { FUNNEL_SRCS, FUNNEL_STAGES } from '../src/lib/app/funnelSchema';

const DAY = 86400_000;
const mem = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => { m.set(k, v); }, m };
};
const throwing = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };

test('빈도 — 기기당 1번 · 거절 30일 뒤 1번 더 · 받기면 끝 · 깨진 값·막힌 저장소 = 안 묻는다', () => {
  const st = mem();
  const t0 = Date.parse('2026-11-27T03:00:00Z');
  assert.equal(readAsk(st), null);
  assert.equal(askDue(readAsk(st), t0), true);
  assert.equal(askRound(readAsk(st)), 1);
  assert.equal(claimAsk(st, t0), true);
  assert.equal(claimAsk(st, t0 + 1), false, '같은 차례 두 번 기록 안 됨');
  recordAnswer(st, 'no');
  assert.equal(askDue(readAsk(st), t0 + 29 * DAY), false);
  assert.equal(askDue(readAsk(st), t0 + PROMO_ASK_REASK_MS), true);
  assert.equal(askRound(readAsk(st)), 2);
  assert.equal(claimAsk(st, t0 + 31 * DAY), true);
  recordAnswer(st, 'no');
  assert.equal(askDue(readAsk(st), t0 + 400 * DAY), false, '두 번이 끝');
  // 답 없이 닫힘(앱 종료) = 거절과 같다
  const s2 = mem();
  claimAsk(s2, t0);
  assert.equal(askDue(readAsk(s2), t0 + 31 * DAY), true);
  // 받기
  const s3 = mem();
  claimAsk(s3, t0);
  recordAnswer(s3, 'yes');
  assert.equal(askDue(readAsk(s3), t0 + 400 * DAY), false);
  // 깨진 값·막힌 저장소
  assert.equal(askDue(readAsk(mem({ [PROMO_ASK_KEY]: '{oops' })), t0), false);
  assert.equal(askDue(readAsk(mem({ [PROMO_ASK_KEY]: '{"n":"a"}' })), t0), false);
  assert.equal(askDue(readAsk(throwing), t0), false);
  assert.equal(askDue(readAsk(null), t0), false);
  assert.equal(claimAsk(throwing, t0), false);
  assert.equal(claimAsk(null, t0), false);
  assert.equal(promoAskSrc(1, 'ko'), 'pa_ko');
  assert.equal(promoAskSrc(2, 'ja'), 'pa2_ja');
});

test('대상 — iOS 전체 · 한국 안드(언어 ko 또는 서울 시간대)만 · 이미 정한 값·웹은 묻지 않는다', () => {
  assert.equal(needsAsk('ios', 'en', 'America/New_York', undefined), true);
  assert.equal(needsAsk('ios', 'ko', 'Asia/Seoul', undefined), true);
  assert.equal(needsAsk('ios', 'ja', 'Asia/Tokyo', undefined), true);
  assert.equal(needsAsk('android', 'ko', 'Asia/Seoul', undefined), true);
  assert.equal(needsAsk('android', 'en', 'Asia/Seoul', undefined), true);
  assert.equal(needsAsk('android', 'en', 'America/New_York', undefined), false, '한국 밖 안드는 기본 켜짐 — 묻지 않는다');
  assert.equal(needsAsk('android', 'ja', 'Asia/Tokyo', undefined), false);
  assert.equal(needsAsk('ios', 'en', null, true), false);
  assert.equal(needsAsk('ios', 'en', null, false), false, '설정에서 끈 사람은 묻지 않는다');
  assert.equal(needsAsk('web', 'ko', 'Asia/Seoul', undefined), false);
});

test('유료 PRO 판정 — TRIAL·무료 = 묻는다 · NORMAL·INTRO = 유료 · 정보 없음 = 모름', () => {
  assert.equal(paidPro(null), null);
  assert.equal(paidPro({}), null);
  assert.equal(paidPro({ entitlements: { active: {} } }), false);
  assert.equal(paidPro({ entitlements: { active: { pro: { isActive: true, periodType: 'TRIAL' } } } }), false);
  assert.equal(paidPro({ entitlements: { active: { pro: { isActive: true, periodType: 'NORMAL' } } } }), true);
  assert.equal(paidPro({ entitlements: { active: { pro: { isActive: true, periodType: 'INTRO' } } } }), true);
  assert.equal(paidPro({ entitlements: { active: { pro: { isActive: false, periodType: 'NORMAL' } } } }), false);
});

test('판정 — 한 시트씩 · 조용할 때만 · 권한 허용만', () => {
  const ok: PromoAskState = {
    native: true, due: true, needs: true, appOff: false, hasToken: true, perm: 'granted', paid: false, onboarded: true,
    dialogOpen: false, purchasePending: false, gateFlow: false, adBusy: false, reviewBusy: false, visible: true, routeOk: true, proQuiet: false,
    fgFor: PROMO_ASK_FG_MS, quietFor: Infinity, paywallFor: Infinity,
  };
  assert.equal(promoAskStep(ok), 'show');
  for (const k of ['native', 'due', 'needs'] as const) assert.equal(promoAskStep({ ...ok, [k]: false }), 'stop', k);
  assert.equal(promoAskStep({ ...ok, hasToken: false }), 'later', '첫 실행 등록이 끝나기 전 — 기다린다');
  assert.equal(promoAskStep({ ...ok, appOff: true }), 'stop');
  assert.equal(promoAskStep({ ...ok, perm: 'denied' }), 'stop');
  assert.equal(promoAskStep({ ...ok, perm: 'prompt' }), 'later', '첫 실행에서 허용하면 같은 실행 뒤쪽에서 묻는다');
  assert.equal(promoAskStep({ ...ok, perm: 'unknown' }), 'later');
  assert.equal(promoAskStep({ ...ok, paid: true }), 'stop');
  assert.equal(promoAskStep({ ...ok, paid: null }), 'need_info');
  assert.equal(promoAskStep({ ...ok, paid: null, dialogOpen: true }), 'later', '유료 조회도 조용할 때만');
  for (const k of ['dialogOpen', 'purchasePending', 'gateFlow', 'adBusy', 'reviewBusy', 'proQuiet'] as const) assert.equal(promoAskStep({ ...ok, [k]: true }), 'later', k);
  for (const k of ['onboarded', 'visible', 'routeOk'] as const) assert.equal(promoAskStep({ ...ok, [k]: false }), 'later', k);
  assert.equal(promoAskStep({ ...ok, fgFor: PROMO_ASK_FG_MS - 1 }), 'later');
  assert.equal(promoAskStep({ ...ok, quietFor: PROMO_ASK_QUIET_MS - 1 }), 'later');
  assert.equal(promoAskStep({ ...ok, paywallFor: PROMO_ASK_PAYWALL_MS - 1 }), 'later');
  assert.equal(promoRouteOk('/ko/app-view/dash'), true);
  assert.equal(promoRouteOk('/en/app-view'), true);
  assert.equal(promoRouteOk('/ko/app-view/settings'), false);
  assert.equal(promoRouteOk('/ko/app-view/terms'), false);
  assert.equal(promoRouteOk('/ko/pricing'), false);
});

test('저장값 — 설정 화면 기본값 위에 promo 만', () => {
  assert.deepEqual(nextStoredPrefs(null, true), { enabled: true, morning: true, closing: true, signals: true, promo: true });
  assert.deepEqual(nextStoredPrefs('{"enabled":true,"morning":false,"closing":true}', true), { enabled: true, morning: false, closing: true, signals: true, promo: true });
  assert.deepEqual(nextStoredPrefs('{"enabled":true,"morning":true,"closing":false,"signals":false,"promo":false}', true).closing, false);
  assert.deepEqual(nextStoredPrefs('{bad', true), { enabled: true, morning: true, closing: true, signals: true, promo: true });
});

test('저장 끝까지 — 시트 저장 → PUT 본문 → 서버 병합·promoAt → 블프 크론·comeback 이 동의자로 본다 · 다음 실행 등록도 같은 값', async () => {
  const st = mem({ [PUSH_TOKEN_KEY]: 'tok-ios-1', [PUSH_PREFS_STORAGE_KEY]: '{"enabled":true,"morning":false,"closing":true,"signals":true}' });
  const calls: { url: string; body: string }[] = [];
  const r = await savePromoConsent(true, { store: st, fetch: async (url, init) => { calls.push({ url, body: init.body }); return { ok: true }; } });
  assert.equal(r, 'server');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/push/preferences');
  const body = JSON.parse(calls[0].body);
  assert.deepEqual(body, { token: 'tok-ios-1', enabled: true, morning: false, closing: true, signals: true, promo: true });
  assert.equal(JSON.parse(st.getItem(PUSH_PREFS_STORAGE_KEY)!).promo, true);
  assert.equal(JSON.parse(st.getItem(PUSH_PREFS_STORAGE_KEY)!).morning, false, '다른 칸은 그대로');

  // 서버(api/push/preferences PUT)와 같은 계산
  const existing: BfTokenRec & { promoAt?: string } = { token: 'tok-ios-1', app: 'signum', platform: 'ios', locale: 'ko', tz: 'Asia/Seoul', preferences: { enabled: true, morning: false, closing: true }, notifPerm: true, lastSeenAt: '2026-11-27T00:00:00Z' };
  const nowIso = '2026-11-27T01:00:00.000Z';
  const nextPrefs = mergePrefs(existing.preferences as never, sanitizePrefs(body));
  const promoAt = promoChangedAt(existing as never, nextPrefs, nowIso);
  const saved = { ...existing, preferences: nextPrefs, ...(promoAt ? { promoAt } : {}) };
  assert.equal(saved.preferences.promo, true);
  assert.equal(saved.promoAt, nowIso, '동의 일자 기록');
  assert.equal(promoAllowed(saved), true);
  assert.equal(promoAllowed(existing), false, '저장 전엔 동의 없음');
  // 블프 B 회차(서울 12/1 19:37 = 10:37 UTC)
  const B = Date.parse('2026-12-01T10:37:00Z');
  assert.deepEqual(bfPushDecision(existing, B), { send: false, skip: 'no_consent' });
  const d = bfPushDecision(saved, B);
  assert.equal(d.send, true);
  if (d.send) { assert.equal(d.wave, 'b'); assert.equal(d.korea, true); }
  assert.equal(comebackDeviceGate(existing as never), 'no_consent');
  assert.equal(comebackDeviceGate(saved as never), 'ok');

  // PUT 이 실패해도 다음 실행의 /api/push/register 가 같은 저장값을 싣는다(AppFirstRunOnboarding postToken: preferences: readStoredPushPrefs())
  const stored = sanitizePrefs(JSON.parse(st.getItem(PUSH_PREFS_STORAGE_KEY)!));
  const reg = mergeRegistration(existing as never, { token: 'tok-ios-1', platform: 'ios', locale: 'ko', preferences: stored, notifPerm: true } as never, nowIso);
  assert.equal(reg.preferences.promo, true);
  assert.equal(reg.promoAt, nowIso);
  assert.equal(promoAllowed(reg as never), true);
});

test('저장 실패 경로 — 토큰 없음·PUT 실패 = 기기에만(local) · 저장소 없음 = fail', async () => {
  const noTok = mem();
  assert.equal(await savePromoConsent(true, { store: noTok, fetch: async () => { throw new Error('x'); } }), 'local');
  assert.equal(JSON.parse(noTok.getItem(PUSH_PREFS_STORAGE_KEY)!).promo, true);
  const t = mem({ [PUSH_TOKEN_KEY]: 'tok' });
  assert.equal(await savePromoConsent(true, { store: t, fetch: async () => ({ ok: false, status: 500 }) }), 'local');
  assert.equal(await savePromoConsent(true, { store: t, fetch: async () => { throw new Error('net'); } }), 'local');
  assert.equal(await savePromoConsent(true, { store: null, fetch: async () => ({ ok: true }) }), 'fail');
  assert.equal(await savePromoConsent(true, { store: throwing as never, fetch: async () => ({ ok: true }) }), 'fail');
});

test('문구 — 광고성·무엇을·끄는 곳(설정 토글과 같은 이름)·선택 · 미국 주식 앱 · 이모지·투자 권유 없음 · 두 단추', () => {
  const settings = readFileSync('src/app/[locale]/app-view/settings/page.tsx', 'utf8');
  const label = { ko: '혜택·할인 알림', en: 'Offers & Discounts', ja: 'お得な情報の通知' } as const;
  const notif = { ko: '알림', en: 'Notifications', ja: '通知' } as const;
  for (const loc of ['ko', 'en', 'ja'] as const) {
    const c = PROMO_ASK_COPY[loc];
    assert.ok(settings.includes(`promo: '${label[loc]}'`), `설정 토글 이름 ${loc}`);
    assert.ok(c.off.includes(label[loc]) && c.off.includes(notif[loc]), `끄는 곳 ${loc}`);
    const all = Object.values(c).join(' ');
    assert.doesNotMatch(all, /\p{Extended_Pictographic}/u, `이모지 ${loc}`);
    assert.doesNotMatch(all, /매수|매도|수익 보장|추천 종목|buy now|sell|guarantee|買い|売り|선착순|마지막 기회|last chance/i, `투자 권유·긴급 ${loc}`);
    assert.ok(c.yes.length > 0 && c.no.length > 0);
  }
  assert.match(PROMO_ASK_COPY.ko.eyebrow + PROMO_ASK_COPY.ko.body, /광고성/);
  assert.match(PROMO_ASK_COPY.ko.body, /미국 주식 앱/);
  assert.match(PROMO_ASK_COPY.ko.eyebrow, /선택/);
  assert.match(PROMO_ASK_COPY.en.body, /US stock app/);
  assert.match(PROMO_ASK_COPY.en.body, /promotional/);
  assert.match(PROMO_ASK_COPY.ja.body, /米国株アプリ/);
  assert.match(PROMO_ASK_COPY.ja.body, /広告/);
  assert.equal(PROMO_ASK_COPY.ko.yes, '받기');
  assert.equal(PROMO_ASK_COPY.ko.no, '괜찮아요');
  assert.match(promoToast('ko', true, new Date(2026, 10, 27)), /^2026\.11\.27 혜택·할인 알림 수신에 동의했어요$/);
});

test('퍼널 — 닫힌 목록에 단계·출처 · 읽기 스크립트에 줄', () => {
  for (const st of ['promo_ask_show', 'promo_ask_yes', 'promo_ask_no']) assert.ok((FUNNEL_STAGES as readonly string[]).includes(st), st);
  for (const s of ['pa_ko', 'pa_en', 'pa_ja', 'pa2_ko', 'pa2_en', 'pa2_ja']) assert.ok((FUNNEL_SRCS as readonly string[]).includes(s), s);
  const r = require('../scripts/mkt-funnel.js');
  assert.deepEqual(r.STAGES, [...FUNNEL_STAGES]);
  assert.deepEqual(r.SRCS, [...FUNNEL_SRCS]);
  const src = readFileSync('scripts/mkt-funnel.js', 'utf8');
  assert.match(src, /혜택·할인 알림 동의 묻기/);
});

test('소스 계약 — 레이아웃에 하나 · 시트는 같은 무게 두 단추·저장 길·aria-modal · 판정기는 다른 시트를 본다', () => {
  const layout = readFileSync('src/app/[locale]/app-view/layout.tsx', 'utf8');
  assert.equal((layout.match(/<PromoAskHost \/>/g) || []).length, 1);
  const sheet = readFileSync('src/components/app/PromoAskSheet.tsx', 'utf8');
  assert.match(sheet, /aria-modal="true"/);
  assert.match(sheet, /savePromoConsent\(true\)/);
  assert.equal((sheet.match(/className=\{s\.btn\}/g) || []).length, 2, '두 단추 같은 클래스');
  assert.match(sheet, /trackFunnel\('promo_ask_yes'/);
  assert.match(sheet, /trackFunnel\('promo_ask_no'/);
  assert.doesNotMatch(sheet, /defaultChecked|checked=\{true\}/, '미리 체크 없음');
  const gate = readFileSync('src/components/app/PromoAskGate.tsx', 'utf8');
  assert.match(gate, /\[aria-modal="true"\], \[data-pro-paywall\]/);
  assert.match(gate, /claimAsk\(store\)/);
  assert.match(gate, /trackFunnel\('promo_ask_show'/);
  assert.match(gate, /promoToast\(/);
  const host = readFileSync('src/components/app/PromoAskHost.tsx', 'utf8');
  assert.doesNotMatch(host, /from '\.\/PromoAskGate'/, '판정기는 동적으로만');
});
