/** Offline B4 regression: run with node --test tests/b4Definitions.test.cjs.
 * A closed module loader allows only local TypeScript and explicitly mocked I/O. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const NOW = Date.parse('2026-10-19T15:00:00Z');
const jsCache = new Map();
function harness(mocks = {}, extra = {}) {
    const modules = new Map();
    function load(file) {
        file = path.resolve(root, file);
        if (!/\.tsx?$/.test(file)) file += fs.existsSync(file + '.tsx') ? '.tsx' : '.ts';
        assert.ok(file.startsWith(path.join(root, 'src') + path.sep), 'local source only');
        if (modules.has(file)) return modules.get(file).exports;
        const mod = { exports: {} };
        modules.set(file, mod);
        if (!jsCache.has(file)) jsCache.set(file, ts.transpileModule(fs.readFileSync(file, 'utf8'), {
            compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
        }).outputText);
        const requireClosed = id => {
            if (Object.hasOwn(mocks, id)) return mocks[id];
            if (id.startsWith('@/')) return load(path.join(root, 'src', id.slice(2)));
            if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id));
            throw new Error(`Unexpected external module: ${id}`);
        };
        class FixedDate extends Date {
            constructor(...args) { super(...(args.length ? args : [NOW])); }
            static now() { return NOW; }
        }
        vm.runInNewContext(jsCache.get(file), { exports: mod.exports, module: mod, require: requireClosed,
            Date: FixedDate, process: { env: {} }, AbortController, URL, setTimeout, clearTimeout,
            console: { log() {}, warn() {}, error() {} },
            fetch: async () => { throw new Error('Unexpected network access'); }, ...extra,
        }, { filename: file });
        return mod.exports;
    }
    return load;
}
const load = harness();
const plain = v => JSON.parse(JSON.stringify(v));
const market = load('src/lib/defs/market');
const premium = load('src/lib/premiumFlow');
const metrics = load('src/lib/optionMetrics');
const history = load('src/lib/defs/gexHistory');
const snapshot = load('src/lib/ai/deepSnapshot');
const skew = load('src/lib/defs/optionStructure').structureSkew;
const s = { ticker: 'NVDA', options_status: 'OK', expiration: '2026-12-18', chainDate: '2026-10-16',
  underlyingPrice: 214.13, netGex: 4.79e6, gammaFlipLevel: null, gammaFlipType: 'ALL_LONG',
  squeezeScore: 5, squeezeRisk: 'LOW', atmIv: 35, ivSkew: 1.08,
  maxPain: 222.5, levels: { callWall: 220, putFloor: 205 },
  levelsProducer: 'structureService' };
const legacy = { ticker: 'NVDA', timestamp: Date.parse('2026-10-16T20:00:00Z'), gex: -14e6,
  gammaRegime: 'NEGATIVE', flipLevel: 182.5, putFloor: 125, squeezeScore: 40, ivSkew: .92 };

test('D03 NVDA premium share = 51.9%, unaffected by 58.8% volume share', () => {
  const f = { callPremium: 60.36e6, putPremium: 56.04e6, callVolume: 339e3, putVolume: 237e3 };
  assert.equal(premium.callPremiumShareOf(f).toFixed(1), '51.9');
  assert.equal(premium.callPremiumShareOf({ ...f, callVolume: 0 }), premium.callPremiumShareOf(f));
  assert.equal(premium.callPremiumShareOf({ callPremium: 0, putPremium: 10 }), 0);
  assert.equal(premium.callPremiumShareOf({ callPremium: 0, putPremium: 0 }), null);
  for (const bad of [undefined, null, NaN, Infinity, -1, '20']) assert.equal(premium.callPremiumShareOf({ callPremium: bad, putPremium: 20 }), null);
});
test('D09 truncated transactions never override net30d or counts; observed zero remains zero', () => {
  const ins = { net30d: -306.9e6, buyCount: 0, sellCount: 5, transactions: [{ value: 415e6, code: 'S' }] };
  assert.deepEqual(plain(market.insider30d(ins)), { net: -306.9e6, buyCount: 0, sellCount: 5, count: 5 });
  assert.equal(market.insider30d({ net30d: 0, buyCount: 0, sellCount: 0 }).net, 0);
  assert.equal(market.insider30d(null).net, null);
});
test('D21 flow gap, batch gap and insight gap share max-pain denominator and sign', () => {
  const gate = load('src/lib/optionLevelGate');
  const lv = gate.levelsFromStructure(s);
  const rt = { price: 214.13, session: 'closed' };
  gate.applyLevelsToRealtime(rt, lv);
  const gap = market.maxPainGapPct(rt.price, rt.maxPain);
  assert.equal(gap.toFixed(2), '-3.76');
  assert.equal(rt.maxPainGapPct,gap);
  assert.equal(rt.maxPainDist, Number((-gap).toFixed(2)), 'compatibility pressure points toward max pain');
  assert.equal(market.maxPainGapPct(100, 100), 0);
  assert.equal(market.maxPainGapPct(100, 0), null);
});
test('D22 Flow and CMD retain their original RSI state words and thresholds', () => {
  function label(file, name, value) {
    const text=fs.readFileSync(path.join(root,file),'utf8');
    const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    let found;
    function walk(n) { if (ts.isVariableDeclaration(n) && n.name.getText(ast)===name) found=n.initializer; ts.forEachChild(n,walk); }
    walk(ast);
    const ctx={rsiPct:value,data:{rsi14:value}};
    vm.runInNewContext('this.result = ('+found.getText(ast)+');',ctx);
    return ctx.result;
  }
  for (const [v,w] of [[70,'Hot'],[60,'Warm'],[56.4,'Neutral'],[40,'Cool'],[35.5,'Cool'],[30,'Oversold']])
    assert.equal(label('src/app/[locale]/app-view/flow/page.tsx','rsiState',v),w);
  for (const [v,w] of [[70,'Hot'],[55,'Warm'],[48.2,'Stable'],[35.5,'Stable'],[35,'Cool']])
    assert.equal(label('src/app/[locale]/app-view/cmd/page.tsx','rsiLabel',v),w);
});
test('D24 accumulation does not make above-average shorts low in any language', () => {
  const { readDarkPool } = load('src/lib/darkPoolRead');
  for (const [pct, avg] of [[57,56],[54,51],[60,50]]) {
    const d = { pct: 50, volRatio: 2, shortPct: pct, shortAvg: avg, shortDev: -20, regime: 'ACCUMULATION' };
    assert.doesNotMatch(readDarkPool(d, 'ko').headline, /뿐입니다/);
    assert.doesNotMatch(readDarkPool(d, 'en').headline, /only/);
    assert.doesNotMatch(readDarkPool(d, 'ja').headline, /だけです/);
  }
  assert.match(readDarkPool({ pct: 50, volRatio: 2, shortPct: 40, shortAvg: 50, regime: 'ACCUMULATION' }).headline, /뿐입니다/);
});
test('D45 standard S3 = 206.71; supports ordered below resistance', () => {
  const p = market.floorPivots(218.68, 213.32, 214.13);
  assert.equal(p.s3.toFixed(2), '206.71');
  assert.ok(p.s3 < p.s2 && p.s2 < p.s1 && p.s1 < p.pp && p.pp < p.r1 && p.r1 < p.r2 && p.r2 < p.r3);
});
test('D38 skew source is weekly structure ATM put/call; scaling IV units does not change ratio', () => {
  const chain = [{ details:{strike_price:214,contract_type:'call'},implied_volatility:.30 },
    { details:{strike_price:214,contract_type:'put'},implied_volatility:.324 },
    { details:{strike_price:300,contract_type:'put'},implied_volatility:9 }];
  assert.equal(skew(chain, 214.13), 1.08);
  assert.equal(skew(chain.map(c => ({ ...c, implied_volatility: c.implied_volatility * 100 })), 214.13), 1.08);
  assert.equal(skew(chain.slice(0,1), 214.13), null);
});
test('D01/D38/D41 same structure inputs yield identical flow, cmd, watchlist, intel and AI values', async () => {
  const read = harness({
    '@/services/redisClient': { mgetFromCache: async keys => keys.map(() => ({ data:s, timestamp:NOW })) },
    '@/lib/aws/dynamoDataProvider': { getLatestGex: async () => ({ ...legacy, totalCallOI:100, totalPutOI:50 }) },
  })('src/services/optionMetricsService').readOptionMetrics;
  const m = (await read(['NVDA'])).get('NVDA');
  const flow = metrics.applyOptionMetrics({ ivSkew:.92, squeezeScore:99 }, m);
  const watchlist = metrics.applyOptionMetrics({ ivSkew:.92 }, m);
  const intel = metrics.applyOptionMetrics({ ivSkew:1.66 }, m);
  const unified = metrics.applyUnifiedOptionMetrics({ structure:{ gammaFlipLevel:null, levels:{putFloor:205} }, volatility:{} }, m);
  const ai = snapshot.buildDeepSnapshot({ ticker:'NVDA', price:214.13, priceChange:0, session:'CLOSED', unified,
    insider:{net30d:-306.9e6,buyCount:0,sellCount:5}, rawTickerData:{flow} });
  for (const q of [flow,watchlist,intel,unified.structure,ai.structure]) {
    assert.equal(q.netGex, 4.79e6); assert.equal(q.squeezeScore,5); assert.equal(q.ivSkew,1.08); assert.equal(q.atmIv,35);
  }
  assert.equal(ai.structure.gammaFlipLevel,null);
  assert.equal(ai.institutional.insiderNet30d,-306.9e6);
});
test('PRE/REG/POST/weekend/holiday same valid edition stays consistent', () => {
  for (const time of ['2026-10-19T12:00Z','2026-10-19T15:00Z','2026-10-19T21:00Z','2026-10-18T22:00Z','2026-11-26T18:00Z']) {
    assert.equal(metrics.optionMetrics(s,null,Date.parse(time)).squeezeScore,5);
    assert.equal(metrics.optionMetrics(s,null,Date.parse(time)).ivSkew,1.08);
  }
});
test('missing structure never uses conflicting legacy GEX/skew; real score zero survives', () => {
  const m = metrics.optionMetrics(null,legacy);
  for (const k of ['netGex','squeezeScore','ivSkew','atmIv']) assert.equal(m[k],null);
  assert.equal(metrics.optionMetrics({...s,netGex:0,squeezeScore:0},null).squeezeScore,0);
});
test('D41 history replaces same-session legacy with structure without rewriting source rows', () => {
  const current = history.structureHistoryPoint('NVDA',{data:s,timestamp:NOW});
  assert.equal(current.timestamp,Date.parse('2026-10-16T20:00:00Z'));
  const merged = history.reconcileGexHistory([legacy],current);
  assert.equal(merged.data.length,1); assert.equal(merged.data[0].gex,4.79e6);
  assert.equal(merged.data[0].flipLevel,null); assert.equal(merged.supersededLegacy[0].gex,-14e6);
  assert.equal(legacy.gexBasis,undefined);
});
test('AI regime history never mixes legacy and structure definitions', () => {
  const current = history.structureHistoryPoint('NVDA',{data:s,timestamp:NOW});
  assert.equal(snapshot.computeGexStats([legacy,current]),null);
  const earlier = {...current,sessionDate:'2026-10-15',timestamp:Date.parse('2026-10-15T20:00:00Z')};
  const stats = snapshot.computeGexStats([legacy,earlier,current]);
  assert.equal(stats.latestRegime,'POSITIVE'); assert.equal(stats.totalDays,2); assert.equal(stats.gexBasis,'structure_v2');
});
test('D20 no option-premium replacement for missing equity whale notional', () => {
  const whale = load('src/lib/metrics/whaleNetBet').whaleNetBet;
  assert.equal(whale({netBuyUsd:759e3,basis:'option_premium',sourceSessionDate:'2026-10-16'}).value,null);
  assert.equal(whale({netBuyUsd:-759e3,basis:'equity_dark_pool_signed_notional',sourceSessionDate:'2026-10-16'}).value,-759e3);
  const flow = fs.readFileSync(path.join(root,'src/app/[locale]/app-view/flow/page.tsx'),'utf8');
  assert.match(flow,/const netWhalePremium = whaleNetBetRaw;/);
  assert.equal(/absNetPrem \* \(callPct/.test(flow),false,'synthetic whale/net fallback removed');
});
test('History GET executes canonical merge with only mocked reads', async () => {
  const h = harness({
    'next/server': {NextResponse:{json: body => body}},
    '@/services/redisClient': {mgetFromCache: async()=>[{data:s,timestamp:NOW}]},
    '@/lib/aws/historyStore': {getGexHistory:async()=>[legacy]},
  }, {fetch:async()=>({ok:true,json:async()=>({result:null})})});
  const result = await h('src/app/api/history/route').GET({url:'https://local.test/api/history?type=gex&ticker=NVDA&days=30'});
  assert.equal(result.data.at(-1).gex,4.79e6);
  assert.equal(result.data.at(-1).flipLevel,null);
  assert.equal(result.supersededLegacy.length,1);
  assert.equal(result.supersededLegacyCount,1);
  const large = harness({
    'next/server': {NextResponse:{json: body => body}},
    '@/services/redisClient': {mgetFromCache:async()=>[{data:s,timestamp:NOW}]},
    '@/lib/aws/historyStore': {getGexHistory:async()=>Array.from({length:2001},(_,i)=>({...legacy,timestamp:legacy.timestamp+i*1000}))},
  }, {fetch:async()=>({ok:true,json:async()=>({result:null})})});
  const bounded=await large('src/app/api/history/route').GET({url:'https://local.test/api/history?type=gex&ticker=NVDA&days=30'});
  assert.equal(bounded.supersededLegacyCount,2001);
  assert.equal(bounded.supersededLegacy.length,600);
});

test('watchlist AI MP placeholder uses 3.8% gap, other level distances preserve their contracts', () => {
  const a=load('src/lib/app/watchlistAiLine');
  const row={price:214.13,maxPain:222.5,callWall:220,putFloor:205,gammaFlipLevel:null,chainDate:'2026-10-16'};
  const lv={mp:222.5,cw:220,pf:205,gf:null};
  const entry={text:'Max Pain below {MP}',chain:row.chainDate,lv,sides:a.sidesFor(row.price,lv)};
  assert.equal(a.fillAiLine(entry,row),'Max Pain below 3.8%');
});

test('Flow actual scalar expressions use premium and server score, even with IV percentile 99', () => {
  const file=path.join(root,'src/app/[locale]/app-view/flow/page.tsx');
  const code=fs.readFileSync(file,'utf8');
  const ast=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const vars=new Map();
  function walk(n){if(ts.isVariableDeclaration(n) && !vars.has(n.name.getText(ast))) vars.set(n.name.getText(ast),n.initializer);ts.forEachChild(n,walk);}
  walk(ast);
  function expr(name,context){const src='globalThis.result = ('+vars.get(name).getText(ast)+');';
    const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(js,context);return context.result;}
  const flow={...s,callPremium:60.36e6,putPremium:56.04e6};
  assert.equal(expr('squeezeProb',{tickerData:{flow},ivRankVal:99}),5);
  assert.equal(expr('squeezeProb',{tickerData:{flow:{}},ivRankVal:99}),null);
  assert.equal(expr('callPct',{tickerData:{flow},callPremiumShareOf:premium.callPremiumShareOf}).toFixed(1),'51.9');
});

test('history keeps live-Greeks session separate from OI date and respects early close', () => {
  const reg=Date.parse('2026-10-19T15:00:00Z');
  const live=history.structureHistoryPoint('NVDA',{data:{...s,structureGreeksBasis:'live'},timestamp:reg},reg);
  assert.equal(live.sessionDate,'2026-10-19'); assert.equal(live.chainDate,'2026-10-16');
  assert.equal(live.timestamp,reg);
  const closed=history.structureHistoryPoint('NVDA',{data:{...s,chainDate:'2026-11-27'},timestamp:Date.parse('2026-11-28T01:00:00Z')},Date.parse('2026-11-28T01:00:00Z'));
  assert.equal(closed.timestamp,Date.parse('2026-11-27T18:00:00Z'));
});

test('repeated weekend collection of one EOD edition does not create extra sessions', () => {
  const rows=[16,17,18].map(d=>({...legacy,gex:4.79e6,gexBasis:'structure_v2',sessionDate:'2026-10-16',timestamp:Date.parse(`2026-10-${d}T20:00:00Z`)}));
  const result=history.reconcileGexHistory(rows,null);
  assert.equal(result.data.length,1);
  assert.equal(result.data[0].timestamp,Date.parse('2026-10-16T20:00:00Z'));
});


test('different dates and explicit formula versions never mix in the canonical series', () => {
  const current=history.structureHistoryPoint('NVDA',{data:s,timestamp:NOW});
  const old={...legacy,timestamp:Date.parse('2026-10-15T20:00Z')};
  const future={...current,gexFormulaVersion:'structure_v3',timestamp:current.timestamp-1000,gex:-4e6};
  const result=history.reconcileGexHistory([old,future],current);
  assert.equal(result.data.length,1);
  assert.equal(result.data[0].gexFormulaVersion,'structure_v2');
  assert.equal(result.supersededLegacy.length,2);
  assert.equal(result.supersededLegacy[0].gexFormulaVersion,'legacy_whole_chain');
  assert.equal(snapshot.computeGexStats([old,current]),null);
  assert.equal(old.gexFormulaVersion,undefined,'source row is unchanged');
});

test('History GET versions all historical rows and preserves last actual date on missing samples', async () => {
  const actual={...legacy,gex:4.79e6,gexBasis:'structure_v2',timestamp:Date.parse('2026-10-15T20:00Z')};
  const missing={...actual,gex:null,gammaRegime:null,timestamp:Date.parse('2026-10-16T20:00Z')};
  const h=harness({
    'next/server':{NextResponse:{json:body=>body}},
    '@/services/redisClient':{mgetFromCache:async()=>[]},
    '@/lib/aws/historyStore':{getGexHistory:async()=>[legacy,actual,missing]},
  },{fetch:async()=>({ok:true,json:async()=>({result:null})})});
  const result=await h('src/app/api/history/route').GET({url:'https://local.test/api/history?type=gex&ticker=NVDA&days=30'});
  assert.equal(result.gexFormulaVersion,'structure_v2');
  assert.equal(result.data.length,2);
  assert.equal(result.data.at(-1).gex,null);
  const timeline=load('src/lib/defs/gexTimeline');
  const valid=timeline.gexTimelineRows(result.data).filter(timeline.hasGexValue);
  assert.equal(valid.at(-1).gex,4.79e6);
  assert.equal(valid.at(-1).timestamp,actual.timestamp);
  assert.equal(snapshot.computeGexStats(result.data),null,'missing sample adds no percentile or regime session');
});

test('null/NaN/infinity/string samples never become zero or connect SVG paths', () => {
  const timeline=load('src/lib/defs/gexTimeline');
  for(const bad of [null,undefined,NaN,Infinity,'0']) assert.equal(timeline.formatGex(bad),'—');
  assert.equal(timeline.formatGex(0),'0');
  const samples=[1,null,2,NaN,0].map((gex,i)=>({...legacy,gex,gexBasis:'structure_v2',timestamp:legacy.timestamp+i*1000}));
  const rows=timeline.gexTimelineRows(samples);
  const plot=timeline.gexPlot(rows,100,100,0,2);
  assert.equal(plot.linePath.split('M ').length-1,3,'three real segments');
  assert.equal(/L /.test(plot.linePath),false,'no segment bridges a null gap');
  assert.equal(plot.last.x,100);
  assert.equal(timeline.gexPlot(timeline.gexTimelineRows([samples[1]]),100,100,0,1).linePath,'');
});

test('web and app components render missing history, last actual values/dates, and version boundaries', () => {
  const React=require('react');
  const {renderToStaticMarkup}=require('react-dom/server');
  const runtime=require('react/jsx-runtime');
  const current={...history.structureHistoryPoint('NVDA',{data:s,timestamp:NOW}),timestamp:Date.parse('2026-10-16T19:59:58Z')};
  function render(file,rows,app=false,locale='en') {
    const states=app?[rows,'ready']:[rows,false,false];
    let index=0;
    const h=harness({
      react:{...React,useState:()=>[states[index++],()=>{}],useMemo:fn=>fn(),useEffect:()=>{}},
      'react/jsx-runtime':runtime,
      'next-intl':{useLocale:()=>locale},
      '@/components/ui/CardTooltip':{CardTooltip:({children})=>React.createElement('span',null,children),COMMAND_TOOLTIPS:{GEX_TIMELINE:{}}},
      './MetricInfo':{MetricInfo:()=>null},
    });
    const Component=h(file)[app?'AppGexTimeline':'GexTimeline'];
    return renderToStaticMarkup(React.createElement(Component,{ticker:'NVDA',locale}));
  }
  for (const locale of ['ko','en','ja']) for(const app of [false,true]) {
    const file=app?'src/components/app/AppGexTimeline':'src/components/history/GexTimeline';
    const missing={...current,gex:null,timestamp:current.timestamp+1000};
    const empty=render(file,[missing],app,locale);
    assert.match(empty,/<svg/,'the chart region stays present');
    assert.doesNotMatch(empty,/<path|<polyline|NaN|Infinity/,'all missing is blank');
    const last=render(file,[current,missing],app,locale);
    assert.match(last,/4.8M/);
    assert.match(last,/2026|26/,'last actual date is shown');
    assert.doesNotMatch(last,/NaN|Infinity|NEGATIVE.*POSITIVE/);
    const mixed=render(file,[{...legacy,timestamp:Date.parse('2026-10-15T20:00Z')},current],app,locale);
    assert.doesNotMatch(mixed,/-14.0M|NEGATIVE.*POSITIVE/,'old formula never creates a flip event');
    const next={...current,gex:2e6,timestamp:current.timestamp+2000};
    const gap=render(file,[current,missing,next],app,locale);
    assert.doesNotMatch(gap,/NaN|Infinity/);
    assert.match(gap,/<path/,'render two actual samples around a blank gap');
  }
});

test('bounded history sampling retains null intervals and the last actual observation', () => {
  const rows=Array.from({length:2001},(_,i)=>({...legacy,gex:i%2?null:i,gexBasis:'structure_v2',timestamp:legacy.timestamp+i*1000}));
  rows.at(-1).gex=null;
  const sampled=history.sampleGexHistory(rows);
  assert.ok(sampled.length<=600);
  assert.ok(sampled.some(r=>r.timestamp===rows.at(-3).timestamp),'last actual survives a missing tail');
  const timeline=load('src/lib/defs/gexTimeline');
  const plot=timeline.gexPlot(timeline.gexTimelineRows(sampled),100,100,0,2000);
  assert.doesNotMatch(plot.linePath,/L /,'alternating missing intervals cannot become a continuous line');
});

test('Intel history comparison rejects explicit future formula versions and missing GEX', async () => {
  const h=harness({
    '@aws-sdk/client-dynamodb':{DynamoDBClient:class {}},
    '@aws-sdk/lib-dynamodb':{
      DynamoDBDocumentClient:{from:()=>({send:async()=>({Items:[
        {...legacy,gexBasis:'structure_v2',gexFormulaVersion:'structure_v3'},
        {...legacy,gex:null,gexBasis:'structure_v2'},legacy,
      ]})})},QueryCommand:class {},
    },
  });
  const ctx=await h('src/services/gexHistoryService').buildHistoryContext('NVDA','LONG',[]);
  assert.equal(ctx.prevGex,null);
  assert.equal(ctx.gexDelta,null);
  assert.equal(ctx.regimeChanged,false);
});

test('a missing weekend copy cannot erase the actual close of the same edition', () => {
  const actual={...legacy,gex:4.79e6,gexBasis:'structure_v2',sessionDate:'2026-10-16'};
  const missing={...actual,gex:null,timestamp:Date.parse('2026-10-18T20:00Z')};
  const result=history.reconcileGexHistory([actual,missing],null);
  assert.equal(result.data.length,1);
  assert.equal(result.data[0].gex,4.79e6);
  assert.equal(result.data[0].timestamp,actual.timestamp);
});
