// V4.0 Final Stock List Generator
// Shows the complete 312 stock universe

const POLYGON_API_KEY = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const BASE_URL = 'https://api.polygon.io';

const MAGNIFICENT_7 = ['AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'TSLA'];
const BIO_LEADERS_TOP5 = ['AMGN', 'GILD', 'REGN', 'VRTX', 'BIIB'];
const DATACENTER_TOP5 = ['EQIX', 'DLR', 'AMT', 'CCI', 'SBAC'];

const KNOWN_ETFS = new Set([
    'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'TLT', 'GLD', 'SLV',
    'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB',
    'TQQQ', 'SQQQ', 'SOXL', 'SOXS', 'UVXY', 'VXX', 'ARKK', 'ARKG',
    'IBIT', 'ETHA', 'BITO', 'GBTC', 'ETHE', 'TZA', 'TNA', 'DUST',
    'NUGT', 'LABU', 'LABD', 'KOLD', 'BOIL', 'USO', 'UNG', 'UCO', 'SCO',
    'TSLL', 'TSLS', 'NVDL', 'NVDS', // Leveraged single-stock
]);

async function generateFinalList() {
    console.log('\n========================================');
    console.log('V4.0 FINAL STOCK LIST');
    console.log('========================================\n');

    const fixedLeaders = [...MAGNIFICENT_7, ...BIO_LEADERS_TOP5, ...DATACENTER_TOP5];

    console.log('[Fetching Polygon Snapshot...]');
    const snapshotUrl = `${BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;

    try {
        const res = await fetch(snapshotUrl);
        const data = await res.json();
        const allTickers = data?.tickers || [];

        // Quality Gate
        const qualityStocks = allTickers
            .filter(t => {
                const price = t.day?.c || t.prevDay?.c || 0;
                const volume = t.day?.v || 0;
                const ticker = t.ticker || '';
                if (price < 5 || price > 2000) return false;
                if (volume < 500000) return false;
                if (ticker.includes('.')) return false;
                if (ticker.length > 5) return false;
                if (KNOWN_ETFS.has(ticker)) return false;
                return true;
            })
            .sort((a, b) => (b.day?.v || 0) - (a.day?.v || 0));

        const topVolumeStocks = qualityStocks.slice(0, 300).map(t => ({
            ticker: t.ticker,
            price: (t.day?.c || 0).toFixed(2),
            volume: ((t.day?.v || 0) / 1000000).toFixed(1)
        }));

        // Merge with Core Elite
        const allSymbols = new Set([...fixedLeaders, ...topVolumeStocks.map(s => s.ticker)]);
        const finalList = [...allSymbols].filter(s => !KNOWN_ETFS.has(s));

        console.log(`Total: ${finalList.length} stocks\n`);

        // Group by category
        console.log('=== CORE ELITE (Always Included) ===');
        console.log('M7:', MAGNIFICENT_7.join(', '));
        console.log('Bio:', BIO_LEADERS_TOP5.join(', '));
        console.log('DC:', DATACENTER_TOP5.join(', '));

        console.log('\n=== TOP 50 BY VOLUME ===');
        topVolumeStocks.slice(0, 50).forEach((s, i) => {
            console.log(`${(i + 1).toString().padStart(2)}. ${s.ticker.padEnd(5)} $${s.price.padStart(7)} Vol:${s.volume}M`);
        });

        console.log('\n=== FULL LIST (ALL 312) ===');
        // Print in columns
        const cols = 10;
        for (let i = 0; i < finalList.length; i += cols) {
            const row = finalList.slice(i, i + cols).map(s => s.padEnd(6)).join(' ');
            console.log(row);
        }

        console.log('\n========================================');
        console.log('SUMMARY');
        console.log('========================================');
        console.log('Core Elite: ' + fixedLeaders.length);
        console.log('Top Volume: ' + topVolumeStocks.length);
        console.log('Final Unique: ' + finalList.length);

    } catch (e) {
        console.log('Error: ' + e.message);
    }
}

generateFinalList().catch(console.error);
