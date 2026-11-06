// Isolated DynamoDB/Redis fixtures: no network or real writes.
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
class Command { constructor(input) { this.input = input; } }
class GetCommand extends Command {} class BatchGetCommand extends Command {} class BatchWriteCommand extends Command {} class ScanCommand extends Command {} class TransactWriteCommand extends Command {}
let db, requests, xsDate, alphaMissing, xsMissing, failBatch;
const today = new Date().toISOString().slice(0, 10);
const past = '2026-11-05';
const key = x => JSON.stringify([x.pk, x.sk]);
const client = { async send(cmd) {
  if (cmd instanceof GetCommand) return { Item: structuredClone(db.get(key(cmd.input.Key))) };
  if (cmd instanceof ScanCommand) return { Items: xsMissing ? [] : [{ ticker:'AAA', date:cmd.input.ExpressionAttributeValues[':date'], close:10, mcap:2e10, xsScore:95 }] };
  if (cmd instanceof BatchGetCommand) {
    const [table, request] = Object.entries(cmd.input.RequestItems)[0];
    return { Responses: { [table]: request.Keys.map(({ ticker, date }) => table === 'signum-xs-history'
      ? { ticker, date, close:10, mcap:2e10, xsScore:95 }
      : alphaMissing ? null : { ticker, date, open:10, close:10, changePct:1 }).filter(Boolean) } };
  }
  if (cmd instanceof BatchWriteCommand) {
    const items = cmd.input.RequestItems['signum-trade-journal'].map(x => x.PutRequest.Item);
    const keys = items.map(key); if (new Set(keys).size !== keys.length) throw new Error('duplicate keys');
    requests.push(items);
    if (failBatch && requests.length === 2) { failBatch = false; throw new Error('injected second batch failure'); }
    for (const item of items) db.set(key(item), structuredClone(item)); return {};
  }
  if (cmd instanceof TransactWriteCommand) {
    const items = cmd.input.TransactItems.map(x => x.Put.Item);
    assert.equal(new Set(items.map(key)).size, items.length);
    requests.push(items); for (const item of items) db.set(key(item), structuredClone(item)); return {};
  }
  throw Error('unexpected command');
} };
Module._load = function(id, parent, main) {
  if (id === '@aws-sdk/client-dynamodb') return { DynamoDBClient: class {} };
  if (id === '@aws-sdk/lib-dynamodb') return { DynamoDBDocumentClient: { from: () => client }, GetCommand, BatchGetCommand, BatchWriteCommand, ScanCommand, TransactWriteCommand };
  return originalLoad.call(this, id, parent, main);
};
process.env.UPSTASH_REDIS_REST_URL = 'https://fixture.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = '';
delete process.env.INTRINIO_API_KEY;
global.fetch = async (url, options) => ({ json: async () => ({ result: options?.method === 'POST' ? null : url.endsWith('/cache:xs:scores') ? { date:xsDate, scores:{ AAA:95 } } : null }) });
const engine = require('../lambda-xs-paper/index.js');
function isoWeek(d) { const dt=new Date(d+'T00:00:00Z'); const day=(dt.getUTCDay()+6)%7; dt.setUTCDate(dt.getUTCDate()-day+3); const wk1=new Date(Date.UTC(dt.getUTCFullYear(),0,4)); return dt.getUTCFullYear()+'-W'+String(1+Math.round(((dt-wk1)/86400000-3+((wk1.getUTCDay()+6)%7))/7)).padStart(2,'0'); }
function fixture({ count=3, kill=true, date=past } = {}) {
  db = new Map(); requests = []; xsDate = today; alphaMissing = false; xsMissing = false; failBatch = false;
  const state = { pk:'STATE', sk:'_CURRENT_', cash:0, halted:false, weekId:isoWeek(date), weekStartNav:kill ? 10000 : count*10, lastRun:'2026-11-04' };
  const pos = { pk:'POS', sk:'_OPEN_', list:Array.from({length:count}, (_,n) => ({ t:'AAA', qty:1, entryPx:20, entryDate:`2026-01-${String(n%28+1).padStart(2,'0')}`, tradingDaysHeld:kill ? 0 : 2 })) };
  for (const item of [state,pos]) db.set(key(item), structuredClone(item));
}
const trades = () => [...db.values()].filter(x => x.pk === 'TRADE');
(async () => {
  fixture(); await engine.handler({date:past}); assert.equal(trades().length,3); assert.equal(new Set(trades().map(key)).size,3); assert.ok(trades().every(x=>x.kill)); console.log('PASS 11/5 kill, three tranches, unique keys, historical XS with newer cache');
  fixture({kill:false}); await engine.handler({date:past}); assert.equal(trades().length,3); assert.ok(trades().every(x=>!x.kill)); console.log('PASS normal exits');
  fixture({count:30}); failBatch = true; await assert.rejects(engine.handler({date:past}), /injected second batch/); assert.equal(trades().length,25); assert.equal(db.get(key({pk:'STATE',sk:'_CURRENT_'})).lastRun,'2026-11-04'); assert.equal(db.get(key({pk:'POS',sk:'_OPEN_'})).list.length,30); assert.equal(db.has(key({pk:'NAV',sk:past})),false);
  await engine.handler({date:past}); assert.equal(trades().length,30); assert.equal(db.get(key({pk:'STATE',sk:'_CURRENT_'})).lastRun,past); assert.equal(db.get(key({pk:'POS',sk:'_OPEN_'})).list.length,0); assert.ok(db.has(key({pk:'NAV',sk:past}))); console.log('PASS partial failure and idempotent retry');
  fixture(); alphaMissing=true; await assert.rejects(engine.handler({date:past}), /Historical alpha-history incomplete/); assert.equal(requests.length,0); assert.equal(db.has(key({pk:'NAV',sk:past})),false); console.log('PASS missing historical prices reject without NAV');
  fixture(); xsMissing=true; await assert.rejects(engine.handler({date:past}), /No XS history rows/); assert.equal(requests.length,0); console.log('PASS missing XS history rejects');
  fixture(); await engine.handler({date:past,dry:true}); assert.equal(requests.length,0); assert.equal(db.has(key({pk:'NAV',sk:past})),false); console.log('PASS dry run without writes');
  fixture(); db.set(key({pk:'NAV',sk:past}), {pk:'NAV',sk:past}); await assert.rejects(engine.handler({date:past}), /NAV already exists/);
  for (const date of ['2026-02-30','bad','9999-01-01']) await assert.rejects(engine.handler({date}),/Invalid or future/);
  console.log('PASS invalid dates and existing NAV reject');
})().catch(e => { console.error(e); process.exitCode=1; });
