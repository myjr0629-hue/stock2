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
  assert.match(host, /^const run = \{ shown: false, dashDone: false, counted: new Set<string>\(\), onboarded: null as boolean \| null \};$/m);   // 재마운트에도 유지(모듈 상태)
  assert.match(host, /reviewAt: reviewRequestedAt\(\)/);
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
