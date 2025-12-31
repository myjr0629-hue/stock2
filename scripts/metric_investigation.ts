
import yfModule from 'yahoo-finance2';

async function main() {
    try {
        const YahooFinanceClass = (yfModule as any).default || yfModule;
        const yf = new YahooFinanceClass();
        const history = await yf.historical('QQQ', { period1: '2025-12-24', period2: '2025-12-31' });
        console.log("QQQ History:");
        history.forEach((h: any) => console.log(`${h.date.toISOString().split('T')[0]}: Close ${h.close}, AdjClose ${h.adjClose}`));
    } catch (e) {
        console.error("History Fetch Failed:", e);
    }
}
main();
