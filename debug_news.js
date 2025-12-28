const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

async function test() {
    try {
        console.log("Fetching News for ^GSPC...");
        const result = await yahooFinance.search('^GSPC', { newsCount: 2 });
        if (result.news && result.news.length > 0) {
            console.log("First News Item:", JSON.stringify(result.news[0], null, 2));
            console.log("Type of providerPublishTime:", typeof result.news[0].providerPublishTime);
            console.log("Value:", result.news[0].providerPublishTime);
        } else {
            console.log("No news found.");
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

test();
