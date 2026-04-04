// Quick TSLA test — Lambda structureService compat
const https = require('https');
const K = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';

function get(u) {
  return new Promise((r, j) => {
    const t = setTimeout(() => j(new Error('TO')), 15000);
    https.get(u, (s) => {
      let d = '';
      s.on('data', c => d += c);
      s.on('end', () => { clearTimeout(t); try { r(JSON.parse(d)); } catch { r(d); } });
    }).on('error', e => { clearTimeout(t); j(e); });
  });
}

async function main() {
  // 1. Price
  const snap = await get('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/TSLA?apiKey=' + K);
  const price = snap?.ticker?.lastTrade?.p || snap?.ticker?.day?.c || snap?.ticker?.prevDay?.c || 0;
  console.log('PRICE:', price);
  
  // 2. Find weekly expiration
  const ref = await get('https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=TSLA&expiration_date.gte=2026-04-04&order=asc&limit=1000&apiKey=' + K);
  const exps = [...new Set((ref?.results || []).map(c => c.expiration_date))].filter(Boolean).sort();
  console.log('EXPIRATIONS:', exps.slice(0, 6));
  
  const friday = exps.find(e => new Date(e + 'T12:00:00').getDay() === 5);
  console.log('TARGET:', friday);
  
  // 3. Fetch options
  let all = [];
  let url = 'https://api.polygon.io/v3/snapshot/options/TSLA?expiration_date=' + friday + '&limit=250&apiKey=' + K;
  let pages = 0;
  while (url && pages < 10) {
    const d = await get(url);
    if (!d?.results) break;
    all = all.concat(d.results);
    url = d.next_url ? d.next_url + '&apiKey=' + K : null;
    pages++;
  }
  console.log('CONTRACTS:', all.length, 'pages:', pages);
  
  // 4. Calculate (structureService logic)
  const clean = [];
  let tCO = 0, tPO = 0;
  for (const c of all) {
    const k = c.details?.strike_price || 0;
    const type = (c.details?.contract_type || 'call').toLowerCase();
    const oi = c.open_interest;
    if (oi != null && oi > 0) {
      clean.push({ k, type, oi, gamma: c.greeks?.gamma, iv: c.implied_volatility });
      if (type === 'call') tCO += oi;
      else tPO += oi;
    }
  }
  console.log('CLEAN:', clean.length, 'callOI:', tCO, 'putOI:', tPO);
  
  // callWall (±20%)
  let cw = null, pf = null, maxCO = -1, maxPO = -1;
  const maxR = price * 1.20;
  const minS = price * 0.80;
  console.log('RANGE: putFloor >=', minS.toFixed(0), ' callWall <=', maxR.toFixed(0));
  
  let gex = 0, gc = 0;
  clean.forEach(c => {
    const g = c.gamma;
    if (typeof g === 'number' && isFinite(g)) {
      gex += g * c.oi * 100 * (c.type === 'call' ? -1 : 1) * price;
      gc++;
    }
    if (c.type === 'call' && c.k > price && c.k <= maxR && c.oi > maxCO) { maxCO = c.oi; cw = c.k; }
    if (c.type === 'put' && c.k < price && c.k >= minS && c.oi > maxPO) { maxPO = c.oi; pf = c.k; }
  });
  
  // Max Pain
  let mp = null, mL = Infinity;
  const strikes = [...new Set(clean.map(c => c.k))].sort((a, b) => a - b);
  strikes.forEach(s => {
    let loss = 0;
    clean.forEach(c => {
      if (c.type === 'call' && s > c.k) loss += (s - c.k) * c.oi;
      else if (c.type === 'put' && s < c.k) loss += (c.k - s) * c.oi;
    });
    if (loss < mL) { mL = loss; mp = s; }
  });
  
  // ATM IV
  let atmIv = null;
  if (clean.length > 0) {
    const atmK = strikes.reduce((cl, s) => Math.abs(s - price) < Math.abs(cl - price) ? s : cl);
    const getIv = (c) => { const r = c?.iv; return typeof r === 'number' && r > 0 ? (r > 1 ? r : r * 100) : null; };
    const cIv = getIv(clean.find(c => c.k === atmK && c.type === 'call'));
    const pIv = getIv(clean.find(c => c.k === atmK && c.type === 'put'));
    atmIv = (cIv && pIv) ? Math.round((cIv + pIv) / 2) : (cIv || pIv);
  }
  
  console.log('\n=== LAMBDA RESULT ===');
  console.log('callWall:', cw, '(maxOI:', maxCO, ')');
  console.log('putFloor:', pf, '(maxOI:', maxPO, ')');
  console.log('maxPain:', mp);
  console.log('netGex:', (gex / 1e6).toFixed(2) + 'M');
  console.log('pcr:', tCO > 0 ? (tPO / tCO).toFixed(2) : '0');
  console.log('atmIv:', atmIv);
  console.log('gammaCov:', clean.length > 0 ? (gc / clean.length * 100).toFixed(0) + '%' : '0');
  console.log('gammaRegime:', gex > 0 ? 'POSITIVE' : gex < 0 ? 'NEGATIVE' : 'NEUTRAL');
}

main().catch(e => console.error('ERROR:', e.message));
