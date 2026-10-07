/**
 * «🎁 친구에게 PRO 1개월 선물» 앱 내 1회 안내 시험 — src/lib/gift/giftAnnounce.ts · GiftAnnounceHost · GiftAnnounceSheet
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
  GIFT_ANNOUNCE_COPY, GIFT_ANNOUNCE_KEY, ONBOARDING_DONE_KEY, giftAnnounceBlock, isDashPath, localeFromPath,
  markGiftAnnounced, readOnboarded, type AnnounceInput, type StoreLike,
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
  live: true, store: mem(), onboardedAtMount: true, path: '/ko/app-view/dash', dialogOpen: false, ...o,
});

console.log('giftAnnounce');

t('조건을 다 만족하면 띄운다', () => assert.equal(giftAnnounceBlock(base()), null));
t('선물이 꺼져 있으면 없다', () => assert.equal(giftAnnounceBlock(base({ live: false })), 'off'));
t('저장소가 없거나 막히면 띄우지 않는다(«한 번»을 못 지킨다)', () => {
  assert.equal(giftAnnounceBlock(base({ store: null })), 'nostore');
  assert.equal(giftAnnounceBlock(base({ store: broken })), 'nostore');
});
t('한 번 띄운 기기엔 다시 없다', () => assert.equal(giftAnnounceBlock(base({ store: mem({ [GIFT_ANNOUNCE_KEY]: '1' }) })), 'seen'));
t('막 설치한 첫 실행(첫 안내를 이번에 마침)엔 없다', () => assert.equal(giftAnnounceBlock(base({ onboardedAtMount: false })), 'new'));
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
t('다른 시트·결제 창이 떠 있으면 미룬다', () => assert.equal(giftAnnounceBlock(base({ dialogOpen: true })), 'busy'));
t('표식 — 쓰고 다시 읽혀야 true(못 쓰면 띄우지 않는다)', () => {
  const s = mem();
  assert.equal(markGiftAnnounced(s, 123), true);
  assert.equal(s.m[GIFT_ANNOUNCE_KEY], '123');
  assert.equal(giftAnnounceBlock(base({ store: s })), 'seen');
  assert.equal(markGiftAnnounced(broken), false);
  assert.equal(markGiftAnnounced(null), false);
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
});
t('레이아웃에 하나만 · 눌림 높이(단추 46px·닫기 44px)', () => {
  const lay = read('src/app/[locale]/app-view/layout.tsx');
  assert.equal(lay.split('<GiftAnnounceHost />').length - 1, 1);
  assert.match(read('src/components/app/GiftAnnounceSheet.module.css'), /\.cta \{\s*height: 46px;/);
  assert.match(read('src/components/app/ProPaywall.module.css'), /\.close \{[^}]*width: 44px;[^}]*height: 44px;/);
});

console.log(`\n${n}/${n} 통과`);
