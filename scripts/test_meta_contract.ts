
import { validateGemsMeta } from '../src/engine/validator';
import { GemsMeta } from '../src/services/stockTypes';

const validMeta: GemsMeta = {
    timestamp: new Date().toISOString(),
    engineVersion: "V8.1-Test",
    validation: {
        isValid: true,
        errors: [],
        mode: 'PASS'
    },
    pendingCount: 0,
    pendingTickers: [],
    backfillRound: 1,
    lastBackfillAt: new Date().toISOString(),
    mode: "test",
    universeSource: "market",
    universeCount: 30,
    universeSelectedK: 10,
    itemsCount: 5,
    topPicks: ["AAPL", "NVDA", "TSLA"],
    slot: "eod",
    runId: "test_run",
    etDate: "2025-12-25",
    etTimestamp: "2025-12-25T00:00:00",
    source: "Massive",
    integrity: {
        oiPolicy: "STRICT",
        pendingAllowed: false
    },
    uiDefaults: {
        tableTopN: 20
    }
};

const invalidMeta = {
    ...validMeta,
    universeCount: undefined,
    topPicks: []
};

console.log("Valid Meta Check:", validateGemsMeta(validMeta));
console.log("Invalid Meta Check:", validateGemsMeta(invalidMeta));
