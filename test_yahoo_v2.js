
const { YahooFinance } = require('yahoo-finance2'); // Try named export if default fails?
// Or if default is the class:
const YahooFinanceDefault = require('yahoo-finance2').default;

async function test() {
    try {
        const symbol = 'TSLA';
        console.log(`Fetching quote for ${symbol}...`);

        // Attempt 1: Default singleton (which failed before, but let's see if we can instantiate it if it's a class)
        // console.log("Type of default:", typeof YahooFinanceDefault);

        // Attempt 2: If the error said "Call new YahooFinance()", maybe the default export IS the class
        // const yf = new YahooFinanceDefault(); 

        // Attempt 3: Standard library usually exports an instance suitable for direct use, 
        // BUT if the error explicitly says that, let's try the suggestion from the error message.
        // However, yahoo-finance2 v2 usually exports a singleton as default.

        // efficient fix based on error:
        // It seems we might be importing the wrong thing or the library expects explicit instantiation.
        // Let's try standard import again but log what we got.

        const yf = require('yahoo-finance2').default;

        // If yf.quote is a function, call it.
        // The error "Call const yahooFinance = new YahooFinance() first" typically comes from the library when 'suppressNotices' is triggered or similar.
        // Actually, looking at the library source code for that error...
        // It happens if you modify the export directly?

        // Let's try to just fix stockApi.ts by creating an instance if needed.
        // But usually:
        // import yahooFinance from 'yahoo-finance2';
        // await yahooFinance.quote(...) works.

        // Let's try to suppress the warning/error by using it correctly.
        // Maybe we just messed up the import in CommonJS land.

        const quote = await yf.quote(symbol);
        console.log('Quote result:', quote);
    } catch (e) {
        console.log("Still failing with default import.");
        console.log(e);
    }
}

test();
