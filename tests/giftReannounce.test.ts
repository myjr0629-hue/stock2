/**
 * 11/5 재안내 회차(gift:announce:1105) — 기존 안내와 «따로» 판정·표식한다.
 *   ① 재안내는 기기당 1회 · 기존 표식의 중단·3회·48시간을 보지 않는다
 *   ② 재안내 표식은 기존 횟수·시각·중단 표식을 건드리지 않는다 · 기존 판정은 재안내 표식이 있어도 그대로
 *   ③ 기존 안내 경로(GiftAnnounceHost ①·②)는 설정을 기다리지 않는다(원본 그대로)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  GIFT_ANNOUNCE_KEY, GIFT_REANNOUNCE_KEY, GIFT_REANNOUNCE_SWITCH, GIFT_REANNOUNCE_TIMEOUT_MS, GIFT_REANNOUNCE_TITLE, GIFT_ANNOUNCE_COPY,
  giftAnnounceBlock, giftReannounceBlock, markGiftAnnounced, markGiftReannounced, readAnnounceState, readReannounced, keepTogether, type StoreLike,
} from '../src/lib/gift/giftAnnounce';
import { APP_SESSION_REVIEW } from '../src/lib/app/reviewMoments';

const now = Date.UTC(2026, 10, 5);
const hour = 3600_000;
function store(initial: Record<string, string> = {}): StoreLike & { data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
}
const base = (s: StoreLike | null, over: Record<string, unknown> = {}) => ({ live: true, store: s, onboardedAtMount: true, path: '/ko/app-view/dash', dialogOpen: false, now, ...over });

assert.equal(GIFT_REANNOUNCE_SWITCH, 'gift:announce:1105');
assert.ok(GIFT_REANNOUNCE_TIMEOUT_MS <= 3000);

// ① 기존 안내를 다 쓴(3회·중단) 사람에게도, 방금 본 사람에게도 재안내 1회
for (const st of [{ n: 3, last: now - 25 * hour, stop: 1 }, { n: 1, last: now - hour }, { n: 3, last: now - 1000 }]) {
  assert.equal(giftReannounceBlock(base(store({ [GIFT_ANNOUNCE_KEY]: JSON.stringify(st) }))), null, JSON.stringify(st));
}
assert.equal(giftReannounceBlock(base(store())), null);
assert.equal(giftReannounceBlock(base(store(), { live: false })), 'off');
assert.equal(giftReannounceBlock(base(null)), 'nostore');
assert.equal(giftReannounceBlock(base(store(), { onboardedAtMount: false })), 'new');
assert.equal(giftReannounceBlock(base(store(), { path: '/ko/app-view/flow' })), 'route');
assert.equal(giftReannounceBlock(base(store(), { path: '/ko/app-view/earnings', moment: true })), null);
assert.equal(giftReannounceBlock(base(store(), { dialogOpen: true })), 'busy');
assert.equal(giftReannounceBlock(base(store(), { reviewAt: now - 1000 })), 'review');
assert.equal(giftReannounceBlock(base(store({ [APP_SESSION_REVIEW.storageKey]: String(APP_SESSION_REVIEW.milestones![0]) }))), 'review');

// 기기당 1회
const s = store({ [GIFT_ANNOUNCE_KEY]: JSON.stringify({ n: 1, last: now - 72 * hour }) });
assert.equal(readReannounced(s), false);
assert.equal(markGiftReannounced(s, now), true);
assert.equal(readReannounced(s), true);
assert.equal(giftReannounceBlock(base(s, { now: now + 30 * 24 * hour })), 'cap');
assert.equal(markGiftReannounced(s, now + hour), false);
assert.equal(s.data[GIFT_REANNOUNCE_KEY], String(now));

// ② 재안내 표식은 기존 표식을 건드리지 않고, 기존 판정은 재안내 표식과 무관하다(같은 입력 → 같은 답)
assert.equal(s.data[GIFT_ANNOUNCE_KEY], JSON.stringify({ n: 1, last: now - 72 * hour }));
assert.deepEqual(readAnnounceState(s), { n: 1, last: now - 72 * hour });
const fresh = store({ [GIFT_ANNOUNCE_KEY]: JSON.stringify({ n: 1, last: now - 72 * hour }) });
for (const over of [{}, { now: now + hour }, { path: '/ko/app-view/flow' }, { onboardedAtMount: false }, { dialogOpen: true }, { moment: true, path: '/ko/app-view/earnings' }]) {
  assert.equal(giftAnnounceBlock(base(s, over)), giftAnnounceBlock(base(fresh, over)), JSON.stringify(over));
}
assert.equal(giftAnnounceBlock(base(s)), null);   // 재안내를 본 직후 다음 실행에도 기존 안내는 자기 규칙대로
assert.equal(markGiftAnnounced(s, now + hour), true);
assert.deepEqual(readAnnounceState(s), { n: 2, last: now + hour });
assert.equal(s.data[GIFT_REANNOUNCE_KEY], String(now));   // 기존 표식이 재안내 표식을 건드리지 않는다

// 저장소 막힘 — 띄우지 않는다
const broken: StoreLike = { getItem: () => { throw Error(); }, setItem: () => { throw Error(); } };
assert.equal(readReannounced(broken), null);
assert.equal(markGiftReannounced(broken, now), false);
assert.equal(markGiftReannounced(null, now), false);
assert.equal(giftReannounceBlock(base(broken)), 'nostore');
const writeFails: StoreLike = { getItem: () => null, setItem: () => {} };
assert.equal(markGiftReannounced(writeFails, now), false);

// 문구 — 3개 언어 · «미국 주식» 관점 · 기존 묶음(PRO 1개월 등) 그대로 쓰인다
assert.match(GIFT_REANNOUNCE_TITLE.ko, /미국 주식/);
assert.match(GIFT_REANNOUNCE_TITLE.en, /US stock/);
assert.match(GIFT_REANNOUNCE_TITLE.ja, /米国株/);
for (const l of ['ko', 'en', 'ja'] as const) {
  assert.ok(keepTogether(GIFT_REANNOUNCE_TITLE[l], GIFT_ANNOUNCE_COPY[l].keep).some((p) => p.nb), l);
}

// ③ 호스트 — 기존 ①·② 입구는 원본 그대로(설정을 기다리지 않는다), 재안내는 따로
const root = path.resolve(__dirname, '..');
const host = fs.readFileSync(path.join(root, 'src/components/app/GiftAnnounceHost.tsx'), 'utf8');
assert.match(host, /if \(!cfg \|\| run\.dashDone \|\| run\.shown \|\| locale\) return;/);
assert.match(host, /\}, \[cfg, pathname, locale, input, countBlock, show\]\);/);
assert.match(host, /\}, \[cfg, locale, input, countBlock, show\]\);/);
assert.match(host, /path: window\.location\.pathname, dialogOpen: dialogOpen\(\), now: Date\.now\(\), moment, reviewAt: reviewRequestedAt\(\),\n  \}\), \[\]\);/);
assert.match(host, /if \(!markGiftAnnounced\(localStore\(\)\)\) return;/);
assert.match(host, /if \(!markGiftReannounced\(localStore\(\)\)\) \{ re\.on = false; setReOn\(false\); return; \}/);
const existing = host.slice(host.indexOf('// ① 대시보드 입구'), host.indexOf('// ③ 재안내 설정'));
assert.ok(existing.length > 0 && !/re\.|reOn|reannounce/i.test(existing), '기존 ①·② 에 재안내 참조 없음');
assert.match(host, /loadReannounceConfig\(/);
// 재안내 시트에서 누른 것은 기존 중단 표식을 쓰지 않는다 · 재안내 표식 실패는 이번 실행 1회 몫을 쓰지 않는다
assert.match(fs.readFileSync(path.join(root, 'src/components/app/GiftAnnounceSheet.tsx'), 'utf8'), /useGiftShare\(locale, 'gift_pop', reannounce\)/);
const showRe = host.slice(host.indexOf('const showRe = useCallback'), host.indexOf('// ① 대시보드 입구'));
assert.ok(showRe.indexOf('markGiftReannounced') > 0 && showRe.indexOf('markGiftReannounced') < showRe.indexOf('run.shown = true'), 'run.shown 은 재안내 표식 성공 뒤에');
const route = fs.readFileSync(path.join(root, 'src/app/api/share-hit/route.ts'), 'utf8');
assert.match(route, /'re:dash', 're:earn', 're:report'/);

console.log('gift reannounce: separate gate, once per device, existing counters untouched — passed');
