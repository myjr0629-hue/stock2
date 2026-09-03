require('dotenv').config({path:require('path').join(__dirname,'..','.env.local'),quiet:true});
const {DynamoDBClient,QueryCommand}=require('@aws-sdk/client-dynamodb');
const {unmarshall}=require('@aws-sdk/util-dynamodb');
const c=new DynamoDBClient({region:'us-east-1',credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY}});
const MET=['pcr','totalCallOI','totalPutOI','whaleScore','dex','squeezeProbability','totalPremium','opi','smartMoneyScore','compositeScore'];
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[s.length>>1]:null};
(async()=>{
 const TICK=['RTX','GS','MRVL','TSM','NVDA','AAPL','WMT','TER'];
 const agg={}; MET.forEach(m=>agg[m]={intra:[],inter:[],miss:0,tot:0,vals:new Set()});
 for(const t of TICK){
  const r=await c.send(new QueryCommand({TableName:'signum-flow-history',
    KeyConditionExpression:'ticker = :t AND #ts > :s',
    ExpressionAttributeNames:{'#ts':'timestamp'},
    ExpressionAttributeValues:{':t':{S:t},':s':{N:String(Date.now()-30*86400e3)}},
    ScanIndexForward:true, Limit:3000}));
  const rows=(r.Items||[]).map(unmarshall);
  const byDay={};
  for(const x of rows){const d=new Date(x.timestamp).toISOString().slice(0,10);(byDay[d]=byDay[d]||[]).push(x);}
  for(const m of MET){
    const dayMed=[];
    for(const d of Object.keys(byDay).sort()){
      const v=byDay[d].map(x=>x[m]).filter(x=>typeof x==='number'&&Number.isFinite(x));
      agg[m].tot+=byDay[d].length; agg[m].miss+=byDay[d].length-v.length;
      v.forEach(x=>agg[m].vals.add(x));
      if(v.length<3) continue;
      const mm=med(v); if(!(Math.abs(mm)>0)) continue;
      // 하루 안 상대 산포 (MAD/중앙값)
      agg[m].intra.push(med(v.map(x=>Math.abs(x-mm)))/Math.abs(mm));
      dayMed.push(mm);
    }
    if(dayMed.length>=6){
      const mm=med(dayMed);
      if(Math.abs(mm)>0) agg[m].inter.push(med(dayMed.map(x=>Math.abs(x-mm)))/Math.abs(mm));
    }
  }
 }
 console.log('지표별 안정성 (8종목 · 30일)  — 하루안 산포가 날짜간 산포에 맞먹으면 「그날의 값」이 없다는 뜻');
 console.log('지표'.padEnd(20),'하루안'.padStart(8),'날짜간'.padStart(8),'비율'.padStart(7),'  결측%','  서로다른값');
 for(const m of MET){
   const a=agg[m]; const i=med(a.intra), e=med(a.inter);
   if(i===null||e===null){console.log(m.padEnd(20),'  자료부족');continue;}
   const ratio=e>0? i/e : Infinity;
   console.log(m.padEnd(20), i.toFixed(3).padStart(8), e.toFixed(3).padStart(8), ratio.toFixed(2).padStart(7),
     '  '+(100*a.miss/a.tot).toFixed(0)+'%', '   '+a.vals.size);
 }
})();
