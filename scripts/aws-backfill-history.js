/**
 * SIGNUM HQ — Full Historical Backfill (Polygon Premium - UNLIMITED)
 * 
 * NO rate limiting — Polygon 최고 티어
 * Options: Paginated to get ALL contracts (not just first 250)
 * 
 * Usage: node scripts/aws-backfill-history.js
 */

require('dotenv').config({ path: '.env.local' });

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const https = require('https');

const REGION = process.env.AWS_REGION || 'us-east-1';
const POLYGON_KEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';

const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({
        region: REGION,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
    }),
    { marshallOptions: { removeUndefinedValues: true } }
);

function log(emoji, msg) { console.log(`${emoji}  ${msg}`); }

function httpsGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'SIGNUM-HQ/1.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
            });
        }).on('error', reject);
    });
}

// ====== Universe — ALL tickers we track ======
const M7 = ['AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'TSLA'];
const BIO = ['AMGN', 'GILD', 'REGN', 'VRTX', 'BIIB'];
const DC = ['EQIX', 'DLR', 'AMT', 'CCI', 'SBAC'];
const PHYS_AI = ['ISRG', 'TER', 'ROK', 'MBLY', 'QCOM', 'PONY'];

const SECTOR_TICKERS = {
    m7: M7,
    silicon_core: ['NVDA', 'AMD', 'AVGO', 'QCOM', 'MU', 'LRCX', 'AMAT', 'KLAC', 'MRVL', 'ASML'],
    cyber_shield: ['CRWD', 'PANW', 'ZS', 'FTNT', 'OKTA'],
    bio_pulse: BIO,
    physical_ai: PHYS_AI,
    power_matrix: ['VST', 'CEG', 'VRT', 'ETN', 'PWR'],
    orbit_defense: ['RTX', 'LMT', 'GD', 'NOC', 'BA'],
    quantum_edge: ['IBM', 'IONQ', 'RGTI', 'QUBT'],
    fintech_pulse: ['V', 'MA', 'SQ', 'PYPL', 'COIN'],
    cloud_fortress: ['MSFT', 'AMZN', 'GOOGL', 'CRM', 'NOW', 'SNOW'],
};

const ALL_TICKERS = [...new Set([
    ...M7, ...BIO, ...DC, ...PHYS_AI,
    ...Object.values(SECTOR_TICKERS).flat(),
    'JPM', 'BAC', 'GS', 'WFC', 'C',
    'JNJ', 'UNH', 'LLY', 'PFE', 'ABBV', 'MRK', 'TMO',
    'XOM', 'CVX', 'COP', 'SLB',
    'HD', 'COST', 'WMT', 'TGT', 'LOW',
    'PG', 'KO', 'PEP', 'MCD', 'SBUX', 'NKE',
    'DIS', 'NFLX', 'CMCSA',
    'CAT', 'GE', 'HON', 'UPS', 'DE',
    'NEE', 'DUK', 'SO', 'CEG',
    'PLD', 'O', 'VICI',
    'TXN', 'ON', 'INTC',
    'UBER', 'ABNB', 'DASH', 'SHOP', 'SE',
    'AI', 'PLTR', 'SMCI', 'ARM', 'DELL',
    'FCX', 'NEM', 'LIN', 'SHW',
    'BLK', 'SCHW', 'AXP',
])];

// Options-level analysis tickers (wider set)
const OPTIONS_TICKERS = [...new Set([
    ...M7, ...['AMD', 'PLTR', 'SMCI', 'ARM', 'COIN', 'CRWD', 'AI', 'MRVL', 'AVGO', 'MU'],
    ...['UBER', 'ABNB', 'SHOP', 'SQ', 'PYPL'],
    ...['JPM', 'BAC', 'GS'],
    ...['XOM', 'CVX'],
    ...['LLY', 'UNH'],
])];

// ====== Batch DynamoDB helper ======
async function batchWrite(tableName, items) {
    for (let i = 0; i < items.length; i += 25) {
        const batch = items.slice(i, i + 25);
        try {
            await client.send(new BatchWriteCommand({
                RequestItems: {
                    [tableName]: batch.map(item => ({ PutRequest: { Item: item } })),
                }
            }));
        } catch (e) {
            // Fallback to individual puts
            for (const item of batch) {
                await client.send(new PutCommand({ TableName: tableName, Item: item })).catch(() => { });
            }
        }
    }
}

// ====== 1. Full 30-Day Price History — NO rate limit ======
async function backfillPriceHistory() {
    log('📊', `Step 1: Backfilling 30-day price history for ${ALL_TICKERS.length} tickers (FULL SPEED)...`);

    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    let successCount = 0;
    let totalItems = 0;

    // Run 5 at a time for speed (no rate limit!)
    for (let i = 0; i < ALL_TICKERS.length; i += 5) {
        const batch = ALL_TICKERS.slice(i, i + 5);

        await Promise.all(batch.map(async (ticker) => {
            try {
                const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_KEY}`;
                const data = await httpsGet(url);

                if (data?.results && data.results.length > 0) {
                    const items = data.results.map(bar => ({
                        ticker,
                        date: new Date(bar.t).toISOString().slice(0, 10),
                        alphaScore: 0,
                        qualityTier: 'PENDING',
                        changePct: bar.c && bar.o ? Math.round(((bar.c - bar.o) / bar.o * 100) * 100) / 100 : 0,
                        open: bar.o,
                        high: bar.h,
                        low: bar.l,
                        close: bar.c,
                        volume: bar.v,
                        vwap: bar.vw || 0,
                        gex: 0,
                        pcr: 0,
                    }));

                    await batchWrite('signum-alpha-history', items);
                    totalItems += items.length;
                    successCount++;
                }
            } catch (e) {
                // Skip failed
            }
        }));

        if ((i + 5) % 20 === 0 || i + 5 >= ALL_TICKERS.length) {
            log('📈', `  ${Math.min(i + 5, ALL_TICKERS.length)}/${ALL_TICKERS.length} — ${successCount} ok, ${totalItems} items`);
        }
    }

    log('✅', `Price history: ${successCount}/${ALL_TICKERS.length} tickers, ${totalItems} items saved`);
    return { successCount, totalItems };
}

// ====== 2. Full Options Chain with PAGINATION ======
async function getAllOptionsForTicker(ticker) {
    let allResults = [];
    let url = `https://api.polygon.io/v3/snapshot/options/${ticker}?limit=250&apiKey=${POLYGON_KEY}`;

    while (url) {
        const data = await httpsGet(url);
        if (data?.results) {
            allResults = allResults.concat(data.results);
        }
        // Pagination: follow next_url if it exists
        url = data?.next_url ? `${data.next_url}&apiKey=${POLYGON_KEY}` : null;
    }

    return allResults;
}

async function backfillOptions() {
    log('🔴', `Step 2: Full options chain for ${OPTIONS_TICKERS.length} tickers (PAGINATED, ALL contracts)...`);

    let saved = 0;

    for (const ticker of OPTIONS_TICKERS) {
        try {
            // Get current price
            const snapUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${POLYGON_KEY}`;
            const snap = await httpsGet(snapUrl);
            const price = snap?.ticker?.lastTrade?.p || snap?.ticker?.day?.c || 0;

            if (!price || price <= 0) {
                log('⚠️', `  ${ticker}: No price, skipping`);
                continue;
            }

            // Get ALL options (paginated)
            const allOptions = await getAllOptionsForTicker(ticker);

            if (allOptions.length === 0) {
                log('⚠️', `  ${ticker}: No options data`);
                continue;
            }

            // Calculate GEX from full chain
            let gex = 0, callWall = null, putFloor = null;
            let maxCallOI = 0, maxPutOI = 0;
            let totalCallOI = 0, totalPutOI = 0;
            const ivData = [];
            const strikeMap = {};

            for (const opt of allOptions) {
                const strike = opt.details?.strike_price;
                if (!strike) continue;

                const gamma = opt.greeks?.gamma || 0;
                const oi = opt.open_interest || 0;
                const iv = opt.implied_volatility || 0;
                const type = opt.details?.contract_type;
                const expiry = opt.details?.expiration_date;

                if (!strikeMap[strike]) strikeMap[strike] = { callGex: 0, putGex: 0, callOI: 0, putOI: 0 };

                if (type === 'call') {
                    const thisGex = gamma * oi * 100 * price;
                    gex += thisGex;
                    strikeMap[strike].callGex += thisGex;
                    strikeMap[strike].callOI += oi;
                    totalCallOI += oi;
                    if (oi > maxCallOI) { maxCallOI = oi; callWall = strike; }
                } else {
                    const thisGex = gamma * oi * 100 * price;
                    gex -= thisGex;
                    strikeMap[strike].putGex -= thisGex;
                    strikeMap[strike].putOI += oi;
                    totalPutOI += oi;
                    if (oi > maxPutOI) { maxPutOI = oi; putFloor = strike; }
                }

                if (iv > 0 && expiry) {
                    ivData.push({ strike, expiry, iv, type, oi, gamma, delta: opt.greeks?.delta || 0 });
                }
            }

            const gammaRegime = gex > 0 ? 'POSITIVE' : gex < 0 ? 'NEGATIVE' : 'NEUTRAL';
            const flipLevel = callWall && putFloor ? (callWall + putFloor) / 2 : null;
            const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;

            // Save GEX snapshot to history
            await client.send(new PutCommand({
                TableName: 'signum-gex-history',
                Item: {
                    ticker,
                    timestamp: Date.now(),
                    gex: Math.round(gex),
                    flipLevel,
                    callWall,
                    putFloor,
                    maxPain: null,
                    price,
                    gammaRegime,
                    totalContracts: allOptions.length,
                    totalCallOI,
                    totalPutOI,
                    pcr: Math.round(pcr * 100) / 100,
                }
            }));

            // Save IV Surface — grouped by expiry
            const byExpiry = {};
            for (const d of ivData) {
                if (!byExpiry[d.expiry]) byExpiry[d.expiry] = [];
                byExpiry[d.expiry].push({ s: d.strike, iv: Math.round(d.iv * 10000) / 100, t: d.type[0], oi: d.oi, d: Math.round((d.delta || 0) * 100) / 100 });
            }

            const ivItems = Object.entries(byExpiry).map(([expiry, strikes]) => ({
                ticker,
                sk: `${expiry}#${Date.now()}`,
                expiry,
                timestamp: Date.now(),
                strikes,
                price,
                strikeCount: strikes.length,
            }));

            if (ivItems.length > 0) {
                await batchWrite('signum-iv-surface', ivItems);
            }

            // Save flow history item
            await client.send(new PutCommand({
                TableName: 'signum-flow-history',
                Item: {
                    ticker,
                    timestamp: Date.now(),
                    compositeScore: 0,
                    opi: totalCallOI - totalPutOI,
                    whaleScore: 0,
                    dex: 0,
                    ivSkew: 0,
                    squeezeProbability: 0,
                    smartMoneyScore: 0,
                    totalCallOI,
                    totalPutOI,
                    pcr: Math.round(pcr * 100) / 100,
                }
            })).catch(() => { });

            saved++;
            log('✅', `  ${ticker}: ${allOptions.length} contracts | GEX=${Math.round(gex).toLocaleString()} | CallWall=${callWall} | PutFloor=${putFloor} | PCR=${pcr.toFixed(2)} | ${ivItems.length} expiries`);

        } catch (e) {
            log('❌', `  ${ticker}: ${e.message}`);
        }
    }

    log('✅', `Options: ${saved}/${OPTIONS_TICKERS.length} tickers with full GEX + IV Surface + Flow`);
    return saved;
}

// ====== 3. Sector Daily from Historical ======
async function calculateSectorDaily() {
    log('📊', 'Step 3: Calculating sector daily history...');

    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    let sectorDays = 0;

    for (const [sectorId, tickers] of Object.entries(SECTOR_TICKERS)) {
        const sectorData = {};

        // Fetch all tickers in parallel (no rate limit!)
        await Promise.all(tickers.map(async (ticker) => {
            try {
                const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_KEY}`;
                const data = await httpsGet(url);

                if (data?.results) {
                    for (const bar of data.results) {
                        const date = new Date(bar.t).toISOString().slice(0, 10);
                        if (!sectorData[date]) sectorData[date] = [];
                        sectorData[date].push({
                            ticker,
                            changePct: bar.o ? Math.round(((bar.c - bar.o) / bar.o * 100) * 100) / 100 : 0,
                            volume: bar.v,
                            close: bar.c,
                        });
                    }
                }
            } catch (e) { }
        }));

        // Build sector daily items
        const items = Object.entries(sectorData).map(([date, dayTickers]) => {
            const avgChange = dayTickers.reduce((s, t) => s + t.changePct, 0) / dayTickers.length;
            const sorted = [...dayTickers].sort((a, b) => b.changePct - a.changePct);
            return {
                sectorId,
                date,
                avgChange: Math.round(avgChange * 100) / 100,
                gexSum: 0,
                avgPcr: 0,
                alphaScore: 0,
                ranking: 0,
                leadTicker: sorted[0]?.ticker || '',
                lagTicker: sorted[sorted.length - 1]?.ticker || '',
                tickerCount: dayTickers.length,
            };
        });

        if (items.length > 0) {
            await batchWrite('signum-sector-daily', items);
            sectorDays += items.length;
            log('✅', `  ${sectorId}: ${items.length} days (${tickers.length} tickers)`);
        }
    }

    log('✅', `Sector daily: ${sectorDays} sector-day records`);
    return sectorDays;
}

// ====== Main ======
async function main() {
    const startTime = Date.now();

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║  SIGNUM HQ — Full Historical Backfill (PREMIUM)       ║');
    console.log('║  Polygon: UNLIMITED calls | Full Options Pagination   ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log(`\nUniverse: ${ALL_TICKERS.length} price tickers + ${OPTIONS_TICKERS.length} options tickers\n`);

    const results = {};

    // Step 1: 30-day price history (parallel, full speed)
    results.price = await backfillPriceHistory();

    // Step 2: Full options chain (paginated, all contracts)
    results.options = await backfillOptions();

    // Step 3: Sector daily (parallel per sector)
    results.sectors = await calculateSectorDaily();

    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║  ✅ Full Backfill Complete!                            ║');
    console.log('╠═══════════════════════════════════════════════════════╣');
    console.log(`║  Price History:   ${results.price.successCount} tickers, ${results.price.totalItems} daily bars`);
    console.log(`║  Options/GEX/IV:  ${results.options} tickers (full chain + IV Surface)`);
    console.log(`║  Sector Daily:    ${results.sectors} sector-day records`);
    console.log(`║  Duration:        ${duration}s`);
    console.log('╚═══════════════════════════════════════════════════════╝');
}

main().catch(e => console.error('FATAL:', e));
