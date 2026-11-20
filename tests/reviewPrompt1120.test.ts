/**
 * ★11/20 스토어 평점 요청 — 계측(rv_*) · 시작 시트에 막힌 순간의 같은 실행 재시도 · 가치 순간 넓히기
 * 실행: node -r ts-node/register -r tsconfig-paths/register tests/reviewPrompt1120.test.ts (TS_NODE_TRANSPILE_ONLY=1)
 *
 * 지키는 것:
 *   ① 계측: OS API 를 실제로 부르면 rv_ask(순간) · 막히면 rv_block(순간)+rv_why(이유) · 플러그인 없으면 rv_why rv_noplug · UC·WIM(guard 없음)은 보내지 않는다
 *   ② rv_cap: 네이티브 기기마다 ET 하루 1회(있음/없음) · 웹·저장소 막힘은 보내지 않는다
 *   ③ 시작 순간(사용일·실행·세션·알림 탭)이 시트(aria-modal)에 막히면 시트가 닫힌 뒤 같은 실행에서 다시 — 실행당 최대 3번 · 광고 직후는 다시 잡지 않는다
 *   ④ 하루 1회·순간당 실제 요청 2회 상한·OS 평점 API 만(자체 팝업 없음) — 기존 그대로
 *   ⑤ 실적 «범위 안» 반응 행은 내 종목이 아니어도 순간 표식(data 속성 하나 — 화면 변화 없음)
 *   ⑥ 읽기 스크립트(mkt-funnel.js)의 rv 목록 = 스키마
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FUNNEL_SRCS, FUNNEL_STAGES } from '../src/lib/app/funnelSchema';
import { reportReviewCapability, reviewSrcFor, reviewWhySrc, setReviewBeaconSender, REVIEW_CAP_DAY_KEY } from '../src/lib/app/reviewBeacon';

class Mem {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };

// ── 순수 부분 ──
t('순간 출처 매핑 — SIGNUM 키만, UC·WIM 은 null', () => {
  assert.equal(reviewSrcFor('signumhq.review.prompted', 2), 'rv_day');
  assert.equal(reviewSrcFor('signumhq.review.prompted', 7), 'rv_day');
  assert.equal(reviewSrcFor('signumhq.review.prompted', 0), 'rv_run');
  assert.equal(reviewSrcFor('signumhq.review.prompted', 101), 'rv_earn');
  assert.equal(reviewSrcFor('signumhq.review.prompted', 102), 'rv_push');
  assert.equal(reviewSrcFor('signumhq.review.prompted', 103), 'rv_pro');
  assert.equal(reviewSrcFor('signum.appSessions', 3), 'rv_run');
  assert.equal(reviewSrcFor('signum.watchAdds', 2), 'rv_watch');
  assert.equal(reviewSrcFor('signum.aiLineTaps', 2), 'rv_ai');
  assert.equal(reviewSrcFor('signum.reportOpens', 2), 'rv_intel');
  assert.equal(reviewSrcFor('signum.earningsOpens', 2), 'rv_earn');
  assert.equal(reviewSrcFor('uc.storyOpens', 3), null);
  assert.equal(reviewSrcFor('wim.setsFinished', 2), null);
  for (const r of ['modal', 'ad', 'gift', 'hidden', 'err', 'gone', 'cancel', 'today', 'noplug'] as const) {
    assert.ok((FUNNEL_SRCS as readonly string[]).includes(reviewWhySrc(r)), r);
  }
  assert.equal(reviewWhySrc('cancel'), 'rv_gone');
});

t('rv_cap — 네이티브 기기마다 ET 하루 1회 · 웹·저장소 막힘은 보내지 않는다', () => {
  const sent: string[] = [];
  const send = (st: string, s: string) => { sent.push(`${st}:${s}`); };
  const ls = new Mem();
  const yes = { Capacitor: { isNativePlatform: () => true, Plugins: { InAppReview: { requestReview: () => {} } } }, localStorage: ls };
  assert.equal(reportReviewCapability(yes, '2026-11-20', send as any), 'rv_yes');
  assert.equal(reportReviewCapability(yes, '2026-11-20', send as any), null, '같은 날 두 번 보내지 않는다');
  assert.equal(ls.getItem(REVIEW_CAP_DAY_KEY), '2026-11-20');
  const no = { Capacitor: { isNativePlatform: () => true, Plugins: {} }, localStorage: ls };
  assert.equal(reportReviewCapability(no, '2026-11-21', send as any), 'rv_no');
  assert.equal(reportReviewCapability({ Capacitor: { isNativePlatform: () => false }, localStorage: new Mem() }, '2026-11-21', send as any), null, '웹');
  const blocked = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
  assert.equal(reportReviewCapability({ Capacitor: { isNativePlatform: () => true }, localStorage: blocked }, '2026-11-21', send as any), null, '저장소 막힘');
  assert.deepEqual(sent, ['rv_cap:rv_yes', 'rv_cap:rv_no']);
});

t('스키마·읽기 스크립트 — rv 단계·출처가 닫힌 목록에 있고 mkt-funnel.js 와 같다', () => {
  for (const st of ['rv_cap', 'rv_ask', 'rv_block', 'rv_why']) assert.ok((FUNNEL_STAGES as readonly string[]).includes(st), st);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const r = require('../scripts/mkt-funnel.js');
  assert.deepEqual(r.RV_STAGES, ['rv_cap', 'rv_ask', 'rv_block', 'rv_why']);
  for (const s of r.RV_SRCS) assert.ok((FUNNEL_SRCS as readonly string[]).includes(s), s);
  assert.deepEqual([...r.RV_SRCS].sort(), (FUNNEL_SRCS as readonly string[]).filter((s) => s.startsWith('rv_')).sort());
});

t('실적 «범위 안» 반응 행 표식은 내 종목 조건 없이 data 속성 하나(화면 변화 없음)', () => {
  const page = fs.readFileSync('src/app/[locale]/app-view/earnings/page.tsx', 'utf8');
  assert.match(page, /<span data-rating-reaction=\{e\.implied\?\.within === true \? "1" : undefined\} className=\{`\$\{s\.ecReaction\}/);
  assert.ok(!/data-rating-reaction=\{myList/.test(page));
});

// ── 가짜 네이티브 환경(브리지·훅 그대로) ──
const Module = require('node:module');
const original = Module._load;
Module._load = function (name: string, ...args: unknown[]) {
  if (name === '@capacitor/core') return { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } };
  return original.call(this, name, ...args);
};
let requests = 0;
let timers: Array<{ id: number; fn: () => void; ms: number }> = [];
let nextId = 1;
const local = new Mem();
let session = new Mem();
const beacons: string[] = [];
let modalOpen = false;
const plugin = { requestReview: () => { requests++; return Promise.resolve(); } };
const win: any = {
  location: { pathname: '/ko/app-view/dash' },
  setTimeout: (fn: () => void, ms: number) => { const id = nextId++; timers.push({ id, fn, ms }); return id; },
  clearTimeout: (id: number) => { timers = timers.filter(x => x.id !== id); },
  Capacitor: { isNativePlatform: () => true, Plugins: { InAppReview: plugin } },
};
(globalThis as any).window = win;
(globalThis as any).localStorage = local;
(globalThis as any).sessionStorage = session;
(globalThis as any).document = { visibilityState: 'visible', querySelector: (q: string) => (modalOpen && q.includes('aria-modal') ? {} : null) };
const flush = () => { const q = timers.splice(0); q.forEach(x => x.fn()); return q.length; };
const flushAll = (max = 400) => { let k = 0; while (timers.length && k < max) { flush(); k++; } };
const yesterday = '2000-01-01';
const resetDay = () => { local.setItem('signumhq.review.lastAsked', yesterday); local.setItem('signum.review.lastAnyDay', yesterday); };
const newLaunch = () => { session = new Mem(); (globalThis as any).sessionStorage = session; };

try {
  setReviewBeaconSender((st, s) => { beacons.push(`${st}:${s}`); });
  const bridge = require('../src/lib/native/capacitorBridge');
  const hook = require('../src/hooks/useReviewPrompt');
  const rm = require('../src/lib/app/ratingMoments');

  t('사용일 2번째 — 시작 시트에 막히면 시트가 닫힌 뒤 같은 실행에서 요청(예전: 다음 냉시작까지)', () => {
    local.setItem('signumhq.review.days', JSON.stringify([yesterday]));
    resetDay(); modalOpen = true; beacons.length = 0; hook.resetReviewModalRetries();
    bridge.maybePromptReview(2500);
    assert.equal(requests, 0);
    assert.deepEqual(beacons, ['rv_block:rv_day', 'rv_why:rv_modal'], '막힘 계측(순간·이유)');
    assert.equal(local.getItem('signumhq.review.prompted.attempt.2'), null, '막힌 회차는 기회를 소비하지 않는다');
    flush(); flush();                       // 시트가 아직 떠 있다 — 지켜보기만
    assert.equal(requests, 0);
    modalOpen = false;
    flush();                                // 시트 닫힘 감지 → 순간 자신의 지연(2.5초)으로 다시 예약
    assert.equal(timers.length, 1);
    assert.equal(timers[0].ms, 2500);
    flush();
    assert.equal(requests, 1, '같은 실행에서 OS 평점 API 요청');
    assert.deepEqual(beacons.slice(2), ['rv_ask:rv_day']);
    assert.deepEqual(JSON.parse(local.getItem('signumhq.review.prompted')!), [2]);
    bridge.maybePromptReview(2500); flushAll();
    assert.equal(requests, 1, '같은 날 두 번 묻지 않는다');
  });

  t('재시도는 실행당 최대 3번 — 시트가 계속 바뀌어도 무한히 붙잡지 않는다', () => {
    local.setItem('signumhq.review.prompted', '[]');
    local.setItem('signumhq.review.prompted.attempt.2', '0');
    resetDay(); newLaunch(); hook.resetReviewModalRetries();
    timers = [];
    const before = requests;
    modalOpen = true;
    bridge.maybePromptReview(2500);                   // 1차 막힘 → 재시도 1
    for (let i = 0; i < 3; i++) {
      modalOpen = false; flush();                     // 닫힘 감지 → 다시 예약
      modalOpen = true; flush();                      // 실행 시점에 또 다른 시트 → 막힘 → 재시도 2·3 · 그다음은 없음
    }
    assert.equal(timers.length, 0, '세 번 뒤엔 더 붙잡지 않는다');
    assert.equal(requests, before);
    modalOpen = false;
  });

  t('광고 직후에 막힌 순간은 다시 잡지 않는다(예전 그대로 다음 기회)', () => {
    resetDay(); newLaunch(); hook.resetReviewModalRetries(); timers = [];
    local.setItem('signum_interstitial_frequency', JSON.stringify({ lastShownAt: Date.now() }));
    beacons.length = 0;
    bridge.maybePromptReview(2500);
    assert.equal(timers.length, 0);
    assert.deepEqual(beacons, ['rv_block:rv_day', 'rv_why:rv_ad']);
    local.setItem('signum_interstitial_frequency', '{}');
  });

  t('플러그인이 없는 바이너리 — 요청하지 않고 rv_noplug 로 센다(훅 경로)', () => {
    resetDay(); newLaunch(); timers = []; beacons.length = 0;
    win.Capacitor.Plugins = {};
    hook.attemptReview('signum.watchAdds', 2, 3000, true, () => {});
    flush();
    assert.deepEqual(beacons, ['rv_block:rv_watch', 'rv_why:rv_noplug']);
    assert.equal(local.getItem('signum.watchAdds.attempt.2'), null, '없는 플러그인은 기회를 소비하지 않는다');
    win.Capacitor.Plugins = { InAppReview: plugin };
  });

  t('UC·WIM(guard 없음) 순간은 계측을 보내지 않는다', () => {
    resetDay(); newLaunch(); timers = []; beacons.length = 0;
    const before = requests;
    hook.attemptReview('uc.storyOpens', 3, 1400, false, () => {});
    flush();
    assert.equal(requests, before + 1);
    assert.deepEqual(beacons, []);
  });

  t('오늘 다른 순간이 이미 물었으면 rv_today 로 센다', () => {
    resetDay(); newLaunch(); timers = []; beacons.length = 0;
    local.setItem('signum.review.lastAnyDay', hook.localReviewDay());
    local.setItem('signum.review.lastAnyDay.by', 'signum.appSessions');
    hook.attemptReview('signum.aiLineTaps', 2, 3500, true, () => {});
    flush();
    assert.deepEqual(beacons, ['rv_block:rv_ai', 'rv_why:rv_today']);
  });

  t('가치 알림 순간 — 첫 실행만 아니면(세션 2) 첫 모닝·마감·신호 알림 탭에서 요청', () => {
    resetDay(); newLaunch(); timers = []; beacons.length = 0;
    local.setItem('signumhq.review.prompted', '[]');
    local.setItem(`signumhq.review.prompted.attempt.${rm.RATING_MOMENT_PUSH}`, '0');
    local.setItem('signum.appSessions', '2');
    local.removeItem(rm.RATING_PUSH_COUNT);
    assert.equal(rm.RATING_PUSH_MIN, 1);
    const c = rm.countRatingPush('closing', local, session);
    assert.equal(c, 1);
    assert.ok(c >= rm.RATING_PUSH_MIN);
    const before = requests;
    bridge.promptRatingMoment(rm.RATING_MOMENT_PUSH, 3000, () => rm.ratingSessionEligible(local, session), { retryOnModal: true });
    flush();
    assert.equal(requests, before + 1);
    assert.deepEqual(beacons, ['rv_ask:rv_push']);
    // 첫 실행(세션 1)이면 묻지 않는다
    resetDay(); newLaunch(); timers = [];
    local.setItem('signum.appSessions', '1');
    local.setItem(`signumhq.review.prompted.attempt.${rm.RATING_MOMENT_REACTION}`, '0');
    bridge.promptRatingMoment(rm.RATING_MOMENT_REACTION, 3000, () => rm.ratingSessionEligible(local, session));
    assert.equal(timers.length, 0);
  });

  t('배선(정적) — 대시 시작·세션 순간·알림 탭에 재시도 옵션 · 레이아웃이 rv_cap 을 부른다', () => {
    const bridgeSrc = fs.readFileSync('src/lib/native/capacitorBridge.ts', 'utf8');
    assert.match(bridgeSrc, /\}, \{ retryOnModal: true \}\);\n  \} catch \{ \/\* storage unavailable → skip \*\/ \}/);
    const moments = fs.readFileSync('src/lib/app/reviewMoments.ts', 'utf8');
    assert.match(moments, /APP_SESSION_REVIEW: ReviewMomentConfig = \{ storageKey: 'signum\.appSessions', milestones: \[3, 10\], delayMs: 2500, retryOnModal: true \}/);
    const layout = fs.readFileSync('src/app/[locale]/app-view/layout.tsx', 'utf8');
    assert.match(layout, /countRatingPush\(type, localStorage, sessionStorage\) >= RATING_PUSH_MIN/);
    assert.match(layout, /promptRatingMoment\(RATING_MOMENT_PUSH, 3000, \(\) => ratingSessionEligible\(localStorage, sessionStorage\), \{ retryOnModal: true \}\)/);
    const host = fs.readFileSync('src/components/app/ReviewPromptMoments.tsx', 'utf8');
    assert.match(host, /useEffect\(\(\) => \{ reportReviewCapability\(window\); \}, \[\]\);/);
    assert.match(host, /return null;/, '화면에는 아무것도 그리지 않는다');
    // 자체 별점 팝업 금지(5.6.1) — 요청은 OS 플러그인 requestReview 하나뿐
    const hookSrc = fs.readFileSync('src/hooks/useReviewPrompt.ts', 'utf8');
    assert.equal((hookSrc.match(/requestReview\(\)/g) || []).length, 1);
  });
} finally {
  Module._load = original;
  setReviewBeaconSender();
}
console.log(`\n${n}/${n} 통과 — reviewPrompt1120`);
