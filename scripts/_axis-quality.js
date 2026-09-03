require('dotenv').config({path:require('path').join(__dirname,'..','.env.local'),quiet:true});
const {DynamoDBClient,QueryCommand}=require('@aws-sdk/client-dynamodb');
const {unmarshall}=require('@aws-sdk/util-dynamodb');
const c=new DynamoDBClient({region:'us-east-1',credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY}});
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[s.length>>1]:null};
const F=['pcr','totalCallOI','totalPutOI','whaleScore','dex','squeezeProbability','opi'];
async function all(t,days=30){let o=[],ek;do{const r=await c.send(new QueryCommand({TableName:'signum-flow-history',
 KeyConditionExpression:'ticker = :t AND #ts > :s',ExpressionAttributeNames:{'#ts':'timestamp'},
 ExpressionAttributeValues:{':t':{S:t},':s':{N:String(Date.now()-days*86400e3)}},
 ScanIndexForward:true,Limit:3000,ExclusiveStartKey:ek}));o=o.concat((r.Items||[]).map(unmarshall));ek=r.LastEvaluatedKey;}while(ek);return o;}
(async()=>{
 const TICK=['NVDA','RTX','GS','MRVL','TSM','WMT','AAPL','TER','CRWD','SPY'];
 const stat={}; F.forEach(f=>stat[f]={intraSpread:[],dayStep:[]});
 const dayVal={};   // f -> day -> {ticker:med}
 for(const t of TICK){
  const rows=await all(t); const byDay={};
  for(const x of rows){const d=new Date(x.timestamp).toISOString().slice(0,10);(byDay[d]=byDay[d]||[]).push(x);}
  for(const f of F){
    const seq=[];
    for(const d of Object.keys(byDay).sort()){
      const v=byDay[d].map(x=>x[f]).filter(x=>typeof x==='number'&&Number.isFinite(x));
      if(v.length<3) continue;
      const m=med(v); if(!(Math.abs(m)>0)) continue;
      // 하루 안 «범위»가 중앙값 대비 몇 %인가
      stat[f].intraSpread.push((Math.max(...v)-Math.min(...v))/Math.abs(m));
      seq.push([d,m]);
      (dayVal[f]=dayVal[f]||{}); (dayVal[f][d]=dayVal[f][d]||{})[t]=m;
    }
    for(let i=1;i<seq.length;i++){
      const a=seq[i-1][1],b=seq[i][1];
      if(Math.abs(a)>0) stat[f].dayStep.push(Math.abs(b-a)/Math.abs(a));
    }
  }
 }
 console.log('축 품질 (10종목 · 30일)');
 console.log('지표'.padEnd(20)+'하루안범위/중앙'.padStart(16)+'날짜간변화'.padStart(12)+'  하루안/날짜간'+'   동조율');
 for(const f of F){
   const i=med(stat[f].intraSpread), s=med(stat[f].dayStep);
   // 동조율: 같은 날 여러 종목이 «같은 방향으로» 움직인 비율
   let same=0,tot=0;
   const days=Object.keys(dayVal[f]||{}).sort();
   for(let k=1;k<days.length;k++){
     const prev=dayVal[f][days[k-1]], cur=dayVal[f][days[k]];
     const dirs=Object.keys(cur).filter(t=>prev[t]!==undefined).map(t=>Math.sign(cur[t]-prev[t])).filter(x=>x!==0);
     if(dirs.length>=4){ tot++; const up=dirs.filter(x=>x>0).length; if(up/dirs.length>=0.8||up/dirs.length<=0.2) same++; }
   }
   console.log(f.padEnd(20)+(i==null?'—':i.toFixed(2)).padStart(16)+(s==null?'—':s.toFixed(2)).padStart(12)
     +'  '+((i&&s)?(i/s).toFixed(1):'—').padStart(12)+'   '+(tot?Math.round(100*same/tot)+'%':'—'));
 }
 console.log('\n※ 하루안범위가 날짜간변화보다 크면 「그날의 값」이 존재하지 않는다(스냅샷 뽑기다).');
 console.log('※ 동조율이 높으면 종목 이야기가 아니라 시장 이야기다 — 개별 랭킹 근거가 못 된다.');
})();
