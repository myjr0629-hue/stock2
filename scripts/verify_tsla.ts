async function verify() {
    // 1. Get today's actual date based on what Polygon snapshot thinks
    const snapRes = await fetch('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/TSLA?apiKey=Pz5gR8aRCHkE_bZ_gTjB7qB1JpwGF2Lw');
    const snapData = await snapRes.json();
    const tsla = snapData.ticker;
    const updDate = new Date(tsla.updated / 1e6);
    const todayStr = updDate.toISOString().split('T')[0];

    console.log("Polygon's Current Date:", todayStr);
    console.log("PrevDay Close:", tsla.prevDay.c);

    // 2. Fetch the minute bars for today based on real Polygon date
    const minRes = await fetch(`https://api.polygon.io/v2/aggs/ticker/TSLA/range/1/minute/${todayStr}/${todayStr}?adjusted=true&sort=asc&limit=10000&apiKey=Pz5gR8aRCHkE_bZ_gTjB7qB1JpwGF2Lw`);
    const minData = await minRes.json();
    const bars = minData.results || [];

    // 3. Find the last bar before 9:30 AM ET
    const preMarketBars = bars.filter((b: any) => {
        const d = new Date(b.t);
        const nyTime = d.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });
        const match = nyTime.match(/(\d+):(\d+):(\d+)/);
        if (!match) return false;
        const h = parseInt(match[1]);
        const m = parseInt(match[2]);
        return (h * 60 + m) < (9 * 60 + 30);
    });

    if (preMarketBars.length > 0) {
        const pmc = preMarketBars[preMarketBars.length - 1];
        const tStr = new Date(pmc.t).toLocaleString('en-US', { timeZone: 'America/New_York' });
        console.log(`\nExact TSLA PRE-MARKET CLOSE (Last Bar): ${tStr} ET -> $${pmc.c}`);
    } else {
        console.log("No PRE-MARKET bars found for today.");
    }
}
verify().catch(console.error);
