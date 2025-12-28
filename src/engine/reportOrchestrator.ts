
import { applyUniversePolicyWithBackfill, validateNoETFInItems, buildLeadersTrack, getMacroSSOT } from "../services/universePolicy";
import { determineRegime, applyQualityTiers, selectTop3, computePowerMeta } from "../services/powerEngine";
import { GemsSnapshotItem, MacroData, Engine } from "../services/stockTypes";

export const BUILD_PIPELINE_VERSION = "56.4.1";

export function orchestrateGemsEngine(
    currentItems: GemsSnapshotItem[],
    macro: MacroData,
    prevReport: any,
    continuationData: {
        top3?: any[];
        alpha12?: any[];
        changelog?: any[]
    } = {}
): Engine {

    // 1. Universe Policy with Backfill (Target 12)
    const { final, policy: universePolicy, stats: universeStats } = applyUniversePolicyWithBackfill(currentItems, 12);

    // 2. Power Engine: Regime
    const { regime, reasonKR: regimeReasonKR } = determineRegime(macro);

    // 3. Prepare Anti-churn Sets from Previous Report
    const prevReportSymbols = new Set<string>();
    const prevTop3Symbols = new Set<string>();

    if (prevReport) {
        // Handle various report formats (items or alphaGrid)
        const pItems = prevReport.items || prevReport.alphaGrid || [];
        if (Array.isArray(pItems)) {
            pItems.forEach((t: any) => prevReportSymbols.add((t.ticker || t.symbol || '').toUpperCase()));
        }

        // Handle Top3
        let pTop3 = prevReport.meta?.top3 || prevReport.engine?.newTop3 || [];
        // Fallback for flat structure
        if (!pTop3.length && prevReport.top3) pTop3 = prevReport.top3;

        if (Array.isArray(pTop3)) {
            pTop3.forEach((t: any) => prevTop3Symbols.add((t.ticker || t.symbol || '').toUpperCase()));
        }
    }

    // 4. Power Engine: Amplification & Selection
    const backfilledSet = new Set(final.filter(t => t.isBackfilled).map(t => (t.ticker || t.symbol || '').toUpperCase()));

    // Apply Quality Tiers (Score adjustment + Tier assignment)
    // S-56.4: Uses prevReportSymbols for New Entrant check
    const poweredFinal = applyQualityTiers(final, prevReportSymbols, backfilledSet);

    // Select Top 3 (Promotion gate + Anti-churn from prevTop3)
    const { top3: newTop3, stats: top3Stats } = selectTop3(poweredFinal, Array.from(prevTop3Symbols), regime);

    // 5. Build Metadata & Validation
    const leadersTrack = buildLeadersTrack(currentItems);
    const macroSSOT = getMacroSSOT();
    const etfIntegrity = validateNoETFInItems(final);

    const powerMeta = computePowerMeta(poweredFinal, top3Stats, regime, regimeReasonKR);

    // 6. Return Standard Engine Object
    return {
        newTop3: newTop3.map(t => ({
            ...t,
            ticker: t.ticker || t.symbol,
            symbol: t.ticker || t.symbol,
            alphaScore: t.powerScore || t.alphaScore,
            rank: t.rank || 0,
            role: 'ALPHA',
            velocity: t.velocity,
            whySummaryKR: t.qualityReasonKR || t.whySummaryKR
        })) as any,

        newAlpha12: poweredFinal.slice(0, 12).map(t => ({
            ticker: t.ticker || t.symbol,
            symbol: t.ticker || t.symbol,
            alphaScore: t.powerScore || t.alphaScore,
            // Include minimal props for alpha list
        })) as any,

        continuationTop3: continuationData.top3 || [],
        continuationAlpha12: continuationData.alpha12 || [],
        changelog: continuationData.changelog || [],

        powerMeta,
        universePolicy,
        universeStats,
        leadersTrack,
        macroSSOT,
        etfIntegrity
    };
}
