// Check actual API response structure
const http = require('http');

function fetch(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('Parse error: ' + data.substring(0, 500))); }
            });
        }).on('error', reject);
    });
}

async function main() {
    const r = await fetch('http://localhost:3000/api/live/ticker?t=NVDA');
    console.log('Top-level keys:', Object.keys(r));
    if (r.evidence) {
        console.log('evidence keys:', Object.keys(r.evidence));
    }
    if (r.data) {
        console.log('data keys:', Object.keys(r.data));
        if (r.data.evidence) console.log('data.evidence keys:', Object.keys(r.data.evidence));
    }
    if (r.ticker) {
        console.log('ticker:', r.ticker);
    }
    // Show first 2000 chars of stringified response
    const str = JSON.stringify(r, null, 2);
    console.log('\nResponse preview (first 3000 chars):\n', str.substring(0, 3000));
}

main().catch(e => console.error('Error:', e.message));
