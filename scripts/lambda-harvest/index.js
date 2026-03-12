
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
const UNIVERSE = ["AAPL","ABBV","ABNB","ABT","ACN","ADBE","ADI","ADP","AEP","AFRM","AI","AMAT","AMD","AMGN","AMZN","ANET","ANSS","APD","ARE","ARM","ASML","ASTS","AVGO","AWK","AXP","BA","BAC","BBY","BIIB","BKNG","BLK","BMY","BSX","C","CARR","CAT","CCI","CCJ","CDNS","CEG","CF","CHTR","CL","CMCSA","COIN","COP","COST","CPRT","CRM","CRWD","CTAS","CTSH","CVS","CVX","D","DASH","DD","DDOG","DE","DELL","DHR","DIS","DKNG","DLR","DOV","DOW","DPZ","DUK","DVN","DXCM","EA","EBAY","ECL","EL","EMR","ENPH","EOG","EQIX","EQR","ETN","FAST","FCX","FDX","FSLR","FTNT","FTV","GD","GE","GEV","GILD","GIS","GM","GOOGL","GRMN","GS","HAL","HCA","HD","HON","HOOD","HSIC","HSY","HUBS","HUM","IBM","ICE","IDXX","IFF","ILMN","INCY","INTC","IONQ","IP","IQV","IR","ISRG","IT","ITW","JNJ","JPM","KDP","KEY","KHC","KLAC","KMB","KO","KR","KTOS","LDOS","LIN","LLY","LMT","LOW","LRCX","LULU","LUNR","LVS","LYB","LYV","MA","MAR","MARA","MBLY","MCD","MCHP","MCO","MDB","MDLZ","MDT","MELI","MET","META","MGM","MNST","MO","MPC","MPWR","MRK","MRNA","MRVL","MS","MSCI","MSFT","MSI","MSTR","MTB","MTD","MU","NDAQ","NDSN","NEE","NEM","NET","NFLX","NKE","NOC","NOW","NSC","NTRS","NUE","NVDA","NVO","O","ODFL","OKTA","ON","ORCL","ORLY","OTIS","OXY","PANW","PARA","PATH","PAYX","PCAR","PCG","PEAK","PEG","PEP","PFE","PG","PHM","PL","PLD","PLTR","PM","PNC","PONY","POOL","PPG","PSA","PSX","PTC","PWR","PYPL","QCOM","REGN","RIOT","RIVN","RKLB","ROK","ROKU","ROP","ROST","RSG","RTX","S","SBAC","SBUX","SCHW","SE","SEDG","SERV","SHOP","SHW","SLB","SMCI","SMR","SNA","SNOW","SNPS","SO","SOFI","SPG","SQ","SRE","STE","STT","STX","STZ","SWK","SWKS","SYK","SYM","SYY","T","TDG","TEAM","TEL","TER","TFC","TJX","TMO","TMUS","TRGP","TROW","TRV","TSLA","TSM","TT","TTWO","TWLO","TXN","TYL","UBER","UNH","UNP","UPS","UPST","URI","USB","V","VFC","VICI","VKTX","VLO","VMC","VRSK","VRTX","VST","VTR","VTRS","VZ","WDAY","WELL","WFC","WMT","XOM","XYZ","ZS"];
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
    items.push({ ticker:t.ticker, date:today, qualityTier:'LIVE', changePct:Math.round(ch*100)/100, open:t.day?.o||0, high:t.day?.h||0, low:t.day?.l||0, close:t.day?.c||p, volume:t.day?.v||0, vwap:t.day?.vw||0, gex:0, pcr:0, alphaScore:0 });
  }
  if (items.length > 0) await batchWrite('signum-alpha-history', items);
  console.log('Prices: '+items.length+'/'+UNIVERSE.length);
  return { count:items.length, priceMap, snapshotMap };
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

        // ====== ATM IV + IV Skew ======
        let atmIv = null, ivSkew = null;
        try {
          // Find ATM options (closest strike to current price)
          const callsByDist = opts.filter(o => o.details?.contract_type === 'call' && o.greeks?.implied_volatility > 0)
            .sort((a, b) => Math.abs(a.details.strike_price - price) - Math.abs(b.details.strike_price - price));
          const putsByDist = opts.filter(o => o.details?.contract_type === 'put' && o.greeks?.implied_volatility > 0)
            .sort((a, b) => Math.abs(a.details.strike_price - price) - Math.abs(b.details.strike_price - price));
          const atmCall = callsByDist[0];
          const atmPut = putsByDist[0];
          if (atmCall) atmIv = Math.round(atmCall.greeks.implied_volatility * 10000) / 100; // as %
          if (atmCall && atmPut) {
            ivSkew = Math.round((atmPut.greeks.implied_volatility - atmCall.greeks.implied_volatility) * 10000) / 100;
          }
        } catch {}

        // ====== Squeeze Score ======
        let squeezeScore = 0;
        // Factor 1: Gamma regime (negative gamma = higher squeeze risk)
        if (gr === 'NEGATIVE') squeezeScore += 35;
        else if (gr === 'NEUTRAL') squeezeScore += 15;
        // Factor 2: PCR (high = more puts = squeeze risk)
        if (pcr > 1.5) squeezeScore += 25;
        else if (pcr > 1.0) squeezeScore += 15;
        else if (pcr > 0.7) squeezeScore += 5;
        // Factor 3: Price near gamma flip (close to flip = instability)
        if (fl && price) {
          const distPct = Math.abs(price - fl) / price * 100;
          if (distPct < 1) squeezeScore += 20;
          else if (distPct < 3) squeezeScore += 10;
        }
        // Factor 4: High IV = elevated squeeze risk
        if (atmIv && atmIv > 80) squeezeScore += 20;
        else if (atmIv && atmIv > 50) squeezeScore += 10;
        squeezeScore = Math.min(100, squeezeScore);

        gexMap[ticker] = { gex, pcr, gammaRegime:gr, atmIv, squeezeScore };
        await client.send(new PutCommand({ TableName:'signum-gex-history', Item:{ticker,timestamp:ts,gex:Math.round(gex),flipLevel:fl,callWall:cw,putFloor:pf,maxPain:mp,price,gammaRegime:gr,totalContracts:opts.length,totalCallOI:tCOI,totalPutOI:tPOI,pcr:Math.round(pcr*100)/100,atmIv:atmIv,ivSkew:ivSkew,squeezeScore:squeezeScore}}));
        await client.send(new PutCommand({ TableName:'signum-flow-history', Item:{ticker,timestamp:ts,compositeScore:0,opi:tCOI-tPOI,whaleScore:0,dex:0,ivSkew:ivSkew||0,squeezeProbability:squeezeScore,smartMoneyScore:0,totalCallOI:tCOI,totalPutOI:tPOI,pcr:Math.round(pcr*100)/100}})).catch(()=>{});
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
  console.log('Step 4: Details (Analyst+Earnings+Fund+Related) for '+UNIVERSE.length+' tickers...');
  const today = new Date().toISOString().slice(0,10);
  let analystOk = 0, earningsOk = 0;
  
  // Rate limit: Finnhub free = 60/min. Process 2 at a time with 2.5s delay
  for (let i = 0; i < UNIVERSE.length; i += 2) {
    const batch = UNIVERSE.slice(i, i+2);
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
  for (let i = 0; i < UNIVERSE.length; i += 5) {
    const batch = UNIVERSE.slice(i, i+5);
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
  for (let i = 0; i < UNIVERSE.length; i += 5) {
    const batch = UNIVERSE.slice(i, i+5);
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
// ====== Redis Cache Warming Orchestrator ======
// Triggers Vercel /api/cron/warm-command for all 30 batches (300 tickers)
// This ensures all universe tickers have complete unified data in Redis (0ms access)
const VERCEL_URL = process.env.VERCEL_URL || 'https://signumhq.com';
const TOTAL_BATCHES = 30; // 300 tickers / 10 per batch

async function warmRedisCache() {
  console.log('[CacheWarm] Starting full Redis cache warming — ' + TOTAL_BATCHES + ' batches...');
  const start = Date.now();
  const CONCURRENCY = 3; // 3 concurrent Vercel function invocations
  let success = 0, fail = 0;

  for (let i = 0; i < TOTAL_BATCHES; i += CONCURRENCY) {
    const batchPromises = [];
    for (let j = 0; j < CONCURRENCY && (i + j) < TOTAL_BATCHES; j++) {
      const batchNum = i + j;
      const url = VERCEL_URL + '/api/cron/warm-command?batch=' + batchNum;
      batchPromises.push(
        httpsGet(url.replace('http://', 'https://'), 55000)
          .then(r => { success++; return r; })
          .catch(e => { fail++; console.warn('[CacheWarm] Batch ' + batchNum + ' failed: ' + e.message); })
      );
    }
    await Promise.all(batchPromises);
    // Small delay between batch groups to avoid overwhelming
    if (i + CONCURRENCY < TOTAL_BATCHES) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  const duration = Math.round((Date.now() - start) / 1000);
  console.log('[CacheWarm] Done: ' + success + ' ok, ' + fail + ' fail in ' + duration + 's');
  return { success, fail, duration };
}

// ====== Flow Cache Warming ======
// Triggers Vercel /api/cron/warm-flow once (30 tickers in single call)
// Ensures all top flow tickers have pre-computed data in Redis + DynamoDB
async function warmFlowCache() {
  console.log('[FlowWarm] Triggering warm-flow cron...');
  const start = Date.now();
  try {
    const url = VERCEL_URL + '/api/cron/warm-flow';
    const result = await httpsGet(url.replace('http://', 'https://'), 55000);
    const duration = Math.round((Date.now() - start) / 1000);
    console.log('[FlowWarm] Done in ' + duration + 's — warmed: ' + (result?.warmed || 0));
    return { success: true, warmed: result?.warmed || 0, duration };
  } catch (e) {
    console.warn('[FlowWarm] Failed: ' + e.message);
    return { success: false, error: e.message };
  }
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
  
  // Regular hours: GEX + Alpha + SMA
  if (isRegular || forceRun) {
    const gexMap = await harvestGex(priceMap);
    results.gex = Object.keys(gexMap).length;
    results.alpha = await updateAlphaScores(snapshotMap, gexMap);
    results.sma = await harvestSMA(priceMap);
  } else {
    results.gex = 'SKIP:extended';
    results.sma = 'SKIP:extended';
  }
  
  // Daily details: run once at 14:30 UTC (market open + 1hr) or forceRun
  const isDailyDetailTime = (utcMin >= 14*60+25 && utcMin <= 14*60+45);
  if (isDailyDetailTime || forceRun) {
    results.details = await harvestDetails();
  } else {
    results.details = 'SKIP:not_daily_window';
  }

  // Redis + Flow Cache Warming: warm all tickers during regular hours
  if (isRegular || forceRun) {
    try {
      const [commandWarm, flowWarm] = await Promise.all([
        warmRedisCache(),
        warmFlowCache(),
      ]);
      results.cacheWarm = commandWarm;
      results.flowWarm = flowWarm;
    } catch (e) {
      results.cacheWarm = { error: e.message };
    }
  } else {
    results.cacheWarm = 'SKIP:extended';
    results.flowWarm = 'SKIP:extended';
  }
  
  const duration = Math.round((Date.now()-start)/1000);
  console.log('Done in '+duration+'s');
  return { statusCode:200, body:JSON.stringify({ success:true, version:'7.0', timestamp:new Date().toISOString(), duration, results }) };
};
