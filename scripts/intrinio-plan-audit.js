#!/usr/bin/env node
/**
 * Intrinio 플랜 전수 감사 — «쓸 수 있는데 안 쓰는 것»을 찾는다.
 *
 * 왜: $333/월을 내고 있는데 실제로 부르는 것은 17종이었다. 플랜에 포함된
 *     것을 안 쓰면 그냥 버리는 돈이고, 반대로 «없다»고 생각한 기능이
 *     사실 있을 수도 있다(다크풀·8-K·국채 세 번 다 그랬다).
 *
 * 규칙: **엔드포인트당 정확히 1회만** 호출한다. 종목별 반복 금지.
 *       이건 데이터 수집이 아니라 «권한 확인»이다.
 *
 * 판정: 200 이라고 다 쓸 수 있는 것이 아니다. 반드시 내용을 열어 볼 것.
 *       실측 반례 — `/options/aggregates` 는 200 이지만 파라미터를 전부
 *       무시하고 항상 `ZZZ / 2025-07-01`(테스트 티커)을 준다. 데모 응답이다.
 *
 * 실행: node scripts/ec2-ssm.js --file scripts/intrinio-plan-audit.js \
 *         /opt/signum-ws/intrinio-plan-audit.js
 *       node scripts/ec2-ssm.js "cd /opt/signum-ws && node intrinio-plan-audit.js"
 *
 * 2026-08-31 결과: 64종 조사 · 200:33 · 권한없음:18 · 404:11 · 400:2
 */
const fs=require("fs"), https=require("https");
const ENV="/opt/signum-ws/.env";
if(fs.existsSync(ENV)) for(const l of fs.readFileSync(ENV,"utf8").split("\n")){
  const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if(m&&!process.env[m[1]]) process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");
}
const KEY=process.env.INTRINIO_API_KEY;
if(!KEY){console.error("키 없음");process.exit(1);}
const BASE="https://api-v2.intrinio.com";

// 우리가 이미 쓰는 것 (표시용)
const USED=new Set([
 "/securities/snapshots","/securities/AAPL/prices","/securities/AAPL/prices/realtime",
 "/securities/AAPL/prices/intervals","/securities/AAPL/prices/adjustments",
 "/securities/AAPL/prices/technicals/rsi","/securities/AAPL/institutional_ownership",
 "/companies/AAPL","/companies/AAPL/filings","/companies/AAPL/fundamentals",
 "/companies/AAPL/insider_transaction_filings","/companies/AAPL/data_point/marketcap/number",
 "/options/expirations/AAPL/eod","/indices/economic/$DGS10/historical_data/level",
 "/bulk_downloads/links",
]);

const EP=[
 // ── 증권/시세 ──
 ["시세","/securities/AAPL/quote"],
 ["시세","/securities/AAPL/intraday_prices"],
 ["시세","/securities/AAPL/prices/realtime"],
 ["시세","/securities/AAPL/data_point/close_price/number"],
 ["시세","/securities/AAPL/historical_data/close_price"],
 ["시세","/securities/AAPL/dividends"],
 ["시세","/securities/AAPL/replay_file"],
 ["시세","/securities/screen"],
 ["시세","/securities/search"],
 ["시세","/stock_exchanges"],
 ["시세","/stock_exchanges/USCOMP/prices"],
 // ── 기술지표 (우리는 rsi 만) ──
 ["기술지표","/securities/AAPL/prices/technicals/adx"],
 ["기술지표","/securities/AAPL/prices/technicals/atr"],
 ["기술지표","/securities/AAPL/prices/technicals/obv"],
 ["기술지표","/securities/AAPL/prices/technicals/bb"],
 ["기술지표","/securities/AAPL/prices/technicals/macd"],
 ["기술지표","/securities/AAPL/prices/technicals/mfi"],
 ["기술지표","/securities/AAPL/prices/technicals/cci"],
 ["기술지표","/securities/AAPL/prices/technicals/stoch"],
 ["기술지표","/securities/AAPL/prices/technicals/vwap"],
 ["기술지표","/securities/AAPL/prices/technicals/adi"],
 ["기술지표","/securities/AAPL/prices/technicals/eom"],
 ["기술지표","/securities/AAPL/prices/technicals/kc"],
 ["기술지표","/securities/AAPL/prices/technicals/dc"],
 // ── 옵션 ──
 ["옵션","/options/tickers"],
 ["옵션","/options/unusual_activity/AAPL"],
 ["옵션","/options/aggregates"],
 ["옵션","/options/snapshots"],
 ["옵션","/options/AAPL/prices/realtime"],
 ["옵션","/options/interval_movement"],
 ["옵션","/options/expirations/AAPL"],
 // ── 회사/재무 ──
 ["재무","/companies/AAPL/news"],
 ["재무","/companies/AAPL/historical_data/totalrevenue"],
 ["재무","/companies/AAPL/institutional_holdings"],
 ["재무","/companies/AAPL/answers"],
 ["재무","/companies/AAPL/shares_outstanding"],
 ["재무","/companies/search"],
 ["재무","/companies/recognize"],
 ["재무","/fundamentals/lookup/AAPL/income_statement/2025/Q1"],
 // ── Zacks (애널리스트) ──
 ["Zacks","/zacks/analyst_ratings"],
 ["Zacks","/zacks/eps_estimates"],
 ["Zacks","/zacks/sales_estimates"],
 ["Zacks","/zacks/eps_growth_rates"],
 ["Zacks","/zacks/target_price_consensuses"],
 ["Zacks","/zacks/long_term_growth_rates"],
 ["Zacks","/zacks/institutional_holdings"],
 ["Zacks","/zacks/etf_holdings"],
 ["Zacks","/securities/AAPL/zacks/analyst_ratings"],
 ["Zacks","/securities/AAPL/zacks/eps_surprises"],
 // ── 공시/뉴스 ──
 ["공시","/filings"],
 ["공시","/news"],
 ["공시","/insider_transaction_filings"],
 ["공시","/owners"],
 // ── 지수/경제 ──
 ["지수/경제","/indices/stock_market"],
 ["지수/경제","/indices/economic"],
 ["지수/경제","/indices/sic"],
 ["지수/경제","/indices/stock_market/$DJI/historical_data/level"],
 // ── 기타 자산 ──
 ["기타자산","/forex/pairs"],
 ["기타자산","/forex/prices/EURUSD/D1"],
 ["기타자산","/crypto/prices"],
 ["기타자산","/crypto/snapshot"],
 ["기타자산","/market_status/realtime"],
 // ── ESG/기타 ──
 ["기타","/esg/companies"],
 ["기타","/municipalities"],
];

const get=(p)=>new Promise(res=>{
  const u=`${BASE}${p}${p.includes("?")?"&":"?"}page_size=1&api_key=${KEY}`;
  const t=setTimeout(()=>res({s:0,n:0,note:"timeout"}),15000);
  https.get(u,r=>{let b="";r.on("data",c=>b+=c);r.on("end",()=>{clearTimeout(t);
    let n=0,note="";
    try{const j=JSON.parse(b);
      for(const k of Object.keys(j)){ if(Array.isArray(j[k])){n=j[k].length;break;} }
      if(n===0&&typeof j==="object"&&Object.keys(j).length>2) n=-1; // 객체 응답
      if(j.error||j.message) note=String(j.message||j.error).slice(0,60);
    }catch{ note=b.slice(0,50); }
    res({s:r.statusCode,n,note});});
  }).on("error",e=>{clearTimeout(t);res({s:0,n:0,note:e.code||"err"})});
});

(async()=>{
  const rows=[];
  for(const [fam,p] of EP){
    const r=await get(p);
    rows.push({fam,p,...r, used:USED.has(p)});
    await new Promise(z=>setTimeout(z,150));
  }
  const ok=rows.filter(r=>r.s===200);
  const denied=rows.filter(r=>r.s===401||r.s===403);
  const missing=rows.filter(r=>r.s===404);
  const other=rows.filter(r=>![200,401,403,404].includes(r.s));

  console.log(`\n조사 ${rows.length}종 · 200 ${ok.length} · 권한없음 ${denied.length} · 404 ${missing.length} · 기타 ${other.length}\n`);
  console.log("═══ ✅ 쓸 수 있는데 안 쓰는 것 ═══");
  let last="";
  for(const r of ok.filter(r=>!r.used)){
    if(r.fam!==last){console.log(`\n[${r.fam}]`);last=r.fam;}
    const d = r.n===-1?"객체":(r.n>0?`${r.n}건`:"빈 결과");
    console.log(`  ${d.padEnd(6)} ${r.p}`);
  }
  console.log("\n═══ ⛔ 플랜 밖 (401/403) ═══");
  for(const r of denied) console.log(`  ${r.s} ${r.p}  ${r.note}`);
  if(missing.length){console.log("\n═══ 404 (경로 없음/이름 다름) ═══");
    for(const r of missing) console.log(`  ${r.p}`);}
  if(other.length){console.log("\n═══ 기타 ═══");
    for(const r of other) console.log(`  ${r.s} ${r.p} ${r.note}`);}
})();
