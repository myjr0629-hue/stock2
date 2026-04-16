const https = require('https');
require('dotenv').config({ path: '.env.local' });

const FMP_KEY = process.env.FMP_API_KEY || 'JXjTgPslXAIdRg1aDQNLpa7ZkN2BhRnm';
const TICKER = 'AAPL';

const endpoints = [
    { name: 'Company Profile', url: `/api/v3/profile/${TICKER}` },
    { name: 'Real-time Quote', url: `/api/v3/quote/${TICKER}` },
    { name: 'Financial Ratios (TTM)', url: `/api/v3/ratios-ttm/${TICKER}` },
    { name: 'Key Metrics (TTM)', url: `/api/v3/key-metrics-ttm/${TICKER}` },
    { name: 'Discounted Cash Flow', url: `/api/v3/discounted-cash-flow/${TICKER}` },
    { name: 'Stock Peers', url: `/api/v4/stock_peers?symbol=${TICKER}` },
    { name: 'Enterprise Value', url: `/api/v3/enterprise-values/${TICKER}` },
    { name: 'Income Statement', url: `/api/v3/income-statement/${TICKER}?limit=1` },
    
    // Analyst Data
    { name: 'Analyst Estimates', url: `/api/v3/analyst-estimates/${TICKER}?limit=1` },
    { name: 'Price Target Consensus', url: `/api/v4/price-target-consensus?symbol=${TICKER}` },
    { name: 'Upgrades/Downgrades', url: `/api/v3/upgrades-downgrades-consensus?symbol=${TICKER}` },
    { name: 'Analyst Recommendations', url: `/api/v3/analyst-stock-recommendations/${TICKER}?limit=1` },
    
    // Earnings
    { name: 'Earnings Surprises', url: `/api/v3/earnings-surprises/${TICKER}` },
    { name: 'Earnings Calendar (General)', url: `/api/v3/earning_calendar?from=2024-01-01&to=2024-01-05` },
    
    // News & Sentiment
    { name: 'General News', url: `/api/v3/stock_news?tickers=${TICKER}&limit=1` },
    { name: 'FMP Articles', url: `/api/v3/fmp/articles` },
    { name: 'Social Sentiment Trending', url: `/api/v4/social-sentiment/trending` },
    
    // Macro & Trading Activity
    { name: 'Economic Calendar', url: `/api/v3/economic_calendar?from=2024-01-01&to=2024-01-05` },
    { name: 'Insider Trading', url: `/api/v4/insider-trading?symbol=${TICKER}&limit=1` },
    { name: 'Senate Trading', url: `/api/v4/senate-trading?symbol=${TICKER}&limit=1` },
    { name: 'Institutional Ownership', url: `/api/v4/institutional-ownership/symbol?symbol=${TICKER}` },
];

function testEndpoint(ep) {
    return new Promise((resolve) => {
        const fullUrl = `https://financialmodelingprep.com${ep.url}${(ep.url.includes('?') ? '&' : '?')}apikey=${FMP_KEY}`;
        
        https.get(fullUrl, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let success = false;
                let sample = '';
                let status = 'DENIED';

                try {
                    const json = JSON.parse(data);
                    // Handle "Error Message" format or restricted errors
                    if (json['Error Message'] || (json.error && typeof json.error === 'string' && json.error.toLowerCase().includes('plan'))) {
                        status = '🚫 BLOCKED (Paywall)';
                        sample = json['Error Message'] || json.error;
                    } else if (res.statusCode !== 200) {
                        status = `❌ ERROR ${res.statusCode}`;
                        sample = data.slice(0, 50);
                    } else if (Array.isArray(json) && json.length === 0) {
                        status = '✅ OK (Empty Array)';
                        success = true;
                    } else if (Array.isArray(json) && json.length > 0) {
                        status = '✅ ACCESS GRANTED';
                        sample = `Data keys: ${Object.keys(json[0]).slice(0, 5).join(', ')}...`;
                        success = true;
                    } else if (typeof json === 'object') {
                        if (Object.keys(json).length === 0) {
                            status = '✅ OK (Empty Object)';
                            success = true;
                        } else {
                            status = '✅ ACCESS GRANTED';
                            sample = `Data keys: ${Object.keys(json).slice(0, 5).join(', ')}...`;
                            success = true;
                        }
                    } else {
                        status = '⚠️ UNKNOWN RESPONSE';
                        sample = data.slice(0, 50);
                    }
                } catch (e) {
                    status = '❌ JSON PARSE ERROR';
                    sample = data.slice(0, 50);
                }

                resolve({ name: ep.name, url: ep.url, status, sample, success });
            });
        }).on('error', (err) => {
            resolve({ name: ep.name, url: ep.url, status: '❌ NET ERROR', sample: err.message, success: false });
        });
    });
}

async function runTests() {
    console.log(`Starting FMP API Capability Audit for key ending in ...${FMP_KEY.slice(-4)}\n`);
    
    const results = [];
    for (const ep of endpoints) {
        // console.log(`Testing: ${ep.name}...`);
        const result = await testEndpoint(ep);
        results.push(result);
    }
    
    console.log(`\n===============================================================`);
    console.log(`✅ GRANTED ENDPOINTS (Can use securely right now in production)`);
    console.log(`===============================================================`);
    results.filter(r => r.success).forEach(r => {
        console.log(`- ${r.name.padEnd(30)} => ${r.sample}`);
    });

    console.log(`\n===============================================================`);
    console.log(`🚫 BLOCKED ENDPOINTS (Requires higher FMP Tier)`);
    console.log(`===============================================================`);
    results.filter(r => !r.success).forEach(r => {
        console.log(`- ${r.name.padEnd(30)}`);
    });
}

runTests();
