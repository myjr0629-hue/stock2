const{DynamoDBClient}=require('@aws-sdk/client-dynamodb');
const{DynamoDBDocumentClient,GetCommand}=require('@aws-sdk/lib-dynamodb');
const fs=require('fs');
require('dotenv').config({path:'.env.local'});
const c=DynamoDBDocumentClient.from(new DynamoDBClient({region:'us-east-1',credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY}}),{marshallOptions:{removeUndefinedValues:true}});
const u=JSON.parse(fs.readFileSync('data/universe_500.json','utf-8')).symbols;
const F=['structure','analyst','fundamentals','earnings','sma','volatility','squeeze','institutional','related'];

async function main(){
  const incomplete = [];
  for(let i=0;i<u.length;i+=25){
    const ba=u.slice(i,i+25);
    await Promise.all(ba.map(async t=>{
      try{
        const r=await c.send(new GetCommand({TableName:'signum-unified-cache',Key:{pk:t}}));
        if(!r.Item) { incomplete.push({t, count:0, missing:'ALL'}); return; }
        const d=r.Item.data;
        const has=F.filter(f=>!!d?.[f]);
        const miss=F.filter(f=>!d?.[f]);
        if(has.length<9) incomplete.push({t, count:has.length, missing:miss.join(',')});
      }catch{ incomplete.push({t, count:0, missing:'ERROR'}); }
    }));
  }
  // Sort by field count
  incomplete.sort((a,b)=>a.count-b.count);
  console.log('9/9 아닌 종목: '+incomplete.length+'개\n');
  for(const x of incomplete){
    console.log(x.t.padEnd(6)+' '+x.count+'/9  missing: '+x.missing);
  }
}
main();
