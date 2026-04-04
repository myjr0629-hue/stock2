/**
 * Test: Lambda structureService compatibility verification
 * Compares Lambda's new getWeeklyOptions + harvestGex logic vs production structureService API
 */
require('dotenv').config({ path: '.env.local' });
const https = require('https');

const POLYGON_KEY = process.env.POLYGON_API_KEY || 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.signumhq.com';

function httpsGet(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
    https.get(url, { headers: { 'User-Agent': 'SIGNUM-TEST/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { clearTimeout(to); try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on('error', (e) => { clearTimeout(to); reject(e); });
  });
}

// ── Lambda logic (copied from deploy-lambda-v7.js) ──

function getNextTradingDayET() {
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const isDST = month >= 3 && month <= 11;
  const etOffset = isDST ? 4 : 5;
  const day = now.getUTCDay();
  let daysToAdd = 0;
  if (day === 6) daysToAdd = 2;
  else if (day === 0) daysToAdd = 1;
  const target = new Date(now);
  target.setUTCDate(target.getUTCDate() + daysToAdd);
  return target.toISOString().slice(0, 10);
}

function findWeeklyExp(expirations) {
  if (!expirations || expirations.length === 0) return '';
  const sorted = [...expirations].sort();
  const now = new Date();
  const day = now.getUTCDay();
  const month = now.getUTCMonth() + 1;
  const isDST = month >= 3 && month <= 11;
  const etOffset = isDST ? 4 : 5;
  const etHour = (now.getUTCHours() - etOffset + 24) % 24;
  let daysToFriday = (5 - day + 7) % 7;
  if (daysToFriday === 0 && etHour >= 16) daysToFriday = 7;
  const friday = new Date(now);
  friday.setUTCDate(friday.getUTCDate() + daysToFriday);
  const expectedWeekly = friday.toISOString().slice(0, 10);
  if (sorted.includes(expectedWeekly)) return expectedWeekly;
  const fridayExp = sorted.find(exp => new Date(exp + 'T12:00:00').getDay() === 5);
  if (fridayExp) return fridayExp;
  const thursdayExp = sorted.find(exp => new Date(exp + 'T12:00:00').getDay() === 4);
  if (thursdayExp) return thursdayExp;
  return sorted[0];
}

async function getWeeklyOptions(ticker) {
  const todayStr = getNextTradingDayET();
  let availableExps = [], targetExpiry = '';
  
  try {
    const refUrl = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date.gte=${todayStr}&order=asc&limit=1000&apiKey=${POLYGON_KEY}`;
    const refData = await httpsGet(refUrl, 8000);
    if (refData?.results) {
      const exps = [...new Set(refData.results.map(c => c.expiration_date))].filter(Boolean).sort();
      availableExps = exps.slice(0, 10);
      targetExpiry = findWeeklyExp(exps);
    }
  } catch (e) { console.log('  Reference API failed:', e.message); }
  
  if (!targetExpiry) targetExpiry = todayStr;
  
  let allContracts = [];
  let pages = 0;
  let url = `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date=${targetExpiry}&limit=250&apiKey=${POLYGON_KEY}`;
  while (url && pages < 10) {
    const data = await httpsGet(url, 10000);
    if (!data?.results) break;
    allContracts = allContracts.concat(data.results);
    url = data.next_url ? data.next_url + '&apiKey=' + POLYGON_KEY : null;
    pages++;
  }
  return { contracts: allContracts, expiration: targetExpiry, availableExps, pages };
}

function calculateStructureCompat(opts, price, expiration) {
  const cleanContracts = [];
  let totalCallOI = 0, totalPutOI = 0;
  for (const c of opts) {
    const k = c.details?.strike_price || c.strike_price || 0;
    const type = (c.details?.contract_type || c.contract_type || 'call').toLowerCase();
    const oi = c.open_interest;
    if (oi !== undefined && oi !== null) {
      cleanContracts.push({ ...c, k, type, oi });
      if (type === 'call') totalCallOI += oi;
      else totalPutOI += oi;
    }
  }
  
  const pcr = totalCallOI > 0 ? Math.round((totalPutOI / totalCallOI) * 100) / 100 : 0;
  
  // Net GEX + callWall/putFloor ±20%
  let netGex = 0, callWall = null, putFloor = null;
  let maxCallOi = -1, maxPutOi = -1, gammaCount = 0;
  const maxResist = price * 1.20, minSupport = price * 0.80;
  
  cleanContracts.forEach(c => {
    const g = c.greeks?.gamma;
    if (typeof g === 'number' && isFinite(g)) {
      netGex += g * c.oi * 100 * (c.type === 'call' ? -1 : 1) * price;
      gammaCount++;
    }
    if (c.type === 'call' && c.k > price && c.k <= maxResist && c.oi > maxCallOi) { maxCallOi = c.oi; callWall = c.k; }
    if (c.type === 'put' && c.k < price && c.k >= minSupport && c.oi > maxPutOi) { maxPutOi = c.oi; putFloor = c.k; }
  });
  
  // Max Pain
  let maxPain = null, minLoss = Infinity;
  const distinctStrikes = [...new Set(cleanContracts.map(c => c.k))].sort((a, b) => a - b);
  distinctStrikes.forEach(ts => {
    let loss = 0;
    cleanContracts.forEach(c => {
      if (c.type === 'call' && ts > c.k) loss += (ts - c.k) * c.oi;
      else if (c.type === 'put' && ts < c.k) loss += (c.k - ts) * c.oi;
    });
    if (loss < minLoss) { minLoss = loss; maxPain = ts; }
  });
  
  // Gamma Flip
  const gexByStrike = new Map();
  cleanContracts.forEach(c => {
    const g = c.greeks?.gamma;
    if (typeof g === 'number' && isFinite(g) && g !== 0) {
      gexByStrike.set(c.k, (gexByStrike.get(c.k) || 0) + g * c.oi * 100 * (c.type === 'call' ? -1 : 1));
    }
  });
  let gammaFlipLevel = null;
  if (gexByStrike.size > 0) {
    const strikesGex = [...gexByStrike.entries()].sort((a, b) => a[0] - b[0]);
    let cum = 0;
    const crossings = [];
    for (let j = 0; j < strikesGex.length; j++) {
      const prev = cum;
      cum += strikesGex[j][1];
      if (j > 0 && ((prev < 0 && cum >= 0) || (prev > 0 && cum <= 0))) crossings.push(strikesGex[j][0]);
    }
    const atmRange = price * 0.15;
    const atmCrossings = crossings.filter(s => Math.abs(s - price) <= atmRange);
    if (atmCrossings.length > 0) gammaFlipLevel = atmCrossings.reduce((c2, s) => Math.abs(s - price) < Math.abs(c2 - price) ? s : c2);
  }
  
  // ATM IV
  let atmIv = null;
  if (cleanContracts.length > 0) {
    const ivStrikes = [...new Set(cleanContracts.map(c => c.k))].sort((a, b) => a - b);
    const atmStrike = ivStrikes.reduce((cl, s) => Math.abs(s - price) < Math.abs(cl - price) ? s : cl);
    const getIv = (c) => { const r = c?.implied_volatility || c?.greeks?.implied_volatility; return typeof r === 'number' && r > 0 ? (r > 1 ? r : r * 100) : null; };
    const cIv = getIv(cleanContracts.find(c => c.k === atmStrike && c.type === 'call'));
    const pIv = getIv(cleanContracts.find(c => c.k === atmStrike && c.type === 'put'));
    if (cIv !== null && pIv !== null) { const sp = Math.abs(cIv - pIv); atmIv = Math.round(sp > 40 ? Math.min(cIv, pIv) : (cIv + pIv) / 2); }
    else atmIv = cIv !== null ? Math.round(cIv) : (pIv !== null ? Math.round(pIv) : null);
  }
  
  const gammaCoverage = cleanContracts.length > 0 ? gammaCount / cleanContracts.length : 0;
  const gexConfidence = gammaCoverage >= 0.80 ? 'HIGH' : gammaCoverage >= 0.60 ? 'MEDIUM' : 'LOW';
  const gammaRegime = netGex > 0 ? 'POSITIVE' : netGex < 0 ? 'NEGATIVE' : 'NEUTRAL';
  
  return {
    expiration, callWall, putFloor, maxPain,
    netGex: Math.round(netGex), gammaFlipLevel, gammaRegime,
    pcr, atmIv, gexConfidence,
    totalContracts: opts.length, totalCallOI, totalPutOI,
  };
}

async function main() {
  const TICKERS = ['TSLA', 'AAPL', 'NVDA', 'META', 'AMZN'];
  
  console.log('=== Lambda structureService Compatibility Test ===');
  console.log('Time:', new Date().toISOString());
  console.log('');
  
  for (const ticker of TICKERS) {
    console.log(`── ${ticker} ──`);
    
    // 1. Get price
    const snap = await httpsGet(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${POLYGON_KEY}`, 5000);
    const price = snap?.ticker?.lastTrade?.p || snap?.ticker?.day?.c || snap?.ticker?.prevDay?.c || 0;
    console.log(`  Price: $${price}`);
    
    // 2. Lambda-style calculation
    const weeklyResult = await getWeeklyOptions(ticker);
    console.log(`  Weekly Expiration: ${weeklyResult.expiration} (${weeklyResult.contracts.length} contracts, ${weeklyResult.pages} pages)`);
    console.log(`  Available Exps: ${weeklyResult.availableExps.slice(0, 5).join(', ')}`);
    
    if (weeklyResult.contracts.length === 0) {
      console.log(`  ❌ No contracts found!`);
      continue;
    }
    
    const result = calculateStructureCompat(weeklyResult.contracts, price, weeklyResult.expiration);
    
    console.log(`  Lambda Result:`);
    console.log(`    callWall:       $${result.callWall}`);
    console.log(`    putFloor:       $${result.putFloor}`);
    console.log(`    maxPain:        $${result.maxPain}`);
    console.log(`    netGex:         ${(result.netGex / 1_000_000).toFixed(2)}M`);
    console.log(`    gammaFlip:      $${result.gammaFlipLevel}`);
    console.log(`    pcr:            ${result.pcr}`);
    console.log(`    atmIv:          ${result.atmIv}%`);
    console.log(`    gexConfidence:  ${result.gexConfidence}`);
    console.log(`    gammaRegime:    ${result.gammaRegime}`);
    console.log(`    contracts:      ${result.totalContracts}`);
    
    // 3. Compare with production structureService via API
    try {
      const prodRes = await httpsGet(`${SITE_URL}/api/live/options/atm?ticker=${ticker}`, 10000);
      if (prodRes && prodRes.expiration) {
        console.log(`  Production (structureService):`);
        console.log(`    callWall:       $${prodRes.levels?.callWall}`);
        console.log(`    putFloor:       $${prodRes.levels?.putFloor}`);
        console.log(`    maxPain:        $${prodRes.maxPain}`);
        console.log(`    netGex:         ${prodRes.netGex ? (prodRes.netGex / 1_000_000).toFixed(2) + 'M' : 'null'}`);
        console.log(`    gammaFlip:      $${prodRes.gammaFlipLevel}`);
        console.log(`    pcr:            ${prodRes.pcr}`);
        console.log(`    atmIv:          ${prodRes.atmIv}%`);
        console.log(`    expiration:     ${prodRes.expiration}`);
        
        // Compare
        const match = {
          expiration: result.expiration === prodRes.expiration,
          callWall: result.callWall === prodRes.levels?.callWall,
          putFloor: result.putFloor === prodRes.levels?.putFloor,
          maxPain: result.maxPain === prodRes.maxPain,
        };
        const allMatch = Object.values(match).every(v => v);
        console.log(`  Comparison: ${allMatch ? '✅ ALL MATCH' : '⚠️ DIFFERENCES'}`);
        if (!allMatch) {
          Object.entries(match).forEach(([k, v]) => {
            if (!v) console.log(`    ❌ ${k} differs`);
          });
        }
      } else {
        console.log(`  Production: (API returned no data or cached)`);
      }
    } catch (e) {
      console.log(`  Production: (API error: ${e.message})`);
    }
    
    console.log('');
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
