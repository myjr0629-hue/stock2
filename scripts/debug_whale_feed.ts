
import fetch from 'node-fetch';

async function testWhaleFeed(ticker: string) {
    console.log(`Testing Whale Feed for ${ticker}...`);
    try {
        const res = await fetch(`http://localhost:3000/api/live/options/trades?t=${ticker}`);
        const data = await res.json();

        console.log(`Status: ${res.status}`);
        if (res.ok) {
            console.log(`Count: ${data.count}`);
            console.log(`Debug Info:`, data.debug);
            if (data.items && data.items.length > 0) {
                console.log('Top 3 Whale Trades:');
                data.items.slice(0, 3).forEach((item: any, i: number) => {
                    console.log(`[${i + 1}] ${item.timeET} | ${item.type} ${item.strike} | $${(item.premium / 1000).toFixed(1)}K (Exp: ${item.expiry})`);
                });
            } else {
                console.log("No whale trades found. Check filters.");
            }
        } else {
            console.error("Error:", data);
        }
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}

// Run test
testWhaleFeed('TSLA');
testWhaleFeed('NVDA');
