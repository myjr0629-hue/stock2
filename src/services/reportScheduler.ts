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
import { fetchMassive, RunBudget, fetchTopGainers, fetchNewsForSentiment, fetchRelatedTickers } from "@/services/massiveClient";
import { enrichTop3Candidates, generateTop3WHY, getVelocitySymbol, EnrichedCandidate } from './top3Enrichment';
import { generateContinuationReport, ContinuationReport } from './continuationEngine';
import { generateReportDiff } from './reportDiff'; // [S-56.1] Decision Continuity
import { applyUniversePolicy, applyUniversePolicyWithBackfill, buildLeadersTrack, getMacroSSOT, validateNoETFInItems, loadStockUniversePool } from './universePolicy'; // [S-56.2] + [S-56.3]
import { applyQualityTiers, selectTop3, determineRegime, computePowerMeta, computeQualityTier, selectFinalList } from './powerEngine'; // [S-56.4]
import { BUILD_PIPELINE_VERSION, orchestrateGemsEngine } from '../engine/reportOrchestrator'; // [S-56.4.5c]
import { GuardianDataHub } from './guardian/unifiedDataStream'; // [Phase 4]
import { GuardianSignal } from './powerEngine'; // [Phase 4]
import crypto from 'crypto';

// [P0] Fixed 3-report schedule + morning for legacy + [Phase 37] 3-Stage Protocol
export type ReportType = 'eod' | 'pre' | 'open' | 'morning' | 'draft' | 'revised' | 'final';

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
    items: any[]; // [vNext] Unified Terminal items (Main Corps)
    hunters?: any[]; // [V3.7.2] Hunter Corps (Hyper Discovery)
    // TODO: Add report sections 1-10 integration
}

const REPORTS_DIR = path.join(process.cwd(), 'snapshots', 'reports');
const REPORT_VERSION = "S-56.4.6e";

// [P0] Schedule definitions (ET time) - 3 fixed reports
export const REPORT_SCHEDULES: Record<ReportType, { hour: number; minute: number; description: string; labelKR: string }> = {
    'eod': { hour: 16, minute: 30, description: 'EOD Final Report', labelKR: '장마감 후 확정' },
    'pre': { hour: 6, minute: 30, description: 'Premarket +2h', labelKR: '프리마켓 후 2시간' },
    'open': { hour: 9, minute: 0, description: 'Open -30m', labelKR: '본장 30분 전' },
    'morning': { hour: 8, minute: 0, description: 'Morning Brief', labelKR: '장전 브리핑 (레거시)' },
    'draft': { hour: 16, minute: 10, description: 'Draft Report', labelKR: '초안 생성 (장마감)' },
    'revised': { hour: 6, minute: 0, description: 'Audit Report', labelKR: '감사 및 수정 (프리장)' },
    'final': { hour: 9, minute: 0, description: 'Final Order', labelKR: '최종 확정 (본장 전)' }
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

export async function generateReport(type: ReportType, force: boolean = false, targetDateOverride?: string): Promise<PremiumReport> {
    console.log(`[ReportScheduler] Generating ${type} report (Phase 37 3-Stage Protocol)...`);
    const startTime = Date.now();
    const marketDate = targetDateOverride || getMarketDate();

    // 1. Fetch Global Context
    const [macro, events, policy, news, guardian] = await Promise.all([
        getMacroSnapshotSSOT(),
        Promise.resolve(getEventHubSnapshot()),
        Promise.resolve(getPolicyHubSnapshot()),
        getNewsHubSnapshot(),
        GuardianDataHub.getGuardianSnapshot(force) // [Phase 4] Logic Injection
    ]);

    // [FED API] - Integrator
    const fedData = await getFedSnapshot();
    if (macro) {
        // @ts-ignore - Dynamic property injection
        macro.fed = fedData;
    }

    const now = new Date();
    // Note: To avoid huge diff, we keep existing logic and just pass 'guardian' later
    const sessionInfo = determineSessionInfo(now);
    const badgeMap: Record<string, 'regular' | 'pre' | 'post'> = {
        'REG': 'regular', 'PRE': 'pre', 'POST': 'post', 'CLOSED': 'regular'
    };
    const sessionParam = badgeMap[sessionInfo.badge] || 'regular';
    const { enrichTerminalItems } = await import('./terminalEnricher');

    let candidateTickers: string[] = [];
    let discoveryTickers: string[] = []; // [V3.7.2] Track source
    let enrichedItems: any[] = [];

    // === STAGE LOGIC ===
    if (type === 'revised') { // STAGE 2: AUDIT
        console.log(`[ReportScheduler] Stage 2: Auditing DRAFT...`);
        const draft = await getArchivedReport(marketDate, 'draft') || await getArchivedReport(marketDate, 'eod');
        if (!draft) throw new Error(`Audit Failed: No DRAFT found for ${marketDate}`);

        // Re-verify tickers
        const draftTickers = draft.items.map((i: any) => i.ticker);
        // [V3.7.2] Recover Discovery Tickers from Draft
        if (draft.hunters) {
            const hunterTickers = draft.hunters.map((h: any) => h.ticker);
            discoveryTickers = [...hunterTickers];
            // Merge if not present (should be separate in draft, but for enrichment we need all)
            // Actually draftTickers usually only contains 'items'. We need to fetch hunters too if we want to audit them.
            // But for 'revised', we might just focus on Main Corps audit?
            // User policy: "Tactical Segregation". We should valid both.
            draftTickers.push(...hunterTickers);
        }

        const rawAuditItems = await enrichTerminalItems(draftTickers, sessionParam, true, targetDateOverride); // Force fresh

        // [INTEGRITY GATE] Drop items with invalid price ($0.00)
        const auditItems = rawAuditItems.filter(item => {
            const price = item.evidence?.price?.last || 0;
            if (price <= 0) {
                console.warn(`[Integrity] Dropping ${item.ticker}: Invalid Price ($${price.toFixed(2)})`);
                return false;
            }
            return true;
        });

        // Filter Drops (> 5% Gap Down)
        enrichedItems = auditItems.filter(item => {
            const change = item.evidence?.price?.changePct || 0;
            if (change < -5.0) {
                console.warn(`[Audit] Dropping ${item.ticker} (Crash: ${change}%)`);
                return false;
            }
            return true;
        });

    } else if (type === 'final') { // STAGE 3: LOCK (Zero-Defect Policy)
        console.log(`[ReportScheduler] Stage 3: Finalizing REVISED with Strict Integrity...`);
        const revised = await getArchivedReport(marketDate, 'revised') || await getArchivedReport(marketDate, 'pre') || await getArchivedReport(marketDate, 'draft');
        if (!revised) throw new Error(`Finalize Failed: No Prior Report for ${marketDate}`);

        const finalTickers = revised.items.map((i: any) => i.ticker);
        // [V3.7.2] Recover Hunters
        if (revised.hunters) {
            const hunterTickers = revised.hunters.map((h: any) => h.ticker);
            discoveryTickers = [...hunterTickers];
            finalTickers.push(...hunterTickers);
        }

        // [Zero-Defect] Completion Loop (Maximum Effort)
        let attempts = 0;
        let finalItems: any[] = [];
        const MAX_RETRIES = 5; // Extended to 5
        const RETRY_DELAY_MS = 5000;

        while (attempts < MAX_RETRIES) {
            console.log(`[ReportScheduler] Zero-Defect Fetch Attempt ${attempts + 1}/${MAX_RETRIES}...`);
            const rawFinalItems = await enrichTerminalItems(finalTickers, sessionParam, true, targetDateOverride);

            // [INTEGRITY GATE] Drop items with invalid price ($0.00)
            const validPriceItems = rawFinalItems.filter(item => {
                const price = item.evidence?.price?.last || 0;
                if (price <= 0) {
                    console.warn(`[Integrity] Dropping ${item.ticker}: Invalid Price ($${price.toFixed(2)})`);
                    return false;
                }
                return true;
            });

            // [COMPLETENESS GATE] Top Candidates must have Ops/Flow
            // We check if the resulting list is "good enough" (all items complete)
            const incompleteCount = validPriceItems.filter(i => !i.complete).length;

            if (incompleteCount === 0) {
                console.log(`[ReportScheduler] Zero-Defect Achieved. All ${validPriceItems.length} items complete.`);
                finalItems = validPriceItems;
                break;
            } else {
                console.warn(`[ReportScheduler] Attempt ${attempts + 1} Failed: ${incompleteCount} items incomplete.`);
                if (attempts === MAX_RETRIES - 1) {
                    console.warn(`[ReportScheduler] Maximum Effort Exhausted. Keeping ${incompleteCount} incomplete items (Natural Scoring).`);
                    // [Policy Update] Do NOT drop. We tried our best.
                    finalItems = validPriceItems;
                } else {
                    console.log(`[ReportScheduler] Waiting ${RETRY_DELAY_MS}ms for data propagation...`);
                    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
                }
            }
            attempts++;
        }

        if (finalItems.length === 0) throw new Error("[ReportScheduler] Zero-Defect Failure: No valid items remaining after retries.");

        // Lock Logic: Risk-Adjusted Entry Bands (v3.7.1 Dual-Mode)
        // [V3.7.2] Apply Role Persistence to Enriched Items (since we re-fetched)
        enrichedItems = finalItems.map(item => {
            // Recover Role from discoveryTickers
            if (discoveryTickers.includes(item.ticker)) item.tacticalRole = 'HUNTER';
            else item.tacticalRole = 'MAIN';

            const pre = item.evidence?.price?.last || 0;
            const close = item.evidence?.price?.prevClose || pre;
            const vwap = item.evidence?.price?.vwap || 0;
            const putFloor = item.evidence?.options?.putFloor || 0;
            const callWall = item.evidence?.options?.callWall || 0;

            // [V3.7.2] Tri-Mode Entry Strategy (Field Mastery)
            // Mode A (Defense): Default. Wait for Put Floor.
            // Mode B (Breach): Price > Call Wall. Wall becomes Support.
            // Mode C (Dynamic): Price > VWAP & High Vol. Ride the Tape.

            let entryMin = Math.min(pre, close);
            let entryMax = Math.max(pre, close) * 1.002;
            let cutPrice = entryMin * 0.95; // Default 5% stop

            const isBreakout = callWall > 0 && pre > (callWall * 1.01);
            const isTapeMomentum = vwap > 0 && pre > vwap && (item.evidence?.flow?.relVol || 0) > 3.0;

            if (isBreakout) {
                // [Mode B] Breakout Surfing
                entryMin = callWall;
                entryMax = callWall * 1.03;
                cutPrice = callWall * 0.98; // Tight stop below wall
            } else if (isTapeMomentum) {
                // [Mode C] Dynamic Strike (VWAP Support)
                // "Don't wait for structural floor if the tape is flying."
                entryMin = vwap;
                entryMax = pre; // Buy pullbacks to VWAP
                cutPrice = vwap * 0.98; // Stop if VWAP fails
            } else if (putFloor > 0 && putFloor < pre) {
                // [Mode A] Defense (Structural Floor)
                entryMin = putFloor;
                entryMax = putFloor * 1.03;
                cutPrice = putFloor * 0.99; // Hard Stop below floor
            }

            return {
                ...item,
                decisionSSOT: {
                    ...item.decisionSSOT,
                    entryBand: [Number(entryMin.toFixed(2)), Number(entryMax.toFixed(2))],
                    cutPrice: Number(cutPrice.toFixed(2)),
                    isLocked: true // [Phase 37] Lock Flag
                }
            };
        });

    } else {
        // STAGE 1: DRAFT (Standard Universe Selection)
        // Convert string[] pool to objects for policy function
        const universePoolStrings = await loadStockUniversePool();
        candidateTickers = universePoolStrings;

        // [Continuity Protocol] Inject Previous Leaders
        // Ensure "King of the Hill" persistence
        try {
            // Calculate previous date manually since getMarketDate doesn't accept args
            const yesterday = new Date(Date.now() - 86400000);
            const yyyy = yesterday.getFullYear();
            const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
            const dd = String(yesterday.getDate()).padStart(2, '0');
            const yesterdayStr = `${yyyy}-${mm}-${dd}`;

            const prevFinal = await getArchivedReport(getMarketDate(), 'final') || await getArchivedReport(yesterdayStr, 'final');
            const prevMorning = await getArchivedReport(getMarketDate(), 'morning');

            // Prioritize most recent valid report
            // Use safe access and provide default empty string for comparison
            const pmTime = prevMorning?.meta?.generatedAt || '';
            const pfTime = prevFinal?.meta?.generatedAt || '';

            const continuitySource = (pmTime > pfTime) ? prevMorning : prevFinal;

            if (continuitySource?.items) {
                // Get Top 3 from previous run
                const leaders = continuitySource.items
                    .sort((a: any, b: any) => (a.rank || 99) - (b.rank || 99))
                    .slice(0, 3)
                    .map((i: any) => i.ticker);

                if (leaders.length > 0) {
                    console.log(`[Continuity] Injecting previous leaders: ${leaders.join(', ')}`);
                    // Merge unique
                    candidateTickers = Array.from(new Set([...candidateTickers, ...leaders]));
                }
            }
        } catch (e) {
            console.warn('[Continuity] Failed to load previous context:', e);
        }

        const universePoolObjects = candidateTickers.map(s => ({ ticker: s }));

        // [V3.0] INTEGRATION: Use ALL ~300 tickers (filtered not ETF)
        // Do NOT use .final (which cuts to 12). Use .filtered.
        const universeResult = await applyUniversePolicyWithBackfill(universePoolObjects, 300); // Target 300 to get full list
        candidateTickers = universeResult.filtered.map(i => i.ticker);

        // [V3.7.2] Infinite Horizon: High Quality Hyper-Discovery
        // "Quality over Quantity." - User Mandate
        if (process.env.ENABLE_HYPER_DISCOVERY !== '0') {
            const gainers = await fetchTopGainers();

            // [Policy Correction] Reverted Low Price Strategy.
            // User Feedback: "Penny stocks have inherent defects."
            // We strictly ignore anything below $5.0.
            const validGainers = gainers.filter((g: any) => {
                const price = g.day?.c || g.min?.c || g.prevDay?.c || 0;
                // [Quality] Hard Floor $5.0. Marginable and generally safer.
                return price >= 5.0 && !candidateTickers.includes(g.ticker);
            }).map((g: any) => g.ticker);

            if (validGainers.length > 0) {
                // [Optimization] Take Top 20 Gainers instead of all to save budget, but ensure we get the best.
                const topGainers = validGainers.slice(0, 20);
                console.log(`[ReportScheduler] Infinite Horizon: Injected ${topGainers.length} Gainers (e.g. ${topGainers.slice(0, 3).join(', ')})`);

                discoveryTickers = topGainers; // [V3.7.2] Mark as Discovery
                candidateTickers = [...candidateTickers, ...topGainers];
            }
        }

        console.log(`[ReportScheduler] Universe: ${candidateTickers.length} items (Full Scan + Discovery)`);
        const rawItems = await enrichTerminalItems(candidateTickers, sessionParam, force);

        // [V3.7.2] Assign Tactical Roles
        rawItems.forEach(item => {
            if (discoveryTickers.includes(item.ticker)) {
                item.tacticalRole = 'HUNTER';
            } else {
                item.tacticalRole = 'MAIN';
            }
        });

        // [INTEGRITY GATE] Drop items with invalid price ($0.00)
        enrichedItems = rawItems.filter(item => {
            const price = item.evidence?.price?.last || 0;
            if (price <= 0) {
                console.warn(`[Integrity] Dropping ${item.ticker}: Invalid Price ($${price.toFixed(2)})`);
                return false;
            }
            return true;
        });
        console.log(`[Integrity] Qualified Items: ${enrichedItems.length}/${rawItems.length}`);
    }

    return generateReportFromItems(type, enrichedItems, force, marketDate, macro, events, policy, news, guardian);
}

// [Phase 37] Shared Logic for Report Assembly (from enriched items)
async function generateReportFromItems(
    type: ReportType,
    enrichedItems: any[],
    force: boolean,
    marketDate: string,
    macro?: any, events?: any, policy?: any, news?: any,
    guardian?: any // [Phase 4]
): Promise<PremiumReport> {

    const startTime = Date.now();
    if (!macro) macro = await getMacroSnapshotSSOT();
    if (!events) events = getEventHubSnapshot();
    if (!policy) policy = getPolicyHubSnapshot();
    if (!news) news = await getNewsHubSnapshot();
    if (!guardian) guardian = await GuardianDataHub.getGuardianSnapshot(force); // Fetch if missing

    const now = new Date();
    // Re-determine session for context
    const sessionInfo = determineSessionInfo(now);
    const badgeMap: Record<string, 'regular' | 'pre' | 'post'> = {
        'REG': 'regular', 'PRE': 'pre', 'POST': 'post', 'CLOSED': 'regular'
    };
    const sessionParam = badgeMap[sessionInfo.badge] || 'regular';

    // [Phase 15.3] Robust History Backfill Logic
    function getPreviousBusinessDay(dateStr: string): string {
        const d = new Date(dateStr);
        let day = d.getDay();
        // If Mon(1) -> Fri(-3), Sun(0) -> Fri(-2), Sat(6) -> Fri(-1)
        // Others -> -1
        let sub = 1;
        if (day === 1) sub = 3; // Monday -> Friday
        else if (day === 0) sub = 2; // Sunday -> Friday
        else if (day === 6) sub = 1; // Saturday -> Friday

        d.setDate(d.getDate() - sub);
        return d.toISOString().split('T')[0];
    }

    // Try to get T-1
    let tMinus1Date = getPreviousBusinessDay(marketDate);
    let yesterdayReport = await getYesterdayReport(type, tMinus1Date);

    // If not found, try one more day back (just in case of holiday or gap)
    if (!yesterdayReport) {
        console.log(`[ReportScheduler] T-1 Report missing for ${tMinus1Date}, trying T-2 as fallback...`);
        const fallbackDate = getPreviousBusinessDay(tMinus1Date);
        yesterdayReport = await getYesterdayReport(type, fallbackDate);
        if (yesterdayReport) tMinus1Date = fallbackDate;
    }

    // Try to get T-2 (relative to T-1)
    // If we didn't find T-1, we assume T-2 is likely missing or we skip momentum
    let tMinus2Report = null;
    let tMinus2Date = null;

    if (yesterdayReport) {
        // Safe to calculate T-2
        tMinus2Date = getPreviousBusinessDay(tMinus1Date);
        tMinus2Report = await getYesterdayReport(type, tMinus2Date);
    }

    console.log(`[ReportScheduler] History Context: T-1=${tMinus1Date} (${yesterdayReport ? 'OK' : 'MISSING'}), T-2=${tMinus2Date} (${tMinus2Report ? 'OK' : 'MISSING'})`);

    // Build History Map
    const prevSymbols = new Set<string>();
    const historyMap: Record<string, any> = {};
    if (yesterdayReport?.items) {
        yesterdayReport.items.forEach((i: any) => {
            const sym = i.ticker || i.symbol;
            prevSymbols.add(sym);
            if (!historyMap[sym]) historyMap[sym] = {};
            historyMap[sym].tMinus1 = {
                score: i.alphaScore || i.powerScore || 0,
                vol: i.evidence?.flow?.vol || 0
            };
        });
    }
    if (tMinus2Report?.items) {
        tMinus2Report.items.forEach((i: any) => {
            const sym = i.ticker || i.symbol;
            if (!historyMap[sym]) historyMap[sym] = {};
            historyMap[sym].tMinus2 = {
                score: i.alphaScore || i.powerScore || 0,
                vol: i.evidence?.flow?.vol || 0
            };
        });
    }

    // [Phase 4] Construct Guardian Signal
    // [V3.0] Extract Target Sector
    const targetSectorId = guardian?.verdictTargetId || null;

    const guardianSignal: GuardianSignal | undefined = guardian ? {
        marketStatus: guardian.marketStatus,
        divCaseId: guardian.divergence?.caseId || 'N',
        divScore: guardian.divergence?.score || 0
    } : undefined;

    const scoredItems = applyQualityTiers(enrichedItems, prevSymbols, new Set(), historyMap, guardianSignal, targetSectorId);

    // [V3.5] REFINEMENT LOOP (Sentiment + Sympathy)
    // 1. Initial Scoring (Already done: scoredItems)
    // 2. Identify provisional leaders to check cost-heavy API
    const provisionalSorted = [...scoredItems].sort((a, b) => b.powerScore - a.powerScore);
    const provisionalTop3 = provisionalSorted.slice(0, 3);
    const provisionalLeader = provisionalTop3[0];

    const sentimentMap: Record<string, 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'> = {};
    const sympathySet = new Set<string>();

    if (provisionalTop3.length > 0) {
        console.log(`[ReportScheduler] V3.5 Refinement: Check Sentiment for Top ${provisionalTop3.length}, Sympathy for ${provisionalLeader?.ticker}`);

        // A. Sentiment Gate (Top 3 Candidates)
        await Promise.all(provisionalTop3.map(async (item) => {
            if (item.complete) {
                const sentiment = await fetchNewsForSentiment(item.ticker);
                if (sentiment !== 'UNKNOWN') {
                    sentimentMap[item.ticker] = sentiment;
                    console.log(`[V3.5] Sentiment for ${item.ticker}: ${sentiment}`);
                }
            }
        }));

        // B. Sympathy Hunter (Leader Only)
        if (provisionalLeader) {
            const related = await fetchRelatedTickers(provisionalLeader.ticker);
            related.forEach(r => sympathySet.add(r));
            if (related.length > 0) console.log(`[V3.5] Sympathy Targets for ${provisionalLeader.ticker}: ${related.length} found`);
        }
    }

    // 3. Re-Score with V3.5 Context
    // We only re-apply if we have new data, but safe to always run to be sure
    const refinedItems = applyQualityTiers(enrichedItems, prevSymbols, new Set(), historyMap, guardianSignal, targetSectorId, sentimentMap, sympathySet);

    // [V3.7.3] FORENSIC SNIPER PROTOCOL (God Mode: All Candidates)
    // Identify Top Candidates and run Deep Forensic Analysis BEFORE final selection copy
    const { ForensicService } = await import('./forensicService');
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(10); // Batch of 10 for speed

    // God Mode: Analyze ALL refined items (to catch hidden whales in Watch list)
    // We filter for completeness just to be safe
    const targetCandidates = refinedItems.filter(i => i.complete);

    if (targetCandidates.length > 0) {
        console.log(`[ReportScheduler] 🔫 God Mode Activated: Analyzing ${targetCandidates.length} Targets (Full Scan)...`);

        // Concurrent Analysis with Limit
        await Promise.all(targetCandidates.map((item) => limit(async () => {
            const forensicResult = await ForensicService.analyzeTarget(item.ticker);

            // Inject into SSOT
            if (!item.decisionSSOT) item.decisionSSOT = {};
            item.decisionSSOT.whaleIndex = forensicResult.whaleIndex;
            item.decisionSSOT.whaleConfidence = forensicResult.whaleConfidence;

            // [V3.7.3] PRECISION PROTOCOL: Guaranteed Data (No more $-)
            const currentPrice = item.evidence?.price?.last || item.price || 0;
            const callWall = item.evidence?.options?.callWall || 0;
            const putFloor = item.evidence?.options?.putFloor || 0;

            let wEntry = forensicResult.details.whaleEntryLevel || currentPrice;
            // Fallback: If 0, use current price
            if (wEntry === 0) wEntry = currentPrice;

            // 1. Calculate Levels (Whale Priority -> Technical Fallback)
            let wTarget = forensicResult.details.whaleTargetLevel;
            if (!wTarget || wTarget === 0) {
                // Fallback Target: Call Wall or +3% (Day Trade)
                wTarget = (callWall > wEntry) ? callWall : (wEntry * 1.03);
            }

            let wStop = forensicResult.details.whaleStopLevel;
            if (!wStop || wStop === 0) {
                // Fallback Stop: Put Floor or -2% (Tight Stop)
                // If PutFloor is too far away (>5%), use -2%
                const floorDist = (wEntry - putFloor) / wEntry;
                if (putFloor > 0 && floorDist < 0.05) wStop = putFloor;
                else wStop = wEntry * 0.98;
            }

            // 2. Inject Prices
            const finalWTarget = wTarget || (wEntry * 1.03);
            const finalWStop = wStop || (wEntry * 0.98);

            item.decisionSSOT.whaleEntryLevel = wEntry;
            item.decisionSSOT.whaleTargetLevel = finalWTarget;
            item.decisionSSOT.targetPrice = Number(finalWTarget.toFixed(2));
            item.decisionSSOT.cutPrice = Number(finalWStop.toFixed(2));
            item.decisionSSOT.dominantContract = forensicResult.details.dominantContract;

            // Entry Band: +/- 0.5% of Entry
            item.decisionSSOT.entryBand = [
                Number((wEntry * 0.995).toFixed(2)),
                Number((wEntry * 1.005).toFixed(2))
            ];

            // 3. Generate Whale Narrative (whaleReasonKR) with High-Fidelity Observation
            const details = forensicResult.details;
            let narrative = "";

            // Priority 1: Whale Block Action (Snippet)
            if (details.dominantContract && details.blockCount > 0) {
                const k = (details.maxBlockSize / 1000).toFixed(0) + 'k';
                const ratio = Math.round(details.aggressorRatio * 100);
                narrative = `${details.dominantContract} ${details.blockCount}건($${k}) ${ratio}% 집중매집 관측.`;
            }
            // Priority 2: Gamma Squeeze Flag (Engine)
            else if (item.decisionSSOT?.triggersKR?.includes('GAMMA_SQUEEZE')) {
                narrative = `콜 옵션 쏠림(Gamma Squeeze) 감지. 급등 주의.`;
            }
            // Priority 3: Large Net Flow
            else if (item.evidence?.flow?.netFlow && Math.abs(item.evidence.flow.netFlow) > 2000000) {
                const flowM = (item.evidence.flow.netFlow / 1000000).toFixed(1) + 'M';
                const dir = item.evidence.flow.netFlow > 0 ? "순매수" : "순매도";
                narrative = `기관 ${dir} $${flowM} 대규모 유입 포착.`;
            }
            // Priority 4: Relative Volume Spike
            else if ((item.evidence?.flow?.relVol || 0) > 1.5) {
                narrative = `평소 대비 거래량 ${(item.evidence?.flow?.relVol || 0).toFixed(1)}배 폭증. 변동성 확대 국면.`;
            }
            // Priority 5: Structural Observation (Wall Proximity)
            else if (callWall > 0 && currentPrice >= callWall * 0.98) {
                narrative = `주요 저항벽($${callWall}) 돌파 시도 중. 구조적 분기점.`;
            }
            // Priority 6: Trend Observation
            else {
                const trend = (item.evidence?.price?.changePct || 0) > 0 ? "상승" : "조정";
                narrative = `기술적 ${trend} 흐름 지속. 특이 거래량 부재, 관망 필요.`;
            }

            item.decisionSSOT.whaleReasonKR = narrative;


            // 4. Mark as Whale Driven if Index High
            if (forensicResult.whaleIndex >= 85) {
                console.log(`[ReportScheduler] 🐋 WHALE SIGHTED: ${item.ticker} (Index: ${forensicResult.whaleIndex})`);
                if (!item.decisionSSOT.triggersKR) item.decisionSSOT.triggersKR = [];
                if (!item.decisionSSOT.triggersKR.includes('WHALE_IN_SIGHT')) {
                    item.decisionSSOT.triggersKR.push('WHALE_IN_SIGHT');
                }
            }
        })));
    } else {
        // empty
    }

    // 4. Final Selection (Tactical Segregation)

    // [V3.7.2] Split Main vs Hunter
    const mainPool = refinedItems.filter(i => i.tacticalRole !== 'HUNTER'); // Default to Main
    const hunterPool = refinedItems.filter(i => i.tacticalRole === 'HUNTER');

    // A. Main Corps: Use SelectFinalList (but strictly for Main items)
    // We pass mainPool to selectFinalList. 
    // NOTE: selectFinalList expects to fill 12 slots. 
    // Since we are segregating, we might want 'Top 10' or 'Top 12' pure main.
    // The original logic was 10 + 2 Discovery. 
    // Now we want purely Main in the 'FINAL' list?
    // User Update: "Main Corps... FINAL BATTLE"
    // Let's force selectFinalList to just act as a sorter/limiter or implement custom logic?
    // Simplest: Use selectFinalList but with only main items. It will try to fill 12 from Main.
    const mainSelected = selectFinalList(mainPool);

    // B. Hunter Corps: Top Momentum from Hunter Pool
    // Sort by Relative Volume (Momentum)
    const huntersSelected = [...hunterPool].sort((a, b) => (b.evidence?.flow?.relVol || 0) - (a.evidence?.flow?.relVol || 0)).slice(0, 20);

    // [V3.7.2 Diag] Log pool sizes
    console.log(`[TacticalSeg] mainPool: ${mainPool.length}, hunterPool: ${hunterPool.length}, huntersSelected: ${huntersSelected.length}`);
    if (huntersSelected.length > 0) {
        console.log(`[TacticalSeg] Sample Hunter: ${huntersSelected[0].ticker} (RVol: ${huntersSelected[0].evidence?.flow?.relVol?.toFixed(2)})`);
    }

    const final12 = mainSelected; // Main Corps takes the semantic "items" slot

    const regimeResult = determineRegime(macro);
    const { top3: selectedTop3, stats } = selectTop3(final12, [], regimeResult.regime);

    const finalItems = final12.map((item, idx) => ({
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

    const finalHunters = huntersSelected.map((item, idx) => ({
        ...item,
        rank: idx + 1, // Hunter Rank
        symbol: item.ticker, // Legacy
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
        hunters: finalHunters, // [V3.7.2]
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

export async function getLatestReport(type: ReportType): Promise<PremiumReport | null> {
    try {
        // [V3.7.2 FIX] Use reportStore.loadLatest() which handles Redis on Vercel
        const { loadLatest } = await import('@/lib/storage/reportStore');
        const report = await loadLatest(type);
        if (report) return report as PremiumReport;
    } catch (error) {
        console.error(`[getLatestReport] Failed to load report from store:`, error);
    }

    try {
        // Fallback to local FS for development
        const archives = listArchivedReports();
        for (const archive of archives) {
            if (archive.types.includes(type)) {
                return getArchivedReport(archive.date, type);
            }
        }
    } catch (e) {
        console.warn("[getLatestReport] Local FS fallback failed (expected on Vercel)");
    }

    return null;
}

// [S-56.5.1] Global Latest Report Resolver
// Solves priority issue where an old "Morning" report shadows a new "EOD" report.
export async function getGlobalLatestReport(): Promise<PremiumReport | null> {
    const TYPES: ReportType[] = ['morning', 'pre', 'open', 'draft', 'final', 'eod', 'revised'];
    let candidates: PremiumReport[] = [];

    // Parallel fetch for speed
    await Promise.all(TYPES.map(async (t) => {
        try {
            const r = await getLatestReport(t);
            if (r) candidates.push(r);
        } catch (e) { }
    }));

    if (candidates.length === 0) return null;

    // Sort by generatedAtET (descending)
    candidates.sort((a, b) => {
        const timeA = new Date(a.meta?.generatedAtET || 0).getTime();
        const timeB = new Date(b.meta?.generatedAtET || 0).getTime();
        return timeB - timeA;
    });

    return candidates[0];
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
