// Run: node --test tests/moneyMap.test.cjs (no env files, network, Redis or AI).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(id, ...args) {
  return originalResolve.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, ...args);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { buildMoneyMap, mapQuoteValues, aggregateMapPremium, mergeMoneyMapSources, moneyMapSession, mapWeekRange } = require('../src/lib/app/moneyMap.ts');
const { MoneyMapCards } = require('../src/components/intel/MoneyMapCards.tsx');
const copies = Object.fromEntries(['ko', 'en', 'ja'].map(loc => [loc, require(`../src/messages/${loc}.json`).moneyMap.copy]));
function isolatedModule(filename, deps) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, filename), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(id => { if (!(id in deps)) throw new Error(`Unexpected dependency: ${id}`); return deps[id]; }, mod, mod.exports);
  return mod.exports;
}
function sectorDefinitions() {
  const src = ts.createSourceFile('universe.ts', fs.readFileSync(path.join(root, 'src/services/universePolicy.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  for (const s of src.statements) if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) if (d.name.getText(src) === 'SECTOR_MAP') return new Function(`return (${d.initializer.getText(src)});`)();
  throw new Error('SECTOR_MAP missing');
}
const at = iso => Date.parse(iso);
const observed = (value, date, session, time) => ({ value, date, session, at: at(time) });
function sources() {
  return { sectors: ['XLK', 'SMH', 'XLC', 'XLY', 'XLE', 'XLP', 'HACK', 'XLV'].map((id, i) => ({
    id, tickers: i === 1 ? ['NVDA', 'AMD', 'AVGO', 'MU', 'ASML'] : ['TEST'], synthetic: false,
    fiveDay: { value: i === 1 ? -10.07 : i, date: '2026-10-16' }, bounce: i === 1,
    premium: i === 1 ? { value: -69_100_000, date: '2026-10-16', count: 5, source: 'analysis' } : null,
  })), earnings: [{ ticker: 'NVDA', date: '2026-10-21', hour: 'amc', implied: { pct: 7.3, session: '2026-10-16', expiry: '2026-10-23' } }, { ticker: 'UNRELATED', date: '2026-10-21', implied: null }],
  earningsAt: '2026-10-19T10:00:00Z', events: [{ date: '2026-10-19', time: '12:30', event: 'Building Permits', impact: 'HIGH' }, { date: '2026-10-19', time: '14:00', event: 'CPI', impact: 'HIGH' }, { date: '2026-10-19', time: '15:00', event: 'GDP', impact: 'HIGH' }, { date: '2026-10-20', time: '12:30', event: 'Future event', impact: 'HIGH' }], eventsAt: '2026-10-19T10:00:00Z' };
}
function quoteSet(s, now) {
  const date = now.startsWith('2026-10-17') || now.startsWith('2026-10-18') ? '2026-10-16' : '2026-10-19';
  const values = { 'SPY:REG': observed(1, date, 'REG', now) };
  s.sectors.forEach((x, i) => { values[`${x.id}:REG`] = observed(4 - i, date, 'REG', now); values[`${x.id}:PRE`] = observed(3 - i, '2026-10-19', 'PRE', now); });
  ['NVDA', 'AMD', 'AVGO', 'MU', 'ASML'].forEach((t, i) => {
    values[`${t}:REG`] = observed(4 - i, date, 'REG', now); values[`${t}:PRE`] = observed(3 - i, '2026-10-19', 'PRE', now);
  });
  return values;
}
for (const [session, time] of [['PRE', '2026-10-19T11:00:00Z'], ['REG', '2026-10-19T15:00:00Z'], ['POST', '2026-10-19T21:00:00Z'], ['CLOSED', '2026-10-17T01:00:00Z'], ['WEEKEND', '2026-10-18T12:00:00Z']]) {
  for (const loc of ['ko', 'en', 'ja']) test(`${session} ${loc}: render 3 cards, paired returns, dated premium, watchlist, calendar`, () => {
    const s = sources(), values = quoteSet(s, time), nq = observed(1.25, '2026-10-19', 'PRE', time);
    const data = buildMoneyMap(s, values, nq, at(time));
    assert.equal(data.session, session === 'WEEKEND' ? 'CLOSED' : session);
    assert.equal(data.leaders.length, 3); assert.equal(data.laggards.length, 3);
    assert.equal(new Set([...data.leaders, ...data.laggards].map(s => s.id)).size, 6);
    assert.equal(data.leaders[0].relative, session === 'PRE' ? 1.75 : 3);
    const html = renderToStaticMarkup(React.createElement(MoneyMapCards, { data, copy: copies[loc], locale: loc, selectedId: 'SMH', onSelect() {}, watchlist: ['NVDA', 'ASML', 'AVGO'], now: at(time) }));
    assert.equal((html.match(/<article/g) || []).length, 3);
    for (const text of [copies[loc].fiveDay, copies[loc].netPremium, '2026-10-16', '69.1M', '★', 'NVDA', copies[loc].vsSector]) assert.ok(html.includes(text), text);
    assert.ok(!html.includes('UNRELATED'));
    if (session === 'PRE' || session === 'REG' || session === 'POST') {
      assert.ok(html.includes('±7.3%')); assert.ok(html.includes('2026-10-23'));
      assert.ok(!html.includes('Future event')); assert.ok(!html.includes('>GDP<'));
      assert.ok(html.includes(loc === 'en' ? '08:30' : '21:30'), 'UTC calendar converted to locale timezone');
    }
  });
}
test('PRE missing extended trade retains Friday REG and does not compete with current PRE', () => {
  const timestamp = at('2026-10-19T11:00:00Z');
  const values = mapQuoteValues({ timestamp, data: { SMH: { price: 100, previousClose: 105, changePercent: -4.76, extendedMissing: true, session: 'pre' } } });
  const data = buildMoneyMap(sources(), values, observed(1.25, '2026-10-19', 'PRE', '2026-10-19T11:00:00Z'), timestamp);
  assert.equal(data.sectors[1].today.date, '2026-10-16'); assert.equal(data.sectors[1].today.session, 'REG');
  assert.equal(data.leaders.length, 0); assert.ok(data.prior.some(s => s.id === 'SMH'));
});
test('measured zero survives; missing/error does not replace previous actual value/date', () => {
  const prev = { 'SMH:REG': observed(-3, '2026-10-16', 'REG', '2026-10-16T20:00:00Z') };
  assert.deepEqual(mapQuoteValues({ timestamp: at('2026-10-19T15:00:00Z'), data: { SMH: { error: 'missing', price: 0, changePercent: 0 } } }, prev), prev);
  const out = mapQuoteValues({ timestamp: at('2026-10-19T15:00:00Z'), data: { SMH: { price: 100, previousClose: 100, changePercent: 0, session: 'regular' } } }, prev);
  assert.equal(out['SMH:REG'].value, 0); assert.equal(out['SMH:REG'].date, '2026-10-19');
});
test('premium sum: one actual source day, missing is not zero, measured zero needs provenance', () => {
  const result = aggregateMapPremium(['A', 'B', 'C', 'D', 'E'], {
    A: { netPremium: 10, sourceDate: '2026-10-16' }, B: { netPremium: -4, sourceDate: '2026-10-16' },
    C: { netPremium: 999, sourceDate: '2026-10-15' }, D: { netPremium: null, sourceDate: '2026-10-16' }, E: { netPremium: 0, sourceDate: '2026-10-16' },
  });
  assert.deepEqual(result, { value: 6, date: '2026-10-16', count: 2, source: 'analysis' });
  assert.equal(aggregateMapPremium(['A'], { A: { netPremium: null } }), null);
  assert.equal(aggregateMapPremium(['A'], { A: { netPremium: 0, sourceDate: '2026-10-16', premiumContracts: 2 } }).value, 0);
  const capture = aggregateMapPremium(['A'], { A: { netPremium: 4, timestamp: at('2026-10-19T11:00:00Z') } });
  assert.equal(capture.date, '2026-10-19'); assert.equal(capture.captured, true, 'capture date is explicit, never presented as an inferred option trading date');
});
test('PRE NQ does not compare with REG / wrong-date / stale benchmark', () => {
  const s = sources(), now = '2026-10-19T11:00:00Z', values = quoteSet(s, now);
  for (const nq of [null, observed(1, '2026-10-16', 'PRE', now), observed(1, '2026-10-19', 'REG', now), observed(1, '2026-10-19', 'PRE', '2026-10-19T10:00:00Z')]) {
    assert.equal(buildMoneyMap(s, values, nq, at(now)).leaders.length, 0);
  }
});
test('AI absent is omitted; actual existing sector sentence stays in its own language', () => {
  const s = sources(), now = '2026-10-19T15:00:00Z';
  s.sectors[1].why = { en: 'Existing measured sector sentence.' }; s.sectors[1].whyAt = now;
  const data = buildMoneyMap(s, quoteSet(s, now), null, at(now));
  for (const loc of ['ko', 'en', 'ja']) {
    const html = renderToStaticMarkup(React.createElement(MoneyMapCards, { data, copy: copies[loc], locale: loc, selectedId: 'SMH', onSelect() {}, now: at(now) }));
    assert.equal(html.includes('Existing measured sector sentence.'), loc === 'en');
  }
});
test('holiday, early close and weekend follow the shared market calendar', () => {
  assert.equal(moneyMapSession(at('2026-11-26T15:00:00Z')), 'CLOSED');
  assert.equal(moneyMapSession(at('2026-11-27T18:30:00Z')), 'POST');
  assert.deepEqual(mapWeekRange(at('2026-10-18T12:00:00Z')), { from: '2026-10-19', to: '2026-10-23' });
});
test('3 language namespaces have identical keys and preserve finance symbols', () => {
  assert.deepEqual(Object.keys(copies.ko), Object.keys(copies.en)); assert.deepEqual(Object.keys(copies.ko), Object.keys(copies.ja));
  for (const c of Object.values(copies)) { assert.ok(c.vsNq.includes('NQ')); assert.ok(c.vsSpy.includes('SPY')); assert.ok(c.market16.includes('ETF')); }
});
test('refresh gaps preserve dated premium/5D/implied values; an expired or completed earnings event never reuses implied move', () => {
  const old = sources(), next = sources();
  next.sectors[1].premium = null; next.sectors[1].fiveDay = null; next.earnings[0].implied = null;
  const kept = mergeMoneyMapSources(next, old, at('2026-10-19T11:00:00Z'));
  assert.deepEqual(kept.sectors[1].premium, old.sectors[1].premium); assert.deepEqual(kept.sectors[1].fiveDay, old.sectors[1].fiveDay);
  assert.equal(kept.earnings[0].implied.session, '2026-10-16');
  assert.equal(mergeMoneyMapSources(next, old, at('2026-10-24T11:00:00Z')).earnings[0].implied, null);
});
test('local REG response replay preserves actual SPY and stock measurements', () => {
  const filename = process.env.MONEY_MAP_QUOTES_REPLAY || path.join(__dirname, 'fixtures/money-map-reg-1019.json');
  const raw = JSON.parse(fs.readFileSync(filename, 'utf8')), values = mapQuoteValues(raw);
  for (const t of ['SPY', 'NVDA', 'AAPL', 'TSLA']) {
    assert.equal(values[`${t}:REG`].value, raw.data[t].changePercent);
    assert.equal(values[`${t}:REG`].date, '2026-10-19');
  }
});
test('sectorEngine adds actual 5D bar date without changing rotation computation', () => {
  const engine = isolatedModule('src/services/guardian/sectorEngine.ts', {
    '@/services/massiveClient': {}, '@/services/analysisCache': {}, '@/services/alphaEngine': {},
    '@/services/guardian/rlsiEngine': {}, '@/services/redisClient': {}, '@/services/universePolicy': { SECTOR_MAP: sectorDefinitions() },
  });
  const flows = [{ id: 'SMH', name: 'Semiconductors', change: 2.4, volume: 10 }];
  const series = { closes: [110, 108, 105, 103, 99], volumes: [10, 11, 12, 13, 14] };
  const old = engine.calculateRotationIntensityV2(flows, { SMH: series });
  const next = engine.calculateRotationIntensityV2(flows, { SMH: { ...series, dates: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'] } });
  assert.equal(next.fiveDayData.SMH.asOf, '2026-10-16');
  assert.equal(next.fiveDayData.SMH.basis, 'equalWeight', 'preserve and disclose the engine’s existing constituent-average 5D basis');
  assert.equal(next.fiveDayData.SMH.isBounce, true); assert.equal(next.score, old.score);
  assert.equal(next.fiveDayData.SMH.cumReturn, old.fiveDayData.SMH.cumReturn);
});
test('report PRE measurement extract replay: semiconductor bounce and NQ-relative strength', () => {
  const fixture = require('./fixtures/money-map-report-pre-1019.json'), time = fixture.asOf;
  const s = { sectors: fixture.sectors.map(row => ({ id: row.id, tickers: [], synthetic: false, fiveDay: { value: row.fiveDay, date: '2026-10-16' }, bounce: row.bounce, premium: null })), earnings: [], earningsAt: null, events: [], eventsAt: null };
  const values = Object.fromEntries(fixture.sectors.map(row => [`${row.id}:PRE`, observed(row.today, '2026-10-19', 'PRE', time)]));
  const data = buildMoneyMap(s, values, observed(fixture.nq, '2026-10-19', 'PRE', time), at(time));
  assert.equal(data.leaders[0].id, 'SMH'); assert.equal(data.leaders[0].relative, 1.15);
  assert.equal(data.leaders[0].fiveDay.value, -10.07); assert.equal(data.leaders[0].bounce, true);
});
test('money-map reader: all 16 canonical sectors, cached analysis fills empty instFlow, no writes/AI', async () => {
  const definitions = sectorDefinitions(), requests = [];
  const redis = new Map([
    ['gcore:v1', { timestamp: '2026-10-19T11:00:00Z', sectors: [{ id: 'SMH', change: 2.4 }], rotationIntensity: { fiveDayData: { SMH: { cumReturn: -10.07, asOf: '2026-10-16', isBounce: true } } } }],
    ['guardian:snapshot:lastgood:ko', { timestamp: '2026-10-16T20:05:00Z', sectors: [{ id: 'XLE', instFlow: { totalNetPremium: -12, tickerCount: 3 } }] }],
    ['cache:analysis:NVDA', { timestamp: at('2026-10-16T19:00:00Z'), netPremium: 10 }],
    ['cache:analysis:AMD', { timestamp: at('2026-10-16T19:00:00Z'), netPremium: -4 }],
    ['intel:ai_headlines:v1', { generatedAt: '2026-10-19T11:00:00Z', sectors: { silicon_core: { headline: '기존 반도체 문장', headlineEN: 'Existing semiconductor sentence', headlineJP: '既存の半導体の文' } } }],
    ['market:earnings-calendar:v4', { ok: true, generatedAt: '2026-10-19T10:00:00Z', rows: [{ ticker: 'NVDA', date: '2026-10-21', hour: 'amc' }] }],
    ['fmp:econ-calendar', { updatedAt: '2026-10-19T10:00:00Z', events: [{ date: '2026-10-19', time: '12:30', event: 'CPI', impact: 'HIGH' }, { impact: 'MEDIUM' }] }],
  ]);
  let corrected = 0;
  const route = isolatedModule('src/app/api/intel/money-map/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, options }) } },
    '@/services/redisClient': { mgetFromCache: async keys => { requests.push(keys); return keys.map(k => redis.get(k) || null); } },
    '@/services/universePolicy': { SECTOR_MAP: definitions },
    '@/services/earningsCalendarService': { EARNINGS_CALENDAR_CACHE_KEY: 'market:earnings-calendar:v4', withConfirmedDates: p => { corrected++; return p; } },
    '@/lib/earnings/earningsImplied': { EARNINGS_IMPLIED_KEY: 'earnings:implied:v1', impliedForRow: () => null },
    '@/lib/app/moneyMap': { aggregateMapPremium }, '@/lib/marketCalendar': require('../src/lib/marketCalendar.ts'),
  });
  const res = await route.GET();
  assert.equal(res.body.success, true); assert.equal(res.body.sources.sectors.length, 16);
  assert.equal(corrected, 1); assert.equal(requests.length, 1);
  const smh = res.body.sources.sectors.find(s => s.id === 'SMH');
  assert.deepEqual(smh.tickers, definitions.SMH.tickers); assert.equal(smh.premium.value, 6); assert.equal(smh.premium.date, '2026-10-16');
  assert.equal(smh.fiveDay.date, '2026-10-16'); assert.equal(smh.bounce, true);
  assert.equal(smh.why.en, 'Existing semiconductor sentence');
  const previous = res.body.sources.sectors.find(s => s.id === 'XLE').premium;
  assert.equal(previous.value, -12); assert.equal(previous.date, '2026-10-16'); assert.equal(previous.captured, true);
  assert.equal(res.body.sources.events.length, 1);
});
