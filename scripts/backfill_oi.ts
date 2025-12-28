
import { getOptionsData, analyzeGemsTicker } from "../src/services/stockApi";
import fs from "fs";
import path from "path";

const snapshotPath = path.join(process.cwd(), "gems_snapshot.json");

async function backfillOI() {
    console.log("=== GEMS ENGINE: OI BACKFILL JOB STARTING ===");

    if (!fs.existsSync(snapshotPath)) {
        console.error("[Backfill] No snapshot found to backfill.");
        return;
    }

    const report = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
    const tickers = report.alphaGrid.fullUniverse;
    const top3 = report.alphaGrid.top3;

    let updatedCount = 0;

    for (const t of tickers) {
        if (t.v71?.options_status === 'PENDING') {
            console.log(`[Backfill] Refetching Options for ${t.symbol}...`);
            const opts = await getOptionsData(t.symbol, t.price);

            if (opts.options_status === 'OK') {
                console.log(`[Backfill] SUCCESS: ${t.symbol} Options are now OK.`);
                // Update the ticker data in the report
                const updatedTicker = analyzeGemsTicker({ ticker: t.symbol, symbol: t.symbol, price: t.price, todaysChange: t.change, todaysChangePerc: t.changePercent }, report.macro.regime, opts);

                // Update internal objects
                t.v71 = updatedTicker.v71;

                // Sync with Top3 if needed
                const top3Idx = top3.findIndex((v: any) => v.symbol === t.symbol);
                if (top3Idx !== -1) top3[top3Idx].v71 = updatedTicker.v71;

                updatedCount++;
            } else {
                console.log(`[Backfill] STILL PENDING: ${t.symbol}`);
            }
        }
    }

    if (updatedCount > 0) {
        report.meta.updated_at_et = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
        fs.writeFileSync(snapshotPath, JSON.stringify(report, null, 2));
        console.log(`[Backfill] Completed. Updated ${updatedCount} tickers.`);
    } else {
        console.log("[Backfill] No updates needed.");
    }
}

backfillOI().catch(console.error);
