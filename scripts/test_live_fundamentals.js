// 작업 전/후 live/fundamentals 응답 비교 테스트
// Usage: node scripts/test_live_fundamentals.js [before|after]
const https=require('https');
const phase=process.argv[2]||'before';

const TICKERS=['NVDA','TSLA','META','AAPL','MSFT','AMD','BA','BABA','TMDX','ONON'];

function fetchApi(ticker){
  return new Promise((resolve)=>{
    const url='https://www.signumhq.com/api/live/fundamentals?t='+ticker;
    https.get(url,(res)=>{
      let d='';res.on('data',c=>d+=c);
      res.on('end',()=>{try{resolve(JSON.parse(d));}catch{resolve({error:'parse error'});}});
    }).on('error',e=>resolve({error:e.message}));
  });
}

async function main(){
  console.log('=== live/fundamentals '+phase.toUpperCase()+' @ '+new Date().toISOString()+' ===\n');
  for(const t of TICKERS){
    const r=await fetchApi(t);
    console.log(t.padEnd(6)+' score:'+r.score+' grade:'+r.grade+' pe:'+r.pe+' de:'+r.de+' roe:'+r.roe+' rev:'+r.revenueGrowth+' margin:'+r.netMargin+(r._cache?' cache:'+r._cache:''));
  }
}
main();
