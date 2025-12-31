
import { fetchMassive } from '../src/services/massiveClient';

async function main() {
    console.log("Fetching Dec 29 Data for Calibration...");

    // Check Dec 29 (which might be prevDay or specific date)
    // The user said: Dec 29 NDX=25739.75, VIX=14.20
    // I need QQQ and VIXY for Dec 29.
    // 2025-12-29 was likely a Monday.

    try {
        const qqq = await fetchMassive('/v1/open-close/QQQ/2025-12-29', {}, true);
        const vixy = await fetchMassive('/v1/open-close/VIXY/2025-12-29', {}, true);

        console.log("QQQ Dec 29 Close:", qqq.close);
        console.log("VIXY Dec 29 Close:", vixy.close);

        const ndxRef = 25739.75;
        const vixRef = 14.20;

        if (qqq.close) console.log(`NDX Ratio (25739 / ${qqq.close}):`, ndxRef / qqq.close);
        if (vixy.close) console.log(`VIX Ratio (14.20 / ${vixy.close}):`, vixRef / vixy.close);

    } catch (e) {
        console.error("Fetch failed:", e);
    }
}
main();
