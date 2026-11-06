/**
 * 스마트링크 클릭 «태그 색인» clk:idx:<ET날짜>:<칸> (2026-11-06)
 * 실행: node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/clickTagIndex.test.ts
 *
 * 증상: 집계 키(clk:sg:<태그>:<날짜>)는 정상으로 쌓였는데 읽는 스크립트가 «미리 아는 태그»만 읽어 그날 새 태그(ppomppu_1106 등)가 표에 0 줄.
 * 고정: recordClick 이 ① 집계 값은 예전과 똑같이 쓰고 ② 그날 색인 칸에 «<app>:<태그>» 를 남기며 ③ 이미 있으면 다시 쓰지 않고
 *   ④ gift·잘못된 태그는 색인하지 않고 ⑤ 색인 실패가 집계를 막지 않고 ⑥ 확인 읽기 전에 덮이면 합쳐 다시 쓰고
 *   ⑦ 집계 SET 실패(EC2 장애)면 색인을 건너뛰고 ⑧ 엄격 읽기가 실패하면 «빈 색인»으로 알고 덮어쓰지 않는다. Redis 는 메모리 가짜.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';

const store = new Map<string, unknown>();
const sets: string[] = [];
const ttls = new Map<string, number | undefined>();
let failIndex = false;         // 색인 읽기·쓰기가 던진다
let strictFail = false;        // 엄격 읽기가 {ok:false} (EC2 일시 실패)
let ecDown = false;            // 집계 SET 이 false
let raceOnce: Record<string, number> | null = null;   // 색인 SET 직후 다른 클릭의 SET 이 (내 줄 없이) 덮어쓴다
const isIdx = (k: string) => k.includes(':idx:');
const clone = (v: unknown) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
const rcPath = require.resolve('../src/services/redisClient');
require.cache[rcPath] = {
  id: rcPath, filename: rcPath, loaded: true,
  exports: {
    getFromCache: async (k: string) => clone(store.get(k)),
    getAuthoritativeCache: async (k: string) => {
      if (failIndex && isIdx(k)) throw new Error('down');
      if (strictFail) return { ok: false, value: null };
      return { ok: true, value: clone(store.get(k)) };
    },
    setInCache: async (k: string, v: unknown, ttl?: number) => {
      ttls.set(k, ttl);
      if (failIndex && isIdx(k)) throw new Error('down');
      if (ecDown) return false;
      sets.push(k); store.set(k, v);
      if (raceOnce && isIdx(k)) { const r = raceOnce; raceOnce = null; store.set(k, r); }
      return true;
    },
  },
} as unknown as Module;

process.env.VERCEL_ENV = 'production';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordClick, clickIndexKey, clickIndexSlot, clickKey, CLICK_INDEX_SLOTS, _setIndexRecheckMsForTest } = require('../src/lib/marketing/clickHuman');
_setIndexRecheckMsForTest(20);

const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const idxOf = (entry: string) => clickIndexKey(day, clickIndexSlot(entry));
const allIndexed = () => [...store.entries()].filter(([k]) => k.startsWith(`clk:idx:${day}:`)).flatMap(([, v]) => Object.keys(v as object)).sort();

(async () => {
  assert.equal(clickIndexKey('2026-11-06', 5, 'production'), 'clk:idx:2026-11-06:5');
  assert.equal(clickIndexKey('2026-11-06', 5, 'preview'), 'clkp:idx:2026-11-06:5');   // 미리보기는 운영 색인을 오염시키지 않는다
  assert.equal(CLICK_INDEX_SLOTS, 256);   // scripts/mkt-clicks-human.js 가 0~255 를 읽는다(64칸씩 MGET 4번)
  for (const e of ['sg:ppomppu_1106', 'code:probe_ih', 'x', '']) { const n = clickIndexSlot(e); assert.ok(Number.isInteger(n) && n >= 0 && n < 256); assert.equal(clickIndexSlot(e), n); }
  // 오늘 실제 태그들이 여러 칸으로 흩어진다(한 키 경합을 피하는 이유)
  const real = ['naver_blog_1106', 'ppomppu_1106', 'x_kr_1106', 'x_jp_1106b', 'sidedock_1106', 'note_1106', 'probe_0627', 'probe_ih'].map((t) => clickIndexSlot(`sg:${t}`));
  assert.ok(new Set(real).size >= 7, `slots ${real}`);

  // ① 집계 값은 예전과 같다 ② 색인에 남는다
  await recordClick('sg', 'ppomppu_1106', ['android|human', 'android|site:cross-site']);
  assert.deepEqual(store.get(clickKey('sg', 'ppomppu_1106', day)), { 'android|human': 1, 'android|site:cross-site': 1 });
  assert.deepEqual(store.get(idxOf('sg:ppomppu_1106')), { 'sg:ppomppu_1106': 1 });
  // 색인 보존(60일)은 집계(45일 ±10% 지터)보다 길다 — 색인이 먼저 사라져 남은 집계가 표에서 빠지지 않게
  assert.equal(ttls.get(clickKey('sg', 'ppomppu_1106', day)), 60 * 60 * 24 * 45);
  assert.ok((ttls.get(idxOf('sg:ppomppu_1106')) as number) > 60 * 60 * 24 * 45 * 1.1);

  // ③ 같은 태그 두 번째 클릭 — 집계는 +1, 색인은 다시 쓰지 않는다
  sets.length = 0;
  await recordClick('sg', 'PPOMPPU_1106', ['android|human']);
  assert.equal((store.get(clickKey('sg', 'ppomppu_1106', day)) as Record<string, number>)['android|human'], 2);
  assert.deepEqual(sets, [clickKey('sg', 'ppomppu_1106', day)]);

  await recordClick('code', 'probe_ih', ['ios|nolang']);
  await recordClick('coupon', 'ppomppu_1106', ['android|view:human']);
  // ④ gift·잘못된 태그는 색인하지 않는다(잘못된 태그는 집계도 안 한다 — 예전과 같다)
  await recordClick('gift', 'a', ['abc|ios|human']);
  await recordClick('sg', 'bad-tag', ['ios|human']);
  await recordClick('sg', '', ['ios|human']);
  assert.deepEqual(allIndexed(), ['code:probe_ih', 'coupon:ppomppu_1106', 'sg:ppomppu_1106']);
  assert.ok(store.has(clickKey('gift', 'a', day)));
  assert.ok(!store.has(clickKey('sg', 'bad-tag', day)));

  // ⑤ 색인이 던져도 집계는 남고 recordClick 은 던지지 않는다 · 빠진 줄은 다음 클릭이 다시 넣는다
  failIndex = true;
  await recordClick('sg', 'naver_blog_1106', ['desktop|human']);
  assert.deepEqual(store.get(clickKey('sg', 'naver_blog_1106', day)), { 'desktop|human': 1 });
  failIndex = false;
  await recordClick('sg', 'naver_blog_1106', ['desktop|human']);
  assert.ok(allIndexed().includes('sg:naver_blog_1106'));

  // ⑥ 내 SET 직후·확인 읽기 전에 같은 칸이 (내 줄 없이) 덮이면 → 다시 읽고 합쳐 다시 쓴다(두 줄 모두 남는다)
  const mine = 'sg:x_kr_1106'; const k6 = idxOf(mine);
  raceOnce = { ...((store.get(k6) as Record<string, number>) || {}), 'sg:other_same_slot': 1 };
  await recordClick('sg', 'x_kr_1106', ['desktop|human']);
  assert.equal((store.get(k6) as Record<string, number>)[mine], 1);
  assert.equal((store.get(k6) as Record<string, number>)['sg:other_same_slot'], 1);

  // ⑥-b 내 확인 «뒤»에 늦게 온 덮어쓰기(다른 클릭이 내 줄 없는 옛 값을 읽고 늦게 SET) → 1.2초(시험 20ms) 뒤 재확인이 다시 넣는다
  {
    const e = 'sg:late_tag'; const k = idxOf(e);
    const old = clone(store.get(k)) || {};
    const p = recordClick('sg', 'late_tag', ['ios|human']);
    await new Promise((z) => setTimeout(z, 5));   // 내 SET·확인이 끝난 뒤, 재확인 전
    assert.equal((store.get(k) as Record<string, number>)[e], 1);
    store.set(k, { ...old, 'sg:late_other': 1 });   // 늦게 도착한 다른 클릭의 SET
    await p;
    assert.equal((store.get(k) as Record<string, number>)[e], 1);
    assert.equal((store.get(k) as Record<string, number>)['sg:late_other'], 1);
  }

  // ⑦ EC2 장애(집계 SET=false) — 색인은 시도하지 않는다
  ecDown = true;
  await recordClick('sg', 'down_tag', ['ios|human']);
  ecDown = false;
  assert.ok(!allIndexed().includes('sg:down_tag'));

  // ⑧ 엄격 읽기 실패({ok:false}) — 기존 색인을 «빈 값»으로 알고 덮어쓰지 않는다
  const victim = idxOf('sg:ppomppu_1106');
  const snapshot = JSON.stringify(store.get(victim));
  strictFail = true; sets.length = 0;
  // 같은 칸에 떨어지는 새 태그를 찾는다
  let t = 0; while (clickIndexSlot(`sg:same_${t}`) !== clickIndexSlot('sg:ppomppu_1106')) t++;
  await recordClick('sg', `same_${t}`, ['ios|human']);
  strictFail = false;
  assert.equal(JSON.stringify(store.get(victim)), snapshot);
  assert.ok(!sets.some(isIdx));

  console.log('clickTagIndex: ok');
})().catch((e) => { console.error(e); process.exit(1); });
