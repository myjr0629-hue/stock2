const API_KEY = "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const BASE = "https://api.polygon.io";
const fs = require('fs');

async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function analyze(ticker) {
    const snap = await fetchJSON(`${BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${API_KEY}`);
    const currentPrice = snap.ticker?.lastTrade?.p || snap.ticker?.day?.c || snap.ticker?.prevDay?.c || 0;

    const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const todayStr = etNow.getFullYear() + '-' + String(etNow.getMonth() + 1).padStart(2, '0') + '-' + String(etNow.getDate()).padStart(2, '0');
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][etNow.getDay()];

    const probe = await fetchJSON(BASE + '/v3/snapshot/options/' + ticker + '?expiration_date.gte=' + todayStr + '&sort=expiration_date&order=asc&limit=250&apiKey=' + API_KEY);
    const all = probe.results || [];

    const byExp = {};
    all.forEach(function (c) {
        const e = c.details?.expiration_date;
        if (e) {
            if (!byExp[e]) byExp[e] = [];
            byExp[e].push(c);
        }
    });
    const expiries = Object.keys(byExp).sort();

    let totalGammaAll = 0;
    const rows = [];
    for (const exp of expiries) {
        const cs = byExp[exp];
        let tg = 0, ag = 0, coi = 0, poi = 0;
        cs.forEach(function (c) {
            const g = Math.abs((c.greeks?.gamma || 0) * (c.open_interest || 0) * 100);
            const s = c.details?.strike_price || 0;
            const t = c.details?.contract_type;
            tg += g;
            if (t === 'call') coi += (c.open_interest || 0);
            else poi += (c.open_interest || 0);
            if (currentPrice > 0 && Math.abs(s - currentPrice) / currentPrice < 0.02) ag += g;
        });
        totalGammaAll += tg;
        const ed = new Date(exp + 'T16:00:00');
        const td = new Date(todayStr + 'T09:30:00');
        const dte = Math.max(0, Math.round((ed.getTime() - td.getTime()) / 86400000));
        const atmPctVal = tg > 0 ? Math.round((ag / tg * 100) * 10) / 10 : 0;
        rows.push({
            expiry: exp,
            dte: dte,
            contracts: cs.length,
            gammaK: Math.round(tg / 1000),
            atmPct: atmPctVal,
            callOI: coi,
            putOI: poi,
            isToday: exp === todayStr
        });
    }

    rows.forEach(function (r) {
        r.sharePct = totalGammaAll > 0 ? Math.round((r.gammaK * 1000 / totalGammaAll * 100) * 10) / 10 : 0;
    });

    const n = rows[0];
    let level, insight;
    if (!n) {
        level = 'NO_DATA';
        insight = 'No options data';
    } else if (n.isToday) {
        if (n.atmPct >= 50) { level = 'EXTREME'; insight = 'Gamma explosion imminent'; }
        else if (n.atmPct >= 30) { level = 'HIGH'; insight = 'Strong ATM pinning'; }
        else if (n.atmPct >= 15) { level = 'MODERATE'; insight = 'Normal expiry'; }
        else { level = 'LOW'; insight = 'Minimal gamma'; }
    } else {
        if (n.dte <= 1 && n.sharePct >= 40) { level = 'HIGH'; insight = 'Expiry tmrw, gamma ' + n.sharePct + '% conc'; }
        else if (n.dte <= 2) { level = 'CAUTION'; insight = n.dte + 'd to expiry'; }
        else { level = 'WATCH'; insight = 'Next expiry ' + n.dte + 'd away'; }
    }

    return {
        ticker: ticker,
        currentPrice: currentPrice,
        etDate: todayStr,
        dayName: dayName,
        totalContracts: all.length,
        expiryCount: expiries.length,
        expiryTable: rows,
        proposed: n ? {
            nearest: n.expiry,
            dte: n.dte,
            isToday: n.isToday,
            atmConcentration: n.atmPct,
            gammaShare: n.sharePct,
            contracts: n.contracts,
            callOI: n.callOI,
            putOI: n.putOI,
            level: level,
            insight: insight
        } : null,
        current: {
            value: '100%',
            level: 'EXTREME',
            note: 'Always 100% because rawChain has only 1 expiry'
        }
    };
}

async function main() {
    const results = {};
    for (const t of ['GOOGL', 'TSLA', 'SPY']) {
        try {
            results[t] = await analyze(t);
        } catch (e) {
            results[t] = { error: e.message };
        }
    }
    fs.writeFileSync('scripts/gamma_result.json', JSON.stringify(results, null, 2), 'utf8');
    process.stdout.write('DONE\n');
}
main();
