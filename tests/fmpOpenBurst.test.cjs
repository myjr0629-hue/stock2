// Offline contract tests: synthetic clock + Redis command model, no provider/account access.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { EventEmitter } = require('node:events');
const core = require('../src/lib/fmp/accountGuard.cjs');
const { runSlice, marketDate } = require('../scripts/lambda-fmp/runner.cjs');
const { httpsGet } = require('../scripts/lambda-fmp/transport.cjs');

function redisClock(start = 0) {
  let now = start, cap = 100, until = 0;
  const admitted = [], values = new Map();
  const command = async cmd => {
    if (cmd[0] === 'EVAL' && cmd[1] === core.RESERVE) {
      const caller = cmd.at(-2); cap = Math.min(cap, Number(cmd.at(-1)));
      if (until > now) return [0, until-now];
      const window = admitted.filter(x => x.at > now-60000);
      if (window.length >= cap || (caller !== 'vwap' && window.filter(x => x.caller !== 'vwap').length >= cap-Math.min(30,cap))) return [0,1000];
      admitted.push({ at: now, caller }); return [1,0];
    }
    if (cmd[0] === 'EVAL' && cmd[1] === core.BACKOFF) { until = Math.max(until, now+Number(cmd.at(-2)), Number(cmd.at(-1))); return until; }
    if (cmd[0] === 'EVAL' && cmd[1] === core.RELEASE) { if (values.get(cmd[3]) === cmd[4]) values.delete(cmd[3]); return 1; }
    if (cmd[0] === 'SET') {
      if (cmd.includes('NX') && values.has(cmd[1])) return null;
      values.set(cmd[1],cmd[2]); return 'OK';
    }
    throw Error('Unexpected offline command');
  };
  return { command, now: () => now, advance: ms => { now += ms; }, admitted, values };
}
function guardAt(r, accountRpm) { return core.createGuard({ command: r.command, now: r.now, accountRpm }); }
function loadTS(file, mocks, extras = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: id => { assert.ok(id in mocks, 'unmocked import: '+id); return mocks[id]; },
    process: { env: { FMP_API_KEY: 'offline' } }, fetch: () => { throw Error('Network forbidden'); },
    Date, URLSearchParams, AbortSignal, setTimeout, clearTimeout, ...extras });
  return exports;
}
function client(r, provider) {
  return loadTS('src/lib/fmpClient.ts', { './fmp/accountGuard.cjs': { ...core, createRedisCommand: () => r.command } }, {
    fetch: provider,
  });
}
const stateOf = () => ({ cursor: 0, calendarOffset: 0, calendar: {}, partial: [], complete: false });

test('opening 15 minutes: concurrent warming/Lambda <=100 rolling calls/min; VWAP always gets its reserved 30', async () => {
  const r = redisClock(Date.parse('2026-10-23T09:30:00-04:00'));
  const workers = Array.from({ length: 8 }, () => guardAt(r));
  let vwapCalls = 0;
  const { createHandler } = require('../scripts/lambda-fmp/index.js');
  let lambdaCalls = 0;
  const handler = createHandler({ now: r.now, command: r.command, request: async () => { lambdaCalls++; return Response.json([]); } });
  for (let sec=0; sec<900; sec++) {
    await handler({ forceRun: true });
    await Promise.all(workers.map((w,i) => w.reserve(i%2 ? 'analyst' : 'earnings')));
    if (sec%2 === 0) assert.equal((await workers[0].reserve('vwap')).allowed, true), vwapCalls++;
    r.advance(1000);
  }
  assert.equal(lambdaCalls, 0); assert.equal(vwapCalls, 450);
  for (const call of r.admitted) assert.ok(r.admitted.filter(x => x.at > call.at-60000 && x.at <= call.at).length <= 100);
});

test('lower configured contract wins across workers; store failure sends no HTTP', async () => {
  const r = redisClock();
  await guardAt(r, 150).reserve('analyst');
  const defaultWorker = guardAt(r);
  for (let n=0;n<150;n++) await defaultWorker.reserve('analyst');
  assert.equal(r.admitted.length,20);
  for (let n=0;n<50;n++) await defaultWorker.reserve('vwap');
  assert.equal(r.admitted.length,50);
  const bad = core.createGuard({ command: async () => { throw Error('offline'); } });
  assert.equal((await bad.reserve('vwap')).allowed,false);
  let calls=0;
  const api = loadTS('src/lib/fmpClient.ts', { './fmp/accountGuard.cjs': { createGuard: () => bad, createRedisCommand: () => null } }, { fetch: async () => { calls++; } });
  assert.equal(await api.fmpFetch('offline','vwap'),null); assert.equal(calls,0);
});

test('429 Retry-After delta/date: independent Lambda/VWAP/analyst/earnings/news clients share monotonic cooldown', async () => {
  const start=Date.parse('2026-10-23T14:00:00Z'), r=redisClock(start);
  const a=guardAt(r), b=guardAt(r);
  await a.observe(new Response('',{status:429,headers:{'Retry-After':'120'}}),'lambda');
  await b.observe(new Response('',{status:429,headers:{'Retry-After':'1'}}),'analyst');
  let calls=0;
  const api=client(r,async()=>{ calls++; return Response.json([]); });
  for (const caller of ['vwap','analyst','earnings','news']) assert.equal(await api.fmpFetch('offline',caller),null);
  assert.equal(calls,0);
  r.advance(119999); assert.equal((await b.reserve('vwap')).allowed,false);
  r.advance(1); assert.equal((await b.reserve('vwap')).allowed,true);
  const date = new Date(r.now()+180000).toUTCString();
  await a.observe(new Response('',{status:429,headers:{'Retry-After':date}}),'earnings');
  r.advance(179999); assert.equal((await b.reserve('lambda')).allowed,false);
  r.advance(1); assert.equal((await b.reserve('lambda')).allowed,true);
  assert.deepEqual(core.retryAfter('malformed',start),{delayMs:60000,untilMs:0});
});

test('402 emits only allowlisted reason; raw URL/body never reaches diagnostic persistence', async () => {
  const r=redisClock(), g=guardAt(r);
  const examples = [ ['Bandwidth limit exceeded','bandwidth_limit'], ['Daily limit exceeded','daily_limit'],
    ['Upgrade subscription','plan_restricted'], ['Invalid API key','invalid_key'], ['unexpected','unknown'], ['{bad json','unknown'] ];
  for (const [message,reason] of examples) {
    const d=await g.observe(new Response(message+' private-body-marker https://invalid.example/path',{status:402}),'vwap');
    assert.equal(d.reason,reason);
    const persisted=r.values.get(`${core.PREFIX}:diag:vwap`);
    assert.ok(!persisted.includes('private-body-marker')); assert.ok(!persisted.includes('https:'));
  }
  const large=await g.observe(new Response('x'.repeat(9000)+'Upgrade subscription',{status:402}),'vwap');
  assert.equal(large.reason,'unknown');
});

test('transport timeout aborts the actual HTTPS request, including a hung body', async () => {
  for (const hangingBody of [false,true]) {
    let aborted=false, destroyed=false;
    const transport={get(_url,opts,onResponse) {
      const req=new EventEmitter(); req.destroy=()=>{destroyed=true;};
      opts.signal.addEventListener('abort',()=>{aborted=true; req.destroy(); req.emit('error',Error('aborted'));});
      if(hangingBody) { const response=new EventEmitter(); response.statusCode=200; response.headers={}; onResponse(response); response.emit('data','['); }
      return req;
    }};
    await assert.rejects(httpsGet('https://offline.invalid',5,transport),/FMP_TRANSPORT_ERROR/);
    assert.equal(aborted,true); assert.equal(destroyed,true);
  }
});

test('2,001 ticker continuation completes every symbol exactly once; each invocation <900 seconds even with slow IO', async () => {
  const r=redisClock(Date.parse('2026-10-23T10:15:00-04:00'));
  const universe=Array.from({length:2001},(_,i)=>'T'+i);
  let stored=stateOf(), calls=0;
  const saved=[], durations=[];
  while(!stored.complete) {
    const start=r.now();
    const result=await runSlice({ state:structuredClone(stored), universe, date:'2026-10-23', now:r.now,
      remainingMs:()=>900000-(r.now()-start), sleep:async ms=>r.advance(ms), guard:guardAt(r),
      request:async()=>{ calls++; r.advance(500); return Response.json([]); },
      checkpoint:async s=>{ stored=structuredClone(s); r.advance(250); },
      save:async t=>{ saved.push(t); r.advance(15000); },
    });
    assert.ok(result.durationMs<900000); durations.push(result.durationMs);
    assert.ok(durations.length<100); r.advance(Math.max(0,900000-(r.now()-start)));
  }
  assert.equal(calls,2001*3+13); assert.deepEqual(saved,universe);
  assert.ok(durations.length>1);
  console.log(JSON.stringify({sliceCount:durations.length,maxSliceMs:Math.max(...durations),symbols:saved.length,providerCalls:calls}));
});

test('429 after partial ticker persists cursor; resume skips already completed endpoints', async () => {
  const r=redisClock(), state=stateOf(); state.calendarOffset=182;
  let stored, first=true;
  const paths=[];
  const run=()=>runSlice({state:stored?structuredClone(stored):state,universe:['IBM'],date:'2026-10-23',now:r.now,
    remainingMs:()=>900000,sleep:async ms=>r.advance(ms),guard:guardAt(r),
    request:async path=>{ paths.push(path); if(first&&paths.length===2) return new Response('',{status:429,headers:{'Retry-After':'120'}}); return Response.json([]); },
    checkpoint:async s=>{stored=structuredClone(s);},save:async()=>{},
  });
  assert.equal((await run()).reason,'http_unavailable'); assert.equal(stored.partial.length,1); assert.equal(stored.cursor,0);
  first=false; r.advance(120000); assert.equal((await run()).complete,true);
  assert.equal(paths.filter(p=>p.startsWith('grades-consensus')).length,1);
  assert.equal(paths.filter(p=>p.startsWith('price-target-consensus')).length,2);
});

test('ET opening gate covers summer/winter DST, weekends, forceRun and UTC date rollover', () => {
  for(const offset of ['-04:00','-05:00']) {
    const day=offset==='-04:00'?'2026-10-23':'2026-12-18';
    for(const time of ['09:30:00','09:44:59','10:00:00','10:14:59']) assert.equal(marketDate(Date.parse(day+'T'+time+offset)).eligible,false);
    assert.equal(marketDate(Date.parse(day+'T10:15:00'+offset)).eligible,true);
  }
  assert.equal(marketDate(Date.parse('2026-10-24T10:15:00-04:00')).eligible,false);
  assert.equal(marketDate(Date.parse('2026-12-18T19:45:00-05:00')).date,'2026-12-18');
});

test('production web callers and deployment package use the shared guard; deploy cannot regenerate the stale burst loop', () => {
  const sources=['src/services/realtimeSessionVwap.ts','src/services/analystEvents.ts','src/services/earningsCalendarService.ts',
    'src/app/api/live/analyst/route.ts','src/app/api/live/earnings/route.ts','src/services/fmpNewsAdapter.ts'];
  for(const file of sources) { const s=fs.readFileSync(file,'utf8'); assert.ok(s.includes('fmpFetch('),file); assert.ok(!/await fetch\(/.test(s),file); }
  const deploy=fs.readFileSync('scripts/deploy-fmp.js','utf8');
  assert.ok(!deploy.includes('const handlerCode')); assert.ok(deploy.includes('cron(0/15 * * * ? *)'));
  assert.ok(deploy.includes('accountGuard.cjs')); assert.ok(deploy.includes('UPSTASH_REDIS_REST_URL'));
});

test('real handler writes the same consensus/earnings arithmetic; daily completion and lease suppress duplicate collection', async () => {
  const { createHandler } = require('../scripts/lambda-fmp/index.js');
  const r=redisClock(Date.parse('2026-10-23T10:15:00-04:00'));
  let persisted, calls=0;
  const records=[];
  const client={send:async cmd=>{
    const i=cmd.input;
    if(cmd.constructor.name==='GetCommand') return {Item:persisted?{state:structuredClone(persisted)}:undefined};
    if(cmd.constructor.name==='QueryCommand') return {Items:[{forwardEps:8,forwardRevenue:190000000}]};
    if(i.Item.pattern.startsWith('FMP:RUN:')) persisted=structuredClone(i.Item.state);
    else records.push(i.Item);
    return {};
  }};
  const handler=createHandler({client,command:r.command,now:r.now,universe:['IBM'],request:async path=>{
    calls++;
    if(path.startsWith('earnings-calendar')) return Response.json([{symbol:'IBM',date:'2026-10-28',epsEstimated:2}]);
    if(path.startsWith('grades-consensus')) return Response.json([{strongBuy:3,buy:4,hold:2,sell:1,strongSell:0,consensus:'BUY'}]);
    if(path.startsWith('price-target-consensus')) return Response.json([{targetHigh:300,targetLow:200,targetConsensus:250}]);
    return Response.json([{date:'2027-12-31',epsAvg:9,revenueAvg:200000000},{date:'2026-12-31',epsAvg:7,revenueAvg:180000000}]);
  }});
  const first=JSON.parse((await handler({})).body);
  assert.equal(first.complete,true); assert.equal(first.results.analyst,1); assert.equal(first.results.forward,1);
  const analyst=records.find(x=>x.pattern==='ANALYST:IBM'), earn=records.find(x=>x.pattern==='EARNINGS:IBM');
  assert.equal(analyst.totalAnalysts,10); assert.equal(analyst.bullishPct,70); assert.equal(analyst.priceTarget.targetConsensus,250);
  assert.equal(earn.forwardEps,9); assert.equal(earn.currentEps,7); assert.equal(earn.forwardEpsRevision,1);
  assert.equal(earn.forwardRevRevision,10000000); assert.equal(earn.nextDate,'2026-10-28'); assert.equal(earn.daysUntil,5);
  const previousCalls=calls;
  await handler({}); assert.equal(calls,previousCalls);
  r.values.set('fmp:lambda:lease:v2','another-worker');
  assert.equal(JSON.parse((await handler({})).body).skipped,'lease_unavailable'); assert.equal(calls,previousCalls);
});

test('transport errors are sanitized; credential-bearing errors never escape fmpFetch', async () => {
  const r=redisClock();
  const api=client(r,async()=>{ throw new Error('private-network-detail-marker'); });
  await assert.rejects(api.fmpFetch('offline','vwap'),error=>error.message==='FMP_REQUEST_UNAVAILABLE'&&!JSON.stringify(error).includes('private-network-detail-marker'));
});

test('Redis REST has an abort deadline; missing authority fails closed without network', async () => {
  let calls=0;
  const missing=core.createRedisCommand({},async()=>{calls++;});
  await assert.rejects(missing(['GET','offline']),/FMP_STORE_UNAVAILABLE/); assert.equal(calls,0);
  let signal;
  const command=core.createRedisCommand({ KV_REST_API_URL:'https://offline.invalid',KV_REST_API_TOKEN:'offline' }, async(_url,init)=>{
    calls++; signal=init.signal;
    return Response.json({result:[1,0]});
  });
  assert.deepEqual(await command(['EVAL','offline']),[1,0]); assert.ok(signal instanceof AbortSignal);
  const bad=core.createRedisCommand({ UPSTASH_REDIS_REST_URL:'https://offline.invalid',UPSTASH_REDIS_REST_TOKEN:'offline' },async()=>{throw Error('private-transport-marker');});
  await assert.rejects(bad(['GET','offline']),e=>e.message==='FMP_STORE_UNAVAILABLE');
});

test('real VWAP service respects another worker cooldown and exposes only the 402 reason enum', async () => {
  const now=Date.parse('2026-10-23T09:35:00-04:00'), r=redisClock(now);
  let calls=0;
  const api=client(r,async()=>{calls++;return new Response('Premium subscription required private-body-marker',{status:402});});
  const service=()=>{
    const cache=new Map();
    return loadTS('src/services/realtimeSessionVwap.ts', {
      '@/lib/fmpClient':api,
      '@/lib/fmpTime':loadTS('src/lib/fmpTime.ts',{}),
      '@/lib/marketCalendar':loadTS('src/lib/marketCalendar.ts',{}),
      '@/lib/vwap':loadTS('src/lib/vwap.ts',{}),
      '@/lib/intrinioMeter':{upstashMeterStore:{setNxEx:async()=>true}},
      '@/lib/intrinioBackground':{bgStore:{getStore:()=>undefined}},
      './redisClient':{getFromCache:async k=>cache.get(k)??null,setInCache:async(k,v)=>{cache.set(k,v);return true;}},
    },{Date:class extends Date{static now(){return r.now();}}});
  };
  await guardAt(r).observe(new Response('',{status:429,headers:{'Retry-After':'120'}}),'lambda');
  const blocked=service();
  assert.equal(await blocked.getRealtimeSessionVwap('IBM','2026-10-23',r.now()),null); assert.equal(calls,0);
  const denied=await blocked.readRealtimeSessionVwapDiagnostics('IBM','2026-10-23',r.now());
  assert.equal(denied.observation.httpAttempted,false);
  r.advance(120000);
  const available=service();
  await available.getRealtimeSessionVwap('IBM','2026-10-23',r.now()); assert.equal(calls,1);
  const d=await available.readRealtimeSessionVwapDiagnostics('IBM','2026-10-23',r.now());
  assert.equal(d.observation.httpStatus,402); assert.equal(d.observation.reason,'plan_restricted');
  assert.ok(!JSON.stringify(d).includes('private-body-marker'));
});
