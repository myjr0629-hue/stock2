// Minimal test to replicate exactly what Probe does
const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";

async function test() {
    console.log('=== Direct API Test (Same as Probe) ===');

    const ticker = 'NVDA';
    const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    console.log('ET Time:', nowET.toISOString());
    console.log('Day of Week:', nowET.getDay(), '(0=Sun, 6=Sat)');

    const todayStr = nowET.toISOString().split('T')[0];
    console.log('Today String (Before Weekend Fix):', todayStr);

    // Weekend adjustment
    const day = nowET.getDay();
    if (day === 0) { // Sunday
        nowET.setDate(nowET.getDate() - 2);
        console.log('WEEKEND: Adjusted Sunday -> Friday');
    } else if (day === 6) { // Saturday
        nowET.setDate(nowET.getDate() - 1);
        console.log('WEEKEND: Adjusted Saturday -> Friday');
    }

    const adjustedTodayStr = nowET.toISOString().split('T')[0];
    console.log('Adjusted Today String:', adjustedTodayStr);

    // Build URL like the Probe does
    const maxExpiryDate = new Date(nowET);
    maxExpiryDate.setDate(maxExpiryDate.getDate() + 35);
    const maxExpiryStr = maxExpiryDate.toISOString().split('T')[0];

    const url = `https://api.polygon.io/v3/snapshot/options/${ticker}?limit=250&expiration_date.gte=${adjustedTodayStr}&expiration_date.lte=${maxExpiryStr}&apiKey=${MASSIVE_API_KEY}`;

    console.log('\nFetching URL:', url.replace(MASSIVE_API_KEY, 'HIDDEN'));

    try {
        const res = await fetch(url);
        console.log('Status:', res.status);

        const data = await res.json();
        console.log('Results count:', data?.results?.length || 0);

        if (data?.results?.length > 0) {
            console.log('First result expiry:', data.results[0].details?.expiration_date);
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
