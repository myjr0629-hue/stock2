const UPSTASH_URL = 'https://sacred-manatee-21571.upstash.io';
const UPSTASH_TOKEN = 'AVRDAAIncDIwNzE3MjMwY2ZjZDg0MWY2OWY5OGYyYzdlODUzYjU4Y3AyMjE1NzE';

async function cmd(...args) {
    const res = await fetch(UPSTASH_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
    });
    const d = await res.json();
    return d.result;
}

async function scanAll() {
    const all = [];
    let cursor = '0';
    do {
        const r = await cmd('SCAN', cursor, 'COUNT', '1000');
        cursor = r[0]; all.push(...r[1]);
    } while (cursor !== '0');
    return all;
}

async function main() {
    console.log("Scanning...");
    const keys = await scanAll();
    const analysisKeys = keys.filter(k => k.startsWith('cache:analysis:'));
    console.log("Total cache:analysis Keys:", analysisKeys.length);
    
    // fetch their scores
    const results = [];
    for (const key of analysisKeys) {
        const dataStr = await cmd('GET', key);
        if (dataStr) {
            const data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
            results.push({
                ticker: data.ticker,
                score: data.alphaSnapshot?.score,
                grade: data.alphaSnapshot?.grade,
                action: data.alphaSnapshot?.action
            });
        }
    }
    
    console.log("Cached tickers and their scores:");
    console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
