async function check() {
    console.log("Searching for the latest AMD pre-market data...");
    const dayRes = await fetch('https://api.polygon.io/v2/aggs/ticker/AMD/range/1/day/2026-01-01/2026-02-28?adjusted=true&sort=desc&limit=5&apiKey=iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF');
    const dayData = await dayRes.json();
    const days = dayData.results || [];

    if (days.length < 2) return console.log("Not enough daily data");

    // Days are sorted desc. Latest is days[0].
    const latestDayStr = new Date(days[0].t).toISOString().split('T')[0];
    const prevDayStr = new Date(days[1].t).toISOString().split('T')[0];
    const prevClose = days[1].c;

    console.log(`Latest Live Session: ${latestDayStr}`);
    console.log(`Previous Session Close (${prevDayStr}): $${prevClose}`);

    const minRes = await fetch(`https://api.polygon.io/v2/aggs/ticker/AMD/range/1/minute/${latestDayStr}/${latestDayStr}?adjusted=true&sort=asc&limit=10000&apiKey=iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF`);
    const minData = await minRes.json();
    const minBars = minData.results || [];
    console.log(`\nFound ${minBars.length} minute bars for ${latestDayStr}`);

    let preMarketCloseBar = null;

    minBars.forEach((bar: any) => {
        const d = new Date(bar.t);
        const nyTime = d.toLocaleString('en-US', { timeZone: 'America/New_York' });
        // Find 9:29 AM ET bar
        if (nyTime.includes("9:29:00 AM")) {
            preMarketCloseBar = bar;
            console.log("Found 9:29 AM ET exact bar:", nyTime, "Close:", bar.c);
        }
    });

    if (preMarketCloseBar) {
        const change = ((preMarketCloseBar.c - prevClose) / prevClose) * 100;
        console.log(`=> Exact Pre-Market derived metrics - Close: $${preMarketCloseBar.c}, Change: ${change.toFixed(2)}%`);
    } else {
        console.log("Could not find a 9:29 AM ET bar.");
    }
}
check().catch(console.error);
