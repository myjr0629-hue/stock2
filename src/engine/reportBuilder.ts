
import { Tier01Data, MacroData, GemsTicker } from "../services/stockTypes";
import { ValidationResult } from "./validator";

export interface GEMSReport {
    meta: {
        timestamp: string;
        engineVersion: string;
        validation: ValidationResult;
    };
    macro: MacroData & {
        regime: string;
    };
    alphaGrid: {
        top3: GemsTicker[];
        fullUniverse: GemsTicker[];
    };
    strategy: {
        action: string;
        reason: string;
        orders: { ticker: string; action: string; allocation: string }[];
    };
}

export function buildDeterministicReport(data: Tier01Data, macro: MacroData, validation: ValidationResult): GEMSReport {
    // Generate orders based on Top 3
    const top3 = data.tickers.slice(0, 3);
    const orders = top3.map(t => ({
        ticker: t.symbol,
        action: validation.mode === 'FAIL' ? 'HOLD/NONE' : 'BUY/ACCUMULATE',
        allocation: validation.mode === 'PASS' ? '33%' : validation.mode === 'REDUCED' ? '20%' : '0%'
    }));

    return {
        meta: {
            timestamp: new Date().toISOString(),
            engineVersion: "V8.1-EngineOnly",
            validation
        },
        macro: {
            ...macro,
            regime: macro.regime || "Neutral"
        },
        alphaGrid: {
            top3: top3,
            fullUniverse: data.tickers
        },
        strategy: {
            action: data.swapSignal?.action || "MAINTAIN",
            reason: data.swapSignal?.reason || "Deterministic scan complete.",
            orders: orders
        }
    };
}
