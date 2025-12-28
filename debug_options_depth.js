
const YF = require('yahoo-finance2').default;

async function debugOptionsDepth() {
    const symbol = "TSLA";
    const yf = new YF();

    try {
        console.log(`Fetching options quotes for ${symbol}...`);
        // First get the overview which normally contains expiration dates list
        const queryOptions = await yf.options(symbol, {});

        if (!queryOptions) {
            console.log("No data");
            return;
        }

        console.log(`Underlying Price: ${queryOptions.quote.regularMarketPrice}`);
        console.log(`Expiration Dates Available: ${queryOptions.expirationDates.length}`);

        // Check top 5 expirations
        // Note: yf.options(symbol) only fetches the first expiration by default or specific if date provided.
        // We need to fetch specific dates to check their volume.

        const dates = queryOptions.expirationDates.slice(0, 4); // Check next 5
        console.log("Checking volumes for next 4 expirations...");

        for (const date of dates) {
            const d = new Date(date).toISOString().split('T')[0];
            const dateParams = { date: Math.floor(new Date(date).getTime() / 1000) };

            const chainData = await yf.options(symbol, dateParams);
            const chain = chainData.options[0];

            if (!chain) continue;

            const totalCallsOI = chain.calls.reduce((acc, c) => acc + (c.openInterest || 0), 0);
            const totalPutsOI = chain.puts.reduce((acc, p) => acc + (p.openInterest || 0), 0);
            const totalOI = totalCallsOI + totalPutsOI;

            console.log(`[${d}] Total OI: ${totalOI} (Calls: ${totalCallsOI}, Puts: ${totalPutsOI})`);
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

debugOptionsDepth();
