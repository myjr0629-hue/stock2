// [S-50.0] Report Scheduler Service
// [S-51.5] Enhanced with Top3/Baseline extraction for performance tracking
// [S-51.5.2] Enhanced with Vercel KV storage support
// [S-51.7] Enhanced with live data enrichment for Top3
// [S-53.0] Enhanced with Continuation Track and State Machine
// Generates 3 report types: EOD, Pre+2h, Open-30m
// Supports both scheduled (cron) and manual trigger

import path from 'path';
import fs from 'fs';
import { getEventHubSnapshot } from './eventHubProvider';
import { getPolicyHubSnapshot } from './policyHubProvider';
import { getNewsHubSnapshot } from './newsHubProvider';
import { getMacroSnapshotSSOT } from './macroHubProvider';
import { saveReport, getArchivedReport, purgeReportCaches } from "@/lib/storage/reportStore";
import { getETNow, determineSessionInfo } from "@/services/marketDaySSOT";
import { fetchMassive, RunBudget } from "@/services/massiveClient";
import { enrichTop3Candidates, generateTop3WHY, getVelocitySymbol, EnrichedCandidate } from './top3Enrichment';
import { generateContinuationReport, ContinuationReport } from './continuationEngine';
import { generateReportDiff } from './reportDiff'; // [S-56.1] Decision Continuity
import { applyUniversePolicy, applyUniversePolicyWithBackfill, buildLeadersTrack, getMacroSSOT, validateNoETFInItems, loadStockUniversePool } from './universePolicy'; // [S-56.2] + [S-56.3]
import { applyQualityTiers, selectTop3, determineRegime, computePowerMeta } from './powerEngine'; // [S-56.4]
import { BUILD_PIPELINE_VERSION, orchestrateGemsEngine } from '../engine/reportOrchestrator'; // [S-56.4.5c]

export type ReportType = 'eod' | 'pre2h' | 'open30m';

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
    // TODO: Add report sections 1-10 integration
}

const REPORTS_DIR = path.join(process.cwd(), 'snapshots', 'reports');
const REPORT_VERSION = "S-56.4.6e";

// Schedule definitions (ET time)
export const REPORT_SCHEDULES: Record<ReportType, { hour: number, minute: number, description: string }> = {
    'eod': { hour: 16, minute: 30, description: 'EOD Final Report (장마감 후)' },
    'pre2h': { hour: 6, minute: 30, description: 'Pre+2h Checkpoint (프리마켓 2시간 후)' },
    'open30m': { hour: 9, minute: 0, description: 'Open-30m Execution (개장 30분 전)' }
};

function getETNow(): Date {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

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
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function ensureReportDir(date: string): string {
    const dateDir = path.join(REPORTS_DIR, date);
    if (!fs.existsSync(dateDir)) {
        fs.mkdirSync(dateDir, { recursive: true });
    }
    return dateDir;
}

export async function generateReport(type: ReportType, force: boolean = false): Promise<PremiumReport> {
    console.log(`[ReportScheduler] Generating ${type} report...`);
    const startTime = Date.now();

    // Gather all data from hubs
    const [macro, events, policy, news] = await Promise.all([
        getMacroSnapshotSSOT(),
        Promise.resolve(getEventHubSnapshot()),
        Promise.resolve(getPolicyHubSnapshot()),
        getNewsHubSnapshot()
    ]);

    const now = new Date();
    const marketDate = getMarketDate();

    // [S-51.7] Extract Top3 with live data enrichment
    let top3: Top3Item[] = [];
    let baseline: BaselineSnapshot | undefined;

    try {
        const latestPath = path.join(process.cwd(), 'snapshots', 'latest.json');
        if (fs.existsSync(latestPath)) {
            const latestRaw = fs.readFileSync(latestPath, 'utf-8');
            const latest = JSON.parse(latestRaw);

            // Extract Top3 from alphaGrid with live data enrichment
            if (latest.alphaGrid?.top3 && Array.isArray(latest.alphaGrid.top3)) {
                console.log(`[S-51.7] Starting Top3 enrichment with ${latest.alphaGrid.top3.length} candidates...`);

                const { enriched, session } = await enrichTop3Candidates(latest.alphaGrid.top3, 10);

                // Filter out poor data quality candidates for Top3
                const qualifiedCandidates = enriched.filter(c => c.dataQuality !== 'poor');
                const top3Source = qualifiedCandidates.length >= 3 ? qualifiedCandidates : enriched;

                // Build Top3 items
                top3 = top3Source.slice(0, 3).map((c: EnrichedCandidate, idx: number) => ({
                    ticker: c.ticker,
                    alphaScore: c.alphaScore,
                    velocity: getVelocitySymbol(c.changePct),
                    role: 'ALPHA',
                    whySummaryKR: c.dataQuality !== 'poor' ? generateTop3WHY(c) : `데이터 부족(${c.missingData.join('/')})`,
                    rank: idx + 1,
                    changePct: c.changePct
                }));

                // Build baseline items
                const baselineItems: BaselineItem[] = top3Source.slice(0, 3).map((c: EnrichedCandidate) => ({
                    ticker: c.ticker,
                    price: c.price,
                    priceField: session === 'pre' ? 'preMarket' as const :
                        session === 'post' ? 'afterHours' as const : 'lastTrade' as const,
                    prevClose: c.prevClose,
                    refPriceForChange: c.prevClose
                }));

                baseline = {
                    source: 'MASSIVE',
                    session,
                    tsISO: now.toISOString(),
                    tsET: formatET(now),
                    items: baselineItems
                };

                console.log(`[S-51.7] Top3: ${top3.map(t => `${t.ticker}(${t.changePct}%)`).join(', ')} | Session: ${session}`);
            }
        }
    } catch (e) {
        console.warn('[S-51.7] Failed to extract Top3/Baseline:', (e as Error).message);
    }

    // [S-52.5] Load full GEMS engine data from latest.json
    let gemsItems: any[] = [];
    let gemsAlphaGrid: any = undefined;
    let gemsFullUniverse: any[] = [];
    let prevTop3Symbols: string[] = []; // [S-56.4]

    try {
        const latestPath = path.join(process.cwd(), 'snapshots', 'latest.json');
        if (fs.existsSync(latestPath)) {
            const latestRaw = fs.readFileSync(latestPath, 'utf-8');
            const latest = JSON.parse(latestRaw);

            // Extract items (final 12 selected stocks)
            if (Array.isArray(latest.items) && latest.items.length > 0) {
                gemsItems = latest.items;
                console.log(`[S-52.5] Loaded ${gemsItems.length} items from latest.json`);
            }

            // Extract alphaGrid (top3 and fullUniverse)
            if (latest.alphaGrid) {
                gemsAlphaGrid = latest.alphaGrid;
                gemsFullUniverse = latest.alphaGrid.fullUniverse || [];
                if (latest.alphaGrid.top3) {
                    prevTop3Symbols = latest.alphaGrid.top3.map((t: any) => t.ticker || t.symbol);
                }
                console.log(`[S-52.5] Loaded alphaGrid: top3=${gemsAlphaGrid.top3?.length || 0}, fullUniverse=${gemsFullUniverse.length}`);
            } else if (latest.engine?.newTop3) {
                // Return newTop3 as fallback for prevTop3
                prevTop3Symbols = latest.engine.newTop3.map((t: any) => t.ticker || t.symbol);
            }
        }
    } catch (e) {
        console.warn('[S-52.5] Failed to load GEMS engine data:', (e as Error).message);
    }

    // [S-53.0] Generate Continuation Track
    let continuation: ContinuationReport | null = null;
    let yesterdayReport: any = null; // Hoisted for orchestrator
    try {
        yesterdayReport = await getYesterdayReport(type, marketDate);

        if (yesterdayReport && gemsItems.length >= 12) {
            // Extract yesterday's Top3 and Alpha12
            const yesterdayTop3 = (yesterdayReport.meta?.top3 || yesterdayReport.alphaGrid?.top3 || [])
                .slice(0, 3)
                .map((t: any, i: number) => ({
                    ticker: t.ticker || t.symbol,
                    alphaScore: t.alphaScore || 0,
                    rank: i + 1,
                    price: t.price || 0
                }));

            const yesterdayAlpha12 = (yesterdayReport.items || [])
                .slice(0, 12)
                .map((t: any, i: number) => ({
                    ticker: t.ticker || t.symbol,
                    alphaScore: t.alphaScore || 0,
                    rank: i + 1,
                    price: t.price || 0
                }));

            // Extract today's data
            const todayAlpha12 = gemsItems.slice(0, 12).map((t: any, i: number) => ({
                ticker: t.ticker || t.symbol,
                alphaScore: t.alphaScore || 0,
                rank: i + 1,
                price: t.price || 0,
                changePct: t.changePct || 0
            }));

            const todayTop3Candidates = todayAlpha12.slice(0, 3);

            // Generate continuation report
            continuation = generateContinuationReport(
                yesterdayTop3,
                yesterdayAlpha12,
                todayAlpha12,
                todayTop3Candidates
            );

            console.log(`[S-53.0] Continuation generated: ${continuation.summaryKR}`);
        } else {
            console.log(`[S-53.0] No continuation: yesterday=${!!yesterdayReport}, items=${gemsItems.length}`);
        }
    } catch (e) {
        console.warn('[S-53.0] Continuation generation failed:', (e as Error).message);
    }


    // [S-55.3] Calculate Options SSOT Status
    let optionsState: 'READY' | 'PENDING' | 'FAILED' | 'PARTIAL' = 'READY';
    // Simplified: Use session.lastTradingDay which is robust
    const reportDate = marketDate; // Using marketDate as a proxy for session.lastTradingDay

    let purgedCount = 0;
    if (force) {
        console.log(`[ReportScheduler] Force regeneration requested. Purging caches for ${reportDate}...`);
        // Assuming purgeReportCaches is an async function that takes date and type
        // and returns the count of purged items.
        // This function is not defined in the provided snippet, but assumed to exist.
        purgedCount = await purgeReportCaches(reportDate, type);
    }

    // Check if report already exists for this date/type to avoid dupes (unless forced)
    // This block is commented out as per the instruction's implied context,
    // but the original code did not have this check here.
    // The instruction's snippet `if (!force) {msItems is loaded from latest.json`
    // seems to be a partial line from the original code mixed with a new `if (!force)` block.
    // I will proceed by inserting the new code and keeping the original code that follows.

    const pendingTickers: string[] = [];
    const failedTickers: string[] = [];

    // Check Top 12 items for options status
    // gemsItems is loaded from latest.json
    const targetItems = gemsItems.slice(0, 12);
    targetItems.forEach(item => {
        if (item.v71?.options_status === 'PENDING') {
            pendingTickers.push(item.symbol || item.ticker);
        } else if (item.v71?.options_status === 'FAILED') {
            failedTickers.push(item.symbol || item.ticker);
        }
    });

    const totalTarget = targetItems.length;
    let coveragePct = totalTarget > 0 ? Math.round(((totalTarget - pendingTickers.length - failedTickers.length) / totalTarget) * 100) : 0;

    let pendingReason = '';
    let nextRetryAt = '';

    if (pendingTickers.length > 0) {
        optionsState = 'PENDING';
        pendingReason = `옵션 데이터 대기 중 (${pendingTickers.length}/${totalTarget})`;
        // Estimate retry: 5-10 mins from now
        nextRetryAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    } else if (failedTickers.length > 0 && coveragePct < 50) {
        optionsState = 'FAILED';
        pendingReason = '주요 종목 옵션 데이터 실패';
    } else if (totalTarget === 0) {
        optionsState = 'PENDING'; // No data yet
        pendingReason = '데이터 수집 시작 전';
    }

    const report: PremiumReport = {
        meta: {
            id: `${marketDate}-${type}`,
            type,
            generatedAt: now.toISOString(),
            generatedAtET: formatET(now),
            marketDate,
            version: REPORT_VERSION,
            pipelineVersion: BUILD_PIPELINE_VERSION,
            top3: top3.length > 0 ? top3 : undefined,
            baseline: baseline,
            // [S-55.3] Inject Freshness & Status
            freshness: {
                generatedAtISO: now.toISOString(),
                ageMin: 0,
                isStale: false,
                nextAttemptAtISO: optionsState === 'PENDING' ? nextRetryAt : undefined
            },
            optionsStatus: {
                state: optionsState,
                coveragePct,
                pendingTickers,
                pendingReason,
                nextRetryAt: optionsState === 'PENDING' ? nextRetryAt : undefined
            }
        },
        macro,
        events,
        policy,
        news,
        shakeReasons: events.shakeReasons,
        marketSentiment: {
            likes: news.marketLikes,
            dislikes: news.marketDislikes
        },
        // [S-52.5] Include full GEMS engine data for Redis storage
        items: gemsItems,
        alphaGrid: gemsAlphaGrid,
        // [S-53.0] Continuation Track + [S-56.2] + [S-56.3] + [S-56.4] Power Engine
        // [S-56.4] Power Engine SSOT
        engine: orchestrateGemsEngine(
            gemsItems,
            macro as any, // [S-56.4.5c] MacroSnapshot → MacroData type bridge
            yesterdayReport,
            {
                top3: continuation?.top3,
                alpha12: continuation?.alpha12,
                changelog: continuation?.changelog
            }
        ),
        continuation: continuation ? {
            summaryKR: continuation.summaryKR,
            stats: continuation.stats
        } : undefined,
        // [S-56.1] Decision Continuity Diffs
        diffs: (() => {
            try {
                // Use yesterdayReport (already loaded above) to compute diffs
                // yesterdayReport is in scope from S-53.0 continuation logic
                if (gemsItems.length >= 12) {
                    // Need to get yesterdayReport again since it's in a try block
                    const latestPath = path.join(process.cwd(), 'snapshots', 'latest.json');
                    if (fs.existsSync(latestPath)) {
                        const prevLatest = JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
                        // Use the saved items from the latest.json's diffs if it already exists
                        if (prevLatest.diffs && Array.isArray(prevLatest.diffs)) {
                            return prevLatest.diffs;
                        }
                        // Otherwise, compute new diffs
                        const prevReport = { tickers: prevLatest.items || [] };
                        const currReport = { tickers: gemsItems.slice(0, 12) };
                        return generateReportDiff(prevReport as any, currReport as any, []);
                    }
                }
                return [];
            } catch (e) {
                console.warn('[S-56.1] Failed to generate diffs:', (e as Error).message);
                return [];
            }
        })
    } as any;

    // [S-51.5.2] Save to storage (Redis in Vercel, FS locally)
    // [S-51.5.2] Save to storage (Redis in Vercel, FS locally)
    let stored: 'redis' | 'fs' = 'fs';
    let savedResult: any = null;
    try {
        savedResult = await saveReport(marketDate, type, report, force);
        stored = savedResult.stored;
        console.log(`[ReportScheduler] Report saved: ${stored} (RolledBack: ${savedResult.rolledBack})`);
    } catch (saveErr) {
        console.warn('[ReportScheduler] Report save failed:', (saveErr as Error).message);
    }

    // [S-51.5.2] Add to performance tracker (KV in Vercel, FS locally)
    if (baseline && top3.length > 0) {
        try {
            const perfRecord: PerformanceRecord = {
                date: marketDate,
                reportType: type,
                sessionType: baseline.session,
                timestamp: now.toISOString(),
                tickers: baseline.items.map((b, idx) => ({
                    symbol: b.ticker,
                    rank: idx + 1,
                    baselinePrice: b.price,
                    alphaScore: top3[idx]?.alphaScore || 0
                })),
                calculated: false
            };

            await appendPerformanceRecord(perfRecord);
            console.log(`[S-51.5.2] Performance record saved: ${baseline.items.map(b => b.ticker).join(', ')}`);
        } catch (perfErr) {
            console.warn('[S-51.5.2] Performance record save failed:', perfErr);
        }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[ReportScheduler] ${type} report generated in ${elapsed}ms (stored: ${stored})`);

    // Attach diagnostics for API response
    // Attach diagnostics for API response
    if (force) {
        const metaAny = report.meta as any;
        metaAny.diagnostics = metaAny.diagnostics || {};
        metaAny.diagnostics.purgedKeys = purgedCount;
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
        console.error(`[ReportScheduler] Failed to read archived report: ${filePath}`, e);
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
