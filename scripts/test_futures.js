
const yahooFinance = require('yahoo-finance2').default;

async function testFutures() {
    try {
        const result = await yahooFinance.quote('NQ=F');
        console.log('Success:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

testFutures();
