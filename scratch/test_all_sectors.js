const fs = require('node:fs');

const SECTORS = [
    'm7',
    'silicon_core',
    'power_matrix',
    'physical_ai',
    'bio_pulse',
    'cyber_shield',
    'orbit_defense',
    'quantum_edge',
    'fintech_pulse',
    'cloud_fortress'
];

async function test() {
    console.log('Testing snapshot API for all 10 sectors...');
    for (const sec of SECTORS) {
        try {
            const start = Date.now();
            const res = await fetch(`http://localhost:3000/api/intel/snapshot?sector=${sec}`);
            const elapsed = Date.now() - start;
            console.log(`- Sector ${sec}: Status ${res.status} in ${elapsed}ms`);
            if (res.status === 200) {
                const data = await res.json();
                console.log(`  Success: ${data.success}, Tickers: ${data.snapshot?.tickers?.length || 0}`);
            }
        } catch (e) {
            console.error(`  Error for ${sec}:`, e.message);
        }
    }
}

test();
