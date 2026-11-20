/**
 * ★11/20 첫 실행 체험 페이월 도달 수리 — «모름»을 «안 보임»으로 끝내지 않기 + 안 보인 이유 계측 + 광고 잠금해제 계측.
 *   ① firstRunJudge: 예전 «건너뜀» 규칙(PRO·이미 봄·결제 불가·자격 없음 확정)은 그대로, «모름» 두 갈래(오퍼링 0·iOS 자격 모름)만 재시도 → 상한 뒤 이유
 *   ② 상한 이유·늦은 표시 겹침 검사·다른 페이월 열림 판정
 *   ③ withTrialsStatus: 목록·trialDays 는 withTrials 와 같고, iOS 시간 초과·오류·UNKNOWN 만 unknown=true
 *   ④ 닫힌 목록(funnelSchema ↔ firstRunPaywall ↔ mkt-funnel) · 컴포넌트 소스 계약(배너 억제·예전 상한·계측 가드·화면 문구 없음)
 * 실행: ts-node(--transpile-only, commonjs) — 이 저장소 방식(11/19·11/20). 네트워크·실결제 없음.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { test } from 'node:test';

function mock(name: string, exports: unknown) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}

// ③ 용 가짜 네이티브(revenueCat 은 동적 import — commonjs 로 옮기면 require 다)
const cap = { platform: 'ios' };
mock('@capacitor/core', { Capacitor: { getPlatform: () => cap.platform, isNativePlatform: () => true } });
const elig: { impl: (ids: string[]) => Promise<unknown> } = { impl: async () => ({}) };
mock('@revenuecat/purchases-capacitor', { Purchases: { checkTrialOrIntroductoryPriceEligibility: ({ productIdentifiers }: { productIdentifiers: string[] }) => elig.impl(productIdentifiers) } });

const frp = require('../src/lib/app/firstRunPaywall') as typeof import('../src/lib/app/firstRunPaywall');
const rc = require('../src/services/revenueCat') as typeof import('../src/services/revenueCat');
const schema = require('../src/lib/app/funnelSchema') as typeof import('../src/lib/app/funnelSchema');
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const introFree = { introPrice: { price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1, cycles: 1 } };
const base: import('../src/lib/app/firstRunPaywall').FirstRunJudgeState = {
  iapAvailable: true, ready: true, isPro: false, pending: false, sharedPro: false, shown: false,
  offers: [{ plan: 'monthly', trialDays: 7, pkg: { product: introFree } }],
  platform: 'ios', trialUnknown: null, trialTries: 0, offerTries: 0, sinceReady: 5_000,
};
const noTrialIos = [{ plan: 'annual', trialDays: null, pkg: { product: introFree } }, { plan: 'monthly', pkg: { product: introFree } }];

test('① 예전 건너뜀 규칙은 그대로 + 이유', () => {
  assert.deepEqual(frp.firstRunJudge(base), { kind: 'check' });
  assert.deepEqual(frp.firstRunJudge({ ...base, shown: true }), { kind: 'skip', reason: 'fr_seen' });
  assert.deepEqual(frp.firstRunJudge({ ...base, isPro: true }), { kind: 'skip', reason: 'fr_pro' }, '코드 PRO 포함');
  assert.deepEqual(frp.firstRunJudge({ ...base, sharedPro: true }), { kind: 'skip', reason: 'fr_pro' });
  assert.deepEqual(frp.firstRunJudge({ ...base, pending: true }), { kind: 'skip', reason: 'fr_pro' });
  assert.deepEqual(frp.firstRunJudge({ ...base, ready: false }), { kind: 'wait' });
  assert.deepEqual(frp.firstRunJudge({ ...base, iapAvailable: false }), { kind: 'skip', reason: 'fr_noiap' });
  // 이미 봄·PRO 는 ready 전에도 곧바로(예전 firstRunPaywallStep 과 같은 순서)
  assert.deepEqual(frp.firstRunJudge({ ...base, ready: false, isPro: true }), { kind: 'skip', reason: 'fr_pro' });
  // 평생만 체험 = 체험 아님(예전과 같음) — 안드는 Play 가 자격 있는 오퍼만 주므로 «확정 없음»
  assert.deepEqual(frp.firstRunJudge({ ...base, platform: 'android', offers: [{ plan: 'lifetime', trialDays: 7 }] }), { kind: 'skip', reason: 'fr_noelig' });
  assert.deepEqual(frp.firstRunJudge({ ...base, platform: 'android', offers: [{ plan: 'monthly' }] }), { kind: 'skip', reason: 'fr_noelig' });
  // 예전 판정기(firstRunPaywallStep)와 «보인다/건너뜀/기다림»이 어긋나지 않는다(재시도 갈래 제외)
  for (const s of [base, { ...base, shown: true }, { ...base, isPro: true }, { ...base, ready: false }, { ...base, iapAvailable: false }]) {
    const a = frp.firstRunJudge(s).kind, b = frp.firstRunPaywallStep(s);
    assert.equal(a, b, JSON.stringify(s).slice(0, 80));
  }
});

test('① «모름» 갈래 — 오퍼링 0 은 잠깐 기다렸다 다시 받고, 상한 뒤 fr_nooffer', () => {
  const e = { ...base, offers: [] };
  assert.deepEqual(frp.firstRunJudge({ ...e, sinceReady: 500 }), { kind: 'wait' }, '오퍼링이 PRO 상태보다 조금 늦게 오는 정상 지연');
  assert.deepEqual(frp.firstRunJudge(e), { kind: 'retry_offers' });
  assert.deepEqual(frp.firstRunJudge({ ...e, offerTries: frp.FIRST_RUN_OFFER_TRIES - 1 }), { kind: 'retry_offers' });
  assert.deepEqual(frp.firstRunJudge({ ...e, offerTries: frp.FIRST_RUN_OFFER_TRIES }), { kind: 'skip', reason: 'fr_nooffer' });
});

test('① «모름» 갈래 — iOS 무료 소개 오퍼 상품인데 체험이 안 붙음: 묻고 · 모르면 다시 · 확정이면 fr_noelig', () => {
  const s = { ...base, offers: noTrialIos };
  assert.deepEqual(frp.firstRunJudge(s), { kind: 'retry_trials' }, '아직 직접 안 물음 — 자격 없음/모름을 가린다');
  assert.deepEqual(frp.firstRunJudge({ ...s, trialUnknown: true, trialTries: 1 }), { kind: 'retry_trials' });
  assert.deepEqual(frp.firstRunJudge({ ...s, trialUnknown: true, trialTries: frp.FIRST_RUN_TRIAL_TRIES }), { kind: 'skip', reason: 'fr_unk' });
  assert.deepEqual(frp.firstRunJudge({ ...s, trialUnknown: false, trialTries: 1 }), { kind: 'skip', reason: 'fr_noelig' }, '자격 없음 확정 = 정가 페이월 안 들이민다');
  // 유료 소개 오퍼만 있는 iOS 상품은 후보가 아니다
  assert.deepEqual(frp.firstRunJudge({ ...s, offers: [{ plan: 'monthly', pkg: { product: { introPrice: { price: 1000 } } } }] }), { kind: 'skip', reason: 'fr_noelig' });
  assert.equal(frp.iosTrialCandidate('android', noTrialIos), false);
  assert.equal(frp.iosTrialCandidate('ios', [{ plan: 'lifetime', pkg: { product: introFree } }]), false);
  assert.equal(frp.hasTrialOffer([{ plan: 'monthly', trialDays: 0 }]), false);
});

test('② 상한 이유 · 늦은 표시 겹침 검사 · 다른 페이월', () => {
  assert.equal(frp.firstRunTimeoutReason({ ready: false, offersLen: 0, checkFailed: false, busy: false }), 'fr_wait');
  assert.equal(frp.firstRunTimeoutReason({ ready: true, offersLen: 0, checkFailed: false, busy: false }), 'fr_nooffer');
  assert.equal(frp.firstRunTimeoutReason({ ready: true, offersLen: 2, checkFailed: true, busy: true }), 'fr_chk');
  assert.equal(frp.firstRunTimeoutReason({ ready: true, offersLen: 2, checkFailed: false, busy: true }), 'fr_busy');
  assert.equal(frp.firstRunTimeoutReason({ ready: true, offersLen: 2, checkFailed: false, busy: false }), 'fr_unk');
  const ok = { dialogOpen: false, gateFlow: false, visible: true, routeOk: true };
  assert.equal(frp.firstRunLateOk(ok), true);
  for (const k of ['dialogOpen', 'gateFlow'] as const) assert.equal(frp.firstRunLateOk({ ...ok, [k]: true }), false, k);
  for (const k of ['visible', 'routeOk'] as const) assert.equal(frp.firstRunLateOk({ ...ok, [k]: false }), false, k);
  assert.equal(frp.otherPaywallSince(String(1000), 900), true);
  assert.equal(frp.otherPaywallSince(String(800), 900), false, '판정 전 연 페이월은 상관없음');
  assert.equal(frp.otherPaywallSince(null, 900), false);
  assert.equal(frp.otherPaywallSince('x', 900), false);
  assert.equal(frp.otherPaywallSince(null, 0), false, 'Number(null)=0 함정');
  assert.equal(frp.otherPaywallSince('', 0), false);
  assert.ok(frp.FIRST_RUN_PAYWALL_BUDGET_MS > frp.FIRST_RUN_PAYWALL_WAIT_MS, '재시도 상한은 예전 상한보다 길다');
  assert.equal(frp.FIRST_RUN_PAYWALL_WAIT_MS, 8_000, '예전 «바로 보임» 구간 그대로');
});

const pkg = (id: string, product: Record<string, unknown>) => ({ identifier: id, product: { identifier: id, ...product } });
const list = () => [
  { plan: 'monthly', priceString: '₩11,900', pkg: pkg('m', introFree) },
  { plan: 'annual', priceString: '₩89,000', pkg: pkg('a', introFree) },
] as unknown as import('../src/services/revenueCat').PlanOffer[];

test('③ withTrialsStatus — ELIGIBLE / INELIGIBLE / UNKNOWN / 시간 초과 / 오류 · withTrials 와 같은 목록', async () => {
  cap.platform = 'ios';
  elig.impl = async (ids) => Object.fromEntries(ids.map((id) => [id, { status: 2 }]));
  let r = await rc.withTrialsStatus(list());
  assert.equal(r.unknown, false);
  assert.deepEqual(r.list.map((o) => o.trialDays), [7, 7]);
  assert.deepEqual((await rc.withTrials(list())).map((o) => o.trialDays), [7, 7], 'withTrials = withTrialsStatus().list');

  elig.impl = async (ids) => Object.fromEntries(ids.map((id) => [id, { status: 1 }]));
  r = await rc.withTrialsStatus(list());
  assert.equal(r.unknown, false, '자격 없음 확정');
  assert.deepEqual(r.list.map((o) => o.trialDays ?? null), [null, null]);

  elig.impl = async (ids) => Object.fromEntries(ids.map((id) => [id, { status: 0 }]));
  r = await rc.withTrialsStatus(list());
  assert.equal(r.unknown, true, 'UNKNOWN');
  assert.deepEqual(r.list.map((o) => o.trialDays ?? null), [null, null], '모르면 체험을 그리지 않는다(예전 그대로)');

  elig.impl = async () => ({});
  assert.equal((await rc.withTrialsStatus(list())).unknown, true, '값 없음');

  elig.impl = async () => { throw new Error('x'); };
  assert.equal((await rc.withTrialsStatus(list())).unknown, true, '오류');

  elig.impl = (ids) => new Promise((res) => setTimeout(() => res(Object.fromEntries(ids.map((id) => [id, { status: 2 }]))), 3_400));
  const t0 = Date.now();
  r = await rc.withTrialsStatus(list());
  assert.equal(r.unknown, true, '3초 초과');
  assert.ok(Date.now() - t0 < 3_300);

  // 하나라도 ELIGIBLE 이면 확정
  elig.impl = async () => ({ m: { status: 2 }, a: { status: 0 } });
  r = await rc.withTrialsStatus(list());
  assert.equal(r.unknown, false);
  assert.deepEqual(r.list.map((o) => o.trialDays ?? null), [7, null]);

  // 안드는 묻지 않는다(Play 가 자격 있는 오퍼만 준다) — 모름 없음
  cap.platform = 'android';
  r = await rc.withTrialsStatus(list());
  assert.equal(r.unknown, false);
  assert.deepEqual((await rc.withTrialsStatus([])), { list: [], unknown: false });
  cap.platform = 'ios';
});

test('④ 닫힌 목록 — funnelSchema ↔ firstRunPaywall ↔ mkt-funnel', () => {
  const S = new Set<string>(schema.FUNNEL_SRCS), T = new Set<string>(schema.FUNNEL_STAGES);
  for (const s of [...frp.FIRST_RUN_SKIPS, 'fr_try', 'fr_late']) assert.ok(S.has(s) && schema.isFunnelSrc(s), s);
  for (const st of ['fr_judge', 'reward_ok']) assert.ok(T.has(st) && schema.isFunnelStage(st), st);
  assert.equal(new Set(schema.FUNNEL_SRCS).size, schema.FUNNEL_SRCS.length);
  assert.equal(new Set(schema.FUNNEL_STAGES).size, schema.FUNNEL_STAGES.length);
  const mf = require('../scripts/mkt-funnel.js');
  assert.deepEqual(mf.STAGES, [...schema.FUNNEL_STAGES]);
  assert.deepEqual(mf.SRCS, [...schema.FUNNEL_SRCS]);
  const src = read('scripts/mkt-funnel.js');
  assert.ok(/NON_FUNNEL_STAGES = new Set\(\[[^\]]*'fr_judge', 'reward_ok', 'rw_then'\]\)/.test(src), '본표 열에 섞이지 않는다(머리줄 11칸 고정 · 11/20 오후 rw_then 추가)');
  assert.ok(src.includes('...TRIAL_PUSH_SRCS, ...FR_SRCS,'), 'fr_* 출처는 본표 행에서 빠진다');
});

test('④ 컴포넌트 계약 — 배너 억제 · 예전 상한 · 계측 가드 · 재조회 · 화면 문구 0', () => {
  const c = read('src/components/app/FirstRunTrialPaywall.tsx');
  assert.ok(/useBannerSuppression\(true\);\s*return \(\s*<ProPaywall/.test(c), '떠 있는 동안 배너 내림(3.1.2 줄 가림 방지)');
  assert.ok(/src="first_run"\s*trialHead/.test(c), '같은 ProPaywall 체험 화면');
  assert.ok(/claimOnbShow\(guard, session\(\)\)\) trackFunnel\('fr_judge'/.test(c), '실행당 한 번 가드');
  assert.ok(c.includes("countOnce('fr_try', 'fr_try')") && c.includes("countOnce(r.reason, 'fr_out')"), '판정 시작·결론 한 번씩');
  assert.ok(/fetchPro: fetchProStatus/.test(c), '보이기 직전 스토어 재조회 유지(코드 PRO 보호)');
  assert.ok(/mark: \(\) => markFirstRunPaywallShown\(store\(\)\)/.test(c), '표식 기록 유지');
  assert.ok(/r\.kind === 'gone'\) return;/.test(c), '판정 중 해제는 세지 않는다');
  const lib = read('src/lib/app/firstRunPaywall.ts');
  assert.ok(/const isLate = \(\) => d\.now\(\) - startedAt > FIRST_RUN_PAYWALL_WAIT_MS;/.test(lib), '예전 상한 안에서는 겹침 검사 없이 예전처럼');
  // 화면 문구·라벨을 새로 만들지 않는다 — JSX 텍스트 노드·한글/일본어 문자열 없음(주석 제외)
  const code = c.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '')).join('\n');
  assert.ok(!/[가-힣ぁ-んァ-ン一-龥]/.test(code), '코드에 화면 문구 없음');
  const v = read('src/components/app/ValueWall.tsx');
  assert.equal((v.match(/trackFunnel\('reward_ok', \{ src: '(value_wall|ad_modal)' \}\)/g) || []).length, 2, '광고 잠금해제 계측 두 곳(보상형·대체 창)');
  assert.ok(/const UNLOCK_MS = 60 \* 60 \* 1000;/.test(v), '잠금해제 시간은 1시간 그대로(11/20 오후부터 범위만 «누른 잠금 하나» — tests/adUnlockScope1120)');
});

// ── ⑤ 판정 고리(runFirstRunLoop) — 가짜 시계 ─────────────────────────────────────────────
type O = { plan: string; trialDays?: number | null; pkg?: { product?: { introPrice?: { price?: number } | null } | null } | null };
function harness(over: Partial<import('../src/lib/app/firstRunPaywall').FirstRunLoopDeps<O>> & { snapV?: Partial<ReturnType<import('../src/lib/app/firstRunPaywall').FirstRunLoopDeps<O>['snap']>> } = {}) {
  let t = 0;
  const calls = { fetchPro: 0, trials: 0, raw: 0, mark: 0 };
  const sv = { isPro: false, ready: true, trialsReady: true, iapAvailable: true, offers: [{ plan: 'monthly', trialDays: 7 }] as O[], ...(over.snapV || {}) };
  const d: import('../src/lib/app/firstRunPaywall').FirstRunLoopDeps<O> = {
    now: () => t,
    sleep: async (ms) => { t += ms; },
    alive: () => true,
    snap: () => sv,
    pending: () => false,
    sharedPro: () => false,
    shown: () => false,
    platform: 'ios',
    rawOffers: async () => { calls.raw++; return []; },
    trials: async (l) => { calls.trials++; return { list: l, unknown: false }; },
    fetchPro: async () => { calls.fetchPro++; return false; },
    lateEnv: () => ({ dialogOpen: false, gateFlow: false, visible: true, routeOk: true }),
    openedAt: () => null,
    mark: () => { calls.mark++; return true; },
    ...over,
  };
  return { d, calls, sv, advance: (ms: number) => { t += ms; }, time: () => t };
}

test('⑤ 빠른 길 — 체험 붙은 오퍼 + 재조회 무료 → 바로 보임(늦음 아님 · 겹침 검사 안 함)', async () => {
  const h = harness({ lateEnv: () => ({ dialogOpen: true, gateFlow: true, visible: false, routeOk: false }) });
  const r = await frp.runFirstRunLoop(h.d);
  assert.equal(r.kind, 'show');
  assert.equal((r as { late: boolean }).late, false);
  assert.equal(h.calls.fetchPro, 1);
  assert.equal(h.calls.mark, 1);
});

test('⑤ 코드 PRO — 훅 PRO 면 곧바로 fr_pro · 재조회가 PRO 면 fr_pro(표식 안 남김)', async () => {
  let h = harness({ snapV: { isPro: true } });
  assert.deepEqual(await frp.runFirstRunLoop(h.d), { kind: 'skip', reason: 'fr_pro' });
  assert.equal(h.calls.fetchPro, 0);
  h = harness({ fetchPro: async () => true });
  assert.deepEqual(await frp.runFirstRunLoop(h.d), { kind: 'skip', reason: 'fr_pro' });
  assert.equal(h.calls.mark, 0);
});

test('⑤ iOS 자격 «모름» → 다시 물어 ELIGIBLE 이면 보임(late=재시도) · 끝내 모르면 fr_unk · 확정 없음이면 fr_noelig', async () => {
  const cand: O[] = [{ plan: 'monthly', pkg: { product: { introPrice: { price: 0 } } } }];
  let n = 0;
  let h = harness({ snapV: { offers: cand }, trials: async (l) => { n++; return n < 2 ? { list: l, unknown: true } : { list: l.map((o) => ({ ...o, trialDays: 7 })), unknown: false }; } });
  let r = await frp.runFirstRunLoop(h.d);
  assert.equal(r.kind, 'show');
  assert.equal((r as { late: boolean }).late, true, '재시도로 살아남 = fr_late');
  assert.equal((r as { offers: O[] }).offers[0].trialDays, 7, '다시 물은 목록으로 보인다');
  h = harness({ snapV: { offers: cand }, trials: async (l) => ({ list: l, unknown: true }) });
  assert.deepEqual(await frp.runFirstRunLoop(h.d), { kind: 'skip', reason: 'fr_unk' });
  h = harness({ snapV: { offers: cand }, trials: async (l) => { h.calls.trials++; return { list: l, unknown: false }; } });
  assert.deepEqual(await frp.runFirstRunLoop(h.d), { kind: 'skip', reason: 'fr_noelig' });
  assert.equal(h.calls.trials, 1, '확정이면 한 번만 묻는다');
  assert.equal(h.calls.fetchPro, 0, '정가 페이월 판정으로 가지 않는다');
});

test('⑤ 오퍼링 0 → 다시 받아 보임 · 끝내 0 이면 fr_nooffer', async () => {
  let h = harness({ snapV: { offers: [] }, rawOffers: async () => [{ plan: 'monthly', trialDays: 7 }] });
  let r = await frp.runFirstRunLoop(h.d);
  assert.equal(r.kind, 'show');
  h = harness({ snapV: { offers: [] } });
  r = await frp.runFirstRunLoop(h.d);
  assert.deepEqual(r, { kind: 'skip', reason: 'fr_nooffer' });
  assert.equal(h.calls.raw, frp.FIRST_RUN_OFFER_TRIES);
  // 오퍼링 조회가 매달려도(응답 없음) 4초 상한으로 넘어간다 — 고리가 멈추지 않는다
  h = harness({ snapV: { offers: [] }, rawOffers: () => new Promise(() => {}) });
  const t0 = Date.now();
  r = await frp.runFirstRunLoop(h.d);
  assert.deepEqual(r, { kind: 'skip', reason: 'fr_nooffer' });
  assert.ok(Date.now() - t0 < frp.FIRST_RUN_CHECK_TIMEOUT_MS * frp.FIRST_RUN_OFFER_TRIES + 1_500);
});

test('⑤ 재조회 실패 → 다시 · 세 번 실패면 fr_chk · 두 번째에 무료면 보임(late)', async () => {
  let h = harness({ fetchPro: async () => { throw new Error('net'); } });
  assert.deepEqual(await frp.runFirstRunLoop(h.d), { kind: 'skip', reason: 'fr_chk' });
  let k = 0;
  h = harness({ fetchPro: async () => { k++; if (k === 1) throw new Error('net'); return false; } });
  const r = await frp.runFirstRunLoop(h.d);
  assert.equal(r.kind, 'show');
  assert.equal((r as { late: boolean }).late, true);
});

test('⑤ PRO 상태가 늦게 와도 상한 안이면 기다렸다 판정 · 끝내 안 오면 30초에 fr_wait', async () => {
  const h = harness({ snapV: { ready: false } });
  let calls = 0;
  const d = { ...h.d, snap: () => { calls++; return { ...h.sv, ready: calls > 20 }; } };   // 약 5초(250ms × 20) 뒤 ready
  let r = await frp.runFirstRunLoop(d);
  assert.equal(r.kind, 'show');
  assert.equal((r as { late: boolean }).late, false, '8초 안 = 예전과 같은 «바로»');
  const h2 = harness({ snapV: { ready: false } });
  r = await frp.runFirstRunLoop(h2.d);
  assert.deepEqual(r, { kind: 'skip', reason: 'fr_wait' });
  assert.ok(h2.time() >= frp.FIRST_RUN_PAYWALL_BUDGET_MS && h2.time() < frp.FIRST_RUN_PAYWALL_BUDGET_MS + 1_000);
});

test('⑤ 늦은 표시 — 다른 시트가 떠 있으면 기다렸다 닫히면 보임 · 그 사이 다른 페이월이 열렸으면 fr_busy · 끝까지 떠 있으면 fr_busy', async () => {
  // 오퍼링이 9초 뒤에야 체험과 함께 온다 → 늦은 표시
  let h = harness();
  let open = true;
  const sv = { ...h.sv, offers: [] as O[] };
  const d = { ...h.d, snap: () => (h.time() >= 9_000 ? { ...sv, offers: [{ plan: 'monthly', trialDays: 7 }] } : sv), rawOffers: async () => [],
    lateEnv: () => { if (h.time() >= 15_000) open = false; return { dialogOpen: open, gateFlow: false, visible: true, routeOk: true }; } };
  let r = await frp.runFirstRunLoop(d);
  assert.equal(r.kind, 'show');
  assert.ok(h.time() >= 15_000, '시트가 닫힌 뒤');
  assert.equal((r as { late: boolean }).late, true);

  h = harness();
  const d2 = { ...h.d, snap: () => (h.time() >= 9_000 ? { ...h.sv } : { ...h.sv, offers: [] as O[] }), rawOffers: async () => [], openedAt: () => String(5_000) };
  assert.deepEqual(await frp.runFirstRunLoop(d2), { kind: 'skip', reason: 'fr_busy' }, '판정 뒤 다른 페이월(게이트 등)이 열림 = 같은 세션 두 번 금지');

  h = harness();
  const d3 = { ...h.d, snap: () => (h.time() >= 9_000 ? { ...h.sv } : { ...h.sv, offers: [] as O[] }), rawOffers: async () => [], lateEnv: () => ({ dialogOpen: false, gateFlow: false, visible: false, routeOk: true }) };
  assert.deepEqual(await frp.runFirstRunLoop(d3), { kind: 'skip', reason: 'fr_busy' }, '앱이 끝내 뒤에 있음');
  assert.equal(h.calls.mark, 0);
});

test('⑤ 이미 봄 · 기록 실패 · 해제', async () => {
  let h = harness({ shown: () => true });
  assert.deepEqual(await frp.runFirstRunLoop(h.d), { kind: 'skip', reason: 'fr_seen' });
  h = harness({ mark: () => false });
  assert.deepEqual(await frp.runFirstRunLoop(h.d), { kind: 'skip', reason: 'fr_seen' });
  let alive = true;
  h = harness({ alive: () => alive, fetchPro: async () => { alive = false; return false; } });
  assert.deepEqual(await frp.runFirstRunLoop(h.d), { kind: 'gone' });
  assert.equal(h.calls.mark, 0);
});

test('⑤ 관문 11201013 — 재조회는 성공·실패 합쳐 3번까지 · 30초를 넘겨 끝난 재조회 뒤엔 안 띄움', async () => {
  // 늦은 표시: 재조회 성공 직후마다 시트가 열렸다 닫히기를 반복 → 무료 답을 10초 재사용, 호출 ≤ 3
  let h = harness();
  let flip = 0;
  const d = { ...h.d, snap: () => (h.time() >= 9_000 ? { ...h.sv } : { ...h.sv, offers: [] as O[] }), rawOffers: async () => [] as O[],
    lateEnv: () => { flip++; return { dialogOpen: flip % 2 === 0, gateFlow: false, visible: true, routeOk: true }; } };
  let r = await frp.runFirstRunLoop(d);
  assert.ok(h.calls.fetchPro <= frp.FIRST_RUN_CHECK_TRIES, `재조회 ${h.calls.fetchPro}회`);
  assert.ok(r.kind === 'show' || r.kind === 'skip');
  // 시트가 늘 열려 있으면 재조회 없이 상한에 fr_busy
  h = harness();
  const d2 = { ...h.d, snap: () => (h.time() >= 9_000 ? { ...h.sv } : { ...h.sv, offers: [] as O[] }), rawOffers: async () => [] as O[],
    lateEnv: () => ({ dialogOpen: true, gateFlow: false, visible: true, routeOk: true }) };
  assert.deepEqual(await frp.runFirstRunLoop(d2), { kind: 'skip', reason: 'fr_busy' });
  assert.equal(h.calls.fetchPro, 0, '겹침이면 묻지도 않는다');
  // 29.5초에 시작한 재조회가 30초를 넘겨 끝남 → 띄우지 않음
  h = harness();
  const d3 = { ...h.d, snap: () => (h.time() >= 29_500 ? { ...h.sv } : { ...h.sv, offers: [] as O[] }), rawOffers: async () => [] as O[],
    fetchPro: async () => { h.calls.fetchPro++; h.advance(1_000); return false; } };
  r = await frp.runFirstRunLoop(d3);
  assert.equal(r.kind, 'skip');
  assert.equal(h.calls.mark, 0, '상한 뒤 표식·표시 없음');
  // 재조회가 늘 실패 → 정확히 3번 묻고 fr_chk
  h = harness({ fetchPro: async () => { h.calls.fetchPro++; throw new Error('net'); } });
  assert.deepEqual(await frp.runFirstRunLoop(h.d), { kind: 'skip', reason: 'fr_chk' });
  assert.equal(h.calls.fetchPro, frp.FIRST_RUN_CHECK_TRIES);
  // 무료 답 뒤 훅이 PRO 로 바뀌면(코드 PRO 늦게 도착) 재사용하지 않고 건너뜀
  h = harness();
  let pro = false;
  const d4 = { ...h.d, snap: () => ({ ...h.sv, isPro: pro }), fetchPro: async () => { h.calls.fetchPro++; pro = true; return false; } };
  assert.deepEqual(await frp.runFirstRunLoop(d4), { kind: 'skip', reason: 'fr_pro' });
  assert.equal(h.calls.mark, 0);
});
