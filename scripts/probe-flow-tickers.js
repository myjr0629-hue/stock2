// ============================================================================
// probe-flow-tickers — 사이트맵 확장 후보 «실측» 검증
// ----------------------------------------------------------------------------
// 왜: sitemap.ts 주석이 "데이터가 확실한 티커만" 이라고 못박고 있다. 데이터 없는
// 페이지를 넣으면 소프트404가 되어 도메인 전체 평가를 깎는다. 그래서 후보를
// «전부 실제로 렌더해 보고» 통과한 것만 추린다.
//
// 판정(2026-08-22 실측):
//   진짜 티커  → <title> 에 "(divergence)" 포함 + 달러/퍼센트 값 3개 이상
//   가짜 티커  → "(divergence)" 없음, 값 0개, 본문 27KB 더 작음
//
// 사용: node scripts/probe-flow-tickers.js
// 출력: scripts/_flow-ticker-probe.json  (pass / fail 목록)
// ============================================================================
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.signumhq.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const CONCURRENCY = 6;

// 이미 사이트맵에 있는 167개 (중복 제외용)
const EXISTING = new Set(require('./_existing-tickers.json'));

// 후보 — 유동성 있고 옵션이 활발한 미국 종목/ETF 위주.
const CANDIDATES = [
  // S&P 대형주 (기존 목록에 없는 것)
  'MMM','CSX','DUK','SO','NEE','D','AEP','EXC','SRE','XEL','ED','PEG','WEC','ES',
  'VLO','MPC','PSX','EOG','DVN','HAL','BKR','KMI','WMB','OKE','TRGP','FANG','APA','HES',
  'ADP','PAYX','FIS','FISV','GPN','SPGI','MCO','ICE','CME','NDAQ','CBOE','MSCI',
  'TRV','ALL','PGR','CB','AIG','MET','PRU','AFL','HIG','L',
  'USB','PNC','TFC','FITB','KEY','RF','CFG','HBAN','MTB','ZION','ALLY','DFS','SYF',
  'BK','STT','NTRS','AMP','TROW','BEN','IVZ','RJF',
  'CI','HUM','CNC','ELV','MCK','COR','CAH','ZTS','BDX','SYK','BSX','EW','MDT','DXCM',
  'IDXX','A','WAT','MTD','RMD','ALGN','HOLX','BAX','ZBH','STE',
  'BIIB','INCY','ALNY','SRPT','NBIX','EXAS','ILMN','TECH','CRL',
  'ORLY','AZO','ROST','TJX','BURL','DG','DLTR','KR','SYY','ADM','TSN','HRL','K',
  'GIS','CAG','CPB','SJM','MKC','CLX','CHD','KMB','EL','COTY',
  'YUM','QSR','DPZ','WEN','PZZA','DRI','TXRH','WING','SHAK','CAKE',
  'MAR','HLT','H','WH','RCL','CCL','NCLH','LVS','WYNN','MGM','CZR','PENN',
  'DAL','UAL','AAL','LUV','ALK','JBLU','SAVE',
  'NSC','ODFL','CHRW','EXPD','XPO','SAIA','JBHT','LSTR',
  'EMR','ETN','PH','ROK','DOV','ITW','SWK','IR','CMI','PCAR','AME','FTV','XYL',
  'NOC','GD','LHX','TDG','HWM','TXT','LDOS','HII','AXON',
  'FCX','NEM','NUE','STLD','CLF','X','AA','MLM','VMC','SHW','PPG','DOW','LYB','DD',
  'ECL','APD','LIN','IFF','ALB','MOS','CF','FMC',
  'PLD','AMT','CCI','EQIX','DLR','SPG','O','PSA','WELL','VTR','AVB','EQR','ESS',
  'INVH','MAA','UDR','ARE','BXP','KIM','REG','HST','IRM','SBAC','WY',
  'CHTR','DISH','PARA','FOX','FOXA','NYT','NWSA','LYV','SIRI','EA','TTWO','MTCH','BMBL',
  'ZG','RDFN','OPEN','COMP','TREE','LC','SQ','XYZ','TOST','BILL','FOUR','WEX',
  'TEAM','WDAY','ADSK','ANSS','CDNS','SNPS','FTNT','ZS','OKTA','S','TENB','RPD','CYBR',
  'HUBS','ZI','DOCU','TWLO','SPLK','ESTC','CFLT','GTLB','PATH','AI','SOUN','BBAI',
  'IONQ','RGTI','QBTS','ASTS','RKLB','LUNR','SPCE','JOBY','ACHR','ARCH',
  'ENVX','FCEL','BE','RUN','NOVA','SEDG','ARRY','SHLS','BLDP','NKLA','RIDE',
  'XPEV','LI','BIDU','NTES','TCOM','BILI','IQ','TME','YMM','BEKE','ZTO','LU','FUTU','TIGR',
  'INFY','WIT','HDB','IBN','SHG','KB','MUFG','SMFG','SONY','TM','HMC','MELI','SE','GRAB',
  'SHEL','BP','TTE','E','EQNR','PBR','VALE','RIO','BHP','SCCO','GOLD','AEM','KGC','AU','HMY',
  // 인기 ETF (기존 목록에 없는 것)
  'VXX','UVXY','SVXY','VIXY','SPXL','SPXS','TNA','TZA','LABU','LABD','FAS','FAZ',
  'YINN','YANG','NUGT','DUST','JNUG','JDST','BOIL','KOLD','UNG','UCO','SCO',
  'XLI','XLP','XLU','XLY','XLB','XLRE','XLC','XBI','IBB','ITB','XHB','XRT','XOP','OIH',
  'KRE','KBE','IYR','VNQ','SCHD','VYM','DVY','JEPI','JEPQ','QYLD','RYLD','XYLD',
  'EEM','EFA','FXI','KWEB','MCHI','EWZ','EWJ','EWY','EWT','INDA','VWO','IEMG',
  'HYG','LQD','AGG','BND','IEF','SHY','TBT','TMF','TMV','TIP','MUB','EMB',
  'IVV','VUG','VTV','IJH','IJR','MDY','RSP','QQQM','SPLG','SCHG','VOOG',
  'IBIT','FBTC','GBTC','ETHE','BITO','BITX','ARKB','ARKW','ARKG','ARKQ','ARKF',
  'GDX','GDXJ','SIL','PPLT','PALL','COPX','LIT','REMX','URA','URNM','TAN','ICLN','PBW',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(t) {
  try {
    const res = await fetch(`${BASE}/en/flow/${t}`, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en' },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return { t, ok: false, why: `HTTP ${res.status}` };
    const h = await res.text();
    const title = (h.match(/<title>(.*?)<\/title>/s) || [, ''])[1];
    const hasDiv = title.includes('(divergence)');
    const vals = (h.match(/>\$[\d,]+(?:\.\d+)?<|>[\d.]+%</g) || []).length;
    const ok = hasDiv && vals >= 3;
    return { t, ok, why: ok ? `vals=${vals}` : `div=${hasDiv} vals=${vals}`, size: h.length };
  } catch (e) {
    return { t, ok: false, why: String(e.message || e).slice(0, 40) };
  }
}

(async () => {
  const list = CANDIDATES.filter((t) => !EXISTING.has(t));
  const uniq = [...new Set(list)];
  console.log(`후보 ${uniq.length}개 (기존 ${EXISTING.size}개 제외)\n`);

  const results = [];
  let i = 0;
  async function worker(id) {
    while (i < uniq.length) {
      const t = uniq[i++];
      const r = await probe(t);
      results.push(r);
      if (results.length % 25 === 0) {
        const p = results.filter((x) => x.ok).length;
        console.log(`  …${results.length}/${uniq.length}  통과 ${p}`);
      }
      await sleep(120);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, k) => worker(k)));

  const pass = results.filter((r) => r.ok).map((r) => r.t).sort();
  const fail = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(__dirname, '_flow-ticker-probe.json'),
    JSON.stringify({ pass, fail: fail.map((f) => ({ t: f.t, why: f.why })) }, null, 1));

  console.log(`\n=== 결과 ===`);
  console.log(`  통과 ${pass.length}개 / 탈락 ${fail.length}개`);
  console.log(`  탈락 사유 표본:`, fail.slice(0, 8).map((f) => `${f.t}(${f.why})`).join(' '));
  console.log(`\n통과 목록 → scripts/_flow-ticker-probe.json`);
})();
