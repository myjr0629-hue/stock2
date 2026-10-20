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
const { buildMoneyMap, mapQuoteValues, aggregateMapPremium, mergeMoneyMapSources, moneyMapSession, mapWeekRange, nqObservationOf } = require('../src/lib/app/moneyMap.ts');
const { MoneyMapCards } = require('../src/components/intel/MoneyMapCards.tsx');
const copies = Object.fromEntries(['ko', 'en', 'ja'].map(loc => [loc, require(`../src/messages/${loc}.json`).moneyMap.copy]));
function isolatedModule(filename, deps) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, filename), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
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
const observed = (value, date, session, time) => ({ value, date, session, at: at(time), kind: 'live' });
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
  const regTime = (now.includes('T21:') || now.startsWith('2026-10-17') || now.startsWith('2026-10-18')) ? `${date}T20:00:00Z` : now;
  const values = { 'SPY:REG': observed(1, date, 'REG', regTime) };
  s.sectors.forEach((x, i) => { values[`${x.id}:REG`] = observed(4 - i, date, 'REG', regTime); values[`${x.id}:PRE`] = observed(3 - i, '2026-10-19', 'PRE', now); });
  if (regTime.endsWith('T20:00:00Z')) for (const v of Object.values(values)) if (v.session === 'REG') v.kind = 'close';
  ['NVDA', 'AMD', 'AVGO', 'MU', 'ASML'].forEach((t, i) => {
    values[`${t}:REG`] = { ...observed(4 - i, date, 'REG', regTime), kind: regTime.endsWith('T20:00:00Z') ? 'close' : 'live' }; values[`${t}:PRE`] = observed(3 - i, '2026-10-19', 'PRE', now);
  });
  return values;
}
test('Intel money map follows every existing overview element, including the footer', () => {
  const filename = 'src/app/[locale]/app-view/intel/page.tsx';
  const src = ts.createSourceFile(filename, fs.readFileSync(path.join(root, filename), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let page;
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(p => p.getText(src) === 'className={s.page}')) page = node;
    ts.forEachChild(node, visit);
  }
  visit(src);
  assert.ok(page);
  const children = page.children.map(node => node.getText(src).trim()).filter(Boolean);
  const maps = children.filter(text => text.includes('<TodayMoneyMap'));
  assert.deepEqual(maps, ['{!selectedSector && <TodayMoneyMap />}']);
  const footer = children.indexOf('<MobileAppFooter />'), map = children.indexOf(maps[0]);
  assert.ok(footer > children.findIndex(text => text.includes('sectorSummaries.map')));
  assert.ok(map > footer, 'append below the footer so no existing flow element is displaced');
  assert.ok(children.slice(map + 1).filter(text => !text.startsWith('{/*')).every(text => text.includes('showAdModal') && text.includes("position: 'fixed'")));
});
test('initial money-map loading renders no section or placeholder', () => {
  const { TodayMoneyMap } = isolatedModule('src/components/intel/TodayMoneyMap.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    'next-intl': { useLocale: () => 'en', useTranslations: () => ({ raw: () => copies.en }) },
    '@/lib/app/watchlist': { getWatchlistStore: () => ({ subscribe() {}, getSnapshot: () => [] }) },
    '@/lib/app/moneyMap': {}, './MoneyMapCards': { MoneyMapCards }, '@/lib/marketCalendar': {},
  });
  assert.equal(renderToStaticMarkup(React.createElement(TodayMoneyMap)), '');
});
test('unobserved sector definitions render nothing; measured zero and saved observations remain visible', () => {
  const now = at('2026-10-20T15:00:00Z');
  const empty = { ...sources(), sectors: sources().sectors.map(s => ({ ...s, fiveDay: null, premium: null })), earnings: [], earningsAt: null, events: [], eventsAt: null };
  function render(s, values = {}) {
    return renderToStaticMarkup(React.createElement(MoneyMapCards, { data: buildMoneyMap(s, values, null, now), copy: copies.en, locale: 'en', selectedId: 'SMH', onSelect() {}, now }));
  }
  assert.equal(render(empty), '');
  assert.equal(render({ ...empty, sectors: [] }), '');
  const zero = render(empty, { 'SMH:REG': observed(0, '2026-10-20', 'REG', '2026-10-20T15:00:00Z') });
  assert.equal((zero.match(/<article/g) || []).length, 3);
  assert.ok(zero.includes('0.00%'), 'an actual measured zero is data');
  for (const patch of [
    { fiveDay: { value: -2, date: '2026-10-16' } },
    { premium: { value: 0, date: '2026-10-16', count: 1, source: 'analysis' } },
  ]) {
    const saved = render({ ...empty, sectors: empty.sectors.map(s => s.id === 'SMH' ? { ...s, ...patch } : s) });
    assert.equal((saved.match(/<article/g) || []).length, 3);
    assert.ok(saved.includes('2026-10-16'));
  }
  assert.ok(render(empty, { 'SMH:REG': observed(1, '2026-10-16', 'REG', '2026-10-16T20:00:00Z') }).includes('2026-10-16'));
  assert.equal(render(empty, { 'NVDA:REG': observed(1, '2026-10-16', 'REG', '2026-10-16T20:00:00Z') }), '', 'a stock alone cannot populate a sector card without a sector observation');
});
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
  const values = mapQuoteValues({ timestamp, data: { SMH: { price: 100, previousClose: 105, changePercent: -4.76, regularDate: '2026-10-16', regularKind: 'close', extendedMissing: true, session: 'pre' } } });
  const data = buildMoneyMap(sources(), values, observed(1.25, '2026-10-19', 'PRE', '2026-10-19T11:00:00Z'), timestamp);
  assert.equal(data.sectors[1].today.date, '2026-10-16'); assert.equal(data.sectors[1].today.session, 'REG');
  assert.equal(data.leaders.length, 0); assert.ok(data.prior.some(s => s.id === 'SMH'));
});
test('measured zero survives; missing/error does not replace previous actual value/date', () => {
  const prev = { 'SMH:REG': observed(-3, '2026-10-16', 'REG', '2026-10-16T20:00:00Z') };
  assert.deepEqual(mapQuoteValues({ timestamp: at('2026-10-19T15:00:00Z'), data: { SMH: { error: 'missing', price: 0, changePercent: 0 } } }, prev), prev);
  const out = mapQuoteValues({ timestamp: at('2026-10-19T15:00:00Z'), data: { SMH: { price: 100, previousClose: 100, changePercent: 0, priceTime: at('2026-10-19T15:00:00Z'), session: 'regular' } } }, prev);
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
test('gate 10200401: NQ keeps its own measurement time — a 29-minute-old NQ is never ranked as fresh', () => {
  const dateOf = ms => new Date(ms - 4 * 3600_000).toISOString().slice(0, 10);
  // 08:00 ET 조회: NQ 07:41, ES 08:00 → futures.asOf 는 08:00(최신)이지만 NQ 관측 시각은 07:41
  const b = { futures: { live: true, asOf: '2026-10-19T12:00:00Z', nqAsOf: '2026-10-19T11:41:00Z', esAsOf: '2026-10-19T12:00:00Z', nq: { level: 1, changePct: 0.8 }, es: { level: 1, changePct: 0.5 } } };
  const nq = nqObservationOf(b, dateOf);
  assert.equal(nq.at, at('2026-10-19T11:41:00Z')); assert.equal(nq.date, '2026-10-19'); assert.equal(nq.session, 'PRE');
  const s = sources(), later = '2026-10-19T12:10:00Z', values = quoteSet(s, later);
  assert.equal(buildMoneyMap(s, values, nq, at(later)).leaders.length, 0, '08:10 ET: NQ 29분 → 순위에 쓰지 않음');
  assert.equal(buildMoneyMap(s, values, { ...nq, at: at('2026-10-19T12:00:00Z') }, at(later)).leaders.length, 3, '(옛 결함: 08:00 으로 저장하면 신선 판정)');
  // NQ 자기 시각이 없으면(구 응답·NQ 결측) 관측값을 만들지 않는다 — 최신 시각을 빌려 쓰지 않는다
  assert.equal(nqObservationOf({ futures: { live: true, asOf: '2026-10-19T12:00:00Z', nq: { changePct: 0.8 } } }, dateOf), null);
  assert.equal(nqObservationOf({ futures: { live: true, asOf: '2026-10-19T12:00:00Z', nqAsOf: null, nq: null, es: { changePct: 0.5 } } }, dateOf), null);
  assert.equal(nqObservationOf({ futures: { live: false, nqAsOf: '2026-10-19T11:41:00Z', nq: { changePct: 0.8 } } }, dateOf), null);
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

// Gate 1 regressions: response time must never stand in for measurement time.
test('gate P1: stale PRE print keeps its actual time and cannot rank against current NQ', () => {
  const now = at('2026-10-19T12:00:00Z'), trade = '2026-10-19T08:00:00Z';
  const values = mapQuoteValues({ timestamp: now, data: { SMH: {
    price: 100, previousClose: 105, changePercent: -4.76, session: 'pre',
    regularDate: '2026-10-16', regularKind: 'close', extendedPrice: 102,
    extendedMissing: false, extendedLabel: 'PRE', extendedDate: '2026-10-19',
    extendedTime: trade, extendedChangePercent: 2,
  } } });
  assert.equal(values['SMH:PRE'].at, at(trade));
  const data = buildMoneyMap(sources(), values, observed(1.25, '2026-10-19', 'PRE', '2026-10-19T12:00:00Z'), now);
  assert.equal(data.leaders.length, 0);
  assert.equal(data.prior.find(s => s.id === 'SMH').today.value, 2);
});
for (const [label, time] of [['POST', '2026-10-19T21:00:00Z'], ['CLOSED', '2026-10-20T01:00:00Z'], ['WEEKEND', '2026-10-18T12:00:00Z']]) {
  test(`gate P1: ${label} does not promote an old intraday fallback to a closing ranking`, () => {
    const date = label === 'WEEKEND' ? '2026-10-16' : '2026-10-19';
    const stale = observed(2, date, 'REG', `${date}T15:00:00Z`);
    const data = buildMoneyMap(sources(), { 'SMH:REG': stale, 'SPY:REG': { ...stale, value: 1 } }, null, at(time));
    assert.equal(data.leaders.length, 0);
    const html = renderToStaticMarkup(React.createElement(MoneyMapCards, { data, copy: copies.ko, locale: 'ko', selectedId: 'SMH', onSelect() {}, now: at(time) }));
    assert.ok(html.includes(copies.ko.prior)); assert.ok(html.includes(date)); assert.ok(html.includes('+2.00%'));
  });
}
test('gate P2: cached bounce is rechecked against the displayed return', () => {
  const now = '2026-10-19T15:00:00Z', s = sources(), values = quoteSet(s, now);
  s.sectors = s.sectors.filter(s => s.id === 'SMH');
  values['SMH:REG'].value = -3;
  const data = buildMoneyMap(s, values, null, at(now));
  assert.equal(data.sectors.find(s => s.id === 'SMH').bounce, false);
  const html = renderToStaticMarkup(React.createElement(MoneyMapCards, { data, copy: copies.ko, locale: 'ko', selectedId: 'SMH', onSelect() {}, now: at(now) }));
  assert.ok(!html.includes(`↩ ${copies.ko.bounce}`)); assert.ok(html.includes('-3.00%')); assert.ok(html.includes('-10.07%'));
});
test('gate P2: missing calendar cannot restore implied move after the earnings announcement', () => {
  const next = { ...sources(), earnings: [], earningsAt: null }, now = at('2026-10-22T12:00:00Z');
  const merged = mergeMoneyMapSources(next, sources(), now);
  assert.equal(merged.earnings[0].implied, null);
  const data = buildMoneyMap(merged, {}, null, now);
  const html = renderToStaticMarkup(React.createElement(MoneyMapCards, { data, copy: copies.ko, locale: 'ko', selectedId: 'SMH', onSelect() {}, now }));
  assert.ok(html.includes('NVDA')); assert.ok(html.includes('2026-10-21')); assert.ok(!html.includes('±7.3%'));
});

test('quote provenance preserves source dates and separates published close from intraday fallback', () => {
  const { regularQuoteProvenance } = require('../src/lib/bulkQuoteClose.ts');
  const bulk = regularQuoteProvenance({ _closeCorrected: true, _eodDate: '2026-10-16', _eodClose: 100 }, 'pre', 100);
  assert.deepEqual(bulk, { regularDate: '2026-10-16', regularTime: 0, regularKind: 'close' });
  const i = { regularDate: '2026-10-19', regularClose: 100, regularLastTime: '2026-10-19T15:00:00Z', eodCloseDate: '2026-10-16', eodClosePrice: 95 };
  const pending = regularQuoteProvenance({ _intrinio: i }, 'post', 100);
  assert.equal(pending.regularKind, 'live'); assert.equal(pending.regularTime, at(i.regularLastTime));
  const published = regularQuoteProvenance({ _intrinio: { ...i, eodCloseDate: i.regularDate, eodClosePrice: 100 } }, 'post', 100);
  assert.equal(published.regularKind, 'close');
  assert.equal(regularQuoteProvenance({ _intrinio: i }, 'post', 99).regularKind, 'unknown', 'different selected price cannot inherit provenance');
  const live = regularQuoteProvenance({ priceTime: at('2026-10-19T15:00:00Z'), lastTrade: { t: at('2026-10-19T08:00:00Z') * 1e6 } }, 'regular', 100);
  assert.equal(live.regularTime, at('2026-10-19T15:00:00Z'), 'hub price time wins over PRE snapshot time');
});
test('published closes survive the weekend; unknown legacy capture times remain displayed but unranked', () => {
  const now = at('2026-10-18T12:00:00Z');
  const values = mapQuoteValues({ timestamp: now, data: Object.fromEntries(['SMH', 'SPY'].map(t => [t, {
    price: 100, previousClose: 99, changePercent: t === 'SPY' ? 1 : 2,
    regularDate: '2026-10-16', regularKind: 'close', regularTime: 0, session: 'closed',
  }])) });
  const data = buildMoneyMap(sources(), values, null, now);
  assert.equal(data.leaders[0].id, 'SMH'); assert.equal(data.leaders[0].relative, 1);
  const legacy = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { ...v, kind: undefined, at: now }]));
  const saved = buildMoneyMap(sources(), legacy, null, now);
  assert.equal(saved.leaders.length, 0); assert.equal(saved.prior.find(s => s.id === 'SMH').today.value, 2);
});
test('unknown/future PRE timestamps preserve the last actual value without restamping it', () => {
  const timestamp = at('2026-10-19T12:00:00Z'), prev = { 'SMH:PRE': observed(2, '2026-10-19', 'PRE', '2026-10-19T11:59:00Z') };
  const q = { session: 'pre', extendedLabel: 'PRE', extendedMissing: false, extendedPrice: 100, extendedDate: '2026-10-19', extendedChangePercent: 4 };
  for (const extendedTime of [undefined, 'invalid', '2026-10-19T13:00:00Z', '2026-10-16T12:00:00Z']) {
    assert.deepEqual(mapQuoteValues({ timestamp, data: { SMH: { ...q, extendedTime } } }, prev), prev);
  }
});
test('a stale benchmark and a stale constituent cannot produce a current comparison', () => {
  const now = '2026-10-19T15:00:00Z', values = quoteSet(sources(), now);
  values['SPY:REG'].at = at('2026-10-19T14:21:00Z');
  assert.equal(buildMoneyMap(sources(), values, null, at(now)).leaders.length, 0);
  values['SPY:REG'].at = at(now); values['NVDA:REG'].at = at('2026-10-19T14:00:00Z');
  const smh = buildMoneyMap(sources(), values, null, at(now)).sectors.find(s => s.id === 'SMH');
  assert.equal(smh.stocks.find(s => s.ticker === 'NVDA').relative, null);
  assert.equal(smh.stocks.find(s => s.ticker === 'AMD').relative, 0);
});
test('saved calendar is revalidated during rendering even when all refresh requests fail', () => {
  const now = at('2026-10-22T12:00:00Z');
  const data = buildMoneyMap(sources(), {}, null, now);
  assert.equal(data.sources.earnings[0].implied, null);
  assert.ok(sources().earnings[0].implied, 'validation must not mutate stored observations');
  const html = renderToStaticMarkup(React.createElement(MoneyMapCards, { data, copy: copies.en, locale: 'en', selectedId: 'SMH', onSelect() {}, now }));
  assert.ok(html.includes('NVDA')); assert.ok(!html.includes('±7.3%'));
});

test('archived full Guardian response replay: all 16 actual five-day values reach the reader and cards', async () => {
  const envelope = process.env.MONEY_MAP_GUARDIAN_REPLAY
    ? JSON.parse(fs.readFileSync(process.env.MONEY_MAP_GUARDIAN_REPLAY, 'utf8'))
    : require('./fixtures/money-map-report-pre-1019.json').archivedGuardian;
  const snapshot = envelope.data;
  assert.equal(envelope.success, true); assert.equal(snapshot.sectors.length, 16);
  const definitions = sectorDefinitions(); let reads = 0;
  const route = isolatedModule('src/app/api/intel/money-map/route.ts', {
    'next/server': { NextResponse: { json: body => body } },
    '@/services/redisClient': { mgetFromCache: async keys => { reads++; return keys.map(k => k === 'gcore:v1' ? snapshot : null); } },
    '@/services/universePolicy': { SECTOR_MAP: definitions },
    '@/services/earningsCalendarService': { EARNINGS_CALENDAR_CACHE_KEY: 'market:earnings-calendar:v4', withConfirmedDates: () => { throw new Error('No calendar in this historical response'); } },
    '@/lib/earnings/earningsImplied': { EARNINGS_IMPLIED_KEY: 'earnings:implied:v1', impliedForRow: () => null },
    '@/lib/app/moneyMap': { aggregateMapPremium }, '@/lib/marketCalendar': require('../src/lib/marketCalendar.ts'),
  });
  const result = await route.GET();
  assert.equal(result.success, true); assert.equal(reads, 1); assert.equal(result.sources.sectors.length, 16);
  for (const sector of result.sources.sectors) {
    const actual = snapshot.rotationIntensity.fiveDayData[sector.id];
    assert.ok(actual, sector.id); assert.equal(sector.fiveDay.value, actual.cumReturn);
    assert.equal(sector.fiveDay.date, '2026-10-14'); assert.equal(sector.fiveDay.captured, true);
  }
  const now = at(snapshot.timestamp), data = buildMoneyMap(result.sources, {}, null, now);
  assert.equal(data.session, 'POST'); assert.equal(data.leaders.length, 0, 'Guardian capture alone supplies no current price provenance');
  for (const loc of ['ko', 'en', 'ja']) {
    const html = renderToStaticMarkup(React.createElement(MoneyMapCards, { data, copy: copies[loc], locale: loc, selectedId: 'SMH', onSelect() {}, now }));
    assert.equal((html.match(/<article/g) || []).length, 3);
    assert.ok(html.includes('2026-10-14')); assert.ok(html.includes(copies[loc].captured));
    assert.ok(html.includes(data.sectors.find(s => s.id === 'SMH').fiveDay.value.toFixed(2)));
  }
});

// Gate 2: a late intraday print is still not a published regular close.
for (const [label, now, date, print] of [
  ['POST', '2026-10-19T22:00:00Z', '2026-10-19', '2026-10-19T19:45:00Z'],
  ['CLOSED', '2026-10-20T01:00:00Z', '2026-10-19', '2026-10-19T19:59:00Z'],
  ['WEEKEND', '2026-10-18T12:00:00Z', '2026-10-16', '2026-10-16T19:59:00Z'],
  ['EARLY_CLOSE', '2026-11-27T19:00:00Z', '2026-11-27', '2026-11-27T17:59:00Z'],
]) test(`gate 2: ${label} late intraday fallback stays visible outside the closing ranking`, () => {
  const live = observed(2, date, 'REG', print);
  const close = { value: 1, date, session: 'REG', at: 0, kind: 'close' };
  for (const [smh, spy] of [[live, { ...live, value: 1 }], [live, close], [{ ...close, value: 2 }, { ...live, value: 1 }]]) {
    const data = buildMoneyMap(sources(), { 'SMH:REG': smh, 'SPY:REG': spy }, null, at(now));
    assert.equal(data.leaders.length, 0);
    assert.equal(data.laggards.length, 0);
    assert.equal(data.prior.find(s => s.id === 'SMH').today.value, 2);
    const html = renderToStaticMarkup(React.createElement(MoneyMapCards, { data, copy: copies.en, locale: 'en', selectedId: 'SMH', onSelect() {}, now: at(now) }));
    assert.ok(html.includes(copies.en.prior)); assert.ok(html.includes(date)); assert.ok(html.includes('+2.00%'));
  }
});
test('gate 2: analysis fallback groups by actual structure.chainDate, not the cache capture date or inference flag', async () => {
  const definitions = sectorDefinitions(), captured = at('2026-10-19T15:00:00Z');
  const redis = new Map([
    ['cache:analysis:NVDA', { netPremium: 10, timestamp: captured }],
    ['structure:v2:NVDA', { data: { netPremium: 10, chainDate: '2026-10-15', debug: { chainDateInferred: true } } }],
    ['cache:analysis:AMD', { netPremium: -4, timestamp: captured }],
    ['structure:v2:AMD', { data: { netPremium: -4, chainDate: '2026-10-16', debug: { chainDateInferred: false } } }],
  ]);
  const route = isolatedModule('src/app/api/intel/money-map/route.ts', {
    'next/server': { NextResponse: { json: body => body } },
    '@/services/redisClient': { mgetFromCache: async keys => keys.map(k => redis.get(k) || null) },
    '@/services/universePolicy': { SECTOR_MAP: definitions },
    '@/services/earningsCalendarService': { EARNINGS_CALENDAR_CACHE_KEY: 'market:earnings-calendar:v4' },
    '@/lib/earnings/earningsImplied': { EARNINGS_IMPLIED_KEY: 'earnings:implied:v1' },
    '@/lib/app/moneyMap': { aggregateMapPremium }, '@/lib/marketCalendar': require('../src/lib/marketCalendar.ts'),
  });
  const result = await route.GET(), smh = result.sources.sectors.find(s => s.id === 'SMH');
  assert.deepEqual(smh.premium, { value: -4, date: '2026-10-16', count: 1, source: 'analysis' });
  const now = captured, data = buildMoneyMap(result.sources, {}, null, now);
  const html = renderToStaticMarkup(React.createElement(MoneyMapCards, { data, copy: copies.en, locale: 'en', selectedId: 'SMH', onSelect() {}, now }));
  assert.ok(html.includes('2026-10-16')); assert.ok(!html.includes(copies.en.captured));
  // A structure for a different measured premium must not donate its trade date.
  redis.set('structure:v2:AMD', { data: { netPremium: 999, chainDate: '2026-10-16' } });
  const mismatch = await route.GET();
  assert.deepEqual(mismatch.sources.sectors.find(s => s.id === 'SMH').premium,
    { value: -4, date: '2026-10-19', count: 1, source: 'analysis', captured: true });
});

// Gate 3: a failed economic-calendar refresh must not mean "no releases today".
function renderEconomic(s, now, loc = 'en') {
  const data = buildMoneyMap(s, {}, null, at(now));
  const html = renderToStaticMarkup(React.createElement(MoneyMapCards, { data, copy: copies[loc], locale: loc, selectedId: 'SMH', onSelect() {}, now: at(now) }));
  return html.slice(html.indexOf(copies[loc].economic), html.indexOf(copies[loc].netPremium));
}
function calendarSnapshot(overrides = {}) {
  return { ...sources(), events: [{ date: '2026-09-01', time: '12:30', event: 'Archived HIGH release', impact: 'HIGH' }],
    eventsAt: '2026-09-01T10:00:00Z', eventsRange: { from: '2026-09-01', to: '2026-10-01' }, ...overrides };
}
for (const loc of ['ko', 'en', 'ja']) test(`gate 3: ${loc} September snapshot survives October refresh failure with its actual date`, () => {
  const now = '2026-10-20T12:00:00Z', previous = calendarSnapshot();
  const missing = { ...sources(), events: [], eventsAt: null, eventsRange: null };
  for (const s of [previous, mergeMoneyMapSources(missing, previous, at(now))]) {
    const html = renderEconomic(s, now, loc);
    assert.ok(!html.includes(copies[loc].noEvents), 'missing is never a confirmed empty schedule');
    assert.ok(html.includes('Archived HIGH release'), 'retain the actual previous calendar');
    assert.ok(html.includes(`${copies[loc].asOf} 2026-09-01`), 'show the saved calendar date');
  }
});
test('gate 3: no previous calendar renders a dash, including timestamp-only and invalid observations', () => {
  const now = '2026-10-20T12:00:00Z';
  for (const patch of [{ eventsAt: null }, { eventsAt: now }, { eventsAt: 'invalid' }, { eventsAt: '2026-10-21T12:00:00Z' }]) {
    const html = renderEconomic(calendarSnapshot({ events: [], eventsRange: null, ...patch }), now);
    assert.ok(!html.includes(copies.en.noEvents)); assert.match(html, />—<\/p>/);
  }
});
test('gate 3: only a fresh calendar covering the complete ET day confirms no HIGH releases', () => {
  const now = '2026-10-20T12:00:00Z';
  const fresh = calendarSnapshot({ events: [], eventsAt: '2026-10-20T10:00:00Z', eventsRange: { from: '2026-10-20', to: '2026-11-19' } });
  for (const loc of ['ko', 'en', 'ja']) {
    const html = renderEconomic(fresh, now, loc);
    assert.ok(html.includes(copies[loc].noEvents)); assert.ok(html.includes(`${copies[loc].asOf} 2026-10-20`));
  }
  for (const patch of [
    { eventsAt: '2026-10-20T05:59:00Z' }, { eventsAt: 'invalid' }, { eventsRange: null },
    { eventsRange: { from: '2026-10-21', to: '2026-11-20' } },
    { eventsRange: { from: '2026-10-01', to: '2026-10-19' } },
    { eventsRange: { from: '2026-10-01', to: '2026-10-20' } },
  ]) assert.ok(!renderEconomic({ ...fresh, ...patch }, now).includes(copies.en.noEvents));
});
test('gate 3: incomplete or invalid refresh cannot erase the previous actual calendar', () => {
  const previous = calendarSnapshot(), now = '2026-10-20T12:00:00Z';
  for (const patch of [
    { events: [], eventsRange: null, eventsAt: now },
    { events: [], eventsRange: { from: 'invalid', to: 'invalid' }, eventsAt: now },
    { events: [], eventsAt: 'invalid' },
    { events: [], eventsAt: '2026-10-21T12:00:00Z' },
    { events: [{ date: 'invalid', time: '12:30', event: 'Broken release', impact: 'HIGH' }], eventsAt: now },
  ]) {
    const merged = mergeMoneyMapSources(calendarSnapshot(patch), previous, at(now));
    assert.deepEqual(merged.events, previous.events); assert.equal(merged.eventsAt, previous.eventsAt);
    assert.deepEqual(merged.eventsRange, previous.eventsRange);
  }
});
test('gate 3: stale legacy rows without range remain dated observations and do not confirm absence', () => {
  const html = renderEconomic(calendarSnapshot({ eventsRange: undefined }), '2026-10-20T12:00:00Z');
  assert.ok(html.includes('Archived HIGH release')); assert.ok(html.includes('2026-09-01'));
  assert.ok(!html.includes(copies.en.noEvents));
});
test('gate 3: saved empty calendar expires during rendering without a successful refresh', () => {
  const s = calendarSnapshot({ events: [], eventsAt: '2026-10-20T10:00:00Z', eventsRange: { from: '2026-10-20', to: '2026-11-19' } });
  assert.ok(renderEconomic(s, '2026-10-20T16:00:00Z').includes(copies.en.noEvents));
  const expired = renderEconomic(s, '2026-10-20T16:01:00Z');
  assert.ok(!expired.includes(copies.en.noEvents)); assert.match(expired, />—<\/p>/);
  assert.ok(expired.includes(`${copies.en.asOf} 2026-10-20`));
});
test('gate 3: money-map reader forwards query range and rejects timestamp-only error envelopes', async () => {
  let economic;
  const route = isolatedModule('src/app/api/intel/money-map/route.ts', {
    'next/server': { NextResponse: { json: body => body } },
    '@/services/redisClient': { mgetFromCache: async keys => keys.map(k => k === 'fmp:econ-calendar' ? economic : null) },
    '@/services/universePolicy': { SECTOR_MAP: sectorDefinitions() },
    '@/services/earningsCalendarService': { EARNINGS_CALENDAR_CACHE_KEY: 'market:earnings-calendar:v4' },
    '@/lib/earnings/earningsImplied': { EARNINGS_IMPLIED_KEY: 'earnings:implied:v1' },
    '@/lib/app/moneyMap': { aggregateMapPremium }, '@/lib/marketCalendar': require('../src/lib/marketCalendar.ts'),
  });
  economic = { events: [], from: '2026-10-20', to: '2026-11-19', updatedAt: '2026-10-20T10:00:00Z' };
  const normal = await route.GET();
  assert.deepEqual(normal.sources.eventsRange, { from: economic.from, to: economic.to });
  assert.equal(normal.sources.eventsAt, economic.updatedAt);
  for (const bad of [{ ts: economic.updatedAt }, { events: [], source: 'ERROR', ts: economic.updatedAt }, { events: [], source: 'EMPTY', ts: economic.updatedAt }]) {
    economic = bad;
    assert.equal((await route.GET()).sources.eventsAt, null);
  }
});

// Gate 4: a September earnings snapshot cannot confirm an empty October week.
function renderEarnings(s, now, loc = 'en') {
  const data = buildMoneyMap(s, {}, null, at(now));
  const html = renderToStaticMarkup(React.createElement(MoneyMapCards, { data, copy: copies[loc], locale: loc, selectedId: 'SMH', onSelect() {}, now: at(now) }));
  return html.slice(html.indexOf(copies[loc].earnings), html.indexOf(copies[loc].economic));
}
function earningsSnapshot(overrides = {}) {
  return { ...sources(), earnings: [{ ticker: 'NVDA', date: '2026-09-02', hour: 'amc', implied: null }],
    earningsAt: '2026-09-01T10:00:00Z', earningsStatus: 'ok', earningsRange: { from: '2026-09-01', to: '2026-09-30' }, ...overrides };
}
for (const loc of ['ko', 'en', 'ja']) test(`gate 4: ${loc} missing October earnings retains dated September observations`, () => {
  const now = '2026-10-20T12:00:00Z', previous = earningsSnapshot();
  const missing = earningsSnapshot({ earnings: [], earningsAt: null, earningsRange: null, earningsStatus: 'unavailable' });
  for (const s of [previous, mergeMoneyMapSources(missing, previous, at(now))]) {
    const html = renderEarnings(s, now, loc);
    assert.ok(!html.includes(copies[loc].noEarnings), 'missing must never confirm absence');
    assert.ok(html.includes('NVDA')); assert.ok(html.includes('2026-09-02'));
    assert.ok(html.includes(`${copies[loc].asOf} 2026-09-01`));
    assert.ok(!html.includes('2026-10-19 ~ 2026-10-23'), 'archive must retain its actual displayed range');
  }
});

test('gate 4: only a fresh complete earnings query covering the entire week confirms absence', () => {
  const now = '2026-10-20T12:00:00Z';
  const normal = earningsSnapshot({ earnings: [], earningsAt: '2026-10-20T10:00:00Z', earningsRange: { from: '2026-10-19', to: '2026-11-19' } });
  for (const loc of ['ko', 'en', 'ja']) {
    assert.ok(renderEarnings(normal, now, loc).includes(copies[loc].noEarnings));
    for (const patch of [
      { earningsAt: null }, { earningsAt: 'invalid' }, { earningsAt: '2026-10-21T10:00:00Z' },
      { earningsAt: '2026-10-20T05:59:00Z' }, { earningsRange: null },
      { earningsRange: { from: '2026-10-20', to: '2026-11-19' } },
      { earningsRange: { from: '2026-10-01', to: '2026-10-22' } },
      { earningsRange: { from: '2026-02-30', to: '2026-11-19' } },
      { earningsStatus: 'partial' }, { earningsStatus: 'unavailable' }, { earningsStatus: undefined },
    ]) {
      const html = renderEarnings({ ...normal, ...patch }, now, loc);
      assert.ok(!html.includes(copies[loc].noEarnings), JSON.stringify(patch)); assert.match(html, />—<\/p>/);
    }
  }
  assert.ok(renderEarnings(normal, '2026-10-20T16:00:00Z').includes(copies.en.noEarnings));
  assert.ok(!renderEarnings(normal, '2026-10-20T16:01:00Z').includes(copies.en.noEarnings));
});
test('gate 4: failed, partial and malformed refreshes cannot erase the last normal earnings calendar', () => {
  const previous = earningsSnapshot(), now = '2026-10-20T12:00:00Z';
  for (const patch of [
    { earnings: [], earningsAt: now, earningsRange: null },
    { earnings: [], earningsAt: now, earningsStatus: 'unavailable' },
    { earnings: [], earningsAt: now, earningsStatus: 'partial' },
    { earnings: [], earningsAt: 'invalid' }, { earnings: [], earningsAt: '2026-10-21T12:00:00Z' },
    { earnings: [{ ticker: 'NVDA', date: 'invalid', implied: null }], earningsAt: now },
    { earningsAt: now, earningsRange: { from: '2026-09-30', to: '2026-09-01' } },
  ]) {
    const merged = mergeMoneyMapSources(earningsSnapshot(patch), previous, at(now));
    assert.deepEqual(merged.earnings, previous.earnings); assert.equal(merged.earningsAt, previous.earningsAt);
    assert.deepEqual(merged.earningsRange, previous.earningsRange); assert.equal(merged.earningsStatus, 'ok');
  }
});
test('gate 4: legacy rows remain visible; timestamp-only empty snapshots never confirm absence', () => {
  const now = '2026-10-20T12:00:00Z';
  const legacy = earningsSnapshot({ earningsStatus: undefined, earningsRange: undefined });
  const html = renderEarnings(legacy, now);
  assert.ok(html.includes('NVDA')); assert.ok(html.includes('2026-09-01')); assert.ok(!html.includes(copies.en.noEarnings));
  for (const loc of ['ko', 'en', 'ja']) {
    const missing = renderEarnings({ ...legacy, earnings: [] }, now, loc);
    assert.ok(!missing.includes(copies[loc].noEarnings)); assert.match(missing, />—<\/p>/);
  }
});
test('gate 4: newest complete zero replaces old rows; unrelated-sector rows do not leak into the selected sector', () => {
  const now = '2026-10-20T12:00:00Z', previous = earningsSnapshot();
  const fresh = earningsSnapshot({ earnings: [], earningsAt: '2026-10-20T10:00:00Z', earningsRange: { from: '2026-10-19', to: '2026-11-19' } });
  const merged = mergeMoneyMapSources(fresh, previous, at(now));
  assert.equal(merged.earningsAt, fresh.earningsAt); assert.equal(merged.earnings.length, 0);
  assert.ok(renderEarnings(merged, now).includes(copies.en.noEarnings));
  const other = { ...fresh, earnings: [{ ticker: 'UNRELATED', date: '2026-10-21', implied: null }] };
  assert.ok(renderEarnings(other, now).includes(copies.en.noEarnings)); assert.ok(!renderEarnings(other, now).includes('UNRELATED'));
});
for (const [label, now] of [['PRE', '2026-10-20T12:00:00Z'], ['REG', '2026-10-20T15:00:00Z'],
  ['POST', '2026-10-20T22:00:00Z'], ['CLOSED', '2026-10-21T01:00:00Z'], ['WEEKEND', '2026-10-24T12:00:00Z']]) {
  test(`gate 4: ${label} revalidates missing earnings at render time`, () => {
    for (const loc of ['ko', 'en', 'ja']) {
      const html = renderEarnings(earningsSnapshot(), now, loc);
      assert.ok(!html.includes(copies[loc].noEarnings)); assert.ok(html.includes('NVDA')); assert.ok(html.includes('2026-09-01'));
    }
  });
}
test('gate 4: money-map response distinguishes complete zero, partial data and source failure', async () => {
  let calendar;
  const route = isolatedModule('src/app/api/intel/money-map/route.ts', {
    'next/server': { NextResponse: { json: body => body } },
    '@/services/redisClient': { mgetFromCache: async keys => keys.map(k => k === 'market:earnings-calendar:v4' ? calendar : null) },
    '@/services/universePolicy': { SECTOR_MAP: sectorDefinitions() },
    '@/services/earningsCalendarService': { EARNINGS_CALENDAR_CACHE_KEY: 'market:earnings-calendar:v4', withConfirmedDates: p => p },
    '@/lib/earnings/earningsImplied': { EARNINGS_IMPLIED_KEY: 'earnings:implied:v1', impliedForRow: () => null },
    '@/lib/app/moneyMap': { aggregateMapPremium }, '@/lib/marketCalendar': require('../src/lib/marketCalendar.ts'),
  });
  const normal = { ok: true, rows: [], from: '2026-10-19', to: '2026-10-23', generatedAt: '2026-10-20T10:00:00Z',
    windows: 1, probe: { '2026-10-19': 'ok-20' }, truncated: [] };
  calendar = normal;
  const zero = (await route.GET()).sources;
  assert.equal(zero.earningsStatus, 'ok'); assert.deepEqual(zero.earnings, []);
  assert.deepEqual(zero.earningsRange, { from: normal.from, to: normal.to }); assert.equal(zero.earningsAt, normal.generatedAt);
  for (const bad of [null, { ok: false }, { ok: true, rows: [], reason: 'fmp-empty', failedAt: normal.generatedAt },
    { ...normal, error: true }, { ...normal, rows: null }]) {
    calendar = bad;
    const missing = (await route.GET()).sources;
    assert.equal(missing.earningsStatus, 'unavailable'); assert.equal(missing.earningsAt, null); assert.equal(missing.earningsRange, null);
  }
  for (const patch of [{ probe: { '2026-10-19': 'http-429' } }, { probe: {} }, { windows: 2 },
    { truncated: ['2026-10-19~2026-10-23'] }, { probe: undefined }]) {
    calendar = { ...normal, ...patch };
    assert.equal((await route.GET()).sources.earningsStatus, 'partial');
  }
});
