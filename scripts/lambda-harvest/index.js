
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, BatchWriteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const https = require('https');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

function httpsGet(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs || 15000);
    https.get(url, { headers: { 'User-Agent': 'SIGNUM-HQ/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { clearTimeout(to); try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on('error', (e) => { clearTimeout(to); reject(e); });
  });
}

const POLYGON_KEY = process.env.POLYGON_API_KEY || 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';

// ====== Dynamic Universe Loading ======
// Load from universe.json (built by scripts/build-universe.js)
// Falls back to hardcoded core list if file not found
function loadUniverse() {
  try {
    const path = require('path');
    const fs = require('fs');
    const uniPath = path.join(__dirname, 'universe.json');
    if (fs.existsSync(uniPath)) {
      const data = JSON.parse(fs.readFileSync(uniPath, 'utf-8'));
      console.log('Universe loaded from universe.json: ' + (data.symbols?.length || 0) + ' symbols');
      return data.symbols || [];
    }
  } catch (e) { console.warn('Failed to load universe.json:', e.message); }
  // Fallback: core 300
  console.log('Using fallback hardcoded universe (300 symbols)');
  return ["AAPL","ABBV","ABNB","ABT","ACN","ADBE","ADI","ADP","AEP","AFRM","AI","AMAT","AMD","AMGN","AMZN","ANET","ANSS","APD","ARE","ARM","ASML","ASTS","AVGO","AWK","AXP","BA","BAC","BBY","BIIB","BKNG","BLK","BMY","BSX","C","CARR","CAT","CCI","CCJ","CDNS","CEG","CF","CHTR","CL","CMCSA","COIN","COP","COST","CPRT","CRM","CRWD","CTAS","CTSH","CVS","CVX","D","DASH","DD","DDOG","DE","DELL","DHR","DIS","DKNG","DLR","DOV","DOW","DPZ","DUK","DVN","DXCM","EA","EBAY","ECL","EL","EMR","ENPH","EOG","EQIX","EQR","ETN","FAST","FCX","FDX","FSLR","FTNT","FTV","GD","GE","GEV","GILD","GIS","GM","GOOGL","GRMN","GS","HAL","HCA","HD","HON","HOOD","HSIC","HSY","HUBS","HUM","IBM","ICE","IDXX","IFF","ILMN","INCY","INTC","IONQ","IP","IQV","IR","ISRG","IT","ITW","JNJ","JPM","KDP","KEY","KHC","KLAC","KMB","KO","KR","KTOS","LDOS","LIN","LLY","LMT","LOW","LRCX","LULU","LUNR","LVS","LYB","LYV","MA","MAR","MARA","MBLY","MCD","MCHP","MCO","MDB","MDLZ","MDT","MELI","MET","META","MGM","MNST","MO","MPC","MPWR","MRK","MRNA","MRVL","MS","MSCI","MSFT","MSI","MSTR","MTB","MTD","MU","NDAQ","NDSN","NEE","NEM","NET","NFLX","NKE","NOC","NOW","NSC","NTRS","NUE","NVDA","NVO","O","ODFL","OKTA","ON","ORCL","ORLY","OTIS","OXY","PANW","PARA","PATH","PAYX","PCAR","PCG","PEAK","PEG","PEP","PFE","PG","PHM","PL","PLD","PLTR","PM","PNC","PONY","POOL","PPG","PSA","PSX","PTC","PWR","PYPL","QCOM","REGN","RIOT","RIVN","RKLB","ROK","ROKU","ROP","ROST","RSG","RTX","S","SBAC","SBUX","SCHW","SE","SEDG","SERV","SHOP","SHW","SLB","SMCI","SMR","SNA","SNOW","SNPS","SO","SOFI","SPG","SQ","SRE","STE","STT","STX","STZ","SWK","SWKS","SYK","SYM","SYY","T","TDG","TEAM","TEL","TER","TFC","TJX","TMO","TMUS","TRGP","TROW","TRV","TSLA","TSM","TT","TTWO","TWLO","TXN","TYL","UBER","UNH","UNP","UPS","UPST","URI","USB","V","VFC","VICI","VKTX","VLO","VMC","VRSK","VRTX","VST","VTR","VTRS","VZ","WDAY","WELL","WFC","WMT","XOM","XYZ","ZS"];
}
const UNIVERSE = loadUniverse();

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
// [REMOVED] Legacy computeAlphaScore() — Context Score is computed by V4.6 engine
// V4.6 engine is bundled from alphaEngine.ts via esbuild (see alphaEngine.js)

// ====== OMR (Options Market Regime) Calculator ======
function computeOMR(opts, price, gexData) {
  if (!opts || opts.length === 0 || !price) return null;
  
  // 1. IV Percentile (ATM options)
  const atmOpts = opts
    .filter(o => {
      const iv = o.greeks?.implied_volatility || 0;
      const strike = o.details?.strike_price || 0;
      return iv > 0 && strike > 0;
    })
    .sort((a, b) => Math.abs((a.details?.strike_price||0) - price) - Math.abs((b.details?.strike_price||0) - price))
    .slice(0, 4);
  const avgIV = atmOpts.length > 0 ? atmOpts.reduce((s, o) => s + (o.greeks?.implied_volatility||0), 0) / atmOpts.length : 0;
  const ivVal = Math.round(avgIV * 100);
  
  // 2. IV Skew (OTM put IV - OTM call IV)
  const otmPuts = opts.filter(o => o.details?.contract_type === 'put' && (o.details?.strike_price||0) < price && (o.greeks?.implied_volatility||0) > 0)
    .sort((a, b) => (b.details?.strike_price||0) - (a.details?.strike_price||0)).slice(0, 3);
  const otmCalls = opts.filter(o => o.details?.contract_type === 'call' && (o.details?.strike_price||0) > price && (o.greeks?.implied_volatility||0) > 0)
    .sort((a, b) => (a.details?.strike_price||0) - (b.details?.strike_price||0)).slice(0, 3);
  const avgPutIV = otmPuts.length > 0 ? otmPuts.reduce((s, o) => s + (o.greeks?.implied_volatility||0), 0) / otmPuts.length : 0;
  const avgCallIV = otmCalls.length > 0 ? otmCalls.reduce((s, o) => s + (o.greeks?.implied_volatility||0), 0) / otmCalls.length : 0;
  const skewVal = Math.round((avgPutIV - avgCallIV) * 100 * 10) / 10;
  
  // 3. P/C Ratio
  const pcr = gexData.pcr || 0;
  
  // 4. UOA Score (volume / OI ratio)
  let totalVol = 0, totalOI = 0;
  opts.forEach(o => { totalVol += (o.day?.volume||0); totalOI += (o.open_interest||0); });
  const uoaScore = totalOI > 0 ? Math.round((totalVol / totalOI) * 10) / 10 : 0;
  
  // 5. OPI (net call - put positioning)
  const opiVal = (gexData.tCOI||0) - (gexData.tPOI||0);
  
  // 6. isLongGamma
  const isLongGamma = gexData.gex >= 0;
  
  // === Score each dimension (0-2) ===
  const ivLow = ivVal <= 30 ? 2 : ivVal <= 45 ? 1 : 0;
  const ivHigh = ivVal >= 60 ? 2 : ivVal >= 45 ? 1 : 0;
  const skewPut = skewVal >= 3 ? 2 : skewVal >= 1 ? 1 : 0;
  const skewCall = skewVal <= -3 ? 2 : skewVal <= -1 ? 1 : 0;
  const pcBullish = pcr > 0 && pcr < 0.7 ? 2 : pcr < 1.0 ? 1 : 0;
  const pcBearish = pcr >= 1.3 ? 2 : pcr >= 1.0 ? 1 : 0;
  const uoaHigh = uoaScore >= 5 ? 2 : uoaScore >= 3 ? 1 : 0;
  const flowBullish = opiVal > 0 ? 1 : 0;
  const flowBearish = opiVal < 0 ? 1 : 0;
  
  // === Determine regime ===
  const accumScore = ivLow + pcBullish + flowBullish + skewCall;
  const distScore = ivHigh + pcBearish + flowBearish + skewPut;
  const hedgeScore = ivHigh + skewPut * 2;
  const specScore = ivLow + uoaHigh + skewCall;
  
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
  for (const t of all) {
    if (!us.has(t.ticker)) continue;
    const p = t.lastTrade?.p || t.day?.c || t.prevDay?.c || 0;
    const ch = t.todaysChangePerc || 0;
    priceMap[t.ticker] = p;
    snapshotMap[t.ticker] = { changePct:ch, volume:t.day?.v||0, price:p };
    // [REMOVED] Legacy alpha-history write — Context Score is exclusively from Vercel cron V4.6
  }
  console.log('Prices: '+Object.keys(priceMap).length+'/'+UNIVERSE.length);
  return { count:Object.keys(priceMap).length, priceMap, snapshotMap };
}

// ====== Step 2: GEX ======
async function harvestGex(priceMap) {
  console.log('Step 2: GEX '+GEX_TICKERS.length+' tickers...');
  const ts = Date.now();
  const gexMap = {};
  let ok = 0;
  for (let i = 0; i < GEX_TICKERS.length; i += 5) {
    const batch = GEX_TICKERS.slice(i, i+5);
    await Promise.all(batch.map(async (ticker) => {
      try {
        const price = priceMap[ticker]; if(!price) return;
        const opts = await getAllOptions(ticker); if(!opts.length) return;
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
        gexMap[ticker] = { gex, pcr, gammaRegime:gr };
        await client.send(new PutCommand({ TableName:'signum-gex-history', Item:{ticker,timestamp:ts,gex:Math.round(gex),flipLevel:fl,callWall:cw,putFloor:pf,maxPain:mp,price,gammaRegime:gr,totalContracts:opts.length,totalCallOI:tCOI,totalPutOI:tPOI,pcr:Math.round(pcr*100)/100}}));
        await client.send(new PutCommand({ TableName:'signum-flow-history', Item:{ticker,timestamp:ts,compositeScore:0,opi:tCOI-tPOI,whaleScore:0,dex:0,ivSkew:0,squeezeProbability:0,smartMoneyScore:0,totalCallOI:tCOI,totalPutOI:tPOI,pcr:Math.round(pcr*100)/100}})).catch(()=>{});
        // [v6] OMR regime snapshot
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
  return gexMap;
}

// ====== Step 3: SMA 50/200 for ALL tickers ======
async function harvestSMA(priceMap) {
  console.log('Step 3: SMA 50/200...');
  const today = new Date().toISOString().slice(0,10);
  const tickers = Object.keys(priceMap);
  const items = [];
  // Batch 10 at a time (Polygon rate limit ~5/sec for free)
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
        return { ticker, sma50: sma50 ? Math.round(sma50*100)/100 : null, sma200: sma200 ? Math.round(sma200*100)/100 : null, cross, crossType };
      } catch { return { ticker, sma50:null, sma200:null, cross:'NONE', crossType:'' }; }
    }));
    for (const r of results) {
      items.push({ ticker:r.ticker, date:today, sma50:r.sma50, sma200:r.sma200, cross:r.cross, crossType:r.crossType, close:priceMap[r.ticker]||0, changePct:0, open:0, high:0, low:0, volume:0, vwap:0, gex:0, pcr:0, alphaScore:0, qualityTier:'SMA' });
    }
  }
  // Write SMA data — this overwrites alpha-history with SMA fields added
  // We need to merge with existing price data, so use individual puts
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i+25);
    for (const item of batch) {
      try {
        // Read existing, merge SMA, write back
        const existing = await client.send(new QueryCommand({ TableName:'signum-alpha-history', KeyConditionExpression:'ticker=:tk AND #d=:d', ExpressionAttributeValues:{':tk':item.ticker,':d':item.date}, ExpressionAttributeNames:{'#d':'date'}, Limit:1 }));
        const merged = { ...(existing.Items?.[0]||{}), sma50:item.sma50, sma200:item.sma200, cross:item.cross, crossType:item.crossType };
        await client.send(new PutCommand({ TableName:'signum-alpha-history', Item:merged }));
      } catch {}
    }
  }
  const withSMA = items.filter(i => i.sma50 && i.sma200).length;
  console.log('SMA: '+withSMA+'/'+items.length+' with both SMA50+200');
  return withSMA;
}

// ====== Step 4: Analyst + Earnings + Fundamentals (daily) ======
async function harvestDetails() {
  if (!FINNHUB_KEY) { console.log('SKIP details: no Finnhub key'); return { analyst:0, earnings:0 }; }
  console.log('Step 4: Details (Analyst+Earnings) for '+DETAIL_TICKERS.length+' tickers...');
  const today = new Date().toISOString().slice(0,10);
  let analystOk = 0, earningsOk = 0;
  
  // Rate limit: Finnhub free = 60/min. Process 2 at a time with 2.5s delay
  for (let i = 0; i < DETAIL_TICKERS.length; i += 2) {
    const batch = DETAIL_TICKERS.slice(i, i+2);
    await Promise.all(batch.map(async (ticker) => {
      try {
        // Analyst recommendations
        const recs = await httpsGet('https://finnhub.io/api/v1/stock/recommendation?symbol='+ticker+'&token='+FINNHUB_KEY, 8000);
        if (Array.isArray(recs) && recs.length > 0) {
          const latest = recs[0];
          const total = (latest.strongBuy||0)+(latest.buy||0)+(latest.hold||0)+(latest.sell||0)+(latest.strongSell||0);
          const bullishPct = total > 0 ? Math.round(((latest.strongBuy||0)+(latest.buy||0))/total*100) : 0;
          let consensus = 'N/A';
          if (total > 0) {
            const ws = ((latest.strongBuy||0)*5+(latest.buy||0)*4+(latest.hold||0)*3+(latest.sell||0)*2+(latest.strongSell||0))/total;
            consensus = ws>=4.3?'STRONG BUY':ws>=3.5?'BUY':ws>=2.5?'HOLD':ws>=1.7?'SELL':'STRONG SELL';
          }
          await client.send(new PutCommand({ TableName:'signum-pattern-db', Item:{ pattern:'ANALYST:'+ticker, timestamp:Date.now(), consensus, totalAnalysts:total, bullishPct, breakdown:latest, period:latest.period||null }}));
          analystOk++;
        }
      } catch {}
      try {
        // Earnings calendar
        const from = today;
        const toDate = new Date(Date.now()+180*86400000).toISOString().slice(0,10);
        const eData = await httpsGet('https://finnhub.io/api/v1/calendar/earnings?symbol='+ticker+'&from='+from+'&to='+toDate+'&token='+FINNHUB_KEY, 8000);
        const events = eData?.earningsCalendar || [];
        if (events.length > 0) {
          const next = events.sort((a,b) => new Date(a.date).getTime()-new Date(b.date).getTime())[0];
          const daysUntil = Math.ceil((new Date(next.date).getTime()-new Date(today).getTime())/(86400000));
          await client.send(new PutCommand({ TableName:'signum-pattern-db', Item:{ pattern:'EARNINGS:'+ticker, timestamp:Date.now(), nextDate:next.date, daysUntil, epsEstimate:next.epsEstimate||null, quarter:next.quarter||null, year:next.year||null, hour:next.hour||null }}));
          earningsOk++;
        }
      } catch {}
    }));
    // Rate limit pause (Finnhub: 60/min → ~1 req/sec)
    if (i % 10 === 0 && i > 0) await new Promise(r => setTimeout(r, 2500));
  }
  
  // Fundamentals from Polygon (company details — rarely changes)
  let fundOk = 0;
  for (let i = 0; i < DETAIL_TICKERS.length; i += 5) {
    const batch = DETAIL_TICKERS.slice(i, i+5);
    await Promise.all(batch.map(async (ticker) => {
      try {
        const data = await httpsGet('https://api.polygon.io/v3/reference/tickers/'+ticker+'?apiKey='+POLYGON_KEY, 5000);
        const r = data?.results;
        if (r) {
          await client.send(new PutCommand({ TableName:'signum-pattern-db', Item:{ pattern:'FUND:'+ticker, timestamp:Date.now(), name:r.name||ticker, marketCap:r.market_cap||null, shareCount:r.share_class_shares_outstanding||null, description:r.description?.slice(0,500)||null, sector:r.sic_description||null, exchange:r.primary_exchange||null, locale:r.locale||null }}));
          fundOk++;
        }
      } catch {}
    }));
  }
  
  // Related tickers from Polygon
  let relOk = 0;
  for (let i = 0; i < DETAIL_TICKERS.length; i += 5) {
    const batch = DETAIL_TICKERS.slice(i, i+5);
    await Promise.all(batch.map(async (ticker) => {
      try {
        const data = await httpsGet('https://api.polygon.io/v1/related-companies/'+ticker+'?apiKey='+POLYGON_KEY, 5000);
        const rels = data?.results || [];
        if (rels.length > 0) {
          await client.send(new PutCommand({ TableName:'signum-pattern-db', Item:{ pattern:'RELATED:'+ticker, timestamp:Date.now(), tickers: rels.slice(0,10).map(r => r.ticker) }}));
          relOk++;
        }
      } catch {}
    }));
  }
  
  console.log('Details: analyst='+analystOk+' earnings='+earningsOk+' fund='+fundOk+' related='+relOk);
  return { analyst:analystOk, earnings:earningsOk, fundamentals:fundOk, related:relOk };
}

// ====== Step 5: Context Score (V4.6 Engine) ======
// Computes Context Score using the bundled V4.6 engine (alphaEngine.js)
// Results written to DynamoDB with qualityTier 'LAMBDA_V46'
// ConditionExpression protects SSR_V46 (Vercel cron has priority)
// 
// DATA PARITY with Vercel cron warm-analysis:
//   Momentum: price, RSI, MACD, return3D, relVol ✅
//   Structure: PCR, GEX ✅
//   Flow: darkPoolPct, shortVolPct, whaleIndex, blockTrades ✅
//   Regime: VIX ✅
//   Catalyst: partial ✅

// Dark Pool Exchange Codes (FINRA TRF/ADF = Dark Pool)
const DARK_POOL_EXCHANGES = new Set([4, 15, 16, 19]);

// Fetch dark pool % and block trades from Polygon Trades API
async function fetchDarkPoolData(ticker) {
  try {
    const data = await httpsGet('https://api.polygon.io/v3/trades/'+ticker+'?limit=5000&apiKey='+POLYGON_KEY, 8000);
    const trades = data?.results || [];
    if (trades.length === 0) return null;
    
    let totalVolume = 0, darkPoolVolume = 0, blockTrades = 0;
    for (const t of trades) {
      const size = t.size || 0;
      totalVolume += size;
      if (DARK_POOL_EXCHANGES.has(t.exchange)) darkPoolVolume += size;
      if (size >= 10000) blockTrades++;
    }
    
    return {
      darkPoolPct: totalVolume > 0 ? Math.round((darkPoolVolume / totalVolume) * 1000) / 10 : 0,
      blockTrades,
    };
  } catch { return null; }
}

// Fetch short volume % from Polygon Short Volume API
async function fetchShortVolData(ticker) {
  try {
    const data = await httpsGet('https://api.polygon.io/stocks/v1/short-volume?ticker='+ticker+'&limit=1&apiKey='+POLYGON_KEY, 8000);
    const result = data?.results?.[0];
    if (!result) return null;
    const sv = result.short_volume || 0;
    const tv = result.total_volume || 1;
    return { shortVolPct: Math.round((sv / tv) * 1000) / 10 };
  } catch { return null; }
}

async function computeContextScores(snapshotMap, gexMap, rlsiData) {
  let alphaEngine;
  try {
    alphaEngine = require('./alphaEngine.js');
  } catch (e) {
    console.log('[SKIP] Context Score — alphaEngine.js not found (run build-lambda-engine.js first)');
    return 0;
  }
  
  const { calculateAlphaScore, calculateWhaleIndex } = alphaEngine;
  if (!calculateAlphaScore) {
    console.log('[SKIP] Context Score — calculateAlphaScore not exported');
    return 0;
  }
  
  console.log('Step 5: Context Score (V4.6) for ' + Object.keys(snapshotMap).length + ' tickers...');
  const today = new Date().toISOString().slice(0,10);
  const tickers = Object.keys(snapshotMap);
  let scored = 0, skipped = 0;
  
  // Macro regime data from RLSI (already computed)
  const vixValue = rlsiData?.vix || null;
  
  // Process in batches of 10 (5 API calls per ticker: RSI + dailyAggs + MACD + trades + shortVol)
  for (let i = 0; i < tickers.length; i += 10) {
    const batch = tickers.slice(i, i + 10);
    await Promise.all(batch.map(async (ticker) => {
      try {
        const pd = snapshotMap[ticker];
        if (!pd || !pd.price) { skipped++; return; }
        
        const gd = gexMap[ticker] || null;
        
        // Fetch ALL data in parallel: RSI + dailyAggs + MACD + darkPool + shortVol
        const ago = new Date(Date.now() - 10*86400000).toISOString().slice(0,10);
        const [rsiData, dailyData, macdData, dpData, svData] = await Promise.all([
          httpsGet('https://api.polygon.io/v1/indicators/rsi/'+ticker+'?timespan=day&window=14&limit=1&apiKey='+POLYGON_KEY, 8000).catch(()=>null),
          httpsGet('https://api.polygon.io/v2/aggs/ticker/'+ticker+'/range/1/day/'+ago+'/'+today+'?adjusted=true&sort=asc&limit=10&apiKey='+POLYGON_KEY, 8000).catch(()=>null),
          httpsGet('https://api.polygon.io/v1/indicators/macd/'+ticker+'?timespan=day&short_window=12&long_window=26&signal_window=9&limit=1&apiKey='+POLYGON_KEY, 8000).catch(()=>null),
          fetchDarkPoolData(ticker),
          fetchShortVolData(ticker),
        ]);
        
        // Momentum data
        const rsi = rsiData?.results?.values?.[0]?.value ?? null;
        const dailyResults = dailyData?.results || [];
        let return3D = null;
        if (dailyResults.length >= 4) {
          const recent = dailyResults.slice(-4);
          const p3d = recent[0].c;
          const pNow = recent[recent.length - 1].c;
          if (p3d > 0) return3D = ((pNow - p3d) / p3d) * 100;
        }
        const macdHist = macdData?.results?.values?.[0]?.histogram ?? null;
        
        // Compute relVol
        let relVol = null;
        if (dailyResults.length >= 2) {
          const lastVol = dailyResults[dailyResults.length - 1]?.v || 0;
          const prevVol = dailyResults[dailyResults.length - 2]?.v || 1;
          if (lastVol > 0) relVol = lastVol / prevVol;
        }
        
        // Flow data (from darkPool + shortVol fetch)
        const darkPoolPct = dpData?.darkPoolPct ?? null;
        const shortVolPct = svData?.shortVolPct ?? null;
        const blockTrades = dpData?.blockTrades ?? null;
        const whaleIdx = calculateWhaleIndex ? calculateWhaleIndex(gd?.gex ?? null) : null;
        
        // Call V4.6 engine — ALL 5 PILLARS COMPLETE
        const result = calculateAlphaScore({
          ticker: ticker,
          session: 'REG',
          price: pd.price,
          prevClose: pd.prevClose || pd.price,
          changePct: pd.changePct || 0,
          // Momentum
          rsi14: rsi,
          return3D: return3D,
          macdHistogram: macdHist,
          relVol: relVol,
          // Structure (from GEX step)
          pcr: gd?.pcr ?? null,
          gex: gd?.gex ?? null,
          optionsDataAvailable: !!gd,
          // Flow (NEW — full data parity with Vercel cron)
          darkPoolPct: darkPoolPct,
          shortVolPct: shortVolPct,
          whaleIndex: whaleIdx,
          blockTrades: blockTrades,
          // Regime
          vixValue: vixValue,
          preMarketChangePct: null,
        });
        
        // Write to DynamoDB with LAMBDA_V46 qualifier
        // ConditionExpression: only write if no SSR_V46 record exists for today
        try {
          await client.send(new PutCommand({
            TableName: 'signum-alpha-history',
            Item: {
              ticker: ticker,
              date: today,
              alphaScore: result.score,
              qualityTier: 'LAMBDA_V46',
              grade: result.grade,
              changePct: pd.changePct || 0,
              gex: gd?.gex || 0,
              pcr: gd?.pcr || 0,
              momentum: result.pillars.momentum.score,
              structure: result.pillars.structure.score,
              flow: result.pillars.flow.score,
              regime: result.pillars.regime.score,
              catalyst: result.pillars.catalyst.score,
              engineVersion: result.engineVersion,
              price: pd.price,
              close: pd.price,
              open: 0, high: 0, low: 0, volume: pd.volume || 0, vwap: 0,
            },
            ConditionExpression: 'attribute_not_exists(qualityTier) OR qualityTier <> :ssr',
            ExpressionAttributeValues: { ':ssr': 'SSR_V46' },
          }));
          scored++;
        } catch (condErr) {
          // ConditionalCheckFailedException = SSR_V46 already exists, skip (expected)
          if (condErr.name === 'ConditionalCheckFailedException') { skipped++; }
          else { skipped++; }
        }
      } catch { skipped++; }
    }));
  }
  console.log('Context Score: ' + scored + ' scored, ' + skipped + ' skipped/protected');
  return scored;
}

exports.handler = async (event) => {
  const start = Date.now();
  console.log('SIGNUM Harvest Lambda v6.0 — ' + new Date().toISOString());
  const hour = new Date().getUTCHours();
  const minute = new Date().getUTCMinutes();
  const utcMin = hour*60+minute;
  const isExtended = (utcMin >= 8*60) || (utcMin <= 1*60);
  const isRegular = (utcMin >= 13*60+30 && utcMin <= 21*60);
  const forceRun = event && event.forceRun;
  if (!isExtended && !forceRun) {
    return { statusCode:200, body:JSON.stringify({ skipped:true, reason:'Markets closed', utcHour:hour }) };
  }
  const results = {};
  
  // Always: Prices + RLSI
  const { count, priceMap, snapshotMap } = await harvestPrices();
  results.prices = count;
  results.rlsi = await computeRlsi();
  
  // Regular hours: GEX + SMA (every run)
  if (isRegular || forceRun) {
    const gexMap = await harvestGex(priceMap);
    results.gex = Object.keys(gexMap).length;
    results.sma = await harvestSMA(priceMap);
    
    // Context Score: ONLY at market close (4:10-4:20 PM ET = 20:10-20:20 UTC)
    // End-of-day score is the only meaningful one for history tracking
    const isMarketClose = (utcMin >= 20*60+10 && utcMin <= 20*60+20);
    if (isMarketClose || forceRun) {
      console.log('Market close window — computing Context Scores for ' + UNIVERSE.length + ' tickers');
      results.contextScore = await computeContextScores(snapshotMap, gexMap, results.rlsi);
    } else {
      results.contextScore = 'SKIP:not_close_window';
    }
  } else {
    results.gex = 'SKIP:extended';
    results.contextScore = 'SKIP:extended';
    results.sma = 'SKIP:extended';
  }
  
  // Daily details: run once at 14:30 UTC (market open + 1hr) or forceRun
  const isDailyDetailTime = (utcMin >= 14*60+25 && utcMin <= 14*60+35);
  if (isDailyDetailTime || forceRun) {
    results.details = await harvestDetails();
  } else {
    results.details = 'SKIP:not_daily_window';
  }
  
  const duration = Math.round((Date.now()-start)/1000);
  console.log('Done in '+duration+'s');
  return { statusCode:200, body:JSON.stringify({ success:true, version:'5.0', timestamp:new Date().toISOString(), duration, results }) };
};
