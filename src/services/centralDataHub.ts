import { getStockData, getOptionsData } from './stockApi';
import { getMacroSnapshotSSOT } from './macroHubProvider';
import { fetchMassive } from './massiveClient';
import { UnifiedEvidence, UnifiedMacro, TerminalItem } from '../types';
import { enrichTerminalItems } from './terminalEnricher';
import { computeQualityTier } from './powerEngine';

// Central Data Hub (Phase 17)
// Aggregates all data sources into a single coherent state.

export interface AlphaState {
    ticker: string;
    price: any;
    options: any;
    flow: any;
    macro: UnifiedMacro;
    score: {
        total: number;
        tier: string;
        components: any;
    };
    timestamp: string;
}

export async function getAlphaState(ticker: string): Promise<AlphaState | null> {
    // 1. Fetch Terminal Item (Enriched Evidence)
    // We reuse enrichTerminalItems for now as it orchestrates the low-level fetches
    // efficiently with caching.
    const items = await enrichTerminalItems([ticker], 'regular', false); // Default safe params
    const item = items[0];

    if (!item) return null;

    // 2. Calculate Alpha Score (Power Engine)
    // Ensure score is computed fresh if missing
    let alphaScoreVal = item.alphaScore;
    let qualityTier = item.qualityTier;

    if (alphaScoreVal === undefined || alphaScoreVal === null) {
        // Just-in-time calculation if not present
        const calculated = computeQualityTier(item.evidence);
        alphaScoreVal = calculated.powerScore;
        qualityTier = calculated.tier;
    }

    return {
        ticker,
        price: item.evidence?.price,
        options: item.evidence?.options,
        flow: item.evidence?.flow,
        macro: item.evidence?.macro,
        score: {
            total: alphaScoreVal || 0,
            tier: qualityTier || 'FILLER',
            components: {} // Layer components not exposed by computeQualityTier yet
        },
        timestamp: new Date().toISOString()
    };
}
