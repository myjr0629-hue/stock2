/**
 * 딥 분석 실제 열람 집계(lib/ai/deepDemand) — 2026-10-12
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/deepDemand.test.ts
 */
import assert from 'node:assert/strict';
import { noteDeepView, topDemand, loadDemandTop, demandKey, cleanDemandTicker } from '../src/lib/ai/deepDemand';
import type { LlmStore } from '../src/lib/ai/llmStore';

const mem = () => {
  const data = new Map<string, string>();
  const st: LlmStore = {
    async get(k) { return data.has(k) ? data.get(k)! : null; }, async setEx(k, v) { data.set(k, v); }, async del(k) { data.delete(k); },
    async incrByFloat() { return 0; }, async rpush() { }, async lrange() { return []; }, async lpushTrim() { },
  };
  return { st, data };
};
let n = 0;
const ok = async (name: string, fn: () => Promise<void> | void) => { await fn(); n++; console.log('✓ ' + name); };

(async () => {
  await ok('티커 정리 — 대문자·형식 밖은 버린다', () => {
    assert.equal(cleanDemandTicker('nvda'), 'NVDA'); assert.equal(cleanDemandTicker('BRK.B'), 'BRK.B');
    assert.equal(cleanDemandTicker(''), null); assert.equal(cleanDemandTicker('A B'), null); assert.equal(cleanDemandTicker('<x>'), null); assert.equal(cleanDemandTicker(null), null);
  });
  await ok('noteDeepView — 같은 날 같은 종목은 더해지고 다른 종목은 따로, 깨진 값은 새로 시작', async () => {
    const { st, data } = mem();
    await noteDeepView('NVDA', '2026-10-13', st); await noteDeepView('nvda', '2026-10-13', st); await noteDeepView('AAPL', '2026-10-13', st);
    assert.deepEqual(JSON.parse(data.get(demandKey('2026-10-13'))!), { NVDA: 2, AAPL: 1 });
    data.set(demandKey('2026-10-14'), 'not json'); await noteDeepView('MU', '2026-10-14', st);
    assert.deepEqual(JSON.parse(data.get(demandKey('2026-10-14'))!), { MU: 1 });
    await noteDeepView('???', '2026-10-13', st);   // 무시
    assert.deepEqual(JSON.parse(data.get(demandKey('2026-10-13'))!), { NVDA: 2, AAPL: 1 });
  });
  await ok('noteDeepView — 저장소 예외를 삼킨다', async () => {
    const { st } = mem();
    await noteDeepView('NVDA', '2026-10-13', { ...st, get: async () => { throw new Error('down'); } } as LlmStore);
    await noteDeepView('NVDA', '2026-10-13', { ...st, setEx: async () => { throw new Error('down'); } } as LlmStore);
  });
  await ok('topDemand — 최근일 가중(0.8배/일)·점수 1 이상만·같으면 이름순·상위 N', () => {
    const today = { NVDA: 1, AAPL: 3 };
    const d1 = { AAPL: 2, MSFT: 5, TSLA: 1 };
    const d2 = { TSLA: 1, MU: 1 };
    const top = topDemand([today, d1, d2], 3);
    assert.deepEqual(top.map((x) => x.ticker), ['AAPL', 'MSFT', 'TSLA']);   // NVDA 1.0 < TSLA 1.44, MU 0.64 는 점수 1 미만이라 빠진다
    assert.equal(top[0].score, 4.6);                   // 3 + 2 × 0.8
    assert.equal(top[1].score, 4);                     // 5 × 0.8
    assert.equal(top[2].score, 1.44);                  // 1 × 0.8 + 1 × 0.64
    assert.deepEqual(topDemand([{ A: 1, B: 1 }], 5).map((x) => x.ticker), ['A', 'B']);   // 같은 점수 → 이름순
    assert.deepEqual(topDemand([{ X: 0.5 }], 5), []);   // 점수 1 미만은 수요로 안 친다
    assert.deepEqual(topDemand([], 10), []); assert.deepEqual(topDemand([null, undefined], 10), []);
    assert.equal(topDemand([{ A: 1, B: 2, C: 3 }], 0).length, 0);
  });
  await ok('loadDemandTop — 저장소에서 읽는다(읽기 실패한 날은 빈 날)', async () => {
    const { st, data } = mem();
    data.set(demandKey('2026-10-13'), JSON.stringify({ NVDA: 4 })); data.set(demandKey('2026-10-12'), JSON.stringify({ AAPL: 2, NVDA: 1 })); data.set(demandKey('2026-10-11'), '{broken');
    const top = await loadDemandTop(['2026-10-13', '2026-10-12', '2026-10-11'], 10, st);
    assert.deepEqual(top.map((x) => x.ticker), ['NVDA', 'AAPL']);
    assert.equal(top[0].score, 4.8);
    assert.deepEqual(await loadDemandTop(['2026-10-13'], 10, { ...st, get: async () => { throw new Error('down'); } } as LlmStore), []);
  });
  console.log(`\n${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
