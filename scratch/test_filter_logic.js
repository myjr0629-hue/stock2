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
    
    const entries = [];
    for (const key of analysisKeys) {
        const dataStr = await cmd('GET', key);
        if (dataStr) {
            const data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
            entries.push(data);
        }
    }
    
    console.log(`Loaded ${entries.length} cached entries.`);
    
    // Exact filtering parameters from the screenshot:
    const scoreMin = 60;
    const scoreMax = 100;
    const allowedGrades = ['S', 'A', 'B'];
    const actionParam = null;
    const search = '';
    const overlay = '';
    const gexMin = -10;
    const pcrMax = 1.8;
    const darkPoolMin = 0;

    let filtered = entries.filter(e => {
        if (!e || !e.ticker || !e.alphaSnapshot) {
            return false;
        }
        
        const score = e.alphaSnapshot.score;
        const grade = e.alphaSnapshot.grade?.toUpperCase();
        const action = e.alphaSnapshot.action?.toUpperCase();

        if (score < scoreMin || score > scoreMax) {
            return false;
        }

        if (allowedGrades.length > 0 && !allowedGrades.includes(grade)) {
            return false;
        }

        if (actionParam && action !== actionParam.toUpperCase()) {
            return false;
        }

        // Options limits
        // Use gexM (net Gex in Millions) instead of raw gex!
        const gexValue = e.gexM !== undefined ? e.gexM : (e.gex != null ? e.gex / 1000000 : null);
        if (gexValue != null && gexValue < gexMin) {
            console.log(`- Ticker ${e.ticker}: Rejected by gexM ${gexValue} < ${gexMin}`);
            return false;
        }
        if (e.pcr != null && e.pcr > pcrMax) {
            console.log(`- Ticker ${e.ticker}: Rejected by pcr ${e.pcr} > ${pcrMax}`);
            return false;
        }
        if (e.darkPoolPct != null && e.darkPoolPct < darkPoolMin) {
            console.log(`- Ticker ${e.ticker}: Rejected by darkPoolPct ${e.darkPoolPct} < ${darkPoolMin}`);
            return false;
        }

        console.log(`+ Ticker ${e.ticker}: PASSED! (score: ${score}, grade: ${grade}, gexM: ${gexValue}, pcr: ${e.pcr})`);
        return true;
    });

    console.log(`Total passed entries with gexM fix: ${filtered.length}`);
}

main().catch(console.error);
