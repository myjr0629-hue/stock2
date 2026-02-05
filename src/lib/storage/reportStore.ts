// [S-51.5.2] Report Store - Upstash Redis + Local FS Adapter
// [S-52.6] Enhanced with Integrity levels, OptionsStatus, and USE_REDIS_SSOT option
// [S-52.7] Added FailureClass, ValidationResult, auto-rollback
// Uses @upstash/redis with explicit Redis.fromEnv()

import { Redis } from '@upstash/redis';
import * as fs from 'fs';
import * as path from 'path';

// ============ S-52.6 TYPES ============

export type IntegrityStatus = 'OK' | 'PARTIAL' | 'INCOMPLETE';

export interface IntegrityReport {
    status: IntegrityStatus;
    reasons: string[];
    expected: { items: number; top3: number; fullUniverse: number };
    actual: { items: number; top3: number; fullUniverse: number };
    gates: {
        options: 'READY' | 'PENDING' | 'DISABLED';
        macro: 'OK' | 'FALLBACK';
    };
}

export interface OptionsStatus {
    state: 'READY' | 'PENDING' | 'DISABLED' | 'FAILED';
    pendingTickers: string[];
    coveragePct: number;
    lastUpdatedAtISO: string;
    note?: string;
}

// ============ S-52.7 TYPES ============

export type FailureClass =
    | 'EXT_API_AUTH'       // 401/403
    | 'EXT_API_LIMIT'      // 429
    | 'EXT_API_EMPTY'      // 200 but no data
    | 'NORMALIZE_SHAPE'    // Format mismatch
    | 'COMPUTE_NAN'        // NaN/Infinity in calculations
    | 'STORAGE_WRITE_FAIL';

export interface ValidationResult {
    hardFails: string[];    // INCOMPLETE triggers
    softFails: string[];    // PARTIAL triggers  
    score: number;          // 0-100
    status: IntegrityStatus;
    failures: FailureClass[];
}

// [S-52.7] TTL for failed reports: 7 days
const FAILED_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface PerformanceRecord {
    date: string;
    reportType: string;
    sessionType: string;
    timestamp: string;
    tickers: {
        symbol: string;
        rank: number;
        baselinePrice: number;
        alphaScore: number;
    }[];
    returns?: {
        d1?: number | null;
        d2?: number | null;
        d3?: number | null;
    };
    calculated?: boolean;
}

// Redis Keys
const ARCHIVES_DATES_KEY = 'archives:dates';
const ARCHIVES_TYPES_PREFIX = 'archives:';  // archives:{date}:types
const REPORTS_PREFIX = 'reports:';           // reports:{date}:{type}
const REPORTS_LATEST_PREFIX = 'reports:latest:';  // reports:latest:{type}
const REPORTS_FAILED_PREFIX = 'reports:failed:'; // [S-52.6] Failed reports
const PERF_RECORDS_KEY = 'perf:records';

const MAX_PERF_RECORDS = 100;

// Local paths
const REPORTS_DIR = path.join(process.cwd(), 'snapshots', 'reports');
const PERF_TRACKER_PATH = path.join(process.cwd(), 'snapshots', 'performance_tracker.json');

// [S-52.6] Environment check - USE_REDIS_SSOT allows local to use Redis
const isVercel = () => process.env.VERCEL === '1' || !!process.env.VERCEL_ENV;
// [P0] HARDCODED: Always use Redis SSOT regardless of environment
export const useRedis = () => isVercel() || !!process.env.KV_REST_API_URL;

// Get Redis client (lazy initialization)
let redisClient: Redis | null = null;
function getRedis(): Redis {
    if (!redisClient) {
        redisClient = Redis.fromEnv();
    }
    return redisClient;
}

// ============ S-52.6 VALIDATION ============

export function validateReportShape(report: any): { valid: boolean; reasons: string[]; integrity: IntegrityReport } {
    const reasons: string[] = [];

    const itemsCount = report.items?.length ?? 0;
    const top3Count = report.meta?.top3?.length ?? 0;
    const fullUniverseCount = report.alphaGrid?.fullUniverse?.length ?? 0;

    // Required validations
    if (itemsCount < 12) reasons.push('ITEMS_LT_12');
    if (top3Count < 3) reasons.push('TOP3_LT_3');
    // [P0] REMOVED UNIVERSE_LT_100 - we only store 12 items, not 100
    if (!report.macro) reasons.push('MACRO_MISSING');

    // Determine options status
    const pendingTickers = (report.items || []).filter((t: any) => t.v71?.options_status === 'PENDING');
    const optionsGate: 'READY' | 'PENDING' | 'DISABLED' =
        pendingTickers.length === 0 ? 'READY' : 'PENDING';

    // [P0] Determine integrity status - more lenient for Top3
    let status: IntegrityStatus = 'OK';
    if (reasons.some(r => ['ITEMS_LT_12', 'MACRO_MISSING'].includes(r))) {
        status = 'INCOMPLETE';
    } else if (reasons.includes('TOP3_LT_3')) {
        // [P0] TOP3_LT_3 should not happen with new logic, but still mark partial
        status = 'PARTIAL';
    }
    // [P0] Options PENDING no longer affects integrity status

    const integrity: IntegrityReport = {
        status,
        reasons,
        expected: { items: 12, top3: 3, fullUniverse: 12 }, // [P0] Changed from 100 to 12
        actual: { items: itemsCount, top3: top3Count, fullUniverse: fullUniverseCount },
        gates: {
            options: optionsGate,
            macro: report.macro ? 'OK' : 'FALLBACK'
        }
    };

    return { valid: reasons.length === 0, reasons, integrity };
}

export function calculateOptionsStatus(report: any): OptionsStatus {
    const items = report.items || [];

    // Only strictly "PENDING" status blocks the gate
    const pendingTickers = items
        .filter((t: any) => t.v71?.options_status === 'PENDING')
        .map((t: any) => t.ticker || t.symbol);

    // [P0] Count all non-PENDING statuses as "covered"
    // OK, READY, NO_OPTIONS are all valid final states
    const okCount = items.filter((t: any) => t.v71?.options_status === 'OK').length;
    const readyCount = items.filter((t: any) => t.v71?.options_status === 'READY').length;
    const noOptionsCount = items.filter((t: any) => t.v71?.options_status === 'NO_OPTIONS').length;

    // [P0] Also check evidence.options.status as fallback
    const evidenceOkCount = items.filter((t: any) =>
        t.evidence?.options?.status === 'OK' || t.evidence?.options?.status === 'READY'
    ).length;

    // [P0] Coverage = all items that have a definitive status (not PENDING)
    const totalWithStatus = okCount + readyCount + noOptionsCount +
        (evidenceOkCount > okCount + readyCount ? evidenceOkCount - okCount - readyCount : 0);
    const coveragePct = items.length > 0 ? Math.round((Math.max(totalWithStatus, 1) / items.length) * 100) : 0;

    let state: 'READY' | 'PENDING' | 'DISABLED' | 'FAILED' = 'READY';

    if (pendingTickers.length > 0) {
        state = 'PENDING';
    } else if (items.length === 0) {
        state = 'DISABLED';
    }
    // If no pending, we are READY. Even if coverage is low (that's a data quality issue, not a pipeline block).

    return {
        state,
        pendingTickers,
        coveragePct: Math.max(coveragePct, state === 'READY' ? 1 : 0), // [P0] Never 0 when READY
        lastUpdatedAtISO: new Date().toISOString(),
        note: state === 'PENDING' ? `${pendingTickers.length}개 티커 옵션 수집 대기` : undefined
    };
}



// ============ REPORT STORAGE ============

// [S-Force] Purge caches logic
export async function purgeReportCaches(date: string, type: string): Promise<number> {
    if (!useRedis()) return 0;

    const redis = getRedis();
    let deletedCount = 0;

    // Patterns to match:
    // reports:{date}:{type}
    // reports:latest:{type}
    // reports:failed:{date}:{type}:*
    const patterns = [
        `${REPORTS_PREFIX}${date}:${type}`,
        `${REPORTS_LATEST_PREFIX}${type}`,
        `${REPORTS_FAILED_PREFIX}${date}:${type}:*`
    ];

    console.log(`[ReportStore] Purging keys for ${date}/${type}...`);

    for (const pattern of patterns) {
        let cursor = 0;
        do {
            const result = await redis.scan(cursor, { match: pattern, count: 100 });
            cursor = Number(result[0]);
            const keys = result[1];

            if (keys.length > 0) {
                await redis.del(...keys);
                deletedCount += keys.length;
                console.log(`[ReportStore] Purged ${keys.length} keys matching ${pattern}`);
            }
        } while (cursor !== 0);
    }

    return deletedCount;
}

export async function saveReport(date: string, type: string, reportJson: any, force: boolean = false): Promise<{ stored: 'redis' | 'fs'; integrity: IntegrityReport; rolledBack?: boolean }> {
    // [S-52.6] Validate and inject integrity/optionsStatus before saving
    const validation = validateReportShape(reportJson);
    let optionsStatus = calculateOptionsStatus(reportJson);

    // [S-Force] Immediate Force Override for Options Status
    if (force) {
        optionsStatus.state = 'READY';
        optionsStatus.note = (optionsStatus.note || '') + ' [FORCE FINALIZED]';
        validation.integrity.gates.options = 'READY';
        console.warn('[ReportStore] Force override: optionsStatus set to READY.');
    }

    // [Protection] Prevent overwriting Master/Manual reports with Auto reports
    if (!force) {
        try {
            const existing = await loadReport(date, type);
            // If existing is MASTER/FULL and new is not, ABORT (unless new is also master)
            if (existing?.meta?.id?.includes('master') && !reportJson.meta?.id?.includes('master')) {
                console.warn(`[ReportStore] 🛡️ PROTECTED: Skipping overwrite of Master Report (${existing.meta.id}) by inferior report (${reportJson.meta?.id})`);
                // Act as if we saved it (idempotent success)
                return { stored: useRedis() ? 'redis' : 'fs', integrity: existing.meta.integrity, rolledBack: true };
            }
        } catch (e) {
            console.warn('[ReportStore] Failed to check existing report for protection:', e);
        }
    }

    // [S-52.7] Calculate validation score (0-100)
    const hardFails = validation.integrity.reasons.filter(r => ['ITEMS_LT_12', 'MACRO_MISSING', 'TOP3_LT_3'].includes(r));
    const softFails = validation.integrity.reasons.filter(r => !['ITEMS_LT_12', 'MACRO_MISSING', 'TOP3_LT_3'].includes(r));
    const hardPenalty = hardFails.length * 30;
    const softPenalty = softFails.length * 10;
    const optionsPenalty = optionsStatus.state === 'PENDING' ? 10 : optionsStatus.state === 'FAILED' ? 20 : 0;
    const validationScore = Math.max(0, 100 - hardPenalty - softPenalty - optionsPenalty);

    // Inject integrity and optionsStatus into report
    const enrichedReport = {
        ...reportJson,
        meta: {
            ...reportJson.meta,
            integrity: validation.integrity,
            optionsStatus,
            validationScore,
            hardFails,
            softFails
        }
    };

    const reportStr = JSON.stringify(enrichedReport);
    const reportBytes = reportStr.length;

    console.log(`[S-52.7] Pre-save validation: status=${validation.integrity.status}, score=${validationScore}, items=${validation.integrity.actual.items}, bytes=${reportBytes}`);

    if (useRedis()) {
        try {
            const redis = getRedis();
            const reportKey = `${REPORTS_PREFIX}${date}:${type}`;
            const latestKey = `${REPORTS_LATEST_PREFIX}${type}`;
            const typesKey = `${ARCHIVES_TYPES_PREFIX}${date}:types`;

            // [S-Force] Pre-delete polluted cache if forced
            if (force) {
                await redis.del(latestKey);
                console.log(`[ReportStore] Forced delete of ${latestKey} before write.`);
            }

            // 1) Save report to dated archive
            await redis.set(reportKey, reportStr);
            console.log(`[ReportStore] Redis SET ${reportKey} (${reportBytes} bytes)`);

            // 2) [S-52.7] Auto-rollback: Only update latest if not INCOMPLETE or FORCED
            let rolledBack = false;
            if (validation.integrity.status !== 'INCOMPLETE' || force) {
                await redis.set(latestKey, reportStr);
                console.log(`[ReportStore] Redis SET ${latestKey} (${reportBytes} bytes) ${force ? '[FORCED]' : ''}`);
            } else {
                // Save to failed key with 7-day TTL instead
                const failedKey = `${REPORTS_FAILED_PREFIX}${date}:${type}:${Date.now()}`;
                await redis.setex(failedKey, FAILED_TTL_SECONDS, reportStr);
                console.warn(`[S-52.7 ROLLBACK] INCOMPLETE report saved to ${failedKey} (TTL: 7 days), latest preserved`);
                rolledBack = true;
            }

            // 3) Add date to dates set
            await redis.sadd(ARCHIVES_DATES_KEY, date);

            // 4) Add type to types set
            await redis.sadd(typesKey, type);

            return { stored: 'redis', integrity: validation.integrity, rolledBack };
        } catch (e) {
            console.error('[ReportStore] Redis save failed:', e);
            throw e;
        }
    } else {
        // Local FS storage
        const dateDir = path.join(REPORTS_DIR, date);
        if (!fs.existsSync(dateDir)) {
            fs.mkdirSync(dateDir, { recursive: true });
        }
        const filePath = path.join(dateDir, `${type}.json`);
        fs.writeFileSync(filePath, JSON.stringify(enrichedReport, null, 2), { encoding: 'utf8' });
        console.log(`[ReportStore] FS saved: ${filePath} (${reportBytes} bytes)`);
        return { stored: 'fs', integrity: validation.integrity };
    }
}

export async function loadReport(date: string, type: string): Promise<any | null> {
    if (useRedis()) {
        try {
            const redis = getRedis();
            const reportKey = `${REPORTS_PREFIX}${date}:${type}`;
            const data = await redis.get(reportKey);

            if (!data) return null;
            return typeof data === 'string' ? JSON.parse(data) : data;
        } catch (e) {
            console.error('[ReportStore] Redis loadReport failed:', e);
            return null;
        }
    } else {
        const filePath = path.join(REPORTS_DIR, date, `${type}.json`);
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
        return null;
    }
}

export async function loadLatest(type: string): Promise<any | null> {
    let report: any = null;

    // 1. Try Redis first (if enabled)
    if (useRedis()) {
        try {
            const redis = getRedis();
            const latestKey = `${REPORTS_LATEST_PREFIX}${type}`;
            const data = await redis.get(latestKey);

            if (data) {
                report = typeof data === 'string' ? JSON.parse(data) : data;
                // [S-53.1] Robustness: If Redis report is stale (e.g. from 2025), try FS for a newer one
                // This handles the "Fresh Deploy / Stale Cache" scenario
                if (report && report.meta && report.meta.marketDate && report.meta.marketDate.startsWith('2025')) {
                    console.warn(`[ReportStore] Stale 2025 report found in Redis. Attempting FS fallback...`);
                    report = null; // Force FS check
                }
            }
        } catch (e) {
            console.error('[ReportStore] Redis loadLatest failed:', e);
            // Fallthrough to FS
        }
    }

    // 2. Return if Valid Redis Report found
    if (report) return report;

    // 3. Fallback to Local FS (The "Engine Integrity" Safety Net)
    console.log('[ReportStore] Redis miss/stale. Falling back to Local FS...');

    // Check NEW path (snapshots/reports/{date}/{type}.json)
    if (fs.existsSync(REPORTS_DIR)) {
        const dates = fs.readdirSync(REPORTS_DIR)
            .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
            .sort()
            .reverse();

        // [Performance] Limit scan to last 7 days to prevent full history scan
        const scanDates = dates.slice(0, 7);

        for (const date of scanDates) {
            const filePath = path.join(REPORTS_DIR, date, `${type}.json`);
            if (fs.existsSync(filePath)) {
                console.log(`[ReportStore] loadLatest found (NEW FS): ${filePath}`);
                return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            }
        }
    }

    return null;
}

// ============ S-53.0 YESTERDAY REPORT ============

/**
 * Get the previous trading day date (skips weekends)
 */
export function getPreviousDayDate(fromDate?: string): string {
    const date = fromDate ? new Date(fromDate) : new Date();
    date.setDate(date.getDate() - 1);

    // Skip weekends
    const day = date.getDay();
    if (day === 0) date.setDate(date.getDate() - 2); // Sunday -> Friday
    if (day === 6) date.setDate(date.getDate() - 1); // Saturday -> Friday

    return date.toISOString().split('T')[0];
}

/**
 * Load yesterday's report for continuation tracking
 */
export async function getYesterdayReport(type: string, todayDate?: string): Promise<any | null> {
    const yesterdayDate = getPreviousDayDate(todayDate);
    console.log(`[S-53.0] Loading yesterday report: ${yesterdayDate}:${type}`);

    // Try to load from dated archive first
    const datedReport = await loadReport(yesterdayDate, type);
    if (datedReport) {
        console.log(`[S-53.0] Found yesterday report from ${yesterdayDate}`);
        return datedReport;
    }

    // Fallback to latest (which might be from yesterday)
    const latestReport = await loadLatest(type);
    if (latestReport && latestReport.meta?.marketDate === yesterdayDate) {
        console.log(`[S-53.0] Found yesterday report from latest`);
        return latestReport;
    }

    // Check one more day back (in case of holidays)
    const twoDaysAgo = getPreviousDayDate(yesterdayDate);
    const olderReport = await loadReport(twoDaysAgo, type);
    if (olderReport) {
        console.log(`[S-53.0] Found report from ${twoDaysAgo} (yesterday unavailable)`);
        return olderReport;
    }

    console.warn(`[S-53.0] No previous report found for continuation tracking`);
    return null;
}

export async function listArchives(): Promise<{ date: string; types: string[] }[]> {
    if (isVercel()) {
        try {
            const redis = getRedis();

            // Get all dates from set
            const dates = await redis.smembers(ARCHIVES_DATES_KEY) as string[];
            console.log(`[ReportStore] Redis SMEMBERS ${ARCHIVES_DATES_KEY} => ${dates?.length || 0} dates`);

            if (!dates || dates.length === 0) {
                return [];
            }

            // Sort dates descending
            const sortedDates = [...dates].sort((a, b) => b.localeCompare(a));

            // Get types for each date
            const result: { date: string; types: string[] }[] = [];
            for (const date of sortedDates) {
                const typesKey = `${ARCHIVES_TYPES_PREFIX}${date}:types`;
                const types = await redis.smembers(typesKey) as string[];
                if (types && types.length > 0) {
                    result.push({ date, types });
                }
            }

            return result;
        } catch (e) {
            console.error('[ReportStore] Redis listArchives failed:', e);
            return [];
        }
    } else {
        if (!fs.existsSync(REPORTS_DIR)) return [];

        const dates = fs.readdirSync(REPORTS_DIR)
            .filter(d => /\d{4}-\d{2}-\d{2}/.test(d))
            .sort()
            .reverse();

        return dates.map(date => {
            const dateDir = path.join(REPORTS_DIR, date);
            const types = fs.readdirSync(dateDir)
                .filter(f => f.endsWith('.json'))
                .map(f => f.replace('.json', ''));
            return { date, types };
        }).filter(a => a.types.length > 0);
    }
}

// ============ DEBUG ============

export async function debugKV(): Promise<{
    ok: boolean;
    isVercel: boolean;
    dates: string[];
    sampleTypes: string[];
    hasLatestEod: boolean;
    latestEodBytes: number;
    error?: string;
}> {
    if (!isVercel()) {
        return {
            ok: true,
            isVercel: false,
            dates: [],
            sampleTypes: [],
            hasLatestEod: false,
            latestEodBytes: 0
        };
    }

    try {
        const redis = getRedis();

        // Get dates
        const dates = await redis.smembers(ARCHIVES_DATES_KEY) as string[];

        // Get types for first date
        let sampleTypes: string[] = [];
        if (dates && dates.length > 0) {
            const firstDate = [...dates].sort((a, b) => b.localeCompare(a))[0];
            sampleTypes = await redis.smembers(`${ARCHIVES_TYPES_PREFIX}${firstDate}:types`) as string[];
        }

        // Check latest:eod
        const latestEod = await redis.get(`${REPORTS_LATEST_PREFIX}eod`);
        const hasLatestEod = !!latestEod;
        const latestEodBytes = latestEod ? JSON.stringify(latestEod).length : 0;

        return {
            ok: true,
            isVercel: true,
            dates: dates || [],
            sampleTypes: sampleTypes || [],
            hasLatestEod,
            latestEodBytes
        };
    } catch (e) {
        return {
            ok: false,
            isVercel: true,
            dates: [],
            sampleTypes: [],
            hasLatestEod: false,
            latestEodBytes: 0,
            error: (e as Error).message
        };
    }
}

// ============ PERFORMANCE TRACKING ============

export async function appendPerformanceRecord(record: PerformanceRecord): Promise<void> {
    if (isVercel()) {
        try {
            const redis = getRedis();

            // Use LPUSH to add to list (newest first)
            await redis.lpush(PERF_RECORDS_KEY, JSON.stringify(record));

            // Trim to keep only last N records
            await redis.ltrim(PERF_RECORDS_KEY, 0, MAX_PERF_RECORDS - 1);

            console.log(`[ReportStore] Redis perf record saved: ${record.date}/${record.reportType}`);
        } catch (e) {
            console.error('[ReportStore] Redis perf append failed:', e);
        }
    } else {
        // Local FS
        let records: PerformanceRecord[] = [];
        if (fs.existsSync(PERF_TRACKER_PATH)) {
            records = JSON.parse(fs.readFileSync(PERF_TRACKER_PATH, 'utf-8'));
        }

        // Check for duplicate
        const existingIdx = records.findIndex(
            r => r.date === record.date && r.reportType === record.reportType
        );

        if (existingIdx >= 0) {
            records[existingIdx] = record;
        } else {
            records.push(record);
        }

        // Keep only last N
        if (records.length > MAX_PERF_RECORDS) {
            records = records.slice(-MAX_PERF_RECORDS);
        }

        const dir = path.dirname(PERF_TRACKER_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(PERF_TRACKER_PATH, JSON.stringify(records, null, 2), { encoding: 'utf8' });
        console.log(`[ReportStore] FS perf record saved: ${record.date}/${record.reportType}`);
    }
}

export async function getPerformanceRecords(): Promise<PerformanceRecord[]> {
    if (isVercel()) {
        try {
            const redis = getRedis();

            // LRANGE to get all records (newest first)
            const rawRecords = await redis.lrange(PERF_RECORDS_KEY, 0, MAX_PERF_RECORDS - 1);

            if (!rawRecords || rawRecords.length === 0) return [];

            return rawRecords.map(r => typeof r === 'string' ? JSON.parse(r) : r);
        } catch (e) {
            console.error('[ReportStore] Redis perf load failed:', e);
            return [];
        }
    } else {
        if (fs.existsSync(PERF_TRACKER_PATH)) {
            return JSON.parse(fs.readFileSync(PERF_TRACKER_PATH, 'utf-8'));
        }
        return [];
    }
}

export function getPerformanceSummaryFromRecords(records: PerformanceRecord[], limit: number = 20): {
    sampleSize: number;
    avgReturnD1: number | null;
    avgReturnD2: number | null;
    avgReturnD3: number | null;
    winRate: number | null;
    maxWin: number | null;
    maxLoss: number | null;
    lastUpdated: string;
} {
    const recentRecords = records.slice(0, limit);

    if (recentRecords.length === 0) {
        return {
            sampleSize: 0,
            avgReturnD1: null,
            avgReturnD2: null,
            avgReturnD3: null,
            winRate: null,
            maxWin: null,
            maxLoss: null,
            lastUpdated: new Date().toISOString()
        };
    }

    // Count records with returns calculated
    const recordsWithReturns = recentRecords.filter(r => r.calculated && r.returns?.d3 !== null);

    if (recordsWithReturns.length === 0) {
        return {
            sampleSize: recentRecords.length,
            avgReturnD1: null,
            avgReturnD2: null,
            avgReturnD3: null,
            winRate: null,
            maxWin: null,
            maxLoss: null,
            lastUpdated: new Date().toISOString()
        };
    }

    const allD3Returns = recordsWithReturns
        .filter(r => r.returns?.d3 !== undefined && r.returns?.d3 !== null)
        .map(r => r.returns!.d3 as number);

    const avgD3 = allD3Returns.length > 0
        ? allD3Returns.reduce((acc, r) => acc + r, 0) / allD3Returns.length
        : null;

    const winCount = allD3Returns.filter(r => r > 0).length;
    const winRate = allD3Returns.length > 0 ? (winCount / allD3Returns.length) * 100 : null;
    const maxWin = allD3Returns.length > 0 ? Math.max(...allD3Returns) : null;
    const maxLoss = allD3Returns.length > 0 ? Math.min(...allD3Returns) : null;

    return {
        sampleSize: recentRecords.length,
        avgReturnD1: null,
        avgReturnD2: null,
        avgReturnD3: avgD3 !== null ? Number(avgD3.toFixed(2)) : null,
        winRate: winRate !== null ? Number(winRate.toFixed(1)) : null,
        maxWin: maxWin !== null ? Number(maxWin.toFixed(2)) : null,
        maxLoss: maxLoss !== null ? Number(maxLoss.toFixed(2)) : null,
        lastUpdated: new Date().toISOString()
    };
}
