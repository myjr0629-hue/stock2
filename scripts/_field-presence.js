require('dotenv').config({path:require('path').join(__dirname,'..','.env.local'),quiet:true});
const {DynamoDBClient,QueryCommand}=require('@aws-sdk/client-dynamodb');
const {unmarshall}=require('@aws-sdk/util-dynamodb');
const c=new DynamoDBClient({region:'us-east-1',credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY}});
const F=['pcr','totalCallOI','totalPutOI','whaleScore','dex','squeezeProbability','totalPremium','opi','ivSkew'];
async function all(t,days=30){
  let out=[],ek;
  do{
    const r=await c.send(new QueryCommand({TableName:'signum-flow-history',
      KeyConditionExpression:'ticker = :t AND #ts > :s',
      ExpressionAttributeNames:{'#ts':'timestamp'},
      ExpressionAttributeValues:{':t':{S:t},':s':{N:String(Date.now()-days*86400e3)}},
      ScanIndexForward:true, Limit:3000, ExclusiveStartKey:ek}));
    out=out.concat((r.Items||[]).map(unmarshall)); ek=r.LastEvaluatedKey;
  }while(ek);
  return out;
}
(async()=>{
 for(const t of ['NVDA','RTX','GS','SPY','WMT']){
  const rows=await all(t);
  const cut=Date.now()-7*86400e3;
  const recent=rows.filter(x=>x.timestamp>cut);
  const lastTs=rows.length? new Date(rows[rows.length-1].timestamp).toISOString().slice(0,10):'—';
  console.log(`\n${t}  전체 ${rows.length}행 · 최근7일 ${recent.length}행 · 마지막행 ${lastTs}`);
  for(const f of F){
    const rec=recent.filter(x=>typeof x[f]==='number').length;
    const lr=[...rows].reverse().find(x=>typeof x[f]==='number');
    const last=lr? new Date(lr.timestamp).toISOString().slice(0,10):'—';
    // 일자 커버리지: 값이 있는 서로 다른 날 수
    const days=new Set(rows.filter(x=>typeof x[f]==='number').map(x=>new Date(x.timestamp).toISOString().slice(0,10)));
    console.log(`  ${f.padEnd(20)} 최근7일 ${String(rec).padStart(4)}/${recent.length}  값있는날 ${String(days.size).padStart(2)}일  마지막 ${last}`);
  }
 }
})();
