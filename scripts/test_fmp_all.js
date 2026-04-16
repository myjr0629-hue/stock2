const https = require('https');
require('dotenv').config({ path: '.env.local' });

const FMP_KEY = process.env.FMP_API_KEY || 'JXjTgPslXAIdRg1aDQNLpa7ZkN2BhRnm';
const TICKER = 'AAPL';

// List of potentially highly valuable endpoints not currently in use
const endpoints = [
    // 💡 1. Sentiment & Social
    { name: 'Social Sentiment (Stock)', url: `/api/v4/historical/social-sentiment?symbol=${TICKER}&page=0` },
    { name: 'Stock News (Ticker specific)', url: `/api/v3/stock_news?tickers=${TICKER}&limit=5` },
    
    // 💡 2. Market Pulse
    { name: 'Most Active Stocks', url: `/api/v3/stock_market/actives` },
    { name: 'Top Gainers', url: `/api/v3/stock_market/gainers` },
    { name: 'Sector Performance', url: `/api/v3/sector-performance` },
    
    // 💡 3. Deep Analyst / Rating
    { name: 'Historical Rating', url: `/api/v3/historical-rating/${TICKER}?limit=5` },
    { name: 'Upgrades / Downgrades (Stable)', url: `/stable/upgrades-downgrades-consensus?symbol=${TICKER}` },
    
    // 💡 4. Deep Financials
    { name: 'Key Metrics TTM', url: `/api/v3/key-metrics-ttm/${TICKER}` },
    { name: 'Financial Ratios TTM', url: `/api/v3/ratios-ttm/${TICKER}` },
    
    // 💡 5. Ownership & Transcripts
    { name: 'Earnings Call Transcripts', url: `/api/v3/earning_call_transcript/${TICKER}?year=2024&quarter=1` },
    { name: 'Key Executives', url: `/api/v3/key-executives/${TICKER}` },
    { name: 'Institutional Holders', url: `/api/v3/institutional-holder/${TICKER}` },
    { name: 'Mutual Fund Holders', url: `/api/v3/mutual-fund-holder/${TICKER}` },

    // 💡 6. Dividends & Splits
    { name: 'Historical Dividends', url: `/api/v3/historical-price-full/stock_dividend/${TICKER}` },
    { name: 'Stock Splits', url: `/api/v3/historical-price-full/stock_split/${TICKER}` },
];

function testEndpoint(ep) {
    return new Promise((resolve) => {
        const fullUrl = `https://financialmodelingprep.com${ep.url}${(ep.url.includes('?') ? '&' : '?')}apikey=${FMP_KEY}`;
        
        https.get(fullUrl, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let success = false;
                
                try {
                    const json = JSON.parse(data);
                    
                    if (res.statusCode === 200) {
                        if (Array.isArray(json) && json.length > 0) {
                            success = true;
                        } else if (typeof json === 'object' && !json['Error Message'] && !json['error']) {
                            // Some endpoints return objects not arrays
                            if (Object.keys(json).length > 0) {
                                success = true;
                            }
                        }
                    }
                } catch (e) {
                    success = false;
                }
                resolve({ name: ep.name, success });
            });
        }).on('error', () => {
             resolve({ name: ep.name, success: false });
        });
    });
}

async function runTests() {
    console.log("Searching for HIDDEN GEM API endpoints available in the current FMP tier...\n");
    const granted = [];
    
    for (const ep of endpoints) {
        const result = await testEndpoint(ep);
        if (result.success) {
            granted.push(ep.name);
        }
    }
    
    if (granted.length > 0) {
        console.log("✅ AVAILABLE ENDPOINTS (Not currently used but accessible):");
        granted.forEach(name => console.log(` - ${name}`));
    } else {
        console.log("❌ No new endpoints were accessible.");
    }
}

runTests();
