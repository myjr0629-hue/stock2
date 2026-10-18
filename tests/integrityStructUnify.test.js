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
      if(/^(lib\/(optionMetrics|impliedMove|putCall|app\/(intelOptionsBasis|intelExtraOptions)|marketCalendar|tickerSymbol)|services\/(optionMetricsService|optionAlphaService|alphaEngine|alphaEngineV2|volatilityRegime))$/.test(rel)) return load('src/'+rel+'.ts');
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
const batch=load('src/services/watchlistBatchService.ts');
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
  const fast=load('src/app/api/intel/fast/route.ts');
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
  const portfolio=load('src/services/portfolioBatchService.ts');
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
 console.log(`${passes} passed, ${fails} failed`);clearTimeout(watchdog);process.exitCode=fails?1:0;
})();
