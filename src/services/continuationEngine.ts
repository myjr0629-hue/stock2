// [S-53.0] Continuation Engine - State Machine for Top3/Alpha12 Tracking
// Separates NEW picks from CONTINUATION tracking
// Ensures "yesterday's Top3 buyers" see portfolio management, not disposable daily picks

// ============ TYPES ============

export type ContinuationState = 'HOLD' | 'WATCH' | 'EXIT' | 'REPLACE';

export type StateTrigger =
    | 'TPG_PASS'           // Today's Profit Goal passed
    | 'TPG_FAIL'           // Today's Profit Goal failed
    | 'TIME_STOP'          // TimeStop violation
    | 'HARD_CUT'           // Hard cut level breached
    | 'PUT_FLOOR_BREACH'   // Put floor breached
    | 'RS_WEAK'            // Relative strength weakening
    | 'EARLY_HANDOFF'      // Early handoff condition met
    | 'LEVEL_BREACH'       // Key level breached
    | 'NEWS_CONFLICT'      // News/policy conflict
    | 'OPTIONS_WEAK'       // Options flow weakening
    | 'ALPHA_DROP'         // Alpha score dropped significantly
    | 'NO_CHANGE';         // No state change

export interface ContinuationItem {
    ticker: string;
    symbol: string;
    state: ContinuationState;
    triggers: StateTrigger[];
    whySummaryKR: string;
    prevRank: number;
    prevAlphaScore: number;
    currentData: {
        price: number;
        alphaScore: number;
        changePct: number;
        pulseScore?: number;
    };
    daysHeld: number;
    entryDate: string;
}

export interface ChangelogEntry {
    outTicker?: string;
    inTicker?: string;
    reason: string;
    reasonKR: string;
    action: 'hold' | 'trim_50' | 'exit' | 'swap' | 'no_change';
    triggers: StateTrigger[];
    timestampET: string;
    scoreDelta?: number;
}

export interface ContinuationReport {
    top3: ContinuationItem[];
    alpha12: ContinuationItem[];
    changelog: ChangelogEntry[];
    summaryKR: string;
    stats: {
        holdCount: number;
        watchCount: number;
        exitCount: number;
        replaceCount: number;
    };
}

// ============ STATE MACHINE LOGIC ============

/**
 * Calculate continuation state for a ticker based on current vs previous data
 */
export function calculateContinuationState(
    ticker: string,
    prevData: { alphaScore: number; rank: number; price: number },
    currentData: { alphaScore: number; rank: number; price: number; changePct: number },
    config: {
        alphaDropThreshold?: number;      // Default: -15 (alpha drop)
        priceDropThreshold?: number;      // Default: -5% (price drop)
        rankDropThreshold?: number;       // Default: 3 (rank positions)
        hardCutThreshold?: number;        // Default: -8% (hard cut)
    } = {}
): { state: ContinuationState; triggers: StateTrigger[]; whySummaryKR: string } {
    const {
        alphaDropThreshold = -15,
        priceDropThreshold = -5,
        rankDropThreshold = 3,
        hardCutThreshold = -8
    } = config;

    const triggers: StateTrigger[] = [];
    let state: ContinuationState = 'HOLD';

    const alphaDelta = currentData.alphaScore - prevData.alphaScore;
    const priceDelta = currentData.changePct;
    const rankDelta = currentData.rank - prevData.rank;

    // Check for HARD_CUT (immediate EXIT)
    if (priceDelta <= hardCutThreshold) {
        triggers.push('HARD_CUT');
        state = 'EXIT';
    }

    // Check for significant alpha drop
    if (alphaDelta <= alphaDropThreshold) {
        triggers.push('ALPHA_DROP');
        if (state !== 'EXIT') state = 'WATCH';
    }

    // Check for significant price drop (not hard cut)
    if (priceDelta <= priceDropThreshold && priceDelta > hardCutThreshold) {
        triggers.push('LEVEL_BREACH');
        if (state !== 'EXIT') state = 'WATCH';
    }

    // Check for rank drop
    if (rankDelta >= rankDropThreshold) {
        triggers.push('RS_WEAK');
        if (state !== 'EXIT') state = 'WATCH';
    }

    // If alpha improved or maintained and no negative triggers
    if (triggers.length === 0) {
        if (alphaDelta >= 0) {
            triggers.push('TPG_PASS');
        } else {
            triggers.push('NO_CHANGE');
        }
        state = 'HOLD';
    }

    // Generate Korean summary
    const whySummaryKR = generateWhySummaryKR(ticker, state, triggers, {
        alphaDelta,
        priceDelta,
        rankDelta
    });

    return { state, triggers, whySummaryKR };
}

/**
 * Generate Korean explanation for state
 */
function generateWhySummaryKR(
    ticker: string,
    state: ContinuationState,
    triggers: StateTrigger[],
    deltas: { alphaDelta: number; priceDelta: number; rankDelta: number }
): string {
    const { alphaDelta, priceDelta, rankDelta } = deltas;

    switch (state) {
        case 'HOLD':
            if (triggers.includes('TPG_PASS')) {
                return `${ticker}: 알파 유지(${alphaDelta >= 0 ? '+' : ''}${alphaDelta.toFixed(1)}) → 보유 지속`;
            }
            return `${ticker}: 변동 없음 → 보유 유지`;

        case 'WATCH':
            const watchReasons: string[] = [];
            if (triggers.includes('ALPHA_DROP')) watchReasons.push(`알파 하락(${alphaDelta.toFixed(1)})`);
            if (triggers.includes('LEVEL_BREACH')) watchReasons.push(`가격 하락(${priceDelta.toFixed(1)}%)`);
            if (triggers.includes('RS_WEAK')) watchReasons.push(`순위 하락(${rankDelta}단계)`);
            return `${ticker}: ${watchReasons.join(', ')} → 주의 전환, 축소 검토`;

        case 'EXIT':
            if (triggers.includes('HARD_CUT')) {
                return `${ticker}: 하드컷 발동(${priceDelta.toFixed(1)}%) → 전량 청산 권고`;
            }
            return `${ticker}: 다중 리스크 발생 → 청산 권고`;

        case 'REPLACE':
            return `${ticker}: 이탈 확정, 신규 종목으로 교체`;

        default:
            return `${ticker}: 상태 미정`;
    }
}

// ============ CONTINUATION REPORT GENERATION ============

/**
 * Generate continuation report by comparing yesterday vs today
 */
export function generateContinuationReport(
    yesterdayTop3: { ticker: string; alphaScore: number; rank: number; price: number }[],
    yesterdayAlpha12: { ticker: string; alphaScore: number; rank: number; price: number }[],
    todayAlpha12: { ticker: string; alphaScore: number; rank: number; price: number; changePct: number }[],
    todayTop3Candidates: { ticker: string; alphaScore: number; rank: number; price: number; changePct: number }[]
): ContinuationReport {
    const continuationTop3: ContinuationItem[] = [];
    const continuationAlpha12: ContinuationItem[] = [];
    const changelog: ChangelogEntry[] = [];

    const now = new Date();
    const timestampET = now.toLocaleString('en-US', { timeZone: 'America/New_York' });

    // Process yesterday's Top3
    for (const prev of yesterdayTop3) {
        const current = todayAlpha12.find(t => t.ticker === prev.ticker);

        if (!current) {
            // Ticker not in today's universe - mark as EXIT
            continuationTop3.push({
                ticker: prev.ticker,
                symbol: prev.ticker,
                state: 'EXIT',
                triggers: ['ALPHA_DROP'],
                whySummaryKR: `${prev.ticker}: 금일 유니버스 탈락 → 청산 검토`,
                prevRank: prev.rank,
                prevAlphaScore: prev.alphaScore,
                currentData: { price: 0, alphaScore: 0, changePct: 0 },
                daysHeld: 1,
                entryDate: new Date(Date.now() - 86400000).toISOString().split('T')[0]
            });

            changelog.push({
                outTicker: prev.ticker,
                reason: 'Ticker not in today universe',
                reasonKR: '금일 유니버스 탈락',
                action: 'exit',
                triggers: ['ALPHA_DROP'],
                timestampET
            });
            continue;
        }

        // Calculate state
        const { state, triggers, whySummaryKR } = calculateContinuationState(
            prev.ticker,
            { alphaScore: prev.alphaScore, rank: prev.rank, price: prev.price },
            { alphaScore: current.alphaScore, rank: current.rank, price: current.price, changePct: current.changePct }
        );

        continuationTop3.push({
            ticker: prev.ticker,
            symbol: prev.ticker,
            state,
            triggers,
            whySummaryKR,
            prevRank: prev.rank,
            prevAlphaScore: prev.alphaScore,
            currentData: {
                price: current.price,
                alphaScore: current.alphaScore,
                changePct: current.changePct
            },
            daysHeld: 1,
            entryDate: new Date(Date.now() - 86400000).toISOString().split('T')[0]
        });

        // Add changelog entry if state changed
        if (state !== 'HOLD') {
            changelog.push({
                outTicker: state === 'EXIT' ? prev.ticker : undefined,
                reason: triggers.join(', '),
                reasonKR: whySummaryKR,
                action: state === 'EXIT' ? 'exit' : state === 'WATCH' ? 'trim_50' : 'hold',
                triggers,
                timestampET,
                scoreDelta: current.alphaScore - prev.alphaScore
            });
        }
    }

    // Process yesterday's Alpha12 (excluding Top3)
    const top3Tickers = yesterdayTop3.map(t => t.ticker);
    for (const prev of yesterdayAlpha12.filter(t => !top3Tickers.includes(t.ticker))) {
        const current = todayAlpha12.find(t => t.ticker === prev.ticker);

        if (!current) continue;

        const { state, triggers, whySummaryKR } = calculateContinuationState(
            prev.ticker,
            { alphaScore: prev.alphaScore, rank: prev.rank, price: prev.price },
            { alphaScore: current.alphaScore, rank: current.rank, price: current.price, changePct: current.changePct }
        );

        continuationAlpha12.push({
            ticker: prev.ticker,
            symbol: prev.ticker,
            state,
            triggers,
            whySummaryKR,
            prevRank: prev.rank,
            prevAlphaScore: prev.alphaScore,
            currentData: {
                price: current.price,
                alphaScore: current.alphaScore,
                changePct: current.changePct
            },
            daysHeld: 1,
            entryDate: new Date(Date.now() - 86400000).toISOString().split('T')[0]
        });
    }

    // Calculate stats
    const allItems = [...continuationTop3, ...continuationAlpha12];
    const stats = {
        holdCount: allItems.filter(i => i.state === 'HOLD').length,
        watchCount: allItems.filter(i => i.state === 'WATCH').length,
        exitCount: allItems.filter(i => i.state === 'EXIT').length,
        replaceCount: allItems.filter(i => i.state === 'REPLACE').length
    };

    // Generate summary
    const summaryKR = `전일 Top3: ${stats.holdCount}개 유지, ${stats.watchCount}개 주의, ${stats.exitCount}개 이탈`;

    // Add "no change" entry if everything is HOLD
    if (changelog.length === 0) {
        changelog.push({
            reason: 'All positions maintained',
            reasonKR: '모든 포지션 유지',
            action: 'no_change',
            triggers: ['NO_CHANGE'],
            timestampET
        });
    }

    return {
        top3: continuationTop3,
        alpha12: continuationAlpha12,
        changelog,
        summaryKR,
        stats
    };
}
