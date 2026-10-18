import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
const store = new Map<string, any>();
const stub = (p: string, exports: any) => { const id = require.resolve(p); require.cache[id] = { id, filename: id, loaded: true, exports } as Module; };
stub('../src/services/redisClient', { getFromCache: async (k: string) => store.get(k) ?? null, mgetFromCache: async (ks: string[]) => ks.map(k => store.get(k) ?? null), setInCache: async () => { throw Error('unexpected write'); } });
let darkNever = false;
let dark: any = { VXX: { ticker: 'VXX', pct: 27.9, volRatio: 4.06, volume: 10000000, date: '2026-10-16', marketAvg: 50.2 } };
stub('../src/services/darkPool', { getDarkPool: async () => null, getDarkPoolBatchChecked: async () => darkNever ? await new Promise(() => {}) : ({ ok: true, map: dark }) });
stub('../src/services/bedrockClient', {});
stub('../src/services/impliedMoveService', {});
stub('../src/services/structureService', {});
const { readPicks, TP_KEYS } = require('../src/services/todayPicksService');
const { applyLevelsToUnified } = require('../src/lib/optionLevelGate');
const { applyConfirmedEarnings } = require('../src/lib/earningsConfirmed');
const { fetchMoney } = require('../src/app/api/undercurrent/shared');
const { GET: briefingGet } = require('../src/app/api/guardian/briefing/route');
const { NextRequest } = require('next/server');
const { buildView } = require('../src/lib/todayPicks/view');
const { ruleTexts } = require('../src/lib/todayPicks/copy');
let failures = 0, count = 0;
async function test(name: string, fn: () => any) { count++; try { await fn(); console.log(`PASS ${name}`); } catch(e: any) { failures++; console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`); } }
const src = (p: string) => fs.readFileSync(p, 'utf8');
(async () => {
await test('P1-7 stored FINRA facts and AI numbers follow current source', async () => {
 const facts = { kind: 'darkpool', date: '2026-10-16', pct: 28.3, ratio: 4.7, volume: 10000000, marketAvg: 50.2 };
 const tx = ruleTexts('VXX', facts);
 const doc = { v: 1, at: Date.now(), etDate: '2026-10-16', items: [{ id: 'darkpool:VXX', kind: 'darkpool', ticker: 'VXX', asOf: facts.date, facts, what: tx.what, why: { ko: '20일 평균의 4.7배', en: '4.7 times', ja: '4.7倍' }, whyAi: true, push: tx.push }] };
 store.set(TP_KEYS.latest, doc);
 const r = await readPicks(); const v = buildView(r.doc, 'ko', false).items[0];
 assert.match(v.what, /27.9%/); assert.match(v.what, /4.1배/); assert.doesNotMatch(v.why, /4.7/);
 assert.equal(doc.items[0].facts.pct, 28.3, 'saved document is immutable');
 dark = {}; const missing = await readPicks(); assert.equal(missing.doc.items.length, 1, 'preserve last known dated facts on failure');
});
await test('P1-7 slow FINRA preserves dated card inside API budget', async () => {
 const { GET } = require('../src/app/api/today-picks/route');
 const at = Date.now(); darkNever = true;
 try { const r = await (await GET(new Request('http://localhost/api/today-picks?loc=ko'))).json();
 assert.equal(r.items.length, 1); assert.match(r.items[0].what, /28.3%/); assert.ok(Date.now() - at < 2500); }
 finally { darkNever = false; }
});
await test('P2-1 IV display uses the current IV30 paired with rank', () => {
 const { ivLevelForRank } = require('../src/lib/ivRank');
 assert.equal(ivLevelForRank({ metric: 'iv30', currentIv: 37.46, percentile: 99 }), 37.46);
 assert.equal(ivLevelForRank({ currentIv: 32.07, metric: 'atmIv' }), null);
 assert.equal(ivLevelForRank({ currentIv: null, metric: 'iv30' }), null);
 assert.match(src('src/app/[locale]/app-view/cmd/page.tsx'), /ivLevelForRank/);
});
await test('P2-2 missing flip clears distance and direction at exit', () => {
 const out = applyLevelsToUnified({ structure: {}, volatility: { flipLevel: 180, flipDistance: 14.6, isAboveFlip: true } }, null);
 assert.equal(out.volatility.flipLevel, null); assert.equal(out.volatility.flipDistance, null); assert.equal(out.volatility.isAboveFlip, null);
});
await test('P2-3 official MSFT and AMZN schedules replace pending; unknown hours stay unknown', () => {
 const rows = ['MSFT','AMZN','ZZZZ'].map(ticker => ({ ticker, date: ticker === 'MSFT' ? '2026-10-28' : '2026-10-29', hour: '', dateStatus: 'est' }));
 const out = applyConfirmedEarnings(rows, '2026-10-18').rows;
 for(const ticker of ['MSFT','AMZN']) { const r = out.find((r: any) => r.ticker === ticker); assert.equal(r.dateStatus, 'confirmed'); assert.equal(r.hour, 'amc'); }
 assert.equal(out.find((r: any) => r.ticker === 'ZZZZ').hour, '');
});
await test('P2-4 closed quote timestamp is source session; early close respected', () => {
 const { priceAsOfET } = require('../src/lib/quoteBasis');
 assert.equal(priceAsOfET('CLOSED', '2026-10-16', null, Date.parse('2026-10-17T23:50:00Z')), '10/16/2026, 16:00');
 assert.equal(priceAsOfET('CLOSED', '2026-11-27', null, Date.parse('2026-11-28T23:50:00Z')), '11/27/2026, 13:00');
 assert.equal(priceAsOfET('CLOSED', null, null, Date.now()), null);
});
await test('P2-5 REG and structure reference exclude after hours', () => {
 const { regularReferencePrice } = require('../src/lib/quoteBasis');
 const s = { lastTrade: { p: 213.75 }, day: { c: 214.13 }, prevDay: { c: 217.23 } };
 assert.equal(regularReferencePrice(s, true), 214.13); assert.equal(regularReferencePrice(s, false), 213.75);
 assert.equal(regularReferencePrice({ lastTrade: {p: 213.75} }, true), null);
});
await test('P2-6 dealer gamma card includes its own session date', () => {
 assert.match(src('src/app/[locale]/app-view/dash/page.tsx'), /withSessionDay\(gateCopy.signals.gamma.kicker, dealerGamma\?\.date/);
});
await test('P2-7 UC reads percent display contract, including zero and null', async () => {
 const original = globalThis.fetch;
 try { for (const change of [-1.427, 0, null]) { globalThis.fetch = async () => Response.json({ display: { price: 214.13, changePctPct: change } }); const m = await fetchMoney('https://www.signumhq.com', 'NVDA'); assert.equal(m.changePct, change); } }
 finally { globalThis.fetch = original; }
});
await test('P2-8 weekend serves last valid briefing with original date', async () => {
 const OriginalDate = Date; const now = Date.parse('2026-10-18T01:00:00Z');
 globalThis.Date = class extends OriginalDate { constructor(v?: any) { super(v === undefined ? now : v); } static now() { return now; } } as any;
 try { store.set('guardian:morning_briefing:lastgood:ko', { source: 'claude', date: '2026-10-16', generatedAt: '2026-10-16T12:00:00Z', briefing: '지난 금요일 시장의 정상 브리핑입니다. '.repeat(6) });
 const r = await (await briefingGet(new NextRequest('http://localhost/api/guardian/briefing?locale=ko'))).json(); assert.ok(r.briefing); assert.equal(r.date, '2026-10-16'); assert.equal(r.stale, true);
 assert.match(r.briefing, /2026-10-16/);
 } finally { globalThis.Date = OriginalDate; }
});
await test('P2-4/7 market uses source timestamp and yield bp delta', async () => {
 stub('../src/services/macroHubProvider', { getMacroSnapshotSSOT: async () => ({ marketStatus: { market: 'CLOSED' }, asOfET: 'now', factors: { nasdaq100: { marketTime: '2026-10-16T20:00:00Z', level: 29392 }, vix: { level: 20 }, us10y: { level: 4.2, chgAbs: -0.01 } } }) });
 const { GET } = require('../src/app/api/live/market/route'); const r = await (await GET()).json();
 assert.match(r.timestampET, /10\/16\/2026, 16:00/); assert.equal(r.us10y.changeBp, -1);
});
await test('P2-5 old stored implied move rebases to dated official close and reselects ATM', async () => {
 const OriginalDate = Date; const now = Date.parse('2026-10-18T01:00:00Z');
 globalThis.Date = class extends OriginalDate { constructor(v?: any) { super(v === undefined ? now : v); } static now() { return now; } } as any;
 try {
 stub('../src/services/eodSnapshot', { readEodCloses: async () => ({ date: '2026-10-16', rows: new Map([['NVDA', { c: 214.13 }]]) }) });
 stub('../src/services/structureService', { structureV2Key: (t: string) => `s:${t}`, structureLastGoodKey: (t: string) => `l:${t}` });
 delete require.cache[require.resolve('../src/services/impliedMoveService')];
 const { readImpliedMoveRows } = require('../src/services/impliedMoveService');
 const { IMPLIED_MOVE_DEF } = require('../src/lib/impliedMove');
 const im = { def: IMPLIED_MOVE_DEF, pct: 4.2, spot: 213.75, strike: 212.5, straddle: 8.98, expiry: '2026-10-23', basis: 'eod', session: '2026-10-16', chainDate: '2026-10-16', callPrice: 4.49, putPrice: 4.49 };
 store.set('s:NVDA', { timestamp: now, data: { underlyingPrice: 213.75, expiration: '2026-10-23', impliedMove: im } });
 let rows = await readImpliedMoveRows([{ ticker: 'NVDA' }]); assert.equal(rows[0].spot, 214.13); assert.equal(rows[0].straddle, 8.98);
 assert.equal(im.spot, 213.75, 'stored object unchanged');
 const chain = [212.5, 215].flatMap(k => ['call','put'].map(type => ({ details: { strike_price: k, contract_type: type, expiration_date: '2026-10-23' }, last_quote: { midpoint: 4.5 }, day: { close: 4.5 } })));
 store.set('polygon:snapshot:probe:NVDA', { probeResults: chain, chainDate: '2026-10-16' });
 rows = await readImpliedMoveRows([{ ticker: 'NVDA' }]); assert.equal(rows[0].strike, 215); assert.equal(rows[0].spot, 214.13);
 store.delete('polygon:snapshot:probe:NVDA');
 // EOD mismatch must never rebase a different session.
 stub('../src/services/eodSnapshot', { readEodCloses: async () => ({ date: '2026-10-15', rows: new Map([['NVDA', { c: 100 }]]) }) });
 delete require.cache[require.resolve('../src/services/impliedMoveService')];
 rows = await require('../src/services/impliedMoveService').readImpliedMoveRows([{ ticker: 'NVDA' }]); assert.equal(rows[0].spot, 213.75);
 } finally { globalThis.Date = OriginalDate; }
});
await test('P2-8 movers retain price and change but never fabricate EOD previous close', async () => {
 const OriginalDate = Date; const now = Date.parse('2026-10-17T23:50:00Z');
 globalThis.Date = class extends OriginalDate { constructor(v?: any) { super(v === undefined ? now : v); } static now() { return now; } } as any;
 try {
 const rows = new Map(Array.from({ length: 205 }, (_, i) => [String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + i % 26), { c: 40, v: 1000000, chgPct: 1.1 }]));
 rows.set('SPY', { c: 765.18, v: 2000000, chgPct: -0.86 });
 stub('../src/services/eodSnapshot', { readEodCloses: async () => ({ date: '2026-10-16', rows }) });
 stub('../src/services/splitGuard', { applySplitGuard: async (v: any) => v });
 const m = { ticker: 'SPY', price: 765.18, changePercent: -0.86, prevClose: 771.817, value: 1530360000 };
 store.set('market:movers:all:v4', { ts: now, value: [m], gainers: [m], losers: [m] });
 const { GET } = require('../src/app/api/market/movers/route');
 const r = await (await GET(new NextRequest('http://localhost/api/market/movers?type=losers'))).json();
 assert.equal(r.movers[0].prevClose, null); assert.equal(r.movers[0].price, 765.18); assert.equal(r.movers[0].changePercent, -0.86);
 } finally { globalThis.Date = OriginalDate; }
});

// 2차 관문 10180934: 네 재현은 운영 접속 없이 실제 읽기 출구에서 검증한다.
async function atWeekend(fn: () => Promise<void>) {
 const OriginalDate = Date; const now = Date.parse('2026-10-18T01:00:00Z');
 globalThis.Date = class extends OriginalDate { constructor(v?: any) { super(v === undefined ? now : v); } static now() { return now; } } as any;
 try { await fn(); } finally { globalThis.Date = OriginalDate; }
}
const expiry = '2026-10-23';
const legs = (strike: number, price: number, exp = expiry) => ['call', 'put'].map(type => ({ details: { strike_price: strike, contract_type: type, expiration_date: exp }, last_quote: { midpoint: price }, _rtGreeks: false }));
function seedRebase() {
 store.clear();
 stub('../src/services/eodSnapshot', { readEodCloses: async () => ({ date: '2026-10-16', rows: new Map([['NVDA', { c: 214.13 }]]) }) });
 delete require.cache[require.resolve('../src/services/impliedMoveService')];
 const svc = require('../src/services/impliedMoveService');
 const im = { def: 'atm-straddle-mid/1', pct: 4.2, spot: 213.75, strike: 212.5, straddle: 8.98, expiry, basis: 'eod', session: '2026-10-16', chainDate: '2026-10-16', callPrice: 4.49, putPrice: 4.49 };
 store.set('s:NVDA', { timestamp: Date.now(), data: { underlyingPrice: 213.75, expiration: expiry, chainDate: '2026-10-16', impliedMove: im } });
 return { svc, im };
}
await test('gate 1: a later 0.8x FINRA row preserves the complete dated surge, never hides it', async () => {
 store.clear();
 const facts = { kind: 'darkpool', date: '2026-10-15', pct: 48, ratio: 2.8, volume: 10000000, marketAvg: 50.2 };
 const tx = ruleTexts('VXX', facts);
 const pick = { id: 'darkpool:VXX', kind: 'darkpool', ticker: 'VXX', asOf: facts.date, facts, what: tx.what, why: tx.fallback, whyAi: false, push: tx.push };
 store.set(TP_KEYS.latest, { v: 1, at: Date.now(), etDate: facts.date, items: [pick] });
 dark = { VXX: { ticker: 'VXX', date: '2026-10-16', pct: 35, volRatio: 0.8, volume: 10000000, marketAvg: 50.2 } };
 const out = await readPicks();
 assert.equal(out.doc.items.length, 1);
 assert.deepEqual(out.doc.items[0], pick, 'date, facts, explanation and push remain one historical observation');
});
await test('gate 2: October 15 probe cannot overwrite October 16 close and option pair', () => atWeekend(async () => {
 const { svc, im } = seedRebase();
 store.set('polygon:snapshot:probe:NVDA', { probeResults: legs(215, 10), chainDate: '2026-10-15' });
 const [row] = await svc.readImpliedMoveRows([{ ticker: 'NVDA' }]);
 assert.equal(row.impliedMovePct, 4.2); assert.equal(row.spot, 214.13); assert.equal(row.straddle, 8.98); assert.equal(row.session, '2026-10-16');
 assert.equal(im.spot, 213.75);
}));
await test('gate 3: recovered exact weekly chain reselects 215 strike and 5.1 percent', () => atWeekend(async () => {
 const { svc } = seedRebase();
 store.set('polygon:snapshot:probe:NVDA', { exactResults: legs(215, 5.46), probeResults: legs(215, 20, '2026-10-30'), chainDate: '2026-10-15', chainDates: { [expiry]: '2026-10-16' } });
 const [row] = await svc.readImpliedMoveRows([{ ticker: 'NVDA' }]);
 assert.equal(row.strike, 215); assert.equal(row.impliedMovePct, 5.1); assert.equal(row.straddle, 10.92); assert.equal(row.spot, 214.13); assert.equal(row.session, '2026-10-16');
}));
await test('gate 4: expired English short cache still guards weekend Korean amounts using lastgood', () => atWeekend(async () => {
 store.clear();
 const normal = '시장은 중립 국면을 유지하고 있으며 광폭 매도세 없이 선별적인 약세가 관찰되고 있다. 주요 지수와 업종의 거래 흐름은 정규장 마감 기준으로 집계되었다.';
 const ko = { source: 'claude', date: '2026-10-16', generatedAt: '2026-10-16T12:00:00Z', briefing: `Tesla가 $20억 신용 한도를 확보했다. ${normal}` };
 store.set('guardian:morning_briefing:lastgood:ko', ko);
 store.set('guardian:morning_briefing:lastgood:en', { ...ko, date: '10/16/2026', briefing: 'Tesla secured a $20 billion credit facility. Markets remained neutral and activity was selective across sectors.' });
 const r = await (await briefingGet(new NextRequest('http://localhost/api/guardian/briefing?locale=ko'))).json();
 assert.doesNotMatch(r.briefing, /\$20억/); assert.match(r.briefing, /시장은 중립/); assert.equal(r.date, ko.date); assert.equal(r.stale, true);
 assert.match(ko.briefing, /\$20억/, 'stored text is immutable');
}));


await test('FINRA refresh keeps selection boundaries and accepts valid later observations', async () => {
 store.clear();
 const facts = { kind: 'darkpool', date: '2026-10-15', pct: 48, ratio: 2.8, volume: 10000000, marketAvg: 50.2 };
 const tx = ruleTexts('VXX', facts);
 const pick = { id: 'darkpool:VXX', kind: 'darkpool', ticker: 'VXX', asOf: facts.date, facts, what: tx.what, why: tx.fallback, whyAi: false, push: tx.push };
 store.set(TP_KEYS.latest, { v: 1, at: Date.now(), etDate: facts.date, items: [pick] });
 const valid = { ticker: 'VXX', date: '2026-10-16', pct: 35, volRatio: 1.5, volume: 1000000, volP: 90, marketAvg: 50.2 };
 for (const change of [{ volRatio: 1.499 }, { volume: 999999 }, { volP: 89.99 }, { pct: 100 }, { pct: 0 }, { date: '2026-10-14' }]) {
  dark = { VXX: { ...valid, ...change } };
  assert.deepEqual((await readPicks()).doc.items[0], pick);
 }
 dark = { VXX: valid };
 const p = (await readPicks()).doc.items[0];
 assert.equal(p.asOf, valid.date); assert.equal(p.facts.ratio, 1.5); assert.equal(p.whyAi, false);
 for (const loc of ['ko', 'en', 'ja']) {
  const line = buildView({ v: 1, at: Date.now(), etDate: facts.date, items: [p] }, loc, false).items[0];
  assert.match(line.what, /35.0%/); assert.match(line.what, /1.5/);
 }
 assert.deepEqual(store.get(TP_KEYS.latest).items[0], pick);
});
await test('probe session guard handles missing dates, per-expiry dates and exact precedence', () => atWeekend(async () => {
 const { svc } = seedRebase();
 const key = 'polygon:snapshot:probe:NVDA';
 for (const meta of [{}, { chainDate: '2026-10-16', chainDates: { [expiry]: '2026-10-15' } }, { chainDate: '2026-10-16', weeklyExpiry: '2026-10-30' }]) {
  store.set(key, { probeResults: legs(215, 10), ...meta });
  const [row] = await svc.readImpliedMoveRows([{ ticker: 'NVDA' }]);
  assert.equal(row.impliedMovePct, 4.2); assert.equal(row.session, '2026-10-16');
 }
 store.set(key, { exactResults: legs(215, 5.46), probeResults: legs(215, 10), chainDate: '2026-10-16' });
 const [batch] = await svc.readImpliedMoveRows([{ ticker: 'NVDA' }]);
 const single = await svc.weeklyImpliedMoveFromProbe('NVDA', 214.13, expiry);
 assert.equal(batch.impliedMovePct, 5.1); assert.equal(single.pct, batch.impliedMovePct); assert.equal(single.strike, batch.strike);
}));
await test('briefing amount guard covers current, legacy, preserved, and repair fallback in ko and ja', () => atWeekend(async () => {
 const originalFetch = globalThis.fetch;
 globalThis.fetch = async () => { throw Error('unexpected network'); };
 try {
 for (const locale of ['ko', 'ja']) {
  const normal = locale === 'ko'
   ? '시장은 중립 국면을 유지하고 있으며 광폭 매도세 없이 선별적인 약세가 관찰되고 있다. 주요 지수와 업종의 거래 흐름은 정규장 마감 기준으로 집계되었다.'
   : '市場は中立の状態を維持しており、主要指数と業種の取引状況は通常取引時間の終値を基準として集計された。全面的な売りではなく、一部の業種に選択的な弱さが観察されている。';
  const bad = locale === 'ko' ? 'Tesla가 $20억 신용 한도를 확보했다.' : 'Teslaは20億ドルの信用枠を確保した。';
  for (const mode of ['today', 'legacy', 'prior', 'repair']) {
   if (locale === 'ja' && mode === 'legacy') continue;
   store.clear();
   const date = mode === 'today' || mode === 'legacy' ? '2026-10-17' : '2026-10-16';
   const payload = { source: 'claude', date, generatedAt: `${date}T12:00:00Z`, briefing: `${bad} ${normal}` };
   store.set(mode === 'legacy' ? 'guardian:morning_briefing' : mode === 'today' ? `guardian:morning_briefing:${locale}` : `guardian:morning_briefing:lastgood:${locale}`, payload);
   // An unrelated short-lived English edition must not outrank the matching preserved edition.
   store.set('guardian:morning_briefing:en', { ...payload, date: '2026-10-18', briefing: 'Tesla secured a $2 billion facility. Markets were neutral across sectors and activity remained selective.' });
   store.set('guardian:morning_briefing:lastgood:en', { ...payload, date: `10/${date.slice(-2)}/2026`, briefing: 'Tesla secured a $20 billion credit facility. Markets remained neutral and activity was selective across sectors.' });
   const res = await (await briefingGet(new NextRequest(`http://localhost/api/guardian/briefing?locale=${locale}${mode === 'repair' ? '&repair=1' : ''}`))).json();
   assert.equal(res.success, true); assert.equal(res.date, date);
   assert.doesNotMatch(res.briefing, /\$20억|20億ドル/, `${locale}:${mode}`);
   assert.ok(res.briefing.includes(normal), `${locale}:${mode} preserves the usable original text`);
   assert.ok(payload.briefing.includes(bad));
  }
 }
 } finally { globalThis.fetch = originalFetch; }
}));
await test('English reference from another day cannot delete a historical amount', () => atWeekend(async () => {
 store.clear();
 const briefing = 'Tesla가 $200억 신용 한도를 확보했다. 시장은 중립 국면을 유지하고 있으며 광폭 매도세 없이 선별적인 약세가 관찰되고 있다. 주요 지수와 업종의 거래 흐름은 정규장 마감 기준으로 집계되었다.';
 const base = { source: 'claude', date: '2026-10-16', generatedAt: '2026-10-16T12:00:00Z', briefing };
 store.set('guardian:morning_briefing:lastgood:ko', base);
 for (const k of ['guardian:morning_briefing:en', 'guardian:morning_briefing:lastgood:en']) store.set(k, { ...base, date: '2026-10-15', briefing: 'Tesla secured a $2 billion facility. Markets were neutral across sectors and activity remained selective.' });
 const r = await (await briefingGet(new NextRequest('http://localhost/api/guardian/briefing?locale=ko'))).json();
 assert.match(r.briefing, /\$200억/); assert.equal(r.date, base.date);
}));

console.log(`${count - failures}/${count} passed`); process.exitCode = failures ? 1 : 0;
})();
