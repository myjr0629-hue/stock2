// const fetch = require('node-fetch'); // Native fetch in Node 18+ 
// actually standard node v18+ has fetch. 
// If not, I'll use http module. Safer to use http module for native support or assume fetch if node is new. 
// User environment is Windows, likely Node is installed if 'npm run dev' is running.
// I'll try native fetch first.

(async () => {
    try {
        const res = await fetch('http://localhost:3000/api/live/ticker?t=NVDA');
        const json = await res.json();
        console.log('--- DIAGNOSTIC RESULT ---');
        if (!json.flow) {
            console.log('ERROR: json.flow is MISSING');
        } else {
            console.log('Flow DataSource:', json.flow.dataSource);
            console.log('Flow NetPremium:', json.flow.netPremium);
            console.log('RawChain Length:', json.flow.rawChain ? json.flow.rawChain.length : 'UNDEFINED');
            if (json.flow.rawChain && json.flow.rawChain.length > 0) {
                const first = json.flow.rawChain[0];
                console.log('Sample[0]:', { strike: first.details?.strike_price, expiry: first.details?.expiration_date, vol: first.day?.volume });
            }
        }
    } catch (e) {
        console.error('Fetch Failed:', e.message);
    }
})();
