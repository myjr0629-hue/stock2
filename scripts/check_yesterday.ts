async function checkYesterdayPost() {
    const res = await fetch(`https://api.polygon.io/v2/aggs/ticker/AMD/range/1/minute/2026-02-23/2026-02-24?adjusted=true&sort=asc&limit=10000&apiKey=iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF`);
    const data = await res.json();
    const bars = data.results || [];

    // Find post-market bars for yesterday (after 4:00 PM ET)
    const post = bars.filter((b: any) => {
        const d = new Date(b.t);
        const nyTime = d.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });
        if (!nyTime.startsWith("2/23/2026")) return false;

        const [h, m] = nyTime.split(', ')[1].split(':').map(Number);
        return h >= 16;
    });

    if (post.length > 0) {
        let lastPost = post[post.length - 1];
        console.log(`Yesterday's Last Post-Market bar (Close): $${lastPost.c}`);
        let found198 = post.find((b: any) => b.c === 198);
        if (found198) {
            console.log(`Found a $198.00 print in yesterday's POST at ${new Date(found198.t).toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
        }
    } else {
        console.log("No POST bars found");
    }
}
checkYesterdayPost().catch(console.error);
