async function checkTSLAPm() {
    const res = await fetch('https://api.polygon.io/v2/aggs/ticker/TSLA/range/1/minute/2026-02-24/2026-02-24?adjusted=true&sort=asc&limit=5000&apiKey=Pz5gR8aRCHkE_bZ_gTjB7qB1JpwGF2Lw');
    const data = await res.json();
    const results = data.results || [];

    if (results.length > 0) {
        console.log(`Total bars: ${results.length}`);
        console.log(`First 3 bars:`, results.slice(0, 3).map((b: any) => ({
            time: new Date(b.t).toLocaleString('en-US', { timeZone: 'America/New_York' }),
            close: b.c
        })));

        // Let's find the bar just before 9:30 AM ET
        const preMarketBars = results.filter((bar: any) => {
            const date = new Date(bar.t);
            const nyTimeStr = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
            // nyTimeStr format: "2/24/2026, 4:00:00 AM"
            const timePart = nyTimeStr.split(', ')[1];
            if (!timePart) return false;

            const match = timePart.match(/(\d+):(\d+):(\d+)\s+(AM|PM)/);
            if (!match) return false;

            let h = parseInt(match[1]);
            const ampm = match[4];
            if (ampm === 'PM' && h !== 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;
            const m = parseInt(match[2]);
            return (h * 60 + m) < (9 * 60 + 30);
        });

        console.log(`Found ${preMarketBars.length} PRE MARKET bars.`);
        if (preMarketBars.length > 0) {
            const last = preMarketBars[preMarketBars.length - 1];
            console.log(`---> EXACT PRE MARKET CLOSE (9:29 AM ET):`, new Date(last.t).toLocaleString('en-US', { timeZone: 'America/New_York' }), `$${last.c}`);
        }
    } else {
        console.log('No data found');
    }
}

checkTSLAPm().catch(console.error);
