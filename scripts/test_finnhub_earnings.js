// Finnhub Earnings Calendar API Test
// Usage: node scripts/test_finnhub_earnings.js

const FINNHUB_API_KEY = 'd6238q1r01qgcobreau0d6238q1r01qgcobreaug';

const M7_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA'];

async function testEarningsCalendar() {
    console.log('=== Finnhub Earnings Calendar API Test ===\n');

    // Test 1: Get earnings for a specific symbol
    console.log('1️⃣ Testing single ticker (AAPL)...');
    try {
        const from = '2025-01-01';
        const to = '2026-12-31';
        const url = `https://finnhub.io/api/v1/calendar/earnings?symbol=AAPL&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;

        const res = await fetch(url);
        const data = await res.json();

        console.log('Status:', res.status);
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error:', err.message);
    }

    console.log('\n---\n');

    // Test 2: Get all M7 earnings
    console.log('2️⃣ Testing all M7 tickers...');
    for (const ticker of M7_TICKERS) {
        try {
            const from = '2026-01-01';
            const to = '2026-06-30';
            const url = `https://finnhub.io/api/v1/calendar/earnings?symbol=${ticker}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;

            const res = await fetch(url);
            const data = await res.json();

            const earnings = data.earningsCalendar || [];
            if (earnings.length > 0) {
                console.log(`✅ ${ticker}: ${earnings.length} earnings found`);
                earnings.forEach(e => {
                    console.log(`   - ${e.date} | EPS Est: ${e.epsEstimate} | Hour: ${e.hour}`);
                });
            } else {
                console.log(`⚠️ ${ticker}: No upcoming earnings found`);
            }
        } catch (err) {
            console.error(`❌ ${ticker}: ${err.message}`);
        }
    }

    console.log('\n=== Test Complete ===');
}

testEarningsCalendar();
