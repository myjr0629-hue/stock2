const{DynamoDBClient}=require('@aws-sdk/client-dynamodb');
const{DynamoDBDocumentClient,GetCommand,QueryCommand}=require('@aws-sdk/lib-dynamodb');
const fs=require('fs');
require('dotenv').config({path:'.env.local'});
const c=DynamoDBDocumentClient.from(new DynamoDBClient({region:'us-east-1',credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY}}),{marshallOptions:{removeUndefinedValues:true}});
const u=JSON.parse(fs.readFileSync('data/universe_500.json','utf-8')).symbols;
const F=['structure','analyst','fundamentals','earnings','sma','volatility','squeeze','institutional','related'];

async function main(){
  let mi=0, noFund=0, noScore=0, b=[0,0,0,0,0,0,0,0,0,0];
  for(let i=0;i<u.length;i+=25){
    const ba=u.slice(i,i+25);
    await Promise.all(ba.map(async t=>{
      try{
        const r=await c.send(new GetCommand({TableName:'signum-unified-cache',Key:{pk:t}}));
        if(!r.Item){mi++;return;}
        const d=r.Item.data;
        b[F.filter(f=>!!d?.[f]).length]++;
        if(!d?.fundamentals) noFund++;
        else if(d.fundamentals.score===undefined && d.fundamentals.grade!=='NO_DATA') noScore++;
      }catch{mi++;}
    }));
  }
  console.log('UNIVERSE: '+u.length+' | MISSING: '+mi+' | NO_FUND: '+noFund+' | NO_SCORE: '+noScore);
  for(let i=0;i<=9;i++) if(b[i]) process.stdout.write(i+'f:'+b[i]+' ');
  console.log();

  console.log('\n--- SAMPLE 10 ---');
  for(const t of['NVDA','AMD','TSLA','D','SPY','PLTR','META','BA','ARKG','NIO']){
    const r=await c.send(new GetCommand({TableName:'signum-unified-cache',Key:{pk:t}}));
    const f=r.Item?.data?.fundamentals;
    console.log(t.padEnd(6)+' s:'+String(f?.score).padEnd(5)+' g:'+String(f?.grade).padEnd(8)+' pe:'+String(f?.pe).padEnd(7)+' upd:'+r.Item?.updatedAt?.slice(11,19));
  }

  // Alpha + GEX + RLSI
  let aOK=0;
  const s30=['NVDA','AAPL','TSLA','MSFT','AMZN','GOOGL','META','AMD','D','BA','DIS','JPM','UNH','XOM','LLY','AVGO','PLTR','ARKG','NIO','HIMS','DIA','GLD','TLT','XLK','XLF','XLV','COST','WMT','CVX','SNAP'];
  for(const t of s30){try{const r=await c.send(new QueryCommand({TableName:'signum-alpha-history',KeyConditionExpression:'ticker=:t',ExpressionAttributeValues:{':t':t},ScanIndexForward:false,Limit:1}));if(r.Items?.length>0)aOK++;}catch{}}
  console.log('\nAlpha: '+aOK+'/'+s30.length);
  let gOK=0;
  for(const t of s30.slice(0,10)){try{const r=await c.send(new QueryCommand({TableName:'signum-gex-history',KeyConditionExpression:'ticker=:t',ExpressionAttributeValues:{':t':t},ScanIndexForward:false,Limit:1}));if(r.Items?.length>0)gOK++;}catch{}}
  console.log('GEX: '+gOK+'/10');
  try{const r=await c.send(new QueryCommand({TableName:'signum-rlsi-history',KeyConditionExpression:'pk=:pk',ExpressionAttributeValues:{':pk':'MARKET'},ScanIndexForward:false,Limit:1}));console.log('RLSI: '+r.Items?.[0]?.rlsi+' '+r.Items?.[0]?.regime);}catch{console.log('RLSI: ERR');}
}
main();
