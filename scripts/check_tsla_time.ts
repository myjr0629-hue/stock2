async function check() {
    // 1. Fetch yesterday's snapshot data to see what TSLA was doing.
    const dateQuery = '2026-02-24';
    console.log("Fetching TSLA data for", dateQuery);

    // We will just fetch the last 5 days of daily bars to get exactly the close
    const daysRes = await fetch('https://api.polygon.io/v2/aggs/ticker/TSLA/range/1/day/2026-02-15/2026-02-24?adjusted=true&sort=asc&limit=50&apiKey=Pz5gR8aRCHkE_bZ_gTjB7qB1JpwGF2Lw');
    const daysData = await daysRes.json();
    console.log("Daily Bars:");
    (daysData.results || []).forEach((b: any) => {
        console.log(new Date(b.t).toLocaleDateString(), "O:", b.o, "H:", b.h, "L:", b.l, "C:", b.c);
    });

    // To find the PRE MARKET close today, we need minute bars from 04:00 AM to 09:30 AM ET today.
    // Let's just fetch everything today and print the bar at 9:29 AM ET.
    const minRes = await fetch('https://api.polygon.io/v2/aggs/ticker/TSLA/range/1/minute/2026-02-24/2026-02-25?adjusted=true&sort=asc&limit=10000&apiKey=Pz5gR8aRCHkE_bZ_gTjB7qB1JpwGF2Lw');
    const minData = await minRes.json();
    const minBars = minData.results || [];
    console.log(`\nFound ${minBars.length} minute bars for today`);

    let preMarketCloseBar = null;
    let yesterdayPreMarketCloseBar = null;

    minBars.forEach((bar: any) => {
        const d = new Date(bar.t);
        const nyTime = d.toLocaleString('en-US', { timeZone: 'America/New_York' });
        if (nyTime.includes("9:29:00 AM")) {
            preMarketCloseBar = bar;
            console.log("Found 9:29 AM ET bar today:", nyTime, "Close:", bar.c);
        }
    });

    const yesterdayRes = await fetch('https://api.polygon.io/v2/aggs/ticker/TSLA/range/1/minute/2026-02-23/2026-02-23?adjusted=true&sort=asc&limit=10000&apiKey=Pz5gR8aRCHkE_bZ_gTjB7qB1JpwGF2Lw');
    const yesterdayData = await yesterdayRes.json();
    (yesterdayData.results || []).forEach((bar: any) => {
        const d = new Date(bar.t);
        const nyTime = d.toLocaleString('en-US', { timeZone: 'America/New_York' });
        if (nyTime.includes("9:29:00 AM")) {
            console.log("Found 9:29 AM ET bar YESTERDAY:", nyTime, "Close:", bar.c);
        }
        if (nyTime.includes("4:00:00 PM")) {
            console.log("Found 4:00 PM ET bar YESTERDAY:", nyTime, "Close:", bar.c);
        }
        if (nyTime.includes("7:59:00 PM")) {
            console.log("Found 7:59 PM ET bar YESTERDAY:", nyTime, "Close:", bar.c);
        }
    });

}
check().catch(console.error);
