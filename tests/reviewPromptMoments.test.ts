/**
 * 스토어 평점 요청 «순간» 시험 — src/lib/app/reviewMoments.ts · src/components/app/ReviewPromptMoments.tsx
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/reviewPromptMoments.test.ts
 *
 * 지키는 것(대표 10/7):
 *   ① 앱 세션 — signum.appSessions [3,10] · «웹뷰 세션당 1회»(같은 세션 두 번 진입해도 1) · 표식을 못 남기면 세지 않는다 · 2.5초 뒤
 *   ② 내 종목 담기 성공 — signum.watchAdds [2] · 모든 담기 경로가 addStar 한 곳으로 모인다 · 이미 담김·한도·잘못된 티커·저장 실패는 세지 않는다
 *      · PRO 직후 자동 담기('restore')는 세지 않는다 · 3초 뒤(토스트 2.5초 이후)
 *   웹(비네이티브)은 완전 무동작(표식·구독·카운터 어느 것도 쓰지 않는다)
 *   실제 훅(useReviewPrompt)을 «그대로» 돌린다 — react-dom/server 로 콜백을 꺼내 가짜 네이티브 환경에서 부른다
 *   (한도 경로 시험은 PRO 확인을 기다리는 경로라 2.5초 기다린다)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useReviewPrompt } from '../src/hooks/useReviewPrompt';
import {
  APP_SESSION_MARK_KEY, APP_SESSION_REVIEW, WATCH_ADD_REVIEW, WATCHLIST_ADDED_EVENT,
  countsAsWatchAdd, isNativeApp, markAppSessionOnce, runSessionMoment, subscribeWatchAddMoment,
  type ReviewMomentConfig,
} from '../src/lib/app/reviewMoments';
import { addStar } from '../src/components/app/watchlist/starActions';
import { createWatchlistStore, _setWatchlistStoreForTest, FREE_LIMIT, type StorageLike } from '../src/lib/app/watchlist';
import { wlUI } from '../src/lib/app/watchlistUI';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const ta = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

class MemStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
}
class BlockedStorage implements StorageLike {
  getItem(): string | null { throw new Error('SecurityError'); }
  setItem(): void { throw new Error('QuotaExceededError'); }
}

// ── 가짜 앱 환경 ─────────────────────────────────────────────────────────
class Env {
  local = new MemStorage();                                  // 기기에 남는 저장소(localStorage) — 앱을 껐다 켜도 그대로
  timers: Array<{ ms: number; fn: () => void }> = [];        // window.setTimeout 으로 걸린 것
  reviews = 0;                                               // 플러그인 requestReview 가 불린 횟수
}
interface FakeOpts { native?: boolean; session?: StorageLike | 'blocked' }
/** 웹뷰 하나 = window 하나 = 새 sessionStorage (앱을 새로 켠 것) */
function makeWindow(env: Env, o: FakeOpts = {}) {
  const w: any = new EventTarget();
  const native = o.native ?? true;
  w.Capacitor = { isNativePlatform: () => native, Plugins: { InAppReview: { requestReview: () => { env.reviews++; return Promise.resolve(); } } } };
  w.setTimeout = (fn: () => void, ms: number) => { env.timers.push({ ms, fn }); return env.timers.length; };
  w.location = { hostname: 'www.signumhq.com', search: '', pathname: '/ko/app-view/dash' };
  const session = o.session ?? new MemStorage();
  Object.defineProperty(w, 'sessionStorage', {
    configurable: true,
    get() { if (session === 'blocked') throw new Error('SecurityError'); return session; },
  });
  return w;
}
const install = (env: Env, w: unknown) => { (globalThis as any).window = w; (globalThis as any).localStorage = env.local; };
const uninstall = () => { delete (globalThis as any).window; delete (globalThis as any).localStorage; };
/** 걸린 타이머를 전부 실행하고 지연값(ms)을 돌려준다 */
function flush(env: Env): number[] {
  const q = env.timers.splice(0);
  q.forEach((x) => x.fn());
  return q.map((x) => x.ms);
}
/** 진짜 훅의 콜백 — react-dom/server 로 한 번 그려서 꺼낸다(useCallback 만 쓰므로 서버 렌더에서 그대로 돈다) */
function grab(cfg: ReviewMomentConfig): () => void {
  let ask!: () => void;
  function C() { ask = useReviewPrompt(cfg); return null; }
  renderToStaticMarkup(React.createElement(C));
  return ask;
}

async function main() {
  console.log('━━━ 1. 설정값(대표 지시 그대로) ━━━');
  t('앱 세션: signum.appSessions · [3,10] · 2.5초 안팎', () => {
    assert.equal(APP_SESSION_REVIEW.storageKey, 'signum.appSessions');
    assert.deepEqual(APP_SESSION_REVIEW.milestones, [3, 10]);
    assert.ok(APP_SESSION_REVIEW.delayMs >= 2000 && APP_SESSION_REVIEW.delayMs <= 3000, `delayMs=${APP_SESSION_REVIEW.delayMs}`);
  });
  t('담기 성공: signum.watchAdds · [2] · 담기 토스트(2.5초)가 사라진 뒤', () => {
    assert.equal(WATCH_ADD_REVIEW.storageKey, 'signum.watchAdds');
    assert.deepEqual(WATCH_ADD_REVIEW.milestones, [2]);
    assert.ok(WATCH_ADD_REVIEW.delayMs > 2500, `delayMs=${WATCH_ADD_REVIEW.delayMs} 는 담기 토스트(2500ms)보다 길어야 «보기»를 가리지 않는다`);
  });
  t('이벤트 이름은 빼기(sg:watchlist-removed)와 같은 규칙', () => {
    assert.equal(WATCHLIST_ADDED_EVENT, 'sg:watchlist-added');
  });

  console.log('━━━ 2. 세션당 1회(표식) ━━━');
  t('같은 세션에서 두 번 진입해도 한 번만 센다 · 새 세션(새 sessionStorage)이면 다시 센다', () => {
    const s1 = new MemStorage();
    assert.equal(markAppSessionOnce(s1), true);
    assert.equal(markAppSessionOnce(s1), false);
    assert.equal(markAppSessionOnce(s1), false);
    assert.equal(s1.getItem(APP_SESSION_MARK_KEY), '1');
    assert.equal(markAppSessionOnce(new MemStorage()), true);
  });
  t('표식을 못 남기면(읽기 차단·쓰기 차단·저장소 없음) 세지 않는다 — 마운트마다 세어 요청이 앞당겨지는 것보다 늦는 쪽이 안전', () => {
    assert.equal(markAppSessionOnce(new BlockedStorage()), false);
    assert.equal(markAppSessionOnce(null), false);
    assert.equal(markAppSessionOnce(undefined), false);
    const readOk = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
    assert.equal(markAppSessionOnce(readOk), false);
  });
  t('countsAsWatchAdd: 사용자가 직접 담은 것만 — PRO 직후 자동 담기(restore)는 제외', () => {
    assert.equal(countsAsWatchAdd({ t: 'NVDA', src: 'chip' }), true);
    assert.equal(countsAsWatchAdd({ t: 'NVDA', src: 'cmd' }), true);
    assert.equal(countsAsWatchAdd({ t: 'NVDA', src: 'restore' }), false);
    assert.equal(countsAsWatchAdd(undefined), true);
  });
  t('isNativeApp: Capacitor 가 없거나 isNativePlatform 이 거짓이거나 던지면 false', () => {
    assert.equal(isNativeApp(undefined), false);
    assert.equal(isNativeApp({}), false);
    assert.equal(isNativeApp({ Capacitor: { isNativePlatform: () => false } }), false);
    assert.equal(isNativeApp({ Capacitor: { isNativePlatform: () => { throw new Error('x'); } } }), false);
    assert.equal(isNativeApp({ Capacitor: { isNativePlatform: () => true } }), true);
  });

  console.log('━━━ 3. 앱 세션 — 실제 훅으로 15번 켜 본다 ━━━');
  t('15번 켜면 3번째·10번째에만 요청(2.5초 뒤) · 같은 세션 재진입은 한 번 · 누적은 15', () => {
    const env = new Env();
    const ask = grab(APP_SESSION_REVIEW);
    const askedAt: number[] = [];
    const delays: number[][] = [];
    for (let launch = 1; launch <= 15; launch++) {
      const w = makeWindow(env);          // 앱을 새로 켬 → 새 sessionStorage, localStorage 는 그대로
      install(env, w);
      const before = env.reviews;
      runSessionMoment(w, ask);
      runSessionMoment(w, ask);           // 같은 세션에서 레이아웃이 다시 마운트돼도(언어 전환·StrictMode) 한 번
      const d = flush(env);
      if (env.reviews > before) { askedAt.push(launch); delays.push(d); }
    }
    uninstall();
    assert.deepEqual(askedAt, [3, 10]);
    assert.deepEqual(delays, [[2500], [2500]]);
    assert.equal(env.local.getItem('signum.appSessions'), '15');
  });
  t('sessionStorage 가 막힌 환경 — 아무것도 세지 않고 요청도 없다', () => {
    const env = new Env();
    const ask = grab(APP_SESSION_REVIEW);
    for (let i = 0; i < 5; i++) {
      const w = makeWindow(env, { session: 'blocked' });
      install(env, w);
      assert.equal(runSessionMoment(w, ask), false);
    }
    uninstall();
    assert.equal(env.local.getItem('signum.appSessions'), null);
    assert.equal(env.timers.length, 0);
    assert.equal(env.reviews, 0);
  });
  t('웹(비네이티브)은 완전 무동작 — 표식도 카운터도 타이머도 없다', () => {
    const env = new Env();
    const ask = grab(APP_SESSION_REVIEW);
    const session = new MemStorage();
    for (let i = 0; i < 5; i++) {
      const w = makeWindow(env, { native: false, session });
      install(env, w);
      assert.equal(runSessionMoment(w, ask), false);
    }
    uninstall();
    assert.equal(session.getItem(APP_SESSION_MARK_KEY), null, '웹에서는 세션 표식도 쓰지 않는다');
    assert.equal(env.local.getItem('signum.appSessions'), null);
    assert.equal(env.timers.length, 0);
    assert.equal(env.reviews, 0);
  });
  t('요청 함수가 던져도 세션 흐름은 죽지 않는다', () => {
    const env = new Env();
    const w = makeWindow(env);
    install(env, w);
    assert.doesNotThrow(() => runSessionMoment(w, () => { throw new Error('boom'); }));
    uninstall();
  });

  console.log('━━━ 4. 내 종목 담기 — 실제 addStar 로 이벤트 경로 전체 ━━━');
  const useStore = (s: StorageLike) => {
    let clock = 1000;
    const store = createWatchlistStore({ storage: () => s, now: () => clock++ });
    _setWatchlistStoreForTest(store);
    wlUI.closeSheet(); wlUI.dismissToast();
    return store;
  };

  await ta('2번째 담기에서만 요청(3초 뒤) — 담는 경로가 달라도 한 카운터(하트·칩·길게 누르기·검색…)', async () => {
    const env = new Env();
    const w = makeWindow(env);
    install(env, w);
    const ask = grab(WATCH_ADD_REVIEW);
    const off = subscribeWatchAddMoment(w, ask);
    useStore(new MemStorage());

    assert.equal(await addStar('NVDA', 'cmd'), 'added');
    assert.equal(env.local.getItem('signum.watchAdds'), '1');
    assert.deepEqual(flush(env), [], '1번째 담기에는 요청이 없다');

    assert.equal(await addStar('AMD', 'chip'), 'added');
    assert.equal(env.local.getItem('signum.watchAdds'), '2');
    assert.deepEqual(flush(env), [3000], '2번째 담기 3초 뒤 요청');
    assert.equal(env.reviews, 1);

    for (const [sym, src] of [['MU', 'longpress'], ['TSLA', 'search'], ['AAPL', 'dash']] as const) {
      assert.equal(await addStar(sym, src), 'added');
    }
    assert.equal(env.local.getItem('signum.watchAdds'), '5');
    assert.deepEqual(flush(env), [], '3번째 이후에는 요청이 없다(마일스톤은 [2] 뿐)');
    assert.equal(env.reviews, 1);
    off(); uninstall(); _setWatchlistStoreForTest(null);
  });

  await ta('이미 담긴 종목·잘못된 티커는 세지 않는다', async () => {
    const env = new Env();
    const w = makeWindow(env);
    install(env, w);
    const off = subscribeWatchAddMoment(w, grab(WATCH_ADD_REVIEW));
    useStore(new MemStorage());
    assert.equal(await addStar('NVDA', 'cmd'), 'added');
    assert.equal(await addStar('NVDA', 'cmd'), 'already');
    assert.equal(await addStar('nvda', 'chip'), 'already');
    assert.equal(await addStar('<script>', 'search'), 'invalid');
    assert.equal(env.local.getItem('signum.watchAdds'), '1');
    assert.equal(env.timers.length, 0);
    off(); uninstall(); _setWatchlistStoreForTest(null);
  });

  await ta('PRO 직후 자동 담기(restore)는 세지 않는다 — 그 뒤 사용자가 직접 두 번 담아야 요청', async () => {
    const env = new Env();
    const w = makeWindow(env);
    install(env, w);
    const off = subscribeWatchAddMoment(w, grab(WATCH_ADD_REVIEW));
    useStore(new MemStorage());
    assert.equal(await addStar('NVDA', 'restore', null, { sheet: false }), 'added');
    assert.equal(env.local.getItem('signum.watchAdds'), null, 'restore 는 카운터를 올리지 않는다');
    assert.equal(await addStar('AMD', 'chip'), 'added');
    assert.deepEqual(flush(env), [], '직접 담은 1번째');
    assert.equal(await addStar('MU', 'chip'), 'added');
    assert.deepEqual(flush(env), [3000], '직접 담은 2번째에서 요청');
    off(); uninstall(); _setWatchlistStoreForTest(null);
  });

  await ta('저장 실패 경고가 뜬 담기(사생활 모드·용량 초과)는 성공으로 세지 않는다', async () => {
    const env = new Env();
    const w = makeWindow(env);
    install(env, w);
    const off = subscribeWatchAddMoment(w, grab(WATCH_ADD_REVIEW));
    useStore(new BlockedStorage());
    assert.equal(await addStar('NVDA', 'cmd'), 'added');
    assert.equal(await addStar('AMD', 'cmd'), 'added');
    assert.equal(env.local.getItem('signum.watchAdds'), null);
    assert.equal(env.timers.length, 0);
    off(); uninstall(); _setWatchlistStoreForTest(null);
  });

  await ta('한도(무료 5개)에 걸린 담기는 세지 않는다 — 한도 시트가 열릴 뿐', async () => {
    const env = new Env();
    const w = makeWindow(env);
    install(env, w);
    const off = subscribeWatchAddMoment(w, grab(WATCH_ADD_REVIEW));
    const store = useStore(new MemStorage());
    for (const sym of ['A1', 'B2', 'C3', 'D4', 'E5']) store.add(sym, 'seed', FREE_LIMIT);   // 저장소에 직접 — 이벤트 없음
    assert.equal(store.count(), FREE_LIMIT);
    assert.equal(await addStar('NVDA', 'chip'), 'limit');
    assert.equal(wlUI.getSnapshot().sheet?.kind, 'limit');
    assert.equal(env.local.getItem('signum.watchAdds'), null);
    assert.equal(env.timers.length, 0);
    off(); uninstall(); _setWatchlistStoreForTest(null); wlUI.closeSheet();
  });

  await ta('이벤트는 담기 성공 «한 번»에 한 번 — detail 은 {t, src}', async () => {
    const env = new Env();
    const w = makeWindow(env);
    install(env, w);
    const seen: Array<{ t?: string; src?: string }> = [];
    w.addEventListener(WATCHLIST_ADDED_EVENT, (e: Event) => seen.push((e as CustomEvent).detail));
    useStore(new MemStorage());
    await addStar('NVDA', 'chip');
    await addStar('NVDA', 'chip');        // already
    await addStar('MU', 'dash');
    assert.deepEqual(seen, [{ t: 'NVDA', src: 'chip' }, { t: 'MU', src: 'dash' }]);
    uninstall(); _setWatchlistStoreForTest(null);
  });

  await ta('웹(비네이티브)은 담아도 구독이 없어 아무 기록도 타이머도 없다', async () => {
    const env = new Env();
    const w = makeWindow(env, { native: false });
    install(env, w);
    const off = subscribeWatchAddMoment(w, grab(WATCH_ADD_REVIEW));
    useStore(new MemStorage());
    for (const sym of ['NVDA', 'AMD', 'MU']) assert.equal(await addStar(sym, 'cmd'), 'added');
    assert.equal(env.local.getItem('signum.watchAdds'), null);
    assert.equal(env.timers.length, 0);
    assert.equal(env.reviews, 0);
    off(); uninstall(); _setWatchlistStoreForTest(null);
  });

  await ta('구독을 해제하면 더는 세지 않는다(레이아웃 재마운트 때 이중 구독 방지)', async () => {
    const env = new Env();
    const w = makeWindow(env);
    install(env, w);
    const ask = grab(WATCH_ADD_REVIEW);
    const off1 = subscribeWatchAddMoment(w, ask);
    off1();
    const off2 = subscribeWatchAddMoment(w, ask);         // 재마운트 — 구독은 하나뿐이어야 한다
    useStore(new MemStorage());
    await addStar('NVDA', 'chip');
    assert.equal(env.local.getItem('signum.watchAdds'), '1', '한 번의 담기는 정확히 +1');
    off2(); uninstall(); _setWatchlistStoreForTest(null);
  });

  console.log('━━━ 5. 배선(정적) — 한 곳에서만 부른다 ━━━');
  t('앱 레이아웃이 ReviewPromptMoments 를 «한 번» 마운트한다', () => {
    const src = read('src/app/[locale]/app-view/layout.tsx');
    assert.ok(/import\s*\{\s*ReviewPromptMoments\s*\}\s*from\s*'@\/components\/app\/ReviewPromptMoments'/.test(src));
    assert.equal((src.match(/<ReviewPromptMoments\s*\/>/g) || []).length, 1);
  });
  t('컴포넌트: 공용 설정 상수로 훅을 두 번(세션·담기) 부르고, 화면에는 아무것도 그리지 않는다', () => {
    const src = read('src/components/app/ReviewPromptMoments.tsx');
    assert.ok(/useReviewPrompt\(APP_SESSION_REVIEW\)/.test(src));
    assert.ok(/useReviewPrompt\(WATCH_ADD_REVIEW\)/.test(src));
    assert.ok(/runSessionMoment\(window,/.test(src));
    assert.ok(/subscribeWatchAddMoment\(window,/.test(src));
    assert.equal((src.match(/useReviewPrompt\(/g) || []).length, 2);
    assert.ok(/return null;/.test(src));
    assert.equal(/milestones:\s*\[/.test(src), false, '마일스톤 배열 리터럴을 렌더마다 만들면 훅 콜백이 매번 바뀐다 — 모듈 상수를 쓴다');
  });
  t('StarButton 은 더 이상 자기 평점 훅(signum.wlAdds)을 갖지 않는다 — 2번째에 이어 3번째에 또 요청이 가는 중복 방지', () => {
    const src = read('src/components/app/watchlist/StarButton.tsx');
    assert.equal(/useReviewPrompt\(/.test(src), false);
    assert.equal(/askReview\(/.test(src), false);
    assert.equal(/signum\.wlAdds/.test(src.replace(/\/\/.*$/gm, '')), false);
  });
  t('addStar: 이벤트는 «담기 성공(저장 경고 없음)» 분기 안에서만 쏜다', () => {
    const src = read('src/components/app/watchlist/starActions.ts');
    assert.equal((src.match(/announceWatchlistAdded\(/g) || []).length, 1, '쏘는 곳은 addStar 한 곳');
    const i = src.indexOf('if (!warnIfNotSaved()) {');
    const j = src.indexOf("return 'added';", i);
    assert.ok(i > 0 && j > i);
    const block = src.slice(i, j);
    assert.ok(block.includes('announceWatchlistAdded({ t, src })'));
    assert.ok(block.includes('showToast'), '담기 토스트 분기 안');
  });
  t('요청 키·마일스톤 리터럴은 lib/app/reviewMoments.ts 한 곳에만 있다', () => {
    const srcRoot = path.join(__dirname, '../src');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        const body = fs.readFileSync(p, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
        if (/['"]signum\.(appSessions|watchAdds)['"]/.test(body)) hits.push(path.relative(srcRoot, p));
      }
    };
    walk(srcRoot);
    assert.deepEqual(hits, [path.join('lib', 'app', 'reviewMoments.ts')]);
  });

  console.log(`\n${n}/${n} 통과`);
}

main().catch((e) => { console.error(e); process.exit(1); });
