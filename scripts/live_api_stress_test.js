// 4개 live/* API 스트레스 테스트 — 무작위 20종목
const https=require('https');

function fetchApi(path){
  return new Promise((resolve)=>{
    const url='https://www.signumhq.com'+path;
    https.get(url,(res)=>{
      let d='';res.on('data',c=>d+=c);
      res.on('end',()=>{try{resolve(JSON.parse(d));}catch{resolve({error:'parse'});}});
    }).on('error',e=>resolve({error:e.message}));
  });
}

// 유니버스 + 비유니버스 혼합 20종목
const TICKERS=['NVDA','TSLA','META','AAPL','AMD','BA','MSFT','GOOGL','AMZN','NFLX',
               'TMDX','ONON','BABA','ZM','RBLX','DOCS','WIX','BRZE','CAVA','BIRK'];

async function main(){
  console.log('=== LIVE API STRESS TEST @ '+new Date().toISOString()+' ===');
  console.log('Testing 20 tickers x 4 APIs = 80 API calls\n');
  
  let fundOk=0,fundFail=0,analOk=0,analFail=0,sqOk=0,sqFail=0,ovOk=0,ovFail=0;
  
  for(const t of TICKERS){
    const [f,a,s,o]=await Promise.all([
      fetchApi('/api/live/fundamentals?t='+t),
      fetchApi('/api/live/analyst?t='+t),
      fetchApi('/api/live/short-squeeze?t='+t),
      fetchApi('/api/live/overview?t='+t+'&lang=ko'),
    ]);
    
    const fOk=!f.error&&(f.score!==undefined||f.grade);
    const aOk=!a.error&&a.consensus!==undefined;
    const sOk=!s.error&&s.status!==undefined;
    const oOk=!o.error&&o.overview;
    
    if(fOk)fundOk++;else fundFail++;
    if(aOk)analOk++;else analFail++;
    if(sOk)sqOk++;else sqFail++;
    if(oOk)ovOk++;else ovFail++;
    
    const icon=fOk&&aOk&&sOk&&oOk?'✅':'⚠️';
    console.log(icon+' '+t.padEnd(6)+' fund:'+(fOk?f.score+'/'+f.grade:'FAIL')+' anal:'+(aOk?a.consensus:'FAIL')+' sq:'+(sOk?s.status:'FAIL')+' ov:'+(oOk?'OK':'FAIL'));
  }
  
  console.log('\n--- SUMMARY ---');
  console.log('fundamentals: '+fundOk+'/20 OK, '+fundFail+' FAIL');
  console.log('analyst:      '+analOk+'/20 OK, '+analFail+' FAIL');
  console.log('squeeze:      '+sqOk+'/20 OK, '+sqFail+' FAIL');
  console.log('overview:     '+ovOk+'/20 OK, '+ovFail+' FAIL');
  console.log('\nTOTAL: '+(fundOk+analOk+sqOk+ovOk)+'/80 OK');
}
main();
