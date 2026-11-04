import assert from 'node:assert/strict';
import fs from 'node:fs';
import { countRatingPush, markRatingError, markReactionSeen, markSessionError, ratingSessionEligible, RATING_ERROR_KEY, RATING_MOMENT_PUSH, RATING_MOMENT_REACTION } from '../src/lib/app/ratingMoments';

class Mem {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

// ── 세션 조건·표식 ──
{
  const local = new Mem();
  let session = new Mem();
  local.setItem('signum.appSessions', '2');
  assert.equal(ratingSessionEligible(local, session), false, '세션 2회는 부적격');
  local.setItem('signum.appSessions', '3');
  assert.equal(ratingSessionEligible(local, session), true, '세션 3회부터 적격');
  assert.equal(markReactionSeen(session), true);
  assert.equal(markReactionSeen(session), false, '반응 행은 세션 첫 표시 1회');
  markRatingError(session);
  assert.equal(ratingSessionEligible(local, session), false, '오류 세션은 부적격');
  assert.equal(countRatingPush('morning', local, session), 0);
  assert.equal(countRatingPush('wl_signal', local, session), 1);
  assert.equal(countRatingPush('wl_signal', local, session), 0, '같은 세션은 한 번만 센다');
  session = new Mem();
  assert.equal(countRatingPush('wl_signal', local, session), 2);
  session = new Mem();
  assert.equal(countRatingPush('wl_signal', local, session), 3);
}

// ── 관문 11050112 ② — 처리된 오류 화면도 세션을 표시한다 ──
{
  const session = new Mem();
  (globalThis as any).sessionStorage = session;
  markSessionError();
  assert.equal(session.getItem(RATING_ERROR_KEY), '1', 'markSessionError 가 세션 오류 표식을 남긴다');
  const local = new Mem(); local.setItem('signum.appSessions', '5');
  assert.equal(ratingSessionEligible(local, session), false);
  const intel = fs.readFileSync('src/app/[locale]/app-view/intel/page.tsx', 'utf8');
  assert.match(intel, /useEffect\(\(\) => \{ if \(crossBriefError\) markSessionError\(\); \}, \[crossBriefError\]\);/, '장마감 리포트 불러오기 실패 화면이 표식을 남긴다');
  const rankings = fs.readFileSync('src/app/[locale]/app-view/rankings/page.tsx', 'utf8');
  assert.match(rankings, /if \(err\) markSessionError\(\)/);
  const wl = fs.readFileSync('src/app/[locale]/app-view/watchlist/page.tsx', 'utf8');
  assert.match(wl, /if \(showsLoadError\) markSessionError\(\)/);
  const moments = fs.readFileSync('src/components/app/ReviewPromptMoments.tsx', 'utf8');
  assert.match(moments, /addEventListener\('error'/);
  assert.match(moments, /addEventListener\('unhandledrejection'/);
}

// ── 브리지(네이티브 흉내) ──
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
(globalThis as any).localStorage = local;
(globalThis as any).sessionStorage = session;
(globalThis as any).window = {
  location: { pathname: '/ko/app-view/earnings' },
  setTimeout: (fn: () => void) => { const id = nextId++; timers.push({ id, fn }); return id; },
  clearTimeout: (id: number) => { timers = timers.filter(t => t.id !== id); },
  Capacitor: { isNativePlatform: () => true, Plugins: { InAppReview: { requestReview: () => { requests++; } } } },
};
(globalThis as any).document = { visibilityState: 'visible', querySelector: () => null };
const fire = () => { const t = timers.shift(); assert.ok(t, '예약된 요청이 있어야 한다'); t!.fn(); };

try {
  const bridge = require('../src/lib/native/capacitorBridge');
  const hook = require('../src/hooks/useReviewPrompt');
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const yesterday = '2000-01-01';

  // ① 기존 마일스톤(사용일 2·7, 실행 0)을 모두 쓴 사용자도 새 순간은 따로 판정한다
  local.setItem('signumhq.review.prompted', JSON.stringify([2, 7, 0]));
  local.setItem('signumhq.review.lastAsked', yesterday);
  local.setItem('signum.appSessions', '6');
  const eligible = () => ratingSessionEligible(local, session);
  bridge.maybePromptReview(0);
  assert.equal(timers.length, 0, '기존 마일스톤 소진 — 마일스톤 경로는 요청 없음');
  bridge.promptRatingMoment(RATING_MOMENT_REACTION, 3000, eligible);
  assert.equal(timers.length, 1, '마일스톤을 다 써도 새 순간은 예약된다');
  fire();
  assert.equal(requests, 1, 'OS 평점 API 호출');
  assert.deepEqual(JSON.parse(local.getItem('signumhq.review.prompted')!), [2, 7, 0, RATING_MOMENT_REACTION]);
  assert.equal(local.getItem('signumhq.review.lastAsked'), today);

  // 같은 날은 다른 순간도 묻지 않는다(기존 하루 1회 표식 재사용)
  bridge.promptRatingMoment(RATING_MOMENT_PUSH, 3000, eligible);
  assert.equal(timers.length, 0, '같은 날 두 번 묻지 않는다');
  // 다음 날 — 알림 순간은 따로 1회
  local.setItem('signumhq.review.lastAsked', yesterday);
  bridge.promptRatingMoment(RATING_MOMENT_REACTION, 3000, eligible);
  assert.equal(timers.length, 0, '이미 요청한 순간은 다시 묻지 않는다');
  bridge.promptRatingMoment(RATING_MOMENT_PUSH, 3000, eligible);
  assert.equal(timers.length, 1); fire();
  assert.equal(requests, 2);

  // 세션 조건(3회 미만)·오류 세션이면 예약조차 안 한다
  local.setItem('signumhq.review.prompted', '[]');
  local.setItem('signumhq.review.lastAsked', yesterday);
  local.setItem('signum.appSessions', '2');
  bridge.promptRatingMoment(RATING_MOMENT_REACTION, 3000, eligible);
  assert.equal(timers.length, 0, '세션 2회는 요청 없음');
  local.setItem('signum.appSessions', '6');
  markRatingError(session);
  bridge.promptRatingMoment(RATING_MOMENT_REACTION, 3000, eligible);
  assert.equal(timers.length, 0, '오류 세션은 요청 없음');
  session.removeItem(RATING_ERROR_KEY);

  // 순간별 실제 요청 2회 상한 재사용
  local.setItem(`signumhq.review.prompted.attempt.${RATING_MOMENT_REACTION}`, '2');
  bridge.promptRatingMoment(RATING_MOMENT_REACTION, 3000, eligible);
  assert.equal(timers.length, 0, '시도 2회 상한');
  local.setItem(`signumhq.review.prompted.attempt.${RATING_MOMENT_REACTION}`, '0');

  // ③ 예약 뒤 취소(화면 이탈) — 선물 안내용 요청 시각을 원래 값으로 되돌린다
  const before = hook.reviewRequestedAt();
  const cancel = bridge.promptRatingMoment(RATING_MOMENT_REACTION, 3000, eligible);
  assert.ok(hook.reviewRequestedAt() > before, '예약 동안은 선물 안내가 끼어들지 않게 시각을 잡는다');
  cancel();
  assert.equal(hook.reviewRequestedAt(), before, '취소하면 요청 시각을 복원한다');
  assert.equal(timers.length, 0, '취소하면 타이머도 지운다');
  assert.equal(requests, 2);
  assert.equal(local.getItem(`signumhq.review.prompted.attempt.${RATING_MOMENT_REACTION}`), '0', '취소는 기회를 소비하지 않는다');

  // ③ 실행 시점에 순간이 무효(다른 화면으로 이동) — 요청 없이 시각 복원
  let onScreen = true;
  bridge.promptRatingMoment(RATING_MOMENT_REACTION, 3000, () => eligible() && onScreen);
  onScreen = false;
  fire();
  assert.equal(requests, 2, '화면을 떠났으면 요청하지 않는다');
  assert.equal(hook.reviewRequestedAt(), before, '무효 순간은 요청 시각을 남기지 않는다');
  const { giftAnnounceBlock } = require('../src/lib/gift/giftAnnounce');
  assert.equal(typeof giftAnnounceBlock, 'function');
  // 진행 중 집합이 풀려 다음 기회에 다시 예약된다
  bridge.promptRatingMoment(RATING_MOMENT_REACTION, 3000, eligible);
  assert.equal(timers.length, 1); fire();
  assert.equal(requests, 3);

  // 광고 직후에는 예약하지 않는다(기존 겹침 검사 재사용)
  local.setItem('signumhq.review.lastAsked', yesterday);
  local.setItem('signum_interstitial_frequency', JSON.stringify({ lastShownAt: Date.now() }));
  bridge.promptRatingMoment(RATING_MOMENT_PUSH, 0, eligible);
  assert.equal(timers.length, 0, '광고 직후 금지');
  local.setItem('signum_interstitial_frequency', '{}');

  // 기존 호출자(대시·UC·WIM)용 maybePromptReview 시그니처는 그대로(인자 1개)
  assert.equal(bridge.maybePromptReview.length, 0);
  const src = fs.readFileSync('src/lib/native/capacitorBridge.ts', 'utf8');
  assert.match(src, /export function maybePromptReview\(delayMs = 2500\): void \{/);
  // 화면 연결: 실적 화면 이탈 시 취소 · 알림 탭은 새 순간 함수
  const earnings = fs.readFileSync('src/app/[locale]/app-view/earnings/page.tsx', 'utf8');
  assert.match(earnings, /useEffect\(\(\) => \(\) => cancelRatingRef\.current\(\), \[\]\);/);
  assert.match(earnings, /promptRatingMoment\(RATING_MOMENT_REACTION, 3000, eligible\)/);
  const layout = fs.readFileSync('src/app/[locale]/app-view/layout.tsx', 'utf8');
  assert.match(layout, /promptRatingMoment\(RATING_MOMENT_PUSH, 3000/);
  console.log('새 평점 순간 조건 통과');
} finally {
  Module._load = original;
}
