/**
 * Redis Storage Audit — 실제 Upstash 키 분석
 * 카테고리별 키 수, 총 메모리 사용량, 샘플 크기 측정
 */

const UPSTASH_URL = 'https://sacred-manatee-21571.upstash.io';
const UPSTASH_TOKEN = 'AVRDAAIncDIwNzE3MjMwY2ZjZDg0MWY2OWY5OGYyYzdlODUzYjU4Y3AyMjE1NzE';

async function redisCmd(...args) {
    const res = await fetch(`${UPSTASH_URL}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${UPSTASH_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(args)
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.result;
}

// SCAN all keys
async function scanAllKeys() {
    const allKeys = [];
    let cursor = '0';
    let iterations = 0;
    do {
        const result = await redisCmd('SCAN', cursor, 'COUNT', '500');
        cursor = result[0];
        const keys = result[1];
        allKeys.push(...keys);
        iterations++;
        if (iterations % 10 === 0) process.stdout.write(`  Scanned ${allKeys.length} keys...\r`);
    } while (cursor !== '0');
    console.log(`\n  Total keys found: ${allKeys.length}`);
    return allKeys;
}

// Categorize keys
function categorizeKey(key) {
    if (key.startsWith('cache:analysis:')) return 'cache:analysis:*';
    if (key.startsWith('cache:command:unified:')) return 'cache:command:unified:*';
    if (key.startsWith('cache:command:overview:')) return 'cache:command:overview:*';
    if (key.startsWith('cache:flow:unified:')) return 'cache:flow:unified:*';
    if (key.startsWith('flow:ticker:lite:')) return 'flow:ticker:lite:*';
    if (key.startsWith('flow:extended:')) return 'flow:extended:*';
    if (key.startsWith('flow:dynamic')) return 'flow:dynamic-universe';
    if (key.startsWith('rt-metrics:')) return 'rt-metrics:*';
    if (key.startsWith('darkpool:')) return 'darkpool:*';
    if (key.startsWith('polygon:snapshot:probe:')) return 'polygon:snapshot:probe:*';
    if (key.startsWith('dashboard:alerts:')) return 'dashboard:alerts:*';
    if (key.startsWith('dashboard:prefs:')) return 'dashboard:prefs:*';
    if (key.startsWith('dashboard:signals')) return 'dashboard:signals';
    if (key.startsWith('guardian:')) return 'guardian:*';
    if (key.startsWith('marketing:')) return 'marketing:*';
    if (key.startsWith('sec:')) return 'sec:*';
    if (key.startsWith('cross-sector:')) return 'cross-sector:*';
    if (key.startsWith('swr:')) return 'swr:*';
    if (key.startsWith('prev-day-pct:')) return 'prev-day-pct:*';
    if (key.startsWith('vix:')) return 'vix:*';
    if (key.startsWith('ticker:')) return 'ticker:*';
    if (key.startsWith('cnn:')) return 'cnn:*';
    if (key.startsWith('macro:')) return 'macro:*';
    if (key.startsWith('yahoo:')) return 'yahoo:*';
    if (key.startsWith('deep-analysis:')) return 'deep-analysis:*';
    if (key.startsWith('intel:')) return 'intel:*';
    if (key.startsWith('report:')) return 'report:*';
    if (key.startsWith('exchange:')) return 'exchange:*';
    if (key.startsWith('logo:')) return 'logo:*';
    if (key.startsWith('fedwatch:')) return 'fedwatch:*';
    if (key.startsWith('econ:')) return 'econ:*';
    if (key.startsWith('news:')) return 'news:*';
    return `OTHER: ${key.substring(0, 30)}`;
}

// Get size of a sample of keys in each category
async function measureSample(keys, sampleSize = 3) {
    const sampled = keys.slice(0, sampleSize);
    let totalBytes = 0;
    for (const key of sampled) {
        try {
            const val = await redisCmd('STRLEN', key);
            totalBytes += (val || 0);
        } catch {
            // STRLEN only works on strings, try MEMORY USAGE
            try {
                const mem = await redisCmd('DEBUG', 'OBJECT', key);
                totalBytes += 100; // fallback estimate
            } catch {
                totalBytes += 100;
            }
        }
    }
    return sampled.length > 0 ? totalBytes / sampled.length : 0;
}

async function getTTLSample(keys, sampleSize = 3) {
    const sampled = keys.slice(0, sampleSize);
    const ttls = [];
    for (const key of sampled) {
        try {
            const ttl = await redisCmd('TTL', key);
            ttls.push(ttl);
        } catch { ttls.push(-1); }
    }
    return ttls;
}

async function main() {
    console.log('=== REDIS STORAGE AUDIT (Live Upstash Data) ===\n');
    
    // 1. DB Info
    console.log('[1] Database Info');
    try {
        const info = await redisCmd('DBSIZE');
        console.log(`  Total keys in DB: ${info}`);
    } catch (e) { console.log('  DBSIZE failed:', e.message); }

    // 2. Scan all keys
    console.log('\n[2] Scanning all keys...');
    const allKeys = await scanAllKeys();
    
    // 3. Categorize
    console.log('\n[3] Categorizing keys...');
    const categories = {};
    for (const key of allKeys) {
        const cat = categorizeKey(key);
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(key);
    }
    
    // 4. Measure sample sizes & TTLs
    console.log('[4] Measuring sample sizes and TTLs...\n');
    
    const results = [];
    for (const [cat, keys] of Object.entries(categories)) {
        const avgSize = await measureSample(keys, Math.min(3, keys.length));
        const ttls = await getTTLSample(keys, Math.min(3, keys.length));
        const estimatedTotal = avgSize * keys.length;
        
        results.push({
            category: cat,
            keyCount: keys.length,
            avgSizeBytes: Math.round(avgSize),
            estimatedTotalMB: (estimatedTotal / 1024 / 1024).toFixed(2),
            sampleTTLs: ttls.map(t => t === -1 ? 'NO_TTL' : t === -2 ? 'NOT_EXIST' : `${Math.round(t/3600)}h`),
            sampleKeys: keys.slice(0, 2)
        });
    }
    
    // Sort by estimated size descending
    results.sort((a, b) => parseFloat(b.estimatedTotalMB) - parseFloat(a.estimatedTotalMB));
    
    console.log('='.repeat(100));
    console.log('CATEGORY'.padEnd(35) + 'KEYS'.padEnd(8) + 'AVG SIZE'.padEnd(12) + 'EST. TOTAL'.padEnd(12) + 'SAMPLE TTLs'.padEnd(20) + 'SAMPLE KEYS');
    console.log('='.repeat(100));
    
    let grandTotal = 0;
    for (const r of results) {
        grandTotal += parseFloat(r.estimatedTotalMB);
        console.log(
            r.category.padEnd(35) +
            String(r.keyCount).padEnd(8) +
            formatBytes(r.avgSizeBytes).padEnd(12) +
            `${r.estimatedTotalMB} MB`.padEnd(12) +
            r.sampleTTLs.join(', ').padEnd(20) +
            r.sampleKeys[0]?.substring(0, 40)
        );
    }
    
    console.log('='.repeat(100));
    console.log(`GRAND TOTAL: ${allKeys.length} keys, ~${grandTotal.toFixed(2)} MB estimated from sampling`);
    console.log('\n⚠️  Note: This is STRLEN-based estimation. Actual Redis memory overhead is ~2-3x due to metadata.');
    console.log(`⚠️  Adjusted estimate: ~${(grandTotal * 2.5).toFixed(0)} MB actual Redis memory`);
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/1024/1024).toFixed(2)} MB`;
}

main().catch(e => console.error('FATAL:', e));
