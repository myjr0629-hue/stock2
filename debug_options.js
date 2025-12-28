
const YF = require('yahoo-finance2').default;
const yahooFinance = new YF({ suppressNotices: ['yahooSurvey'] });

async function debugOptions() {
    const symbol = 'NVDA';
    console.log(`Fetching Options for ${symbol}...`);
    const start = Date.now();

    try {
        // 1. Basic Fetch
        const result = await yahooFinance.options(symbol, {});
        const duration = Date.now() - start;
        console.log(`Fetch completed in ${duration}ms`);

        // 2. Validate Structure
        if (!result) {
            console.error("Result is null/undefined");
            return;
        }

        console.log("Expiration Dates:", result.expirationDates);

        if (result.options && result.options.length > 0) {
            const chain = result.options[0];
            console.log(`Chain Found for date: ${chain.expirationDate}`);
            console.log(`Calls Count: ${chain.calls?.length}`);
            console.log(`Puts Count: ${chain.puts?.length}`);

            if (chain.calls && chain.calls.length > 0) {
                console.log("Sample Call:", JSON.stringify(chain.calls[0], null, 2));

                // Scan for ANY valid OI
                let totalCallOI = 0;
                let totalPutOI = 0;
                let withOI = 0;
                chain.calls.forEach(c => { totalCallOI += (c.openInterest || 0); if (c.openInterest > 0) withOI++; });
                chain.puts.forEach(p => { totalPutOI += (p.openInterest || 0); if (p.openInterest > 0) withOI++; });

                console.log(`Total Call OI: ${totalCallOI}`);
                console.log(`Total Put OI: ${totalPutOI}`);
                console.log(`Contracts with OI > 0: ${withOI} / ${chain.calls.length + chain.puts.length}`);
            } else {
                console.log("Calls array is empty!");
            }
        } else {
            console.log("No options chain in default response.");
        }

    } catch (error) {
        console.error("API Error:", error.message);
        if (error.errors) {
            console.error("Detailed Errors:", JSON.stringify(error.errors, null, 2));
        }
    }
}

debugOptions();
