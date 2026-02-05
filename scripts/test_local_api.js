// Quick test of local API
const url = 'http://localhost:3000/api/intel/m7-calendar';

fetch(url)
    .then(res => res.json())
    .then(data => {
        console.log('=== M7 Calendar API Test ===');
        console.log('Earnings:', data.earnings?.length || 0, 'items');
        console.log('Recommendations:', Object.keys(data.recommendations || {}).length, 'symbols');
        if (data.earnings?.length > 0) {
            console.log('\nUpcoming Earnings:');
            data.earnings.slice(0, 3).forEach(e => {
                console.log(`  ${e.symbol} - ${e.date} (${e.hour})`);
            });
        }
        if (Object.keys(data.recommendations || {}).length > 0) {
            console.log('\nRecommendations:');
            Object.entries(data.recommendations).slice(0, 3).forEach(([sym, rec]) => {
                console.log(`  ${sym}: Buy=${rec.buy}, Hold=${rec.hold}, Sell=${rec.sell}`);
            });
        }
    })
    .catch(err => console.error('Error:', err.message));
