// 크론 겹침·잠금 장애 — 실적 크론이 쓰기 잠금을 «실제로» 얻은 회차만 실적 결과 알림 단계를 돈다(관문 11011001 #2 · 11011010 #2)
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

const calls = { store: 0, strict: 0, send: 0 };
let report: Record<string, unknown> = {};
const countingStore = new Proxy({}, { get: (_t, prop) => async () => { calls.store++; if (prop === 'setNx') return true; if (prop === 'smembers' || prop === 'mget') return []; return null; } });
const mock = (rel: string, exports: Record<string, unknown>) => {
  const p = require.resolve(rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports } as NodeModule;
};
mock('../src/services/signalAlertsService', { envMode: () => 'live', upstashStore: () => countingStore });
mock('../src/lib/push/sendSignal', { sendSignalPushes: async () => { calls.send++; return new Map(); } });
mock('../src/services/redisClient', { getAuthoritativeCache: async () => { calls.strict++; return { ok: true, value: null }; } });
mock('../src/services/earningsActualsService', { ACTUALS_RUN_LOCK_SEC: 90, runActualsCycle: async () => report });
const route = require('../src/app/api/cron/earnings-actuals/route') as typeof import('../src/app/api/cron/earnings-actuals/route');

const base = { now: 0, today: '2026-10-14', considered: 1, expectedSaved: [], actualsSaved: [], rechecked: [], skipped: [] };
(async () => {
  // busy(다른 회차가 도는 중) · unavailable(잠금 저장소 불가·시간 초과) — 둘 다 lockAcquired=false
  for (const why of ['run_locked', 'lock_unavailable']) {
    report = { ...base, lockAcquired: false, skipped: [{ key: '*', reason: why }] };
    const res = await route.GET(new NextRequest('https://example.test/api/cron/earnings-actuals'));
    assert.equal(res.status, 200);
    assert.deepEqual(calls, { store: 0, strict: 0, send: 0 }, `${why}: 발송 단계는 저장소·기록을 건드리지 않는다`);
  }
  // dryRun 은 잠금이 있어도 발송 단계를 돌지 않는다
  report = { ...base, lockAcquired: true };
  await route.GET(new NextRequest('https://example.test/api/cron/earnings-actuals?dry=1'));
  assert.deepEqual(calls, { store: 0, strict: 0, send: 0 }, 'dryRun');
  // (잠금을 얻은 회차의 단계 동작은 tests/earningsResultAlert.test.ts 가 단계 함수로 직접 본다)
  console.log('크론 겹침 시험 통과');
})().catch((e) => { console.error(e); process.exitCode = 1; });
