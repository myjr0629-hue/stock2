require('dotenv').config({path:'.env.local'});
const {Redis}=require('@upstash/redis');
const r=new Redis({url:process.env.UPSTASH_REDIS_REST_URL,token:process.env.UPSTASH_REDIS_REST_TOKEN});
const https=require('https');
const fs=require('fs');

(async()=>{
  let out='';
  const log=(m)=>{out+=m+'\n';};
  const ticker='TSLA';
  log('=== FULL PIPELINE TRACE: '+ticker+' ===');

  // 1. rt-metrics
  log('\n[1] Redis rt-metrics:'+ticker);
  const rtm=await r.get('rt-metrics:'+ticker);
  if(rtm){
    log('  darkPool.percent: '+rtm.darkPool?.percent);
    log('  shortVolume.percent: '+rtm.shortVolume?.percent);
    log('  blockTrade.count: '+rtm.blockTrade?.count);
    log('  timestamp: '+rtm.timestamp);
  } else log('  NOT FOUND');

  // 2. cache:flow:unified
  log('\n[2] Redis cache:flow:unified:'+ticker);
  const cfu=await r.get('cache:flow:unified:'+ticker);
  if(cfu){
    log('  keys: '+Object.keys(cfu).join(', '));
    log('  _source: '+cfu._source);
    log('  timestamp: '+cfu.timestamp);
    log('  realtimeMetrics.darkPool.percent: '+(cfu.realtimeMetrics?.darkPool?.percent||'N/A'));
    log('  darkPoolStats.percent: '+(cfu.darkPoolStats?.percent||cfu.darkPoolStats?.darkPoolPercent||'N/A'));
  } else log('  NOT FOUND');

  // 3. polygon:snapshot:probe
  log('\n[3] Redis polygon:snapshot:probe:'+ticker);
  const probe=await r.get('polygon:snapshot:probe:'+ticker);
  if(probe){
    const c=Array.isArray(probe)?probe.length:(probe?.results?.length||'obj');
    log('  data exists: YES ('+c+' items)');
  } else log('  NOT FOUND');

  // 4. API
  log('\n[4] Vercel API /api/live/ticker?t='+ticker);
  const apiData=await new Promise((res,rej)=>{
    https.get('https://www.signumhq.com/api/live/ticker?t='+ticker,{timeout:30000},r=>{
      let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));
    }).on('error',rej);
  });
  log('  ALL keys: '+JSON.stringify(Object.keys(apiData)));
  log('  price: '+apiData.price);
  log('  vwap: '+apiData.vwap);
  log('  session: '+apiData.session);

  // Flow sub-keys
  if(apiData.flow){
    log('  flow.dataSource: '+apiData.flow.dataSource);
    log('  flow.netPremium: '+apiData.flow.netPremium);
    log('  flow.contractsProcessed: '+apiData.flow.contractsProcessed);
    log('  flow.rawChain count: '+(apiData.flow.rawChain?.length||0));
    log('  flow.allExpiryChain count: '+(apiData.flow.allExpiryChain?.length||0));
  }

  // Calc
  if(apiData.calc){
    log('  calc: '+JSON.stringify(apiData.calc).substring(0,300));
  } else {
    log('  calc: NOT PRESENT');
  }

  // darkPool
  if(apiData.darkPool){
    log('  darkPool: '+JSON.stringify(apiData.darkPool).substring(0,300));
  } else {
    log('  darkPool: NOT PRESENT');
  }

  // whale
  if(apiData.whale){
    log('  whale: '+JSON.stringify(apiData.whale).substring(0,300));
  } else {
    log('  whale: NOT PRESENT');
  }

  // Check if calc is computed by Vercel from rawChain
  // The Flow page client does the computation in-browser or via Vercel
  log('\n[5] PIPELINE VERDICT');
  log('  Lambda→Redis rt-metrics: '+(rtm?'✅ OK':'❌ FAIL'));
  log('  Lambda→Redis flow:unified: '+(cfu?'✅ OK':'❌ FAIL'));
  log('  Lambda→Redis probe: '+(probe?'✅ OK':'❌ FAIL'));
  log('  Redis→Vercel price: '+(apiData.price?'✅ '+apiData.price:'❌ FAIL'));
  log('  Redis→Vercel flow data: '+(apiData.flow?.rawChain?.length>0?'✅ '+apiData.flow.rawChain.length+' contracts':'❌ FAIL'));

  // Now also check if the dark pool data from rt-metrics reaches Flow page
  // The Flow page uses /api/live/ticker which returns darkPool data embedded
  // Check the response for darkPool or realtimeMetrics
  const allKeys=Object.keys(apiData);
  const dpRelated=allKeys.filter(k=>k.toLowerCase().includes('dark')||k.toLowerCase().includes('pool')||k.toLowerCase().includes('whale')||k.toLowerCase().includes('metric'));
  log('  darkPool-related API keys: '+JSON.stringify(dpRelated));

  fs.writeFileSync('pipeline_trace.txt',out);
  console.log(out);
})();
