/**
 * 스마트링크 클릭 «태그 색인» clk:idx:<ET날짜> (2026-11-06)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/clickTagIndex.test.ts
 *
 * 증상: 집계 키(clk:sg:<태그>:<날짜>)는 정상으로 쌓였는데 읽는 스크립트가 «미리 아는 태그»만 읽어 그날 새 태그(ppomppu_1106 등)가 표에 0 줄.
 * 고정: recordClick 이 ① 집계 값은 예전과 똑같이 쓰고 ② 그날 색인에 «<app>:<태그>» 를 남기며 ③ 이미 있으면 다시 쓰지 않고
 *       ④ gift(초대자 버킷)·잘못된 태그는 색인하지 않고 ⑤ 색인 실패가 집계를 막지 않는다. Redis 는 메모리 가짜로 바꾼다.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';

const store = new Map<string, unknown>();
const sets: string[] = [];
let failIndex = false;
let ecDown = false;
let raceOnce: Record<string, number> | null = null;   // 색인 SET 직후 «다른 클릭의 SET» 이 덮어쓴 상황
const rcPath = require.resolve('../src/services/redisClient');
require.cache[rcPath] = {
  id: rcPath, filename: rcPath, loaded: true,
  exports: {
    getFromCache: async (k: string) => { if (failIndex && k.includes(':idx:')) throw new Error('down'); return store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null; },
    setInCache: async (k: string, v: unknown) => { if (failIndex && k.includes(':idx:')) throw new Error('down'); if (ecDown) return false; sets.push(k); store.set(k, v); if (raceOnce && k.includes(':idx:')) { const r = raceOnce; raceOnce = null; store.set(k, r); } return true; },
  },
} as unknown as Module;

process.env.VERCEL_ENV = 'production';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordClick, clickIndexKey, clickKey } = require('../src/lib/marketing/clickHuman');

const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

(async () => {
  assert.equal(clickIndexKey('2026-11-06', 'production'), 'clk:idx:2026-11-06');
  assert.equal(clickIndexKey('2026-11-06', 'preview'), 'clkp:idx:2026-11-06');   // 미리보기는 운영 색인을 오염시키지 않는다
  const idx = clickIndexKey(day);

  // ① 집계 값은 예전과 같다 ② 색인에 남는다
  await recordClick('sg', 'ppomppu_1106', ['android|human', 'android|site:cross-site']);
  assert.deepEqual(store.get(clickKey('sg', 'ppomppu_1106', day)), { 'android|human': 1, 'android|site:cross-site': 1 });
  assert.deepEqual(store.get(idx), { 'sg:ppomppu_1106': 1 });

  // ③ 같은 태그 두 번째 클릭 — 집계는 +1, 색인은 다시 쓰지 않는다
  sets.length = 0;
  await recordClick('sg', 'PPOMPPU_1106', ['android|human']);
  assert.equal((store.get(clickKey('sg', 'ppomppu_1106', day)) as Record<string, number>)['android|human'], 2);
  assert.deepEqual(sets, [clickKey('sg', 'ppomppu_1106', day)]);

  // 다른 앱·태그는 같은 하루 색인에 더해진다(기존 줄 보존)
  await recordClick('code', 'probe_ih', ['ios|nolang']);
  await recordClick('coupon', 'ppomppu_1106', ['android|view:human']);
  assert.deepEqual(store.get(idx), { 'sg:ppomppu_1106': 1, 'code:probe_ih': 1, 'coupon:ppomppu_1106': 1 });

  // ④ gift(초대자 버킷)·잘못된 태그는 색인하지 않는다(잘못된 태그는 집계도 안 한다 — 예전과 같다)
  await recordClick('gift', 'a', ['abc|ios|human']);
  await recordClick('sg', 'bad-tag', ['ios|human']);
  await recordClick('sg', '', ['ios|human']);
  assert.deepEqual(Object.keys(store.get(idx) as object).sort(), ['code:probe_ih', 'coupon:ppomppu_1106', 'sg:ppomppu_1106']);
  assert.ok(store.has(clickKey('gift', 'a', day)));   // gift 집계 자체는 그대로
  assert.ok(!store.has(clickKey('sg', 'bad-tag', day)));

  // ⑤ 색인 실패가 집계를 막지 않는다(던지지도 않는다)
  failIndex = true;
  await recordClick('sg', 'naver_blog_1106', ['desktop|human']);
  assert.deepEqual(store.get(clickKey('sg', 'naver_blog_1106', day)), { 'desktop|human': 1 });
  failIndex = false;
  // 경합으로 빠진 줄도 다음 클릭이 다시 넣는다
  await recordClick('sg', 'naver_blog_1106', ['desktop|human']);
  assert.equal((store.get(idx) as Record<string, number>)['sg:naver_blog_1106'], 1);

  // ⑥ 경합: 내 SET 직후 다른 새 태그의 SET 이 (내 줄 없이) 덮어쓴다 → 다시 읽고 합쳐 다시 쓴다(두 줄 모두 남는다)
  const before = { ...(store.get(idx) as Record<string, number>) };
  raceOnce = { ...before, 'sg:x_kr_1106': 1 };
  await recordClick('sg', 'ppomppu_1105', ['ios|human']);
  assert.equal((store.get(idx) as Record<string, number>)['sg:ppomppu_1105'], 1);
  assert.equal((store.get(idx) as Record<string, number>)['sg:x_kr_1106'], 1);

  // ⑦ EC2 장애(집계 SET 실패=false) — 색인은 시도하지 않는다(장애 때 Upstash 로 새는 읽기를 늘리지 않음)
  ecDown = true; sets.length = 0;
  await recordClick('sg', 'down_tag', ['ios|human']);
  assert.ok(!(store.get(idx) as Record<string, number>)['sg:down_tag']);
  ecDown = false;

  console.log('clickTagIndex: ok');
})().catch((e) => { console.error(e); process.exit(1); });
