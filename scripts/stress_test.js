const{DynamoDBClient}=require('@aws-sdk/client-dynamodb');
const{DynamoDBDocumentClient,GetCommand}=require('@aws-sdk/lib-dynamodb');
const{LambdaClient,InvokeCommand}=require('@aws-sdk/client-lambda');
require('dotenv').config({path:'.env.local'});
const dc=DynamoDBDocumentClient.from(new DynamoDBClient({region:'us-east-1',credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY}}),{marshallOptions:{removeUndefinedValues:true}});
const lc=new LambdaClient({region:'us-east-1',credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY}});
const fs=require('fs');
const UNIVERSE=new Set(JSON.parse(fs.readFileSync('data/universe_500.json','utf-8')).symbols);
const F=['structure','analyst','fundamentals','earnings','sma','volatility','squeeze','institutional','related'];

// 진짜 비유니버스 종목 15개 (다양한 타입: 소형주, ADR, 최근 IPO)
const COLD_TICKERS=['TMDX','ONON','BABA','ZM','DOCS','WIX','TWST','GTLB','CFLT','BRZE','IOT','FRSH','SOUN','CAVA','BIRK'];
// 검증: 전부 비유니버스인지 확인
const inUniv=COLD_TICKERS.filter(t=>UNIVERSE.has(t));
if(inUniv.length>0){console.log('ERROR: in universe:',inUniv);process.exit(1);}

async function checkDynamo(ticker){
  try{
    const r=await dc.send(new GetCommand({TableName:'signum-unified-cache',Key:{pk:ticker}}));
    if(!r.Item) return {ticker,found:false,fields:0,miss:F,score:null,grade:null};
    const d=r.Item.data;
    const has=F.filter(f=>!!d?.[f]);
    const miss=F.filter(f=>!d?.[f]);
    return {ticker,found:true,fields:has.length,miss,score:d?.fundamentals?.score,grade:d?.fundamentals?.grade,upd:r.Item.updatedAt?.slice(11,19)};
  }catch(e){return {ticker,found:false,fields:0,miss:F,score:null,grade:null,err:e.message};}
}

async function main(){
  console.log('=== COLD-START STRESS TEST @ '+new Date().toISOString()+' ===');
  console.log('Tickers: '+COLD_TICKERS.length+' (all non-universe verified)\n');
  
  // ── BEFORE: 현재 상태 ──
  console.log('--- BEFORE ---');
  const before=[];
  for(const t of COLD_TICKERS){
    const r=await checkDynamo(t);
    before.push(r);
    console.log('  '+t.padEnd(6)+': '+(r.found?r.fields+'/9 upd:'+r.upd:'NOT FOUND'));
  }
  
  // ── DISPATCH: 15종목 동시 cold-start ──
  console.log('\n--- DISPATCH 15 Lambdas ---');
  const t0=Date.now();
  await Promise.all(COLD_TICKERS.map(t=>
    lc.send(new InvokeCommand({FunctionName:'signum-harvest',InvocationType:'Event',Payload:JSON.stringify({onDemandTicker:t})}))
  ));
  console.log('All dispatched in '+(Date.now()-t0)+'ms. Waiting 120s...\n');
  await new Promise(r=>setTimeout(r,120000));
  
  // ── AFTER: 결과 확인 ──
  console.log('--- AFTER ---');
  let perfect=0,good=0,partial=0,fail=0;
  for(let i=0;i<COLD_TICKERS.length;i++){
    const t=COLD_TICKERS[i];
    const r=await checkDynamo(t);
    const prev=before[i];
    const delta=r.found&&prev.found?(r.fields-prev.fields):(r.found?r.fields:0);
    const icon=r.fields>=8?'✅':r.fields>=6?'⚠️':'❌';
    console.log('  '+icon+' '+t.padEnd(6)+': '+r.fields+'/9 ('+(delta>=0?'+':'')+delta+') score:'+r.score+' grade:'+r.grade+(r.miss.length>0?' miss:['+r.miss.join(',')+']':''));
    if(r.fields>=9) perfect++;
    else if(r.fields>=8) good++;
    else if(r.fields>=6) partial++;
    else fail++;
  }
  
  console.log('\n--- SUMMARY ---');
  console.log('9/9 PERFECT: '+perfect);
  console.log('8/9 GOOD:    '+good);
  console.log('6-7 PARTIAL: '+partial);
  console.log('<6  FAIL:    '+fail);
  console.log('TOTAL: '+COLD_TICKERS.length);
  
  // ── UNIVERSE 509 전수 확인 ──
  console.log('\n--- UNIVERSE 509 FULL AUDIT ---');
  const univSymbols=[...UNIVERSE];
  let u_ok=0,u_8plus=0,u_9=0,u_noScore=0,u_miss=0;
  for(let i=0;i<univSymbols.length;i+=25){
    const batch=univSymbols.slice(i,i+25);
    const results=await Promise.all(batch.map(t=>checkDynamo(t)));
    for(const r of results){
      if(!r.found){u_miss++;continue;}
      u_ok++;
      if(r.fields>=8) u_8plus++;
      if(r.fields>=9) u_9++;
      if(r.score===undefined||r.score===null) u_noScore++;
    }
  }
  console.log('FOUND:'+u_ok+'/'+univSymbols.length+' MISSING:'+u_miss);
  console.log('8f+:'+u_8plus+' 9f:'+u_9+' NO_SCORE:'+u_noScore);
  
  console.log('\n=== STRESS TEST COMPLETE ===');
}
main().catch(e=>console.error('FATAL:',e));
