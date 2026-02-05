// Finnhub Free Tier Full Test
// Usage: node scripts/test_finnhub_full.js

const FINNHUB_API_KEY = 'd6238q1r01qgcobreau0d6238q1r01qgcobreaug';
const BASE_URL = 'https://finnhub.io/api/v1';

async function fetchFinnhub(endpoint, params = {}) {
    const queryParams = new URLSearchParams({ ...params, token: FINNHUB_API_KEY });
    const url = `${BASE_URL}${endpoint}?${queryParams}`;
    try {
        const res = await fetch(url);
        if (!res.ok) return { error: `HTTP ${res.status}` };
        return await res.json();
    } catch (err) {
        return { error: err.message };
    }
}

async function testAllEndpoints() {
    const ticker = 'AAPL';
    console.log('=== Finnhub Free Tier Full Test ===\n');
    console.log(`Testing with: ${ticker}\n`);

    const tests = [
        // Fundamental Data
        { name: 'Company Profile v2', endpoint: '/stock/profile2', params: { symbol: ticker } },
        { name: 'Company News', endpoint: '/company-news', params: { symbol: ticker, from: '2026-01-01', to: '2026-02-05' } },
        { name: 'Dividends', endpoint: '/stock/dividend', params: { symbol: ticker, from: '2020-01-01', to: '2026-12-31' } },

        // Estimates (가장 유용!)
        { name: 'Recommendation Trends', endpoint: '/stock/recommendation', params: { symbol: ticker } },
        { name: 'Price Target', endpoint: '/stock/price-target', params: { symbol: ticker } },
        { name: 'Upgrade/Downgrade', endpoint: '/stock/upgrade-downgrade', params: { symbol: ticker } },
        { name: 'Earnings Calendar', endpoint: '/calendar/earnings', params: { symbol: ticker, from: '2026-01-01', to: '2026-12-31' } },
        { name: 'EPS Estimate', endpoint: '/stock/eps-estimate', params: { symbol: ticker } },
        { name: 'Revenue Estimate', endpoint: '/stock/revenue-estimate', params: { symbol: ticker } },

        // Alternative Data
        { name: 'Insider Transactions', endpoint: '/stock/insider-transactions', params: { symbol: ticker } },
        { name: 'Insider Sentiment', endpoint: '/stock/insider-sentiment', params: { symbol: ticker, from: '2024-01-01', to: '2026-02-05' } },
        { name: 'Social Sentiment', endpoint: '/stock/social-sentiment', params: { symbol: ticker, from: '2026-01-01', to: '2026-02-05' } },
        { name: 'Lobbying', endpoint: '/stock/lobbying', params: { symbol: ticker, from: '2020-01-01', to: '2026-02-05' } },

        // Economic Data
        { name: 'Economic Calendar', endpoint: '/calendar/economic', params: { from: '2026-02-01', to: '2026-02-28' } },

        // Market Data
        { name: 'Quote', endpoint: '/quote', params: { symbol: ticker } },
    ];

    for (const test of tests) {
        const data = await fetchFinnhub(test.endpoint, test.params);

        if (data.error) {
            console.log(`❌ ${test.name}: ${data.error}`);
        } else if (Array.isArray(data) && data.length === 0) {
            console.log(`⚠️ ${test.name}: Empty array`);
        } else if (Object.keys(data).length === 0) {
            console.log(`⚠️ ${test.name}: Empty object`);
        } else {
            console.log(`✅ ${test.name}:`);
            // Show sample of data
            if (Array.isArray(data)) {
                console.log(`   📊 ${data.length} items`);
                if (data[0]) console.log(`   Sample:`, JSON.stringify(data[0]).substring(0, 200) + '...');
            } else {
                const keys = Object.keys(data);
                console.log(`   📊 Keys: ${keys.slice(0, 8).join(', ')}${keys.length > 8 ? '...' : ''}`);
            }
        }
        console.log('');

        // Rate limit: 60 calls/min = wait 1 sec between calls
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log('=== Test Complete ===');
}

testAllEndpoints();
