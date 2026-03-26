const{DynamoDBClient}=require('@aws-sdk/client-dynamodb');
const{DynamoDBDocumentClient,GetCommand}=require('@aws-sdk/lib-dynamodb');
const fs=require('fs');
require('dotenv').config({path:'.env.local'});
const c=DynamoDBDocumentClient.from(new DynamoDBClient({region:'us-east-1',credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY}}),{marshallOptions:{removeUndefinedValues:true}});
const u=JSON.parse(fs.readFileSync('data/universe_500.json','utf-8')).symbols;
const F=['structure','analyst','fundamentals','earnings','sma','volatility','squeeze','institutional','related'];

async function main(){
  const groups = {5:[], 6:[], 7:[]};
  for(let i=0;i<u.length;i+=25){
    const ba=u.slice(i,i+25);
    await Promise.all(ba.map(async t=>{
      try{
        const r=await c.send(new GetCommand({TableName:'signum-unified-cache',Key:{pk:t}}));
        if(!r.Item) return;
        const d=r.Item.data;
        const has=F.filter(f=>!!d?.[f]);
        const miss=F.filter(f=>!d?.[f]);
        if(has.length<=7) {
          const g = Math.min(has.length, 7);
          if(groups[g]) groups[g].push(t+' ('+miss.join(',')+')');
        }
      }catch{}
    }));
  }
  console.log('=== 5f ('+groups[5].length+'개) ===');
  groups[5].forEach(x=>console.log('  '+x));
  console.log('\n=== 6f ('+groups[6].length+'개) ===');
  groups[6].forEach(x=>console.log('  '+x));
  console.log('\n=== 7f ('+groups[7].length+'개) ===');
  groups[7].forEach(x=>console.log('  '+x));
}
main();
