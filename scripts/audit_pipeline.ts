
const { CentralDataHub } = require('../src/services/centralDataHub');
const { getMacroSnapshotSSOT } = require('../src/services/macroHubProvider');
const { getEventHubSnapshot } = require('../src/services/eventHubProvider');
const { getStockData } = require('../src/services/stockApi');

async function audit() {
    console.log("=== DATA PIPELINE AUDIT ===");

    // 1. RSI Check (via StockApi or CentralDataHub if exposing it)
    // CentralDataHub uses manual calc in previous architecture, need to check if we updated that too?
    // User asked to update `src/services/stockApi.ts`.
    // Let's check stockApi for NVDA
    try {
        const nvda = await getStockData('NVDA');
        console.log(`[RSI Check] NVDA: ${nvda.rsi?.toFixed(1) || '--'} (Source: Massive API/Aggs Fallback)`);
    } catch (e: any) {
        console.error("[RSI Check] Failed:", e.message);
    }

    // 2. Macro Check
    try {
        const macro = await getMacroSnapshotSSOT();
        const us10y = macro.factors.us10y;
        console.log(`[Macro Check] 10Y Yield: ${us10y.level}% (Source: ${us10y.source}) - ${us10y.status}`);
        console.log(`[Macro Check] NDX: ${macro.factors.nasdaq100.level} (Source: ${macro.factors.nasdaq100.source})`);
    } catch (e: any) {
        console.error("[Macro Check] Failed:", e.message);
    }

    // 3. Event Check
    try {
        const events = await getEventHubSnapshot();
        const nextHoliday = events.events.find((e: any) => e.category === 'HOLIDAY');
        if (nextHoliday) {
            console.log(`[Event Check] Next Holiday: ${nextHoliday.name} on ${nextHoliday.date}`);
        } else {
            console.log(`[Event Check] Next Holiday: None found in next 7-14 days`);
        }
    } catch (e: any) {
        console.error("[Event Check] Failed:", e.message);
    }
}

audit();
