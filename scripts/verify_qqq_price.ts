
import yfModule from 'yahoo-finance2';

async function main() {
    try {
        const YahooFinanceClass = (yfModule as any).default || yfModule;
        const yf = new YahooFinanceClass();
        const quote = await yf.quote('QQQ');
        console.log(`QQQ Real-time Price: ${quote.regularMarketPrice}`);
        console.log(`QQQ Market State: ${quote.marketState}`);
        console.log(`QQQ Quote Source: Yahoo Finance`);
    } catch (e) {
        console.error("Yahoo QQQ Fetch Failed:", e);
    }
}

main();
