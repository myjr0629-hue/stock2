/**
 * Full census verification: Check all 2,000 tickers in Redis cache:analysis
 * Uses Upstash REST API (accessible from local)
 */
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const https = require('https');

const universe = JSON.parse(fs.readFileSync('data/stock_universe_us800.json', 'utf-8')).symbols;
console.log(`Universe: ${universe.length} tickers`);

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function upstashPipeline(commands) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(commands);
    const url = new URL(UPSTASH_URL + '/pipeline');
    const options = {
      hostname: url.hostname,
      port: 443,
      path: '/pipeline',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + UPSTASH_TOKEN,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Parse failed')); } });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

async function main() {
  const BATCH = 100; // Upstash pipeline limit
  let found = 0, missing = 0;
  const missingList = [];
  const noAlpha = [];
  const noGex = [];
  const noRsi = [];
  const noSparkline = [];
  const quality = { full: 0, partial: 0 };
  
  for (let i = 0; i < universe.length; i += BATCH) {
    const batch = universe.slice(i, i + BATCH);
    const commands = batch.map(t => ['GET', `cache:analysis:${t}`]);
    
    let results;
    try {
      results = await upstashPipeline(commands);
    } catch (e) {
      console.error(`Pipeline failed batch ${i}-${i+BATCH}: ${e.message}`);
      missing += batch.length;
      missingList.push(...batch);
      continue;
    }
    
    for (let j = 0; j < batch.length; j++) {
      const ticker = batch[j];
      const raw = results[j]?.result;
      
      if (!raw) {
        missing++;
        missingList.push(ticker);
        continue;
      }
      
      let data;
      try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { missing++; missingList.push(ticker); continue; }
      
      found++;
      
      const hasAlpha = data.alphaSnapshot && typeof data.alphaSnapshot.score === 'number';
      const hasGex = typeof data.gex === 'number';
      const hasRsi = typeof data.rsi === 'number';
      const hasSparkline = Array.isArray(data.sparkline) && data.sparkline.length > 0;
      const hasWhale = typeof data.whaleIndex === 'number';
      
      if (!hasAlpha) noAlpha.push(ticker);
      if (!hasGex) noGex.push(ticker);
      if (!hasRsi) noRsi.push(ticker);
      if (!hasSparkline) noSparkline.push(ticker);
      
      if (hasAlpha && hasGex && hasRsi && hasSparkline && hasWhale) {
        quality.full++;
      } else {
        quality.partial++;
      }
    }
    
    process.stdout.write(`\r  Checked ${Math.min(i + BATCH, universe.length)}/${universe.length}...`);
  }
  
  console.log('\n');
  console.log('========= FULL CENSUS REPORT =========');
  console.log(`Total Universe:   ${universe.length}`);
  console.log(`Found in Redis:   ${found} (${(found/universe.length*100).toFixed(1)}%)`);
  console.log(`Missing:          ${missing} (${(missing/universe.length*100).toFixed(1)}%)`);
  console.log('');
  console.log(`Full Quality:     ${quality.full} (alpha+gex+rsi+sparkline+whale)`);
  console.log(`Partial Quality:  ${quality.partial}`);
  console.log('');
  if (noAlpha.length > 0) console.log(`No Alpha (${noAlpha.length}): ${noAlpha.slice(0,30).join(', ')}${noAlpha.length>30?'...':''}`);
  if (noGex.length > 0) console.log(`No GEX (${noGex.length}): ${noGex.slice(0,30).join(', ')}${noGex.length>30?'...':''}`);
  if (noRsi.length > 0) console.log(`No RSI (${noRsi.length}): ${noRsi.slice(0,30).join(', ')}${noRsi.length>30?'...':''}`);
  if (noSparkline.length > 0) console.log(`No Sparkline (${noSparkline.length}): ${noSparkline.slice(0,30).join(', ')}${noSparkline.length>30?'...':''}`);
  if (missingList.length > 0) console.log(`\nMissing (${missingList.length}): ${missingList.slice(0,50).join(', ')}${missingList.length>50?'...':''}`);
}

main().catch(e => console.error('Fatal:', e.message));
