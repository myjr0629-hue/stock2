// Offline route/producer regressions. All I/O modules are replaced before loading.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
global.fetch = async () => { throw new Error('Unexpected network access'); };
const nativeTimeout = global.setTimeout;
const watchdog = nativeTimeout(() => { console.error('FAIL test did not complete'); process.exit(1); }, 10000);
global.setTimeout = (...args) => { const timer = nativeTimeout(...args); timer.unref(); return timer; };
const NOW = Date.parse('2026-10-18T00:00:00Z');
Date.now = () => NOW;
const structures = {
  MSFT: { netGex: 30010990, squeezeScore: 10, squeezeRisk: 'LOW', pcr: 1.4 },
  NVDA: { netGex: -14033537, squeezeScore: 28, squeezeRisk: 'LOW', pcr: 0.79 },
  MU: { netGex: -1e6, squeezeScore: 10, squeezeRisk: 'LOW', pcr: 1.09 },
  AMZN: { netGex: 39010358, squeezeScore: 10, squeezeRisk: 'LOW', pcr: 0.9 },
  META: { netGex: -13575888, squeezeScore: 10, squeezeRisk: 'LOW', pcr: 0.9 },
  PLTR: { netGex: -1e6, squeezeScore: 10, squeezeRisk: 'LOW', pcr: 1.4018361 },
};
const rows = Object.fromEntries(Object.entries({MSFT: 0.9, NVDA: 0.73, MU: 0.81, PLTR: 1.10, AMZN: 0.9, META: 0.9}).map(([t,pcr]) => [t, {pcr, timestamp: NOW - 3600000}]));
const snapshot = {score:33.9, grade:'D', action:'WATCH', actionKR:'관심 등록', whyKR:'GEX안전지대(+$5M) + 기관매집 = 매수적합'};
const cached = Object.fromEntries(Object.keys(structures).map(t => [t, {gex:t==='MSFT'?-9239212:5e6,gexM:-9.24,pcr:1.4018361,squeezeScore:40,netPremium:1e6,sparkline:[100,101],ivSkew:0.1,alphaSnapshot:snapshot}]));
const level = {maxPain:100,callWall:110,putFloor:90};
const levels = new Map(Object.keys(structures).map(t=>[t,level]));
const mods = new Map();
const envelope = {at:NOW,phase:'test',body:{success:true,data:[{ticker:'MSFT',gex:-9239212,squeezeScore:40,pcr:1.4018361}],meta:{}}};
const mocks = {
  '@/lib/cache/intelFastCache': { INTEL_FAST_SECTORS:['m7'],intelFastKey:()=> 'intel-test',etPhase:()=>({key:'test',open:false}),intelFastWindow:()=>({fresh:1000,maxStale:10000}),usableEnvelope:()=>({age:0}) },
  '@/services/redisClient': {getFromCache:async k=>k==='intel-test'?structuredClone(envelope):null,setInCache:async()=>true,mgetFromCache:async keys=>keys.map(k=> k==='intel-test'?structuredClone(envelope):k.startsWith('structure:v2:') ? {data:{...structures[k.slice(13)],expiration:structures[k.slice(13)]?.expiration ?? '2026-10-23',options_status:'OK'},timestamp:NOW-1000}:null)},
  '@/lib/aws/dynamoDataProvider': {getLatestGex:async t=>rows[t],getLatestFlow:async()=>null},
  '@/services/analysisCache': {getAnalysisCache:async t=>cached[t],getAnalysisCacheForTickers:async()=>cached,patchAnalysisCache:async()=>true,writeAnalysisCache:async()=>true},
  '@/lib/cache/redisSWR': {swrFetch:async()=>({data:{siData:{siPercent:4,daysToCover:2,siPercentChange:1,settlementDate:'2026-10-15'},svData:{shortVolPercent:40}}})},
  '@/services/structureService': {getStructureData:async t=>({...structures[t],underlyingPrice:100,atmIv:30}),prefetchLevelsForExit:()=>async()=>levels, levelsForExit:async()=>levels,displayLevels:x=>x||{},levelsFromStructure:x=>x,applyLevelsToRealtime:()=>{},applyLevelsToUnified:x=>x,structureV2Key:t=>'structure:v2:'+t},
  '@/services/macroHubProvider': {getMacroSnapshotSSOT:async()=>({})},
  '@/services/impliedMoveService': {impliedMoveOfStructure:async()=>null,peekStoredStructure:async()=>null},
  '@/services/massiveClient': {fetchMassive:async()=>({tickers:[]})},
  '@/services/marketStatusProvider': {getMarketStatusSSOT:async()=>({session:'regular'})},
  '@/services/intrinioClient': {sessionAwareLiquidity:async()=>({})},
  '@/services/darkPool': {getDarkPoolBatch:async()=>({})},
  '@/services/xsScores': {xsOverride:x=>x,xsSnapshotOverride:(_,x)=>x,ensureXsScores:async()=>{}},
};
function load(file, extra='') {
  file=path.resolve(root,file);
  if(mods.has(file)) return mods.get(file).exports;
  const m = new Module(file,module); m.filename=file; m.paths=Module._nodeModulePaths(path.dirname(file));mods.set(file,m);
  m.require=id=>{
    if(mocks[id]) return mocks[id];
    if(id==='next/server') return {NextResponse:{json:x=>x},after:()=>{}};
    if(id.startsWith('@/')) {
      const rel=id.slice(2);
      if(/^(lib\/(optionMetrics|impliedMove|putCall|ai\/(ucNumbers|fieldLeak|amountGuard)|app\/(intelOptionsBasis|intelExtraOptions)|marketCalendar|tickerSymbol)|services\/(optionMetricsService|optionAlphaService|alphaEngine|alphaEngineV2|volatilityRegime))$/.test(rel)) return load('src/'+rel+'.ts');
      return new Proxy({}, {get:()=>()=>null});
    }
    if(id.startsWith('.')) {
      const alias = '@/'+path.relative(path.join(root,'src'),path.resolve(path.dirname(file),id));
      if(mocks[alias]) return mocks[alias];
      const f=path.resolve(path.dirname(file),id);
      if(fs.existsSync(f+'.ts')) return load(f+'.ts');
    }
    return require(id);
  };
  m._compile(ts.transpileModule(fs.readFileSync(file,'utf8')+extra,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);
  return m.exports;
}
const batch=load('src/services/watchlistBatchService.ts','\nexport { processWatchlistBatchCore };');
const live=load('src/app/api/live/ticker/route.ts','\nexport { withExitLevels };');
const command=load('src/app/api/command/unified/route.ts','\nexport { overlayStructureLevels };');
let fails=0,passes=0;
async function test(name,fn){try{await fn();passes++;console.log('PASS '+name);}catch(e){fails++;console.log('FAIL '+name+': '+e.message);}}
(async()=>{
 await test('P1-1 MSFT batch price -9,239,212 -> +30,010,990 and LONG',async()=>{
  const r=(await batch.processWatchlistBatch(['MSFT'],'price')).results[0].realtime;
  assert.equal(r.gex,30010990);assert.equal(r.gexM,30.01099);assert.equal(r.gammaRegime,'LONG');
 });
 await test('P1-2 NVDA cached alpha uses WATCH and current negative GEX, same as Command',async()=>{
  const stale={flow:{},alpha:{...snapshot,action:'BULLISH',actionKR:'우호 신호'}};
  const l=await live.withExitLevels(stale,async()=>levels,'NVDA');
  const c=await command.overlayStructureLevels({structure:{},alpha:snapshot},'NVDA');
  assert.equal(l.alpha.action,'WATCH');assert.match(l.alpha.whyKR,/GEX음성\(-\$14M\)/);assert.equal(l.alpha.whyKR,c.alpha.whyKR);
 });
 await test('P1-3 PLTR 1.4018361 and MU 1.09 -> 35d OI P/C 1.10 and 0.81',async()=>{
  for(const [t,expected] of [['PLTR',1.1],['MU',0.81],['NVDA',0.73]]) {
   const l=await live.withExitLevels({flow:{oiPcr:structures[t].pcr}},async()=>levels,t);
   const c=await command.overlayStructureLevels({structure:{pcRatio:structures[t].pcr},options:{pcr:99}},t);
   assert.equal(l.flow.oiPcr,expected);assert.equal(c.structure.pcRatio,expected);assert.equal(c.options.pcr,expected);
  }
 });
 await test('P1-4 MU 40/5/10 -> 10; NVDA unified volatility 0 and UC 5 -> 28',async()=>{
  const b=(await batch.processWatchlistBatch(['MU'],'price')).results[0];assert.equal(b.realtime.squeezeScore,10);
  const c=await command.overlayStructureLevels({structure:{},squeeze:{riskScore:28},volatility:{squeezeScore:0,squeezeRisk:'LOW'}},'NVDA');
  const l=await live.withExitLevels({flow:{squeezeScore:5}},async()=>levels,'NVDA');
  assert.equal(c.volatility.squeezeScore,28);assert.equal(c.squeeze.riskScore,28);assert.equal(l.flow.squeezeScore,28);
 });
 await test('all batch modes use the canonical tuple including cached full',async()=>{
  for(const mode of ['price','price-dp','ssr','full']) {
   const r=(await batch.processWatchlistBatch(['MSFT'],mode)).results[0];
   assert.equal(r.realtime.gex,30010990,mode);assert.equal(r.realtime.squeezeScore,10,mode);assert.equal(r.realtime.pcr,0.9,mode);assert.equal(r.alphaSnapshot.action,'WATCH');
  }
 });
 await test('AMZN and META audited sign reversals',async()=>{
  for(const [ticker,expected,regime] of [['AMZN',39010358,'LONG'],['META',-13575888,'SHORT']]){
   const r=(await batch.processWatchlistBatch([ticker],'price')).results[0].realtime;
   assert.equal(r.gex,expected);assert.equal(r.gammaRegime,regime);
  }
 });
 await test('missing structure does not revive analysis GEX/squeeze; PCR has its own 35d source',async()=>{
  const keep=structures.MSFT;delete structures.MSFT;
  try {const r=await command.overlayStructureLevels({structure:{netGex:-9239212},volatility:{squeezeScore:0,squeezeRisk:'LOW'},squeeze:{riskScore:5}},'MSFT');
   assert.equal(r.structure.netGex,null);assert.equal(r.volatility.squeezeScore,null);assert.equal(r.volatility.squeezeRisk,null);assert.equal(r.squeeze.riskScore,null);assert.equal(r.structure.pcRatio,0.9);
  }finally{structures.MSFT=keep;}
 });
 await test('missing/stale OI row never falls back to weekly PCR; zero measurements survive',async()=>{
  const keep=rows.PLTR;rows.PLTR={pcr:1.1,timestamp:NOW-6*86400000};
  try {const l=await live.withExitLevels({flow:{oiPcr:1.4018361}},async()=>levels,'PLTR');assert.equal(l.flow.oiPcr,null);}finally{rows.PLTR=keep;}
  const metrics=load('src/lib/optionMetrics.ts').optionMetrics({netGex:0,squeezeScore:0,squeezeRisk:'LOW'},null);
  assert.equal(metrics.gex,0);assert.equal(metrics.gexM,0);assert.equal(metrics.squeezeScore,0);assert.equal(metrics.gammaRegime,'NEUTRAL');
 });
 await test('expired structure never emits last-expiry GEX or squeeze',async()=>{
  structures.MSFT.expiration='2026-10-16';
  try {const r=await command.overlayStructureLevels({structure:{},volatility:{}},'MSFT');assert.equal(r.structure.netGex,null);assert.equal(r.volatility.squeezeScore,null);}finally{delete structures.MSFT.expiration;}
 });
 await test('fast-all and fast cached sectors reconcile already-baked numbers',async()=>{
  const fastAll=load('src/app/api/intel/fast-all/route.ts');
  const r=await fastAll.GET({url:'http://localhost/api/intel/fast-all?app=1'});
  assert.equal(r.sectors.m7.data[0].gex,30010990);assert.equal(r.sectors.m7.data[0].squeezeScore,10);assert.equal(r.sectors.m7.data[0].pcr,0.9);
  const fast=load('src/app/api/intel/fast/route.ts','\nexport { metricsResponse };');
  const f=await fast.GET({url:'http://localhost/api/intel/fast?sector=m7&app=1',headers:new Headers()});
  assert.equal(f.data[0].gex,30010990);assert.equal(f.data[0].squeezeScore,10);
 });
 await test('UC cached money and stale prose are reconciled at output',async()=>{
  const shared=load('src/app/api/undercurrent/shared.ts');
  const cards=[{ticker:'PLTR',money:{oiPcr:1.4018361,squeezeScore:60},moneyRead:'stale'}];
  await shared.reconcileOptionMoney('ko',cards);
  assert.equal(cards[0].money.oiPcr,1.1);assert.equal(cards[0].money.squeezeScore,10);assert.notEqual(cards[0].moneyRead,'stale');
 });
 await test('Redis/Dynamo failures return null tuple, never cached alternatives',async()=>{
  const redis=mocks['@/services/redisClient'],db=mocks['@/lib/aws/dynamoDataProvider'];
  const oldRead=redis.mgetFromCache,oldGex=db.getLatestGex;
  redis.mgetFromCache=async()=>{throw new Error('offline')};db.getLatestGex=async()=>{throw new Error('offline')};
  try {const r=await command.overlayStructureLevels({structure:{netGex:-9239212,pcRatio:9},volatility:{squeezeScore:0}},'MSFT');assert.equal(r.structure.netGex,null);assert.equal(r.structure.pcRatio,null);assert.equal(r.volatility.squeezeScore,null);}finally{redis.mgetFromCache=oldRead;db.getLatestGex=oldGex;}
 });
 await test('new boundary callers and live alpha input are wired to canonical fields',async()=>{
  const source=fs.readFileSync(path.join(root,'src/app/api/live/ticker/route.ts'),'utf8');
  assert.match(source,/const effectiveGex = canonicalOptions\?\.gex \?\? null/);
  assert.match(source,/pcr: canonicalOptions\?\.pcr \?\? null/);
  for(const file of ['src/services/portfolioBatchService.ts','src/app/api/app/options-latest/route.ts','src/app/api/live/short-squeeze/route.ts']) assert.match(fs.readFileSync(path.join(root,file),'utf8'),/readOptionMetrics/);
  const commandSource=fs.readFileSync(path.join(root,'src/app/api/command/unified/route.ts'),'utf8');
  assert.doesNotMatch(commandSource,/squeezeScore: 0, squeezeRisk: 'LOW'/);
 });
 await test('a full cached null alpha is repaired; skip_alpha remains explicit',async()=>{
  const full=await live.withExitLevels({flow:{},alpha:null},async()=>levels,'NVDA');assert.equal(full.alpha.action,'WATCH');
  const lite=await live.withExitLevels({flow:{},alpha:null},async()=>levels,'NVDA',undefined,false);assert.equal(lite.alpha,null);
 });
 await test('portfolio and extra Intel tickers use the same bundle',async()=>{
  const portfolio=load('src/services/portfolioBatchService.ts','\nexport { processPortfolioBatchCore };');
  const p=(await portfolio.processPortfolioBatch(['MSFT'],'price')).results[0];assert.equal(p.realtime.gex,30010990);assert.equal(p.realtime.pcr,0.9);assert.equal(p.alphaSnapshot.action,'WATCH');
  const extra=load('src/app/api/app/options-latest/route.ts');
  const e=await extra.GET({url:'http://localhost/api/app/options-latest?tickers=MSFT'});assert.equal(e.rows.MSFT.gex,30010990);assert.equal(e.rows.MSFT.pcr,0.9);
 });
 await test('short-squeeze and volatility routes preserve SI scope but share squeeze score',async()=>{
  const req={nextUrl:new URL('http://localhost/?t=NVDA')};
  const sq=await load('src/app/api/live/short-squeeze/route.ts').GET(req);
  assert.equal(sq.riskScore,28);assert.equal(sq.siPercent,4);
  const vr=await load('src/app/api/live/volatility-regime/route.ts').GET(req);
  assert.equal(vr.squeezeScore,28);assert.equal(vr.gex,-14033537);
 });
 await test('MU audited full-mode 5 is overwritten by structure 10',async()=>{
  const old=cached.MU.squeezeScore;cached.MU.squeezeScore=5;
  try {const r=(await batch.processWatchlistBatch(['MU'],'full')).results[0];assert.equal(r.realtime.squeezeScore,10);}finally{cached.MU.squeezeScore=old;}
 });
 await test('gate 1: numeric regime 12/15 never invents market weakness in any alpha response',async()=>{
  const old=cached.MSFT.alphaSnapshot;
  cached.MSFT.alphaSnapshot={...snapshot,score:80,action:'BULLISH',pillars:{momentum:20,structure:15,flow:15,regime:12,catalyst:5},triggers:[]};
  try {
   const outputs=[
    (await batch.processWatchlistBatch(['MSFT'],'price')).results[0].alphaSnapshot,
    (await load('src/services/portfolioBatchService.ts').processPortfolioBatch(['MSFT'],'price')).results[0].alphaSnapshot,
    (await live.withExitLevels({flow:{}},async()=>levels,'MSFT')).alpha,
    (await command.overlayStructureLevels({structure:{}},'MSFT')).alpha,
   ];
   for(const a of outputs){assert.equal(a.score,80);assert.equal(a.action,'BULLISH');assert.doesNotMatch(a.whyKR,/시장 약세/);assert.ok(!a.triggerCodes.includes('REGIME_OFF'));assert.ok(a.whyFactors.includes('REGIME_FAVORABLE'));}
  }finally{cached.MSFT.alphaSnapshot=old;}
 });
 await test('gate 1: numeric, full and score/max-only pillars explain identically; missing is unknown',()=>{
  const explain=load('src/services/alphaEngine.ts').explainAlphaSnapshot;
  for(const score of [0,4,8,12,15]) {
   const numeric=explain({...snapshot,pillars:{regime:score},triggers:['stale']},{});
   const detail=explain({...snapshot,pillars:{regime:{score,max:15,pct:Math.round(score/15*100),factors:[]}}},{});
   const noPct=explain({...snapshot,pillars:{regime:{score,max:15}}},{});
   assert.equal(numeric.whyKR,detail.whyKR);assert.equal(noPct.whyKR,detail.whyKR);assert.deepEqual(numeric.triggers,numeric.triggerCodes);
  }
  for(const regime of [undefined,null,{},NaN]) {
   const a=explain({...snapshot,pillars:{regime}},{});assert.doesNotMatch(a.whyKR,/시장 약세/);assert.ok(!a.triggerCodes.includes('REGIME_OFF'));
  }
 });
 await test('gate 2: structure EXTREME stays EXTREME while short-interest status stays CRITICAL',async()=>{
  const old=structures.NVDA;structures.NVDA={...old,squeezeScore:75,squeezeRisk:'EXTREME'};
  try {
   const c=await command.overlayStructureLevels({structure:{},squeeze:{status:'CRITICAL'},volatility:{}},'NVDA');
   const sq=await load('src/app/api/live/short-squeeze/route.ts').GET({nextUrl:new URL('http://localhost/?t=NVDA')});
   assert.equal(c.squeeze.riskScore,75);assert.equal(c.squeeze.status,'CRITICAL');assert.equal(sq.status,'CRITICAL');
   assert.equal(c.structure.squeezeRisk,'EXTREME');assert.equal(c.volatility.squeezeRisk,'EXTREME');
   const dashboard=fs.readFileSync(path.join(root,'src/components/LiveTickerDashboard.tsx'),'utf8');
   const desc=dashboard.match(/const sqDesc = ([^;]+);/)[1];
   assert.equal(new Function('s','td',`return ${desc}`)(sq,x=>x),'sqCritical');
   const decision=fs.readFileSync(path.join(root,'src/components/DecisionGate.tsx'),'utf8');
   const block=decision.match(/if \(sqStatus === 'CRITICAL'[\s\S]*?\n        }/)[0];
   const signals=new Function('sqStatus','squeezeData','ts',`let bullScore=0;const signals=[];${block};return {bullScore,signals};`)(sq.status,sq,x=>x);
   assert.equal(signals.bullScore,7);assert.equal(signals.signals[0].name,'squeeze');
  }finally{structures.NVDA=old;}
 });
 await test('gate 2: short-squeeze unavailable SI branch also preserves CRITICAL',async()=>{
  const old=structures.NVDA, swr=mocks['@/lib/cache/redisSWR'], oldFetch=swr.swrFetch;
  structures.NVDA={...old,squeezeScore:75,squeezeRisk:'EXTREME'};swr.swrFetch=async()=>({data:{siData:null,svData:null}});
  try {const r=await load('src/app/api/live/short-squeeze/route.ts').GET({nextUrl:new URL('http://localhost/?t=NVDA')});assert.equal(r.status,'CRITICAL');assert.equal(r.unavailable,true);assert.equal(r.siPercent,null);}
  finally{structures.NVDA=old;swr.swrFetch=oldFetch;}
 });
 for(const route of ['live','command']) await test(`gate 3: ${route} preserves computed 80 BULLISH when analysis cache is absent`,async()=>{
  const old=cached.NVDA;delete cached.NVDA;
  const fresh={score:80,grade:'A',action:'BULLISH',whyKR:'old',pillars:{regime:{score:12,max:15}}};
  try {const r=route==='live'?await live.withExitLevels({flow:{},alpha:fresh},async()=>levels,'NVDA'):await command.overlayStructureLevels({structure:{},alpha:fresh},'NVDA');
   assert.equal(r.alpha.score,80);assert.equal(r.alpha.action,'BULLISH');assert.match(r.alpha.whyKR,/GEX음성\(-\$14M\)/);assert.doesNotMatch(r.alpha.whyKR,/시장 약세/);
  }finally{cached.NVDA=old;}
 });
 await test('gate 3: read failure keeps fallback alpha; published cache still wins when present',async()=>{
  const service=load('src/services/optionAlphaService.ts'),metrics=await load('src/services/optionMetricsService.ts').readOptionMetrics(['MSFT']);
  const fallbacks=new Map([['MSFT',{alphaSnapshot:{score:80,action:'BULLISH'},whaleIndex:80}]]);
  assert.equal((await service.readOptionAlpha(['MSFT'],metrics,fallbacks)).get('MSFT').action,'WATCH');
  const cache=mocks['@/services/analysisCache'],old=cache.getAnalysisCacheForTickers;cache.getAnalysisCacheForTickers=async()=>{throw new Error('offline')};
  try {const a=(await service.readOptionAlpha(['MSFT'],metrics,fallbacks)).get('MSFT');assert.equal(a.score,80);assert.match(a.whyKR,/기관매집/);}
  finally{cache.getAnalysisCacheForTickers=old;}
 });
 for(const route of ['fast','fast-all']) await test(`gate 4: ${route} replaces cached 10/15 timestamp together with 10/16 PCR`,async()=>{
  const oldRow=rows.MSFT,oldBody=envelope.body;
  const ts=Date.parse('2026-10-16T20:30:00Z'),prior=Date.parse('2026-10-15T20:30:00Z');
  rows.MSFT={pcr:0.90,timestamp:ts};envelope.body={success:true,data:[{ticker:'MSFT',pcr:1.4,optionsAsOf:prior}],meta:{app:true,optionsAsOf:prior}};
  try {const req={url:`http://localhost/api/intel/${route}?sector=m7&app=1`,headers:new Headers()};
   const out=await load(`src/app/api/intel/${route}/route.ts`).GET(req),body=route==='fast'?out:out.sectors.m7;
   assert.equal(body.data[0].pcr,0.9);assert.equal(body.data[0].optionsAsOf,ts);assert.equal(body.meta.optionsAsOf,ts);
   const note=load('src/lib/app/intelOptionsBasis.ts').optionsAsOfNote(body.data[0].optionsAsOf,NOW,false,'ko');
   assert.equal(note.label,'10/16 마감 기준');assert.equal(note.isPriorSession,false);
  }finally{rows.MSFT=oldRow;envelope.body=oldBody;}
 });
 await test('gate 4: missing/stale OI cannot retain an old optionsAsOf in refreshed responses',async()=>{
  const old=rows.MSFT;rows.MSFT={pcr:0.9,timestamp:NOW-6*86400000};
  try {
   const fast=load('src/app/api/intel/fast/route.ts','\nexport { metricsResponse };');
   const body=await fast.metricsResponse({data:[{ticker:'MSFT',pcr:1.4,optionsAsOf:NOW-1000}],meta:{app:true,optionsAsOf:NOW-1000}});
   assert.equal(body.data[0].pcr,null);assert.equal(body.data[0].optionsAsOf,null);assert.equal(body.meta.optionsAsOf,null);
  }finally{rows.MSFT=old;}
 });
 await test('gate 4: options-latest uses one OI row for both PCR and timestamp',async()=>{
  const db=mocks['@/lib/aws/dynamoDataProvider'],old=db.getLatestGex;let calls=0;
  const ts=Date.parse('2026-10-16T20:30:00Z');
  db.getLatestGex=async()=>{calls++;return {pcr:calls===1?0.9:1.4,timestamp:calls===1?ts:ts-86400000};};
  try {const r=await load('src/app/api/app/options-latest/route.ts').GET({url:'http://localhost/?tickers=MSFT'});assert.equal(r.rows.MSFT.pcr,0.9);assert.equal(r.rows.MSFT.optionsAsOf,ts);assert.equal(calls,1);}
  finally{db.getLatestGex=old;}
 });
 for(const service of ['watchlist','portfolio']) await test(`gate 3: ${service} retains its built alpha if the exit cache read misses`,async()=>{
  const portfolio=load('src/services/portfolioBatchService.ts');
  const core=service==='watchlist'?batch.processWatchlistBatchCore:portfolio.processPortfolioBatchCore;
  const built=(await core(['MSFT'],'price')).results[0].alphaSnapshot;
  const cache=mocks['@/services/analysisCache'],old=cache.getAnalysisCacheForTickers;let reads=0;
  cache.getAnalysisCacheForTickers=async()=>++reads===1?cached:{};
  try {
   const result=service==='watchlist'?await batch.processWatchlistBatch(['MSFT'],'price'):await load('src/services/portfolioBatchService.ts').processPortfolioBatch(['MSFT'],'price');
   assert.equal(reads,2);assert.equal(result.results[0].alphaSnapshot.score,built.score);assert.equal(result.results[0].alphaSnapshot.action,built.action);
  }finally{cache.getAnalysisCacheForTickers=old;}
 });
 await test('gate 3: cache read errors retain route alpha and Command numeric smartFlow context',async()=>{
  const cache=mocks['@/services/analysisCache'],old=cache.getAnalysisCacheForTickers;cache.getAnalysisCacheForTickers=async()=>{throw new Error('offline')};
  try {
   const alpha={score:80,grade:'A',action:'BULLISH'};
   const l=await live.withExitLevels({flow:{darkPoolPct:60},alpha},async()=>levels,'MSFT');
   const c=await command.overlayStructureLevels({structure:{},alpha,smartFlow:80},'MSFT');
   assert.equal(l.alpha.score,80);assert.match(l.alpha.whyKR,/기관매집\(DP 60%\)/);assert.equal(c.alpha.score,80);assert.ok(c.alpha.triggerCodes.includes('WHALE_IN'));
   const none=await live.withExitLevels({flow:{},alpha:null},async()=>levels,'MSFT');assert.equal(none.alpha,null);
   const skip=await live.withExitLevels({flow:{},alpha},async()=>levels,'MSFT',undefined,false);assert.equal(skip.alpha,null);
  }finally{cache.getAnalysisCacheForTickers=old;}
 });
 await test('gate 2: LOW/MEDIUM/HIGH/CRITICAL and missing measurements keep their contracts',()=>{
  const {optionMetrics,applyUnifiedOptionMetrics}=load('src/lib/optionMetrics.ts');
  for(const risk of ['LOW','MEDIUM','HIGH','CRITICAL']) {
   const m=optionMetrics({squeezeScore:40,squeezeRisk:risk},null),data=applyUnifiedOptionMetrics({structure:{},squeeze:{},volatility:{}},m);
   assert.equal(data.squeeze.status,risk);assert.equal(data.structure.squeezeRisk,risk);assert.equal(data.volatility.squeezeRisk,risk);
  }
  const data=applyUnifiedOptionMetrics({squeeze:{status:'CRITICAL'}});assert.equal(data.squeeze.status,null);assert.equal(data.squeeze.riskScore,null);
 });
 await test('gate 4: web Intel response and multi-row sector metadata use the same latest OI reads',async()=>{
  const fast=load('src/app/api/intel/fast/route.ts'),a=rows.MSFT,b=rows.NVDA;
  rows.MSFT={pcr:0.9,timestamp:NOW-7200000};rows.NVDA={pcr:0.73,timestamp:NOW-3600000};
  try {
   const r=await fast.metricsResponse({data:[{ticker:'MSFT',optionsAsOf:1},{ticker:'NVDA',optionsAsOf:2}],meta:{optionsAsOf:2}});
   assert.equal(r.data[0].optionsAsOf,rows.MSFT.timestamp);assert.equal(r.data[1].optionsAsOf,rows.NVDA.timestamp);assert.equal(r.meta.optionsAsOf,rows.NVDA.timestamp);
  }finally{rows.MSFT=a;rows.NVDA=b;}
 });


 await test('gate 10181009 P1: SI fallback preserves original risk thresholds, real zero, and missing evidence',()=>{
  const {shortSqueezeMetrics,optionMetrics}=load('src/lib/optionMetrics.ts');
  for(const [input,score,status] of [
   [{siPercent:0,daysToCover:0,siChange:0,shortVolPercent:0},0,'LOW'],
   [{siPercent:5},10,'LOW'],[{siPercent:5,daysToCover:3},25,'MEDIUM'],
   [{siPercent:10,daysToCover:3,siChange:1},48,'HIGH'],
   [{siPercent:20,daysToCover:5,shortVolPercent:30},70,'CRITICAL'],
  ]) assert.deepEqual(shortSqueezeMetrics(input),{riskScore:score,status});
  for(const input of [null,{}, {riskScore:100,status:'CRITICAL'}, {siPercent:NaN,daysToCover:Infinity}, {unavailable:true,siPercent:25}])
   assert.deepEqual(shortSqueezeMetrics(input),{riskScore:null,status:null});
  assert.deepEqual(shortSqueezeMetrics({siPercent:25,daysToCover:6,shortVolPercent:55},optionMetrics({squeezeScore:0,squeezeRisk:'LOW'},null)),{riskScore:0,status:'LOW'});
 });
 await test('gate 10181009 P1: missing structure and stale SI never revives old risk',async()=>{
  const keep=structures.NVDA,swr=mocks['@/lib/cache/redisSWR'],old=swr.swrFetch;delete structures.NVDA;
  swr.swrFetch=async()=>({data:{siData:{siPercent:25,daysToCover:6,settlementDate:'2026-08-01'},svData:{shortVolPercent:55}}});
  try {
   const sq=await load('src/app/api/live/short-squeeze/route.ts').GET({nextUrl:new URL('http://localhost/?t=NVDA')});
   assert.equal(sq.unavailable,true);assert.equal(sq.riskScore,null);assert.equal(sq.status,null);assert.equal(sq.siPercent,null);
  }finally{structures.NVDA=keep;swr.swrFetch=old;}
 });
 await test('gate 10181009 P2: preserve valid news and option prose, repair stale multipliers and already-reconciled contradictions',async()=>{
  const shared=load('src/app/api/undercurrent/shared.ts');
  const cards=['실적 발표가 예정되어 있다','콜 쪽이 많다','풋 옵션이 콜보다 많다','콜이 풋의 5.0배 많다'].map(whyItMatters=>({ticker:'NVDA',money:{oiPcr:0.73,squeezeScore:28},whyItMatters}));
  await shared.reconcileOptionMoney('ko',cards);
  assert.equal(cards[0].whyItMatters,'실적 발표가 예정되어 있다');assert.equal(cards[1].whyItMatters,'콜 쪽이 많다');
  for(const c of cards.slice(2)) assert.equal(c.whyItMatters,shared.factSentence('ko',c.money));
 });
 // Latest gate 10181009: preserve SI evidence when structure is missing.
 for (const boundary of ['short-squeeze API','Command exit']) await test(`gate 10181009 P1: ${boundary} missing structure keeps measured SI risk CRITICAL`,async()=>{
  const keep=structures.NVDA, swr=mocks['@/lib/cache/redisSWR'],old=swr.swrFetch;
  delete structures.NVDA;
  swr.swrFetch=async()=>({data:{siData:{siPercent:25,daysToCover:6,siPercentChange:8,settlementDate:'2026-10-15'},svData:{shortVolPercent:55}}});
  try {
   const sq=boundary==='short-squeeze API'
    ? await load('src/app/api/live/short-squeeze/route.ts').GET({nextUrl:new URL('http://localhost/?t=NVDA')})
    : (await command.overlayStructureLevels({structure:{},volatility:{},squeeze:{siPercent:25,daysToCover:6,siChange:8,shortVolPercent:55,riskScore:5,status:'LOW'}},'NVDA')).squeeze;
   assert.equal(sq.riskScore,100);assert.equal(sq.status,'CRITICAL');assert.equal(sq.siPercent,25);
  }finally{structures.NVDA=keep;swr.swrFetch=old;}
 });
 for(const [loc,wrong] of [['ko','풋 옵션이 콜보다 많다'],['ja','プットがコールより多い'],['en','more puts than calls']]) await test(`gate 10181009 P2: shared ${loc} revalidates whyItMatters after P/C 1.40 -> 0.73`,async()=>{
  const shared=load('src/app/api/undercurrent/shared.ts');
  const cards=[{ticker:'NVDA',money:{oiPcr:1.40,squeezeScore:28},whyItMatters:wrong,moneyRead:wrong}];
  const summary={ticker:'NVDA',money:{oiPcr:1.40,squeezeScore:28},tickerRead:wrong};
  await shared.reconcileOptionMoney(loc,cards,summary);
  assert.equal(cards[0].money.oiPcr,0.73);
  assert.equal(cards[0].whyItMatters,shared.factSentence(loc,cards[0].money));
  assert.ok(cards[0].whyItMatters);assert.equal(shared.contradictsLean(loc,cards[0].whyItMatters,cards[0].money),false);
  assert.equal(summary.tickerRead,shared.factSentence(loc,summary.money));
 });
 await test('gate 10181009 P2: ticker cached output revalidates final values without hiding the explanation',async()=>{
  const redis=mocks['@/services/redisClient'],old=redis.getFromCache;
  mocks['@/lib/ai/creditPacing']={BASELINE_KNOBS:{ucTickerFreshSec:600},pacingKnobs:async()=>({ucTickerFreshSec:600})};
  mocks['@/lib/seo/ucMoneyExit']={ucMoneyAtExit:x=>x};
  redis.getFromCache=async()=>({success:true,generatedAt:new Date(NOW).toISOString(),money:{oiPcr:1.40,squeezeScore:28},tickerRead:'풋 옵션이 콜보다 많다',cards:[{ticker:'NVDA',money:{oiPcr:1.40,squeezeScore:28},moneyRead:'풋 옵션이 콜보다 많다',whyItMatters:'풋 옵션이 콜보다 많다',plainTitle:'실적 발표'}]});
  try {
   const result=await load('src/app/api/undercurrent/ticker/route.ts').GET({url:'http://localhost/?t=NVDA&locale=ko&nogen=1'});
   assert.equal(result.success,true,result.error);assert.equal(result.money.oiPcr,0.73);
   assert.equal(result.cards[0].whyItMatters,load('src/app/api/undercurrent/shared.ts').factSentence('ko',result.cards[0].money));
   assert.ok(result.cards[0].whyItMatters);assert.equal(result.cards[0].plainTitle,'실적 발표');
  }finally{redis.getFromCache=old;}
 });

 for(const route of ['feed','ticker']) await test(`gate 10181009 P2: ${route} generated/cached exit preserves prose that matches new numbers`,async()=>{
  const shared=load('src/app/api/undercurrent/shared.ts'),old=shared.serveSWR;
  const why='콜 쪽이 많다';
  shared.serveSWR=async()=>({body:{success:true,money:{oiPcr:1.40,squeezeScore:28},tickerRead:why,cards:[{ticker:'NVDA',money:{oiPcr:1.40,squeezeScore:28},moneyRead:why,whyItMatters:why,plainTitle:'실적 발표'}]},stale:false});
  try {
   const result=await load(`src/app/api/undercurrent/${route}/route.ts`).GET({url:'http://localhost/?t=NVDA&locale=ko'});
   assert.equal(result.success,true,result.error);assert.equal(result.cards[0].money.oiPcr,0.73);
   assert.equal(result.cards[0].whyItMatters,why);assert.equal(result.cards[0].plainTitle,'실적 발표');
   assert.ok(result.cards[0].moneyRead);
  }finally{shared.serveSWR=old;}
 });
 // Gate 10181330: direct metric claims must agree with the final option tuple.
 const optionProse = {
  ko: ['P/C 1.40이다.', '스퀴즈 점수는 80점이다.', 'P/C 0.73이고 스퀴즈 점수는 28점이다.'],
  en: ['P/C is 1.40.', 'The squeeze score is 80.', 'P/C is 0.73 and the squeeze score is 28.'],
  ja: ['P/Cは1.40です。', 'スクイーズスコアは80点です。', 'P/Cは0.73でスクイーズスコアは28点です。'],
 };
 for(const [loc,prose] of Object.entries(optionProse)) {
  for(const route of ['feed','ticker']) for(const wrong of prose.slice(0,2)) await test(`gate 10181330: ${route}/${loc} repairs direct claim ${wrong}`,async()=>{
   const shared=load('src/app/api/undercurrent/shared.ts'),old=shared.serveSWR;
   shared.serveSWR=async()=>({body:{success:true,money:{oiPcr:1.40,squeezeScore:80},tickerRead:wrong,cards:[{ticker:'NVDA',money:{oiPcr:1.40,squeezeScore:80},moneyRead:wrong,whyItMatters:wrong,plainTitle:'Earnings'}]},stale:true});
   try {
    const result=await load(`src/app/api/undercurrent/${route}/route.ts`).GET({url:`http://localhost/?t=NVDA&locale=${loc}`});
    assert.equal(result.success,true,result.error);
    // Gate 10181557: a replaced squeeze claim is restated with the final squeeze score.
    const squeeze=load('src/lib/ai/ucNumbers.ts').citedOptionMetrics(wrong).squeeze;
    const card=result.cards[0],expected=shared.factSentence(loc,card.money,{squeeze});
    assert.equal(card.money.oiPcr,0.73);assert.equal(card.money.squeezeScore,28);
    assert.ok(expected);assert.equal(card.whyItMatters,expected);assert.equal(card.moneyRead,expected);
    if(squeeze) assert.match(expected,/28/);
    assert.equal(card.plainTitle,'Earnings');assert.equal(result.cards.length,1);
    if(route==='ticker') assert.equal(result.tickerRead,shared.factSentence(loc,result.money,{squeeze}));
   }finally{shared.serveSWR=old;}
  });
  await test(`gate 10181330: ${loc} already-reconciled claims are checked and matching prose survives`,async()=>{
   const shared=load('src/app/api/undercurrent/shared.ts');
   const cards=[...prose.slice(0,2),prose[2]].map(why=>({ticker:'NVDA',money:{oiPcr:0.73,squeezeScore:28},whyItMatters:why,moneyRead:why}));
   const summary={ticker:'NVDA',money:{oiPcr:0.73,squeezeScore:28},tickerRead:prose[0]};
   await shared.reconcileOptionMoney(loc,cards,summary);
   shared.enforceLean(loc,cards,{extra:{box:summary,field:'tickerRead',money:summary.money}});
   for(const card of cards.slice(0,2)) {
    const squeeze=load('src/lib/ai/ucNumbers.ts').citedOptionMetrics(card===cards[1]?prose[1]:prose[0]).squeeze;
    assert.equal(card.whyItMatters,shared.factSentence(loc,card.money,{squeeze}));assert.equal(card.moneyRead,shared.factSentence(loc,card.money,{squeeze}));
   }
   assert.equal(cards[2].whyItMatters,prose[2]);assert.equal(cards[2].moneyRead,prose[2]);
   assert.equal(summary.tickerRead,shared.factSentence(loc,summary.money));
   // A second validation must not reject the factual fallback itself.
   assert.equal(shared.enforceLean(loc,cards,{extra:{box:summary,field:'tickerRead',money:summary.money}}),0);
  });
 }
 // Gate 10181557: no P/C and no new-position amount — a corrected squeeze score must still yield a sentence.
 const squeezeOnly = {
  ko: ['스퀴즈 점수는 80점이다.', '실적은 10월 28일이다.'],
  en: ['The squeeze score is 80.', 'Earnings are on October 28.'],
  ja: ['スクイーズスコアは80点です。', '決算は10月28日です。'],
 };
 for(const [loc,[wrong,news]] of Object.entries(squeezeOnly)) {
  for(const route of ['feed','ticker']) await test(`gate 10181557: ${route}/${loc} squeeze 80 -> 28 without P/C or amount keeps a matching explanation`,async()=>{
   const shared=load('src/app/api/undercurrent/shared.ts'),old=shared.serveSWR,ucn=load('src/lib/ai/ucNumbers.ts');
   const keepRow=rows.NVDA;delete rows.NVDA;
   const money={oiPcr:null,volumePcr:null,newOiNotional:null,newOiSide:null,squeezeScore:80};
   shared.serveSWR=async()=>({body:{success:true,money:{...money},tickerRead:wrong,cards:[{ticker:'NVDA',money:{...money},moneyRead:wrong,whyItMatters:wrong,plainTitle:'Earnings'}]},stale:true});
   try {
    const result=await load(`src/app/api/undercurrent/${route}/route.ts`).GET({url:`http://localhost/?t=NVDA&locale=${loc}`});
    assert.equal(result.success,true,result.error);
    const card=result.cards[0];
    assert.equal(card.money.oiPcr,null);assert.equal(card.money.squeezeScore,28);
    for(const text of [card.whyItMatters,card.moneyRead,...(route==='ticker'?[result.tickerRead]:[])]) {
     assert.equal(typeof text,'string',`explanation hidden: ${text}`);assert.match(text,/28/);
     assert.deepEqual(ucn.ucNumberProblems(loc,text,card.money),[]);
    }
   }finally{shared.serveSWR=old;rows.NVDA=keepRow;}
  });
  await test(`gate 10181557: ${loc} squeeze unavailable keeps non-option prose and drops only the stale squeeze claim`,async()=>{
   const shared=load('src/app/api/undercurrent/shared.ts');
   const keepRow=rows.NVDA,keepS=structures.NVDA;delete rows.NVDA;delete structures.NVDA;
   const money={oiPcr:null,volumePcr:null,newOiNotional:null,squeezeScore:80};
   const cards=[{ticker:'NVDA',money:{...money},whyItMatters:`${news} ${wrong}`,moneyRead:news}];
   const summary={ticker:'NVDA',money:{...money},tickerRead:wrong};
   try {
    await shared.reconcileOptionMoney(loc,cards,summary);
    assert.equal(cards[0].money.squeezeScore,null);
    assert.equal(cards[0].whyItMatters,news);assert.equal(cards[0].moneyRead,news);
    assert.equal(summary.tickerRead,null);
   }finally{rows.NVDA=keepRow;structures.NVDA=keepS;}
  });
 }
 console.log(`${passes} passed, ${fails} failed`);clearTimeout(watchdog);process.exitCode=fails?1:0;
})();
