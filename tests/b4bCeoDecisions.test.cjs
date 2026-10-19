// Offline regression: no .env reads, real network, Redis/DB writes or browsers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
const mocks = new Map();
Module._load = function (name, parent, main) {
  if (mocks.has(name)) return mocks.get(name);
  return originalLoad.call(this, name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : name, parent, main);
};
require.extensions['.ts'] = (mod, file) => {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  mod._compile(code, file);
};
global.fetch = async () => { throw new Error('Unmocked network request'); };
let count = 0;
async function test(name, fn) { await fn(); count++; console.log(`PASS ${name}`); }
const IV = require('../src/lib/ivRank.ts');
const { marketDownsideRisk, fearGreedScore } = require('../src/lib/marketIndicators.ts');
const { summarizeWhaleOpening, openingSideTotal } = require('../src/lib/whaleOpening.ts');
const { whaleCandidates } = require('../src/lib/todayPicks/select.ts');
const { whatText, viewOf, ruleTexts } = require('../src/lib/todayPicks/copy.ts');
const { selectInsights, segText } = require('../src/lib/app/watchlistInsights.ts');
const { createAggregator, finalizeTickers } = require('../scripts/intrinio-options-eod.js'); // main() is not invoked
const now = Date.parse('2026-10-19T10:00:00Z'); // Monday premarket: last session Friday
const dates = IV.ivWindowSessions('2026-10-16');
const daily = dates.map((date, i) => ({ timestamp: Date.parse(`${date}T19:45:00Z`), iv30Date: date, iv30: 40 - i / 100, iv30Def: IV.IV30_DEF }));
const snapshot = (data) => ({ json: async () => data });
(async () => {
  await test('D02 audit: 200 intraday rows / 73~106 unique levels no longer produce 98~99', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ timestamp: daily[0].timestamp - i * 60000, iv30Date: '2026-10-16', iv30: 37.46 - (i % 100) / 100, iv30Def: IV.IV30_DEF }));
    const distinct = [...new Set(rows.map(r => r.iv30))];
    const old = Math.round(distinct.filter(iv => iv < rows[0].iv30).length / distinct.length * 100);
    assert.equal(old, 99);
    const r = IV.ivRankFromHistory(rows, { nowMs: now });
    assert.equal(r.ok, false); assert.equal(r.sampleSize, 1); assert.equal(r.currentSession, '2026-10-16');
  });
  await test('D02 252 daily IV30 values, source period and strict-below percentile', () => {
    const r = IV.ivRankFromHistory([...daily].reverse(), { nowMs: now });
    assert.equal(r.ok, true); assert.equal(r.sampleSize, 252); assert.equal(r.percentile, 100);
    assert.equal(r.currentSession, dates[0]); assert.equal(r.periodStart, dates[251]); assert.equal(r.periodEnd, dates[0]);
    assert.equal(r.currentIvAt, daily[0].timestamp);
    const flat = IV.ivRankFromHistory(daily.map(r => ({ ...r, iv30: 30 })), { nowMs: now });
    assert.equal(flat.ok, true); assert.equal(flat.percentile, 0); // repeated values on DIFFERENT days all count
  });
  await test('D02 missing session cannot be replaced by older 253rd day / ATM IV', () => {
    const missing = daily.slice(); missing.splice(42, 1);
    missing.push({ ...daily[251], timestamp: Date.parse('2025-09-01T19:45:00Z') });
    const r = IV.ivRankFromHistory(missing, { nowMs: now });
    assert.equal(r.ok, false); assert.equal(r.sampleSize, 251);
    assert.equal(IV.ivRankFromHistory(daily.map(r => ({ timestamp: r.timestamp, atmIv: 20 })), { nowMs: now }).ok, false);
    assert.equal(IV.ivRankFromHistory(daily.slice(1), { nowMs: now }).reason, 'stale');
  });
  await test('D02 holidays, weekend copies, invalid/future timestamps cannot inflate daily samples', () => {
    assert(!dates.includes('2025-11-27')); assert(!dates.includes('2025-12-25')); assert(!dates.includes('2026-09-07'));
    const extra = [NaN, now + 86400000, Date.parse('2026-10-18T18:00:00Z')].map(timestamp => ({ timestamp, iv30Date: '2026-10-16', iv30: 100, iv30Def: IV.IV30_DEF }));
    assert.deepEqual(IV.ivRankFromHistory([...daily, ...extra], { nowMs: now }), { ...IV.ivRankFromHistory(daily, { nowMs: now }), windowRows: 255, rawIvRows: 252 });
  });
  await test('D02 source date: prior-session chain must not become a fresh daily sample', () => {
    const shifted = daily.map((r, i) => i === 0 ? { ...r, iv30Date: '2026-10-15' } : r);
    const r = IV.ivRankFromHistory(shifted, { nowMs: now });
    assert.equal(r.ok, false); assert.equal(r.currentSession, '2026-10-15'); assert.equal(r.reason, 'stale');
    const noDate = daily.map(({ iv30Date, ...r }) => r);
    assert.equal(IV.ivRankFromHistory(noDate, { nowMs: now }).ok, false);
  });
  let cacheWrites = [], ivRows = daily;
  mocks.set('next/server', { NextResponse: { json: (body, init) => ({ body, init }) } });
  mocks.set('@/services/redisClient', { getFromCache: async () => null, setInCache: async (...args) => { cacheWrites.push(args); } });
  mocks.set('@/lib/aws/dynamoDataProvider', { getIv30DailyHistory: async () => ivRows });
  const ivApi = require('../src/app/api/flow/iv-percentile/route.ts');
  await test('D02 API schema: new cache namespace, null plus dates/count when insufficient', async () => {
    const realNow = Date.now; Date.now = () => now;
    try {
      ivRows = daily.slice(0, 12);
      const res = await ivApi.GET({ nextUrl: new URL('https://offline.test/api?t=NVDA') });
      assert.equal(res.body.percentile, null); assert.equal(res.body.currentSession, '2026-10-16'); assert.equal(res.body.sampleSize, 12);
      assert.equal(res.body.window, 252); assert.equal(res.body.windowUnit, 'trading-days');
      assert(cacheWrites[0][0].includes('v4-daily252'));
      ivRows = daily;
      assert.equal((await ivApi.GET({ nextUrl: new URL('https://offline.test/api?t=NVDA') })).body.percentile, 100);
    } finally { Date.now = realNow; }
  });
  await test('D02 source failure is missing (503), not a measured zero sample count', async () => {
    const provider = mocks.get('@/lib/aws/dynamoDataProvider');
    const original = provider.getIv30DailyHistory;
    provider.getIv30DailyHistory = async () => { throw new Error('offline failure'); };
    try {
      const result = await ivApi.GET({ nextUrl: new URL('https://offline.test/api?t=NVDA') });
      assert.equal(result.init.status, 503); assert.equal(result.body.percentile, null); assert.equal(result.body.sampleSize, null);
    } finally { provider.getIv30DailyHistory = original; }
  });
  await test('D02 actual reader follows DynamoDB pages and partial reads remain missing', async () => {
    let calls = [], failSecond = false;
    mocks.set('./dynamoClient', { TABLES: { GEX_HISTORY: 'offline-history' }, queryItems: async () => [], getDynamoClient: () => ({ send: async (cmd, opts) => {
      calls.push(cmd.input); assert(opts.abortSignal);
      if (calls.length === 1) return { Items: daily.slice(0, 160), LastEvaluatedKey: { ticker: 'NVDA', timestamp: 1 } };
      if (failSecond) throw new Error('offline page failure');
      return { Items: daily.slice(160) };
    } }) });
    mocks.set('@aws-sdk/lib-dynamodb', { QueryCommand: class { constructor(input) { this.input = input; } } });
    const reader = require('../src/lib/aws/dynamoDataProvider.ts');
    const rows = await reader.getIv30DailyHistory('NVDA', now);
    assert.equal(rows.length, 252); assert.equal(calls.length, 2); assert(calls[1].ExclusiveStartKey);
    assert(calls[0].ProjectionExpression.includes('iv30')); assert.equal(calls[0].ScanIndexForward, false);
    calls = []; failSecond = true;
    assert.equal(IV.ivRankFromHistory(await reader.getIv30DailyHistory('NVDA', now), { nowMs: now }).ok, false);
    assert.equal(IV.ivLevelForRank({ metric: 'iv30', currentIv: 30, _source: 'dynamodb-stale' }), null);
  });
  await test('D30 audit: RLSI 32 -> downside risk 68 in both views, F&G remains 18', () => {
    assert.equal(marketDownsideRisk({ score: 32 }), 68);
    for (const value of [undefined, null, NaN, Infinity, -1, 101, { score: 50, available: false }]) assert.equal(marketDownsideRisk(value), null);
    assert.equal(marketDownsideRisk({ score: 0 }), 100); assert.equal(marketDownsideRisk({ score: 100 }), 0);
    assert.equal(fearGreedScore(18, 30), 18); assert.equal(fearGreedScore(0, 30), 0);
    assert.equal(fearGreedScore(null, 12), 100); assert.equal(fearGreedScore(null, 35), 0);
    assert.equal(fearGreedScore(null, 23.5), 50); assert.equal(fearGreedScore(null, null), null);
  });
  const A = createAggregator({ CLOSE: 1000, LOW: 3 }, { baselineComplete: true, baselineTickers: ['NVDA'] });
  function add(contract, d, isCall = true, exp = '2026-11-20', strike = 100) {
    A.add({ sym: 'NVDA', contract, oi: (contract === 'CLOSE' ? 1000 : contract === 'LOW' ? 3 : 0) + d, vol: 100, isCall, gamma: 0.01, strike, iv: .3, delta: .5, exp });
  }
  add('CLOSE', -500); add('LOW', 2);
  for (let i = 0; i < 20; i++) add(`CALL${i}`, 10000);
  add('PUT', 30000, false); add('EXPIRED', 90000, true, '2026-10-16');
  const raw = finalizeTickers(A.agg).NVDA;
  const bundle = { date: '2026-10-16', prevDate: '2026-10-15', tickers: { NVDA: raw } };
  const total = summarizeWhaleOpening(raw, e => e <= '2026-10-16');
  await test('D35 full chain: >12 contracts, small OI, brand-new contracts, no closing offset, expired excluded', () => {
    assert.equal(raw.top.length, 12); assert.equal(total.callContracts, 200002); assert.equal(total.putContracts, 30000);
    assert.equal(total.contracts, 230002); assert.equal(openingSideTotal(total), 200002);
    assert.equal(total.largest.added, 30000); assert.equal(total.largest.type, 'put');
  });
  await test('D35 largest contract means largest positive OI change, not highest strike notional', () => {
    const a = createAggregator({}, { baselineComplete: true, baselineTickers: ['X'] });
    for (const [contract, oi, strike] of [['HIGH_STRIKE', 100, 1000], ['LARGE_OI', 1000, 10]]) a.add({ sym: 'X', contract, oi, vol: 0, isCall: true, gamma: 0, strike, iv: .3, delta: .5, exp: '2026-11-20' });
    assert.equal(summarizeWhaleOpening(finalizeTickers(a.agg).X, () => false).largest.added, 1000);
  });
  await test('D35 old/incomplete baseline or top12-only payload is missing, observed zero stays zero', () => {
    const old = createAggregator({ LOW: 3 }); old.add({ sym: 'NVDA', contract: 'LOW', oi: 5, vol: 100, isCall: true, gamma: 0, strike: 100, iv: .3, delta: .5, exp: '2026-11-20' });
    assert.equal(summarizeWhaleOpening(finalizeTickers(old.agg).NVDA, () => false), null);
    assert.equal(summarizeWhaleOpening({ top: raw.top }, () => false), null);
    const zero = summarizeWhaleOpening({ openingBasis: raw.openingBasis, openingByExpiry: {} }, () => false);
    assert.equal(zero.contracts, 0); assert.equal(openingSideTotal(zero), 0);
    assert.equal(openingSideTotal({ side: 'call', callContracts: NaN }), null);
    const [candidate] = whaleCandidates(bundle, { lastClosed: '2026-10-16', isEtf: () => false });
    assert.equal(whatText({ ...candidate.facts, opening: zero }, 'ko'), '고래 신규 콜 +0 · 최대 계약 —');
  });
  global.fetch = async () => ({ ok: true, json: async () => ({ result: JSON.stringify(bundle) }) });
  const optionsApi = require('../src/app/api/flow/options-eod/route.ts');
  await test('D35 all=1/watchlist and single ticker/flow return exactly same aggregate and source dates', async () => {
    const url = 'https://offline.test/api/flow/options-eod?at=2026-10-19T10:00:00Z';
    const all = (await optionsApi.GET({ url: url + '&all=1' })).body;
    const single = (await optionsApi.GET({ url: url + '&t=NVDA' })).body;
    assert.deepEqual(all.opening.NVDA, single.opening); assert.deepEqual(single.opening, total);
    assert.equal(single.prevDate, all.prevDate); assert.equal(single.prevDate, '2026-10-15');
  });
  await test('D35 today/dash, flow API, watchlist label use same side total; max contract is separate', () => {
    const [c] = whaleCandidates(bundle, { lastClosed: '2026-10-16', isEtf: () => false });
    assert(c); assert.deepEqual(c.facts.opening, total);
    for (const loc of ['ko', 'en', 'ja']) {
      const text = whatText(c.facts, loc);
      assert(text.includes('+200,002')); assert(text.includes('+30,000'));
      assert(text.includes(loc === 'ko' ? '최대 계약' : loc === 'en' ? 'Largest contract' : '最大契約'));
    }
    const chips = selectInsights({ ticker: 'NVDA', price: null, changePct: null, levels: { ok: false }, nowMs: now, whale: { contracts: total.callContracts, notional: total.callNotional, side: total.side, date: bundle.date, prevDate: bundle.prevDate } }, 'ko', 10);
    const chip = chips.find(c => c.kind === 'whale'); assert(chip); assert(segText(chip.long).includes('+200,002'));
    const legacy = { ...c.facts }; delete legacy.opening;
    assert(whatText(legacy, 'ko').startsWith('고래 신규 풋 —')); // legacy best is PUT; no forged aggregate
  });
  await test('D35 old source is visible as missing in watchlist; multi-session baseline is rejected', async () => {
    const chips = selectInsights({ price: null, changePct: null, levels: { ok: false }, nowMs: now,
      whale: { unavailable: true, contracts: null, notional: null, side: 'call', date: bundle.date, prevDate: bundle.prevDate } }, 'ko', 10);
    assert(chips.some(c => c.kind === 'whale' && segText(c.long) === '고래 신규 포지션 —'));
    assert.equal(summarizeWhaleOpening(raw, () => false, { date: '2026-10-16', prevDate: '2026-10-14' }), null);
    bundle.tickers.NVDA = { top: raw.top };
    try {
      const all = (await optionsApi.GET({ url: 'https://offline.test/api?all=1&at=2026-10-19T10:00:00Z' })).body;
      assert(!all.opening.NVDA); assert.equal(all.openingMissing.NVDA.date, '2026-10-16');
    } finally { bundle.tickers.NVDA = raw; }
  });
  await test('D35 stored today facts refresh from same EOD source without writes', async () => {
    mocks.set('@/services/bedrockClient', { callBedrock: async () => { throw new Error('AI forbidden in read'); } });
    mocks.set('@/services/darkPool', { getDarkPoolBatchChecked: async () => ({ ok: false }) });
    mocks.set('@/services/impliedMoveService', { readImpliedMoveRows: async () => [] });
    mocks.set('@/lib/earningsConfirmed', { CONFIRMED_EARNINGS: [] });
    const [c] = whaleCandidates(bundle, { lastClosed: '2026-10-16', isEtf: () => false });
    const text = ruleTexts(c.ticker, c.facts);
    const doc = { v: 1, at: now, etDate: '2026-10-16', items: [{ ...c, facts: { ...c.facts, opening: null }, what: text.what, why: text.fallback, push: text.push, whyAi: false }] };
    mocks.get('@/services/redisClient').mgetFromCache = async () => [null, doc];
    const before = cacheWrites.length;
    const service = require('../src/services/todayPicksService.ts');
    const result = await service.readPicks(now);
    assert.deepEqual(result.doc.items[0].facts.opening, total);
    assert(whatText(result.doc.items[0].facts, 'ko').includes('고래 신규 콜 +200,002'));
    assert.equal(cacheWrites.length, before);
  });
  await test('D10 structural regression: only whale values in mix, filings in separate existing card', () => {
    const flow = fs.readFileSync(path.join(root, 'src/app/[locale]/app-view/flow/page.tsx'), 'utf8');
    const mix = flow.slice(flow.indexOf('{totalCompositionLabel}'), flow.indexOf('{/* 내부자 공시'));
    assert(!mix.includes('insiderNetDisplay')); assert(!mix.includes('whaleCopy.darkBlocks'));
    assert(mix.includes('formatCompactMoney(whaleDayTotal, 1)'));
    assert(flow.includes('내부자(공시)')); assert(flow.includes('{insiderNetDisplay}'));
    assert(flow.includes('const rawIvRankVal = ivRankOverride;'));
    for (const file of ['dash', 'guardian']) {
      const src = fs.readFileSync(path.join(root, `src/app/[locale]/app-view/${file}/page.tsx`), 'utf8');
      assert(src.includes('marketDownsideRisk(')); assert(src.includes('fearGreedScore('));
      const declaration = src.match(/const riskScore = ([^;]+);/)[0];
      assert.equal(vm.runInNewContext(declaration + ';riskScore', { marketDownsideRisk, rlsi: { score: 32 }, data: { rlsi: { score: 32 } } }), 68);
      assert.equal(vm.runInNewContext(declaration + ';riskScore', { marketDownsideRisk, rlsi: null, data: null }), null);
    }
  });
  console.log(`${count}/${count} passed`);
})().catch(err => { console.error(err); process.exitCode = 1; });
