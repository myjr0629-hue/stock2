import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claimTrialWatchlist, newTrialPeriod } from '../src/lib/app/trialStartWatchlist';

const now = Date.parse('2026-11-11T12:00:00Z');
const product = 'com.signumhq.app.pro.monthly';
const entitlement = { isActive: true, periodType: 'TRIAL', ownershipType: 'PURCHASED', willRenew: true, store: 'APP_STORE', productIdentifier: product, latestPurchaseDate: new Date(now).toISOString(), expirationDate: new Date(now + 30 * 86400_000).toISOString() };
const before = { entitlements: { active: {}, all: {} }, activeSubscriptions: [] } as any;
const info = (e: object) => ({ entitlements: { active: { pro: e }, all: { pro: e } }, activeSubscriptions: [product] }) as any;
const period = (b = before, a = info(entitlement), platform = 'ios') => newTrialPeriod(b, a, platform, product, now - 1000, now + 1000);
const memory = () => { const data = new Map<string, string>(); return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } }; };

test('실제 신규 체험을 확인한 구매만 기간당 한 번 이동', () => {
  const p = period(); const store = memory();
  assert.ok(p);
  assert.equal(claimTrialWatchlist(p, '/ko/app-view/settings', store), true);
  assert.equal(claimTrialWatchlist(p, '/ko/app-view/settings', store), false);
  assert.equal(claimTrialWatchlist(p, '/ko/app-view/watchlist', memory()), false);
  assert.equal(claimTrialWatchlist(p, '/ko/app-view/settings', { getItem: () => null, setItem: () => { throw Error(); } }), false);
});

test('기존 구독·코드 체험 재진입·오래된 체험·다른 스토어·상품은 제외', () => {
  assert.equal(period(info(entitlement)), null);
  assert.equal(period({ entitlements: { active: {}, all: { pro: { ...entitlement, store: 'PROMOTIONAL' } } }, activeSubscriptions: [] }), null);
  assert.equal(period(before, info({ ...entitlement, latestPurchaseDate: new Date(now - 120_000).toISOString() })), null);
  assert.equal(period(before, info({ ...entitlement, store: 'PROMOTIONAL' })), null);
  assert.equal(period(before, info({ ...entitlement, productIdentifier: 'other' })), null);
  assert.equal(period(before, info({ ...entitlement, periodType: 'NORMAL' })), null);
  assert.equal(period(before, info(entitlement), 'android'), null);
  assert.equal(period(null), null);
});

test('복원·취소·실패는 구매 성공 콜백 조건을 통과하지 못한다', () => {
  const store = memory();
  const purchaseCallback = (kind: string, result: { ok: boolean; isPro: boolean }) => kind === 'purchase' && result.ok && result.isPro && claimTrialWatchlist(period(), '/ko/app-view/settings', store);
  assert.equal(purchaseCallback('restore', { ok: true, isPro: true }), false);
  assert.equal(purchaseCallback('purchase', { ok: false, isPro: false }), false);
  assert.equal(purchaseCallback('purchase', { ok: true, isPro: false }), false);
  assert.equal(purchaseCallback('purchase', { ok: true, isPro: true }), true);
});

// ── ★11/12 관문 11112153 — 공용 구매 흐름(두 진입점) · 닫힌 뒤 구매 창 금지 ──
import { purchaseWithTrialStart } from '../src/lib/app/trialStartWatchlist';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const flow = (o: { path?: string; plan?: string; reads?: any[]; open?: () => boolean; result?: { ok: boolean; isPro: boolean }; store?: ReturnType<typeof memory>; readDelay?: number }) => {
  let bought = 0;
  const reads = o.reads ?? [];
  const st = o.store ?? memory();
  const run = purchaseWithTrialStart({
    plan: o.plan ?? 'monthly', product,
    purchase: async () => { bought++; return o.result ?? { ok: true, isPro: true }; },
    stillOpen: o.open ?? (() => true),
    read: async () => { if (o.readDelay) await new Promise((r) => setTimeout(r, o.readDelay)); return reads.shift() ?? null; },
    path: () => o.path ?? '/ko/app-view/stock/NVDA', storage: () => st, now: () => now,
  });
  return { run, bought: () => bought };
};
const liveBefore = { info: before, platform: 'ios' }, liveAfter = { info: info(entitlement), platform: 'ios' };

test('공용 흐름: 신규 체험이면 claimed · 같은 기간 두 번째는 아님', async () => {
  const st = memory();
  const a = flow({ reads: [liveBefore, liveAfter], store: st });
  const r = await a.run; assert.equal(a.bought(), 1); assert.equal(r!.claimed, true); assert.equal(r!.origin, '/ko/app-view/stock/NVDA');
  const b = flow({ reads: [liveBefore, liveAfter], store: st });
  assert.equal((await b.run)!.claimed, false);
});

test('공용 흐름: 구매 전 읽기 중에 닫았으면 구매 창을 열지 않는다(관문 11112153 ②)', async () => {
  let open = true;
  const a = flow({ reads: [liveBefore, liveAfter], open: () => open, readDelay: 20 });
  setTimeout(() => { open = false; }, 5);
  assert.equal(await a.run, null);
  assert.equal(a.bought(), 0);
});

test('공용 흐름: 내 종목 화면·평생·알림 경로(plan none)는 읽지 않고 바로 구매 · 이동 없음', async () => {
  for (const o of [{ path: '/ko/app-view/watchlist' }, { plan: 'lifetime' }, { plan: 'none' }]) {
    let closedCheck = 0;
    const a = flow({ ...o, reads: [liveBefore, liveAfter], open: () => { closedCheck++; return false; } });
    const r = await a.run;
    assert.equal(a.bought(), 1, JSON.stringify(o)); assert.equal(r!.claimed, false); assert.equal(closedCheck, 0, '바로 구매하는 경로는 예전과 같다');
  }
});

test('공용 흐름: 실패·취소·구매 후 읽기 실패 → 이동 없음', async () => {
  assert.equal((await flow({ reads: [liveBefore, liveAfter], result: { ok: false, isPro: false } }).run)!.claimed, false);
  assert.equal((await flow({ reads: [liveBefore] }).run)!.claimed, false);
  assert.equal((await flow({ reads: [null, liveAfter] }).run)!.claimed, false, '구매 전 읽기 실패 → 이동 없음(구매는 한다)');
});

test('두 구매 진입점이 같은 흐름을 쓴다(관문 11112153 ①)', () => {
  const root = join(__dirname, '..', 'src', 'components', 'app');
  const pay = readFileSync(join(root, 'ProPaywall.tsx'), 'utf8');
  const upsell = readFileSync(join(root, 'watchlist', 'ProUpsellSheet.tsx'), 'utf8');
  assert.match(pay, /purchaseWithTrialStart\(/); assert.match(upsell, /purchaseWithTrialStart\(/);
  assert.match(upsell, /onNavigate\('watchlist'\)/);
  assert.match(upsell, /if \(alive\.current\) \{ notifyProPurchased\(true\); onBecamePro\(\); \}/, '먼저 끝나도 한도 시트의 종목 담기를 거친다(관문 11121040)');
  assert.doesNotMatch(upsell, /await purchase\('monthly'\);/, '시트의 직접 구매가 공용 흐름을 건너뛰지 않는다');
  assert.match(pay, /onClick=\{closeByUser\}/, '닫기 버튼은 «닫혔음»을 남긴다');
});
