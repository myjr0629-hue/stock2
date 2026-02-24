"use strict";
// [S-51.5.2] Report Store - Upstash Redis + Local FS Adapter
// [S-52.6] Enhanced with Integrity levels, OptionsStatus, and USE_REDIS_SSOT option
// [S-52.7] Added FailureClass, ValidationResult, auto-rollback
// Uses @upstash/redis with explicit Redis.fromEnv()
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useRedis = void 0;
exports.validateReportShape = validateReportShape;
exports.calculateOptionsStatus = calculateOptionsStatus;
exports.purgeReportCaches = purgeReportCaches;
exports.saveReport = saveReport;
exports.loadReport = loadReport;
exports.loadLatest = loadLatest;
exports.getPreviousDayDate = getPreviousDayDate;
exports.getYesterdayReport = getYesterdayReport;
exports.listArchives = listArchives;
exports.debugKV = debugKV;
exports.appendPerformanceRecord = appendPerformanceRecord;
exports.getPerformanceRecords = getPerformanceRecords;
exports.getPerformanceSummaryFromRecords = getPerformanceSummaryFromRecords;
var redis_1 = require("@upstash/redis");
var fs = require("fs");
var path = require("path");
// [S-52.7] TTL for failed reports: 7 days
var FAILED_TTL_SECONDS = 7 * 24 * 60 * 60;
// Redis Keys
var ARCHIVES_DATES_KEY = 'archives:dates';
var ARCHIVES_TYPES_PREFIX = 'archives:'; // archives:{date}:types
var REPORTS_PREFIX = 'reports:'; // reports:{date}:{type}
var REPORTS_LATEST_PREFIX = 'reports:latest:'; // reports:latest:{type}
var REPORTS_FAILED_PREFIX = 'reports:failed:'; // [S-52.6] Failed reports
var PERF_RECORDS_KEY = 'perf:records';
var MAX_PERF_RECORDS = 100;
// Local paths
var REPORTS_DIR = path.join(process.cwd(), 'snapshots', 'reports');
var PERF_TRACKER_PATH = path.join(process.cwd(), 'snapshots', 'performance_tracker.json');
// [S-52.6] Environment check - USE_REDIS_SSOT allows local to use Redis
var isVercel = function () { return process.env.VERCEL === '1' || !!process.env.VERCEL_ENV; };
// [P0] HARDCODED: Always use Redis SSOT regardless of environment
var useRedis = function () { return isVercel() || !!process.env.UPSTASH_REDIS_REST_URL || !!process.env.KV_REST_API_URL; };
exports.useRedis = useRedis;
// Get Redis client (lazy initialization)
var redisClient = null;
function getRedis() {
    if (!redisClient) {
        redisClient = redis_1.Redis.fromEnv();
    }
    return redisClient;
}
// ============ S-52.6 VALIDATION ============
function validateReportShape(report) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    var reasons = [];
    var itemsCount = (_b = (_a = report.items) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0;
    var top3Count = (_e = (_d = (_c = report.meta) === null || _c === void 0 ? void 0 : _c.top3) === null || _d === void 0 ? void 0 : _d.length) !== null && _e !== void 0 ? _e : 0;
    var fullUniverseCount = (_h = (_g = (_f = report.alphaGrid) === null || _f === void 0 ? void 0 : _f.fullUniverse) === null || _g === void 0 ? void 0 : _g.length) !== null && _h !== void 0 ? _h : 0;
    // Required validations
    if (itemsCount < 12)
        reasons.push('ITEMS_LT_12');
    if (top3Count < 3)
        reasons.push('TOP3_LT_3');
    // [P0] REMOVED UNIVERSE_LT_100 - we only store 12 items, not 100
    if (!report.macro)
        reasons.push('MACRO_MISSING');
    // Determine options status
    var pendingTickers = (report.items || []).filter(function (t) { var _a; return ((_a = t.v71) === null || _a === void 0 ? void 0 : _a.options_status) === 'PENDING'; });
    var optionsGate = pendingTickers.length === 0 ? 'READY' : 'PENDING';
    // [P0] Determine integrity status - more lenient for Top3
    var status = 'OK';
    if (reasons.some(function (r) { return ['ITEMS_LT_12', 'MACRO_MISSING'].includes(r); })) {
        status = 'INCOMPLETE';
    }
    else if (reasons.includes('TOP3_LT_3')) {
        // [P0] TOP3_LT_3 should not happen with new logic, but still mark partial
        status = 'PARTIAL';
    }
    // [P0] Options PENDING no longer affects integrity status
    var integrity = {
        status: status,
        reasons: reasons,
        expected: { items: 12, top3: 3, fullUniverse: 12 }, // [P0] Changed from 100 to 12
        actual: { items: itemsCount, top3: top3Count, fullUniverse: fullUniverseCount },
        gates: {
            options: optionsGate,
            macro: report.macro ? 'OK' : 'FALLBACK'
        }
    };
    return { valid: reasons.length === 0, reasons: reasons, integrity: integrity };
}
function calculateOptionsStatus(report) {
    var items = report.items || [];
    // Only strictly "PENDING" status blocks the gate
    var pendingTickers = items
        .filter(function (t) { var _a; return ((_a = t.v71) === null || _a === void 0 ? void 0 : _a.options_status) === 'PENDING'; })
        .map(function (t) { return t.ticker || t.symbol; });
    // [P0] Count all non-PENDING statuses as "covered"
    // OK, READY, NO_OPTIONS are all valid final states
    var okCount = items.filter(function (t) { var _a; return ((_a = t.v71) === null || _a === void 0 ? void 0 : _a.options_status) === 'OK'; }).length;
    var readyCount = items.filter(function (t) { var _a; return ((_a = t.v71) === null || _a === void 0 ? void 0 : _a.options_status) === 'READY'; }).length;
    var noOptionsCount = items.filter(function (t) { var _a; return ((_a = t.v71) === null || _a === void 0 ? void 0 : _a.options_status) === 'NO_OPTIONS'; }).length;
    // [P0] Also check evidence.options.status as fallback
    var evidenceOkCount = items.filter(function (t) { var _a, _b, _c, _d; return ((_b = (_a = t.evidence) === null || _a === void 0 ? void 0 : _a.options) === null || _b === void 0 ? void 0 : _b.status) === 'OK' || ((_d = (_c = t.evidence) === null || _c === void 0 ? void 0 : _c.options) === null || _d === void 0 ? void 0 : _d.status) === 'READY'; }).length;
    // [P0] Coverage = all items that have a definitive status (not PENDING)
    var totalWithStatus = okCount + readyCount + noOptionsCount +
        (evidenceOkCount > okCount + readyCount ? evidenceOkCount - okCount - readyCount : 0);
    var coveragePct = items.length > 0 ? Math.round((Math.max(totalWithStatus, 1) / items.length) * 100) : 0;
    var state = 'READY';
    if (pendingTickers.length > 0) {
        state = 'PENDING';
    }
    else if (items.length === 0) {
        state = 'DISABLED';
    }
    // If no pending, we are READY. Even if coverage is low (that's a data quality issue, not a pipeline block).
    return {
        state: state,
        pendingTickers: pendingTickers,
        coveragePct: Math.max(coveragePct, state === 'READY' ? 1 : 0), // [P0] Never 0 when READY
        lastUpdatedAtISO: new Date().toISOString(),
        note: state === 'PENDING' ? "".concat(pendingTickers.length, "\uAC1C \uD2F0\uCEE4 \uC635\uC158 \uC218\uC9D1 \uB300\uAE30") : undefined
    };
}
// ============ REPORT STORAGE ============
// [S-Force] Purge caches logic
function purgeReportCaches(date, type) {
    return __awaiter(this, void 0, void 0, function () {
        var redis, deletedCount, patterns, _i, patterns_1, pattern, cursor, result, keys;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(0, exports.useRedis)())
                        return [2 /*return*/, 0];
                    redis = getRedis();
                    deletedCount = 0;
                    patterns = [
                        "".concat(REPORTS_PREFIX).concat(date, ":").concat(type),
                        "".concat(REPORTS_LATEST_PREFIX).concat(type),
                        "".concat(REPORTS_FAILED_PREFIX).concat(date, ":").concat(type, ":*")
                    ];
                    console.log("[ReportStore] Purging keys for ".concat(date, "/").concat(type, "..."));
                    _i = 0, patterns_1 = patterns;
                    _a.label = 1;
                case 1:
                    if (!(_i < patterns_1.length)) return [3 /*break*/, 7];
                    pattern = patterns_1[_i];
                    cursor = 0;
                    _a.label = 2;
                case 2: return [4 /*yield*/, redis.scan(cursor, { match: pattern, count: 100 })];
                case 3:
                    result = _a.sent();
                    cursor = Number(result[0]);
                    keys = result[1];
                    if (!(keys.length > 0)) return [3 /*break*/, 5];
                    return [4 /*yield*/, redis.del.apply(redis, keys)];
                case 4:
                    _a.sent();
                    deletedCount += keys.length;
                    console.log("[ReportStore] Purged ".concat(keys.length, " keys matching ").concat(pattern));
                    _a.label = 5;
                case 5:
                    if (cursor !== 0) return [3 /*break*/, 2];
                    _a.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 1];
                case 7: return [2 /*return*/, deletedCount];
            }
        });
    });
}
function saveReport(date_1, type_1, reportJson_1) {
    return __awaiter(this, arguments, void 0, function (date, type, reportJson, force) {
        var validation, optionsStatus, existing, e_1, hardFails, softFails, hardPenalty, softPenalty, optionsPenalty, validationScore, enrichedReport, reportStr, reportBytes, redis, reportKey, latestKey, typesKey, rolledBack, failedKey, e_2, dateDir, filePath;
        var _a, _b, _c, _d, _e;
        if (force === void 0) { force = false; }
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    validation = validateReportShape(reportJson);
                    optionsStatus = calculateOptionsStatus(reportJson);
                    // [S-Force] Immediate Force Override for Options Status
                    if (force) {
                        optionsStatus.state = 'READY';
                        optionsStatus.note = (optionsStatus.note || '') + ' [FORCE FINALIZED]';
                        validation.integrity.gates.options = 'READY';
                        console.warn('[ReportStore] Force override: optionsStatus set to READY.');
                    }
                    if (!!force) return [3 /*break*/, 4];
                    _f.label = 1;
                case 1:
                    _f.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, loadReport(date, type)];
                case 2:
                    existing = _f.sent();
                    // If existing is MASTER/FULL and new is not, ABORT (unless new is also master)
                    if (((_b = (_a = existing === null || existing === void 0 ? void 0 : existing.meta) === null || _a === void 0 ? void 0 : _a.id) === null || _b === void 0 ? void 0 : _b.includes('master')) && !((_d = (_c = reportJson.meta) === null || _c === void 0 ? void 0 : _c.id) === null || _d === void 0 ? void 0 : _d.includes('master'))) {
                        console.warn("[ReportStore] \uD83D\uDEE1\uFE0F PROTECTED: Skipping overwrite of Master Report (".concat(existing.meta.id, ") by inferior report (").concat((_e = reportJson.meta) === null || _e === void 0 ? void 0 : _e.id, ")"));
                        // Act as if we saved it (idempotent success)
                        return [2 /*return*/, { stored: (0, exports.useRedis)() ? 'redis' : 'fs', integrity: existing.meta.integrity, rolledBack: true }];
                    }
                    return [3 /*break*/, 4];
                case 3:
                    e_1 = _f.sent();
                    console.warn('[ReportStore] Failed to check existing report for protection:', e_1);
                    return [3 /*break*/, 4];
                case 4:
                    hardFails = validation.integrity.reasons.filter(function (r) { return ['ITEMS_LT_12', 'MACRO_MISSING', 'TOP3_LT_3'].includes(r); });
                    softFails = validation.integrity.reasons.filter(function (r) { return !['ITEMS_LT_12', 'MACRO_MISSING', 'TOP3_LT_3'].includes(r); });
                    hardPenalty = hardFails.length * 30;
                    softPenalty = softFails.length * 10;
                    optionsPenalty = optionsStatus.state === 'PENDING' ? 10 : optionsStatus.state === 'FAILED' ? 20 : 0;
                    validationScore = Math.max(0, 100 - hardPenalty - softPenalty - optionsPenalty);
                    enrichedReport = __assign(__assign({}, reportJson), { meta: __assign(__assign({}, reportJson.meta), { integrity: validation.integrity, optionsStatus: optionsStatus, validationScore: validationScore, hardFails: hardFails, softFails: softFails }) });
                    reportStr = JSON.stringify(enrichedReport);
                    reportBytes = reportStr.length;
                    console.log("[S-52.7] Pre-save validation: status=".concat(validation.integrity.status, ", score=").concat(validationScore, ", items=").concat(validation.integrity.actual.items, ", bytes=").concat(reportBytes));
                    if (!(0, exports.useRedis)()) return [3 /*break*/, 17];
                    _f.label = 5;
                case 5:
                    _f.trys.push([5, 15, , 16]);
                    redis = getRedis();
                    reportKey = "".concat(REPORTS_PREFIX).concat(date, ":").concat(type);
                    latestKey = "".concat(REPORTS_LATEST_PREFIX).concat(type);
                    typesKey = "".concat(ARCHIVES_TYPES_PREFIX).concat(date, ":types");
                    if (!force) return [3 /*break*/, 7];
                    return [4 /*yield*/, redis.del(latestKey)];
                case 6:
                    _f.sent();
                    console.log("[ReportStore] Forced delete of ".concat(latestKey, " before write."));
                    _f.label = 7;
                case 7: 
                // 1) Save report to dated archive
                return [4 /*yield*/, redis.set(reportKey, reportStr)];
                case 8:
                    // 1) Save report to dated archive
                    _f.sent();
                    console.log("[ReportStore] Redis SET ".concat(reportKey, " (").concat(reportBytes, " bytes)"));
                    rolledBack = false;
                    if (!(validation.integrity.status !== 'INCOMPLETE' || force)) return [3 /*break*/, 10];
                    return [4 /*yield*/, redis.set(latestKey, reportStr)];
                case 9:
                    _f.sent();
                    console.log("[ReportStore] Redis SET ".concat(latestKey, " (").concat(reportBytes, " bytes) ").concat(force ? '[FORCED]' : ''));
                    return [3 /*break*/, 12];
                case 10:
                    failedKey = "".concat(REPORTS_FAILED_PREFIX).concat(date, ":").concat(type, ":").concat(Date.now());
                    return [4 /*yield*/, redis.setex(failedKey, FAILED_TTL_SECONDS, reportStr)];
                case 11:
                    _f.sent();
                    console.warn("[S-52.7 ROLLBACK] INCOMPLETE report saved to ".concat(failedKey, " (TTL: 7 days), latest preserved"));
                    rolledBack = true;
                    _f.label = 12;
                case 12: 
                // 3) Add date to dates set
                return [4 /*yield*/, redis.sadd(ARCHIVES_DATES_KEY, date)];
                case 13:
                    // 3) Add date to dates set
                    _f.sent();
                    // 4) Add type to types set
                    return [4 /*yield*/, redis.sadd(typesKey, type)];
                case 14:
                    // 4) Add type to types set
                    _f.sent();
                    return [2 /*return*/, { stored: 'redis', integrity: validation.integrity, rolledBack: rolledBack }];
                case 15:
                    e_2 = _f.sent();
                    console.error('[ReportStore] Redis save failed:', e_2);
                    throw e_2;
                case 16: return [3 /*break*/, 18];
                case 17:
                    dateDir = path.join(REPORTS_DIR, date);
                    if (!fs.existsSync(dateDir)) {
                        fs.mkdirSync(dateDir, { recursive: true });
                    }
                    filePath = path.join(dateDir, "".concat(type, ".json"));
                    fs.writeFileSync(filePath, JSON.stringify(enrichedReport, null, 2), { encoding: 'utf8' });
                    console.log("[ReportStore] FS saved: ".concat(filePath, " (").concat(reportBytes, " bytes)"));
                    return [2 /*return*/, { stored: 'fs', integrity: validation.integrity }];
                case 18: return [2 /*return*/];
            }
        });
    });
}
function loadReport(date, type) {
    return __awaiter(this, void 0, void 0, function () {
        var redis, reportKey, data, e_3, filePath;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(0, exports.useRedis)()) return [3 /*break*/, 5];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    redis = getRedis();
                    reportKey = "".concat(REPORTS_PREFIX).concat(date, ":").concat(type);
                    return [4 /*yield*/, redis.get(reportKey)];
                case 2:
                    data = _a.sent();
                    if (!data)
                        return [2 /*return*/, null];
                    return [2 /*return*/, typeof data === 'string' ? JSON.parse(data) : data];
                case 3:
                    e_3 = _a.sent();
                    console.error('[ReportStore] Redis loadReport failed:', e_3);
                    return [2 /*return*/, null];
                case 4: return [3 /*break*/, 6];
                case 5:
                    filePath = path.join(REPORTS_DIR, date, "".concat(type, ".json"));
                    if (fs.existsSync(filePath)) {
                        return [2 /*return*/, JSON.parse(fs.readFileSync(filePath, 'utf-8'))];
                    }
                    return [2 /*return*/, null];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function loadLatest(type) {
    return __awaiter(this, void 0, void 0, function () {
        var report, redis, latestKey, data, e_4, dates, scanDates, _i, scanDates_1, date, filePath;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    report = null;
                    if (!(0, exports.useRedis)()) return [3 /*break*/, 4];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    redis = getRedis();
                    latestKey = "".concat(REPORTS_LATEST_PREFIX).concat(type);
                    return [4 /*yield*/, redis.get(latestKey)];
                case 2:
                    data = _a.sent();
                    if (data) {
                        report = typeof data === 'string' ? JSON.parse(data) : data;
                        // [S-53.1] Robustness: If Redis report is stale (e.g. from 2025), try FS for a newer one
                        // This handles the "Fresh Deploy / Stale Cache" scenario
                        if (report && report.meta && report.meta.marketDate && report.meta.marketDate.startsWith('2025')) {
                            console.warn("[ReportStore] Stale 2025 report found in Redis. Attempting FS fallback...");
                            report = null; // Force FS check
                        }
                    }
                    return [3 /*break*/, 4];
                case 3:
                    e_4 = _a.sent();
                    console.error('[ReportStore] Redis loadLatest failed:', e_4);
                    return [3 /*break*/, 4];
                case 4:
                    // 2. Return if Valid Redis Report found
                    if (report)
                        return [2 /*return*/, report];
                    // 3. Fallback to Local FS (The "Engine Integrity" Safety Net)
                    console.log('[ReportStore] Redis miss/stale. Falling back to Local FS...');
                    // Check NEW path (snapshots/reports/{date}/{type}.json)
                    if (fs.existsSync(REPORTS_DIR)) {
                        dates = fs.readdirSync(REPORTS_DIR)
                            .filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); })
                            .sort()
                            .reverse();
                        scanDates = dates.slice(0, 7);
                        for (_i = 0, scanDates_1 = scanDates; _i < scanDates_1.length; _i++) {
                            date = scanDates_1[_i];
                            filePath = path.join(REPORTS_DIR, date, "".concat(type, ".json"));
                            if (fs.existsSync(filePath)) {
                                console.log("[ReportStore] loadLatest found (NEW FS): ".concat(filePath));
                                return [2 /*return*/, JSON.parse(fs.readFileSync(filePath, 'utf-8'))];
                            }
                        }
                    }
                    return [2 /*return*/, null];
            }
        });
    });
}
// ============ S-53.0 YESTERDAY REPORT ============
/**
 * Get the previous trading day date (skips weekends)
 */
function getPreviousDayDate(fromDate) {
    var date = fromDate ? new Date(fromDate) : new Date();
    date.setDate(date.getDate() - 1);
    // Skip weekends
    var day = date.getDay();
    if (day === 0)
        date.setDate(date.getDate() - 2); // Sunday -> Friday
    if (day === 6)
        date.setDate(date.getDate() - 1); // Saturday -> Friday
    return date.toISOString().split('T')[0];
}
/**
 * Load yesterday's report for continuation tracking
 */
function getYesterdayReport(type, todayDate) {
    return __awaiter(this, void 0, void 0, function () {
        var yesterdayDate, datedReport, latestReport, twoDaysAgo, olderReport;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    yesterdayDate = getPreviousDayDate(todayDate);
                    console.log("[S-53.0] Loading yesterday report: ".concat(yesterdayDate, ":").concat(type));
                    return [4 /*yield*/, loadReport(yesterdayDate, type)];
                case 1:
                    datedReport = _b.sent();
                    if (datedReport) {
                        console.log("[S-53.0] Found yesterday report from ".concat(yesterdayDate));
                        return [2 /*return*/, datedReport];
                    }
                    return [4 /*yield*/, loadLatest(type)];
                case 2:
                    latestReport = _b.sent();
                    if (latestReport && ((_a = latestReport.meta) === null || _a === void 0 ? void 0 : _a.marketDate) === yesterdayDate) {
                        console.log("[S-53.0] Found yesterday report from latest");
                        return [2 /*return*/, latestReport];
                    }
                    twoDaysAgo = getPreviousDayDate(yesterdayDate);
                    return [4 /*yield*/, loadReport(twoDaysAgo, type)];
                case 3:
                    olderReport = _b.sent();
                    if (olderReport) {
                        console.log("[S-53.0] Found report from ".concat(twoDaysAgo, " (yesterday unavailable)"));
                        return [2 /*return*/, olderReport];
                    }
                    console.warn("[S-53.0] No previous report found for continuation tracking");
                    return [2 /*return*/, null];
            }
        });
    });
}
function listArchives() {
    return __awaiter(this, void 0, void 0, function () {
        var redis, dates, sortedDates, result, _i, sortedDates_1, date, typesKey, types, e_5, dates;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!isVercel()) return [3 /*break*/, 9];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 7, , 8]);
                    redis = getRedis();
                    return [4 /*yield*/, redis.smembers(ARCHIVES_DATES_KEY)];
                case 2:
                    dates = _a.sent();
                    console.log("[ReportStore] Redis SMEMBERS ".concat(ARCHIVES_DATES_KEY, " => ").concat((dates === null || dates === void 0 ? void 0 : dates.length) || 0, " dates"));
                    if (!dates || dates.length === 0) {
                        return [2 /*return*/, []];
                    }
                    sortedDates = __spreadArray([], dates, true).sort(function (a, b) { return b.localeCompare(a); });
                    result = [];
                    _i = 0, sortedDates_1 = sortedDates;
                    _a.label = 3;
                case 3:
                    if (!(_i < sortedDates_1.length)) return [3 /*break*/, 6];
                    date = sortedDates_1[_i];
                    typesKey = "".concat(ARCHIVES_TYPES_PREFIX).concat(date, ":types");
                    return [4 /*yield*/, redis.smembers(typesKey)];
                case 4:
                    types = _a.sent();
                    if (types && types.length > 0) {
                        result.push({ date: date, types: types });
                    }
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6: return [2 /*return*/, result];
                case 7:
                    e_5 = _a.sent();
                    console.error('[ReportStore] Redis listArchives failed:', e_5);
                    return [2 /*return*/, []];
                case 8: return [3 /*break*/, 10];
                case 9:
                    if (!fs.existsSync(REPORTS_DIR))
                        return [2 /*return*/, []];
                    dates = fs.readdirSync(REPORTS_DIR)
                        .filter(function (d) { return /\d{4}-\d{2}-\d{2}/.test(d); })
                        .sort()
                        .reverse();
                    return [2 /*return*/, dates.map(function (date) {
                            var dateDir = path.join(REPORTS_DIR, date);
                            var types = fs.readdirSync(dateDir)
                                .filter(function (f) { return f.endsWith('.json'); })
                                .map(function (f) { return f.replace('.json', ''); });
                            return { date: date, types: types };
                        }).filter(function (a) { return a.types.length > 0; })];
                case 10: return [2 /*return*/];
            }
        });
    });
}
// ============ DEBUG ============
function debugKV() {
    return __awaiter(this, void 0, void 0, function () {
        var redis, dates, sampleTypes, firstDate, latestEod, hasLatestEod, latestEodBytes, e_6;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!isVercel()) {
                        return [2 /*return*/, {
                                ok: true,
                                isVercel: false,
                                dates: [],
                                sampleTypes: [],
                                hasLatestEod: false,
                                latestEodBytes: 0
                            }];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 6, , 7]);
                    redis = getRedis();
                    return [4 /*yield*/, redis.smembers(ARCHIVES_DATES_KEY)];
                case 2:
                    dates = _a.sent();
                    sampleTypes = [];
                    if (!(dates && dates.length > 0)) return [3 /*break*/, 4];
                    firstDate = __spreadArray([], dates, true).sort(function (a, b) { return b.localeCompare(a); })[0];
                    return [4 /*yield*/, redis.smembers("".concat(ARCHIVES_TYPES_PREFIX).concat(firstDate, ":types"))];
                case 3:
                    sampleTypes = (_a.sent());
                    _a.label = 4;
                case 4: return [4 /*yield*/, redis.get("".concat(REPORTS_LATEST_PREFIX, "eod"))];
                case 5:
                    latestEod = _a.sent();
                    hasLatestEod = !!latestEod;
                    latestEodBytes = latestEod ? JSON.stringify(latestEod).length : 0;
                    return [2 /*return*/, {
                            ok: true,
                            isVercel: true,
                            dates: dates || [],
                            sampleTypes: sampleTypes || [],
                            hasLatestEod: hasLatestEod,
                            latestEodBytes: latestEodBytes
                        }];
                case 6:
                    e_6 = _a.sent();
                    return [2 /*return*/, {
                            ok: false,
                            isVercel: true,
                            dates: [],
                            sampleTypes: [],
                            hasLatestEod: false,
                            latestEodBytes: 0,
                            error: e_6.message
                        }];
                case 7: return [2 /*return*/];
            }
        });
    });
}
// ============ PERFORMANCE TRACKING ============
function appendPerformanceRecord(record) {
    return __awaiter(this, void 0, void 0, function () {
        var redis, e_7, records, existingIdx, dir;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!isVercel()) return [3 /*break*/, 6];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    redis = getRedis();
                    // Use LPUSH to add to list (newest first)
                    return [4 /*yield*/, redis.lpush(PERF_RECORDS_KEY, JSON.stringify(record))];
                case 2:
                    // Use LPUSH to add to list (newest first)
                    _a.sent();
                    // Trim to keep only last N records
                    return [4 /*yield*/, redis.ltrim(PERF_RECORDS_KEY, 0, MAX_PERF_RECORDS - 1)];
                case 3:
                    // Trim to keep only last N records
                    _a.sent();
                    console.log("[ReportStore] Redis perf record saved: ".concat(record.date, "/").concat(record.reportType));
                    return [3 /*break*/, 5];
                case 4:
                    e_7 = _a.sent();
                    console.error('[ReportStore] Redis perf append failed:', e_7);
                    return [3 /*break*/, 5];
                case 5: return [3 /*break*/, 7];
                case 6:
                    records = [];
                    if (fs.existsSync(PERF_TRACKER_PATH)) {
                        records = JSON.parse(fs.readFileSync(PERF_TRACKER_PATH, 'utf-8'));
                    }
                    existingIdx = records.findIndex(function (r) { return r.date === record.date && r.reportType === record.reportType; });
                    if (existingIdx >= 0) {
                        records[existingIdx] = record;
                    }
                    else {
                        records.push(record);
                    }
                    // Keep only last N
                    if (records.length > MAX_PERF_RECORDS) {
                        records = records.slice(-MAX_PERF_RECORDS);
                    }
                    dir = path.dirname(PERF_TRACKER_PATH);
                    if (!fs.existsSync(dir))
                        fs.mkdirSync(dir, { recursive: true });
                    fs.writeFileSync(PERF_TRACKER_PATH, JSON.stringify(records, null, 2), { encoding: 'utf8' });
                    console.log("[ReportStore] FS perf record saved: ".concat(record.date, "/").concat(record.reportType));
                    _a.label = 7;
                case 7: return [2 /*return*/];
            }
        });
    });
}
function getPerformanceRecords() {
    return __awaiter(this, void 0, void 0, function () {
        var redis, rawRecords, e_8;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!isVercel()) return [3 /*break*/, 5];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    redis = getRedis();
                    return [4 /*yield*/, redis.lrange(PERF_RECORDS_KEY, 0, MAX_PERF_RECORDS - 1)];
                case 2:
                    rawRecords = _a.sent();
                    if (!rawRecords || rawRecords.length === 0)
                        return [2 /*return*/, []];
                    return [2 /*return*/, rawRecords.map(function (r) { return typeof r === 'string' ? JSON.parse(r) : r; })];
                case 3:
                    e_8 = _a.sent();
                    console.error('[ReportStore] Redis perf load failed:', e_8);
                    return [2 /*return*/, []];
                case 4: return [3 /*break*/, 6];
                case 5:
                    if (fs.existsSync(PERF_TRACKER_PATH)) {
                        return [2 /*return*/, JSON.parse(fs.readFileSync(PERF_TRACKER_PATH, 'utf-8'))];
                    }
                    return [2 /*return*/, []];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function getPerformanceSummaryFromRecords(records, limit) {
    if (limit === void 0) { limit = 20; }
    var recentRecords = records.slice(0, limit);
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
    var recordsWithReturns = recentRecords.filter(function (r) { var _a; return r.calculated && ((_a = r.returns) === null || _a === void 0 ? void 0 : _a.d3) !== null; });
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
    var allD3Returns = recordsWithReturns
        .filter(function (r) { var _a, _b; return ((_a = r.returns) === null || _a === void 0 ? void 0 : _a.d3) !== undefined && ((_b = r.returns) === null || _b === void 0 ? void 0 : _b.d3) !== null; })
        .map(function (r) { return r.returns.d3; });
    var avgD3 = allD3Returns.length > 0
        ? allD3Returns.reduce(function (acc, r) { return acc + r; }, 0) / allD3Returns.length
        : null;
    var winCount = allD3Returns.filter(function (r) { return r > 0; }).length;
    var winRate = allD3Returns.length > 0 ? (winCount / allD3Returns.length) * 100 : null;
    var maxWin = allD3Returns.length > 0 ? Math.max.apply(Math, allD3Returns) : null;
    var maxLoss = allD3Returns.length > 0 ? Math.min.apply(Math, allD3Returns) : null;
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
