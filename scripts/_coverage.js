require('dotenv').config({path:require('path').join(__dirname,'..','.env.local'),quiet:true});
const {DynamoDBClient,QueryCommand}=require('@aws-sdk/client-dynamodb');
const {unmarshall}=require('@aws-sdk/util-dynamodb');
const c=new DynamoDBClient({region:'us-east-1',credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY}});
const UNI=require('../data/stock_universe_us800.json').symbols;
async function last(t){
  const r=await c.send(new QueryCommand({TableName:'signum-flow-history',
    KeyConditionExpression:'ticker = :t',ExpressionAttributeValues:{':t':{S:t}},
    ScanIndexForward:false, Limit:1}));
  const it=(r.Items||[]).map(unmarshall)[0];
  return it? new Date(it.timestamp).toISOString().slice(0,10) : null;
}
(async()=>{
  // 표본 300종목 (균등 간격)
  const step=Math.floor(UNI.length/300)||1;
  const sample=UNI.filter((_,i)=>i%step===0).slice(0,300);
  const out={}; let done=0;
  const pool=40;
  await Promise.all(Array.from({length:pool},async()=>{
    while(sample.length){
      const t=sample.pop(); if(!t) break;
      try{ out[t]=await last(t); }catch{ out[t]='ERR'; }
      done++;
    }
  }));
  const cnt={};
  for(const d of Object.values(out)) cnt[d||'없음']=(cnt[d||'없음']||0)+1;
  const keys=Object.keys(cnt).sort().reverse();
  console.log('표본 '+done+'종목 · 마지막 수집일 분포');
  let cum=0;
  for(const k of keys){
    cum+=cnt[k];
    console.log('  '+k.padEnd(10)+String(cnt[k]).padStart(4)+'종목 ('
      +(100*cnt[k]/done).toFixed(1).padStart(5)+'%)  누적 '+(100*cum/done).toFixed(1)+'%');
  }
})();
