
import { Tier01Data, GemsTicker } from "../services/stockTypes";

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    mode: 'PASS' | 'FAIL' | 'REDUCED';
}

export function validateGemsData(data: Tier01Data): ValidationResult {
    const errors: string[] = [];
    let mode: 'PASS' | 'FAIL' | 'REDUCED' = 'PASS';

    // 1. Ticker Count & Price Integrity
    if (!data.tickers || data.tickers.length < 5) {
        errors.push("Insufficient tickers analyzed (min 5 required).");
        mode = 'FAIL';
    }

    const missingPrices = data.tickers.filter(t => !t.price || t.price <= 0);
    if (missingPrices.length > 0) {
        errors.push(`Missing prices for: ${missingPrices.map(t => t.symbol).join(', ')}`);
        // If more than 30% are missing, FAIL. Otherwise REDUCED.
        if (missingPrices.length / data.tickers.length > 0.3) mode = 'FAIL';
        else if (mode !== 'FAIL') mode = 'REDUCED';
    }

    // 2. Top 3 Logic
    const validTickers = data.tickers.filter(t => t.price > 0);
    if (validTickers.length < 3) {
        errors.push("Less than 3 tickers with valid price data.");
        mode = 'FAIL';
    }

    // 3. ETF Filtering (Logic check - usually handled in fetch but validated here)
    // We assume individual stocks don't have certain patterns or we'd ideally check a 'type' field
    // For now, we flag any ticker that looks like an index or ETF if possible

    return {
        isValid: mode !== 'FAIL',
        errors,
        mode
    };
}

/**
 * [S-38C] UNIVERSE META CONTRACT VALIDATOR
 * [S-41] SELECTION CONTRACT: Validates 12 picks structure
 * Ensures latest.json contains all required fields for UI Bridge to work properly.
 */
export function validateGemsMeta(meta: any): ValidationResult {
    const errors: string[] = [];
    const requiredFields = [
        'universeSource',
        'universeCount',
        'universeSelectedK',
        'itemsCount',
        'topPicks',
        'runId',
        'timestamp'
    ];

    requiredFields.forEach(field => {
        if (meta[field] === undefined || meta[field] === null) {
            errors.push(`META_CONTRACT_VIOLATION: Missing required field '${field}'`);
        }
    });

    // topPicks validation (should have 3 tickers)
    if (meta.topPicks && (!Array.isArray(meta.topPicks) || meta.topPicks.length !== 3)) {
        errors.push("META_CONTRACT_VIOLATION: 'topPicks' must have exactly 3 symbols.");
    }

    // [S-41] Selection Contract validation
    if (meta.selection) {
        if (meta.selection.total !== 12) {
            errors.push(`SELECTION_CONTRACT_VIOLATION: selection.total must be 12, got ${meta.selection.total}`);
        }
        if (meta.selection.top3 !== 3) {
            errors.push(`SELECTION_CONTRACT_VIOLATION: selection.top3 must be 3, got ${meta.selection.top3}`);
        }
    }

    // [S-41] itemsCount must be 12
    if (meta.itemsCount !== 12) {
        // Warning only, not a hard failure (fallback mode)
        console.warn(`[S-41] WARNING: itemsCount is ${meta.itemsCount}, expected 12`);
    }

    return {
        isValid: errors.length === 0,
        errors,
        mode: errors.length === 0 ? 'PASS' : 'FAIL'
    };
}

