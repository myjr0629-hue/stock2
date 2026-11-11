import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  isBenignWindowError, markRatingError, noteProActivated, proMomentEligible,
  PRO_PENDING_TTL_MS, RATING_ERROR_KEY, RATING_MOMENT_PRO, RATING_PRO_PENDING_KEY,
} from '../src/lib/app/ratingMoments';

class Mem {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

const NOW = 1_800_000_000_000;

// ── 순수 판정: PRO 성공 표식 · 첫 실행 · 오류 세션 · 페이월 경로 · 14일 창 ──
{
  const local = new Mem();
  const session = new Mem();
  local.setItem('signum.appSessions', '5');
  assert.equal(proMomentEligible(local, session, NOW, '/ko/app-view/dash'), false, '표식 없으면 묻지 않는다');

  assert.equal(noteProActivated(local, NOW), true, '첫 성공은 표식을 남긴다');
  assert.equal(noteProActivated(local, NOW + 1000), false, '14일 안의 두 번째 성공은 처음 시각을 유지한다');
  assert.equal(local.getItem(RATING_PRO_PENDING_KEY), String(NOW));

  assert.equal(proMomentEligible(local, session, NOW + 5000, '/ko/app-view/dash'), true, '세션 2+·오류 없음·일반 화면이면 적격');

  local.setItem('signum.appSessions', '1');
  assert.equal(proMomentEligible(local, session, NOW + 5000, '/ko/app-view/dash'), false, '첫 실행(세션 1)에는 묻지 않는다');
  local.setItem('signum.appSessions', '2');
  assert.equal(proMomentEligible(local, session, NOW + 5000, '/ko/app-view/dash'), true, '두 번째 실행부터 적격');

  assert.equal(proMomentEligible(local, session, NOW + 5000, '/ko/app-view/paywall'), false, '페이월 경로에서는 묻지 않는다');
  assert.equal(proMomentEligible(local, session, NOW + 5000, '/en/app-view/pro'), false, 'PRO 화면 경로에서는 묻지 않는다');
  assert.equal(proMomentEligible(local, session, NOW + 5000, '/en/app-view/profile'), true, '«pro» 로 시작하는 다른 경로는 막지 않는다');

  markRatingError(session);
  assert.equal(proMomentEligible(local, session, NOW + 5000, '/ko/app-view/dash'), false, '오류가 난 세션에는 묻지 않는다');
  session.removeItem(RATING_ERROR_KEY);

  assert.equal(proMomentEligible(local, session, NOW + PRO_PENDING_TTL_MS, '/ko/app-view/dash'), false, '14일이 지나면 묻지 않는다');
  assert.equal(local.getItem(RATING_PRO_PENDING_KEY), null, '만료된 표식은 지운다');
  assert.equal(noteProActivated(local, NOW + PRO_PENDING_TTL_MS + 1), true, '만료 뒤 새 성공은 새 표식');

  // 저장소가 막혀도 던지지 않는다
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(noteProActivated(broken), false);
  assert.equal(proMomentEligible(broken, broken), false);
}

// ── 무해한 창 오류는 «오류 세션»으로 세지 않는다 ──
{
  assert.equal(isBenignWindowError('ResizeObserver loop completed with undelivered notifications.'), true);
  assert.equal(isBenignWindowError('ResizeObserver loop limit exceeded'), true);
  assert.equal(isBenignWindowError('TypeError: x is undefined'), false);
  assert.equal(isBenignWindowError(undefined), false);
}

// ── 결제·코드 성공 지점이 알리고, 레이아웃이 받는다 · 복원은 알리지 않는다 · 화면 문구 변경 없음 ──
{
  const src = (f: string) => fs.readFileSync(f, 'utf8');
  const pro = src('src/hooks/useProStatus.ts');
  assert.match(pro, /if \(result\.ok && result\.isPro\) \{ proPurchaseState\.confirm\(\); setIsPro\(true\); announceProActivated\(\); \}/, '구매 성공에서 알린다');
  const restoreBody = pro.slice(pro.indexOf('const restore = useCallback'), pro.indexOf('const refreshOffers'));
  assert.ok(!restoreBody.includes('announceProActivated'), '복원은 평점 순간이 아니다');
  const redeem = src('src/lib/app/redeem.ts');
  assert.match(redeem, /void \(p\.wasNonPro \?\? Promise\.resolve\(false\)\)\.then\(\(was\) => \{ if \(was\) announceProActivated\(\); \}\)/, 'iOS 코드 복귀는 «열기 전 PRO 아님»이 확인된 경우만 알린다');
  assert.match(redeem, /const wasNonPro = confirmedNonProNow\(\)\.catch\(\(\) => false\);\n\s*pending = \{ path, at: Date\.now\(\), src, wasNonPro \};/, '열기 전 상태를 열기를 늦추지 않고 잡는다');
  assert.ok(!src('src/lib/app/foregroundProSync.ts').includes('announceProActivated'), '안드 복귀 동기화는 기존 구매 복원과 구별할 수 없어 순간으로 세지 않는다(관문 11111208 ②)');
  const moments = src('src/components/app/ReviewPromptMoments.tsx');
  assert.match(moments, /promptRatingMoment\(RATING_MOMENT_PRO, PRO_MOMENT_DELAY_MS, eligible\)/);
  assert.match(moments, /addEventListener\(PRO_ACTIVATED_EVENT, onActivated\)/);
  assert.match(moments, /const onActivated = \(\) => \{ stopWait\(\); stopWait = whenNoModal\(window, document, tryAsk\); \};/, '결제 성공은 모달이 닫힌 뒤 예약한다');
  assert.ok(moments.indexOf('runSessionMoment(window, askOnSession)') < moments.indexOf('RATING_MOMENT_PRO, PRO_MOMENT_DELAY_MS'), '세션 카운트가 먼저 돈다');
  assert.match(moments, /return null;/, '화면에는 아무것도 그리지 않는다');
}

// ── 브리지(네이티브 흉내) — 실제 요청·하루 1회·완료 뒤 재요청 없음·페이월(모달) 위에서는 요청 없음 ──
const Module = require('node:module');
const original = Module._load;
Module._load = function (name: string, ...args: unknown[]) {
  if (name === '@capacitor/core') return { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } };
  return original.call(this, name, ...args);
};
let requests = 0;
let timers: Array<{ id: number; fn: () => void }> = [];
let nextId = 1;
const local = new Mem();
const session = new Mem();
let modalOpen = false;
(globalThis as any).localStorage = local;
(globalThis as any).sessionStorage = session;
const listeners = new Map<string, Array<() => void>>();
(globalThis as any).window = {
  localStorage: local,
  location: { pathname: '/ko/app-view/dash' },
  setTimeout: (fn: () => void) => { const id = nextId++; timers.push({ id, fn }); return id; },
  clearTimeout: (id: number) => { timers = timers.filter(t => t.id !== id); },
  addEventListener: (type: string, fn: () => void) => { listeners.set(type, [...(listeners.get(type) ?? []), fn]); },
  removeEventListener: () => {},
  dispatchEvent: (e: { type: string }) => { (listeners.get(e.type) ?? []).forEach(f => f()); return true; },
  Capacitor: { isNativePlatform: () => true, Plugins: { InAppReview: { requestReview: () => { requests++; } } } },
};
(globalThis as any).document = { visibilityState: 'visible', querySelector: (q: string) => (modalOpen && q.includes('aria-modal') ? {} : null) };
const fire = () => { const t = timers.shift(); assert.ok(t, '예약된 요청이 있어야 한다'); t!.fn(); };

try {
  const bridge = require('../src/lib/native/capacitorBridge');
  const { announceProActivated, PRO_ACTIVATED_EVENT } = require('../src/lib/app/ratingMoments');
  const yesterday = '2000-01-01';
  const eligible = () => proMomentEligible(local, session, Date.now(), (globalThis as any).window.location.pathname);
  const wire = () => { (globalThis as any).window.addEventListener(PRO_ACTIVATED_EVENT, () => { bridge.promptRatingMoment(RATING_MOMENT_PRO, 4000, eligible); }); };
  wire();

  // 첫 실행에서 체험 시작 — 표식만 남고 요청은 없다
  local.setItem('signum.appSessions', '1');
  local.setItem('signumhq.review.lastAsked', yesterday); local.setItem('signum.review.lastAnyDay', yesterday);
  announceProActivated();
  assert.ok(Number(local.getItem(RATING_PRO_PENDING_KEY)) > 0, '표식이 남는다');
  assert.equal(timers.length, 0, '첫 실행에는 예약하지 않는다');

  // 다음 실행 시작 — 세션 2 → 예약 → 페이월(모달)이 떠 있으면 실행 시 건너뛴다
  local.setItem('signum.appSessions', '2');
  bridge.promptRatingMoment(RATING_MOMENT_PRO, 4000, eligible);
  assert.equal(timers.length, 1, '두 번째 실행에서 예약된다');
  modalOpen = true;
  fire();
  assert.equal(requests, 0, '모달(페이월) 위에서는 요청하지 않는다');
  assert.equal(local.getItem(`signumhq.review.prompted.attempt.${RATING_MOMENT_PRO}`), null, '막힌 회차는 기회를 소비하지 않는다');
  modalOpen = false;

  // 모달이 닫힌 뒤 다시(결제 성공 이벤트) — 실제 OS 요청 1회
  announceProActivated();
  assert.equal(timers.length, 1);
  fire();
  assert.equal(requests, 1, 'OS 평점 API 호출');
  assert.ok(JSON.parse(local.getItem('signumhq.review.prompted')!).includes(RATING_MOMENT_PRO), '순간 완료 표식');

  // 같은 날 다시 — 묻지 않는다 · 다음 날에도 완료된 순간은 다시 묻지 않는다
  announceProActivated();
  assert.equal(timers.length, 0, '같은 날 두 번 묻지 않는다');
  local.setItem('signumhq.review.lastAsked', yesterday); local.setItem('signum.review.lastAnyDay', yesterday);
  announceProActivated();
  assert.equal(timers.length, 0, '완료된 순간은 다시 묻지 않는다');
  assert.equal(requests, 1);

  // 다른 경로가 오늘 이미 물었으면 PRO 순간은 건너뛴다(표식은 남아 다음 실행에 기회)
  local.setItem('signumhq.review.prompted', '[]');
  local.setItem('signum.review.lastAnyDay', require('../src/hooks/useReviewPrompt').localReviewDay());
  announceProActivated();
  assert.equal(timers.length, 0, '오늘 다른 경로가 물었으면 건너뛴다');
  assert.ok(Number(local.getItem(RATING_PRO_PENDING_KEY)) > 0, '표식은 남는다');
} finally {
  Module._load = original;
}

// ── 관문 11111208 ① — iOS 코드 복귀: «열기 전 PRO 아님»이 확인된 경우만 체험 시작으로 본다 ──
(async () => {
  const { confirmedNonProNow } = require('../src/lib/app/redeem');
  assert.equal(await confirmedNonProNow({ sdkPro: async () => false }), true, 'SDK 가 PRO 아님으로 읽음 → 새 체험 후보');
  assert.equal(await confirmedNonProNow({ sdkPro: async () => true }), false, '이미 PRO 였으면 아님');
  assert.equal(await confirmedNonProNow({ sdkPro: async () => null }), false, 'SDK 없음 → 아님(공용 상태로 추정하지 않는다 — 관문 11111214 ①)');
  assert.equal(await confirmedNonProNow({ sdkPro: async () => { throw new Error('x'); } }), false, 'SDK 조회 실패 → 아님');
})().catch((e) => { console.error(e); process.exitCode = 1; });

// ── 관문 11111214 ② — 모달이 닫힐 때까지 기다렸다가 한 번만 부른다 · 끝내 안 닫히면 포기 · 취소 가능 ──
{
  const { whenNoModal } = require('../src/lib/app/ratingMoments');
  let q: Array<{ id: number; fn: () => void }> = []; let id = 1;
  const win = { setTimeout: (fn: () => void) => { q.push({ id: id++, fn }); return id - 1; }, clearTimeout: (x: number) => { q = q.filter(t => t.id !== x); } };
  let open = true; let asked = 0;
  const doc = { querySelector: (sel: string) => (open && sel === '[aria-modal="true"]' ? {} : null) };
  const step = () => { const t = q.shift(); assert.ok(t); t!.fn(); };
  whenNoModal(win, doc, () => { asked++; }, 1000, 5);
  step(); step();
  assert.equal(asked, 0, '모달이 열려 있는 동안은 부르지 않는다');
  open = false; step();
  assert.equal(asked, 1, '닫히면 한 번 부른다'); assert.equal(q.length, 0, '부른 뒤 더 보지 않는다');
  open = true; asked = 0;
  whenNoModal(win, doc, () => { asked++; }, 1000, 3);
  step(); step(); step();
  assert.equal(q.length, 0, '최대 횟수 뒤 그만둔다'); assert.equal(asked, 0);
  const cancel = whenNoModal(win, doc, () => { asked++; }, 1000, 3);
  cancel(); assert.equal(q.length, 0, '취소하면 타이머를 지운다');
}
