require('dotenv').config({path:require('path').join(__dirname,'..','.env.local'),quiet:true});
const {DynamoDBClient,QueryCommand}=require('@aws-sdk/client-dynamodb');
const {unmarshall}=require('@aws-sdk/util-dynamodb');
const c=new DynamoDBClient({region:'us-east-1',credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY}});
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[s.length>>1]:null};
async function all(t,days=30){let o=[],ek;do{const r=await c.send(new QueryCommand({TableName:'signum-flow-history',
 KeyConditionExpression:'ticker = :t AND #ts > :s',ExpressionAttributeNames:{'#ts':'timestamp'},
 ExpressionAttributeValues:{':t':{S:t},':s':{N:String(Date.now()-days*86400e3)}},
 ScanIndexForward:true,Limit:3000,ExclusiveStartKey:ek}));o=o.concat((r.Items||[]).map(unmarshall));ek=r.LastEvaluatedKey;}while(ek);return o;}
(async()=>{
 console.log('스냅샷 선택이 값을 얼마나 바꾸나 — 최근 6일 · squeezeProbability');
 for(const t of ['RTX','GS','MRVL','TSM']){
  const rows=await all(t); const byDay={};
  for(const x of rows){const d=new Date(x.timestamp).toISOString().slice(0,10);(byDay[d]=byDay[d]||[]).push(x);}
  const days=Object.keys(byDay).sort().slice(-6);
  console.log('\n'+t);
  for(const d of days){
    const rs=byDay[d];
    const oiOf=x=>(x.totalCallOI||0)+(x.totalPutOI||0);
    const withV=rs.filter(x=>typeof x.squeezeProbability==='number');
    if(!withV.length){console.log('  '+d+'  값없음');continue;}
    // 현재 규칙: 그날 총 OI 가 가장 큰 스냅샷
    const maxOI=rs.reduce((a,b)=>oiOf(b)>oiOf(a)?b:a);
    const vals=withV.map(x=>x.squeezeProbability);
    console.log('  '+d+'  최대OI스냅샷='+String(maxOI.squeezeProbability).padStart(4)
      +'  그날중앙값='+String(med(vals)).padStart(4)
      +'  범위='+Math.min(...vals)+'~'+Math.max(...vals)
      +'  n='+vals.length);
  }
 }
})();
