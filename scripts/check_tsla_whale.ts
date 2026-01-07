
import { getOptionSnapshot } from '../src/services/massiveClient';

async function main() {
    const ticker = 'TSLA';
    console.log(`Checking ${ticker} data...`);

    // 2. Get Snapshot
    try {
        const snapshot = await getOptionSnapshot(ticker);
        console.log(`Snapshot fetched: ${snapshot.length} records`);

        // 3. Find specific strikes mentioned by user ($10 and $200)
        const deepITM = snapshot.filter(s =>
            (s.details.strike_price === 10 || s.details.strike_price === 200 || s.details.strike_price <= 400) &&
            s.details.contract_type === 'call' &&
            s.details.expiration_date?.includes('2025-01')
        );

        console.log(`Found ${deepITM.length} Deep ITM contracts matching criteria:`);
        // Sort by Time descending
        deepITM.sort((a, b) => {
            const tA = a.last_trade?.last_trade_sip || a.last_trade?.t || 0;
            const tB = b.last_trade?.last_trade_sip || b.last_trade?.t || 0;
            return tB - tA;
        });

        deepITM.slice(0, 15).forEach(c => {
            const trade = c.last_trade?.last_trade_sip || c.last_trade;
            if (!trade) return;

            const price = trade.price;
            const size = trade.size;
            const premium = price * size * 100;
            const timeNs = trade.sip_timestamp || trade.t || 0;
            const time = new Date(timeNs / 1000000).toLocaleTimeString();

            if (premium > 50000) {
                console.log(`[WHALE] Strike: $${c.details.strike_price} | Exp: ${c.details.expiration_date} | Type: ${c.details.contract_type}`);
                console.log(`        Trade: Price $${price} x Size ${size} = Premium $${Math.round(premium / 1000)}k`);
                console.log(`        Time: ${time}`);
            }
        });

    } catch (e) {
        console.error("Error:", e);
    }
}

main();
