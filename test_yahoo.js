
const yahooFinance = require('yahoo-finance2').default;

async function test() {
    try {
        const symbol = 'TSLA';
        console.log(`Fetching quote for ${symbol}...`);
        const quote = await yahooFinance.quote(symbol);
        console.log('Quote result:', quote);
        console.log('Price:', quote.regularMarketPrice);
    } catch (e) {
        console.error('Yahoo Finance Error:', e);
    }
}

test();
