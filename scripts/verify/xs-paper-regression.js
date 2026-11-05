// Isolated DynamoDB/Redis fixtures: no network or real writes.
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const originalLoad = Module._load;
class Command { constructor(input) { this.input = input; } }
class GetCommand extends Command {} class BatchGetCommand extends Command {} class BatchWriteCommand extends Command {} class PutCommand extends Command {}
let db, requests, xsDate;
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const key = x => JSON.stringify([x.pk, x.sk]);
const client = { async send(cmd) {
  if (cmd instanceof GetCommand) return { Item: structuredClone(db.get(key(cmd.input.Key))) };
  if (cmd instanceof BatchGetCommand) {
    const [table, request] = Object.entries(cmd.input.RequestItems)[0];
    return { Responses: { [table]: request.Keys.map(({ ticker, date }) => table === 'signum-xs-history'
      ? { ticker, date, close: 10, mcap: 2e10, xsScore: 95 }
      : { ticker, date, open: 10, close: 10, changePct: 1 }) } };
  }
  if (cmd instanceof BatchWriteCommand) {
    const items = cmd.input.RequestItems['signum-trade-journal'].map(x => x.PutRequest.Item);
    const keys = items.map(key); if (new Set(keys).size !== keys.length) throw new Error('ValidationException: Provided list of item keys contains duplicates');
    requests.push(items); for (const item of items) db.set(key(item), structuredClone(item)); return {};
  }
  throw Error('unexpected command');
} };
Module._load = function(id, parent, main) {
  if (id === '@aws-sdk/client-dynamodb') return { DynamoDBClient: class {} };
  if (id === '@aws-sdk/lib-dynamodb') return { DynamoDBDocumentClient: { from: () => client }, GetCommand, BatchGetCommand, BatchWriteCommand, PutCommand };
  return originalLoad.call(this, id, parent, main);
};
process.env.UPSTASH_REDIS_REST_URL = 'https://fixture.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = '';
delete process.env.INTRINIO_API_KEY;
global.fetch = async (url, options) => {
  if (options?.method === 'POST') return { json: async () => ({}) };
  return { json: async () => ({ result: url.endsWith('/cache:xs:scores') ? { date: xsDate, scores: { AAA: 95 } } : null }) };
};
const engine = require(path.resolve(process.argv[2] || 'scripts/lambda-xs-paper/index.js'));
function fixture({ kill = true, date = today, lastRun = yesterday } = {}) {
  db = new Map(); requests = []; xsDate = date;
  const state = { pk:'STATE', sk:'_CURRENT_', cash: 0, halted:false, weekId: isoWeek(date), weekStartNav: kill ? 1000 : 30, lastRun };
  const pos = { pk:'POS', sk:'_OPEN_', list: [1,2,3].map((n) => ({ t:'AAA', qty:1, entryPx:20, entryDate:`2026-01-0${n}`, tradingDaysHeld: kill ? 0 : 2 })) };
  for (const item of [state,pos]) db.set(key(item), item);
}
function isoWeek(d) { const dt=new Date(d+'T00:00:00Z'); const day=(dt.getUTCDay()+6)%7; dt.setUTCDate(dt.getUTCDate()-day+3); const wk1=new Date(Date.UTC(dt.getUTCFullYear(),0,4)); return dt.getUTCFullYear()+'-W'+String(1+Math.round(((dt-wk1)/86400000-3+((wk1.getUTCDay()+6)%7))/7)).padStart(2,'0'); }
(async () => {
  fixture();
  if (process.argv[3] === 'old') { await assert.rejects(engine.handler({}), /duplicates/); console.log('PASS original reproduces duplicate BatchWrite'); return; }
  await engine.handler({});
  let trades = [...db.values()].filter(x => x.pk === 'TRADE'); assert.equal(trades.length,3); assert.equal(new Set(trades.map(key)).size,3); assert.ok(trades.every(x=>x.kill));
  await engine.handler({}); assert.equal([...db.values()].filter(x=>x.pk==='TRADE').length,3); console.log('PASS kill 3 tranches, unique writes, same-day rerun');
  fixture({kill:false}); await engine.handler({}); trades=[...db.values()].filter(x=>x.pk==='TRADE'); assert.equal(trades.length,3); assert.equal(new Set(trades.map(key)).size,3); assert.ok(trades.every(x=>!x.kill)); console.log('PASS normal 3 tranches');
  fixture({date:yesterday,lastRun:'2020-01-01'}); await engine.handler({date:yesterday,dry:true}); assert.equal(requests.length,0); console.log('PASS past date allowed; dry writes zero');
  fixture({date:yesterday,lastRun:yesterday}); await assert.rejects(engine.handler({date:yesterday,dry:true}),/must be after/);
  fixture({date:yesterday,lastRun:'2020-01-01'}); db.set(key({pk:'NAV',sk:yesterday}), {pk:'NAV',sk:yesterday}); await assert.rejects(engine.handler({date:yesterday}),/NAV already exists/);
  fixture({date:yesterday,lastRun:'2020-01-01'}); xsDate=today; await assert.rejects(engine.handler({date:yesterday,dry:true}),/Historical XS cache date/);
  for (const date of ['2026-02-30','bad','9999-01-01']) await assert.rejects(engine.handler({date}),/Invalid or future/);
  console.log('PASS date rejection rules and historical cache guard');
})().catch(e => { console.error(e); process.exitCode=1; });
