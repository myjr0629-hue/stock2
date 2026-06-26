// Standalone 13F cache builder — runs directly, no Next.js server needed
const { Redis } = require('@upstash/redis');

const API_KEY = process.env.MASSIVE_API_KEY || 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const BASE = process.env.MASSIVE_BASE_URL || 'https://api.polygon.io';

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const INSTITUTIONS = [
    { cik: '0000102909', name: 'Vanguard Group', domain: 'vanguard.com' },
    { cik: '0001364742', name: 'BlackRock Inc.', domain: 'blackrock.com' },
    { cik: '0001037389', name: 'State Street Corp', domain: 'statestreet.com' },
    { cik: '0001166559', name: 'Fidelity (FMR)', domain: 'fidelity.com' },
    { cik: '0001065696', name: 'JPMorgan Chase', domain: 'jpmorgan.com' },
    { cik: '0000070858', name: 'Bank of America', domain: 'bankofamerica.com' },
    { cik: '0000019617', name: 'Morgan Stanley', domain: 'morganstanley.com' },
    { cik: '0001423053', name: 'Goldman Sachs Asset Mgmt', domain: 'goldmansachs.com' },
    { cik: '0001649339', name: 'Geode Capital Mgmt', domain: 'geodecapital.com' },
    { cik: '0001037529', name: 'Wellington Management', domain: 'wellington.com' },
    { cik: '0001160106', name: 'Northern Trust Corp', domain: 'northerntrust.com' },
    { cik: '0001633907', name: 'Capital Group', domain: 'capitalgroup.com' },
    { cik: '0001067983', name: 'Berkshire Hathaway', domain: 'berkshirehathaway.com' },
    { cik: '0001141046', name: 'Citadel Advisors', domain: 'citadel.com' },
    { cik: '0001159159', name: 'Invesco Ltd', domain: 'invesco.com' },
];

async function fetchHoldings(cik) {
    const all = [];
    let nextUrl = null;
    for (let p = 0; p < 3; p++) {
        const url = nextUrl || `${BASE}/stocks/filings/vX/13-F?filer_cik=${cik}&limit=1000&sort=filing_date.desc&apiKey=${API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) break;
        const data = await res.json();
        all.push(...(data.results || []));
        nextUrl = data.next_url ? `${data.next_url}&apiKey=${API_KEY}` : null;
        if (!nextUrl) break;
        await new Promise(r => setTimeout(r, 100));
    }
    return all;
}

async function main() {
    console.log('=== 13-F Cache Builder ===\n');
    const start = Date.now();
    const cusipIndex = new Map();
    let totalFilings = 0;

    for (let i = 0; i < INSTITUTIONS.length; i += 5) {
        const batch = INSTITUTIONS.slice(i, i + 5);
        const results = await Promise.allSettled(
            batch.map(async inst => {
                const filings = await fetchHoldings(inst.cik);
                return { inst, filings };
            })
        );
        for (const r of results) {
            if (r.status !== 'fulfilled') continue;
            const { inst, filings } = r.value;
            totalFilings += filings.length;
            const periods = [...new Set(filings.map(f => f.period))].sort().reverse();
            const currentPeriod = periods[0];
            const current = filings.filter(f => f.period === currentPeriod);
            for (const f of current) {
                if (!f.cusip) continue;
                const list = cusipIndex.get(f.cusip) || [];
                list.push({
                    cik: inst.cik, name: inst.name, domain: inst.domain,
                    shares: f.shares_or_principal_amount, marketValue: f.market_value,
                    period: f.period, filingDate: f.filing_date, issuerName: f.issuer_name,
                });
                cusipIndex.set(f.cusip, list);
            }
            console.log(`  ${inst.name}: ${current.length} holdings (${currentPeriod})`);
        }
        if (i + 5 < INSTITUTIONS.length) await new Promise(r => setTimeout(r, 200));
    }

    console.log(`\nSaving ${cusipIndex.size} CUSIPs to Redis...`);
    const TTL = 90000;
    let saved = 0;
    const entries = [...cusipIndex.entries()];
    for (let i = 0; i < entries.length; i += 50) {
        const batch = entries.slice(i, i + 50);
        await Promise.all(batch.map(async ([cusip, holders]) => {
            holders.sort((a, b) => b.marketValue - a.marketValue);
            await redis.set(`cache:13f:cusip:${cusip}`, JSON.stringify({
                holders, updatedAt: new Date().toISOString(),
            }), { ex: TTL });
            saved++;
        }));
    }

    await redis.set('cache:13f:meta', JSON.stringify({
        institutionsFetched: INSTITUTIONS.length,
        totalFilings, cusipsCached: saved,
        updatedAt: new Date().toISOString(),
        elapsedMs: Date.now() - start,
    }), { ex: TTL });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n✅ Complete: ${INSTITUTIONS.length} institutions, ${totalFilings} filings, ${saved} CUSIPs in ${elapsed}s`);

    const nvda = cusipIndex.get('67066G104');
    if (nvda) {
        console.log(`\nNVDA holders (${nvda.length}):`);
        nvda.forEach((h, i) => {
            const val = h.marketValue >= 1e9 ? `$${(h.marketValue/1e9).toFixed(2)}B` : `$${(h.marketValue/1e6).toFixed(1)}M`;
            console.log(`  ${i+1}. ${h.name}: ${h.shares?.toLocaleString()} shares, ${val}`);
        });
    } else {
        console.log('\n⚠ NVDA not found in cached data');
    }
}

main().catch(console.error);
