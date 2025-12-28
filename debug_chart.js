
const YF = require('yahoo-finance2').default;
const yf = new YF({ suppressNotices: ['yahooSurvey'] });

async function debugChart() {
    const symbol = 'NVDA';
    const range = '1d';
    const now = new Date();
    const start = new Date();
    start.setDate(now.getDate() - 3); // 1d range logic from stockApi.ts

    console.log(`Fetching chart for ${symbol}, Start: ${start.toISOString()}`);

    try {
        const chartRes = await yf.chart(symbol, { period1: start, interval: '5m' });

        if (!chartRes) {
            console.error("Chart Response is null");
            return;
        }

        console.log("Meta:", JSON.stringify(chartRes.meta, null, 2));

        if (chartRes.quotes && chartRes.quotes.length > 0) {
            console.log(`Quotes found: ${chartRes.quotes.length}`);
            const first = chartRes.quotes[0];
            console.log("First Quote:", first);
            console.log("Type of date:", typeof first.date, first.date?.constructor?.name);
        } else {
            console.log("Quotes array is empty or undefined");
        }

    } catch (e) {
        console.error("Chart Error:", e);
    }
}

debugChart();
