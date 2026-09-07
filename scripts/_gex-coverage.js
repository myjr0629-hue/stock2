require('dotenv').config({path:require('path').join(__dirname,'..','.env.local'),quiet:true});
const {DynamoDBClient,QueryCommand}=require('@aws-sdk/client-dynamodb');
const {unmarshall}=require('@aws-sdk/util-dynamodb');
const c=new DynamoDBClient({region:'us-east-1',credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY}});
const UNI=require('../data/stock_universe_us800.json').symbols;
const T=process.argv[2]||'signum-gex-history';
(async()=>{
  const step=Math.floor(UNI.length/120)||1;
  const samp=UNI.filter((_,i)=>i%step===0).slice(0,120);
  const out={}; const pool=30; const q=[...samp];
  await Promise.all(Array.from({length:pool},async()=>{
    while(q.length){ const t=q.pop(); if(!t)break;
      try{ const r=await c.send(new QueryCommand({TableName:T,
        KeyConditionExpression:'ticker = :t',ExpressionAttributeValues:{':t':{S:t}},
        ScanIndexForward:false,Limit:1}));
        const it=(r.Items||[]).map(unmarshall)[0];
        out[t]= it? {d:new Date(it.timestamp||it.ts||Date.parse(it.date||'')).toISOString().slice(0,10), keys:Object.keys(it)} : null;
      }catch(e){ out[t]={err:e.name}; }
    }
  }));
  const cnt={}; let sampleKeys=null;
  for(const v of Object.values(out)){
    const k = !v? '없음' : v.err? ('ERR:'+v.err) : v.d;
    cnt[k]=(cnt[k]||0)+1;
    if(v&&v.keys&&!sampleKeys) sampleKeys=v.keys;
  }
  console.log(T+' — 표본 '+samp.length+'종목');
  for(const k of Object.keys(cnt).sort().reverse()) console.log('  '+k.padEnd(12)+cnt[k]);
  if(sampleKeys) console.log('  필드:',sampleKeys.join(','));
})();
