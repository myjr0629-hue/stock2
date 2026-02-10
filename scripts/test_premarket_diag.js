// Clean PM verification — one ticker per line, no truncation
const http = require('http');

function fetch(ticker) {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:3000/api/live/ticker?t=${ticker}`, (res) => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
        }).on('error', reject);
    });
}

async function main() {
    const ts = ['PLTR', 'META', 'NVDA', 'TSLA', 'MSTR', 'AMD', 'AAPL', 'SMCI', 'MSFT', 'AMZN', 'GOOG'];
    const et = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    console.log(`ET ${et}`);
    console.log('───────────────────────────────────────────────────');
    console.log('TICKER  prevClose   prePrice   PM%       Score Grade');
    console.log('───────────────────────────────────────────────────');

    for (const t of ts) {
        try {
            const d = await fetch(t);
            if (!d || d.error) { console.log(`${t.padEnd(7)} ERROR: ${d?.error || 'no response'}`); continue; }

            const prev = d.prices?.prevRegularClose || d.calc?.baselinePrice || 0;
            const pre = d.prices?.prePrice || d.calc?.activePrice || 0;
            const pmPct = prev > 0 ? ((pre - prev) / prev * 100) : 0;
            const score = d.alpha?.score || '?';
            const grade = d.alpha?.grade || '?';

            const pmStr = (pmPct >= 0 ? '+' : '') + pmPct.toFixed(2) + '%';
            console.log(`${t.padEnd(7)} $${prev.toFixed(2).padStart(8)}  $${pre.toFixed(2).padStart(8)}  ${pmStr.padStart(8)}  ${String(score).padStart(4)}  ${grade}`);
        } catch (e) {
            console.log(`${t.padEnd(7)} FETCH ERROR`);
        }
    }
    console.log('───────────────────────────────────────────────────');
}
main();
