require('dotenv').config({ path: '.env.local' });

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redisCmd(...args) {
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return res.json();
}

async function pipeline(cmds) {
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  return res.json();
}

async function deepAudit() {
  console.log('════════════════════════════════════════════');
  console.log('  UPSTASH REDIS 비용 정밀 감사');
  console.log('════════════════════════════════════════════\n');

  // 1. 기본 정보
  const info = await redisCmd('INFO');
  const lines = info.result?.split('\r\n') || [];
  const getValue = (key) => {
    const line = lines.find(l => l.startsWith(key + ':'));
    return line ? line.split(':')[1] : 'N/A';
  };
  
  console.log('── 1. 기본 정보 ──');
  console.log(`Keys: ${getValue('db0')}`);
  console.log(`Memory: ${getValue('used_memory_human')}`);
  console.log(`Total Commands: ${getValue('total_commands_processed')}`);
  console.log(`Connected Clients: ${getValue('connected_clients')}`);
  console.log(`Keyspace hits: ${getValue('keyspace_hits')}`);
  console.log(`Keyspace misses: ${getValue('keyspace_misses')}`);
  
  const hits = parseInt(getValue('keyspace_hits')) || 0;
  const misses = parseInt(getValue('keyspace_misses')) || 0;
  const hitRate = hits + misses > 0 ? ((hits / (hits + misses)) * 100).toFixed(1) : 'N/A';
  console.log(`Hit Rate: ${hitRate}%`);

  // 2. 전체 키 수집 + TTL 분석
  console.log('\n── 2. 키 패턴별 상세 분석 ──\n');
  const allKeys = await redisCmd('KEYS', '*');
  const keyList = allKeys.result || [];
  
  // Group by prefix
  const groups = {};
  for (const key of keyList) {
    // Smart prefix extraction
    let prefix;
    if (key.startsWith('cache:command:unified:')) prefix = 'cache:command:unified:*';
    else if (key.startsWith('cache:analysis:')) prefix = 'cache:analysis:*';
    else if (key.startsWith('cache:flow:')) prefix = 'cache:flow:*';
    else if (key.startsWith('polygon:snapshot:')) prefix = 'polygon:snapshot:*';
    else if (key.startsWith('cache:command:')) prefix = 'cache:command:OTHER';
    else if (key.startsWith('guardian:')) prefix = 'guardian:*';
    else if (key.startsWith('marketing:')) prefix = 'marketing:*';
    else if (key.startsWith('reports:')) prefix = 'reports:*';
    else if (key.startsWith('flow:')) prefix = 'flow:*';
    else if (key.startsWith('swr:')) prefix = 'swr:*';
    else if (key.startsWith('sec:')) prefix = 'sec:*';
    else if (key.startsWith('rlsi:')) prefix = 'rlsi:*';
    else if (key.startsWith('rt-metrics:')) prefix = 'rt-metrics:*';
    else prefix = key.split(':')[0] + ':*';
    
    if (!groups[prefix]) groups[prefix] = { keys: [], totalSize: 0, ttls: [] };
    groups[prefix].keys.push(key);
  }
  
  // Sample TTL and size for each group
  for (const [prefix, group] of Object.entries(groups)) {
    const sampleKeys = group.keys.slice(0, 5);
    const cmds = [];
    for (const k of sampleKeys) {
      cmds.push(['STRLEN', k]);
      cmds.push(['TTL', k]);
    }
    const results = await pipeline(cmds);
    let totalSize = 0;
    const ttls = [];
    for (let i = 0; i < results.length; i += 2) {
      totalSize += results[i]?.result || 0;
      ttls.push(results[i + 1]?.result);
    }
    const avgSize = sampleKeys.length > 0 ? Math.round(totalSize / sampleKeys.length) : 0;
    const avgTtl = ttls.length > 0 ? Math.round(ttls.reduce((a, b) => a + b, 0) / ttls.length) : 0;
    const hasTtl = ttls.some(t => t > 0);
    const hasNoTtl = ttls.some(t => t === -1);
    
    const ttlStr = hasNoTtl ? '❌ NO TTL (영구)' : `${Math.round(avgTtl / 3600)}h`;
    const estTotal = Math.round(avgSize * group.keys.length / 1024);
    
    console.log(`${prefix.padEnd(30)} | ${String(group.keys.length).padEnd(5)} keys | avg ${String(avgSize).padEnd(5)} bytes | est ${String(estTotal).padEnd(5)} KB | TTL: ${ttlStr}`);
  }

  // 3. TTL 없는 키 분석 (비용 원인)
  console.log('\n── 3. TTL 없는 키 (영구 저장 = 비용 누적) ──\n');
  let noTtlCount = 0;
  let noTtlSize = 0;
  const noTtlGroups = {};
  
  // Sample check - batch 50 at a time
  for (let i = 0; i < keyList.length; i += 50) {
    const batch = keyList.slice(i, i + 50);
    const cmds = batch.map(k => ['TTL', k]);
    const results = await pipeline(cmds);
    for (let j = 0; j < results.length; j++) {
      if (results[j]?.result === -1) {
        noTtlCount++;
        const key = batch[j];
        let prefix;
        if (key.startsWith('cache:command:unified:')) prefix = 'cache:command:unified:*';
        else if (key.startsWith('cache:analysis:')) prefix = 'cache:analysis:*';
        else if (key.startsWith('cache:flow:')) prefix = 'cache:flow:*';
        else if (key.startsWith('polygon:snapshot:')) prefix = 'polygon:snapshot:*';
        else prefix = key.split(':').slice(0, 2).join(':') + ':*';
        noTtlGroups[prefix] = (noTtlGroups[prefix] || 0) + 1;
      }
    }
  }
  
  console.log(`TTL 없는 키 총: ${noTtlCount} / ${keyList.length} (${((noTtlCount/keyList.length)*100).toFixed(1)}%)\n`);
  const sorted = Object.entries(noTtlGroups).sort((a, b) => b[1] - a[1]);
  for (const [prefix, count] of sorted) {
    console.log(`  ${prefix.padEnd(30)} | ${count} keys (영구 저장)`);
  }

  // 4. Upstash 비용 계산
  console.log('\n── 4. 비용 분석 ──\n');
  const totalCmds = parseInt(getValue('total_commands_processed')) || 0;
  // Upstash Pay-as-you-go: $0.2 per 100K commands
  // Storage: $0.25/GB/month
  const memMB = parseFloat(getValue('used_memory_human')) || 0;
  const storageCost = (memMB / 1024) * 0.25;
  
  console.log(`Total commands (lifetime): ${totalCmds.toLocaleString()}`);
  console.log(`Memory: ${memMB} MB`);
  console.log(`Storage cost estimate: $${storageCost.toFixed(2)}/month`);
  console.log(`\nUpstash pricing: $0.2 per 100K commands`);
  console.log(`For $108.74 monthly → ~54M commands/month → ~1.8M commands/day`);
  
  // 5. Lambda 커맨드 추정
  console.log('\n── 5. Lambda 커맨드 추정 (signum-harvest) ──\n');
  console.log('Step 6 per cycle (15min):');
  console.log('  - cache:analysis SET × 1000 = 1,000 commands');
  console.log('  - cache:command:unified SET × 1000 = 1,000 commands');
  console.log('  - Total per cycle: ~2,000 commands');
  console.log('  - Cycles per day (장중 ~10h): ~40 cycles');
  console.log('  - Lambda daily: ~80,000 commands');
  console.log('  - Lambda monthly: ~2,400,000 commands → $4.80');
  
  console.log('\n── 6. Vercel API 커맨드 추정 ──\n');
  console.log('Key readers: command/unified, dashboard/unified, flow/realtime-metrics, watchlist');
  console.log('Each page load: ~5-10 Redis GETs');
  console.log('SWR polling (2s interval per user): ~30 GETs/minute per user');
  console.log('If 50 users polling: 50 × 30 × 60 × 10h = 9,000,000 commands/day');
  console.log('If 10 users: ~1,800,000 commands/day → $10.80/month');
  console.log('If 100 users: ~18,000,000 commands/day → $108/month ← ⚠️ THIS MATCHES');
  
  // 7. Sample oldest keys (waste)
  console.log('\n── 7. 오래된 불필요 키 샘플 ──\n');
  const wastePatterns = ['reports:*', 'marketing:*', 'sec:*', 'swr:*'];
  for (const pattern of wastePatterns) {
    const keys = await redisCmd('KEYS', pattern);
    if (keys.result?.length > 0) {
      const k = keys.result[0];
      const ttl = await redisCmd('TTL', k);
      const sz = await redisCmd('STRLEN', k);
      console.log(`${pattern}: ${keys.result.length} keys, TTL=${ttl.result}, sample size=${sz.result} bytes`);
      if (keys.result.length <= 5) {
        for (const kk of keys.result) console.log(`  → ${kk}`);
      }
    }
  }
}

deepAudit().catch(e => console.error('Fatal:', e.message));
