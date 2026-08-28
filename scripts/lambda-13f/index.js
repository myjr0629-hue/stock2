const __intrinio = require('./intrinio-adapter');
// ============================================================================
// 13-F Cache Builder — FULL-UNIVERSE quarterly ingest
//
// WHY: 13-F is a quarterly filing (due ~45 days after quarter-end). The old
// "reverse lookup over 15 hardcoded mega-funds + 3-page cap" produced thin,
// wrong data (e.g. NVDA showed 4 holders) because:
//   - mega-funds (Vanguard/Fidelity) file a 13F-NT *notice* for the parent CIK
//     while real holdings sit under subsidiary CIKs, so the per-CIK current
//     period was empty / truncated.
//   - only 15 institutions were ever scanned (hard ceiling).
//
// HOW (this version): the Polygon/Massive 13-F endpoint returns one row PER
// HOLDING (cusip, shares, market_value, issuer_name…). We walk the ENTIRE
// current-quarter filing feed once, keep 13F-HR common-stock rows, de-dup
// amendments, and reverse-index every holding by CUSIP. Result: every stock
// gets its complete institutional holder list with accurate aggregates.
//
// Runs slow (~10 min, ~1600 pages) but only needs to run weekly/quarterly —
// matching how often 13-F data actually changes. NOT for Vercel's 60s cron;
// run on Lambda/EC2 (no time cap) or locally.
//
// Env: MASSIVE_API_KEY, UPSTASH_REDIS_REST_URL/TOKEN (or KV_REST_API_*)
// Flags: DRY=1 (compute + print, no Redis writes) · MAXPAGES=N (cap for tests)
// ============================================================================

// Zero-dependency: writes go through the Upstash REST pipeline via fetch, so this
// file runs identically as a local CLI script and as the signum-13f Lambda (no
// node_modules to bundle).
const API_KEY = process.env.MASSIVE_API_KEY || '';
const BASE = process.env.MASSIVE_BASE_URL || 'https://api.polygon.io';
const DRY = process.env.DRY === '1';
const MAXPAGES = process.env.MAXPAGES ? parseInt(process.env.MAXPAGES, 10) : Infinity;
const TTL = 1209600; // 14 days — outlives the weekly rebuild cadence
const STORE_TOP = 60;  // holders persisted per CUSIP (display shows top 20)

const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '').trim();

async function redisPipeline(commands) {
    const res = await fetch(`${REDIS_URL}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(commands),
    });
    if (!res.ok) throw new Error(`Upstash ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
}

// Major filer CIK → name/domain. Used to label the common big holders without a
// per-row name lookup (the feed only carries filer_cik). Unknown CIKs are stored
// with name:null and resolved at read time by the API route (SEC EDGAR, cached).
const KNOWN = {
    '0000102909': { name: 'Vanguard Group', domain: 'vanguard.com' },
    '0001364742': { name: 'BlackRock Inc.', domain: 'blackrock.com' },
    '0001067983': { name: 'Berkshire Hathaway', domain: 'berkshirehathaway.com' },
    '0001037389': { name: 'State Street Corp', domain: 'statestreet.com' },
    '0001065696': { name: 'JPMorgan Chase', domain: 'jpmorgan.com' },
    '0000070858': { name: 'Bank of America', domain: 'bankofamerica.com' },
    '0001166559': { name: 'Fidelity (FMR)', domain: 'fidelity.com' },
    '0001141046': { name: 'Citadel Advisors', domain: 'citadel.com' },
    '0001350694': { name: 'Renaissance Technologies', domain: 'rentec.com' },
    '0001423053': { name: 'Goldman Sachs Asset Mgmt', domain: 'goldmansachs.com' },
    '0000019617': { name: 'Morgan Stanley', domain: 'morganstanley.com' },
    '0001145549': { name: 'AQR Capital Mgmt', domain: 'aqr.com' },
    '0001167557': { name: 'Two Sigma Investments', domain: 'twosigma.com' },
    '0001037529': { name: 'Wellington Management', domain: 'wellington.com' },
    '0001061768': { name: 'Bridgewater Associates', domain: 'bridgewater.com' },
    '0001159159': { name: 'Invesco Ltd', domain: 'invesco.com' },
    '0000093751': { name: 'Charles Schwab', domain: 'schwab.com' },
    '0001633907': { name: 'Capital Group', domain: 'capitalgroup.com' },
    '0000036405': { name: 'T. Rowe Price', domain: 'troweprice.com' },
    '0001424381': { name: 'D.E. Shaw & Co', domain: 'deshaw.com' },
    '0001582202': { name: 'Millennium Mgmt', domain: 'mlp.com' },
    '0000884394': { name: 'Point72 Asset Mgmt', domain: 'point72.com' },
    '0001535392': { name: 'Balyasny Asset Mgmt', domain: 'bfrnd.com' },
    '0001397545': { name: 'Cathie Wood / ARK Invest', domain: 'ark-invest.com' },
    '0001336528': { name: 'Susquehanna Intl Group', domain: 'sig.com' },
    '0001345471': { name: 'Jane Street Group', domain: 'janestreet.com' },
    '0001649339': { name: 'Geode Capital Mgmt', domain: 'geodecapital.com' },
    '0001160106': { name: 'Northern Trust Corp', domain: 'northerntrust.com' },
};

// Most recent quarter-end whose 13-F deadline (~46 days later) has passed.
function currentPeriod(now) {
    const d = new Date(now.getTime() - 46 * 86400000); // back up past the filing deadline
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth(); // 0-11
    const qEnds = [[2, 31], [5, 30], [8, 30], [11, 31]]; // [monthIdx, day] Mar/Jun/Sep/Dec
    let pick = null;
    for (const [qm, day] of qEnds) if (qm <= m) pick = [qm, day];
    if (!pick) return `${y - 1}-12-31`;
    return `${y}-${String(pick[0] + 1).padStart(2, '0')}-${pick[1]}`;
}

async function fetchJson(url, tries = 4) {

  // ── [2026-08-29] Intrinio 라우팅 ──────────────────────────────
  // Massive 계정이 약관 위반으로 차단(시세 403). 대응 가능한 요청은 Intrinio 로.
  // 뉴스(/v2/reference/news)는 어댑터가 undefined 를 돌려주므로 아래 기존 경로로 간다.
  // 정본: .agent/INTRINIO_MIGRATION.md
  try {
    const __routed = await __intrinio.routeMassiveUrl(url);
    if (__routed !== undefined) return __routed;
  } catch (__e) {
    console.warn('[Intrinio] route fail:', __e && __e.message);
  }
    for (let i = 0; i < tries; i++) {
        try {
            const res = await fetch(url);
            if (res.status === 429) { await new Promise(r => setTimeout(r, 500 * (i + 1))); continue; }
            if (!res.ok) return null;
            return await res.json();
        } catch { await new Promise(r => setTimeout(r, 300 * (i + 1))); }
    }
    return null;
}

async function main() {
    const start = Date.now();
    const period = currentPeriod(new Date());
    console.log(`=== 13-F Full Ingest === period=${period} ${DRY ? '(DRY)' : ''} maxPages=${MAXPAGES}`);

    // (filer_cik|cusip) → holding, keeping the latest filing (amendment supersedes).
    // The feed only sorts by filing_date and pages are cursor-sequential, so a single
    // chain would be ~35 min. Instead we SHARD by filing_date range (each shard its own
    // cursor chain) and run shards concurrently — independent ranges, safe single-thread
    // merge. Keeps the whole quarter under Lambda's 15-min cap.
    const dedup = new Map();
    let pages = 0, rows = 0;
    const stats = { pages: 0 };

    const accept = (f) => {
        if (f.period !== period) return;                         // current quarter only
        if (f.form_type !== '13F-HR' && f.form_type !== '13F-HR/A') return;
        if (f.put_call) return;                                  // common stock only (skip options)
        if (f.shares_or_principal_type && f.shares_or_principal_type !== 'SH') return;
        if (!f.cusip || !(f.market_value > 0)) return;
        const key = `${f.filer_cik}|${f.cusip}`;
        const prev = dedup.get(key);
        if (!prev || (f.filing_date || '') >= (prev.filing_date || '')) {
            // Store only the fields we need — keeps 2.2M-entry map within Lambda memory.
            dedup.set(key, {
                cik: f.filer_cik, cusip: f.cusip,
                shares: f.shares_or_principal_amount, marketValue: f.market_value,
                filingDate: f.filing_date, issuerName: f.issuer_name,
            });
        }
    };

    async function scanShard(gte, lt) {
        let url = `${BASE}/stocks/filings/vX/13-F?filing_date.gte=${gte}&filing_date.lt=${lt}&limit=1000&sort=filing_date.asc&apiKey=${API_KEY}`;
        while (url && stats.pages < MAXPAGES) {
            const data = await fetchJson(url);
            if (!data) break;
            const r = data.results || [];
            rows += r.length; pages++; stats.pages++;
            for (const f of r) accept(f);
            url = data.next_url ? `${data.next_url}&apiKey=${API_KEY}` : null;
            if (pages % 100 === 0) console.log(`  …${pages} pages, ${rows} rows, ${dedup.size} unique`);
            if (url) await new Promise(r => setTimeout(r, 40));
        }
    }

    // Build 3-day filing_date shards from quarter-end to "today+1", run with concurrency.
    const shards = [];
    const end = new Date(Date.now() + 86400000);
    for (let t = new Date(period + 'T00:00:00Z').getTime(); t < end.getTime(); t += 3 * 86400000) {
        const a = new Date(t).toISOString().slice(0, 10);
        const b = new Date(Math.min(t + 3 * 86400000, end.getTime())).toISOString().slice(0, 10);
        shards.push([a, b]);
    }
    const CONC = 8;
    for (let i = 0; i < shards.length; i += CONC) {
        await Promise.all(shards.slice(i, i + CONC).map(([a, b]) => scanShard(a, b)));
    }
    console.log(`Scanned ${pages} pages / ${rows} rows across ${shards.length} shards → ${dedup.size} unique (filer,cusip) holdings (${((Date.now() - start) / 1000).toFixed(0)}s)`);

    // Reverse-index by CUSIP.
    const byCusip = new Map();
    for (const f of dedup.values()) {
        const list = byCusip.get(f.cusip) || [];
        const k = KNOWN[f.cik];
        list.push({
            cik: f.cik,
            name: k ? k.name : null,
            domain: k ? k.domain : null,
            shares: f.shares,
            marketValue: f.marketValue,
            period,
            filingDate: f.filingDate,
            issuerName: f.issuerName,
        });
        byCusip.set(f.cusip, list);
    }
    console.log(`Indexed ${byCusip.size} CUSIPs`);

    // Print NVDA for validation regardless of DRY.
    const nvda = byCusip.get('67066G104');
    if (nvda) {
        const sorted = [...nvda].sort((a, b) => b.marketValue - a.marketValue);
        const totShares = sorted.reduce((s, h) => s + h.shares, 0);
        const totVal = sorted.reduce((s, h) => s + h.marketValue, 0);
        console.log(`\nNVDA: ${sorted.length} holders, ${(totShares / 1e6).toFixed(0)}M shares, $${(totVal / 1e9).toFixed(1)}B`);
        sorted.slice(0, 10).forEach((h, i) =>
            console.log(`  ${i + 1}. ${h.name || h.cik}: ${(h.shares / 1e6).toFixed(1)}M sh, $${(h.marketValue / 1e9).toFixed(2)}B`));
    } else {
        console.log('\n⚠ NVDA not found');
    }

    if (DRY) { console.log('\n(DRY — no Redis writes)'); return { period, cusips: byCusip.size, holdings: dedup.size, dry: true }; }

    // Persist via Upstash REST pipeline, streamed in batches (top-N holders +
    // accurate aggregates per CUSIP). Streaming avoids holding all 24k commands at once.
    const now = new Date().toISOString();
    let batch = [], saved = 0;
    const flush = async () => { if (batch.length) { await redisPipeline(batch); saved += batch.length; batch = []; } };
    for (const [cusip, holders] of byCusip.entries()) {
        holders.sort((a, b) => b.marketValue - a.marketValue);
        const totalShares = holders.reduce((s, h) => s + h.shares, 0);
        const totalValue = holders.reduce((s, h) => s + h.marketValue, 0);
        batch.push(['SET', `cache:13f:cusip:${cusip}`, JSON.stringify({
            holders: holders.slice(0, STORE_TOP),
            totalHolders: holders.length,
            totalShares, totalValue, period, updatedAt: now,
        }), 'EX', String(TTL)]);
        if (batch.length >= 200) await flush();
    }
    batch.push(['SET', 'cache:13f:meta', JSON.stringify({
        period, cusipsCached: byCusip.size, uniqueHoldings: dedup.size,
        pagesScanned: pages, updatedAt: now, elapsedMs: Date.now() - start,
    }), 'EX', String(TTL)]);
    await flush();

    console.log(`\n✅ Saved ${byCusip.size} CUSIPs in ${((Date.now() - start) / 1000).toFixed(0)}s`);
    return { period, cusips: byCusip.size, holdings: dedup.size, elapsedMs: Date.now() - start };
}

// Shared entry point — runs as the signum-13f Lambda or as a local CLI script.
exports.handler = async () => {
    const r = await main();
    return { statusCode: 200, body: JSON.stringify(r) };
};

if (require.main === module) {
    main().catch(e => { console.error(e); process.exit(1); });
}
