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
      if (caller === 'lambda' && window.filter(x => x.caller === 'lambda').length >= Math.floor(cap*3/10)) return [0,1000];
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

test('saturated 14-day calendar splits persist across slices and cover all 180 days without repeating a window', async () => {
  const r = redisClock(), date = '2026-10-23', saved = [], paths = [], accepted = [];
  let stored = stateOf(), slices = 0;
  while (!stored.complete) {
    await runSlice({ state: structuredClone(stored), universe: ['IBM'], date, now: r.now,
      remainingMs: () => 900000, sleep: async ms => r.advance(ms), guard: guardAt(r),
      request: async path => {
        paths.push(path); r.advance(780000); // Exactly one endpoint per invocation.
        if (!path.startsWith('earnings-calendar')) return Response.json([]);
        const q = new URLSearchParams(path.split('?')[1]), from = q.get('from'), to = q.get('to');
        if (from === date && to === '2026-11-05') return Response.json(Array(4000).fill({}));
        accepted.push([from, to]);
        return Response.json(from === date ? [{ symbol: 'IBM', date: '2026-10-28', epsEstimated: 2 }] : []);
      }, checkpoint: async s => { stored = structuredClone(s); },
      save: async (ticker, _payload, cal, complete) => saved.push({ ticker, cal, complete }),
    });
    if (++slices === 1) assert.deepEqual(stored.calendarWindows, [{ from: 0, to: 6 }, { from: 7, to: 13 }]);
    assert.ok(slices < 30);
  }
  assert.equal(new Set(paths).size, paths.length);
  assert.equal(paths.length, 18); // 13 original windows + 2 split children + 3 ticker requests.
  const days = accepted.flatMap(([from, to]) => {
    const out = [];
    for (let at = Date.parse(from); at <= Date.parse(to); at += 86400000) out.push(at);
    return out;
  });
  assert.equal(days.length, 180); assert.equal(new Set(days).size, 180);
  assert.equal(Math.min(...days), Date.parse(date));
  assert.equal(Math.max(...days), Date.parse(date) + 179 * 86400000);
  assert.deepEqual(saved, [{ ticker: 'IBM', cal: { date: '2026-10-28', epsEstimated: 2 }, complete: true }]);
});

test('a persistently saturated single day advances, records failure and preserves published earnings in the real handler', async () => {
  const { createHandler } = require('../scripts/lambda-fmp/index.js');
  const r = redisClock(Date.parse('2026-10-23T10:15:00-04:00'));
  let stored, calls = 0;
  const records = [], windows = [];
  const handler = createHandler({ now: r.now, command: r.command, universe: ['IBM'], sleep: async ms => r.advance(ms),
    client: { send: async cmd => {
      if (cmd.constructor.name === 'GetCommand') return { Item: stored ? { state: structuredClone(stored) } : undefined };
      if (cmd.input.Item.pattern.startsWith('FMP:RUN:')) stored = structuredClone(cmd.input.Item.state);
      else records.push(cmd.input.Item);
      return {};
    } },
    request: async path => {
      calls++;
      assert.ok(!path.startsWith('analyst-estimates')); // Retained earnings need no unused forward request.
      if (path.startsWith('earnings-calendar')) {
        windows.push(path);
        const q = new URLSearchParams(path.split('?')[1]);
        return Response.json(q.get('from') === '2026-10-23' ? Array(4000).fill({}) : []);
      }
      return Response.json(path.startsWith('grades-consensus') ? [{ buy: 3 }] : [{ date: '2027-12-31', epsAvg: 9, revenueAvg: 200000000 }]);
    },
  });
  const result = JSON.parse((await handler({})).body);
  assert.equal(result.complete, true); assert.equal(result.failedCalendarWindows, 1);
  assert.deepEqual(stored.calendarFailures, [{ from: 0, to: 0, reason: 'calendar_truncated' }]);
  assert.equal(new Set(windows).size, windows.length);
  assert.equal(calls, windows.length + 2);
  assert.deepEqual(records.map(x => x.pattern), ['ANALYST:IBM']); // No partial EARNINGS overwrite.
  const previous = calls;
  await handler({}); assert.equal(calls, previous);
});

for (const failureAt of [0, 1, 2]) test(`persistent ticker 404 at endpoint ${failureAt} is checkpointed and never blocks later tickers`, async () => {
  const r = redisClock(), paths = [], saved = [];
  let stored = stateOf(), slices = 0;
  stored.calendarOffset = 180;
  while (!stored.complete) {
    const previousCursor = stored.cursor;
    await runSlice({ state: structuredClone(stored), universe: ['BAD', 'IBM'], date: '2026-10-23', now: r.now,
      remainingMs: () => 900000, sleep: async ms => r.advance(ms), guard: guardAt(r),
      request: async path => {
        paths.push(path); r.advance(780000);
        return path.includes('symbol=BAD') && path.startsWith(['grades-consensus?', 'price-target-consensus?', 'analyst-estimates?'][failureAt])
          ? new Response('private-body-marker', { status: 404 }) : Response.json([]);
      }, checkpoint: async s => { stored = structuredClone(s); }, save: async ticker => saved.push(ticker),
    });
    if (previousCursor === 0 && stored.cursor === 1) assert.equal(stored.partial.length, 0);
    assert.ok(++slices < 10);
  }
  // Grade/target failure keeps BAD's published record; a forward-only failure still saves its grades/targets.
  assert.deepEqual(saved, failureAt === 2 ? ['BAD', 'IBM'] : ['IBM']); assert.equal(stored.cursor, 2);
  assert.equal(paths.length, failureAt + 4);
  assert.equal(stored.failures.BAD.status, 404);
  assert.equal(stored.failures.BAD.reason, 'http_unavailable');
  assert.ok(!JSON.stringify(stored).includes('private-body-marker'));
});

for (const mode of ['transport', 'payload', 'json']) test(`ticker ${mode} failure skips partial work and collects the next ticker`, async () => {
  const r = redisClock(), state = stateOf(), saved = [];
  state.calendarOffset = 180; state.partial = [[]];
  const result = await runSlice({ state, universe: ['BAD', 'IBM'], date: '2026-10-23', now: r.now,
    remainingMs: () => 900000, sleep: async ms => r.advance(ms), guard: guardAt(r),
    request: async path => {
      if (!path.includes('symbol=BAD')) return Response.json([]);
      if (mode === 'transport') throw Error('private-transport-marker');
      return mode === 'payload' ? Response.json({ error: 'private-body-marker' }) : new Response('{');
    }, checkpoint: async () => {}, save: async ticker => saved.push(ticker),
  });
  assert.equal(result.complete, true); assert.equal(result.failedTickers, 1);
  assert.deepEqual(saved, ['IBM']); assert.equal(state.partial.length, 0);
  assert.ok(!JSON.stringify(state).includes('private-'));
});

test('account-wide 402 retains ticker partial work and resumes the same endpoint later', async () => {
  const r = redisClock(), state = stateOf(), paths = [];
  state.calendarOffset = 180; state.partial = [[]];
  let denied = true;
  const run = () => runSlice({ state, universe: ['IBM'], date: '2026-10-23', now: r.now,
    remainingMs: () => 900000, sleep: async ms => r.advance(ms), guard: guardAt(r),
    request: async path => { paths.push(path); return denied ? new Response('Bandwidth limit reached', { status: 402 }) : Response.json([]); },
    checkpoint: async () => {}, save: async () => {},
  });
  assert.equal((await run()).reason, 'http_unavailable');
  assert.equal(state.cursor, 0); assert.equal(state.partial.length, 1); assert.equal(state.failures, undefined);
  denied = false; assert.equal((await run()).complete, true); assert.equal(paths[0], paths[1]);
});

const errorBody = loadTS('src/lib/fmp/errorBody.ts', {});
function swrWith(cache, writes, clock) {
  return loadTS('src/lib/cache/redisSWR.ts', {
    '@/services/redisClient': {
      getFromCache: async k => cache.get(k) ?? null,
      setInCache: async (k, v, ttl) => { cache.set(k, v); writes.push({ k, v, ttl }); },
    },
  }, clock);
}
function analystRoute(fetcher, now, { seedConsensus = true } = {}) {
  const cache = new Map(), writes = [];
  const clock = { Date: class extends Date { static now() { return now(); } } };
  const api = { fmpFetch: fetcher };
  const swr = swrWith(cache, writes, clock);
  const events = loadTS('src/services/analystEvents.ts', { '@/lib/fmpClient': api, '@/lib/fmp/errorBody': errorBody }, clock);
  const route = loadTS('src/app/api/live/analyst/route.ts', {
    '@/lib/fmpClient': api, '@/lib/fmp/errorBody': errorBody, '@/lib/cache/redisSWR': swr, '@/services/analystEvents': events,
    '@/lib/aws/unifiedCacheProvider': { getUnifiedCache: async () => null },
    'next/server': { NextResponse: { json: body => body } },
  }, { ...clock, console: { log() {}, warn() {}, error() {} } });
  if (seedConsensus) cache.set('swr:analyst:IBM', { data: { ticker: 'IBM', totalAnalysts: 4 }, timestamp: now() });
  return { cache, writes, get: () => route.GET({ nextUrl: { searchParams: new URLSearchParams('t=IBM') } }) };
}

test('real analyst API + SWR keeps stale 3/1 events on budget denial, then refreshes immediately after recovery', async () => {
  const r = redisClock(Date.parse('2026-10-23T15:00:00Z'));
  let calls = 0;
  const api = client(r, async url => {
    calls++;
    return Response.json(url.includes('/grades?') ? [{ date: '2026-10-22', action: 'upgrade', newGrade: 'Buy' }] : []);
  });
  const route = analystRoute(api.fmpFetch, r.now);
  const key = 'swr:analyst-events:v2:IBM';
  const prior = { data: { ticker: 'IBM', upgrades: 3, downgrades: 1 }, timestamp: r.now() - 6 * 3600000 - 1 };
  route.cache.set(key, prior);
  await guardAt(r).observe(new Response('', { status: 429, headers: { 'Retry-After': '120' } }), 'lambda');
  assert.deepEqual((await route.get()).events, prior.data); assert.equal(calls, 0);
  assert.equal(route.cache.get(key), prior); assert.equal(route.writes.length, 0);
  r.advance(120000);
  const fresh = await route.get();
  assert.equal(fresh.events.upgrades, 1); assert.equal(fresh.events.downgrades, 0); assert.equal(calls, 5);
  assert.equal(route.writes.length, 1); assert.equal(route.writes[0].ttl, 12 * 3600);
  await route.get(); assert.equal(calls, 5);
});

for (const mode of ['denied', 'partial', 'http', 'payload', 'transport']) test(`analyst cache miss with ${mode} response does not cache fabricated zero events`, async () => {
  let recovered = false, calls = 0;
  const route = analystRoute(async url => {
    calls++;
    if (!recovered && (mode !== 'partial' || url.includes('/grades?'))) {
      if (mode === 'transport') throw Error('private-transport-marker');
      if (mode === 'denied' || mode === 'partial') return null;
      if (mode === 'http') return new Response('', { status: 404 });
      return Response.json({ error: 'private-body-marker' });
    }
    return Response.json([]);
  }, Date.now);
  assert.equal((await route.get()).events, null); assert.equal(route.writes.length, 0);
  assert.equal(route.cache.has('swr:analyst-events:v2:IBM'), false);
  recovered = true;
  const fresh = await route.get();
  assert.equal(fresh.events.upgrades, 0); assert.equal(fresh.events.downgrades, 0);
  assert.equal(route.writes.length, 1); assert.equal(calls, 10);
  await route.get(); assert.equal(calls, 10); // Real, successful empty arrays remain cacheable.
});

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
  const handler=createHandler({client,command:r.command,now:r.now,universe:['IBM'],sleep:async ms=>r.advance(ms),request:async path=>{
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
    },{Date:class extends Date{static now(){return r.now();}},process:{env:{FMP_API_KEY:'offline',ENABLE_FMP_SESSION_VWAP:'1'}}});
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

// ── r3: every budget path keeps the last good value (gate 10240448) ────────────
const consensusRow = [{ strongBuy: 3, buy: 4, hold: 2, sell: 1, strongSell: 0, consensus: 'BUY' }];
for (const mode of ['denied', '429', '402', 'timeout', 'unreadable', 'error-body']) test(`analyst target ${mode} keeps the previous 250 target; recovery refreshes it`, async () => {
  let now = Date.parse('2026-10-26T15:00:00Z'), broken = true, calls = 0;
  const route = analystRoute(async url => {
    calls++;
    if (url.includes('/analyst-events') || !/grades-consensus|price-target-consensus/.test(url)) return Response.json([]);
    if (url.includes('grades-consensus')) return Response.json(consensusRow);
    if (!broken) return Response.json([{ targetHigh: 300, targetLow: 200, targetConsensus: 260 }]);
    if (mode === 'denied') return null;
    if (mode === 'timeout') throw Object.assign(Error('FMP_REQUEST_UNAVAILABLE'), { name: 'TimeoutError' });
    if (mode === 'unreadable') return new Response('{');
    if (mode === 'error-body') return Response.json({ 'Error Message': 'Limit Reach' });
    return new Response('', { status: Number(mode) });
  }, () => now, { seedConsensus: false });
  const prior = { data: { ticker: 'IBM', consensus: 'BUY', totalAnalysts: 10, priceTarget: { targetHigh: 300, targetLow: 200, targetConsensus: 250 } }, timestamp: now - 3600000 - 1 };
  route.cache.set('swr:analyst:IBM', prior);
  const stale = await route.get();
  assert.equal(stale.priceTarget.targetConsensus, 250);
  assert.equal(route.cache.get('swr:analyst:IBM'), prior);
  assert.equal(route.writes.filter(w => w.k === 'swr:analyst:IBM').length, 0);
  broken = false;
  const fresh = await route.get();
  assert.equal(fresh.priceTarget.targetConsensus, 260);
  assert.equal(route.cache.get('swr:analyst:IBM').data.priceTarget.targetConsensus, 260);
});

test('analyst cache miss with a failed target serves consensus once but writes nothing; real empty target is cacheable', async () => {
  let deny = true;
  const route = analystRoute(async url => {
    if (url.includes('grades-consensus')) return Response.json(consensusRow);
    if (url.includes('price-target-consensus')) return deny ? null : Response.json([]);
    return Response.json([]);
  }, Date.now, { seedConsensus: false });
  const first = await route.get();
  assert.equal(first.totalAnalysts, 10); assert.equal(first.priceTarget, null);
  assert.equal(route.cache.has('swr:analyst:IBM'), false);
  deny = false;
  await route.get();
  assert.equal(route.cache.get('swr:analyst:IBM').data.priceTarget, null); // Provider said «no target»: a real value.
});

test('analyst unreadable or error-shaped consensus is a failure: stale value kept, nothing written', async () => {
  for (const body of [() => new Response('{'), () => Response.json({ 'Error Message': 'Limit Reach' })]) {
    let now = Date.parse('2026-10-26T15:00:00Z');
    const route = analystRoute(async url => (url.includes('grades-consensus') ? body() : Response.json([])), () => now, { seedConsensus: false });
    const prior = { data: { ticker: 'IBM', consensus: 'BUY', totalAnalysts: 10, priceTarget: null }, timestamp: now - 3600000 - 1 };
    route.cache.set('swr:analyst:IBM', prior);
    assert.equal((await route.get()).totalAnalysts, 10);
    assert.equal(route.cache.get('swr:analyst:IBM'), prior);
  }
});

function earningsRoute(fmpFetch, now) {
  const cache = new Map(), writes = [];
  const clock = { Date: class extends Date { static now() { return now(); } } };
  const swr = swrWith(cache, writes, clock);
  const marketCalendar = loadTS('src/lib/marketCalendar.ts', {}, clock);
  const earningsDate = loadTS('src/lib/earningsDate.ts', { './marketCalendar': marketCalendar, './earningsDateStatus': loadTS('src/lib/earningsDateStatus.ts', {}) }, clock);
  const route = loadTS('src/app/api/live/earnings/route.ts', {
    '@/lib/fmpClient': { fmpFetch }, '@/lib/fmp/errorBody': errorBody, '@/lib/cache/redisSWR': swr,
    '@/services/finnhubClient': { getEarningsCalendar: async () => [{ symbol: 'IBM', date: '2026-10-28', hour: 'amc', epsEstimate: 2 }] },
    '@/lib/marketCalendar': marketCalendar, '@/lib/earningsDate': earningsDate,
    '@/services/earningsCalendarService': { earningsCalendarRowsFor: async () => ({ rows: [], status: 'hit' }) },
    'next/server': { NextResponse: { json: body => body } },
  }, { ...clock, URL, console: { log() {}, warn() {}, error() {} } });
  return { cache, writes, get: () => route.GET({ url: 'https://offline.invalid/api/live/earnings?t=IBM' }) };
}

for (const mode of ['denied', '429', '402', 'timeout', 'unreadable', 'error-body']) test(`earnings forward ${mode} keeps the previous forward EPS 8; recovery refreshes it`, async () => {
  let now = Date.parse('2026-10-26T15:00:00Z'), broken = true;
  const route = earningsRoute(async () => {
    if (!broken) return Response.json([{ date: '2027-12-31', epsAvg: 9, revenueAvg: 200000000 }]);
    if (mode === 'denied') return null;
    if (mode === 'timeout') throw Object.assign(Error('FMP_REQUEST_UNAVAILABLE'), { name: 'TimeoutError' });
    if (mode === 'unreadable') return new Response('{');
    if (mode === 'error-body') return Response.json({ 'Error Message': 'Limit Reach' });
    return new Response('', { status: Number(mode) });
  }, () => now);
  const prior = { data: { ticker: 'IBM', forwardEps: 8, forwardRevenue: 190000000, forwardYear: '2027', events: [{ date: '2026-10-28', hour: 'amc' }] }, timestamp: now - 3600000 - 1 };
  route.cache.set('swr:earnings:IBM', prior);
  const stale = await route.get();
  assert.equal(stale.forwardEps, 8); assert.equal(stale.forwardRevenue, 190000000); assert.equal(stale.forwardYear, '2027');
  assert.equal(route.cache.get('swr:earnings:IBM'), prior); assert.equal(route.writes.length, 0);
  broken = false;
  const fresh = await route.get();
  assert.equal(fresh.forwardEps, 9); assert.equal(route.cache.get('swr:earnings:IBM').data.forwardEps, 9);
});

test('earnings cache miss with denied forward serves Finnhub date once and writes nothing', async () => {
  const route = earningsRoute(async () => null, () => Date.parse('2026-10-26T15:00:00Z'));
  const r = await route.get();
  assert.equal(r.nextEarningsDate, '2026-10-28'); assert.equal(r.forwardEps, null);
  assert.equal(route.cache.size, 0);
});

test('lambda lane: collector capped at 30/min while web readers keep budget; total stays <=100', async () => {
  const r = redisClock(Date.parse('2026-10-26T10:15:00-04:00'));
  const g = guardAt(r);
  let lambda = 0, web = 0;
  for (let sec = 0; sec < 600; sec++) {
    for (let k = 0; k < 5; k++) if ((await g.reserve('lambda')).allowed) lambda++;
    if (sec % 3 !== 2 && (await g.reserve(sec % 2 ? 'news' : 'analyst')).allowed) web++;
    r.advance(1000);
  }
  assert.ok(lambda <= 30 * 10 + 30, `lambda ${lambda}`);
  assert.equal(web, 400); // 40 web requests/min (the non-VWAP share left beside a saturated collector) are never starved.
  for (const call of r.admitted) {
    const win = r.admitted.filter(x => x.at > call.at - 60000 && x.at <= call.at);
    assert.ok(win.length <= 100); assert.ok(win.filter(x => x.caller === 'lambda').length <= 30);
  }
  assert.ok(core.RESERVE.includes("ARGV[1] == 'lambda'") && core.RESERVE.includes('KEYS[6]'));
});

test('runner paces provider requests >= 2 s apart and a slice stays under 900 s', async () => {
  const r = redisClock(Date.parse('2026-10-26T10:15:00-04:00')), starts = [];
  const state = stateOf(); state.calendarOffset = 180;
  const result = await runSlice({ state, universe: Array.from({ length: 400 }, (_, i) => 'T' + i), date: '2026-10-26', now: r.now,
    remainingMs: () => 900000, sleep: async ms => r.advance(ms), guard: guardAt(r),
    request: async () => { starts.push(r.now()); r.advance(100); return Response.json([]); },
    checkpoint: async () => {}, save: async () => {},
  });
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 2000);
  assert.ok(result.durationMs < 900000); assert.equal(result.reason, 'deadline');
  assert.ok(starts.length >= 380 && starts.length <= 391, String(starts.length));
});

test('transport decodes UTF-8 split across chunks (no U+FFFD)', async () => {
  const transport = { get(_url, _opts, onResponse) {
    const req = new EventEmitter(); req.destroy = () => {};
    setImmediate(() => {
      const res = new EventEmitter(); res.statusCode = 200; res.headers = {};
      onResponse(res);
      const bytes = Buffer.from(JSON.stringify([{ name: '한국 Société' }]));
      const cut = bytes.indexOf(Buffer.from('국')) + 1;
      res.emit('data', bytes.subarray(0, cut)); res.emit('data', bytes.subarray(cut)); res.emit('end');
    });
    return req;
  } };
  const out = await httpsGet('https://offline.invalid', 1000, transport);
  assert.equal(JSON.parse(out.body)[0].name, '한국 Société');
});

// ── gate 10241641: forward-only failures never pin the cursor nor drop ANALYST ──
for (const mode of ['402-plan', '404', 'transport']) test(`forward-only ${mode}: ANALYST saved, stored forward carried, next ticker collected`, async () => {
  const { createHandler } = require('../scripts/lambda-fmp/index.js');
  const r = redisClock(Date.parse('2026-10-26T10:15:00-04:00'));
  let stored; const records = [];
  const old = { pattern: 'EARNINGS:BAD', forwardEps: 8, forwardRevenue: 190000000, forwardYear: '2027', nextDate: '2026-10-20' };
  const client = { send: async cmd => {
    const n = cmd.constructor.name, i = cmd.input;
    if (n === 'GetCommand') return { Item: stored ? { state: structuredClone(stored) } : undefined };
    if (n === 'QueryCommand') return { Items: i.ExpressionAttributeValues[':p'] === 'EARNINGS:BAD' ? [old] : [] };
    if (i.Item.pattern.startsWith('FMP:RUN:')) stored = structuredClone(i.Item.state); else records.push(i.Item);
    return {};
  } };
  const handler = createHandler({ client, command: r.command, now: r.now, universe: ['BAD', 'IBM'], sleep: async ms => r.advance(ms), request: async path => {
    if (path.startsWith('earnings-calendar')) return Response.json(new URLSearchParams(path.split('?')[1]).get('from') === '2026-10-26' ? [{ symbol: 'BAD', date: '2026-10-29', epsEstimated: 1 }, { symbol: 'IBM', date: '2026-10-28', epsEstimated: 2 }] : []);
    if (path.startsWith('analyst-estimates') && path.includes('BAD')) {
      if (mode === 'transport') throw Error('private-transport-marker');
      return new Response('Premium subscription required private-body-marker', { status: mode === '402-plan' ? 402 : 404 });
    }
    if (path.startsWith('grades-consensus')) return Response.json([{ strongBuy: 1, buy: 2, hold: 1, consensus: 'BUY' }]);
    if (path.startsWith('price-target-consensus')) return Response.json([{ targetHigh: 30, targetLow: 10, targetConsensus: 20 }]);
    return Response.json([{ date: '2027-12-31', epsAvg: 9, revenueAvg: 200000000 }]);
  } });
  const out = JSON.parse((await handler({})).body);
  assert.equal(out.complete, true); assert.equal(stored.cursor, 2);
  const bad = records.filter(x => x.pattern.endsWith(':BAD'));
  assert.equal(bad.find(x => x.pattern === 'ANALYST:BAD').priceTarget.targetConsensus, 20);
  const earn = bad.find(x => x.pattern === 'EARNINGS:BAD');
  assert.equal(earn.forwardEps, 8); assert.equal(earn.forwardRevenue, 190000000); assert.equal(earn.nextDate, '2026-10-29');
  assert.ok(records.some(x => x.pattern === 'ANALYST:IBM')); assert.equal(records.find(x => x.pattern === 'EARNINGS:IBM').forwardEps, 9);
  assert.ok(!JSON.stringify(stored).includes('private-'));
});

test('forward-only failure without a stored record writes no null forward fields', async () => {
  const r = redisClock(), state = stateOf(); state.calendarOffset = 180;
  const { FORWARD_FAILED } = require('../scripts/lambda-fmp/runner.cjs');
  const saved = [];
  await runSlice({ state, universe: ['BAD'], date: '2026-10-26', now: r.now, remainingMs: () => 900000, sleep: async ms => r.advance(ms), guard: guardAt(r),
    request: async path => path.startsWith('analyst-estimates') ? new Response('', { status: 404 }) : Response.json([]),
    checkpoint: async () => {}, save: async (t, payload) => saved.push(payload) });
  assert.deepEqual(saved[0][2], FORWARD_FAILED);
  const { createHandler } = require('../scripts/lambda-fmp/index.js');
  assert.equal(typeof createHandler, 'function');
});

test('account-wide 402/429 on one endpoint stalls at most 3 slices, then that ticker is skipped and collection advances', async () => {
  const r = redisClock(), paths = [], saved = [];
  let stored = stateOf(); stored.calendarOffset = 180;
  for (let slice = 0; slice < 6 && !stored.complete; slice++) {
    await runSlice({ state: structuredClone(stored), universe: ['BAD', 'IBM'], date: '2026-10-26', now: r.now, remainingMs: () => 900000, sleep: async ms => r.advance(ms), guard: guardAt(r),
      request: async path => { paths.push(path); return path.includes('BAD') && path.startsWith('grades') ? new Response('daily limit exceeded', { status: 402 }) : Response.json([]); },
      checkpoint: async s => { stored = structuredClone(s); }, save: async t => saved.push(t) });
    r.advance(900000);
  }
  assert.equal(stored.complete, true); assert.deepEqual(saved, ['IBM']);
  assert.equal(paths.filter(p => p.includes('BAD')).length, 3);
});

test('persistent calendar failure stalls at most 3 slices, then the window is recorded and EARNINGS is withheld', async () => {
  const r = redisClock(), saved = [];
  let stored = stateOf();
  for (let slice = 0; slice < 40 && !stored.complete; slice++) {
    await runSlice({ state: structuredClone(stored), universe: ['IBM'], date: '2026-10-26', now: r.now, remainingMs: () => 900000, sleep: async ms => r.advance(ms), guard: guardAt(r),
      request: async path => (path.startsWith('earnings-calendar') && path.includes('from=2026-10-26') ? new Response('', { status: 503 }) : Response.json([])),
      checkpoint: async s => { stored = structuredClone(s); }, save: async (t, _p, _c, complete) => saved.push({ t, complete }) });
    r.advance(900000);
  }
  assert.equal(stored.complete, true);
  assert.deepEqual(stored.calendarFailures, [{ from: 0, to: 13, reason: 'calendar_unavailable' }]);
  assert.deepEqual(saved, [{ t: 'IBM', complete: false }]);
});
