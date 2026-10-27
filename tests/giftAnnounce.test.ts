/**
 * «🎁 친구에게 PRO 1개월 선물» 앱 내 안내 시험(10/27 노출 확대: 탭·보냄 전까지 최대 3회·48시간·좋은 순간) — src/lib/gift/giftAnnounce.ts · GiftAnnounceHost · GiftAnnounceSheet
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/giftAnnounce.test.ts
 *
 * 지키는 것(대표 10/8 «그렇게해» — 푸시 대신 앱을 열 때 딱 한 번):
 *   기기마다 평생 1회(표식을 못 남기면 띄우지 않는다) · 선물이 꺼지면 없다 · 막 설치한 첫 실행엔 없다 · 대시보드에서만
 *   · 평점 요청 회차(3·10)와 겹치지 않는다 · 다른 시트가 떠 있으면 미룬다
 *   · 부제는 설정 카드와 같은 문장(자동 갱신 고지 포함) · 띄움·탭·보냄이 집계된다(gift_pop) · 레이아웃에 하나만
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  GIFT_ANNOUNCE_COPY, GIFT_ANNOUNCE_GAP_MS, GIFT_ANNOUNCE_KEY, GIFT_ANNOUNCE_MAX, GIFT_BLOCK_METRICS, GIFT_MOMENT_DWELL_MS,
  GIFT_MOMENT_EVENT, GIFT_REVIEW_QUIET_MS, ONBOARDING_DONE_KEY, giftAnnounceBlock, isDashPath, isEarningsPath, localeFromPath,
  keepTogether, markGiftAnnounceStop, markGiftAnnounced, readAnnounceState, readOnboarded, type AnnounceInput, type StoreLike,
  GIFT_RESUME_MIN_BG_MS, GIFT_HEARTBEAT_MS, GIFT_SUSPEND_DRIFT_MS, newAnnounceRun, noteGiftBackground, noteGiftHeartbeat, resumeGiftRun,
  resumeBgStart, wokeFromSuspend,
} from '../src/lib/gift/giftAnnounce';
import { GIFT_COPY } from '../src/lib/gift/gift';
import { APP_SESSION_REVIEW } from '../src/lib/app/reviewMoments';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

function mem(init: Record<string, string> = {}): StoreLike & { m: Record<string, string> } {
  const m = { ...init };
  return { m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } };
}
const broken: StoreLike = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
const base = (o: Partial<AnnounceInput> = {}): AnnounceInput => ({
  live: true, store: mem(), onboardedAtMount: true, path: '/ko/app-view/dash', dialogOpen: false, now: NOW, ...o,
});
const NOW = Date.UTC(2026, 9, 27, 3, 0, 0);
const H = 3600_000;

console.log('giftAnnounce');

t('조건을 다 만족하면 띄운다', () => assert.equal(giftAnnounceBlock(base()), null));
t('선물이 꺼져 있으면 없다', () => assert.equal(giftAnnounceBlock(base({ live: false })), 'off'));
t('저장소가 없거나 막히면 띄우지 않는다(«한 번»을 못 지킨다)', () => {
  assert.equal(giftAnnounceBlock(base({ store: null })), 'nostore');
  assert.equal(giftAnnounceBlock(base({ store: broken })), 'nostore');
});
t('횟수·간격 — 탭·보냄 전까지 최대 3회, 48시간 간격', () => {
  assert.equal(GIFT_ANNOUNCE_MAX, 3);
  assert.equal(GIFT_ANNOUNCE_GAP_MS, 48 * H);
  const st = (o: object) => mem({ [GIFT_ANNOUNCE_KEY]: JSON.stringify(o) });
  assert.equal(giftAnnounceBlock(base({ store: st({ n: 1, last: NOW - 47 * H }) })), 'gap');
  assert.equal(giftAnnounceBlock(base({ store: st({ n: 1, last: NOW - 48 * H }) })), null);
  assert.equal(giftAnnounceBlock(base({ store: st({ n: 2, last: NOW - 72 * H }) })), null);
  assert.equal(giftAnnounceBlock(base({ store: st({ n: 3, last: NOW - 999 * H }) })), 'cap');
  assert.equal(giftAnnounceBlock(base({ store: st({ n: 1, last: NOW - 99 * H, stop: 1 }) })), 'stop');
  assert.equal(giftAnnounceBlock(base({ store: st({ n: 0, last: 0, stop: 1 }) })), 'stop');
});
t('옛 표식(첫 띄움 시각 숫자, 10/8~10/27) = 1회 · 그 시각 — 48시간 지났으면 다시 뜬다', () => {
  assert.deepEqual(readAnnounceState(mem({ [GIFT_ANNOUNCE_KEY]: String(NOW - 10 * 24 * H) })), { n: 1, last: NOW - 10 * 24 * H });
  assert.equal(giftAnnounceBlock(base({ store: mem({ [GIFT_ANNOUNCE_KEY]: String(NOW - 10 * 24 * H) }) })), null);
  assert.equal(giftAnnounceBlock(base({ store: mem({ [GIFT_ANNOUNCE_KEY]: String(NOW - H) }) })), 'gap');
  assert.equal(giftAnnounceBlock(base({ store: mem({ [GIFT_ANNOUNCE_KEY]: '1' }) })), null);
});
t('알 수 없는 표식은 «한도 다 씀»(매번 뜨는 것보다 안 뜨는 게 낫다)', () => {
  for (const v of ['garbage', '{"n":"x"}', '{"n":-1,"last":0}', '[]']) assert.equal(giftAnnounceBlock(base({ store: mem({ [GIFT_ANNOUNCE_KEY]: v }) })), 'cap', v);
});
t('막 설치한 첫 실행(첫 안내를 이번에 마침)엔 없다', () => assert.equal(giftAnnounceBlock(base({ onboardedAtMount: false })), 'new'));
t('좋은 순간(실적 캘린더·장마감 리포트) 입구는 경로 검사를 건너뛴다 — 나머지 조건은 그대로', () => {
  assert.equal(giftAnnounceBlock(base({ path: '/ko/app-view/earnings', moment: true })), null);
  assert.equal(giftAnnounceBlock(base({ path: '/ko/app-view/intel', moment: true, dialogOpen: true })), 'busy');
  assert.equal(giftAnnounceBlock(base({ path: '/ko/app-view/intel', moment: true, onboardedAtMount: false })), 'new');
  assert.equal(giftAnnounceBlock(base({ path: '/ko/app-view/intel', moment: true, store: mem({ [APP_SESSION_REVIEW.storageKey]: '3' }) })), 'review');
  assert.equal(GIFT_MOMENT_DWELL_MS, 10_000);
});
t('대시보드에서만 — 다른 화면은 미룬다', () => {
  assert.equal(giftAnnounceBlock(base({ path: '/ko/app-view/settings' })), 'route');
  assert.equal(giftAnnounceBlock(base({ path: '/ko/app-view/dash/' })), null);
  assert.equal(giftAnnounceBlock(base({ path: '/ja/app-view/dash' })), null);
  assert.equal(isDashPath('/en/app-view/dashboard'), false);
});
t('평점 요청 회차(앱 세션 3·10)엔 띄우지 않는다', () => {
  assert.deepEqual(APP_SESSION_REVIEW.milestones, [3, 10]);
  for (const k of ['3', '10']) assert.equal(giftAnnounceBlock(base({ store: mem({ [APP_SESSION_REVIEW.storageKey]: k }) })), 'review');
  for (const k of ['1', '2', '4', '11']) assert.equal(giftAnnounceBlock(base({ store: mem({ [APP_SESSION_REVIEW.storageKey]: k }) })), null);
});
t('OS 평점 시트를 요청한 뒤 60초는 띄우지 않는다(인텔 열람 2·7회 등 어떤 순간이든)', () => {
  assert.equal(GIFT_REVIEW_QUIET_MS, 60_000);
  assert.equal(giftAnnounceBlock(base({ moment: true, path: '/ko/app-view/intel', reviewAt: NOW - 59_000 })), 'review');
  assert.equal(giftAnnounceBlock(base({ moment: true, path: '/ko/app-view/intel', reviewAt: NOW + 1_000 })), 'review');   // 요청 지연 중
  assert.equal(giftAnnounceBlock(base({ moment: true, path: '/ko/app-view/intel', reviewAt: NOW - 61_000 })), null);
  assert.equal(giftAnnounceBlock(base({ reviewAt: 0 })), null);
  const hook = read('src/hooks/useReviewPrompt.ts');
  assert.match(hook, /if \(!milestones\.includes\(n\)\) return;\n\s*lastReviewRequestAt = Date\.now\(\) \+ delayMs;/);
});
t('다른 시트·결제 창이 떠 있으면 미룬다', () => assert.equal(giftAnnounceBlock(base({ dialogOpen: true })), 'busy'));
t('표식 — 띄울 때마다 횟수 +1·시각, 쓰고 다시 읽혀야 true(못 쓰면 띄우지 않는다)', () => {
  const s = mem();
  assert.equal(markGiftAnnounced(s, NOW), true);
  assert.deepEqual(readAnnounceState(s), { n: 1, last: NOW });
  assert.equal(giftAnnounceBlock(base({ store: s, now: NOW + H })), 'gap');
  assert.equal(giftAnnounceBlock(base({ store: s, now: NOW + 48 * H })), null);
  assert.equal(markGiftAnnounced(s, NOW + 48 * H), true);
  assert.equal(markGiftAnnounced(s, NOW + 96 * H), true);
  assert.deepEqual(readAnnounceState(s), { n: 3, last: NOW + 96 * H });
  assert.equal(giftAnnounceBlock(base({ store: s, now: NOW + 999 * H })), 'cap');
  const legacy = mem({ [GIFT_ANNOUNCE_KEY]: '123' });
  assert.equal(markGiftAnnounced(legacy, NOW), true);
  assert.deepEqual(readAnnounceState(legacy), { n: 2, last: NOW });
  assert.equal(markGiftAnnounced(broken), false);
  assert.equal(markGiftAnnounced(null), false);
});
t('멈춤 — 선물 링크를 누르면(어느 입구든) 더 안내하지 않는다', () => {
  const s = mem();
  markGiftAnnounceStop(s);
  assert.equal(giftAnnounceBlock(base({ store: s })), 'stop');
  const s2 = mem({ [GIFT_ANNOUNCE_KEY]: JSON.stringify({ n: 1, last: NOW - 99 * H }) });
  markGiftAnnounceStop(s2);
  assert.deepEqual(readAnnounceState(s2), { n: 1, last: NOW - 99 * H, stop: 1 });
  markGiftAnnounceStop(broken); markGiftAnnounceStop(null);   // 던지지 않는다
  const share = read('src/lib/gift/useGift.ts');
  assert.match(share, /giftFunnel\('tap', surface, shareVia\(\)\);\n\s*try \{ markGiftAnnounceStop\(window\.localStorage\); \}/);
});
t('좋은 순간 입구 — 실적 캘린더·장마감 리포트 탭에서만, 리포트 전체 화면·광고 창이 닫혀 있을 때', () => {
  const intel = read('src/app/[locale]/app-view/intel/page.tsx');
  assert.match(intel, /useGiftMoment\(intelTab === 'report' && !selectedSector && !expandedReport && !showAdModal, 'report'\);/);
  assert.match(read('src/components/app/GiftAnnounceHost.tsx'), /useGiftMoment\(!!cfg && isEarningsPath\(pathname \|\| ''\), 'earn'\);/);
  assert.equal(isEarningsPath('/ko/app-view/earnings'), true);
  assert.equal(isEarningsPath('/ja/app-view/earnings/'), true);
  assert.equal(isEarningsPath('/ko/earnings-week'), false);
  const hook = read('src/lib/gift/useGiftMoment.ts');
  assert.match(hook, /WATCHLIST_ADDED_EVENT, giveUp/);
  assert.match(hook, /AI_LINE_OPENED_EVENT, giveUp/);
  assert.match(hook, /GIFT_MOMENT_DWELL_MS/);
  const host = read('src/components/app/GiftAnnounceHost.tsx');
  assert.match(host, new RegExp(`GIFT_MOMENT_EVENT`));
  assert.equal(GIFT_MOMENT_EVENT, 'sg:gift-moment');
  assert.match(host, /if \(run\.shown\) return;\s*run\.shown = true;/);   // 한 실행 최대 1회
  assert.match(host, /^const run = newAnnounceRun\(\);$/m);   // 재마운트에도 유지(모듈 상태)
  assert.match(host, /reviewAt: reviewRequestedAt\(\)/);
});
// ★10/27 저녁 앱 재개 = 새 기회(코디네이터 결정) — 6시간 미만 재개는 판정 안 함, 6시간 이상은 «새 실행», 나머지 규칙은 그대로
const usedRun = (now: number) => {
  const r = newAnnounceRun(now - 10 * H);
  r.shown = true; r.dashDone = true; r.counted.add('gap'); r.onboarded = false; r.aliveAt = now - 10 * H;
  return r;
};
t('재개 — 6시간 미만 백그라운드는 새 실행이 아니다(판정 안 함)', () => {
  assert.equal(GIFT_RESUME_MIN_BG_MS, 6 * H);
  const r = usedRun(NOW);
  noteGiftBackground(r, NOW - 6 * H + 1);
  r.aliveAt = NOW - 6 * H + 1;
  assert.equal(resumeGiftRun(r, NOW, true), false);
  assert.equal(r.shown, true); assert.equal(r.dashDone, true); assert.equal(r.onboarded, false); assert.equal(r.counted.has('gap'), true);
  assert.equal(r.bgAt, 0); assert.equal(r.stallFrom, 0); assert.equal(r.stallTo, 0);   // 표식은 재개마다 지운다
  // 표식이 전혀 없으면(비활성 알림·박동 끊김 둘 다 없음) 재지 않는다
  assert.equal(resumeGiftRun(usedRun(NOW), NOW, true), false);
});
t('재개 — 6시간 이상 백그라운드면 새 실행(띄움·판정·사유 집계 초기화, 첫 안내는 지금 값으로)', () => {
  const r = usedRun(NOW);
  noteGiftBackground(r, NOW - 6 * H);
  noteGiftBackground(r, NOW - 1 * H);                         // 재개 전 중복 알림은 처음 시각 유지
  assert.equal(resumeGiftRun(r, NOW, true), true);
  assert.equal(r.shown, false); assert.equal(r.dashDone, false); assert.equal(r.counted.size, 0); assert.equal(r.onboarded, true);
  assert.equal(r.bgAt, 0);
  // 다시 재개하면(표식 없음) 또 새 실행이 되지 않는다
  assert.equal(resumeGiftRun(r, NOW + 1000, true), false);
  // 첫 안내를 아직 못 마친 기기는 새 실행이어도 'new' 그대로
  const r2 = usedRun(NOW); noteGiftBackground(r2, NOW - 7 * H);
  assert.equal(resumeGiftRun(r2, NOW, false), true);
  assert.equal(giftAnnounceBlock(base({ onboardedAtMount: r2.onboarded! })), 'new');
});
t('재개 — 비활성 알림이 늦게 와도(백그라운드에서 JS 멈춤) 심장 박동이 끊긴 구간으로 «짧게» 잰다', () => {
  assert.equal(GIFT_HEARTBEAT_MS, 60_000);
  const r = newAnnounceRun(NOW - 8 * H);
  noteGiftHeartbeat(r, NOW - 8 * H + GIFT_HEARTBEAT_MS);       // 앞쪽: 정상 박동
  assert.equal(r.stallTo, 0);
  noteGiftHeartbeat(r, NOW - 1000);                           // 8시간 가까이 끊겼다가 돌아온 첫 박동
  assert.equal(r.stallFrom, NOW - 8 * H + GIFT_HEARTBEAT_MS);
  noteGiftBackground(r, NOW - 500);                           // 늦게 도착한 비활성 알림(재개 뒤 처리)
  assert.equal(resumeBgStart(r, NOW), NOW - 8 * H + 2 * GIFT_HEARTBEAT_MS);   // 끊김 시작 + 박동 간격
  assert.equal(resumeGiftRun(r, NOW, true), true);
  // 박동 간격이 짧으면(포그라운드) 끊김 아님
  const r2 = newAnnounceRun(NOW - GIFT_SUSPEND_DRIFT_MS);
  noteGiftHeartbeat(r2, NOW);
  assert.equal(r2.stallTo, 0);
  // 끊김이 6시간 미만이면 새 실행 아님
  const r3 = newAnnounceRun(NOW - 5 * H);
  noteGiftHeartbeat(r3, NOW);
  assert.equal(resumeGiftRun(r3, NOW, true), false);
  // 경계: 6시간 + 박동 간격 미만 끊김은 짧게 재서 새 실행 아님(늦은 알림만 있을 때 넉넉히 세지 않는다)
  const r4 = newAnnounceRun(NOW - 6 * H - 30_000);
  noteGiftHeartbeat(r4, NOW); noteGiftBackground(r4, NOW);
  assert.equal(resumeGiftRun(r4, NOW, true), false);
});
t('재개 — 관문 10271834 오판 2건: 지난 끊김이 남아 짧은 재개를 6시간+로 · 제때 온 알림보다 이른 박동을 고름', () => {
  // ① 4분 끊긴 뒤 정상 박동을 6시간 이어가다 10초 백그라운드 → 새 실행 아님
  const r = newAnnounceRun(NOW - 7 * H);
  noteGiftHeartbeat(r, NOW - 7 * H + 4 * 60_000);             // 4분 끊김(오래전)
  for (let at = NOW - 7 * H + 5 * 60_000; at <= NOW - 20_000; at += GIFT_HEARTBEAT_MS) noteGiftHeartbeat(r, at);
  noteGiftBackground(r, NOW - 10_000);
  noteGiftHeartbeat(r, NOW);                                  // 재개 처리 직전 박동(간격 20초 — 끊김 아님)
  assert.equal(resumeBgStart(r, NOW), NOW - 10_000);
  assert.equal(resumeGiftRun(r, NOW, true), false);
  // 비활성 알림도 없으면 오래된 끊김으로 재지 않는다
  const r1 = newAnnounceRun(NOW - 7 * H);
  noteGiftHeartbeat(r1, NOW - 7 * H + 4 * 60_000);
  for (let at = NOW - 7 * H + 5 * 60_000; at <= NOW; at += GIFT_HEARTBEAT_MS) noteGiftHeartbeat(r1, at);
  assert.equal(resumeGiftRun(r1, NOW, true), false);
  // ② 마지막 박동 45초 뒤 백그라운드 → 5시간 59분 30초 뒤 복귀: 제때 온 알림 시각으로 잰다 → 새 실행 아님
  const bg = NOW - (6 * H - 30_000);
  const r2 = newAnnounceRun(bg - 45_000);
  noteGiftBackground(r2, bg);
  noteGiftHeartbeat(r2, NOW);                                 // 복귀 첫 박동 = 끊김 [bg-45s, NOW]
  assert.equal(resumeBgStart(r2, NOW), bg);
  assert.equal(resumeGiftRun(r2, NOW, false), false);
  // 같은 상황에서 6시간 1초면 새 실행
  const bg3 = NOW - 6 * H - 1000;
  const r3 = newAnnounceRun(bg3 - 45_000);
  noteGiftBackground(r3, bg3); noteGiftHeartbeat(r3, NOW);
  assert.equal(resumeGiftRun(r3, NOW, true), true);
});
t('재개 — 관문 10271845: 늦은 비활성 알림이 첫 박동보다 먼저 처리돼도 끊김으로 잰다 · 시트가 열려 있으면 되돌리지 않는다', () => {
  // 8시간 멈춤 → 늦은 비활성 알림 → 첫 박동 → 활성 알림
  const r = newAnnounceRun(NOW - 8 * H);
  noteGiftBackground(r, NOW - 3);
  noteGiftHeartbeat(r, NOW - 1);
  noteGiftHeartbeat(r, NOW);
  assert.equal(resumeBgStart(r, NOW), NOW - 8 * H + GIFT_HEARTBEAT_MS);
  assert.equal(resumeGiftRun(r, NOW, true), true);
  // 순서 바뀜: 첫 박동 → 늦은 비활성 알림 → 활성 알림
  const r2 = newAnnounceRun(NOW - 8 * H);
  noteGiftHeartbeat(r2, NOW - 3); noteGiftBackground(r2, NOW - 2); noteGiftHeartbeat(r2, NOW);
  assert.equal(resumeGiftRun(r2, NOW, true), true);
  // 제때 온 알림(박동 30초 뒤)은 그대로 알림 시각
  const r3 = newAnnounceRun(NOW - 7 * H - 30_000);
  noteGiftBackground(r3, NOW - 7 * H); noteGiftHeartbeat(r3, NOW);
  assert.equal(resumeBgStart(r3, NOW), NOW - 7 * H);
  // 시트가 열린 채 49시간 백그라운드 → 되돌리지 않는다(닫아도 다시 안 뜸), 표식은 지운다
  const r4 = usedRun(NOW); noteGiftBackground(r4, NOW - 49 * H);
  assert.equal(resumeGiftRun(r4, NOW, true, true), false);
  assert.equal(r4.shown, true); assert.equal(r4.dashDone, true); assert.equal(r4.bgAt, 0);
});
t('재개 — 관문 10271911: 백그라운드 전 타이머가 재개 처리·설정 재조회 전에 깨어나면 띄우지 않는다', () => {
  const r = newAnnounceRun(NOW - 7 * H);
  noteGiftBackground(r, NOW - 7 * H + 1000);                  // 대시보드 진입 3.5초 안에 백그라운드
  assert.equal(wokeFromSuspend(r, NOW), true);                 // 7시간 뒤 깨어난 타이머
  noteGiftHeartbeat(r, NOW);
  assert.equal(wokeFromSuspend(r, NOW + 1000), false);         // 깨어난 뒤 박동이 돌면 정상
  assert.equal(wokeFromSuspend(newAnnounceRun(NOW - GIFT_HEARTBEAT_MS), NOW), false);   // 포그라운드 박동 간격 안
  const host = read('src/components/app/GiftAnnounceHost.tsx');
  assert.match(host, /if \(!cfgLiveRef\.current \|\| wokeFromSuspend\(run, Date\.now\(\)\)\) return;\s*if \(run\.shown\) return;/);
  assert.match(host, /cfgLiveRef\.current = false;\s*setResumeCfg\(null\);/);
  assert.match(host, /cfgLiveRef\.current = !!c;\s*setResumeCfg\(c\);/);
});
t('재개 뒤에도 48시간 간격·최대 3회·멈춤은 그대로(giftAnnounceBlock)', () => {
  const r = usedRun(NOW); noteGiftBackground(r, NOW - 12 * H);
  assert.equal(resumeGiftRun(r, NOW, true), true);
  const st = (o: object) => mem({ [GIFT_ANNOUNCE_KEY]: JSON.stringify(o) });
  assert.equal(giftAnnounceBlock(base({ onboardedAtMount: r.onboarded!, store: st({ n: 1, last: NOW - 12 * H }) })), 'gap');
  assert.equal(giftAnnounceBlock(base({ onboardedAtMount: r.onboarded!, store: st({ n: 3, last: NOW - 99 * H }) })), 'cap');
  assert.equal(giftAnnounceBlock(base({ onboardedAtMount: r.onboarded!, store: st({ n: 1, last: NOW - 99 * H, stop: 1 }) })), 'stop');
  assert.equal(giftAnnounceBlock(base({ onboardedAtMount: r.onboarded!, store: st({ n: 1, last: NOW - 49 * H }) })), null);
  assert.equal(giftAnnounceBlock(base({ onboardedAtMount: r.onboarded!, store: st({ n: 1, last: NOW - 49 * H }), dialogOpen: true })), 'busy');
});
t('재개 배선 — 네이티브 appStateChange 로만, 6시간+ 재개 때 대시보드 입구를 다시 잰다', () => {
  const host = read('src/components/app/GiftAnnounceHost.tsx');
  assert.match(host, /if \(!Capacitor\.isNativePlatform\(\) \|\| cancelled\) return;/);
  assert.match(host, /App\.addListener\('appStateChange'/);
  assert.match(host, /if \(!isActive\) \{ noteGiftBackground\(run, now\); return; \}/);
  assert.match(host, /if \(!resumeGiftRun\(run, now, readOnboarded\(localStore\(\)\), sheetOpenRef\.current\)\) return;\s*cfgLiveRef\.current = false;\s*setResumeCfg\(null\);\s*void loadGiftConfig\(\)\.then\(\(c\) => \{[^}]*if \(cancelled\) return;\s*cfgLiveRef\.current = !!c;\s*setResumeCfg\(c\);\s*setResumeTick\(\(n\) => n \+ 1\);/);
  // 관문 10271857: 재개 뒤엔 서버 설정을 다시 읽은 값으로만 판정(백그라운드 중 꺼졌으면 없다)
  assert.match(host, /const cfg = resumeCfg === undefined \? mountCfg : resumeCfg;/);
  assert.match(read('src/lib/gift/useGift.ts'), /const TTL_MS = 10 \* 60_000;/);   // 6시간 뒤 loadGiftConfig 는 캐시가 아니라 서버를 읽는다
  assert.match(host, /sheetOpenRef\.current = !!locale;/);
  assert.match(host, /\}, \[cfg, pathname, locale, input, countBlock, show, resumeTick\]\);/);
  assert.match(host, /window\.clearInterval\(beat\)/);
});
t('첫 안내 완료 = AppFirstRunOnboarding 과 같은 키·값', () => {
  const src = read('src/components/app/AppFirstRunOnboarding.tsx');
  assert.match(src, new RegExp(`const STORAGE_KEY = '${ONBOARDING_DONE_KEY.replace(/\./g, '\\.')}'`));
  assert.match(src, /setItem\(STORAGE_KEY, 'accepted'\)/);
  assert.equal(readOnboarded(mem({ [ONBOARDING_DONE_KEY]: 'accepted' })), true);
  assert.equal(readOnboarded(mem()), false);
  assert.equal(readOnboarded(broken), false);
});
t('언어 = 경로 첫 칸', () => {
  assert.equal(localeFromPath('/ko/app-view/dash'), 'ko');
  assert.equal(localeFromPath('/ja/app-view/dash'), 'ja');
  assert.equal(localeFromPath('/'), 'en');
});
t('문구 — 3개 언어 다 있고, 부제는 설정 카드 문장 그대로(자동 갱신 고지 포함)', () => {
  for (const l of ['ko', 'en', 'ja'] as const) {
    const a = GIFT_ANNOUNCE_COPY[l];
    for (const v of [a.eyebrow, a.cta, a.later, a.close]) assert.ok(v.trim().length > 0);
    assert.match(GIFT_COPY[l].sub, /자동 갱신|auto-renews|自動更新/);
    assert.match(GIFT_COPY[l].subIosOnly, /자동 갱신|auto-renews|自動更新/);
  }
  const sheet = read('src/components/app/GiftAnnounceSheet.tsx');
  assert.match(sheet, /c\.subIosOnly : c\.sub/);
  assert.match(sheet, /useGiftShare\(locale, 'gift_pop'\)/);
});
t('집계 — gift_pop 이 비콘·서버·리포트에 등록돼 있다', () => {
  assert.match(read('src/lib/share/share.ts'), /\| 'gift_pop';/);
  assert.match(read('src/lib/gift/gift.ts'), /GiftSurface = 'gift_set' \| 'gift_dash' \| 'gift_pop'/);
  assert.match(read('src/app/api/share-hit/route.ts'), /'gift_set', 'gift_dash', 'gift_pop'\]/);
  assert.match(read('src/app/api/share-hit/route.ts'), /EVENTS = new Set\(\['tap', 'sent', 'open', 'click'\]\)/);
  assert.match(read('scripts/mkt-gift.js'), /SURF = \['gift_set', 'gift_dash', 'gift_pop'\]/);
  assert.match(read('scripts/mkt-gift.js'), /\['open', 'tap', 'sent'\]/);
  // 10/27 — 띄운 곳(at:*)·막힌 이유(block:*)는 gift_pop 에만, 닫힌 목록
  const route = read('src/app/api/share-hit/route.ts');
  assert.match(route, /s === 'gift_pop' && POP_EVENTS\.has\(e\)/);
  assert.deepEqual([...GIFT_BLOCK_METRICS], ['nostore', 'stop', 'cap', 'gap', 'new', 'review', 'busy']);
  assert.match(read('scripts/mkt-gift.js'), /\['nostore', 'stop', 'cap', 'gap', 'new', 'review', 'busy'\]/);
});
t('레이아웃에 하나만 · 눌림 높이(단추 46px·닫기 44px)', () => {
  const lay = read('src/app/[locale]/app-view/layout.tsx');
  assert.equal(lay.split('<GiftAnnounceHost />').length - 1, 1);
  assert.match(read('src/components/app/GiftAnnounceSheet.module.css'), /\.cta \{\s*height: 46px;/);
  assert.match(read('src/components/app/ProPaywall.module.css'), /\.close \{[^}]*width: 44px;[^}]*height: 44px;/);
});

console.log(`\n${n}/${n} 통과`);

console.log('keepTogether');
t('묶음은 통째로 · 나머지는 그대로 · 이어 붙이면 원문', () => {
  for (const l of ['ko', 'en', 'ja'] as const) for (const txt of [GIFT_COPY[l].title, GIFT_COPY[l].sub, GIFT_COPY[l].subIosOnly]) {
    const parts = keepTogether(txt, GIFT_ANNOUNCE_COPY[l].keep);
    assert.equal(parts.map((x) => x.t).join(''), txt);
  }
  const ja = keepTogether(GIFT_COPY.ja.subIosOnly, GIFT_ANNOUNCE_COPY.ja.keep);
  assert.ok(ja.some((x) => x.nb && x.t === 'PRO 1か月無料'));          // 긴 묶음이 먼저(«PRO 1か月»보다)
  assert.ok(keepTogether(GIFT_COPY.ja.title, GIFT_ANNOUNCE_COPY.ja.keep).some((x) => x.nb && x.t === 'PRO 1か月'));
  assert.ok(keepTogether(GIFT_COPY.ko.sub, GIFT_ANNOUNCE_COPY.ko.keep).some((x) => x.nb && x.t === '자동 갱신'));
  assert.deepEqual(keepTogether('abc', []), [{ t: 'abc', nb: false }]);
});
console.log(`\n${n}/${n} 통과(누적)`);
