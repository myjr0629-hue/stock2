import { processWatchlistBatch } from '../src/services/watchlistBatchService';

async function test() {
    const tickers = [
        "NVDA", "UPS", "GOOGL", "TSLA", "AAPL", "AMZN", "COP", "CROX", "PANW",
        "WMT", "RYAAY", "MNDY", "FCX", "PLTR", "RKLB", "TTR", "MSFT", "HLF",
        "SERV", "PLUG", "SYM", "IONQ", "HUM", "ZS", "AMD", "VRT", "META",
        "LMT", "NFLX", "OKTA", "VZ", "INTC", "YETI", "MSTR", "ASTS", "AVGO", "CGC"
    ];
    console.log(`Testing with ${tickers.length} tickers...`);
    
    const start = Date.now();
    try {
        const payload = await processWatchlistBatch(tickers, 'ssr');
        const end = Date.now();
        console.log(`SSR Batch Time: ${((end - start) / 1000).toFixed(2)}s`);
        console.log(`Payload length: ${payload ? payload.length : 0}`);
    } catch (e) {
        console.error('Failed:', e);
    }
}
test();
