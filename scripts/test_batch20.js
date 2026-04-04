// 20-ticker batch test — Lambda structureService compat
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

function findFriday(exps) {
  const sorted = [...exps].sort();
  const fri = sorted.find(e => new Date(e + 'T12:00:00').getDay() === 5);
  if (fri) return fri;
  const thu = sorted.find(e => new Date(e + 'T12:00:00').getDay() === 4);
  return thu || sorted[0];
}

async function testTicker(ticker) {
  try {
    const snap = await get('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/' + ticker + '?apiKey=' + K);
    const price = snap?.ticker?.lastTrade?.p || snap?.ticker?.day?.c || snap?.ticker?.prevDay?.c || 0;
    if (!price) return { ticker, status: 'NO_PRICE' };
    
    const ref = await get('https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=' + ticker + '&expiration_date.gte=2026-04-04&order=asc&limit=1000&apiKey=' + K);
    const exps = [...new Set((ref?.results || []).map(c => c.expiration_date))].filter(Boolean).sort();
    if (exps.length === 0) return { ticker, status: 'NO_OPTIONS', price };
    
    const friday = findFriday(exps);
    let all = [];
    let url = 'https://api.polygon.io/v3/snapshot/options/' + ticker + '?expiration_date=' + friday + '&limit=250&apiKey=' + K;
    let pages = 0;
    while (url && pages < 10) {
      const d = await get(url);
      if (!d?.results) break;
      all = all.concat(d.results);
      url = d.next_url ? d.next_url + '&apiKey=' + K : null;
      pages++;
    }
    if (all.length === 0) return { ticker, status: 'NO_CONTRACTS', price, exp: friday };
    
    // Calculate
    let tCO = 0, tPO = 0, cw = null, pf = null, maxCO = -1, maxPO = -1, gex = 0, gc = 0, mp = null;
    const maxR = price * 1.20, minS = price * 0.80;
    const clean = [];
    for (const c of all) {
      const k = c.details?.strike_price || 0;
      const type = (c.details?.contract_type || 'call').toLowerCase();
      const oi = c.open_interest;
      if (oi != null && oi > 0) {
        clean.push({ k, type, oi, gamma: c.greeks?.gamma });
        if (type === 'call') tCO += oi;
        else tPO += oi;
      }
    }
    clean.forEach(c => {
      const g = c.gamma;
      if (typeof g === 'number' && isFinite(g)) {
        gex += g * c.oi * 100 * (c.type === 'call' ? -1 : 1) * price;
        gc++;
      }
      if (c.type === 'call' && c.k > price && c.k <= maxR && c.oi > maxCO) { maxCO = c.oi; cw = c.k; }
      if (c.type === 'put' && c.k < price && c.k >= minS && c.oi > maxPO) { maxPO = c.oi; pf = c.k; }
    });
    let mL = Infinity;
    [...new Set(clean.map(c => c.k))].sort((a, b) => a - b).forEach(s => {
      let l = 0;
      clean.forEach(c => { if (c.type === 'call' && s > c.k) l += (s - c.k) * c.oi; else if (c.type === 'put' && s < c.k) l += (c.k - s) * c.oi; });
      if (l < mL) { mL = l; mp = s; }
    });
    
    const valid = cw !== null && pf !== null && cw > price && pf < price;
    return { ticker, status: valid ? 'OK' : 'PARTIAL', price: Math.round(price * 100) / 100, exp: friday, cw, pf, mp, gex: (gex / 1e6).toFixed(1) + 'M', pcr: tCO > 0 ? (tPO / tCO).toFixed(2) : '0', contracts: all.length };
  } catch (e) {
    return { ticker, status: 'ERROR', error: e.message };
  }
}

async function main() {
  const TICKERS = ['TSLA','AAPL','NVDA','META','AMZN','GOOGL','MSFT','AMD','AVGO','PLTR',
                   'COIN','CRWD','LLY','JPM','BA','SPY','QQQ','NFLX','CRM','COST'];
  
  console.log('=== 20-Ticker Batch Test ===');
  const results = [];
  for (let i = 0; i < TICKERS.length; i += 5) {
    const batch = TICKERS.slice(i, i + 5);
    const batchResults = await Promise.all(batch.map(t => testTicker(t)));
    results.push(...batchResults);
  }
  
  let ok = 0, partial = 0, fail = 0;
  for (const r of results) {
    if (r.status === 'OK') {
      ok++;
      console.log(`✅ ${r.ticker.padEnd(6)} $${String(r.price).padEnd(8)} exp=${r.exp} cw=$${r.cw} pf=$${r.pf} mp=$${r.mp} gex=${r.gex} pcr=${r.pcr}`);
    } else if (r.status === 'PARTIAL') {
      partial++;
      console.log(`⚠️ ${r.ticker.padEnd(6)} $${String(r.price).padEnd(8)} exp=${r.exp} cw=${r.cw} pf=${r.pf} mp=${r.mp} gex=${r.gex} (${r.status})`);
    } else {
      fail++;
      console.log(`❌ ${r.ticker.padEnd(6)} ${r.status} ${r.error || ''}`);
    }
  }
  console.log(`\nSummary: ${ok}/20 OK, ${partial} partial, ${fail} failed`);
}

main().catch(e => console.error('FATAL:', e));
