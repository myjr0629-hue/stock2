
import { getTier01Data, getMacroData, getOptionsData, setStatusCallback, getUniverseCandidates, getMarketStatus } from '../src/services/stockApi';
import { validateGemsData, validateGemsMeta } from '../src/engine/validator';
import { buildDeterministicReport } from '../src/engine/reportBuilder';
import { normalizeGemsSnapshot, analyzeGemsTicker } from '../src/services/stockTypes';
import { calculateTPG, getTPGScoreAdjustment, TPGResult } from '../src/engine/tpgEngine';
import { loadTrackerState, saveTrackerState, generateChangelog, updateTimeStopPressure, formatChangelogForReport, TrackerState } from '../src/engine/changelogEngine';
import { createTop3Snapshot, addSnapshotToTracker } from '../src/engine/performanceTracker';
import { generateReportDiff } from '../src/services/reportDiff';
import { applyUniversePolicy, applyUniversePolicyWithBackfill, buildLeadersTrack, getMacroSSOT, validateNoETFInItems, loadStockUniversePool, backfillToTarget, UniversePolicy, UniverseStats, LeadersTrack, MacroSSOT, ExtendedUniversePolicy } from '../src/services/universePolicy';
import { applyQualityTiers, selectTop3, determineRegime, computePowerMeta } from '../src/services/powerEngine';
import { PowerMeta } from '../src/services/engineConfig';
import { fetchMassive, CACHE_POLICY } from '../src/services/massiveClient';
import { orchestrateGemsEngine, BUILD_PIPELINE_VERSION } from '../src/engine/reportOrchestrator';
import * as fs from 'fs';
import * as path from 'path';

// --- CONFIGURATION ---
const MAX_ROUNDS = parseInt(process.env.MAX_ROUNDS || "20");
const ROUND_SLEEP_MS = parseInt(process.env.ROUND_SLEEP_MS || "20000");
const PER_TICKER_RETRY = parseInt(process.env.PER_TICKER_RETRY || "2");
const BACKFILL_ONLY_PENDING = process.env.BACKFILL_ONLY_PENDING !== "0";

const ENGINE_VERSION = "V9.0-TPGEngine";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- ASYNC STATUS IPC ---
const statusPath = path.join(process.cwd(), 'snapshots', 'report_state.json');

function updateStatus(update: any) {
    try {
        let current: any = {};
        if (fs.existsSync(statusPath)) {
            current = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
        }

        // S-30: Deep merge progress
        const nextProgress = {
            ...(current.progress || {}),
            ...(update.progress || {})
        };

        // ENFORCE SCHEMA: Discard any root keys not explicitly allowed
        const ALLOWED_ROOT_KEYS = [
            'status', 'step', 'runId', 'startedAt', 'updatedAt',
            'lastEndpoint', 'lastHttpStatus', 'lastError', 'progress', 'summary'
        ];

        const rawState: any = {
            ...current,
            ...update,
            progress: nextProgress,
            updatedAt: Date.now()
        };

        const filteredState: any = {};
        ALLOWED_ROOT_KEYS.forEach(key => {
            if (rawState[key] !== undefined) filteredState[key] = rawState[key];
        });

        fs.writeFileSync(statusPath, JSON.stringify(filteredState, null, 2));
    } catch (e) {
        console.error("[Status IPC Error]", (e as Error).message);
    }
}

/**
 * CONCURRENCY LIMITER: Hand-rolled queue to prevent API spikes.
 */
async function limitConcurrency<T>(items: any[], fn: (item: any) => Promise<T>, limit: number): Promise<T[]> {
    const results: T[] = [];
    const executing: Promise<any>[] = [];
    for (const item of items) {
        const p = Promise.resolve().then(() => fn(item));
        results.push(p as unknown as T);
        if (limit <= items.length) {
            const e: Promise<any> = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= limit) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(results);
}

/**
 * ATM Option Chain Fetcher: Captures contracts near the current price.
 */
async function fetchOptionChainATM(symbol: string, currentPrice: number) {
    try {
        const endpoint = `/v3/snapshot/options/${symbol}?limit=250`;
        const data = await fetchMassive(endpoint, {}, true, undefined, CACHE_POLICY.REPORT_GEN);

        if (!data.results) return [];

        // 1. Find nearest 1~2 expirations
        const expiries = [...new Set(data.results.map((r: any) => r.details?.expiration_date || r.expiration_date))]
            .filter(Boolean)
            .sort() as string[];

        const targetExpiries = expiries.slice(0, 2);

        // 2. Define ATM window (±5% or ±$10, whichever larger)
        const windowVal = Math.max(currentPrice * 0.05, 10);
        const low = currentPrice - windowVal;
        const high = currentPrice + windowVal;

        // 3. Filter and Map
        const slice = data.results
            .filter((r: any) => {
                const exp = r.details?.expiration_date || r.expiration_date;
                const strike = r.details?.strike_price || r.strike_price;
                return targetExpiries.includes(exp) && strike >= low && strike <= high;
            })
            .map((r: any) => ({
                expiration_date: r.details?.expiration_date || r.expiration_date,
                strike_price: r.details?.strike_price || r.strike_price,
                contract_type: (r.details?.contract_type || r.contract_type || "call").toLowerCase(),
                ticker: r.details?.ticker || r.ticker,
                implied_volatility: r.greeks?.implied_volatility || null,
                open_interest: Number.isFinite(r.open_interest) ? r.open_interest : null
            }));

        return slice.sort((a: any, b: any) => a.strike_price - b.strike_price);
    } catch (e) {
        console.warn(`[ATM Fetch Error] ${symbol}:`, (e as Error).message);
        return [];
    }
}

// [S-39] Helper to strip ONLY heavy data, NOT raw price fields
function stripData(item: any) {
    const { optionsChain, ...rest } = item;
    return rest;
}

// [S-51.0] Enhanced Selection with TPG Filter, CHANGELOG, TimeStop
interface SelectionResult {
    final12: any[];
    topPicks: string[];
    coreCount: number;
    highRiskCount: number;
    changelog: any[];
    trackerState: TrackerState;
}

async function pickFinal12WithTPG(
    sortedFinal: any[],
    prevTrackerState: TrackerState
): Promise<SelectionResult> {
    // [S-56.4.2] UNBLOCK: Allow candidates even if options not OK (PARTIAL support)
    // alphaScore sorting already penalizes them.
    const ok = sortedFinal; // Use all candidates

    // [S-56.1] Max 3 New Entries Constraint
    // Define "Incumbent" vs "Challenger" (using top3 from tracker as proxy for incumbency)
    const prevItems = prevTrackerState.top3 || []; // Use top3 as incumbent set
    const prevSet = new Set(prevItems);

    // Split OK into Incumbents (Continuity) vs Challengers (New)
    const incumbents = ok.filter((t: any) => prevSet.has(t.ticker || t.symbol));
    const challengers = ok.filter(t => !prevSet.has(t.ticker || t.symbol));

    // Take max 3 challengers
    const allowedChallengers = challengers.slice(0, 3);

    // Combine: Incumbents + Max 3 Challengers
    // Re-sort by alphaScore to let score dictate final order among this pool
    // (Note: Incumbents already received +Alpha Bonus in main loop)
    const pool = [...incumbents, ...allowedChallengers].sort((a, b) => b.alphaScore - a.alphaScore);

    // Use this pool for selection instead of raw 'ok'
    const finalCandidates = pool;

    if (finalCandidates.length < 12) {
        // If we cut too many challengers and don't have enough incumbents, fill back with challengers
        const needed = 12 - finalCandidates.length;
        const extraChallengers = challengers.slice(3, 3 + needed);
        finalCandidates.push(...extraChallengers);
    }

    // Re-sort final pool ensure order
    const selectionPool = finalCandidates.sort((a, b) => b.alphaScore - a.alphaScore);

    if (selectionPool.length < 12) {
        const need = 12 - selectionPool.length;
        const sample = selectionPool.slice(0, 5).map((x: any) => x.ticker || x.symbol).join(",");
        throw new Error(`[S-51] SELECTION_FAIL: Need 12 OK tickers but only ${selectionPool.length}. Missing=${need}. SampleOK=[${sample}]`);
    }

    // [S-51] TPG Gate: Calculate TPG for top candidates
    console.log(`[S-51] Calculating TPG for top ${Math.min(10, selectionPool.length)} candidates...`);

    const tpgResults: Map<string, TPGResult> = new Map();
    const top10Candidates = selectionPool.slice(0, 10);

    for (const t of top10Candidates) {
        const sym = t.ticker || t.symbol;
        try {
            const tpg = await calculateTPG(t, t.vwap || null);
            tpgResults.set(sym, tpg);
            console.log(`[TPG] ${sym}: ${tpg.passed ? '✓' : '✗'} (${tpg.score}/4) - ${tpg.explanation}`);
        } catch (e) {
            console.warn(`[TPG] ${sym}: Error - ${(e as Error).message}`);
            tpgResults.set(sym, {
                passed: false, score: 0,
                gates: { highZone: false, retestRecovery: false, rsRising: false, sectorSync: false },
                retestStatus: 'NO_DATA', rsScore: 0,
                vwapPosition: 'NO_DATA', vwapDistance: 0,
                rsiValue: null, rsiStatus: 'NO_DATA',
                newsShelfLife: 'NO_NEWS',
                explanation: 'TPG 계산 실패',
                whySummary: '데이터 부족 / 리스크: 불확실 / 관망'
            });
        }
    }

    // [S-51] Top3 Selection: TPG 2+ gates OR fallback to top alphaScore
    const tpgPassed = top10Candidates.filter(t => {
        const tpg = tpgResults.get(t.ticker || t.symbol);
        // Also filter out FIRST_BREAK (no chase rule)
        return tpg?.passed && tpg.retestStatus !== 'FIRST_BREAK';
    });

    let top3Candidates: any[];
    if (tpgPassed.length >= 3) {
        // Use TPG-passed candidates
        top3Candidates = tpgPassed.slice(0, 3);
        console.log(`[S-51] Top3 from TPG-passed candidates: ${top3Candidates.map((t: any) => t.ticker || t.symbol).join(', ')}`);
    } else {
        // Fallback: top alphaScore but warn
        top3Candidates = ok.slice(0, 3);
        console.warn(`[S-51] TPG candidates insufficient (${tpgPassed.length}/3), using alphaScore fallback`);
    }

    const top3 = top3Candidates.map((t: any, idx: number) => {
        const tpg = tpgResults.get(t.ticker || t.symbol);
        return {
            ...t,
            role: "ALPHA",
            rank: idx + 1,
            tpgScore: tpg?.score || 0,
            tpgPassed: tpg?.passed || false,
            tpgExplanation: tpg?.explanation || '',
            retestStatus: tpg?.retestStatus || 'NO_DATA',
            rsScore: tpg?.rsScore || 0
        };
    });

    const top3Symbols = new Set(top3.map((t: any) => t.ticker || t.symbol));
    const remaining = ok.filter(t => !top3Symbols.has(t.ticker || t.symbol));

    // HighRisk 2: velocity + volatility + clear hardcut
    const highRisk2 = [...remaining]
        .sort((a, b) => {
            const aVelocity = a.velocity === "▲" ? 2 : a.velocity === "▼" ? 1.5 : 0;
            const bVelocity = b.velocity === "▲" ? 2 : b.velocity === "▼" ? 1.5 : 0;
            const aChange = Math.abs(a.changePercent || 0);
            const bChange = Math.abs(b.changePercent || 0);
            return (bVelocity + bChange) - (aVelocity + aChange);
        })
        .slice(0, 2)
        .map((t) => ({ ...t, role: "HIGH_RISK" }));

    const highRiskSet = new Set(highRisk2.map(t => t.ticker || t.symbol));

    // Core 7: remaining top alphaScore
    const core7 = remaining
        .filter(t => !highRiskSet.has(t.ticker || t.symbol))
        .slice(0, 7)
        .map(t => ({ ...t, role: "CORE" }));

    const final12 = [...top3, ...core7, ...highRisk2].map((t, i) => ({
        ...t,
        rank: i + 1
    }));

    // [S-51] TimeStop Tracking Update
    const newTrackerState: TrackerState = { ...prevTrackerState };
    const newTop3Symbols = top3.map((t: any) => t.ticker || t.symbol);

    for (const t of top3) {
        const sym = t.ticker || t.symbol;
        const volume = t.day?.v || 0;
        const prevVolume = t.prevDay?.v || 1;
        const target1 = t.price * 1.05;  // 5% target

        updateTimeStopPressure(newTrackerState, sym, t.price, volume, prevVolume, target1);
    }

    // Clean up old entries not in Top3
    for (const sym of Object.keys(newTrackerState.timeStopTracker)) {
        if (!newTop3Symbols.includes(sym)) {
            delete newTrackerState.timeStopTracker[sym];
            console.log(`[TimeStop] ${sym}: OUT from Top3, resetting tracker`);
        }
    }

    // [S-51] CHANGELOG Generation
    const changelog = generateChangelog(
        prevTrackerState.top3,
        top3.map((t: any) => ({
            ticker: t.ticker || t.symbol,
            alphaScore: t.alphaScore,
            tpgScore: t.tpgScore,
            tpgExplanation: t.tpgExplanation
        })),
        newTrackerState.timeStopTracker
    );

    newTrackerState.top3 = newTop3Symbols;
    newTrackerState.changelog = changelog;
    newTrackerState.lastReportDate = new Date().toISOString().split('T')[0];

    // Log changelog
    if (changelog.length > 0) {
        console.log(`[CHANGELOG] ${formatChangelogForReport(changelog)}`);
    } else {
        console.log(`[CHANGELOG] No Change (Top3 유지: ${newTop3Symbols.join(', ')})`);
    }

    return {
        final12,
        topPicks: newTop3Symbols,
        coreCount: 10,
        highRiskCount: 2,
        changelog,
        trackerState: newTrackerState
    };
}

// Legacy sync version for fallback
function pickFinal12(sortedFinal: any[]): { final12: any[], topPicks: string[], coreCount: number, highRiskCount: number } {
    const ok = sortedFinal; // [S-56.4.2] UNBLOCK

    if (ok.length < 12) {
        const need = 12 - ok.length;
        const sample = ok.slice(0, 5).map((x: any) => x.ticker || x.symbol).join(",");
        throw new Error(`[S-41] SELECTION_FAIL: Need 12 OK tickers but only ${ok.length}. Missing=${need}. SampleOK=[${sample}]`);
    }

    const top3 = ok.slice(0, 3).map((t: any, idx: number) => ({ ...t, role: "ALPHA", rank: idx + 1 }));
    const remaining = ok.slice(3);
    const highRisk2 = [...remaining]
        .sort((a, b) => {
            const aVel = a.velocity === "▲" ? 2 : a.velocity === "▼" ? 1.5 : 0;
            const bVel = b.velocity === "▲" ? 2 : b.velocity === "▼" ? 1.5 : 0;
            return (bVel + Math.abs(b.changePercent || 0)) - (aVel + Math.abs(a.changePercent || 0));
        })
        .slice(0, 2)
        .map((t) => ({ ...t, role: "HIGH_RISK" }));

    const hrSet = new Set(highRisk2.map(t => t.ticker || t.symbol));
    const core7 = remaining.filter(t => !hrSet.has(t.ticker || t.symbol)).slice(0, 7).map(t => ({ ...t, role: "CORE" }));

    const final12 = [...top3, ...core7, ...highRisk2].map((t, i) => ({ ...t, rank: i + 1 }));
    return { final12, topPicks: top3.map((t: any) => t.ticker || t.symbol), coreCount: 10, highRiskCount: 2 };
}


const engineStartTime = Date.now();

async function generateFinalGemsReport() {
    console.log("=== GEMS ENGINE: INCREMENTAL BACKFILL + ATM SNAPSHOT STARTED ===");

    // Register status callback for deep diagnostics
    setStatusCallback((update) => {
        updateStatus(update);
    });

    const isReportRun = process.env.ALLOW_MASSIVE_FOR_SNAPSHOT === '1';
    const budget: any = isReportRun ? { current: 0, cap: 2000 } : undefined;

    // 0. ET TIME & SLOT DETERMINATION
    const etStr = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
    const etDateObj = new Date(etStr);

    updateStatus({ status: 'RUNNING', step: 'PRICE' });

    const etYear = etDateObj.getFullYear();
    const etMonth = String(etDateObj.getMonth() + 1).padStart(2, '0');
    const etDay = String(etDateObj.getDate()).padStart(2, '0');
    const etHour = etDateObj.getHours();
    const etMin = etDateObj.getMinutes();
    const etSec = etDateObj.getSeconds();

    const etDate = `${etYear}-${etMonth}-${etDay}`;
    const etTimestamp = `${etDate}T${String(etHour).padStart(2, '0')}:${String(etMin).padStart(2, '0')}:${String(etSec).padStart(2, '0')}`;
    const runId = etTimestamp.replace(/[-T:]/g, '').replace(/(\d{8})(\d{6})/, '$1_$2');

    const etFloat = etHour + etMin / 60;

    let slot: "pre2h" | "pre30" | "eod" = "eod";
    if (process.env.SNAPSHOT_SLOT) {
        slot = process.env.SNAPSHOT_SLOT as any;
    } else {
        if (etFloat >= 4.0 && etFloat < 11.5) slot = "pre2h";
        else if (etFloat >= 11.5 && etFloat < 16.5) slot = "pre30";
        else slot = "eod";
    }

    const SSOT_LATEST_PATH = path.join(process.cwd(), 'snapshots', 'latest.json');
    const snapshotsBaseDir = path.join(process.cwd(), 'snapshots');
    const dateDir = path.join(snapshotsBaseDir, etDate);

    if (!fs.existsSync(dateDir)) {
        fs.mkdirSync(dateDir, { recursive: true });
    }

    let baseSnapshot: any = null;
    let macro: any = null;
    let dataBaseline: any = null;

    // [S-41] Fetch market status for holiday detection
    let marketStatus: any = null;
    try {
        marketStatus = await getMarketStatus();
        console.log(`[S-41] Market Status: ${marketStatus.market} / ${marketStatus.session} / Holiday: ${marketStatus.isHoliday ? marketStatus.holidayName : 'No'}`);
    } catch (e: any) {
        console.warn(`[S-41] Market status fetch failed: ${e.message}`);
        marketStatus = { market: "closed", session: "closed", isHoliday: false, serverTime: new Date().toISOString() };
    }

    // 1. Initial Data Acquisition (Macro & Universe Builder)
    try {
        console.log("[1/4] Acquiring Macro & Universe Baseline...");
        updateStatus({ step: 'PAGINATION' });
        macro = await getMacroData();

        const universeCandidates = await getUniverseCandidates(budget);
        dataBaseline = await getTier01Data(true, universeCandidates);

        updateStatus({
            progress: { totalTickers: universeCandidates.length }
        });
    } catch (e: any) {
        console.error("CRITICAL: Failed to acquire initial baseline data.", e.message);
        process.exit(1);
    }

    // Load existing snapshot for context if needed
    try {
        if (fs.existsSync(SSOT_LATEST_PATH)) {
            baseSnapshot = JSON.parse(fs.readFileSync(SSOT_LATEST_PATH, 'utf-8'));
        }
    } catch (e) { }

    // 2. INCREMENTAL BACKFILL / ROUNDS
    for (let round = 1; round <= MAX_ROUNDS; round++) {
        const startTime = Date.now();
        console.log(`\n--- ROUND ${round}/${MAX_ROUNDS} ---`);

        const mergedTickers = (dataBaseline?.tickers || []).map((t: any) => {
            const sym = t.ticker || t.symbol;
            const existing = baseSnapshot?.items?.find((ei: any) => (ei.ticker || ei.symbol) === sym);
            if (existing && existing.v71?.options_status === "OK") {
                return { ...t, v71: existing.v71, options: existing.options, optionsChain: existing.optionsChain };
            }
            return t;
        });

        // [S-38D] Stage 1: Universe Sanitizer (Suffix, Price, Liquidity)
        console.log(`[S-38D] Sanitizing Universe... (Raw: ${mergedTickers.length})`);

        const universeCountRaw = mergedTickers.length;
        const excludedReasons: Record<string, number> = {
            WARRANT_SUFFIX: 0,
            PENNY_FILTER: 0,
            LIQUIDITY_FILTER: 0,
            NO_OPTIONS_LISTED: 0
        };

        const sanitizedTickers = mergedTickers.filter((t: any) => {
            const sym = t.ticker || t.symbol || "";
            // S-38D: Refined Suffix Check.
            // Only block if symbol ends with W/WS/U/R AND it's likely a derivative (e.g., 5+ chars or contains special chars)
            // User rules: endsWith W, WS, U, R OR contains '.', '/', '-'
            const isDerivativeSuffix = (sym.endsWith("W") || sym.endsWith("WS") || sym.endsWith("U") || (sym.endsWith("R") && sym.length > 4));
            const hasSpecialChar = sym.includes(".") || sym.includes("/") || sym.includes("-");

            if (isDerivativeSuffix || hasSpecialChar) {
                excludedReasons.WARRANT_SUFFIX++;
                return false;
            }

            // Price/Liquidity Check - use t.price if GemsTicker, or raw fields
            const price = t.price || t.lastTrade?.p || t.day?.c || t.prevDay?.c || 0;
            const volume = t.day?.v || t.volume || 0;
            const dollarVolume = price * volume;

            if (price < 5.00) {
                excludedReasons.PENNY_FILTER++;
                return false;
            }
            if (dollarVolume < 20000000) {
                excludedReasons.LIQUIDITY_FILTER++;
                return false;
            }
            return true;
        });

        const universeExcludedCount = universeCountRaw - sanitizedTickers.length;
        console.log(`[S-38D] Sanitization Complete. Excluded: ${universeExcludedCount}, Remaining: ${sanitizedTickers.length}`);

        // Stage 1.5: Preliminary Score for Top-K
        const prelimTickers = sanitizedTickers.map((t: any) => analyzeGemsTicker(t, "Neutral"));
        prelimTickers.sort((a: any, b: any) => b.alphaScore - a.alphaScore);

        const TOP_K = parseInt(process.env.TOP_K || "60");
        const heavySymbols = prelimTickers.slice(0, TOP_K).map((t: any) => t.symbol);

        // Stage 2: Heavy Options & Final Scoring
        const finalTickers: any[] = [];
        let okCount = 0;
        let failCount = 0;

        for (let i = 0; i < sanitizedTickers.length; i++) {
            const t = sanitizedTickers[i];
            const isHeavy = heavySymbols.includes(t.ticker || t.symbol);

            try {
                updateStatus({
                    progress: {
                        currentTicker: t.ticker || t.symbol,
                        tickersDone: i,
                        totalTickers: sanitizedTickers.length,
                        round
                    }
                });

                if (!isHeavy) {
                    finalTickers.push(analyzeGemsTicker(t, "Neutral"));
                    continue;
                }

                // If already OK from previous round/snapshot, keep it
                if (t.v71?.options_status === "OK") {
                    finalTickers.push(t);
                    okCount++;
                    continue;
                }

                const spot = t.lastTrade?.p || t.day?.c || t.prevDay?.c || 0;
                const opts = await Promise.race([
                    getOptionsData(t.ticker || t.symbol, spot, budget),
                    new Promise<any>((_, reject) => setTimeout(() => reject(new Error("TIMEOUT_TICKER_OPTIONS")), 60000))
                ]);

                if (opts.options_reason === "NO_OPTIONS_LISTED") {
                    excludedReasons.NO_OPTIONS_LISTED++;
                    continue; // Exclude as requested
                }

                const analyzed = analyzeGemsTicker(t, "Neutral", opts, true);
                // [S-40] analyzeGemsTicker already returns complete detail/mmPos/edge/secret
                finalTickers.push(analyzed);

                if (opts.options_status === "OK") okCount++;
                else failCount++;

            } catch (e: any) {
                failCount++;
                finalTickers.push(analyzeGemsTicker(t, "Neutral"));
            }
        }

        // [S-56.1] Anti-Churn: Apply Score Boost to Maintained Tickers
        // Load yesterday's report to identify continuity candidates
        let prevReport: any = null;
        try {
            const prevReportPath = path.join(process.cwd(), 'snapshots', 'latest.json');
            if (fs.existsSync(prevReportPath)) {
                prevReport = JSON.parse(fs.readFileSync(prevReportPath, 'utf-8'));
            }
        } catch (e) {
            console.warn('[Anti-Churn] Failed to load previous report:', (e as Error).message);
        }
        const prevItems = prevReport?.items || [];
        const prevMap = new Map(prevItems.map((t: any) => [t.symbol || t.ticker, t]));
        console.log(`[Anti-Churn] Loaded prevReport: ${prevItems.length} items. PrevMap keys: ${[...prevMap.keys()].slice(0, 5).join(', ')}...`);

        finalTickers.forEach((t: any) => {
            const sym = t.symbol || t.ticker;
            const prevT: any = prevMap.get(sym);
            if (prevT) {
                const prevAction = prevT.decisionSSOT?.action || prevT.v71?.decisionSSOT?.action || 'EXIT';

                // Eligibility for Bonus:
                // 1. Was MAINTAIN/CAUTION yesterday
                // 2. High Confidence (>= 70)
                // 3. No massive crash in AlphaScore (drop > 12%)
                // 4. Not High Risk (Risk < 15)
                const conf = t.decisionSSOT?.confidence ?? 0;
                const scoreDiff = (prevT.alphaScore || 0) - (t.alphaScore || 0);
                const risk = t.scoreDecomposition?.risk ?? 0;

                // Debug first 3 matched tickers
                if ([...prevMap.keys()].slice(0, 3).includes(sym)) {
                    console.log(`[Anti-Churn DEBUG] ${sym}: prevAction=${prevAction}, conf=${conf}, scoreDiff=${scoreDiff.toFixed(1)}, risk=${risk}`);
                }

                const isEligible = (prevAction === 'MAINTAIN' || prevAction === 'CAUTION') &&
                    conf >= 70 &&
                    scoreDiff < 12 &&
                    risk < 18; // [S-56.1] Relaxed from 15 to 18

                if (isEligible) {
                    // Apply Bonus based on status
                    const bonus = prevAction === 'MAINTAIN' ? 5.0 : 2.0;
                    t.alphaScore += bonus;
                    t.v71 = t.v71 || {};
                    t.v71.isBoosted = true; // Mark for debugging
                    t.v71.boostAmount = bonus;
                    console.log(`[Anti-Churn] Boosted ${t.symbol} (+${bonus}) - ${prevAction}`);
                }
            }
        });

        const sortedFinal = finalTickers.sort((a, b) => b.alphaScore - a.alphaScore).map((t, i) => ({ ...t, rank: i + 1 }));

        // [S-56.2] + [S-56.3] Universe Policy: ETF 제외 + Backfill로 12개 보장
        const { filtered: stocksOnly, final: stocksFilled, policy: universePolicy, stats: universeStats } = applyUniversePolicyWithBackfill(sortedFinal, 12);
        console.log(`[S-56.3] Universe Policy + Backfill: ${universeStats.universeTotal} total → ${universeStats.universeStocks} stocks (${universeStats.universeETFsExcluded} ETFs excluded)`);
        console.log(`[S-56.3] Final filled: ${stocksFilled.length}/12 (backfill: ${universePolicy.backfillCount}, pool: ${universeStats.stockUniversePoolSize})`);

        // Leaders Track 빌드 (ETF 제외 전 전체에서)
        const leadersTrack: LeadersTrack = buildLeadersTrack(sortedFinal);
        console.log(`[S-56.2] Leaders Track: ${leadersTrack.groups.map(g => `${g.key}(${g.items.length})`).join(', ')}`);

        // Macro SSOT
        const macroSSOT: MacroSSOT = getMacroSSOT();

        // [S-38D] Quality Gate
        const MIN_UNIVERSE_THRESHOLD = parseInt(process.env.MIN_UNIVERSE || "50");
        if (sortedFinal.length < MIN_UNIVERSE_THRESHOLD && isReportRun) {
            console.error(`[S-38D] QUALITY GATE FAIL: Eligible universe too small (${sortedFinal.length} < ${MIN_UNIVERSE_THRESHOLD})`);
            updateStatus({ status: 'FAIL', step: 'COMPUTE', lastError: `QUALITY_GATE: Eligible universe too small (${sortedFinal.length})` });
            process.exit(1);
        }

        // 3. Validation & Report Building
        updateStatus({ step: 'COMPUTE' });

        const reSortedData = {
            tickers: sortedFinal,
            swapSignal: dataBaseline?.swapSignal || { action: "MAINTAIN", reason: "Analysis complete." },
            marketSentiment: dataBaseline?.marketSentiment || { fearGreed: 50 }
        };

        const validation = validateGemsData(reSortedData as any);
        const pendingCount = sortedFinal.filter((t: any) => t.v71?.options_status !== "OK").length;

        // [S-39] Price Integrity Check (Quality Gate)
        const missingPriceTickers = sortedFinal.filter(it => !it.price || it.price <= 0).map(it => it.symbol);
        const uniqueScores = new Set(sortedFinal.map(it => it.alphaScore));

        if (missingPriceTickers.length > 0) {
            console.warn(`[S-39] PRICE_MISSING: ${missingPriceTickers.join(', ')}`);
        }
        if (uniqueScores.size <= 1 && sortedFinal.length > 1) {
            console.warn(`[S-39] SCORE_FLATTENING: All tickers have alphaScore ${Array.from(uniqueScores)[0]}`);
        }

        // [S-51] Load tracker state for CHANGELOG and TimeStop
        let trackerState = loadTrackerState();
        console.log(`[S-51] Loaded tracker: prev Top3=${trackerState.top3.join(',') || 'empty'}`);

        // [S-51] SELECTION CONTRACT: Pick Final 12 with TPG Filter
        let final12: any[] = [];
        let topPicks: string[] = [];
        let selectionContract = { total: 0, top3: 0, core: 0, highRisk: 0 };
        let changelog: any[] = [];

        try {
            // [S-56.3] Use stocksFilled (ETF excluded + backfill) for final selection
            const selection = await pickFinal12WithTPG(stocksFilled, trackerState);
            final12 = selection.final12;
            topPicks = selection.topPicks;
            changelog = selection.changelog;
            trackerState = selection.trackerState;
            selectionContract = {
                total: 12,
                top3: 3,
                core: selection.coreCount,
                highRisk: selection.highRiskCount
            };
            console.log(`[S-51] SELECTION OK: ${final12.length} tickers (ALPHA:3+TPG, CORE:7, HIGH_RISK:2)`);
        } catch (selectionError: any) {
            console.error(`[S-51] ${selectionError.message}`);
            // Fallback to legacy pickFinal12 - [S-56.3] Use stocksFilled (ETF excluded + backfill)
            try {
                const fallback = pickFinal12(stocksFilled);
                final12 = fallback.final12;
                topPicks = fallback.topPicks;
                selectionContract = { total: 12, top3: 3, core: fallback.coreCount, highRisk: fallback.highRiskCount };
            } catch (e2) {
                // [S-56.3] Use stocksFilled directly without OK filter to guarantee 12 items
                final12 = stocksFilled.slice(0, 12).map((t, i) => ({
                    ...t,
                    role: i < 3 ? "ALPHA" : i < 10 ? "CORE" : "HIGH_RISK",
                    rank: i + 1
                }));
                topPicks = final12.slice(0, 3).map(t => t.ticker || t.symbol);
                selectionContract = { total: final12.length, top3: Math.min(3, final12.length), core: Math.min(7, Math.max(0, final12.length - 3)), highRisk: Math.min(2, Math.max(0, final12.length - 10)) };
            }
            console.warn(`[S-51] FALLBACK: Using legacy selection`);
        }

        // [S-56.4] Power Engine SSOT
        console.log(`[S-56.4] Power Engine Amplification (SSOT)...`);

        const engineData = orchestrateGemsEngine(final12, macro, prevReport, {
            changelog: changelog
        });

        // Update variables from SSOT result
        final12 = engineData.newAlpha12;
        const newTop3 = engineData.newTop3;

        console.log(`[S-56.4] Top3 Selected: ${newTop3.map((t: any) => t.ticker).join(', ')}`);

        // Update topPicks
        topPicks = newTop3.map((t: any) => t.ticker);
        const powerMeta: PowerMeta = engineData.powerMeta || { regime: 'Neutral', regimeReason: 'Data insufficient', top3ActionableCount: 0, top3WatchCount: 0, top3NoTradeCount: 0 };

        // [S-51] Save tracker state for next run
        saveTrackerState(trackerState);

        const rawReport = {
            ...buildDeterministicReport(reSortedData as any, macro || {}, validation),
            // [S-41] items는 최종 12개만
            // [S-41] items는 최종 12개만
            items: final12,
            engine: engineData,
            meta: {
                timestamp: new Date().toISOString(),
                // [S-55.3] Report-Level Options Status (SSOT)
                // [S-55.3] Report-Level Options Status (SSOT)
                optionsStatus: (() => {
                    const total = final12.length;
                    const okCount = final12.filter(t => t.v71?.options_status === "OK").length;
                    const coveragePct = total > 0 ? Math.round((okCount / total) * 100) : 0;
                    let status: 'OK' | 'PARTIAL' | 'PENDING' | 'ERROR' = 'PENDING';

                    if (coveragePct >= 90) status = 'OK';
                    else if (coveragePct >= 20) status = 'PARTIAL';
                    else status = 'PENDING';

                    return {
                        status: status,
                        coveragePct: coveragePct,
                        updatedAt: new Date().toISOString(),
                        reasonKR: status === 'OK' ? undefined :
                            status === 'PARTIAL' ? `옵션 데이터 부분 수집 (${okCount}/${total})` :
                                `옵션 데이터 대기 중 (${okCount}/${total})`
                    };
                })(),
                // [S-55.3] Freshness
                freshness: {
                    generatedAtISO: new Date().toISOString(),
                    ageMin: 0
                },
                engineVersion: ENGINE_VERSION,
                pipelineVersion: BUILD_PIPELINE_VERSION,
                validation: {
                    isValid: final12.length === 12 && missingPriceTickers.length === 0,
                    errors: [
                        ...(final12.length < 12 ? [`Selection incomplete: ${final12.length}/12 tickers`] : []),
                        ...(missingPriceTickers.length > 0 ? [`Missing prices for: ${missingPriceTickers.join(', ')}`] : [])
                    ],
                    mode: final12.length === 12 ? "PASS" : "PARTIAL"
                },
                backfillRound: round,
                lastBackfillAt: new Date().toISOString(),
                mode: final12.length === 12 ? "PASS" : "PARTIAL",

                // S-38D: Universe Stats (for reference only)
                universeSource: "market",
                universeCountRaw,
                universeExcludedCount: universeCountRaw - sortedFinal.length + excludedReasons.NO_OPTIONS_LISTED,
                universeExcludedReasons: excludedReasons,
                universeCount: sortedFinal.length,
                universeSelectedK: sortedFinal.filter((t: any) => t.v71?.options_status === "OK").length,

                // [S-41] Selection Contract
                selection: selectionContract,
                itemsCount: final12.length,
                topPicks,

                slot,
                runId,
                etDate,
                etTimestamp,
                source: "Massive",
                integrity: { oiPolicy: "NO_SUBSTITUTE", pendingAllowed: final12.length < 12 },
                uiDefaults: { tableTopN: 12 },

                // [S-41] Market Status for holiday detection
                marketStatus: {
                    market: marketStatus.market,
                    session: marketStatus.session,
                    isHoliday: marketStatus.isHoliday,
                    holidayName: marketStatus.holidayName,
                    serverTime: marketStatus.serverTime
                },

                // [S-51] CHANGELOG and TimeStop
                changelog,
                timeStopTracker: trackerState.timeStopTracker
            },

            // [S-56.1] Decision Continuity Diffs
            diffs: prevReport ? generateReportDiff(
                { tickers: prevReport.items } as any,
                { tickers: final12 } as any,
                []
            ) : [],

            // [S-56.2] Universe Policy SSOT
            engine: {
                universePolicy,
                universeStats,
                leadersTrack,
                macroSSOT,
                etfIntegrity: validateNoETFInItems(final12),
                powerMeta // [S-56.4]
            }
        };


        // verify meta contract (S-38C) - [S-56.2] Allow partial reports
        const metaValidation = validateGemsMeta(rawReport.meta);
        if (!metaValidation.isValid) {
            console.warn("=== META CONTRACT WARNING (PARTIAL) ===", metaValidation.errors);
            // [S-56.2] Don't exit for partial reports, continue with available items
            if (final12.length < 6) {
                console.error("=== CRITICAL: Too few items ===");
                process.exit(1);
            }
        }

        const report = normalizeGemsSnapshot(rawReport);
        baseSnapshot = report;

        // Writing artifacts
        const writeAtomic = (targetPath: string, content: string) => {
            const tmpPath = targetPath + ".tmp";
            fs.writeFileSync(tmpPath, content);
            if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
            fs.renameSync(tmpPath, targetPath);
        };

        const rawDir = path.join(process.cwd(), 'snapshots', 'raw_options', report.meta.runId);
        if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir, { recursive: true });

        fs.writeFileSync(path.join(rawDir, 'raw_tickers.json'), JSON.stringify(report, null, 2));

        const strippedItems = report.items.map((item: any) => {
            const { optionsChain, ...rest } = item;
            return rest;
        });
        const finalReport = { ...report, items: strippedItems, diffs: rawReport.diffs || [] }; // [S-56.1] Preserve diffs
        const jsonContent = JSON.stringify(finalReport, null, 2);

        if (report.items.length > 0) {
            writeAtomic(SSOT_LATEST_PATH, jsonContent);
            const dailySlotPath = path.join(dateDir, `${slot}.json`);
            writeAtomic(dailySlotPath, jsonContent);

            // [S-51.2] Save performance tracker snapshot
            try {
                const top3Items = final12.filter((t: any) => t.role === 'ALPHA');
                const perfSnapshot = createTop3Snapshot(report.meta, top3Items);
                addSnapshotToTracker(perfSnapshot);
                console.log(`[S-51.2] Performance snapshot saved: ${perfSnapshot.tickers.map(t => t.symbol).join(', ')}`);
            } catch (perfErr) {
                console.warn(`[S-51.2] Performance snapshot failed:`, perfErr);
            }
        }

        if (pendingCount === 0 || round === MAX_ROUNDS) {
            console.log(`=== GEMS ENGINE: DONE (Round ${round}) ===`);
            updateStatus({ status: 'SUCCESS', step: 'DONE', summary: { optionsOkCount: okCount, optionsFailCount: failCount, elapsedMs: Date.now() - engineStartTime } });
            break;
        }

        const elapsed = Date.now() - startTime;
        const wait = Math.max(0, ROUND_SLEEP_MS - elapsed);
    }
}

generateFinalGemsReport().catch(err => {
    console.error("UNHANDLED ENGINE EXCEPTION:", err);
    process.exit(1);
});
