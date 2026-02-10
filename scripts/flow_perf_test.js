// Performance test: Before/After comparison for Flow page optimization
async function main() {
    const BASE = 'http://localhost:3001';
    const ticker = 'NVDA';

    console.log('=== Flow Page Optimization Results ===\n');

    // Test 1: First call (CACHE MISS - should build and cache)
    console.log('--- Test 1: First Call (Cache MISS) ---');
    let start = Date.now();
    let res = await fetch(`${BASE}/api/live/ticker?t=${ticker}`);
    let data = await res.json();
    const firstCallMs = Date.now() - start;
    const payloadSize = JSON.stringify(data).length;
    const rawChainSize = JSON.stringify(data.flow?.rawChain || []).length;
    const allExpirySize = JSON.stringify(data.flow?.allExpiryChain || []).length;

    console.log(`  Response time: ${firstCallMs}ms`);
    console.log(`  Total payload: ${(payloadSize / 1024).toFixed(1)} KB`);
    console.log(`  rawChain: ${(rawChainSize / 1024).toFixed(1)} KB (${data.flow?.rawChain?.length || 0} items)`);
    console.log(`  allExpiryChain: ${(allExpirySize / 1024).toFixed(1)} KB (${data.flow?.allExpiryChain?.length || 0} items)`);
    console.log(`  X-Cache: ${res.headers.get('X-Cache')}`);
    console.log(`  _cached: ${data._cached || false}`);

    // Test 2: Second call (CACHE HIT - should be instant)
    console.log('\n--- Test 2: Second Call (Cache HIT) ---');
    start = Date.now();
    res = await fetch(`${BASE}/api/live/ticker?t=${ticker}`);
    data = await res.json();
    const secondCallMs = Date.now() - start;

    console.log(`  Response time: ${secondCallMs}ms`);
    console.log(`  X-Cache: ${res.headers.get('X-Cache')}`);
    console.log(`  _cached: ${data._cached || false}`);

    // Test 3: Third call (should also be cache hit)
    console.log('\n--- Test 3: Third Call (Cache HIT verify) ---');
    start = Date.now();
    res = await fetch(`${BASE}/api/live/ticker?t=${ticker}`);
    data = await res.json();
    const thirdCallMs = Date.now() - start;

    console.log(`  Response time: ${thirdCallMs}ms`);
    console.log(`  _cached: ${data._cached || false}`);

    // Summary
    console.log('\n=== SUMMARY ===');
    console.log(`  First call (MISS): ${firstCallMs}ms / ${(payloadSize / 1024).toFixed(0)} KB`);
    console.log(`  Second call (HIT): ${secondCallMs}ms`);
    console.log(`  Third call (HIT):  ${thirdCallMs}ms`);
    console.log(`  Speedup: ${(firstCallMs / Math.max(1, secondCallMs)).toFixed(0)}x faster on cache hit`);

    // Compare with BEFORE numbers
    console.log('\n=== BEFORE vs AFTER ===');
    console.log(`  Payload: 3,009 KB → ${(payloadSize / 1024).toFixed(0)} KB (${Math.round((1 - payloadSize / 3009000) * 100)}% smaller)`);
    console.log(`  Cache HIT: N/A → ${secondCallMs}ms`);
}

main().catch(console.error);
