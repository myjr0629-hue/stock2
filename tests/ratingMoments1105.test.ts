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
  // 처리된 오류 화면마다 표식(문구 옆에 아무것도 그리지 않는 SessionErrorMark, 또는 실패 처리부의 markSessionError)
  const mark = fs.readFileSync('src/components/app/SessionErrorMark.tsx', 'utf8');
  assert.match(mark, /useEffect\(\(\) => \{ markSessionError\(\); \}, \[\]\);/);
  assert.match(mark, /return null;/, '화면에는 아무것도 그리지 않는다');
  const src = (f: string) => fs.readFileSync(f, 'utf8');
  const marks: Array<[string, RegExp]> = [
    ['src/app/[locale]/app-view/intel/page.tsx', /\{crossBriefError && <SessionErrorMark \/>\}\n\s*\{crossBriefError && <p role="status">/],
    ['src/app/[locale]/app-view/intel/page.tsx', /\{!\(globalReportLoading && !crossBriefError\) && <SessionErrorMark \/>\}\n\s*<p role="status">\{closingDate\} \{globalReportLoading && !crossBriefError \?/],
    ['src/app/[locale]/app-view/rankings/page.tsx', /\{err && <SessionErrorMark \/>\}/],
    ['src/app/[locale]/app-view/watchlist/page.tsx', /<SessionErrorMark \/>\n\s*\{t\.fail\} · <button/],
    ['src/app/[locale]/app-view/cmd/page.tsx', /<>\n\s*<SessionErrorMark \/>\n\s*<div className=\{s\.header\}>/],
    ['src/app/[locale]/app-view/cmd/page.tsx', /<SessionErrorMark \/>\n\s*<span>\{\(\(\) => \{\n\s*const hm = new Date\(staleSince\)/],
    ['src/app/[locale]/app-view/flow/page.tsx', /\{!loading && !tickerData && \(\n\s*<div[^\n]*>\n\s*<SessionErrorMark \/>/],
    ['src/app/[locale]/app-view/dash/page.tsx', /\{adGate\.proError && <SessionErrorMark \/>\}/],
    ['src/components/app/GuruLens.tsx', /\{g\.proError && <SessionErrorMark \/>\}/],
    ['src/components/app/NetworkStatus.tsx', /<SessionErrorMark \/>/],
    ['src/components/app/watchlist/TickerSearchOverlay.tsx', /<SessionErrorMark \/>\n\s*\{c\.searchFail\}/],
    ['src/components/app/ProPaywall.tsx', /\{ markSessionError\(\); setNote\(t\.failed\); \}/],
    ['src/components/app/watchlist/ProUpsellSheet.tsx', /\{ markSessionError\(\); setNote\(c\.purchaseFailed\); \}/],
    ['src/components/app/CouponGuideSheet.tsx', /\{ markSessionError\(\); setNote\(t\.failed\); \}/],
    ['src/components/app/watchlist/ProUpsellSheet.tsx', /if \(!r\.ok\) markSessionError\(\);\n\s*setNote\(r\.ok && r\.isPro \? legal\.restored/],
  ];
  for (const [f, re] of marks) assert.match(src(f), re, `${f} 오류 화면 표식`);
  // 화면에 보이는 실패 문구는 모두 표식이 붙어 있다(빠진 화면이 없게 — 관문 11050220)
  for (const f of ['src/app/[locale]/app-view/cmd/page.tsx', 'src/app/[locale]/app-view/intel/page.tsx', 'src/app/[locale]/app-view/watchlist/page.tsx', 'src/app/[locale]/app-view/flow/page.tsx']) {
    assert.ok(src(f).includes('SessionErrorMark'), f);
  }
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
  local.setItem('signumhq.review.lastAsked', yesterday); local.setItem('signum.review.lastAnyDay', yesterday);
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
  local.setItem('signumhq.review.lastAsked', yesterday); local.setItem('signum.review.lastAnyDay', yesterday);
  bridge.promptRatingMoment(RATING_MOMENT_REACTION, 3000, eligible);
  assert.equal(timers.length, 0, '이미 요청한 순간은 다시 묻지 않는다');
  bridge.promptRatingMoment(RATING_MOMENT_PUSH, 3000, eligible);
  assert.equal(timers.length, 1); fire();
  assert.equal(requests, 2);

  // 세션 조건(3회 미만)·오류 세션이면 예약조차 안 한다
  local.setItem('signumhq.review.prompted', '[]');
  local.setItem('signumhq.review.lastAsked', yesterday); local.setItem('signum.review.lastAnyDay', yesterday);
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

  // 관문 11050217 ③ — 겹친 예약 A·B 를 모두 취소해도 취소된 시각이 되살아나지 않는다
  local.setItem('signumhq.review.prompted', '[]');
  local.setItem('signumhq.review.lastAsked', yesterday); local.setItem('signum.review.lastAnyDay', yesterday);
  local.setItem(`signumhq.review.prompted.attempt.${RATING_MOMENT_REACTION}`, '0');
  const base3 = hook.reviewRequestedAt();
  const cancelA = bridge.promptRatingMoment(RATING_MOMENT_REACTION, 3000, eligible);
  const atA = hook.reviewRequestedAt();
  let bOk = true;
  bridge.promptRatingMoment(RATING_MOMENT_PUSH, 3000, () => eligible() && bOk);
  assert.ok(hook.reviewRequestedAt() >= atA);
  cancelA();
  bOk = false;
  fire();
  assert.equal(timers.length, 0);
  assert.equal(hook.reviewRequestedAt(), base3, '겹친 예약이 모두 무효면 선물 안내 기준 시각은 처음 그대로');
  // 직접 예약 함수로도: A 취소 → B 무효(순서 반대) 역시 복원
  const cA = hook.scheduleReviewRequest(3000, () => {}, false);
  const cB = hook.scheduleReviewRequest(3000, () => {}, false);
  cB(); cA();
  assert.equal(hook.reviewRequestedAt(), base3);
  assert.equal(timers.length, 0);

  // 관문 11050217 ② — 새 순간 예약 뒤 같은 3초 안에 기존 마일스톤도 예약돼도, 새 순간이 먼저 물었으면 마일스톤은 실행 시 건너뛴다
  local.setItem('signumhq.review.prompted', '[]');
  local.setItem('signumhq.review.lastAsked', yesterday); local.setItem('signum.review.lastAnyDay', yesterday);
  local.setItem('signumhq.review.days', JSON.stringify(['2000-01-02', '2000-01-03']));
  local.setItem('signumhq.review.prompted.attempt.2', '0');
  local.setItem(`signumhq.review.prompted.attempt.${RATING_MOMENT_PUSH}`, '0');
  session.removeItem('signumhq.review.prompted.attempt.2');
  const reqBefore = requests;
  bridge.promptRatingMoment(RATING_MOMENT_PUSH, 3000, eligible);
  bridge.maybePromptReview(3000);
  assert.equal(timers.length, 2, '두 경로 모두 예약됨');
  fire();
  assert.equal(requests, reqBefore + 1, '새 순간이 물음');
  fire();
  assert.equal(requests, reqBefore + 1, '같은 날 마일스톤은 OS API 를 다시 부르지 않는다');
  assert.equal(local.getItem('signumhq.review.prompted.attempt.2'), '0', '건너뛴 마일스톤은 기회를 소비하지 않는다');

  // 관문 11050224 ② — 기존 훅 순간(세션·담기·AI 한 줄)이 오늘 실제로 물었으면 새 순간은 예약도 실행도 하지 않는다
  local.setItem('signumhq.review.prompted', '[]');
  local.setItem('signumhq.review.lastAsked', yesterday); local.setItem('signum.review.lastAnyDay', yesterday);
  local.setItem(`signumhq.review.prompted.attempt.${RATING_MOMENT_PUSH}`, '0');
  local.setItem('signum.review.lastAnyDay', yesterday);
  const r0 = requests;
  hook.attemptReview('signum.appSessions', 3, 2500, true, () => {});
  bridge.promptRatingMoment(RATING_MOMENT_PUSH, 3000, eligible);
  assert.equal(timers.length, 2, '둘 다 예약(아직 아무도 묻지 않음)');
  fire();
  assert.equal(requests, r0 + 1, '기존 세션 순간이 물음');
  assert.equal(local.getItem('signum.review.lastAnyDay'), today, '실제 요청일 기록');
  fire();
  assert.equal(requests, r0 + 1, '같은 날 새 순간은 실행 시 건너뛴다');
  bridge.promptRatingMoment(RATING_MOMENT_PUSH, 3000, eligible);
  assert.equal(timers.length, 0, '같은 날 새 순간은 예약하지 않는다');
  local.setItem('signum.review.lastAnyDay', yesterday);

  // 광고 직후에는 예약하지 않는다(기존 겹침 검사 재사용)
  local.setItem('signumhq.review.lastAsked', yesterday); local.setItem('signum.review.lastAnyDay', yesterday);
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
