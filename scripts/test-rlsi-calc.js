// Test RLSI self-calculation logic
require('dotenv').config({ path: '.env.local' });
const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    }).on('error', reject);
  });
}

function computeRSI(closes, period) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

async function test() {
  const key = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
  const today = new Date().toISOString().slice(0, 10);
  const ago = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [spy, iwm] = await Promise.all([
    httpsGet(`https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/${ago}/${today}?adjusted=true&sort=asc&limit=30&apiKey=${key}`),
    httpsGet(`https://api.polygon.io/v2/aggs/ticker/IWM/range/1/day/${ago}/${today}?adjusted=true&sort=asc&limit=30&apiKey=${key}`),
  ]);

  const sc = spy.results.map(r => r.c);
  const ic = iwm.results.map(r => r.c);

  const rsi = computeRSI(sc, 14);
  const momentum = Math.round((rsi / 100) * 25);
  const s5 = sc.length >= 5 ? (sc[sc.length - 1] / sc[sc.length - 6] - 1) * 100 : 0;
  const i5 = ic.length >= 5 ? (ic[ic.length - 1] / ic[ic.length - 6] - 1) * 100 : 0;
  const part = Math.max(0, Math.min(25, Math.round(12.5 + (i5 - s5) * 2.5)));
  const sma20 = sc.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const trend = Math.max(0, Math.min(25, Math.round(12.5 + ((sc[sc.length - 1] - sma20) / sma20) * 100 * 5)));
  const sent = Math.max(0, Math.min(25, Math.round(37.5 - 22 * 0.75))); // VIX ~22

  const rlsi = momentum + part + trend + sent;
  console.log('=== RLSI Self-Calculation Test ===');
  console.log('SPY data points:', sc.length);
  console.log('SPY RSI14:', Math.round(rsi * 100) / 100);
  console.log('SPY price:', sc[sc.length - 1], '| SMA20:', Math.round(sma20 * 100) / 100);
  console.log('SPY 5d return:', Math.round(s5 * 100) / 100 + '%');
  console.log('IWM 5d return:', Math.round(i5 * 100) / 100 + '%');
  console.log('---');
  console.log('Momentum:', momentum + '/25');
  console.log('Participation:', part + '/25');
  console.log('Price Trend:', trend + '/25');
  console.log('Sentiment:', sent + '/25');
  console.log('---');
  console.log('RLSI:', rlsi + '/100', '→', rlsi >= 70 ? 'BULLISH' : rlsi >= 45 ? 'NEUTRAL' : 'BEARISH');
}

test().catch(e => console.error('Error:', e.message));
