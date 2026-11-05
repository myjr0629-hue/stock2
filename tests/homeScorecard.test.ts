import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homeScorecard } from '../src/lib/earnings/homeScorecard';

const week = '2026-11-02';
const previous = '2026-10-26';
const empty = { week, summary: { n: 0, withinCount: 0 }, rows: [] };
const scored = (w: string) => ({ week: w, summary: { n: 2, withinCount: 1 }, rows: [
  { ticker: 'MSFT', expectedPct: 3, actualPct: 5, beyond: true },
  { ticker: 'AAPL', expectedPct: 4.6, actualPct: -1.8976, beyond: false },
] });
(async () => {
  const calls: string[] = [];
  const line = await homeScorecard(async w => { calls.push(w); return scored(w); }, week, 'ko');
  assert.equal(line, '이번 주 채점: 2종목 중 1개 예상 범위 안 · 최근: AAPL 예상 ±4.6% → 실제 −1.9%(안)');
  assert.deepEqual(calls, [week]);
  calls.length = 0;
  assert.match((await homeScorecard(async w => { calls.push(w); return w === week ? empty : scored(w); }, week, 'ko'))!, /^지난주 채점/);
  assert.deepEqual(calls, [week, previous]);
  assert.equal(await homeScorecard(async w => ({ ...empty, week: w }), week, 'en'), null);
  assert.equal(await homeScorecard(async () => { throw new Error('offline'); }, week, 'ko'), null);
  assert.equal(await homeScorecard(async w => w === week ? empty : Promise.reject(new Error('offline')), week, 'ko'), null);
  assert.equal(await homeScorecard(async () => ({ ...scored(week), rows: [] }), week, 'ja'), null);
  assert.match((await homeScorecard(async w => scored(w), week, 'ja'))!, /範囲内/);
  const home = readFileSync('src/app/[locale]/(home)/page.tsx', 'utf8');
  assert.equal((home.match(/locale === 'ko' \? 'break-keep' : ''/g) ?? []).length, 2);
  for (const [locale, tagline] of Object.entries({ ko: '미국 주식 실적·시장 흐름을 한눈에', en: 'US stock earnings and market moves at a glance', ja: '米国株の決算と市場の動きをひと目で' })) {
    const messages = JSON.parse(readFileSync(`src/messages/${locale}.json`, 'utf8'));
    assert.equal(messages.home.signumTagline, tagline);
  }
  console.log('home scorecard and copy: ok');
})().catch(e => { console.error(e); process.exit(1); });
