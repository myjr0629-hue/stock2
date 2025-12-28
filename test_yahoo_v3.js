
const { YahooFinance } = require('yahoo-finance2'); // Try named export if default fails?
// It seems `default` export is the class in this build?

async function test() {
    try {
        const symbol = 'TSLA';
        console.log(`Fetching quote for ${symbol}...`);

        // Let's look at what we are importing
        const YF = require('yahoo-finance2').default;
        // console.log("YF default:", YF);

        // The error "Call const yahooFinance = new YahooFinance() first" means we are calling a method on the prototype or class directly?

        // Try to instantiate
        const yahooFinance = new YF();

        const quote = await yahooFinance.quote(symbol);
        console.log('Quote result:', quote.symbol, quote.regularMarketPrice);
    } catch (e) {
        console.log("Failed again.");
        console.log(e);
    }
}

test();
