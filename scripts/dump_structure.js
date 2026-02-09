// Search dashboard/unified for blockTrades, gld, and complete evidence structure
const http = require('http');

function fetch(url, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('Parse: ' + data.substring(0, 300))); }
            });
        });
        req.on('error', reject);
        req.setTimeout(timeout, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

async function main() {
    const r = await fetch('http://localhost:3000/api/dashboard/unified?tickers=NVDA');
    const str = JSON.stringify(r, null, 2);

    // Search for block-related fields
    const searches = ['block', 'gld', 'gold', 'safeHaven', 'safe_haven', 'tlt', 'macro', 'stealth'];
    searches.forEach(s => {
        const regex = new RegExp(`"[^"]*${s}[^"]*"\\s*:`, 'gi');
        const matches = [...str.matchAll(regex)];
        if (matches.length > 0) {
            matches.slice(0, 3).forEach(m => {
                const ctx = str.substring(m.index, m.index + 80);
                console.log(`Found '${s}': ${ctx}`);
            });
        } else {
            console.log(`'${s}' NOT found`);
        }
    });

    // Show NVDA ticker item in full
    console.log('\n=== NVDA Item Structure ===');
    const nvda = r.tickers?.find(t => t.ticker === 'NVDA') || r.items?.find(i => i.ticker === 'NVDA');
    if (nvda) {
        const nvStr = JSON.stringify(nvda, null, 2);
        // Remove rawChain to keep output manageable
        const clean = nvStr.replace(/"rawChain":\s*\[[\s\S]*?\]/g, '"rawChain": "[TRUNCATED]"');
        console.log(clean.substring(0, 5000));
    } else {
        console.log('NVDA not found. Available:', (r.tickers || r.items || []).map(t => t.ticker));
    }
}

main().catch(e => console.error('Error:', e.message));
