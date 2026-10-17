/** 실제 fetchMoney → AI 사본 → UC 출구: 만기 정보가 생성 완료시각과 독립적으로 보존되는지. */
import assert from 'node:assert/strict';
import { ucMoneyAtExit } from '../src/lib/seo/ucMoneyExit';

const id = require.resolve('../src/services/darkPool');
require.cache[id] = { id, filename: id, loaded: true, exports: { getDarkPool: async () => null } } as any;
const { fetchMoney } = require('../src/app/api/undercurrent/shared') as typeof import('../src/app/api/undercurrent/shared');
let now = Date.parse('2026-10-16T15:59:00-04:00');
Date.now = () => now;
let expiry = '2026-10-16';
let calls = 0;
globalThis.fetch = async (url: any) => {
  assert.match(String(url), /\/api\/live\/ticker\?t=TSLA&skip_alpha=1$/); calls++;
  return Response.json({ prices: { price: 100 }, flow: { maxPain: 100, callWall: 110, putFloor: 90, levelsExpiration: expiry } });
};

(async () => {
  const beforeClose = await fetchMoney('https://signumhq.com', 'TSLA');
  assert.equal(beforeClose.levelsExpiration, '2026-10-16'); assert.equal(beforeClose.levelsReadAt, now);
  now = Date.parse('2026-10-16T19:02:00-04:00');
  const ctx = { generatedAt: '2026-10-16T16:20:00-04:00', lastClosed: '2026-10-16', now, todayET: '2026-10-16', regularNow: false, eod: null, levels: null };
  const old = ucMoneyAtExit(beforeClose, ctx) as any;
  assert.equal(old.maxPain, null); assert.equal(old.levelsPending, true);
  // 마감 직후 다음 주 체인을 받은 사본. generatedAt 에서 5분을 빼도 이 실제 만기를 덮으면 안 된다.
  now = Date.parse('2026-10-16T16:00:05-04:00'); expiry = '2026-10-23';
  const next = await fetchMoney('https://signumhq.com', 'TSLA');
  const kept = ucMoneyAtExit(next, { ...ctx, generatedAt: '2026-10-16T16:00:10-04:00' }) as any;
  assert.equal(kept.maxPain, 100); assert.equal(kept.levelsPending, undefined);
  assert.equal(calls, 2);
  console.log('총 2개 통과 (실제 fetchMoney 만기·조회시각 보존 → UC 출구)');
})().catch((e) => { console.error(e); process.exitCode = 1; });
