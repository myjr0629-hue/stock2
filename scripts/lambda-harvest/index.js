
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, BatchWriteCommand, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const https = require('https');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

function httpsGet(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs || 15000);
    https.get(url, { headers: { 'User-Agent': 'SIGNUM-HQ/7.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { clearTimeout(to); try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on('error', (e) => { clearTimeout(to); reject(e); });
  });
}

const POLYGON_KEY = process.env.POLYGON_API_KEY || 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';
const FMP_KEY = process.env.FMP_API_KEY || '';
const UNIVERSE = ["AAPL","ABBV","ABNB","ABT","ACN","ADBE","ADI","ADP","AEP","AFRM","AI","AMAT","AMD","AMGN","AMZN","ANET","ANSS","APD","ARE","ARM","ASML","ASTS","AVGO","AWK","AXP","BA","BAC","BBY","BIIB","BKNG","BLK","BMY","BSX","C","CARR","CAT","CCI","CCJ","CDNS","CEG","CF","CHTR","CL","CMCSA","COIN","COP","COST","CPRT","CRM","CRWD","CTAS","CTSH","CVS","CVX","D","DASH","DD","DDOG","DE","DELL","DHR","DIS","DKNG","DLR","DOV","DOW","DPZ","DUK","DVN","DXCM","EA","EBAY","ECL","EL","EMR","ENPH","EOG","EQIX","EQR","ETN","FAST","FCX","FDX","FSLR","FTNT","FTV","GD","GE","GEV","GILD","GIS","GM","GOOGL","GRMN","GS","HAL","HCA","HD","HON","HOOD","HSIC","HSY","HUBS","HUM","IBM","ICE","IDXX","IFF","ILMN","INCY","INTC","IONQ","IP","IQV","IR","ISRG","IT","ITW","JNJ","JPM","KDP","KEY","KHC","KLAC","KMB","KO","KR","KTOS","LDOS","LIN","LLY","LMT","LOW","LRCX","LULU","LUNR","LVS","LYB","LYV","MA","MAR","MARA","MBLY","MCD","MCHP","MCO","MDB","MDLZ","MDT","MELI","MET","META","MGM","MNST","MO","MPC","MPWR","MRK","MRNA","MRVL","MS","MSCI","MSFT","MSI","MSTR","MTB","MTD","MU","NDAQ","NDSN","NEE","NEM","NET","NFLX","NKE","NOC","NOW","NSC","NTRS","NUE","NVDA","NVO","O","ODFL","OKTA","ON","ORCL","ORLY","OTIS","OXY","PANW","PARA","PATH","PAYX","PCAR","PCG","PEAK","PEG","PEP","PFE","PG","PHM","PL","PLD","PLTR","PM","PNC","PONY","POOL","PPG","PSA","PSX","PTC","PWR","PYPL","QCOM","REGN","RIOT","RIVN","RKLB","ROK","ROKU","ROP","ROST","RSG","RTX","S","SBAC","SBUX","SCHW","SE","SEDG","SERV","SHOP","SHW","SLB","SMCI","SMR","SNA","SNOW","SNPS","SO","SOFI","SPG","SQ","SRE","STE","STT","STX","STZ","SWK","SWKS","SYK","SYM","SYY","T","TDG","TEAM","TEL","TER","TFC","TJX","TMO","TMUS","TRGP","TROW","TRV","TSLA","TSM","TT","TTWO","TWLO","TXN","TYL","UBER","UNH","UNP","UPS","UPST","URI","USB","V","VFC","VICI","VKTX","VLO","VMC","VRSK","VRTX","VST","VTR","VTRS","VZ","WDAY","WELL","WFC","WMT","XOM","XYZ","ZS"];
const UNIVERSE_500 = ["AAPL","ABBV","ABNB","ABT","ACN","ADBE","ADI","ADP","AEP","AFRM","AI","AMAT","AMD","AMGN","AMZN","ANET","ANSS","APD","ARE","ARM","ASML","ASTS","AVGO","AWK","AXP","BA","BAC","BBY","BIIB","BKNG","BLK","BMY","BSX","C","CARR","CAT","CCI","CCJ","CDNS","CEG","CF","CHTR","CL","CMCSA","COIN","COP","COST","CPRT","CRM","CRWD","CTAS","CTSH","CVS","CVX","D","DASH","DD","DDOG","DE","DELL","DHR","DIS","DKNG","DLR","DOV","DOW","DPZ","DUK","DVN","DXCM","EA","EBAY","ECL","EL","EMR","ENPH","EOG","EQIX","EQR","ETN","FAST","FCX","FDX","FSLR","FTNT","FTV","GD","GE","GEV","GILD","GIS","GM","GOOGL","GRMN","GS","HAL","HCA","HD","HON","HOOD","HSIC","HSY","HUBS","HUM","IBM","ICE","IDXX","IFF","ILMN","INCY","INTC","IONQ","IP","IQV","IR","ISRG","IT","ITW","JNJ","JPM","KDP","KEY","KHC","KLAC","KMB","KO","KR","KTOS","LDOS","LIN","LLY","LMT","LOW","LRCX","LULU","LUNR","LVS","LYB","LYV","MA","MAR","MARA","MBLY","MCD","MCHP","MCO","MDB","MDLZ","MDT","MELI","MET","META","MGM","MNST","MO","MPC","MPWR","MRK","MRNA","MRVL","MS","MSCI","MSFT","MSI","MSTR","MTB","MTD","MU","NDAQ","NDSN","NEE","NEM","NET","NFLX","NKE","NOC","NOW","NSC","NTRS","NUE","NVDA","NVO","O","ODFL","OKTA","ON","ORCL","ORLY","OTIS","OXY","PANW","PARA","PATH","PAYX","PCAR","PCG","PEAK","PEG","PEP","PFE","PG","PHM","PL","PLD","PLTR","PM","PNC","PONY","POOL","PPG","PSA","PSX","PTC","PWR","PYPL","QCOM","REGN","RIOT","RIVN","RKLB","ROK","ROKU","ROP","ROST","RSG","RTX","S","SBAC","SBUX","SCHW","SE","SEDG","SERV","SHOP","SHW","SLB","SMCI","SMR","SNA","SNOW","SNPS","SO","SOFI","SPG","SQ","SRE","STE","STT","STX","STZ","SWK","SWKS","SYK","SYM","SYY","T","TDG","TEAM","TEL","TER","TFC","TJX","TMO","TMUS","TRGP","TROW","TRV","TSLA","TSM","TT","TTWO","TWLO","TXN","TYL","UBER","UNH","UNP","UPS","UPST","URI","USB","V","VFC","VICI","VKTX","VLO","VMC","VRSK","VRTX","VST","VTR","VTRS","VZ","WDAY","WELL","WFC","WMT","XOM","XYZ","ZS","AAL","ACHR","AFL","AIG","AKAM","ALB","ALGN","ALL","ALLY","AMPH","APA","APH","APO","APTV","ARKG","AWR","AZN","AZO","BALL","BDX","BEN","BG","BILL","BIO","BK","BR","BRK.B","BURL","BWA","BYND","CB","CELH","CHWY","CI","CINF","CIVI","CLF","CLX","CME","CMG","CMI","CNC","CNP","COF","COHR","CPNG","CR","CRL","CSCO","CSX","CTRA","CTVA","DAL","DECK","DFS","DG","DLTR","DOC","DOCU","DRI","DT","DUOL","DVA","EFX","EIX","ELV","EMN","ENTG","EPAM","EQT","ES","ESS","ESTC","ETSY","EVR","EXPE","F","FANG","FE","FI","FICO","FIS","FIVE","FLT","FMC","FOX","FROG","FRT","FUBO","GAP","GEN","GLOB","GLW","GNRC","GPC","GOOG","GPS","GWW","HAS","HIG","HIMS","HLT","HPE","HPQ","HRL","HSBC","HST","HUBB","HWM","HXL","IAC","IEX","IOVA","IPG","IRM","IVZ","J","JBHT","JCI","JKHY","KEYS","KIM","KMI","KMX","KNX","KVUE","L","LBRDA","LH","LI","LKQ","LSCC","LYFT","LZB","MAA","MANH","MAS","MASI","MKTX","MLM","MMC","MMM","MOH","MPLN","MRO","MTN","MTTR","NCLH","NIO","NTNX","NTRA","NUAN","NVR","NWL","NWS","OC","OLED","OMC","OPEN","ORI","OSK","OTEX","OVV","PAYC","PEN","PINS","PNR","PNW","PODD","PSTG","PVH","RBLX","RCL","RE","RFP","RGLD","RHI","RL","RMD","RPM","RVTY","SAIA","SCI","SEB","SFM","SGEN","SIRI","SIVB","SKX","SNAP","SSNC","STLD","SWAV","SWN","TAP","TECK","TFX","TGT","TPR","SPY","QQQ","IWM","DIA","XLF","XLE","XLK","XLV","GLD","TLT"];
const GEX_TICKERS = ["AAPL","MSFT","AMZN","NVDA","GOOGL","META","TSLA","AMD","AVGO","PLTR","SMCI","ARM","COIN","AI","MRVL","MU","TSM","ASML","SERV","PL","TER","SYM","RKLB","ISRG","CEG","VST","GEV","PWR","CCJ","SMR","ETN","LLY","NVO","VRTX","REGN","VKTX","AMGN","GILD","CRWD","PANW","FTNT","ZS","S","OKTA","NET","LMT","RTX","AXON","KTOS","LDOS","ASTS","LUNR","SNOW","IONQ","DELL","PATH","TWLO","XYZ","PYPL","SOFI","AFRM","HOOD","UPST","CRM","NOW","DDOG","WDAY","MDB","TEAM","HUBS","JPM","BAC","GS","WFC","V","MA","XOM","CVX","UNH","JNJ","MRK","HD","COST","WMT","DIS","NFLX","BA","CAT","GE","MSTR","MARA","RIOT","SPY","QQQ","IWM","UBER","ABNB","SHOP","BABA"];
const DETAIL_TICKERS = ["AAPL","MSFT","AMZN","NVDA","GOOGL","META","TSLA","AMD","AVGO","PLTR","SMCI","ARM","COIN","AI","MRVL","MU","TSM","ASML","SERV","PL","TER","SYM","RKLB","ISRG","CEG","VST","GEV","PWR","CCJ","SMR","ETN","LLY","NVO","VRTX","REGN","VKTX","AMGN","GILD","CRWD","PANW","FTNT","ZS","S","OKTA","NET","LMT","RTX","AXON","KTOS","LDOS","ASTS","LUNR","SNOW","IONQ","DELL","PATH","TWLO","XYZ","PYPL","SOFI","AFRM","HOOD","UPST","CRM","NOW","DDOG","WDAY","MDB","TEAM","HUBS","JPM","BAC","GS","WFC","V","MA","XOM","CVX","UNH","JNJ","MRK","HD","COST","WMT","DIS","NFLX","BA","CAT","GE","MSTR","MARA","RIOT","SPY","QQQ","IWM","UBER","ABNB","SHOP","BABA"];

async function getAllOptions(ticker) {
  let allResults = [];
  let url = 'https://api.polygon.io/v3/snapshot/options/' + ticker + '?limit=250&apiKey=' + POLYGON_KEY;
  let pages = 0;
  while (url && pages < 20) {
    const data = await httpsGet(url);
    if (data && data.results) allResults = allResults.concat(data.results);
    url = data && data.next_url ? data.next_url + '&apiKey=' + POLYGON_KEY : null;
    pages++;
  }
  return allResults;
}

async function batchWrite(tableName, items) {
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25);
    try {
      await client.send(new BatchWriteCommand({
        RequestItems: { [tableName]: batch.map(item => ({ PutRequest: { Item: item } })) }
      }));
    } catch (e) {
      for (const item of batch) {
        await client.send(new PutCommand({ TableName: tableName, Item: item })).catch(() => {});
      }
    }
  }
}

// ====== RLSI Self-Calculation ======
function computeRSI(closes, period) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) { const d = closes[i]-closes[i-1]; if(d>0) gains+=d; else losses-=d; }
  let ag = gains/period, al = losses/period;
  for (let i = period+1; i < closes.length; i++) { const d = closes[i]-closes[i-1]; ag=(ag*(period-1)+(d>0?d:0))/period; al=(al*(period-1)+(d<0?-d:0))/period; }
  if (al === 0) return 100;
  return 100 - (100 / (1 + ag / al));
}

async function computeRlsi() {
  console.log('RLSI self-calculation...');
  try {
    const today = new Date().toISOString().slice(0,10);
    const ago = new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
    const [spyAgg, iwmAgg, vixSnap] = await Promise.all([
      httpsGet('https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/'+ago+'/'+today+'?adjusted=true&sort=asc&limit=30&apiKey='+POLYGON_KEY),
      httpsGet('https://api.polygon.io/v2/aggs/ticker/IWM/range/1/day/'+ago+'/'+today+'?adjusted=true&sort=asc&limit=30&apiKey='+POLYGON_KEY),
      httpsGet('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/VIX?apiKey='+POLYGON_KEY).catch(()=>null),
    ]);
    const sc = (spyAgg.results||[]).map(r=>r.c);
    const ic = (iwmAgg.results||[]).map(r=>r.c);
    const rsi = computeRSI(sc, 14);
    const mom = Math.round((rsi/100)*25);
    const s5 = sc.length>=5 ? (sc[sc.length-1]/sc[sc.length-6]-1)*100 : 0;
    const i5 = ic.length>=5 ? (ic[ic.length-1]/ic[ic.length-6]-1)*100 : 0;
    const part = Math.max(0, Math.min(25, Math.round(12.5+(i5-s5)*2.5)));
    const sma20 = sc.length>=20 ? sc.slice(-20).reduce((a,b)=>a+b,0)/20 : 0;
    const cur = sc[sc.length-1]||0;
    const trend = Math.max(0, Math.min(25, Math.round(12.5+((cur-sma20)/sma20)*100*5)));
    let vix = 20; try { const vd = vixSnap?.ticker; vix = vd?.lastTrade?.p || vd?.day?.c || 20; } catch {}
    const sent = Math.max(0, Math.min(25, Math.round(37.5-vix*0.75)));
    const rlsi = mom+part+trend+sent;
    const regime = rlsi>=70?'BULLISH':rlsi>=45?'NEUTRAL':'BEARISH';
    await client.send(new PutCommand({ TableName: 'signum-rlsi-history', Item: { pk:'MARKET', timestamp:Date.now(), rlsi, momentum:mom, participation:part, priceTrend:trend, sentiment:sent, regime, vix:Math.round(vix*100)/100, spyRsi:Math.round(rsi*100)/100, spyPrice:cur, sma20:Math.round(sma20*100)/100 }}));
    console.log('RLSI: '+rlsi+' ('+regime+')');
    return { rlsi, regime };
  } catch (e) { console.error('RLSI err:', e.message); return { error: e.message }; }
}

// ====== Alpha Score ======
function computeAlphaScore(priceData, gexData) {
  let s = 50;
  const c = priceData.changePct||0;
  if(c>3) s+=15; else if(c>1) s+=10; else if(c>0) s+=5; else if(c<-3) s-=15; else if(c<-1) s-=10; else if(c<0) s-=5;
  if(priceData.volume>50000000) s+=5; else if(priceData.volume>20000000) s+=3;
  if(gexData) { if(gexData.gammaRegime==='POSITIVE') s+=5; else if(gexData.gammaRegime==='NEGATIVE') s-=5; if(gexData.pcr<0.7) s+=5; else if(gexData.pcr>1.3) s-=5; }
  return Math.max(0, Math.min(100, Math.round(s)));
}

// ====== OMR (Options Market Regime) Calculator ======
function computeOMR(opts, price, gexData) {
  if (!opts || opts.length === 0 || !price) return null;
  const atmOpts = opts
    .filter(o => { const iv = o.greeks?.implied_volatility || 0; const strike = o.details?.strike_price || 0; return iv > 0 && strike > 0; })
    .sort((a, b) => Math.abs((a.details?.strike_price||0) - price) - Math.abs((b.details?.strike_price||0) - price))
    .slice(0, 4);
  const avgIV = atmOpts.length > 0 ? atmOpts.reduce((s, o) => s + (o.greeks?.implied_volatility||0), 0) / atmOpts.length : 0;
  const ivVal = Math.round(avgIV * 100);
  const otmPuts = opts.filter(o => o.details?.contract_type === 'put' && (o.details?.strike_price||0) < price && (o.greeks?.implied_volatility||0) > 0)
    .sort((a, b) => (b.details?.strike_price||0) - (a.details?.strike_price||0)).slice(0, 3);
  const otmCalls = opts.filter(o => o.details?.contract_type === 'call' && (o.details?.strike_price||0) > price && (o.greeks?.implied_volatility||0) > 0)
    .sort((a, b) => (a.details?.strike_price||0) - (b.details?.strike_price||0)).slice(0, 3);
  const avgPutIV = otmPuts.length > 0 ? otmPuts.reduce((s, o) => s + (o.greeks?.implied_volatility||0), 0) / otmPuts.length : 0;
  const avgCallIV = otmCalls.length > 0 ? otmCalls.reduce((s, o) => s + (o.greeks?.implied_volatility||0), 0) / otmCalls.length : 0;
  const skewVal = Math.round((avgPutIV - avgCallIV) * 100 * 10) / 10;
  const pcr = gexData.pcr || 0;
  let totalVol = 0, totalOI = 0;
  opts.forEach(o => { totalVol += (o.day?.volume||0); totalOI += (o.open_interest||0); });
  const uoaScore = totalOI > 0 ? Math.round((totalVol / totalOI) * 10) / 10 : 0;
  const opiVal = (gexData.tCOI||0) - (gexData.tPOI||0);
  const isLongGamma = gexData.gex >= 0;
  const ivLow = ivVal <= 30 ? 2 : ivVal <= 45 ? 1 : 0;
  const ivHigh = ivVal >= 60 ? 2 : ivVal >= 45 ? 1 : 0;
  const skewPut = skewVal >= 3 ? 2 : skewVal >= 1 ? 1 : 0;
  const skewCall = skewVal <= -3 ? 2 : skewVal <= -1 ? 1 : 0;
  const pcBullish = pcr > 0 && pcr < 0.7 ? 2 : pcr < 1.0 ? 1 : 0;
  const pcBearish = pcr >= 1.3 ? 2 : pcr >= 1.0 ? 1 : 0;
  const uoaHi = uoaScore >= 5 ? 2 : uoaScore >= 3 ? 1 : 0;
  const flowBullish = opiVal > 0 ? 1 : 0;
  const flowBearish = opiVal < 0 ? 1 : 0;
  const accumScore = ivLow + pcBullish + flowBullish + skewCall;
  const distScore = ivHigh + pcBearish + flowBearish + skewPut;
  const hedgeScore = ivHigh + skewPut * 2;
  const specScore = ivLow + uoaHi + skewCall;
  let regime = 'NEUTRAL', confidence = 30;
  if (hedgeScore >= 5) { regime = 'HEDGING'; confidence = Math.min(100, hedgeScore * 15); }
  else if (accumScore >= 5) { regime = 'ACCUMULATION'; confidence = Math.min(100, accumScore * 14); }
  else if (distScore >= 5) { regime = 'DISTRIBUTION'; confidence = Math.min(100, distScore * 14); }
  else if (specScore >= 5) { regime = 'SPECULATION'; confidence = Math.min(100, specScore * 15); }
  else {
    const scores = { ACCUMULATION: accumScore, DISTRIBUTION: distScore, HEDGING: hedgeScore, SPECULATION: specScore };
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (sorted[0][1] >= 3) { regime = sorted[0][0]; confidence = Math.min(100, sorted[0][1] * 14); }
  }
  return { regime, confidence, ivVal, skewVal, pcr: Math.round(pcr*100)/100, uoaScore, opiVal, isLongGamma };
}

// ====== Step 1: Prices ======
async function harvestPrices() {
  console.log('Step 1: Price snapshot ' + UNIVERSE.length + ' tickers...');
  const today = new Date().toISOString().slice(0,10);
  const snap = await httpsGet('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey='+POLYGON_KEY);
  const all = snap?.tickers || [];
  const items = [], priceMap = {}, snapshotMap = {};
  const us = new Set(UNIVERSE);
  // Also include UNIVERSE_500 tickers in priceMap for unified cache
  const all500 = new Set(UNIVERSE_500);
  for (const t of all) {
    if (!us.has(t.ticker) && !all500.has(t.ticker)) continue;
    const p = t.lastTrade?.p || t.day?.c || t.prevDay?.c || 0;
    const ch = t.todaysChangePerc || 0;
    priceMap[t.ticker] = p;
    snapshotMap[t.ticker] = { changePct:ch, volume:t.day?.v||0, price:p };
    if (us.has(t.ticker)) {
      items.push({ ticker:t.ticker, date:today, qualityTier:'LIVE', changePct:Math.round(ch*100)/100, open:t.day?.o||0, high:t.day?.h||0, low:t.day?.l||0, close:t.day?.c||p, volume:t.day?.v||0, vwap:t.day?.vw||0, gex:0, pcr:0, alphaScore:0 });
    }
  }
  if (items.length > 0) await batchWrite('signum-alpha-history', items);
  console.log('Prices: '+items.length+'/'+UNIVERSE.length+' (priceMap has '+Object.keys(priceMap).length+' tickers)');
  return { count:items.length, priceMap, snapshotMap };
}

// ====== Step 2: GEX ======
async function harvestGex(priceMap) {
  console.log('Step 2: GEX '+GEX_TICKERS.length+' tickers...');
  const ts = Date.now();
  const gexMap = {};
  const optionsCache = {}; // Cache options data for Step 6 reuse
  let ok = 0;
  for (let i = 0; i < GEX_TICKERS.length; i += 5) {
    const batch = GEX_TICKERS.slice(i, i+5);
    await Promise.all(batch.map(async (ticker) => {
      try {
        const price = priceMap[ticker]; if(!price) return;
        const opts = await getAllOptions(ticker); if(!opts.length) return;
        optionsCache[ticker] = { opts, price }; // Store for unified cache
        let gex=0, cw=null, pf=null, mp=null, maxCOI=0, maxPOI=0, tCOI=0, tPOI=0, mpMin=Infinity;
        const strikes = new Set();
        for (const o of opts) {
          const s=o.details?.strike_price; if(!s) continue;
          strikes.add(s);
          const g=o.greeks?.gamma||0, oi=o.open_interest||0, t=o.details?.contract_type;
          if(t==='call'){gex+=g*oi*100*price;tCOI+=oi;if(oi>maxCOI){maxCOI=oi;cw=s;}} else {gex-=g*oi*100*price;tPOI+=oi;if(oi>maxPOI){maxPOI=oi;pf=s;}}
        }
        for (const ts2 of [...strikes].sort((a,b)=>a-b)) { let c2=0; for(const o of opts){const s2=o.details?.strike_price;const oi2=o.open_interest||0;if(!s2||!oi2)continue;if(o.details.contract_type==='call')c2+=Math.max(0,ts2-s2)*oi2;else c2+=Math.max(0,s2-ts2)*oi2;} if(c2<mpMin){mpMin=c2;mp=ts2;} }
        const fl=cw&&pf?(cw+pf)/2:null, gr=gex>0?'POSITIVE':gex<0?'NEGATIVE':'NEUTRAL', pcr=tCOI>0?tPOI/tCOI:0;
        gexMap[ticker] = { gex, pcr, gammaRegime:gr, callWall:cw, putFloor:pf, maxPain:mp, flipLevel:fl, totalContracts:opts.length, totalCallOI:tCOI, totalPutOI:tPOI };
        await client.send(new PutCommand({ TableName:'signum-gex-history', Item:{ticker,timestamp:ts,gex:Math.round(gex),flipLevel:fl,callWall:cw,putFloor:pf,maxPain:mp,price,gammaRegime:gr,totalContracts:opts.length,totalCallOI:tCOI,totalPutOI:tPOI,pcr:Math.round(pcr*100)/100}}));
        await client.send(new PutCommand({ TableName:'signum-flow-history', Item:{ticker,timestamp:ts,compositeScore:0,opi:tCOI-tPOI,whaleScore:0,dex:0,ivSkew:0,squeezeProbability:0,smartMoneyScore:0,totalCallOI:tCOI,totalPutOI:tPOI,pcr:Math.round(pcr*100)/100}})).catch(()=>{});
        try {
          const omr = computeOMR(opts, price, { gex, pcr, tCOI, tPOI });
          if (omr) {
            await client.send(new PutCommand({ TableName:'signum-omr-history', Item:{ ticker, timestamp:ts, regime:omr.regime, confidence:omr.confidence, ivVal:omr.ivVal, skewVal:omr.skewVal, pcr:omr.pcr, uoaScore:omr.uoaScore, opiVal:omr.opiVal, isLongGamma:omr.isLongGamma, closePrice:price }}));
          }
        } catch(omrErr) { console.log('OMR err '+ticker+': '+omrErr.message); }
        ok++;
      } catch {}
    }));
  }
  console.log('GEX: '+ok+'/'+GEX_TICKERS.length);
  return { gexMap, optionsCache };
}

// ====== Step 3: SMA 50/200 for ALL tickers ======
async function harvestSMA(priceMap) {
  console.log('Step 3: SMA 50/200...');
  const today = new Date().toISOString().slice(0,10);
  const tickers = Object.keys(priceMap);
  const smaMap = {}; // Store for unified cache
  const items = [];
  for (let i = 0; i < tickers.length; i += 10) {
    const batch = tickers.slice(i, i+10);
    const results = await Promise.all(batch.map(async (ticker) => {
      try {
        const [s50, s200] = await Promise.all([
          httpsGet('https://api.polygon.io/v1/indicators/sma/'+ticker+'?timespan=day&adjusted=true&window=50&series_type=close&limit=2&apiKey='+POLYGON_KEY, 8000),
          httpsGet('https://api.polygon.io/v1/indicators/sma/'+ticker+'?timespan=day&adjusted=true&window=200&series_type=close&limit=2&apiKey='+POLYGON_KEY, 8000),
        ]);
        const sma50 = s50?.results?.values?.[0]?.value || null;
        const sma200 = s200?.results?.values?.[0]?.value || null;
        const prevSma50 = s50?.results?.values?.[1]?.value || sma50;
        const prevSma200 = s200?.results?.values?.[1]?.value || sma200;
        let cross = 'NONE', crossType = '';
        if (sma50 && sma200) {
          const dist = ((sma50-sma200)/sma200)*100;
          if (sma50 > sma200) { cross = 'GOLDEN'; crossType = prevSma50 <= prevSma200 ? 'NEW' : Math.abs(dist) < 0.5 ? 'TIGHT' : 'EST'; }
          else { cross = 'DEAD'; crossType = prevSma50 >= prevSma200 ? 'NEW' : Math.abs(dist) < 0.5 ? 'TIGHT' : 'EST'; }
        }
        const distance = sma50 && sma200 ? Math.round(((sma50-sma200)/sma200)*10000)/100 : 0;
        const isImminent = sma50 && sma200 ? Math.abs(((sma50-sma200)/sma200)*100) < 0.5 : false;
        smaMap[ticker] = { sma50: sma50?Math.round(sma50*100)/100:null, sma200: sma200?Math.round(sma200*100)/100:null, cross, crossType, distance, isImminent };
        return { ticker, sma50: sma50?Math.round(sma50*100)/100:null, sma200: sma200?Math.round(sma200*100)/100:null, cross, crossType };
      } catch { return { ticker, sma50:null, sma200:null, cross:'NONE', crossType:'' }; }
    }));
    for (const r of results) {
      items.push({ ticker:r.ticker, date:today, sma50:r.sma50, sma200:r.sma200, cross:r.cross, crossType:r.crossType, close:priceMap[r.ticker]||0, changePct:0, open:0, high:0, low:0, volume:0, vwap:0, gex:0, pcr:0, alphaScore:0, qualityTier:'SMA' });
    }
  }
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i+25);
    for (const item of batch) {
      try {
        const existing = await client.send(new QueryCommand({ TableName:'signum-alpha-history', KeyConditionExpression:'ticker=:tk AND #d=:d', ExpressionAttributeValues:{':tk':item.ticker,':d':item.date}, ExpressionAttributeNames:{'#d':'date'}, Limit:1 }));
        const merged = { ...(existing.Items?.[0]||{}), sma50:item.sma50, sma200:item.sma200, cross:item.cross, crossType:item.crossType };
        await client.send(new PutCommand({ TableName:'signum-alpha-history', Item:merged }));
      } catch {}
    }
  }
  const withSMA = items.filter(i => i.sma50 && i.sma200).length;
  console.log('SMA: '+withSMA+'/'+items.length+' with both SMA50+200');
  return { smaCount: withSMA, smaMap };
}

// ====== Step 4: Analyst(FMP) + Earnings(Finnhub) + Fundamentals + Related — ALL 509 tickers ======
async function harvestDetails() {
  console.log('Step 4: Details for ALL '+UNIVERSE_500.length+' tickers (FMP analyst + Finnhub earnings + Polygon fund/related)...');
  const today = new Date().toISOString().slice(0,10);
  let analystOk = 0, earningsOk = 0;
  const detailsMap = {};
  
  // === 4a: FMP Analyst Grades — ALL tickers (no rate limit issues) ===
  if (FMP_KEY) {
    for (let i = 0; i < UNIVERSE_500.length; i += 10) {
      const batch = UNIVERSE_500.slice(i, i+10);
      await Promise.all(batch.map(async (ticker) => {
        detailsMap[ticker] = detailsMap[ticker] || {};
        try {
          const data = await httpsGet('https://financialmodelingprep.com/stable/grades-consensus?symbol='+ticker+'&apikey='+FMP_KEY, 5000);
          const grade = Array.isArray(data) ? data[0] : data;
          if (grade && (grade.strongBuy || grade.buy || grade.hold)) {
            const total = (grade.strongBuy||0)+(grade.buy||0)+(grade.hold||0)+(grade.sell||0)+(grade.strongSell||0);
            const bullishPct = total > 0 ? Math.round(((grade.strongBuy||0)+(grade.buy||0))/total*100) : 0;
            let consensus = grade.consensus || 'N/A';
            if (consensus === 'N/A' && total > 0) {
              const ws = ((grade.strongBuy||0)*5+(grade.buy||0)*4+(grade.hold||0)*3+(grade.sell||0)*2+(grade.strongSell||0))/total;
              consensus = ws>=4.3?'STRONG BUY':ws>=3.5?'BUY':ws>=2.5?'HOLD':ws>=1.7?'SELL':'STRONG SELL';
            }
            detailsMap[ticker].analyst = { ticker, consensus, totalAnalysts:total, bullishPct, breakdown:{ strongBuy:grade.strongBuy||0, buy:grade.buy||0, hold:grade.hold||0, sell:grade.sell||0, strongSell:grade.strongSell||0 } };
            await client.send(new PutCommand({ TableName:'signum-pattern-db', Item:{ pattern:'ANALYST:'+ticker, timestamp:Date.now(), consensus, totalAnalysts:total, bullishPct, breakdown:detailsMap[ticker].analyst.breakdown }}));
            analystOk++;
          }
        } catch {}
      }));
    }
    console.log('FMP Analyst: '+analystOk+'/'+UNIVERSE_500.length);
  }
  
  // === 4b: Finnhub Earnings — rate-limited (60/min), process as many as possible ===
  if (FINNHUB_KEY) {
    let earningsProcessed = 0;
    for (let i = 0; i < UNIVERSE_500.length; i += 2) {
      const batch = UNIVERSE_500.slice(i, i+2);
      await Promise.all(batch.map(async (ticker) => {
        detailsMap[ticker] = detailsMap[ticker] || {};
        try {
          const from = today;
          const toDate = new Date(Date.now()+180*86400000).toISOString().slice(0,10);
          const eData = await httpsGet('https://finnhub.io/api/v1/calendar/earnings?symbol='+ticker+'&from='+from+'&to='+toDate+'&token='+FINNHUB_KEY, 8000);
          const events = eData?.earningsCalendar || [];
          if (events.length > 0) {
            const next = events.sort((a,b) => new Date(a.date).getTime()-new Date(b.date).getTime())[0];
            const daysUntil = Math.ceil((new Date(next.date).getTime()-new Date(today).getTime())/(86400000));
            const daysLabel = daysUntil <= 0 ? 'today' : 'D-'+daysUntil;
            detailsMap[ticker].earnings = { ticker, nextEarningsDate:next.date, daysUntilEarnings:daysUntil, daysLabel, hasData:true, epsEstimate:next.epsEstimate||null, quarter:next.quarter||null, year:next.year||null, hour:next.hour||null };
            await client.send(new PutCommand({ TableName:'signum-pattern-db', Item:{ pattern:'EARNINGS:'+ticker, timestamp:Date.now(), nextDate:next.date, daysUntil, epsEstimate:next.epsEstimate||null, quarter:next.quarter||null, year:next.year||null, hour:next.hour||null }}));
            earningsOk++;
          }
          earningsProcessed++;
        } catch {}
      }));
      // Finnhub rate limit: 60/min → 2 per batch, wait 2.2s between batches
      if (earningsProcessed % 10 === 0) await new Promise(r => setTimeout(r, 2200));
      // Process ALL 509 tickers — no cap (Lambda has 600s timeout, earnings batch takes ~5min)
      if (earningsProcessed >= 400) { console.log('Earnings: processed '+earningsProcessed+' tickers'); break; }
    }
    console.log('Finnhub Earnings: '+earningsOk+'/'+earningsProcessed+' processed');
  }
  
  // === 4c: Polygon Fundamentals — Reference + Financial Ratios + vX Financials ===
  // Fetches 3 APIs per ticker: reference (name/sector), ratios (PE/DE/ROE), vX financials (revenue/margin)
  let fundOk = 0;
  for (let i = 0; i < UNIVERSE_500.length; i += 5) {
    const batch = UNIVERSE_500.slice(i, i+5);
    await Promise.all(batch.map(async (ticker) => {
      try {
        // Parallel fetch: reference + financial ratios + vX financials
        const [refData, ratiosData, vxData] = await Promise.all([
          httpsGet('https://api.polygon.io/v3/reference/tickers/'+ticker+'?apiKey='+POLYGON_KEY, 5000).catch(() => null),
          httpsGet('https://api.polygon.io/stocks/financials/v1/ratios?ticker='+ticker+'&limit=1&apiKey='+POLYGON_KEY, 5000).catch(() => null),
          httpsGet('https://api.polygon.io/vX/reference/financials?ticker='+ticker+'&limit=5&timeframe=quarterly&order=desc&sort=period_of_report_date&apiKey='+POLYGON_KEY, 5000).catch(() => null),
        ]);
        
        const r = refData?.results;
        detailsMap[ticker] = detailsMap[ticker] || {};
        
        // --- Financial Ratios ---
        const ratios = ratiosData?.results?.[0] || {};
        const pe = ratios.price_to_earnings ?? null;
        const de = ratios.debt_to_equity ?? null;
        const roe = ratios.return_on_equity ?? null;
        const pb = ratios.price_to_book ?? null;
        const ps = ratios.price_to_sales ?? null;
        const fcfRaw = ratios.free_cash_flow ?? null;
        const mktCap = ratios.market_cap ?? (r?.market_cap || null);
        let fcfYield = null;
        if (fcfRaw !== null && mktCap !== null && mktCap > 0) fcfYield = (fcfRaw / mktCap) * 100;
        
        // --- vX Financials (revenue growth, net margin) ---
        const vxResults = vxData?.results || [];
        let revenueGrowth = null, netMargin = null;
        if (vxResults.length >= 1) {
          const latest = vxResults[0]?.financials?.income_statement;
          if (latest) {
            const revLatest = latest.revenues?.value || 0;
            const netIncome = latest.net_income_loss?.value || 0;
            if (revLatest > 0) netMargin = (netIncome / revLatest) * 100;
          }
          if (latest && vxResults.length >= 2) {
            const revLatest = latest.revenues?.value || 0;
            let revPrev = 0;
            const preferredIdx = vxResults.length >= 5 ? 4 : vxResults.length - 1;
            for (let j = preferredIdx; j >= 1; j--) {
              const val = vxResults[j]?.financials?.income_statement?.revenues?.value;
              if (val && val > 0) { revPrev = val; break; }
            }
            if (revPrev > 0 && revLatest > 0) revenueGrowth = ((revLatest - revPrev) / Math.abs(revPrev)) * 100;
          }
        }
        
        // --- Score Calculation ---
        let score = 0;
        const breakdown = {};
        if (pe !== null && pe > 0) { const s = pe<15?20:pe<25?16:pe<35?12:pe<50?8:4; score+=s; breakdown.pe = {value:pe.toFixed(1),score:s,label:'P/E'}; } else { breakdown.pe = {value:pe!==null?pe.toFixed(1):'N/A',score:0,label:'P/E'}; }
        if (de !== null) { const s = de<0.3?20:de<0.6?16:de<1.0?12:de<2.0?8:4; score+=s; breakdown.de = {value:de.toFixed(2),score:s,label:'D/E'}; } else { breakdown.de = {value:'N/A',score:0,label:'D/E'}; }
        if (fcfYield !== null) { const s = fcfYield>8?20:fcfYield>5?16:fcfYield>3?12:fcfYield>1?8:4; score+=s; breakdown.fcf = {value:fcfYield.toFixed(1)+'%',score:s,label:'FCF'}; } else { breakdown.fcf = {value:'N/A',score:0,label:'FCF'}; }
        if (revenueGrowth !== null) { const s = revenueGrowth>50?20:revenueGrowth>25?16:revenueGrowth>10?12:revenueGrowth>0?8:4; score+=s; breakdown.rev = {value:(revenueGrowth>0?'+':'')+revenueGrowth.toFixed(0)+'%',score:s,label:'Rev'}; } else { breakdown.rev = {value:'N/A',score:0,label:'Rev'}; }
        if (netMargin !== null) { const s = netMargin>30?20:netMargin>20?16:netMargin>10?12:netMargin>0?8:4; score+=s; breakdown.margin = {value:netMargin.toFixed(1)+'%',score:s,label:'Margin'}; } else { breakdown.margin = {value:'N/A',score:0,label:'Margin'}; }
        
        const hasAnyData = Object.values(breakdown).some(b => b.score > 0);
        let grade, finalScore;
        if (!hasAnyData) { grade = 'NO_DATA'; finalScore = null; }
        else { finalScore = score; grade = score>=80?'A':score>=70?'A-':score>=60?'B+':score>=50?'B':score>=40?'C+':score>=30?'C':score>=20?'D':'F'; }
        
        detailsMap[ticker].fundamentals = {
          ticker, name: r?.name||ticker, marketCap: r?.market_cap||mktCap, sector: r?.sic_description||null,
          description: r?.description?.slice(0,500)||null, exchange: r?.primary_exchange||null,
          score: finalScore, grade,
          pe: pe!==null ? Math.round(pe*10)/10 : null,
          de: de!==null ? Math.round(de*100)/100 : null,
          roe: roe!==null ? Math.round(roe*1000)/10 : null,
          revenueGrowth: revenueGrowth!==null ? Math.round(revenueGrowth*10)/10 : null,
          netMargin: netMargin!==null ? Math.round(netMargin*10)/10 : null,
          fcfYield: fcfYield!==null ? Math.round(fcfYield*10)/10 : null,
          pb: pb!==null ? Math.round(pb*10)/10 : null,
          ps: ps!==null ? Math.round(ps*10)/10 : null,
          breakdown,
        };
        if (r) {
          detailsMap[ticker].overview = { name:r.name||ticker, sector:r.sic_description||null, sectorEN:r.sic_description||null, description:r.description?.slice(0,300)||null, descriptionEN:r.description?.slice(0,300)||null, marketCap:r.market_cap||null, exchange:r.primary_exchange||null };
        }
        await client.send(new PutCommand({ TableName:'signum-pattern-db', Item:{ pattern:'FUND:'+ticker, timestamp:Date.now(), name:r?.name||ticker, marketCap:r?.market_cap||null, sector:r?.sic_description||null, exchange:r?.primary_exchange||null, score:finalScore, grade }}));
        fundOk++;
      } catch {}
    }));
  }
  
  // === 4d: Polygon Related Companies — ALL tickers (no rate limit) ===
  let relOk = 0;
  for (let i = 0; i < UNIVERSE_500.length; i += 10) {
    const batch = UNIVERSE_500.slice(i, i+10);
    await Promise.all(batch.map(async (ticker) => {
      try {
        const data = await httpsGet('https://api.polygon.io/v1/related-companies/'+ticker+'?apiKey='+POLYGON_KEY, 5000);
        const rels = data?.results || [];
        if (rels.length > 0) {
          detailsMap[ticker] = detailsMap[ticker] || {};
          const relTickers = rels.slice(0,10).map(r => r.ticker);
          detailsMap[ticker].related = { ticker, count:relTickers.length, topRelated:relTickers.slice(0,4).map(t=>({ticker:t,price:0,change:0,logo:null})), relatedTickers:relTickers, allTickers:relTickers };
          await client.send(new PutCommand({ TableName:'signum-pattern-db', Item:{ pattern:'RELATED:'+ticker, timestamp:Date.now(), tickers: relTickers }}));
          relOk++;
        }
      } catch {}
    }));
  }
  
  console.log('Details: analyst='+analystOk+' earnings='+earningsOk+' fund='+fundOk+' related='+relOk);
  return { analyst:analystOk, earnings:earningsOk, fundamentals:fundOk, related:relOk, detailsMap };
}

// ====== Step 5: Update Alpha Scores (merge GEX into prices) ======
async function updateAlphaScores(snapshotMap, gexMap) {
  const today = new Date().toISOString().slice(0,10);
  const items = [];
  for (const [ticker, pd] of Object.entries(snapshotMap)) {
    const alpha = computeAlphaScore(pd, gexMap[ticker]||null);
    items.push({ ticker, date:today, changePct:Math.round(pd.changePct*100)/100, open:0,high:0,low:0, close:pd.price, volume:pd.volume, vwap:0, gex:gexMap[ticker]?gexMap[ticker].gex:0, pcr:gexMap[ticker]?gexMap[ticker].pcr:0, alphaScore:alpha, qualityTier:gexMap[ticker]?'FULL':'PRICE_ONLY' });
  }
  if (items.length > 0) await batchWrite('signum-alpha-history', items);
  console.log('Alpha: '+items.length+' scores');
  return items.length;
}

// ====== [v7 NEW] Step 6: Build Unified Cache ======
// Combines ALL data from Steps 1-5 into complete unified objects
// Saves to signum-unified-cache for instant Vercel reads
async function buildUnifiedCache(priceMap, gexMap, optionsCache, smaMap, detailsMap) {
  console.log('Step 6: Building unified cache for '+UNIVERSE_500.length+' tickers...');
  let ok = 0, partial = 0;
  
  for (let i = 0; i < UNIVERSE_500.length; i += 10) {
    const batch = UNIVERSE_500.slice(i, i+10);
    await Promise.all(batch.map(async (ticker) => {
      try {
        const price = priceMap[ticker];
        if (!price) return; // No price data = skip
        
        const gd = gexMap[ticker] || null;
        const sm = smaMap[ticker] || null;
        const dt = detailsMap[ticker] || {};
        const optData = optionsCache[ticker] || null;
        
        // === Build structure field (from GEX data) ===
        let structure = null;
        if (gd) {
          structure = {
            options_status: 'OK',
            netGex: Math.round(gd.gex),
            maxPain: gd.maxPain,
            pcRatio: Math.round(gd.pcr*100)/100,
            levels: { callWall: gd.callWall, putFloor: gd.putFloor },
            gammaFlipLevel: gd.flipLevel,
            gammaRegime: gd.gammaRegime,
            totalContracts: gd.totalContracts,
            totalCallOI: gd.totalCallOI,
            totalPutOI: gd.totalPutOI,
            underlyingPrice: price,
            validation: { confidence: 'HIGH', source: 'lambda-v7' },
          };
        }
        
        // === Build SMA/Trend Phase ===
        let sma = null;
        if (sm && sm.sma50 && sm.sma200) {
          sma = {
            ticker, cross: sm.cross, crossType: sm.crossType,
            sma50: sm.sma50, sma200: sm.sma200,
            distance: sm.distance, isImminent: sm.isImminent,
            phase: sm.cross === 'GOLDEN' ? 'BULLISH' : sm.cross === 'DEAD' ? 'BEARISH' : 'NEUTRAL',
            label: '',
          };
        }
        
        // === Build volatility regime (from GEX + options data, or basic from SMA) ===
        let volatility = null;
        if (gd) {
          const netGex = gd.gex || 0;
          const isShortGamma = netGex < 0;
          const gammaFlip = gd.flipLevel || 0;
          const flipDistance = gammaFlip > 0 && price > 0 ? ((price - gammaFlip) / gammaFlip) * 100 : 0;
          // ATM IV from options cache
          let atmIv = 0;
          if (optData && optData.opts) {
            const atm = optData.opts
              .filter(o => o.greeks?.implied_volatility > 0 && o.details?.strike_price > 0)
              .sort((a,b) => Math.abs((a.details?.strike_price||0)-price) - Math.abs((b.details?.strike_price||0)-price))
              .slice(0,4);
            if (atm.length > 0) atmIv = Math.round(atm.reduce((s,o) => s + (o.greeks?.implied_volatility||0), 0) / atm.length * 100);
          }
          // Regime calculation
          let regimeScore = 0;
          if (isShortGamma) regimeScore += Math.min(30, Math.abs(netGex)/1000000*3);
          if (atmIv > 50) regimeScore += 20; else if (atmIv > 35) regimeScore += 12; else if (atmIv > 25) regimeScore += 6;
          const flipDist = Math.abs(flipDistance);
          if (flipDist < 1) regimeScore += 15; else if (flipDist < 3) regimeScore += 10; else if (flipDist < 5) regimeScore += 5;
          regimeScore = Math.min(100, regimeScore);
          const regime = regimeScore >= 75 ? 'ERUPTING' : regimeScore >= 50 ? 'LOADED' : regimeScore >= 25 ? 'COILING' : 'CALM';
          volatility = { regime, regimeScore: Math.round(regimeScore), gex:Math.round(netGex), gexLabel:isShortGamma?'SHORT':'LONG', iv:atmIv, flipDistance:Math.round(flipDistance*10)/10, flipLevel:gammaFlip, isAboveFlip:flipDistance>0, squeezeScore:0, squeezeRisk:'LOW', gammaConcentration:0, gammaConcentrationLabel:'NORMAL' };
        } else {
          // Non-GEX tickers: basic volatility from SMA trend data
          volatility = { regime: 'CALM', regimeScore: 0, gex: 0, gexLabel: 'N/A', iv: 0, flipDistance: 0, flipLevel: 0, isAboveFlip: false, squeezeScore: 0, squeezeRisk: 'LOW', gammaConcentration: 0, gammaConcentrationLabel: 'NORMAL' };
        }
        
        // === Build squeeze (short volume from Polygon) ===
        let squeeze = null;
        try {
          const svData = await httpsGet('https://api.polygon.io/stocks/v1/short-volume?ticker='+ticker+'&limit=1&apiKey='+POLYGON_KEY, 5000);
          const svResult = svData?.results?.[0];
          if (svResult) {
            const shortVol = svResult.short_volume || 0;
            const totalVol = svResult.total_volume || 1;
            const shortVolPct = Math.round((shortVol/totalVol)*1000)/10;
            let riskScore = 0;
            if (shortVolPct >= 50) riskScore += 20; else if (shortVolPct >= 40) riskScore += 10;
            const status = riskScore >= 70 ? 'CRITICAL' : riskScore >= 45 ? 'HIGH' : riskScore >= 20 ? 'MEDIUM' : 'LOW';
            squeeze = { ticker, siPercent:0, daysToCover:0, siChange:0, shortVolPercent:shortVolPct, riskScore, status };
          }
        } catch {}
        
        // === Build institutional (simplified — dark pool % from snapshot) ===
        let institutional = null;
        // For GEX tickers, we have options data to derive basic institutional signals
        // Full dark pool analysis requires 50K+ trades — too heavy for Lambda
        // Provide basic structure; warm-command can optionally supplement
        institutional = { darkPool: { percent: 0 }, blockTrade: { count: 0, volume: 0 }, shortVolume: squeeze ? { percent: squeeze.shortVolPercent } : null };
        
        // === Assemble unified data ===
        const data = {
          timestamp: Date.now(),
          structure,
          analyst: dt.analyst || null,
          fundamentals: dt.fundamentals || null,
          earnings: dt.earnings || null,
          sma,
          related: dt.related || null,
          volatility,
          squeeze,
          institutional,
        };
        
        // Count filled fields
        const FIELDS = ['structure','analyst','fundamentals','earnings','sma','related','squeeze','volatility','institutional'];
        const filled = FIELDS.filter(f => data[f]).length;
        
        // Only save if we have at least some data (structure or 3+ fields)
        if (structure || filled >= 3) {
          await client.send(new PutCommand({
            TableName: 'signum-unified-cache',
            Item: {
              pk: ticker,
              data: data,
              locale: 'en',
              timestamp: Date.now(),
              updatedAt: new Date().toISOString(),
              fieldCount: filled,
              version: 'v7',
            },
          }));
          if (filled >= 7) ok++; else partial++;
        }
      } catch (e) {
        console.log('Unified err '+ticker+': '+(e.message||e));
      }
    }));
  }
  
  console.log('Unified Cache: '+ok+' complete, '+partial+' partial, total='+(ok+partial)+'/'+UNIVERSE_500.length);
  return { complete: ok, partial };
}

exports.handler = async (event) => {
  const start = Date.now();
  console.log('SIGNUM Harvest Lambda v7.1 — ' + new Date().toISOString());
  
  // ══════════════════════════════════════════════════════════════
  // ON-DEMAND MODE: Fetch a single non-universe ticker
  // Triggered by: Lambda Function URL or direct invoke
  // Input: event.onDemandTicker OR event.queryStringParameters.ticker
  // Output: unified data saved to signum-unified-cache DynamoDB
  // ══════════════════════════════════════════════════════════════
  const onDemandTicker = event.onDemandTicker 
    || event.queryStringParameters?.ticker 
    || (event.body ? JSON.parse(event.body).ticker : null);
  
  if (onDemandTicker) {
    const ticker = onDemandTicker.toUpperCase().trim();
    console.log('[ON-DEMAND] Fetching ' + ticker + '...');
    
    try {
      // 1. Price snapshot
      const snapRes = await httpsGet('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/' + ticker + '?apiKey=' + POLYGON_KEY, 8000);
      const snap = snapRes?.ticker;
      const price = snap?.lastTrade?.p || snap?.day?.c || snap?.prevDay?.c || 0;
      if (!price) {
        return { statusCode: 404, body: JSON.stringify({ error: 'No price data for ' + ticker }) };
      }
      const changePct = snap?.todaysChangePerc || 0;
      const volume = snap?.day?.v || 0;
      
      // 2. Options (GEX/structure)
      let structure = null, gexData = null;
      try {
        const opts = await getAllOptions(ticker);
        if (opts.length > 0) {
          let gex=0, cw=null, pf=null, mp=null, maxCOI=0, maxPOI=0, tCOI=0, tPOI=0, mpMin=Infinity;
          const strikes = new Set();
          for (const o of opts) {
            const s=o.details?.strike_price; if(!s) continue;
            strikes.add(s);
            const g=o.greeks?.gamma||0, oi=o.open_interest||0, t=o.details?.contract_type;
            if(t==='call'){gex+=g*oi*100*price;tCOI+=oi;if(oi>maxCOI){maxCOI=oi;cw=s;}} 
            else {gex-=g*oi*100*price;tPOI+=oi;if(oi>maxPOI){maxPOI=oi;pf=s;}}
          }
          for (const ts2 of [...strikes].sort((a,b)=>a-b)) { 
            let c2=0; for(const o of opts){const s2=o.details?.strike_price;const oi2=o.open_interest||0;if(!s2||!oi2)continue;if(o.details.contract_type==='call')c2+=Math.max(0,ts2-s2)*oi2;else c2+=Math.max(0,s2-ts2)*oi2;} 
            if(c2<mpMin){mpMin=c2;mp=ts2;} 
          }
          const fl=cw&&pf?(cw+pf)/2:null, gr=gex>0?'POSITIVE':gex<0?'NEGATIVE':'NEUTRAL', pcr=tCOI>0?tPOI/tCOI:0;
          gexData = { gex, pcr, gammaRegime:gr, callWall:cw, putFloor:pf, maxPain:mp, flipLevel:fl, totalContracts:opts.length, totalCallOI:tCOI, totalPutOI:tPOI };
          structure = {
            options_status: 'OK', netGex: Math.round(gex), maxPain: mp,
            pcRatio: Math.round(pcr*100)/100, levels: { callWall: cw, putFloor: pf },
            gammaFlipLevel: fl, gammaRegime: gr, totalContracts: opts.length,
            totalCallOI: tCOI, totalPutOI: tPOI, underlyingPrice: price,
            validation: { confidence: 'HIGH', source: 'lambda-ondemand' },
          };
        }
      } catch (e) { console.log('[ON-DEMAND] Options err: ' + e.message); }
      
      // 3. Fundamentals
      let fundamentals = null, overview = null;
      try {
        const fData = await httpsGet('https://api.polygon.io/v3/reference/tickers/' + ticker + '?apiKey=' + POLYGON_KEY, 5000);
        const r = fData?.results;
        if (r) {
          fundamentals = { ticker, name:r.name||ticker, marketCap:r.market_cap||null, sector:r.sic_description||null, description:r.description?.slice(0,500)||null, exchange:r.primary_exchange||null };
          overview = { name:r.name||ticker, sector:r.sic_description||null, sectorEN:r.sic_description||null, description:r.description?.slice(0,300)||null, descriptionEN:r.description?.slice(0,300)||null, marketCap:r.market_cap||null, exchange:r.primary_exchange||null };
        }
      } catch {}
      
      // 4. Analyst (FMP)
      let analyst = null;
      if (FMP_KEY) {
        try {
          const data = await httpsGet('https://financialmodelingprep.com/stable/grades-consensus?symbol='+ticker+'&apikey='+FMP_KEY, 5000);
          const grade = Array.isArray(data) ? data[0] : data;
          if (grade && (grade.strongBuy || grade.buy || grade.hold)) {
            const total = (grade.strongBuy||0)+(grade.buy||0)+(grade.hold||0)+(grade.sell||0)+(grade.strongSell||0);
            const bullishPct = total > 0 ? Math.round(((grade.strongBuy||0)+(grade.buy||0))/total*100) : 0;
            let consensus = grade.consensus || 'N/A';
            if (consensus === 'N/A' && total > 0) {
              const ws = ((grade.strongBuy||0)*5+(grade.buy||0)*4+(grade.hold||0)*3+(grade.sell||0)*2+(grade.strongSell||0))/total;
              consensus = ws>=4.3?'STRONG BUY':ws>=3.5?'BUY':ws>=2.5?'HOLD':ws>=1.7?'SELL':'STRONG SELL';
            }
            analyst = { ticker, consensus, totalAnalysts:total, bullishPct, breakdown:{ strongBuy:grade.strongBuy||0, buy:grade.buy||0, hold:grade.hold||0, sell:grade.sell||0, strongSell:grade.strongSell||0 } };
          }
        } catch {}
      }
      
      // 5. Earnings (Finnhub)
      let earnings = null;
      if (FINNHUB_KEY) {
        try {
          const today = new Date().toISOString().slice(0,10);
          const toDate = new Date(Date.now()+180*86400000).toISOString().slice(0,10);
          const eData = await httpsGet('https://finnhub.io/api/v1/calendar/earnings?symbol='+ticker+'&from='+today+'&to='+toDate+'&token='+FINNHUB_KEY, 5000);
          const events = eData?.earningsCalendar || [];
          if (events.length > 0) {
            const next = events.sort((a,b) => new Date(a.date).getTime()-new Date(b.date).getTime())[0];
            const daysUntil = Math.ceil((new Date(next.date).getTime()-new Date(today).getTime())/(86400000));
            earnings = { ticker, nextEarningsDate:next.date, daysUntilEarnings:daysUntil, daysLabel:daysUntil<=0?'today':'D-'+daysUntil, hasData:true, epsEstimate:next.epsEstimate||null };
          }
        } catch {}
      }
      
      // 6. SMA
      let sma = null;
      try {
        const [s50, s200] = await Promise.all([
          httpsGet('https://api.polygon.io/v1/indicators/sma/'+ticker+'?timespan=day&adjusted=true&window=50&series_type=close&limit=1&apiKey='+POLYGON_KEY, 5000),
          httpsGet('https://api.polygon.io/v1/indicators/sma/'+ticker+'?timespan=day&adjusted=true&window=200&series_type=close&limit=1&apiKey='+POLYGON_KEY, 5000),
        ]);
        const sma50 = s50?.results?.values?.[0]?.value || null;
        const sma200 = s200?.results?.values?.[0]?.value || null;
        if (sma50 && sma200) {
          const cross = sma50 > sma200 ? 'GOLDEN' : 'DEAD';
          const distance = Math.round(((sma50-sma200)/sma200)*10000)/100;
          sma = { ticker, cross, crossType:'EST', sma50:Math.round(sma50*100)/100, sma200:Math.round(sma200*100)/100, distance, isImminent:Math.abs(distance)<0.5, phase:cross==='GOLDEN'?'BULLISH':'BEARISH' };
        }
      } catch {}
      
      // 7. Save to DynamoDB (signum-unified-cache)
      const data = { timestamp:Date.now(), structure, analyst, fundamentals, earnings, sma, related:null, volatility:null, squeeze:null, institutional:null };
      const FIELDS = ['structure','analyst','fundamentals','earnings','sma'];
      const filled = FIELDS.filter(f => data[f]).length;
      
      await client.send(new PutCommand({
        TableName: 'signum-unified-cache',
        Item: { pk:ticker, data, locale:'en', timestamp:Date.now(), updatedAt:new Date().toISOString(), fieldCount:filled, version:'v7-ondemand' },
      }));
      
      // Also save overview separately
      if (overview) {
        await client.send(new PutCommand({
          TableName: 'signum-unified-cache',
          Item: { pk:ticker+':overview', data:overview, locale:'en', timestamp:Date.now(), updatedAt:new Date().toISOString(), version:'v7-ondemand' },
        })).catch(() => {});
      }
      
      const duration = Date.now() - start;
      console.log('[ON-DEMAND] ' + ticker + ' saved: ' + filled + '/5 fields in ' + duration + 'ms');
      
      return { 
        statusCode: 200, 
        body: JSON.stringify({ 
          success: true, ticker, fields: filled, duration,
          hasStructure: !!structure, hasFundamentals: !!fundamentals, 
          hasAnalyst: !!analyst, hasEarnings: !!earnings, hasSma: !!sma,
          price, changePct: Math.round(changePct*100)/100,
        }) 
      };
    } catch (e) {
      console.error('[ON-DEMAND] Error for ' + ticker + ':', e.message);
      return { statusCode: 500, body: JSON.stringify({ error: e.message, ticker }) };
    }
  }
  
  // ══════════════════════════════════════════════════════════════
  // SCHEDULED MODE: Original v7 harvest (unchanged)
  // ══════════════════════════════════════════════════════════════
  const hour = new Date().getUTCHours();
  const minute = new Date().getUTCMinutes();
  const utcMin = hour*60+minute;
  const day = new Date().getUTCDay(); // 0=Sun, 6=Sat
  const isWeekend = (day === 0 || day === 6);
  const isExtended = (utcMin >= 8*60) || (utcMin <= 1*60);
  const isRegular = (utcMin >= 13*60+30 && utcMin <= 21*60);
  const forceRun = event && event.forceRun;
  
  // Weekend: skip everything — preserve Friday's data as-is
  if (isWeekend) {
    console.log('Weekend (day='+day+') — skipping all steps to preserve Friday data');
    return { statusCode:200, body:JSON.stringify({ skipped:true, reason:'Weekend - Friday data preserved', day }) };
  }
  
  if (!isExtended && !forceRun) {
    return { statusCode:200, body:JSON.stringify({ skipped:true, reason:'Markets closed', utcHour:hour }) };
  }
  const results = {};
  
  // Always: Prices + RLSI
  const { count, priceMap, snapshotMap } = await harvestPrices();
  results.prices = count;
  results.rlsi = await computeRlsi();
  
  // Regular hours: GEX + Alpha + SMA + Unified Cache
  let gexMap = {}, optionsCache = {}, smaMap = {};
  if (isRegular || forceRun) {
    const gexResult = await harvestGex(priceMap);
    gexMap = gexResult.gexMap;
    optionsCache = gexResult.optionsCache;
    results.gex = Object.keys(gexMap).length;
    results.alpha = await updateAlphaScores(snapshotMap, gexMap);
    const smaResult = await harvestSMA(priceMap);
    results.sma = smaResult.smaCount;
    smaMap = smaResult.smaMap;
  } else {
    results.gex = 'SKIP:extended';
    results.sma = 'SKIP:extended';
  }
  
  // Daily details: run once at 14:30 UTC (market open + 1hr) or forceRun
  let detailsMap = {};
  const isDailyDetailTime = (utcMin >= 14*60+25 && utcMin <= 14*60+35);
  if (isDailyDetailTime || forceRun) {
    const detailResult = await harvestDetails();
    results.details = { analyst: detailResult.analyst, earnings: detailResult.earnings, fundamentals: detailResult.fundamentals, related: detailResult.related };
    detailsMap = detailResult.detailsMap;
  } else {
    results.details = 'SKIP:not_daily_window';
    // Load existing details from DynamoDB for unified cache
    // (We have them from previous runs in signum-pattern-db)
    for (const ticker of UNIVERSE_500) {
      try {
        const [analystRes, earningsRes, fundRes, relRes] = await Promise.all([
          client.send(new GetCommand({ TableName:'signum-pattern-db', Key:{pattern:'ANALYST:'+ticker} })),
          client.send(new GetCommand({ TableName:'signum-pattern-db', Key:{pattern:'EARNINGS:'+ticker} })),
          client.send(new GetCommand({ TableName:'signum-pattern-db', Key:{pattern:'FUND:'+ticker} })),
          client.send(new GetCommand({ TableName:'signum-pattern-db', Key:{pattern:'RELATED:'+ticker} })),
        ]);
        detailsMap[ticker] = {};
        if (analystRes.Item) {
          const a = analystRes.Item;
          detailsMap[ticker].analyst = { ticker, consensus:a.consensus, totalAnalysts:a.totalAnalysts, bullishPct:a.bullishPct, breakdown:a.breakdown };
        }
        if (earningsRes.Item) {
          const e = earningsRes.Item;
          const today2 = new Date().toISOString().slice(0,10);
          const daysUntil = e.nextDate ? Math.ceil((new Date(e.nextDate).getTime()-new Date(today2).getTime())/86400000) : 0;
          detailsMap[ticker].earnings = { ticker, nextEarningsDate:e.nextDate, daysUntilEarnings:daysUntil, daysLabel:daysUntil<=0?'today':'D-'+daysUntil, hasData:true, epsEstimate:e.epsEstimate, quarter:e.quarter, year:e.year };
        }
        if (fundRes.Item) {
          const f = fundRes.Item;
          detailsMap[ticker].fundamentals = { ticker, name:f.name||ticker, marketCap:f.marketCap, sector:f.sector };
          detailsMap[ticker].overview = { name:f.name||ticker, sector:f.sector, sectorEN:f.sector, description:f.description?.slice(0,300), descriptionEN:f.description?.slice(0,300), marketCap:f.marketCap, exchange:f.exchange };
        }
        if (relRes.Item && relRes.Item.tickers) {
          const tks = relRes.Item.tickers;
          detailsMap[ticker].related = { ticker, count:tks.length, topRelated:tks.slice(0,4).map(t=>({ticker:t,price:0,change:0,logo:null})), relatedTickers:tks, allTickers:tks };
        }
      } catch {}
    }
  }
  
  // [v7] Step 6: Build Unified Cache — ALWAYS run (regular + extended)
  if (isRegular || forceRun) {
    results.unified = await buildUnifiedCache(priceMap, gexMap, optionsCache, smaMap, detailsMap);
  } else {
    // Extended hours: still build unified cache with whatever data we have
    results.unified = await buildUnifiedCache(priceMap, {}, {}, smaMap, detailsMap);
  }
  
  const duration = Math.round((Date.now()-start)/1000);
  console.log('Done in '+duration+'s');
  return { statusCode:200, body:JSON.stringify({ success:true, version:'7.0', timestamp:new Date().toISOString(), duration, results }) };
};
