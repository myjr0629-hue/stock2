const{DynamoDBClient}=require('@aws-sdk/client-dynamodb');
const{DynamoDBDocumentClient,GetCommand}=require('@aws-sdk/lib-dynamodb');
const fs=require('fs');
require('dotenv').config({path:'.env.local'});
const c=DynamoDBDocumentClient.from(new DynamoDBClient({region:'us-east-1',credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY}}),{marshallOptions:{removeUndefinedValues:true}});
const u=JSON.parse(fs.readFileSync('data/universe_500.json','utf-8')).symbols;

async function main(){
  let hasSMA=0, noSMA=0, noSMAList=[];
  for(let i=0;i<u.length;i+=25){
    const ba=u.slice(i,i+25);
    await Promise.all(ba.map(async t=>{
      try{
        const r=await c.send(new GetCommand({TableName:'signum-unified-cache',Key:{pk:t}}));
        const d=r.Item?.data;
        if(d?.sma) hasSMA++;
        else { noSMA++; noSMAList.push(t); }
      }catch{noSMA++;noSMAList.push(t);}
    }));
  }
  console.log('HAS SMA:'+hasSMA+' NO SMA:'+noSMA);
  // Check if these tickers exist in Polygon snapshot
  const https=require('https');
  const snap=await new Promise((res,rej)=>{https.get('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej);});
  const allTickers=new Set((snap?.tickers||[]).map(t=>t.ticker));
  let inSnap=0,notInSnap=0,notInSnapList=[];
  for(const t of noSMAList){
    if(allTickers.has(t)) inSnap++;
    else { notInSnap++; notInSnapList.push(t); }
  }
  console.log('No-SMA in Polygon snapshot:'+inSnap+' NOT in snapshot:'+notInSnap);
  if(notInSnapList.length>0) console.log('Not in snapshot:',notInSnapList.slice(0,20).join(','));
}
main();
