
import { GemsTicker, ReportDiffItem, ReportDiffReason, Tier01Data } from './stockTypes';

/**
 * Generate a diff between yesterday's report and today's report
 * Focuses on Rank Changes and "Why it happened"
 */
export function generateReportDiff(
    prevReport: Tier01Data | null,
    currReport: Tier01Data,
    missingTickers: string[] = []
): ReportDiffItem[] {
    if (!prevReport || !prevReport.tickers) return [];

    const diffs: ReportDiffItem[] = [];
    const prevTickers = prevReport.tickers;
    const currTickers = currReport.tickers;

    // Map for fast lookup
    const prevMap = new Map(prevTickers.map(t => [t.symbol, t]));
    const currMap = new Map(currTickers.map(t => [t.symbol, t]));

    // 1. Check Prev Top 12 (Continuity Tracking)
    prevTickers.slice(0, 12).forEach((prevT) => {
        const symbol = prevT.symbol;
        const currT = currMap.get(symbol);

        // Resolve Decision Actions (Fallbacks for legacy)
        const prevAction = prevT.decisionSSOT?.action || prevT.v71?.decisionSSOT?.action || prevT.v71?.holdConfidence?.action || 'EXIT';
        const currAction = currT?.decisionSSOT?.action || currT?.v71?.decisionSSOT?.action || 'EXIT'; // formatted below if currT exists

        if (currT) {
            const actualCurrAction = currT.decisionSSOT?.action || 'MAINTAIN'; // Default to MAINTAIN if fresh pick

            // [S-56.1] Decision Continuity Logic
            if (prevAction === 'MAINTAIN' && actualCurrAction === 'MAINTAIN') {
                diffs.push({
                    ticker: symbol, fromRank: prevT.rank, toRank: currT.rank,
                    fromState: prevAction, toState: actualCurrAction,
                    reasonCode: ReportDiffReason.CONTINUATION,
                    reasonKR: `기존 관점 유지 (신뢰도 ${currT.decisionSSOT?.confidence}%)`
                });
            } else if (prevAction === 'MAINTAIN' && actualCurrAction === 'CAUTION') {
                diffs.push({
                    ticker: symbol, fromRank: prevT.rank, toRank: currT.rank,
                    fromState: prevAction, toState: actualCurrAction,
                    reasonCode: ReportDiffReason.WEAKENING,
                    reasonKR: `관점 약화 (주의 단계 진입)`
                });
            } else if (prevAction === 'CAUTION' && actualCurrAction === 'MAINTAIN') {
                diffs.push({
                    ticker: symbol, fromRank: prevT.rank, toRank: currT.rank,
                    fromState: prevAction, toState: actualCurrAction,
                    reasonCode: ReportDiffReason.RECOVERY,
                    reasonKR: `관점 회복 (신뢰도 ${currT.decisionSSOT?.confidence}%)`
                });
            } else if ((prevAction === 'MAINTAIN' || prevAction === 'CAUTION') && (actualCurrAction === 'EXIT' || actualCurrAction === 'REPLACE')) {
                diffs.push({
                    ticker: symbol, fromRank: prevT.rank, toRank: currT.rank,
                    fromState: prevAction, toState: actualCurrAction,
                    reasonCode: ReportDiffReason.EXIT_SIGNAL,
                    reasonKR: `청산/교체 시그널 발생`
                });
            }
        } else {
            // Disappeared from Top List (Implicit Exit or Out)
            if (missingTickers.includes(symbol)) {
                diffs.push({
                    ticker: symbol, fromRank: prevT.rank, toRank: null,
                    fromState: prevAction, toState: 'MISSING',
                    reasonCode: ReportDiffReason.DATA_MISSING,
                    reasonKR: '데이터 수신 실패 (판단 보류)'
                });
            } else {
                diffs.push({
                    ticker: symbol, fromRank: prevT.rank, toRank: null,
                    fromState: prevAction, toState: 'OUT',
                    reasonCode: ReportDiffReason.UNIVERSE_OUT,
                    reasonKR: '유니버스 이탈 (점수 하락)'
                });
            }
        }
    });

    // 2. Check New Entries (Top 12)
    // Only flag if it wasn't in previous Top 12 and action is MAINTAIN (Strong Buy)
    currTickers.slice(0, 12).forEach((currT) => {
        if (!prevMap.has(currT.symbol)) {
            const action = currT.decisionSSOT?.action || 'MAINTAIN';
            if (action === 'MAINTAIN') {
                diffs.push({
                    ticker: currT.symbol, fromRank: null, toRank: currT.rank,
                    fromState: 'NEW', toState: action,
                    reasonCode: ReportDiffReason.NEW_ENTRY,
                    reasonKR: '신규 강력 매수 진입'
                });
            }
        }
    });

    return diffs;
}
