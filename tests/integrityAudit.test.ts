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
console.log(`${count - failures}/${count} passed`); process.exitCode = failures ? 1 : 0;
})();
