const{DynamoDBClient}=require('@aws-sdk/client-dynamodb');
const{DynamoDBDocumentClient,GetCommand}=require('@aws-sdk/lib-dynamodb');
require('dotenv').config({path:'.env.local'});
const c=DynamoDBDocumentClient.from(new DynamoDBClient({region:'us-east-1',credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY}}),{marshallOptions:{removeUndefinedValues:true}});
const F=['structure','analyst','fundamentals','earnings','sma','volatility','squeeze','institutional','related'];

async function chk(t){
  const r=await c.send(new GetCommand({TableName:'signum-unified-cache',Key:{pk:t}}));
  if(!r.Item) { console.log(t+': NOT FOUND'); return; }
  const d=r.Item.data;
  const has=F.filter(f=>!!d?.[f]);
  const miss=F.filter(f=>!d?.[f]);
  const f=d?.fundamentals;
  console.log(t+': '+has.length+'/9');
  console.log('  upd: '+r.Item.updatedAt?.slice(0,19));
  console.log('  miss: '+(miss.length>0?miss.join(', '):'NONE'));
  console.log('  score:'+f?.score+' grade:'+f?.grade+' pe:'+f?.pe);
  console.log('');
}

async function main(){
  console.log('=== Cold-Start Check @ '+new Date().toISOString()+' ===\n');
  for(const t of ['TMDX','ONON','BABA','RBLX','SHOP','NVDA','TSLA','META']){
    await chk(t);
  }
}
main();
