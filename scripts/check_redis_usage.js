require('dotenv').config({ path: '.env.local' });
const https = require('https');

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redisCmd(...args) {
  const url = `${UPSTASH_URL}`;
  const body = JSON.stringify(args);
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body,
  });
  return res.json();
}

async function check() {
  console.log('═══ REDIS (UPSTASH) 실태 조사 ═══\n');
  console.log(`URL: ${UPSTASH_URL?.substring(0, 40)}...\n`);

  // 1. INFO
  const info = await redisCmd('INFO');
  if (info.result) {
    const lines = info.result.split('\r\n');
    const dbSize = lines.find(l => l.startsWith('db0:'));
    const mem = lines.find(l => l.startsWith('used_memory_human:'));
    const memPeak = lines.find(l => l.startsWith('used_memory_peak_human:'));
    const cmdsProcessed = lines.find(l => l.startsWith('total_commands_processed:'));
    console.log(`DB Size: ${dbSize || 'N/A'}`);
    console.log(`Memory: ${mem || 'N/A'}`);
    console.log(`Peak Memory: ${memPeak || 'N/A'}`);
    console.log(`Commands Processed: ${cmdsProcessed || 'N/A'}`);
  }

  // 2. DBSIZE
  const dbsize = await redisCmd('DBSIZE');
  console.log(`\nTotal keys: ${dbsize.result}`);

  // 3. Key patterns - count by prefix
  console.log('\n═══ KEY PATTERN ANALYSIS ═══\n');
  const patterns = [
    'cache:analysis:*',
    'cache:command:unified:*',
    'cache:dashboard:*',
    'cache:intel:*',
    'cache:watchlist:*',
    'cache:guardian:*',
    'guardian:snapshot:*',
    'rt-metrics:*',
    'snapshot:*',
    'cache:swr:*',
    'rlsi:*',
  ];
  
  for (const pattern of patterns) {
    const keys = await redisCmd('KEYS', pattern);
    const count = keys.result?.length || 0;
    if (count > 0) {
      // Get size of first key
      const firstKey = keys.result[0];
      const val = await redisCmd('STRLEN', firstKey);
      const ttl = await redisCmd('TTL', firstKey);
      console.log(`${pattern.padEnd(30)} | ${String(count).padEnd(5)} keys | sample size: ${val.result} bytes | TTL: ${ttl.result}s`);
    } else {
      console.log(`${pattern.padEnd(30)} | 0 keys`);
    }
  }

  // 4. Check for any unexpected large key patterns
  console.log('\n═══ ALL KEY PREFIXES ═══\n');
  const allKeys = await redisCmd('KEYS', '*');
  const prefixes = {};
  for (const key of allKeys.result || []) {
    const prefix = key.split(':').slice(0, 2).join(':');
    prefixes[prefix] = (prefixes[prefix] || 0) + 1;
  }
  const sorted = Object.entries(prefixes).sort((a, b) => b[1] - a[1]);
  for (const [prefix, count] of sorted.slice(0, 20)) {
    console.log(`${prefix.padEnd(35)} | ${count} keys`);
  }

  // 5. Total memory estimate
  console.log('\n═══ MEMORY ESTIMATE ═══\n');
  let totalSize = 0;
  const sampleKeys = (allKeys.result || []).slice(0, 100);
  for (const key of sampleKeys) {
    const sz = await redisCmd('STRLEN', key);
    totalSize += sz.result || 0;
  }
  const avgSize = sampleKeys.length > 0 ? totalSize / sampleKeys.length : 0;
  const totalKeys = allKeys.result?.length || 0;
  console.log(`Sampled ${sampleKeys.length} keys, avg size: ${Math.round(avgSize)} bytes`);
  console.log(`Estimated total data: ${Math.round(avgSize * totalKeys / 1024 / 1024)} MB (${totalKeys} keys × ${Math.round(avgSize)} bytes)`);
}

check().catch(e => console.error('Fatal:', e.message));
