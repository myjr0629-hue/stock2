/**
 * 수집 Lambda SMA 분산 게이트 시험(실시간 약 75초) — harvest_lambda/index.js [Intrinio 분당 상한]
 * 실행: node tests/harvest.smaPacing.test.js
 * 최악 조건: GEX 856회가 0초에 한꺼번에 나간 뒤 SMA 509종목 × 2회(지연 250ms, 동시 6종목) — 최근 60초 합이 상한(1,300)+동시 여유 안인가.
 */
const assert = require('node:assert/strict');
const sent = [];
globalThis.fetch = async (u) => { sent.push(Date.now()); await new Promise((r) => setTimeout(r, 250)); return { ok: true, json: async () => ({}) }; };
const { __smaPacing: P } = require('../harvest_lambda/index.js');
const URL_ = 'https://api-v2.intrinio.com/securities/X/prices/technicals/sma';
(async () => {
  const t0 = Date.now();
  await Promise.all(Array.from({ length: 856 }, () => globalThis.fetch(URL_))); // GEX 몰림
  let next = 0, waits = 0; const N = 509;
  const worker = async () => { for (;;) { const i = next++; if (i >= N) return; waits += await P.smaGate(2); await Promise.all([globalThis.fetch(URL_), globalThis.fetch(URL_)]); } };
  await Promise.all(Array.from({ length: P.SMA_CONCURRENCY }, worker));
  const dur = (Date.now() - t0) / 1000;
  let peak = 0; for (let i = 0, j = 0; i < sent.length; i++) { while (sent[i] - sent[j] >= 60000) j++; peak = Math.max(peak, i - j + 1); }
  console.log('호출', sent.length, '· 최근60초 최대', peak, '· 게이트 기록 최대', P.peak(), '· 상한', P.SMA_ROLLING_CAP, '· 걸린 시간', dur.toFixed(1) + '초 · 대기 합', Math.round(waits / 1000) + '초');
  assert.equal(sent.length, 856 + N * 2);
  assert.ok(peak <= P.SMA_ROLLING_CAP + P.SMA_CONCURRENCY * 2, 'peak ' + peak);
  assert.ok(peak < 2000 * 0.7, '70% 미만');
  assert.ok(dur < 120, '시간 ' + dur);
  console.log('harvest.smaPacing: 통과');
})().catch((e) => { console.error('실패', e.message); process.exit(1); });
