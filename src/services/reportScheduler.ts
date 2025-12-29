// [S-50.0] Report Scheduler Service
// [S-51.5] Enhanced with Top3/Baseline extraction for performance tracking
// [S-51.5.2] Enhanced with Vercel KV storage support
// [S-51.7] Enhanced with live data enrichment for Top3
// [S-53.0] Enhanced with Continuation Track and State Machine
// [P1] Enhanced with FED API and Redis-based events/policy
// Generates 3 report types: EOD, Pre+2h, Open-30m
// Supports both scheduled (cron) and manual trigger

import path from 'path';
import fs from 'fs';
import { getEventHubSnapshot } from './eventHubProvider';
import { getPolicyHubSnapshot } from './policyHubProvider';
import { getNewsHubSnapshot } from './newsHubProvider';
import { getMacroSnapshotSSOT } from './macroHubProvider';
import { getFedSnapshot } from './fedApiClient'; // [P1] FED data
import { getEventsFromRedis, filterUpcoming } from '@/lib/storage/eventStore'; // [P1] Redis events
import { getPoliciesFromRedis, splitPolicyWindows } from '@/lib/storage/policyStore'; // [P1] Redis policy
import { saveReport, purgeReportCaches, getYesterdayReport, appendPerformanceRecord, PerformanceRecord } from "@/lib/storage/reportStore";
import { getETNow, determineSessionInfo } from "@/services/marketDaySSOT";
import { fetchMassive, RunBudget } from "@/services/massiveClient";
import { enrichTop3Candidates, generateTop3WHY, getVelocitySymbol, EnrichedCandidate } from './top3Enrichment';
import { generateContinuationReport, ContinuationReport } from './continuationEngine';
import { generateReportDiff } from './reportDiff'; // [S-56.1] Decision Continuity
import { applyUniversePolicy, applyUniversePolicyWithBackfill, buildLeadersTrack, getMacroSSOT, validateNoETFInItems, loadStockUniversePool } from './universePolicy'; // [S-56.2] + [S-56.3]
import { applyQualityTiers, selectTop3, determineRegime, computePowerMeta, computeQualityTier } from './powerEngine'; // [S-56.4]
import { BUILD_PIPELINE_VERSION, orchestrateGemsEngine } from '../engine/reportOrchestrator'; // [S-56.4.5c]
import crypto from 'crypto';

// [P0] Fixed 3-report schedule + morning for legacy
export type ReportType = 'eod' | 'pre' | 'open' | 'morning';

// [S-51.5] Top3 and Baseline interfaces for performance tracking
export interface Top3Item {
    ticker: string;
    alphaScore: number;
    velocity: string;
    role: string;
    whySummaryKR: string;
    rank: number;
    changePct?: number;  // [S-51.7] Session-based change percent
}

export interface BaselineItem {
    ticker: string;
    price: number;
    priceField: 'lastTrade' | 'preMarket' | 'afterHours' | 'prevClose_fallback';
    prevClose: number | null;
    refPriceForChange: number | null;
}

export interface BaselineSnapshot {
    source: 'MASSIVE';
    session: 'pre' | 'regular' | 'post';
    tsISO: string;
    tsET: string;
    items: BaselineItem[];
}

export interface ReportMeta {
    id: string;
    type: ReportType;
    generatedAt: string;     // ISO datetime
    generatedAtET: string;   // Formatted ET
    marketDate: string;      // YYYY-MM-DD
    version: string;
    // [S-51.5] Performance tracking fields
    top3?: Top3Item[];
    baseline?: BaselineSnapshot;
    // [S-55.3] SSOT Freshness & Status
    freshness?: {
        generatedAtISO: string;
        ageMin: number;         // Minutes since generation (0 at creation)
        isStale: boolean;
        nextAttemptAtISO?: string; // If pending/scheduling
    };
    optionsStatus?: {
        state: 'READY' | 'PENDING' | 'FAILED' | 'PARTIAL';
        coveragePct: number;
        pendingTickers: string[];
        pendingReason?: string;
        nextRetryAt?: string;
    };
}

export interface PremiumReport {
    meta: ReportMeta;
    macro: any;              // MacroSnapshot
    events: any;             // EventHubSnapshot  
    policy: any;             // PolicyHubSnapshot
    news: any;               // NewsHubSnapshot
    shakeReasons: string[];  // "오늘 흔들릴 이유 3가지"
    marketSentiment: {
        likes: string[];
        dislikes: string[];
    };
    items: any[]; // [vNext] Unified Terminal items
    // TODO: Add report sections 1-10 integration
}

const REPORTS_DIR = path.join(process.cwd(), 'snapshots', 'reports');
const REPORT_VERSION = "S-56.4.6e";

// [P0] Schedule definitions (ET time) - 3 fixed reports
export const REPORT_SCHEDULES: Record<ReportType, { hour: number; minute: number; description: string; labelKR: string }> = {
    'eod': { hour: 16, minute: 30, description: 'EOD Final Report', labelKR: '장마감 후 확정' },
    'pre': { hour: 6, minute: 30, description: 'Premarket +2h', labelKR: '프리마켓 후 2시간' },
    'open': { hour: 9, minute: 0, description: 'Open -30m', labelKR: '본장 30분 전' },
    'morning': { hour: 8, minute: 0, description: 'Morning Brief', labelKR: '장전 브리핑 (레거시)' }
};

// ============================================================================
// HELPERS
// ============================================================================

function formatET(date: Date): string {
    return date.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function getMarketDate(): string {
    const now = getETNow();
    // Simple logic: YYYY-MM-DD
    return now.toISOString().split('T')[0];
}

function ensureReportDir(date: string): string {
    const dateDir = path.join(REPORTS_DIR, date);
    if (!fs.existsSync(dateDir)) {
        fs.mkdirSync(dateDir, { recursive: true });
    }
    return dateDir;
}

// ============================================================================
// GENERATE REPORT (vNext Attributes)
// ============================================================================

export async function generateReport(type: ReportType, force: boolean = false): Promise<PremiumReport> {
    console.log(`[ReportScheduler] Generating ${type} report (vNext Unified Engine)...`);
    const startTime = Date.now();

    // 1. Fetch Global Context
    const [macro, events, policy, news] = await Promise.all([
        getMacroSnapshotSSOT(),
        Promise.resolve(getEventHubSnapshot()),
        Promise.resolve(getPolicyHubSnapshot()),
        getNewsHubSnapshot()
    ]);

    // [FED API] - Integrator
    const fedData = await getFedSnapshot();
    if (macro) {
        // @ts-ignore - Dynamic property injection
        macro.fed = fedData;
    }

    const now = new Date();
    const marketDate = getMarketDate();
    const sessionInfo = determineSessionInfo(now);

    // 2. Universe Selection (Target 12)
    // Convert string[] pool to objects for policy function
    const universePoolStrings = await loadStockUniversePool();
    const universePoolObjects = universePoolStrings.map(s => ({ ticker: s }));

    const universeResult = await applyUniversePolicyWithBackfill(universePoolObjects);
    const candidateTickers = universeResult.final.map(i => i.ticker);

    console.log(`[ReportScheduler] Universe: ${candidateTickers.length} items (${candidateTickers.join(',')})`);

    // 3. Unified Terminal Enrichment
    const { enrichTerminalItems } = await import('./terminalEnricher');
    // Fix session type: determineSessionInfo returns badge='REG'|'PRE'|'POST'|'CLOSED'
    // Map to 'regular'|'pre'|'post'
    const badgeMap: Record<string, 'regular' | 'pre' | 'post'> = {
        'REG': 'regular',
        'PRE': 'pre',
        'POST': 'post',
        'CLOSED': 'regular' // Fallback
    };
    const sessionParam = badgeMap[sessionInfo.badge] || 'regular';

    // [P0] Pass force to enrichTerminalItems to bypass cache when force=true
    const enrichedItems = await enrichTerminalItems(candidateTickers, sessionParam, force);

    // 4. Scoring & Quality Tiers
    // Load yesterday's report for persistence bonuses
    const yesterdayReport = await getYesterdayReport(type, marketDate);
    const prevSymbols = new Set<string>();
    if (yesterdayReport?.items) {
        yesterdayReport.items.forEach((i: any) => prevSymbols.add(i.ticker || i.symbol));
    }

    const scoredItems = enrichedItems.map(item => {
        // vNext computeQualityTier - use complete flag instead of backfilled
        const isBackfilled = item.complete !== true;
        const qualityResult = computeQualityTier(item, prevSymbols, isBackfilled);

        return {
            ...item,
            ...qualityResult,
            score: qualityResult.powerScore, // Legacy compat
            alphaScore: qualityResult.powerScore, // [FIX] Update alphaScore for UI
            rank: 0 // Will assign later
        };
    });

    // 5. Select Top 3 & Rank
    const regimeResult = determineRegime(macro);
    const { top3: selectedTop3, stats } = selectTop3(scoredItems, [], regimeResult.regime);

    // Sort by score desc for ranking
    scoredItems.sort((a, b) => b.score - a.score);

    const finalItems = scoredItems.map((item, idx) => ({
        ...item,
        rank: idx + 1,
        // Legacy fields for UI compatibility
        symbol: item.ticker,
        changePct: item.evidence.price.changePct,
        price: item.evidence.price.last,
        v71: {
            options_status: item.evidence.options.status === 'FAILED' ? 'FAILED' : 'READY',
            options_note: item.evidence.options.status === 'FAILED' ? 'Data Failed' : 'Backfilled/Live'
        }
    }));

    // Re-map selectedTop3 to match Top3Item interface if needed, or use the one from selectTop3
    // We need to ensure Top3 have the 'whySummaryKR' and Rich details.
    // selectTop3 in powerEngine might need update, or we map it here.
    const top3Items: Top3Item[] = selectedTop3.map((t: any, idx: number) => ({
        ticker: t.ticker,
        alphaScore: t.score,
        velocity: getVelocitySymbol(t.evidence.price.changePct),
        role: 'ALPHA',
        whySummaryKR: t.reasonKR || t.whySummaryKR || '종합 분석 완료',
        rank: idx + 1,
        changePct: t.evidence.price.changePct
    }));

    // 6. Continuation Tracking (Simplified vNext)
    // We just track the diffs from yesterday
    const diffs = yesterdayReport ? generateReportDiff({ items: yesterdayReport.items } as any, { items: finalItems } as any, []) : [];

    // 7. Baseline Construction
    const baselineItems: BaselineItem[] = top3Items.map(t => {
        const src = finalItems.find(i => i.ticker === t.ticker);
        return {
            ticker: t.ticker,
            price: src?.evidence.price.last || 0,
            priceField: sessionParam === 'pre' ? 'preMarket' : sessionParam === 'post' ? 'afterHours' : 'lastTrade',
            prevClose: src?.evidence.price.prevClose || 0,
            refPriceForChange: src?.evidence.price.prevClose || 0, // Fallback null to 0
        };
    });

    const baseline: BaselineSnapshot = {
        source: 'MASSIVE',
        session: sessionParam,
        tsISO: now.toISOString(),
        tsET: formatET(now),
        items: baselineItems
    };

    // 8. Construct Final Report
    const report: PremiumReport = {
        meta: {
            id: `${marketDate}-${type}`,
            type,
            generatedAt: now.toISOString(),
            generatedAtET: formatET(now),
            marketDate,
            version: REPORT_VERSION,
            // @ts-ignore
            pipelineVersion: BUILD_PIPELINE_VERSION,
            top3: top3Items,
            baseline,
            freshness: {
                generatedAtISO: now.toISOString(),
                ageMin: 0,
                isStale: false,
                nextAttemptAtISO: undefined
            },
            // [P0] Calculate actual optionsStatus from enrichedItems
            optionsStatus: (() => {
                const okCount = finalItems.filter((i: any) =>
                    i.evidence?.options?.status === 'OK' ||
                    i.evidence?.options?.status === 'READY' ||
                    i.evidence?.options?.status === 'NO_OPTIONS'
                ).length;
                const pendingTickers = finalItems
                    .filter((i: any) => i.evidence?.options?.status === 'PENDING')
                    .map((i: any) => i.ticker);
                const coveragePct = Math.round((okCount / Math.max(finalItems.length, 1)) * 100);
                return {
                    state: pendingTickers.length > 0 ? 'PENDING' as const : 'READY' as const,
                    coveragePct: Math.max(coveragePct, okCount > 0 ? 1 : 0),
                    pendingTickers,
                    pendingReason: 'Unified Engine - Strict Backfill',
                    nextRetryAt: undefined
                };
            })()
        },
        macro,
        events,
        policy,
        news,
        shakeReasons: events.shakeReasons || [],
        marketSentiment: {
            // @ts-ignore - Type bridge for LikeDislike vs String
            likes: news.marketLikes || [],
            // @ts-ignore
            dislikes: news.marketDislikes || []
        },
        items: finalItems,
        alphaGrid: {
            // [P0] Use selectedTop3 not slice - ensure always 3
            top3: selectedTop3.slice(0, 3),
            fullUniverse: finalItems
        },
        engine: {
            regime: regimeResult.regime,
            regimeReasonKR: regimeResult.reasonKR,
            counts: {
                actionableCount: stats.actionableUsed,
                watchCount: stats.watchUsed,
                fillerCount: 0, // Calculated dynamically
                backfillCount: 0
            },
            top3Stats: stats,
            // [P0] Add macroSSOT for health/report - use evidence macro from first complete item
            macroSSOT: (() => {
                // Try to get macro from enriched items' evidence
                const itemWithMacro = finalItems.find((i: any) => i.evidence?.macro?.complete);
                const evidenceMacro = itemWithMacro?.evidence?.macro;

                // Also try getMacroSnapshotSSOT structure (factors.xxx)
                const factorsMacro = macro?.factors;

                return {
                    ndx: {
                        value: evidenceMacro?.ndx?.price || (factorsMacro?.nasdaq100 as any)?.level || macro?.nq || 0,
                        changePct: evidenceMacro?.ndx?.changePct || (factorsMacro?.nasdaq100 as any)?.chgPct || macro?.nqChangePercent || 0,
                        label: 'NDX'
                    },
                    vix: {
                        value: evidenceMacro?.vix?.value || (factorsMacro?.vix as any)?.level || macro?.vix || 0,
                        label: 'VIX'
                    },
                    us10y: {
                        value: evidenceMacro?.us10y?.yield || (factorsMacro?.us10y as any)?.level || macro?.us10y || 0,
                        label: 'US10Y'
                    },
                    dxy: {
                        value: evidenceMacro?.dxy?.value || (factorsMacro?.dxy as any)?.level || macro?.dxy || 0,
                        label: 'DXY'
                    },
                    regime: regimeResult.regime,
                    fetchedAtET: evidenceMacro?.fetchedAtET || macro?.fetchedAtET || new Date().toISOString(),
                    ageSeconds: evidenceMacro?.ageSeconds || macro?.ageSeconds || 0
                };
            })()
        } as any, // Cast to match PowerMeta if needed
        diffs,
        continuation: undefined // Deprecated or re-integrated
    };

    // 9. Persistence
    let stored: 'redis' | 'fs' = 'fs';
    let savedResult: any = null;
    try {
        savedResult = await saveReport(marketDate, type, report, force);
        stored = savedResult.stored;
        console.log(`[ReportScheduler] Report saved: ${stored}`);
    } catch (e) {
        console.error('[ReportScheduler] Save failed:', e);
    }

    // 10. Performance Tracking
    if (baseline && top3Items.length > 0) {
        try {
            await appendPerformanceRecord({
                date: marketDate,
                reportType: type,
                sessionType: baseline.session,
                timestamp: now.toISOString(),
                tickers: baseline.items.map((b, idx) => ({
                    symbol: b.ticker,
                    rank: idx + 1,
                    baselinePrice: b.price,
                    alphaScore: top3Items[idx]?.alphaScore || 0
                })),
                calculated: false
            });
        } catch (e) {
            console.warn('[ReportScheduler] Perf save failed', e);
        }
    }

    console.log(`[ReportScheduler] Completed in ${Date.now() - startTime}ms`);

    // Attach diagnostics for API response (if forced)
    if (force) {
        const metaAny = report.meta as any;
        metaAny.diagnostics = metaAny.diagnostics || {};
        if (savedResult) {
            metaAny.diagnostics.savedTo = savedResult.stored;
            metaAny.diagnostics.rolledBack = savedResult.rolledBack;
        }
    }

    return report;
}

export function listArchivedReports(): { date: string, types: ReportType[] }[] {
    const result: { date: string, types: ReportType[] }[] = [];

    if (!fs.existsSync(REPORTS_DIR)) {
        return result;
    }

    const dates = fs.readdirSync(REPORTS_DIR).filter(d => /\d{4}-\d{2}-\d{2}/.test(d));

    for (const date of dates.sort().reverse()) {
        const dateDir = path.join(REPORTS_DIR, date);
        const files = fs.readdirSync(dateDir);
        const types = files
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', '') as ReportType);

        if (types.length > 0) {
            result.push({ date, types });
        }
    }

    return result;
}

export function getArchivedReport(date: string, type: ReportType): PremiumReport | null {
    const filePath = path.join(REPORTS_DIR, date, `${type}.json`);

    if (!fs.existsSync(filePath)) {
        return null;
    }

    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    } catch (e) {
        console.error(`[ReportScheduler] Failed to read archived report: ${filePath} `, e);
        return null;
    }
}

export function getLatestReport(type: ReportType): PremiumReport | null {
    const archives = listArchivedReports();

    for (const archive of archives) {
        if (archive.types.includes(type)) {
            return getArchivedReport(archive.date, type);
        }
    }

    return null;
}

// Check if a report should be generated based on current time (for cron)
export function shouldGenerateReport(type: ReportType): boolean {
    const now = getETNow();
    const schedule = REPORT_SCHEDULES[type];
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Within 5 minutes of scheduled time
    const targetMinutes = schedule.hour * 60 + schedule.minute;
    const currentMinutes = currentHour * 60 + currentMinute;

    return Math.abs(targetMinutes - currentMinutes) <= 5;
}
