async function test() {
    try {
        const res = await fetch('https://signumhq.com/api/intel/snapshot?sector=m7');
        console.log('Prod Snapshot API Status:', res.status);
        const data = await res.json();
        console.log('Success:', data.success);
        console.log('Has Snapshot:', !!data.snapshot);
        if (data.snapshot) {
            console.log('Ticker Count:', data.snapshot.tickers?.length);
            console.log('Has Sector Summary:', !!data.snapshot.sector_summary);
            if (data.snapshot.sector_summary) {
                console.log('Outlook:', data.snapshot.sector_summary.outlook);
                console.log('Headline:', data.snapshot.sector_summary.briefing?.headline);
            }
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
