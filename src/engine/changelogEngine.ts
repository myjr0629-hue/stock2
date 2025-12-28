// [S-51.0] Changelog Engine - Automatic Top3 CHANGELOG Generation
// Tracks Top3 history and generates Korean explanations for changes

import * as fs from 'fs';
import * as path from 'path';

// Changelog Entry Interface
export interface ChangelogEntry {
    action: 'IN' | 'OUT' | 'NO_CHANGE';
    ticker: string;
    reason: string;           // Korean explanation
    trigger: string;          // +3, +5, EH (Early Handoff), TimeStop, HardCut
    execution: '전량' | '부분(30-50%)' | 'N/A';
    prevRank?: number;
    newRank?: number;
    alphaScore?: number;
    tpgScore?: number;
}

// Time Stop Tracker Entry
export interface TimeStopEntry {
    ticker: string;
    entryDate: string;        // ISO date when entered Top3
    entryPrice: number;
    target1: number;          // First resistance target
    target1Hit: boolean;
    daysSinceEntry: number;
    rebuildPressure: number;  // Accumulated pressure (0-10+)
    lastUpdateDate: string;
}

// Full Tracker State
export interface TrackerState {
    top3: string[];
    timeStopTracker: Record<string, TimeStopEntry>;
    lastReportDate: string;
    changelog: ChangelogEntry[];
}

// Storage path (within snapshots for Vercel persistence)
const TRACKER_PATH = path.join(process.cwd(), 'snapshots', 'engine_tracker.json');

// Load tracker state from disk
export function loadTrackerState(): TrackerState {
    try {
        if (fs.existsSync(TRACKER_PATH)) {
            return JSON.parse(fs.readFileSync(TRACKER_PATH, 'utf-8'));
        }
    } catch (e) {
        console.warn('[Changelog] Failed to load tracker, starting fresh');
    }

    return {
        top3: [],
        timeStopTracker: {},
        lastReportDate: '',
        changelog: []
    };
}

// Save tracker state to disk
export function saveTrackerState(state: TrackerState): void {
    try {
        const dir = path.dirname(TRACKER_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(TRACKER_PATH, JSON.stringify(state, null, 2));
    } catch (e) {
        console.error('[Changelog] Failed to save tracker:', (e as Error).message);
    }
}

// Calculate days since entry
function daysBetween(d1: string, d2: string): number {
    const date1 = new Date(d1);
    const date2 = new Date(d2);
    const diffMs = Math.abs(date2.getTime() - date1.getTime());
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// Update Time Stop pressure for a ticker
export function updateTimeStopPressure(
    state: TrackerState,
    ticker: string,
    currentPrice: number,
    volume: number,
    prevVolume: number,
    target1?: number
): TimeStopEntry {
    const today = new Date().toISOString().split('T')[0];
    let entry = state.timeStopTracker[ticker];

    if (!entry) {
        // New entry
        entry = {
            ticker,
            entryDate: today,
            entryPrice: currentPrice,
            target1: target1 || currentPrice * 1.05,  // Default 5% target
            target1Hit: false,
            daysSinceEntry: 0,
            rebuildPressure: 0,
            lastUpdateDate: today
        };
    } else {
        // Update existing
        entry.daysSinceEntry = daysBetween(entry.entryDate, today);
        entry.lastUpdateDate = today;

        // Check if target1 hit
        if (currentPrice >= entry.target1) {
            entry.target1Hit = true;
            entry.rebuildPressure = 0;  // Reset on success
        } else if (entry.daysSinceEntry >= 1) {
            // D+1 rule: Target1 not hit + volume down → +3 pressure
            const volumeDown = volume < prevVolume * 0.8;

            if (!entry.target1Hit && volumeDown) {
                entry.rebuildPressure += 3;
                console.log(`[TimeStop] ${ticker}: D+${entry.daysSinceEntry}, target miss + vol down → pressure +3 (total: ${entry.rebuildPressure})`);
            }

            // D+2 consecutive rule: +5 pressure
            if (entry.daysSinceEntry >= 2 && !entry.target1Hit) {
                entry.rebuildPressure += 2;  // Additional +2 for D+2
                console.log(`[TimeStop] ${ticker}: D+2 consecutive miss → pressure +2 (total: ${entry.rebuildPressure})`);
            }
        }
    }

    state.timeStopTracker[ticker] = entry;
    return entry;
}

// Generate CHANGELOG by comparing old and new Top3
export function generateChangelog(
    prevTop3: string[],
    newTop3: { ticker: string; alphaScore: number; tpgScore?: number; tpgExplanation?: string }[],
    timeStopTracker: Record<string, TimeStopEntry>
): ChangelogEntry[] {
    const changelog: ChangelogEntry[] = [];
    const newTickers = newTop3.map(t => t.ticker);

    // Find OUT tickers
    for (const prevTicker of prevTop3) {
        if (!newTickers.includes(prevTicker)) {
            const prevRank = prevTop3.indexOf(prevTicker) + 1;
            const tracker = timeStopTracker[prevTicker];

            let trigger = 'N/A';
            let reason = '순위 하락으로 Top3 이탈';

            if (tracker && tracker.rebuildPressure >= 8) {
                trigger = 'TimeStop +8';
                reason = `D+${tracker.daysSinceEntry} 목표 미달 + 거래대금 둔화 → 교체`;
            } else if (tracker && tracker.rebuildPressure >= 5) {
                trigger = '+5';
                reason = '연속 목표 미달로 강제 교체';
            }

            changelog.push({
                action: 'OUT',
                ticker: prevTicker,
                reason,
                trigger,
                execution: trigger.includes('TimeStop') ? '부분(30-50%)' : '전량',
                prevRank
            });
        }
    }

    // Find IN tickers
    for (let i = 0; i < newTop3.length; i++) {
        const t = newTop3[i];
        if (!prevTop3.includes(t.ticker)) {
            let trigger = '+3';
            let reason = `AlphaScore ${t.alphaScore.toFixed(1)} + ${t.tpgExplanation || 'TPG 통과'}`;

            // Early Handoff check
            if (i > 0 && prevTop3.length > 0) {
                const incumbentIdx = prevTop3.findIndex(p => newTickers.includes(p));
                if (incumbentIdx >= 0) {
                    trigger = 'EH';
                    reason = `AlphaScore 근접 + Velocity 우위 → 조기 교체 (${t.tpgExplanation || ''})`;
                }
            }

            changelog.push({
                action: 'IN',
                ticker: t.ticker,
                reason,
                trigger,
                execution: trigger === 'EH' ? '부분(30-50%)' : '전량',
                newRank: i + 1,
                alphaScore: t.alphaScore,
                tpgScore: t.tpgScore
            });
        } else {
            // NO_CHANGE but might have rank change
            const prevRank = prevTop3.indexOf(t.ticker) + 1;
            const newRank = i + 1;

            if (prevRank !== newRank) {
                changelog.push({
                    action: 'NO_CHANGE',
                    ticker: t.ticker,
                    reason: `순위 변동 (${prevRank}위 → ${newRank}위)`,
                    trigger: 'N/A',
                    execution: 'N/A',
                    prevRank,
                    newRank,
                    alphaScore: t.alphaScore
                });
            }
        }
    }

    return changelog;
}

// Reset tracker for a ticker (on OUT or HardCut)
export function resetTickerTracker(state: TrackerState, ticker: string): void {
    delete state.timeStopTracker[ticker];
}

// Generate Korean explanation for why a ticker is NOT in Top3
export function generateNoTradeExplanation(
    ticker: string,
    alphaScore: number,
    tpgPassed: boolean,
    tpgScore: number,
    retestStatus: string
): string {
    const reasons: string[] = [];

    if (!tpgPassed) {
        reasons.push(`TPG ${tpgScore}/4 미달`);
    }

    if (retestStatus === 'FIRST_BREAK') {
        reasons.push('첫 돌파 추격 금지 (리테스트 대기)');
    }

    if (alphaScore < 60) {
        reasons.push(`AlphaScore ${alphaScore.toFixed(1)} (기준 미달)`);
    }

    if (reasons.length === 0) {
        return `${ticker}: 조건 충족되나 상위 종목 대비 우선순위 낮음`;
    }

    return `${ticker}: ${reasons.join(' + ')} → TPG 통과 + 리테스트 성공 시 재평가`;
}

// Format changelog for report display
export function formatChangelogForReport(changelog: ChangelogEntry[]): string {
    if (changelog.length === 0) {
        return '**CHANGELOG**: No Change (Top3 유지)';
    }

    const lines: string[] = ['**CHANGELOG**:'];

    for (const entry of changelog) {
        const icon = entry.action === 'IN' ? '🟢 IN' : entry.action === 'OUT' ? '🔴 OUT' : '🔄';
        const rankInfo = entry.action === 'IN'
            ? `→ ${entry.newRank}위`
            : entry.action === 'OUT'
                ? `(${entry.prevRank}위)`
                : `${entry.prevRank}→${entry.newRank}위`;

        lines.push(`- ${icon} **${entry.ticker}** ${rankInfo}: ${entry.reason} [${entry.trigger}] (${entry.execution})`);
    }

    return lines.join('\n');
}
