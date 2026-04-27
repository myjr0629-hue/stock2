/**
 * Redis Deep Audit V2 — 실측 기반 비용/성능/최적화 분석
 * 1. 실 메모리/커맨드/대역폭 분석
 * 2. 키별 크기 Top 20 (대용량 범인 찾기)
 * 3. TTL 없는 좀비 키 식별
 * 4. 카테고리별 평균 크기 & 빈도 추정
 * 5. 기존 최적화 (SWR, Memory LRU, DynamoDB fallback) 동작 확인
 */

const UPSTASH_URL = 'https://sacred-manatee-21571.upstash.io';
const UPSTASH_TOKEN = 'AVRDAAIncDIwNzE3MjMwY2ZjZDg0MWY2OWY5OGYyYzdlODUzYjU4Y3AyMjE1NzE';

async function cmd(...args) {
    const res = await fetch(UPSTASH_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error);
    return d.result;
}

// Pipeline: multiple commands in one HTTP request (saves bandwidth)
async function pipeline(commands) {
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(commands)
    });
    return await res.json();
}

async function scanAll() {
    const all = [];
    let cursor = '0';
    do {
        const r = await cmd('SCAN', cursor, 'COUNT', '1000');
        cursor = r[0]; all.push(...r[1]);
    } while (cursor !== '0');
    return all;
}

function fmtBytes(b) {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
    return `${(b/1048576).toFixed(2)} MB`;
}

function categorize(key) {
    if (key.startsWith('cache:analysis:')) return 'cache:analysis:*';
    if (key.startsWith('cache:command:unified:')) return 'cache:command:unified:*';
    if (key.startsWith('cache:command:overview:')) return 'cache:command:overview:*';
    if (key.startsWith('cache:flow:unified:')) return 'cache:flow:unified:*';
    if (key.startsWith('cache:intel-analysis:')) return 'cache:intel-analysis:*';
    if (key.startsWith('flow:ticker:lite:')) return 'flow:ticker:lite:*';
    if (key.startsWith('flow:extended:')) return 'flow:extended:*';
    if (key.startsWith('flow:ticker:')) return 'flow:ticker:*';
    if (key.startsWith('rt-metrics:')) return 'rt-metrics:*';
    if (key.startsWith('darkpool:')) return 'darkpool:*';
    if (key.startsWith('polygon:snapshot:probe:')) return 'polygon:snapshot:*';
    if (key.startsWith('dashboard:alerts:')) return 'dashboard:alerts:*';
    if (key.startsWith('dashboard:prefs:')) return 'dashboard:prefs:*';
    if (key.startsWith('dashboard:unified:')) return 'dashboard:unified:*';
    if (key.startsWith('dashboard:signals')) return 'dashboard:signals';
    if (key.startsWith('guardian:')) return 'guardian:*';
    if (key.startsWith('marketing:')) return 'marketing:*';
    if (key.startsWith('sec:')) return 'sec:*';
    if (key.startsWith('cross-sector:')) return 'cross-sector:*';
    if (key.startsWith('swr:')) return 'swr:*';
    if (key.startsWith('prev-day-pct:')) return 'prev-day-pct:*';
    if (key.startsWith('deep-analysis:')) return 'deep-analysis:*';
    if (key.startsWith('report:')) return 'report:*';
    if (key.startsWith('pm_true_close:')) return 'pm_true_close:*';
    if (key.startsWith('visitor:')) return 'visitor:*';
    if (key.startsWith('visitors:')) return 'visitors:*';
    if (key.startsWith('archives:')) return 'archives:*';
    if (key.startsWith('fedwatch:')) return 'fedwatch:*';
    if (key.startsWith('yahoo:')) return 'yahoo:*';
    if (key.startsWith('vix:')) return 'vix:*';
    if (key.startsWith('cnn:')) return 'cnn:*';
    if (key.startsWith('macro:')) return 'macro:*';
    if (key.startsWith('rlsi:')) return 'rlsi:*';
    if (key.startsWith('ticker:')) return 'ticker:*';
    if (key.startsWith('logo:')) return 'logo:*';
    if (key.startsWith('exchange:')) return 'exchange:*';
    if (key.startsWith('econ:')) return 'econ:*';
    if (key.startsWith('news:')) return 'news:*';
    return `other:${key.substring(0,20)}`;
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║   REDIS DEEP AUDIT V2 — 실측 기반 정밀 분석                  ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // ═══ SECTION 1: Server Stats ═══
    console.log('━━━ [1] SERVER STATS (INFO) ━━━');
    const infoRaw = await cmd('INFO');
    const infoMap = {};
    infoRaw.split('\n').forEach(l => { const [k,v] = l.trim().split(':'); if (k && v) infoMap[k]=v; });
    
    const usedMem = parseInt(infoMap.used_memory || 0);
    const totalCmds = parseInt(infoMap.total_commands_processed || 0);
    const hits = parseInt(infoMap.keyspace_hits || 0);
    const misses = parseInt(infoMap.keyspace_misses || 0);
    const hitRate = hits + misses > 0 ? (hits / (hits + misses) * 100).toFixed(1) : 0;
    
    console.log(`  메모리 사용:     ${fmtBytes(usedMem)} (${infoMap.used_memory_human?.trim()})`);
    console.log(`  최대 메모리:     ${infoMap.maxmemory_human?.trim()}`);
    console.log(`  총 키 수:        ${infoMap['db0']?.split(',')[0]?.split('=')[1] || 'N/A'}`);
    console.log(`  총 커맨드:       ${(totalCmds/1_000_000).toFixed(2)}M (누적)`);
    console.log(`  HIT/MISS:        ${(hits/1_000_000).toFixed(2)}M / ${(misses/1_000_000).toFixed(2)}M (${hitRate}% 적중률)`);
    console.log(`  Evicted Keys:    ${infoMap.evicted_keys}`);
    console.log(`  Eviction Policy: ${infoMap.maxmemory_policy?.trim()}`);
    
    // ═══ SECTION 2: All keys scan + size measurement ═══
    console.log('\n━━━ [2] 전체 키 스캔 & 크기 측정 ━━━');
    const allKeys = await scanAll();
    console.log(`  스캔된 키: ${allKeys.length}개`);
    
    // Batch measure ALL key sizes using pipeline
    console.log('  크기 측정 중...');
    const keySizes = {};
    const keyTTLs = {};
    const BATCH = 50;
    
    for (let i = 0; i < allKeys.length; i += BATCH) {
        const batch = allKeys.slice(i, i + BATCH);
        const sizeCommands = batch.map(k => ['STRLEN', k]);
        const ttlCommands = batch.map(k => ['TTL', k]);
        
        const [sizeResults, ttlResults] = await Promise.all([
            pipeline(sizeCommands),
            pipeline(ttlCommands)
        ]);
        
        batch.forEach((k, j) => {
            keySizes[k] = sizeResults[j]?.result || 0;
            keyTTLs[k] = ttlResults[j]?.result || -1;
        });
        
        if ((i + BATCH) % 200 === 0) process.stdout.write(`  ${i + BATCH}/${allKeys.length} 측정 완료\r`);
    }
    console.log(`  ${allKeys.length}/${allKeys.length} 측정 완료`);

    // ═══ SECTION 3: Top 20 largest keys ═══
    console.log('\n━━━ [3] TOP 20 대용량 키 ━━━');
    const sorted = Object.entries(keySizes).sort((a,b) => b[1] - a[1]);
    let totalBytes = 0;
    sorted.forEach(([k,v]) => totalBytes += v);
    
    console.log(`  총 데이터 크기: ${fmtBytes(totalBytes)} (STRLEN 합계)`);
    console.log(`  Redis 오버헤드 포함: ~${fmtBytes(usedMem)} (실제)\n`);
    
    console.log('  ' + 'RANK'.padEnd(6) + 'SIZE'.padEnd(12) + 'TTL'.padEnd(10) + 'KEY');
    console.log('  ' + '─'.repeat(80));
    sorted.slice(0, 20).forEach(([key, size], i) => {
        const ttl = keyTTLs[key];
        const ttlStr = ttl === -1 ? '∞ NO_TTL' : ttl === -2 ? 'EXPIRED' : `${Math.round(ttl/3600)}h`;
        console.log(`  ${String(i+1).padEnd(6)}${fmtBytes(size).padEnd(12)}${ttlStr.padEnd(10)}${key.substring(0, 60)}`);
    });

    // ═══ SECTION 4: Category Summary ═══
    console.log('\n━━━ [4] 카테고리별 집계 ━━━');
    const cats = {};
    allKeys.forEach(k => {
        const c = categorize(k);
        if (!cats[c]) cats[c] = { keys: [], totalSize: 0, noTTL: 0 };
        cats[c].keys.push(k);
        cats[c].totalSize += (keySizes[k] || 0);
        if (keyTTLs[k] === -1) cats[c].noTTL++;
    });
    
    const catSorted = Object.entries(cats).sort((a,b) => b[1].totalSize - a[1].totalSize);
    
    console.log('\n  ' + 'CATEGORY'.padEnd(30) + 'KEYS'.padEnd(7) + 'TOTAL SIZE'.padEnd(14) + 'AVG SIZE'.padEnd(12) + 'NO_TTL'.padEnd(8) + 'TTL RANGE');
    console.log('  ' + '═'.repeat(90));
    
    for (const [cat, data] of catSorted) {
        const avgSize = data.keys.length > 0 ? data.totalSize / data.keys.length : 0;
        // Get TTL range
        const ttls = data.keys.map(k => keyTTLs[k]).filter(t => t > 0);
        const minTTL = ttls.length > 0 ? Math.round(Math.min(...ttls) / 3600) : -1;
        const maxTTL = ttls.length > 0 ? Math.round(Math.max(...ttls) / 3600) : -1;
        const ttlRange = ttls.length > 0 ? `${minTTL}h ~ ${maxTTL}h` : (data.noTTL > 0 ? '∞ NO_TTL' : 'all expired');
        
        console.log(
            '  ' + cat.padEnd(30) +
            String(data.keys.length).padEnd(7) +
            fmtBytes(data.totalSize).padEnd(14) +
            fmtBytes(Math.round(avgSize)).padEnd(12) +
            String(data.noTTL).padEnd(8) +
            ttlRange
        );
    }
    
    // ═══ SECTION 5: Zombie Keys (NO TTL) ═══
    console.log('\n━━━ [5] 좀비 키 (TTL 없음 = 영구 저장) ━━━');
    const zombies = allKeys.filter(k => keyTTLs[k] === -1);
    console.log(`  좀비 키 수: ${zombies.length}개 / ${allKeys.length}개 (${(zombies.length/allKeys.length*100).toFixed(1)}%)`);
    if (zombies.length > 0) {
        console.log('  좀비 키 목록:');
        zombies.forEach(k => console.log(`    - ${k} (${fmtBytes(keySizes[k])})`));
    }

    // ═══ SECTION 6: Optimization Verification ═══
    console.log('\n━━━ [6] 기존 최적화 동작 확인 ━━━');
    
    // 6-1. SWR Cache 확인 (cache:command:unified → 실제 존재?)
    const unifiedKeys = allKeys.filter(k => k.startsWith('cache:command:unified:'));
    const overviewKeys = allKeys.filter(k => k.startsWith('cache:command:overview:'));
    const analysisKeys = allKeys.filter(k => k.startsWith('cache:analysis:'));
    
    console.log(`\n  [6-1] Command Unified 캐시:`);
    console.log(`    unified keys:   ${unifiedKeys.length}개 (종목 수)`);
    console.log(`    overview keys:  ${overviewKeys.length}개 (종목 × 언어)`);
    console.log(`    analysis keys:  ${analysisKeys.length}개 (warm-analysis 크론)`);
    
    // Sample one unified key to check structure
    if (unifiedKeys.length > 0) {
        const sampleKey = unifiedKeys[0];
        const sampleData = await cmd('GET', sampleKey);
        if (sampleData) {
            const parsed = typeof sampleData === 'string' ? JSON.parse(sampleData) : sampleData;
            const fields = ['structure','analyst','fundamentals','earnings','sma','related','squeeze','volatility','institutional'];
            const present = fields.filter(f => parsed[f]);
            console.log(`    샘플 (${sampleKey.split(':').pop()}):`);
            console.log(`      필드 존재: ${present.length}/9 (${present.join(', ')})`);
            console.log(`      timestamp: ${parsed.timestamp ? new Date(parsed.timestamp).toISOString() : 'N/A'}`);
            console.log(`      _source: ${parsed._source || 'N/A'}`);
            console.log(`      크기: ${fmtBytes(keySizes[sampleKey])}`);
        }
    }
    
    // 6-2. Hit/Miss 비율로 캐시 효율 판단
    console.log(`\n  [6-2] 캐시 효율성:`);
    console.log(`    HIT Rate: ${hitRate}% (목표: 80%+ → ${parseFloat(hitRate) >= 80 ? '✅ 달성' : '⚠️ 미달'})`);
    console.log(`    총 HIT: ${(hits/1_000_000).toFixed(2)}M`);
    console.log(`    총 MISS: ${(misses/1_000_000).toFixed(2)}M`);
    
    // 6-3. Dual Write 확인 — EC2 Proxy vs Upstash 둘 다 쓰는지
    console.log(`\n  [6-3] Dual Write (EC2+Upstash) 현황:`);
    console.log(`    Upstash 키: ${allKeys.length}개`);
    console.log(`    EC2 ElastiCache: 직접 확인 불가 (EC2 내부 네트워크)`);
    console.log(`    → redisClient.ts L164: 항상 양쪽에 쓰는 구조 (코드 확인 완료)`);
    
    // 6-4. DynamoDB Fallback 검증 — unified cache에 데이터 있는지
    console.log(`\n  [6-4] DynamoDB Fallback 체인:`);
    console.log(`    TIER 1 (Memory LRU): Vercel 인스턴스 내부 (외부 확인 불가)`);
    console.log(`    TIER 2 (Redis): ${unifiedKeys.length}개 종목 캐시 존재 ✅`);
    console.log(`    TIER 1.5 (DynamoDB): 별도 확인 필요 (AWS SDK)`);
    console.log(`    TIER 2 (Live API): Redis MISS 시 자동 호출 (코드 확인 완료)`);

    // ═══ SECTION 7: Cost Breakdown ═══
    console.log('\n━━━ [7] UPSTASH 비용 분석 (Pay-as-you-go) ━━━');
    console.log(`  Upstash 요금 (공식):`);
    console.log(`    Commands: $0.2 / 100K commands`);
    console.log(`    Storage:  $0.25 / GB-hour`);
    console.log(`    Bandwidth: $0.03 / GB`);
    console.log();
    
    // Daily commands from dashboard = ~4,717
    const dailyCmds = 4717;
    const monthlyCmds = dailyCmds * 30;
    const cmdCost = monthlyCmds / 100000 * 0.2;
    
    const storageMB = usedMem / 1048576;
    const storageGBh = (storageMB / 1024) * 24 * 30; // GB-hours per month
    const storageCost = storageGBh * 0.25;
    
    // Bandwidth: 154 MB/day from dashboard
    const dailyBW = 154; // MB
    const monthlyBW = dailyBW * 30 / 1024; // GB
    const bwCost = monthlyBW * 0.03;
    
    console.log(`  ┌─────────────────────────────────────────┐`);
    console.log(`  │ ITEM          USAGE         EST. COST   │`);
    console.log(`  ├─────────────────────────────────────────┤`);
    console.log(`  │ Commands      ${(monthlyCmds/1000).toFixed(0)}K/월       $${cmdCost.toFixed(2).padEnd(8)} │`);
    console.log(`  │ Storage       ${storageMB.toFixed(0)} MB          $${storageCost.toFixed(2).padEnd(8)} │`);
    console.log(`  │ Bandwidth     ${(monthlyBW).toFixed(1)} GB/월     $${bwCost.toFixed(2).padEnd(8)} │`);
    console.log(`  ├─────────────────────────────────────────┤`);
    console.log(`  │ 추정 합계                    $${(cmdCost+storageCost+bwCost).toFixed(2).padEnd(8)} │`);
    console.log(`  │ 실제 청구                    $154.82    │`);
    console.log(`  │ 차이 (대역폭/실제 cmd 차이)  $${(154.82 - cmdCost - storageCost - bwCost).toFixed(2).padEnd(8)} │`);
    console.log(`  └─────────────────────────────────────────┘`);
    console.log();
    console.log(`  ⚠️  대시보드 "Daily Commands 4,717"은 REST API 호출 수.`);
    console.log(`  ⚠️  실제 Redis commands (INFO): ${(totalCmds/1_000_000).toFixed(2)}M (누적).`);
    console.log(`  ⚠️  Upstash는 pipeline 내부 명령도 각각 1 command로 과금.`);
    console.log(`  ⚠️  주요 비용 원인: 높은 Command 수 + 대역폭 (큰 JSON 전송).`);
}

main().catch(e => console.error('FATAL:', e));
