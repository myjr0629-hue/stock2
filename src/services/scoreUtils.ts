// [S-53.1] Score Utilities - Basis Point Precision
// All scores calculated as integers (×10) to eliminate floating-point drift

// ============ TYPES ============

export interface ScoreComponent {
    key: string;           // 'pulse', 'mm', 'stealth', 'secret'
    valueBp: number;       // Value in basis points (score × 10)
    labelKR: string;       // Korean label
}

export interface CalcBreakdown {
    alphaScoreBp: number;      // Original alphaScore × 10
    components: ScoreComponent[];
    sumBp: number;             // Sum of component valueBp
    displayScore: number;      // sumBp / 10 (for UI)
    match: boolean;            // sumBp === alphaScoreBp
    driftBp: number;           // sumBp - alphaScoreBp
}

// ============ CONVERSION ============

/**
 * Convert decimal score to basis points (1/10 precision as integer)
 * Example: 49.9 → 499
 */
export function toBp(score: number | undefined | null): number {
    if (score === undefined || score === null || !Number.isFinite(score)) {
        return 0;
    }
    return Math.round(score * 10);
}

/**
 * Convert basis points back to decimal for display
 * Example: 499 → 49.9
 */
export function fromBp(bp: number): number {
    return bp / 10;
}

// ============ VALIDATION ============

/**
 * Calculate breakdown and validate that sum of components equals alphaScore
 */
export function calculateCalcBreakdown(item: any): CalcBreakdown {
    const alphaScore = item.alphaScore ?? 0;
    const alphaScoreBp = toBp(alphaScore);

    // Extract score components
    const components: ScoreComponent[] = [];

    // PulseScore (5 factors)
    if (item.v71?.pulseScore !== undefined) {
        components.push({
            key: 'pulse',
            valueBp: toBp(item.v71.pulseScore),
            labelKR: '펄스점수'
        });
    }

    // MM/Dealer Position
    if (item.v71?.mmScore !== undefined) {
        components.push({
            key: 'mm',
            valueBp: toBp(item.v71.mmScore),
            labelKR: 'MM 포지션'
        });
    }

    // Stealth indicators
    if (item.v71?.stealthScore !== undefined) {
        components.push({
            key: 'stealth',
            valueBp: toBp(item.v71.stealthScore),
            labelKR: '스텔스'
        });
    }

    // Secret indicators (S1/S2)
    if (item.v71?.secretScore !== undefined) {
        components.push({
            key: 'secret',
            valueBp: toBp(item.v71.secretScore),
            labelKR: '시크릿'
        });
    }

    // If no components found, use alphaScore as single component
    if (components.length === 0) {
        components.push({
            key: 'total',
            valueBp: alphaScoreBp,
            labelKR: '종합점수'
        });
    }

    // Calculate sum
    const sumBp = components.reduce((acc, c) => acc + c.valueBp, 0);
    const displayScore = fromBp(sumBp);
    const driftBp = sumBp - alphaScoreBp;
    const match = driftBp === 0;

    return {
        alphaScoreBp,
        components,
        sumBp,
        displayScore,
        match,
        driftBp
    };
}

/**
 * Validate all items and return list of mismatches
 */
export function validateAllScores(items: any[]): {
    totalItems: number;
    matchCount: number;
    mismatchCount: number;
    mismatches: { ticker: string; driftBp: number }[];
} {
    const mismatches: { ticker: string; driftBp: number }[] = [];
    let matchCount = 0;

    for (const item of items) {
        const breakdown = calculateCalcBreakdown(item);
        if (breakdown.match) {
            matchCount++;
        } else {
            mismatches.push({
                ticker: item.ticker || item.symbol || 'UNKNOWN',
                driftBp: breakdown.driftBp
            });
        }
    }

    return {
        totalItems: items.length,
        matchCount,
        mismatchCount: mismatches.length,
        mismatches
    };
}
