// [P2] Policy Gate - Determines trading constraints based on policy events
// P0: Market-wide impact → Block new entries/increases
// P1: Sector impact → Reduce sector weights
// P2: Stock-specific → Ticker-level warning

import { StoredPolicy, splitPolicyWindows } from "@/lib/storage/policyStore";

export interface PolicyGateResult {
    gate: "OPEN" | "CAUTION" | "BLOCKED";
    gateReasonKR: string;
    blockedTickers: string[];
    cautionSectors: string[];
    p0Conflicts: StoredPolicy[];
    p1Conflicts: StoredPolicy[];
    actionConstraints: {
        newEntryAllowed: boolean;
        increaseAllowed: boolean;
        sectorWeightMultiplier: Record<string, number>;
    };
}

// Evaluate policies against a ticker and return gate status
export function evaluatePolicyGate(
    policies: StoredPolicy[],
    ticker?: string,
    sector?: string
): PolicyGateResult {
    const { within72h, within7d } = splitPolicyWindows(policies);

    // Find P0 conflicts (market-wide) - always apply
    const p0Conflicts = within72h.filter(p => p.category === "P0");

    // Find P1 conflicts (sector) - apply if sector matches
    const p1Conflicts = [
        ...within72h.filter(p => p.category === "P1"),
        ...within7d.filter(p => p.category === "P1")
    ].filter(p => !sector || !p.affectedSectors || p.affectedSectors.includes(sector));

    // Find P2 conflicts (stock-specific) - apply if ticker matches
    const p2Conflicts = [
        ...within72h.filter(p => p.category === "P2"),
        ...within7d.filter(p => p.category === "P2")
    ].filter(p => ticker && p.affectedTickers?.includes(ticker));

    // Determine gate status
    let gate: "OPEN" | "CAUTION" | "BLOCKED" = "OPEN";
    let gateReasonKR = "정책 충돌 없음";
    const blockedTickers: string[] = [];
    const cautionSectors: string[] = [];
    const sectorWeightMultiplier: Record<string, number> = {};

    // P0: Block new entries and increases
    if (p0Conflicts.length > 0) {
        gate = "BLOCKED";
        gateReasonKR = `P0급 정책 충돌: ${p0Conflicts[0].titleKR}`;
    }
    // P1: Caution on affected sectors
    else if (p1Conflicts.length > 0) {
        gate = "CAUTION";
        gateReasonKR = `P1급 섹터 영향: ${p1Conflicts[0].titleKR}`;

        // Reduce weight for affected sectors
        p1Conflicts.forEach(p => {
            (p.affectedSectors || []).forEach(s => {
                cautionSectors.push(s);
                // Apply 0.5x weight multiplier for NEGATIVE impact, 0.8x for MIXED
                sectorWeightMultiplier[s] = p.impact === "NEGATIVE" ? 0.5 :
                    p.impact === "MIXED" ? 0.8 : 1.0;
            });
        });
    }
    // P2: Stock-specific warning
    else if (p2Conflicts.length > 0 && ticker) {
        gate = "CAUTION";
        gateReasonKR = `P2급 종목 영향: ${p2Conflicts[0].titleKR}`;
        blockedTickers.push(ticker);
    }

    return {
        gate,
        gateReasonKR,
        blockedTickers,
        cautionSectors,
        p0Conflicts,
        p1Conflicts,
        actionConstraints: {
            newEntryAllowed: gate !== "BLOCKED",
            increaseAllowed: gate !== "BLOCKED",
            sectorWeightMultiplier
        }
    };
}

// Quick check for Top3 candidates
export function applyPolicyGateToTop3(
    candidates: Array<{ ticker: string; sector?: string; score?: number }>,
    policies: StoredPolicy[]
): Array<{ ticker: string; sector?: string; score?: number; policyGate: PolicyGateResult }> {
    return candidates.map(c => ({
        ...c,
        policyGate: evaluatePolicyGate(policies, c.ticker, c.sector)
    }));
}

// Check if trading should be blocked market-wide
export function isMarketBlocked(policies: StoredPolicy[]): { blocked: boolean; reason: string } {
    const { within72h } = splitPolicyWindows(policies);
    const p0Critical = within72h.find(p => p.category === "P0" && p.sourceGrade === "A");

    if (p0Critical) {
        return {
            blocked: true,
            reason: `[P0 BLOCK] ${p0Critical.titleKR} (${p0Critical.effectiveDate})`
        };
    }

    return { blocked: false, reason: "" };
}
