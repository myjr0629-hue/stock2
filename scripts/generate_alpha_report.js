// Alpha Report Generator — Full Universe Draft
const http = require('http');

const URL = 'http://localhost:3000/api/reports/generate?type=draft';

console.log(`=== ALPHA REPORT GENERATION ===`);
console.log(`ET: ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date())}`);
console.log(`Type: DRAFT (Full Universe Scan)`);
console.log(`Triggering...`);
console.log('');

const startTime = Date.now();

const req = http.request(URL, { method: 'POST', timeout: 300000 }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n=== RESULT (${elapsed}s) ===`);
        console.log(`Status: ${res.statusCode}`);
        try {
            const j = JSON.parse(data);
            console.log(JSON.stringify(j, null, 2));
        } catch {
            console.log(data.substring(0, 2000));
        }
    });
});

req.on('error', (e) => {
    console.error('Request failed:', e.message);
});

req.on('timeout', () => {
    console.log('Request timed out after 5 minutes — report may still be generating on server');
    req.destroy();
});

req.end();

// Progress dots
let dots = 0;
const ticker = setInterval(() => {
    dots++;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(`\r  Scanning... ${elapsed}s ${'●'.repeat(dots % 10 + 1).padEnd(10, '○')}`);
}, 3000);

// Cleanup on finish
process.on('exit', () => clearInterval(ticker));
