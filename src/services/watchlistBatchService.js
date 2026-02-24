"use strict";
// Watchlist Batch Analyze API - Optimized multi-ticker analysis
// Single request for multiple tickers to reduce HTTP overhead
// [V5] Uses Alpha Engine V5 (calculateAlphaScore) with FULL data enrichment
// [V5] Macro + Flow + Catalyst data = absolute alpha scores identical to reports
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.revalidate = void 0;
exports.processWatchlistBatch = processWatchlistBatch;
var stockApi_1 = require("@/services/stockApi");
var alphaEngine_1 = require("@/services/alphaEngine");
var structureService_1 = require("@/services/structureService");
var massiveClient_1 = require("@/services/massiveClient");
var analysisCache_1 = require("@/services/analysisCache");
var macroHubProvider_1 = require("@/services/macroHubProvider");
var realtimeMetricsService_1 = require("@/services/realtimeMetricsService");
var redisClient_1 = require("@/services/redisClient");
// [S-76] Edge cache for 30 seconds - faster repeat loads
exports.revalidate = 30;
// [PERF] Lightweight stock data fetcher - skips chart data entirely
// Same data sources as getStockData(), minus getStockChartData() (which downloads 1000+ minute bars)
// All prices, RSI, 3D return, VWAP are identical to getStockData()
function getStockDataLight(symbol) {
    return __awaiter(this, void 0, void 0, function () {
        var to, fromDate, _a, snapRes, rsiRes, dailyAggs, t, getETNow, et, etTime, session, prevClose, todayClose, latestPrice, changeBase, isExtended, extChange, extChangePercent, regChange, regChangePercent, rsi, dailyResults, return3d, recentCandles, price3dAgo, currentClose, sparkline, extendedChangePct, preMarketVolume;
        var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
        return __generator(this, function (_s) {
            switch (_s.label) {
                case 0:
                    to = new Date().toISOString().split('T')[0];
                    fromDate = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
                    return [4 /*yield*/, Promise.all([
                            // 1. Snapshot: price, change, volume, VWAP, prevClose (same as getStockData)
                            (0, massiveClient_1.fetchMassive)("/v2/snapshot/locale/us/markets/stocks/tickers/".concat(symbol)),
                            // 2. RSI: same API as getTechnicalRSI()
                            (0, massiveClient_1.fetchMassive)("/v1/indicators/rsi/".concat(symbol), { timespan: 'day', window: '14', limit: '1' }).catch(function () { return null; }),
                            // 3. Daily aggregates: for 3D return + sparkline (same as getAggregates in getStockData)
                            (0, massiveClient_1.fetchMassive)("/v2/aggs/ticker/".concat(symbol, "/range/1/day/").concat(fromDate, "/").concat(to), { limit: '5000', adjust: 'true', sort: 'asc' }).catch(function () { return null; })
                        ])];
                case 1:
                    _a = _s.sent(), snapRes = _a[0], rsiRes = _a[1], dailyAggs = _a[2];
                    t = snapRes === null || snapRes === void 0 ? void 0 : snapRes.ticker;
                    if (!t)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('@/services/timezoneUtils'); })];
                case 2:
                    getETNow = (_s.sent()).getETNow;
                    et = getETNow();
                    etTime = et.hour + et.minute / 60;
                    session = 'reg';
                    if (!et.isWeekend) {
                        if (etTime >= 4 && etTime < 9.5)
                            session = 'pre';
                        else if (etTime >= 16 && etTime < 20)
                            session = 'post';
                        else if (etTime >= 9.5 && etTime < 16)
                            session = 'reg';
                        else
                            session = (etTime >= 20 || etTime < 4) ? 'post' : 'reg';
                    }
                    prevClose = ((_b = t === null || t === void 0 ? void 0 : t.prevDay) === null || _b === void 0 ? void 0 : _b.c) || 0;
                    todayClose = ((_c = t === null || t === void 0 ? void 0 : t.day) === null || _c === void 0 ? void 0 : _c.c) || prevClose;
                    latestPrice = ((_d = t === null || t === void 0 ? void 0 : t.lastTrade) === null || _d === void 0 ? void 0 : _d.p) || ((_e = t === null || t === void 0 ? void 0 : t.min) === null || _e === void 0 ? void 0 : _e.c) || ((_f = t === null || t === void 0 ? void 0 : t.day) === null || _f === void 0 ? void 0 : _f.c) || ((_g = t === null || t === void 0 ? void 0 : t.prevDay) === null || _g === void 0 ? void 0 : _g.c) || 0;
                    changeBase = prevClose;
                    if (session === 'post')
                        changeBase = todayClose;
                    isExtended = session !== 'reg';
                    extChange = isExtended ? (latestPrice - changeBase) : undefined;
                    extChangePercent = isExtended ? (changeBase !== 0 ? ((latestPrice - changeBase) / changeBase) * 100 : 0) : undefined;
                    regChange = (t === null || t === void 0 ? void 0 : t.todaysChange) || (todayClose - prevClose);
                    regChangePercent = (t === null || t === void 0 ? void 0 : t.todaysChangePerc) || (prevClose !== 0 ? ((todayClose - prevClose) / prevClose) * 100 : 0);
                    rsi = (_l = (_k = (_j = (_h = rsiRes === null || rsiRes === void 0 ? void 0 : rsiRes.results) === null || _h === void 0 ? void 0 : _h.values) === null || _j === void 0 ? void 0 : _j[0]) === null || _k === void 0 ? void 0 : _k.value) !== null && _l !== void 0 ? _l : null;
                    dailyResults = ((dailyAggs === null || dailyAggs === void 0 ? void 0 : dailyAggs.results) || []).map(function (r) { return ({ close: r.c, volume: r.v || 0 }); });
                    return3d = 0;
                    if (dailyResults.length >= 4) {
                        recentCandles = dailyResults.slice(-4);
                        price3dAgo = recentCandles[0].close;
                        currentClose = recentCandles[recentCandles.length - 1].close;
                        return3d = ((currentClose - price3dAgo) / price3dAgo) * 100;
                    }
                    sparkline = dailyResults.slice(-20).map(function (d) { return d.close; });
                    extendedChangePct = null;
                    preMarketVolume = 0;
                    if (session === 'pre' && prevClose > 0) {
                        extendedChangePct = ((latestPrice - prevClose) / prevClose) * 100;
                        preMarketVolume = ((_m = t === null || t === void 0 ? void 0 : t.min) === null || _m === void 0 ? void 0 : _m.v) || ((_o = t === null || t === void 0 ? void 0 : t.day) === null || _o === void 0 ? void 0 : _o.v) || 0; // approximate PM volume
                    }
                    else if (session === 'post' && todayClose > 0) {
                        extendedChangePct = ((latestPrice - todayClose) / todayClose) * 100;
                    }
                    return [2 /*return*/, {
                            symbol: symbol,
                            price: latestPrice,
                            change: isExtended ? (extChange || 0) : (regChange || 0),
                            changePercent: isExtended ? (extChangePercent || 0) : (regChangePercent || 0),
                            volume: (_p = t === null || t === void 0 ? void 0 : t.day) === null || _p === void 0 ? void 0 : _p.v,
                            prevClose: prevClose,
                            prevDayVolume: ((_q = t === null || t === void 0 ? void 0 : t.prevDay) === null || _q === void 0 ? void 0 : _q.v) || 0, // [V3.2] For relVol calculation
                            session: session,
                            rsi: rsi,
                            return3d: return3d,
                            vwap: (_r = t === null || t === void 0 ? void 0 : t.day) === null || _r === void 0 ? void 0 : _r.vw,
                            history: sparkline.map(function (close) { return ({ close: close }); }), // Compatible format
                            dailyResults: dailyResults, // [V3.2] For session-aware changePct/relVol
                            extendedChangePct: extendedChangePct, // [V5] For PM Gate 11 (preMarketChangePct)
                            preMarketVolume: preMarketVolume,
                        }];
            }
        });
    });
}
// ============================================================================
// CORE BATCH PROCESSING LOGIC
// Exported separately so it can be called seamlessly during SSR (Server Components)
// without creating mock Request objects or failing on absolute URL resolution
// ============================================================================
function processWatchlistBatch(tickers_1) {
    return __awaiter(this, arguments, void 0, function (tickers, mode) {
        var startTime, cached, missingTickers, snapshotData, snapshotMap, getMarketStatusSSOT, marketStatus, currentSession, macroData, fearGreedScore, macro, e_1, fgData, _a, results;
        var _this = this;
        var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        if (mode === void 0) { mode = 'full'; }
        return __generator(this, function (_o) {
            switch (_o.label) {
                case 0:
                    startTime = Date.now();
                    if (!tickers || tickers.length === 0)
                        return [2 /*return*/, { results: [], meta: { count: 0, elapsed: 0, source: 'empty' } }];
                    return [4 /*yield*/, (0, analysisCache_1.getAnalysisCacheForTickers)(tickers).catch(function () { return ({}); })];
                case 1:
                    cached = _o.sent();
                    missingTickers = tickers.filter(function (t) { return !cached[t]; });
                    return [4 /*yield*/, (0, massiveClient_1.fetchMassive)("/v2/snapshot/locale/us/markets/stocks/tickers", { tickers: tickers.join(',') }).catch(function () { return null; })];
                case 2:
                    snapshotData = _o.sent();
                    snapshotMap = {};
                    ((snapshotData === null || snapshotData === void 0 ? void 0 : snapshotData.tickers) || []).forEach(function (t) { snapshotMap[t.ticker] = t; });
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('@/services/marketStatusProvider'); })];
                case 3:
                    getMarketStatusSSOT = (_o.sent()).getMarketStatusSSOT;
                    return [4 /*yield*/, getMarketStatusSSOT()];
                case 4:
                    marketStatus = _o.sent();
                    currentSession = marketStatus.session;
                    macroData = null;
                    fearGreedScore = null;
                    if (!(missingTickers.length > 0 && mode === 'full')) return [3 /*break*/, 11];
                    _o.label = 5;
                case 5:
                    _o.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, (0, macroHubProvider_1.getMacroSnapshotSSOT)()];
                case 6:
                    macro = _o.sent();
                    macroData = {
                        ndxChangePct: (_b = macro.nqChangePercent) !== null && _b !== void 0 ? _b : null,
                        vixValue: (_c = macro.vix) !== null && _c !== void 0 ? _c : null,
                        vixChangePct: (_f = (_e = (_d = macro.factors) === null || _d === void 0 ? void 0 : _d.vix) === null || _e === void 0 ? void 0 : _e.chgPct) !== null && _f !== void 0 ? _f : null,
                        tltChangePct: (_g = macro.tltChangePct) !== null && _g !== void 0 ? _g : null,
                        gldChangePct: (_h = macro.gldChangePct) !== null && _h !== void 0 ? _h : null,
                        dxy: (_j = macro.dxy) !== null && _j !== void 0 ? _j : null,
                        realYieldStance: (_l = (_k = macro.realYield) === null || _k === void 0 ? void 0 : _k.stance) !== null && _l !== void 0 ? _l : null,
                    };
                    return [3 /*break*/, 8];
                case 7:
                    e_1 = _o.sent();
                    console.warn('[Watchlist Batch] Macro fetch failed:', e_1);
                    return [3 /*break*/, 8];
                case 8:
                    _o.trys.push([8, 10, , 11]);
                    return [4 /*yield*/, (0, redisClient_1.getFromCache)('cnn:feargreed')];
                case 9:
                    fgData = _o.sent();
                    fearGreedScore = (_m = fgData === null || fgData === void 0 ? void 0 : fgData.score) !== null && _m !== void 0 ? _m : null;
                    return [3 /*break*/, 11];
                case 10:
                    _a = _o.sent();
                    return [3 /*break*/, 11];
                case 11: return [4 /*yield*/, Promise.all(tickers.map(function (ticker) { return __awaiter(_this, void 0, void 0, function () {
                        var analysis, snap, buildBasePrice, base, finalChangePct, lastClose, prevClose2, liveLast, extendedChangePct, refPrice, base, extendedChangePct, _a, stockData, optionsData, structureRes, tradeData, shortVolData, d, isOpExWeek, sessionMap, alphaSession, isREG, dailyResults, changePct, lastBar, prevBar, relVol, dayVol, prevVol, lastVol, prevVol, return3D, lastClose, close4dAgo, sma20, dailyCloses, last20, opts, alphaGex, alphaPcr, alphaGammaFlip, alphaSqueezeScore, sq, absGex, pcr_1, rawContracts, currentPrice, ivSkew, maxCallOI, maxPutOI, directCallWall, directPutFloor, _i, rawContracts_1, c, oi, strike, impliedMovePct, whaleIndex, darkPoolPct, shortVolPct, blockTradesCount, netPremium, alphaResult, score, grade, action, actionKR, whyKR, triggers, confidence, hasOptionsData, maxPain, rawGex, gex, whaleConfidence, pcr, gammaFlipLevel, structureGexM, structureMaxPain, iv, finalMaxPain, finalMaxPainDist, fullObj, error_1;
                        var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23, _24, _25, _26, _27, _28, _29;
                        return __generator(this, function (_30) {
                            switch (_30.label) {
                                case 0:
                                    analysis = cached[ticker];
                                    snap = snapshotMap[ticker];
                                    buildBasePrice = function () {
                                        var _a, _b, _c, _d, _e, _f, _g, _h;
                                        if (!snap)
                                            return { displayPrice: 0, changePct: 0, extendedPrice: null, extendedLabel: undefined, vwap: null, volume: 0, prevDayClose: 0 };
                                        var liveLast = ((_a = snap.lastTrade) === null || _a === void 0 ? void 0 : _a.p) || 0;
                                        var dayClose = ((_b = snap.day) === null || _b === void 0 ? void 0 : _b.c) || 0;
                                        var prevDayClose = ((_c = snap.prevDay) === null || _c === void 0 ? void 0 : _c.c) || 0;
                                        var volume = ((_d = snap.day) === null || _d === void 0 ? void 0 : _d.v) || 0;
                                        var vwap = ((_e = snap.day) === null || _e === void 0 ? void 0 : _e.vw) || null;
                                        var displayPrice = 0;
                                        if (currentSession === 'regular')
                                            displayPrice = liveLast || dayClose || prevDayClose;
                                        else if (currentSession === 'pre')
                                            displayPrice = prevDayClose;
                                        else
                                            displayPrice = dayClose || prevDayClose;
                                        var changePct = snap.todaysChangePerc || 0;
                                        if (currentSession !== 'regular') {
                                            // For cached items, we'll try to override this with sparkline later, but this is the snapshot fallback
                                            if (dayClose > 0 && prevDayClose > 0) {
                                                changePct = ((dayClose - prevDayClose) / prevDayClose) * 100;
                                            }
                                        }
                                        var extendedPrice = null;
                                        var extendedLabel = undefined;
                                        if (currentSession === 'pre') {
                                            var prePrice = ((_f = snap.min) === null || _f === void 0 ? void 0 : _f.c) || liveLast;
                                            if (prePrice > 0) {
                                                extendedPrice = prePrice;
                                                extendedLabel = 'PRE';
                                            }
                                        }
                                        else if (currentSession === 'post' || currentSession === 'closed') {
                                            var postPrice = ((_g = snap.afterHours) === null || _g === void 0 ? void 0 : _g.p) || ((_h = snap.min) === null || _h === void 0 ? void 0 : _h.c) || liveLast;
                                            if (postPrice > 0) {
                                                extendedPrice = postPrice;
                                                extendedLabel = 'POST';
                                            }
                                        }
                                        return { displayPrice: displayPrice, changePct: changePct, extendedPrice: extendedPrice, extendedLabel: extendedLabel, vwap: vwap, volume: volume, prevDayClose: prevDayClose };
                                    };
                                    // ============================================
                                    // A. CACHE HIT: FAST RETURN (Instant)
                                    // ============================================
                                    if (analysis) {
                                        base = buildBasePrice();
                                        finalChangePct = base.changePct;
                                        if (currentSession !== 'regular' && analysis.sparkline && analysis.sparkline.length >= 2) {
                                            lastClose = analysis.sparkline[analysis.sparkline.length - 1];
                                            prevClose2 = analysis.sparkline[analysis.sparkline.length - 2];
                                            if (prevClose2 > 0 && lastClose > 0) {
                                                finalChangePct = ((lastClose - prevClose2) / prevClose2) * 100;
                                            }
                                        }
                                        else if (currentSession === 'regular') {
                                            liveLast = ((_b = snap === null || snap === void 0 ? void 0 : snap.lastTrade) === null || _b === void 0 ? void 0 : _b.p) || 0;
                                            if (base.changePct === 0 && liveLast > 0 && base.prevDayClose > 0) {
                                                finalChangePct = ((liveLast - base.prevDayClose) / base.prevDayClose) * 100;
                                            }
                                        }
                                        extendedChangePct = (base.extendedPrice && base.extendedPrice > 0 && base.displayPrice > 0)
                                            ? ((base.extendedPrice - base.displayPrice) / base.displayPrice) * 100
                                            : null;
                                        refPrice = base.extendedPrice || base.displayPrice;
                                        return [2 /*return*/, {
                                                ticker: ticker,
                                                alphaSnapshot: analysis.alphaSnapshot,
                                                realtime: {
                                                    price: base.displayPrice,
                                                    changePct: finalChangePct,
                                                    session: currentSession === 'regular' ? 'reg' : currentSession,
                                                    rsi: analysis.rsi,
                                                    return3d: analysis.return3d,
                                                    sparkline: analysis.sparkline,
                                                    maxPain: analysis.maxPain,
                                                    maxPainDist: (analysis.maxPain && refPrice) ? Number(((analysis.maxPain - refPrice) / refPrice * 100).toFixed(2)) : null,
                                                    gex: analysis.gex,
                                                    gexM: analysis.gexM,
                                                    pcr: analysis.pcr,
                                                    whaleIndex: analysis.whaleIndex,
                                                    whaleConfidence: analysis.whaleConfidence,
                                                    gammaFlipLevel: analysis.gammaFlipLevel,
                                                    iv: analysis.iv,
                                                    vwap: base.vwap,
                                                    vwapDist: (base.vwap && refPrice) ? Number(((refPrice - base.vwap) / base.vwap * 100).toFixed(2)) : null,
                                                    callWall: analysis.callWall,
                                                    putFloor: analysis.putFloor,
                                                    netPremium: analysis.netPremium,
                                                    volume: base.volume,
                                                    relVol: (_c = analysis.relVol) !== null && _c !== void 0 ? _c : 0,
                                                    extendedPrice: (base.extendedPrice && base.extendedPrice > 0 && base.extendedPrice !== base.displayPrice) ? base.extendedPrice : null,
                                                    extendedChangePct: extendedChangePct,
                                                    extendedLabel: base.extendedLabel,
                                                }
                                            }];
                                    }
                                    // ============================================
                                    // B. CACHE MISS & FAST MODE (PRICE | SSR)
                                    // ============================================
                                    if (mode === 'price' || mode === 'ssr') {
                                        base = buildBasePrice();
                                        extendedChangePct = (base.extendedPrice && base.extendedPrice > 0 && base.displayPrice > 0)
                                            ? ((base.extendedPrice - base.displayPrice) / base.displayPrice) * 100 : null;
                                        return [2 /*return*/, {
                                                ticker: ticker,
                                                realtime: {
                                                    price: base.displayPrice,
                                                    changePct: base.changePct,
                                                    session: currentSession === 'regular' ? 'reg' : currentSession,
                                                    extendedPrice: base.extendedPrice || null,
                                                    extendedChangePct: extendedChangePct,
                                                    extendedLabel: base.extendedLabel,
                                                    volume: base.volume,
                                                    vwap: base.vwap
                                                }
                                            }];
                                    }
                                    _30.label = 1;
                                case 1:
                                    _30.trys.push([1, 3, , 4]);
                                    return [4 /*yield*/, Promise.all([
                                            getStockDataLight(ticker).catch(function () { return null; }),
                                            (0, stockApi_1.getOptionsData)(ticker).catch(function () { return null; }),
                                            (0, structureService_1.getStructureData)(ticker).catch(function () { return null; }),
                                            (0, realtimeMetricsService_1.fetchTradeData)(ticker).catch(function () { return null; }),
                                            (0, realtimeMetricsService_1.fetchShortVolumeData)(ticker).catch(function () { return null; })
                                        ])];
                                case 2:
                                    _a = _30.sent(), stockData = _a[0], optionsData = _a[1], structureRes = _a[2], tradeData = _a[3], shortVolData = _a[4];
                                    if (!stockData)
                                        return [2 /*return*/, { ticker: ticker, error: 'Stock data unavailable' }];
                                    d = new Date();
                                    isOpExWeek = d.getDay() <= 5 && d.getDate() >= 15 && d.getDate() <= 21;
                                    sessionMap = { pre: 'PRE', reg: 'REG', post: 'POST' };
                                    alphaSession = sessionMap[stockData.session] || 'CLOSED';
                                    isREG = alphaSession === 'REG';
                                    dailyResults = stockData.dailyResults || [];
                                    changePct = stockData.changePercent || 0;
                                    if (!isREG && dailyResults.length >= 2) {
                                        lastBar = dailyResults[dailyResults.length - 1];
                                        prevBar = dailyResults[dailyResults.length - 2];
                                        if ((lastBar === null || lastBar === void 0 ? void 0 : lastBar.close) && (prevBar === null || prevBar === void 0 ? void 0 : prevBar.close)) {
                                            changePct = ((lastBar.close - prevBar.close) / prevBar.close) * 100;
                                        }
                                    }
                                    relVol = null;
                                    if (isREG) {
                                        dayVol = stockData.volume || 0;
                                        prevVol = stockData.prevDayVolume || 1;
                                        relVol = dayVol > 0 ? dayVol / prevVol : null;
                                    }
                                    else if (dailyResults.length >= 2) {
                                        lastVol = ((_d = dailyResults[dailyResults.length - 1]) === null || _d === void 0 ? void 0 : _d.volume) || 0;
                                        prevVol = ((_e = dailyResults[dailyResults.length - 2]) === null || _e === void 0 ? void 0 : _e.volume) || 1;
                                        relVol = lastVol > 0 ? lastVol / prevVol : null;
                                    }
                                    return3D = (_f = stockData.return3d) !== null && _f !== void 0 ? _f : null;
                                    if (!isREG && dailyResults.length >= 4) {
                                        lastClose = (_g = dailyResults[dailyResults.length - 1]) === null || _g === void 0 ? void 0 : _g.close;
                                        close4dAgo = (_h = dailyResults[dailyResults.length - 4]) === null || _h === void 0 ? void 0 : _h.close;
                                        if (lastClose && close4dAgo) {
                                            return3D = ((lastClose - close4dAgo) / close4dAgo) * 100;
                                        }
                                    }
                                    sma20 = null;
                                    dailyCloses = dailyResults.map(function (d) { return d.close; }).filter(Boolean);
                                    if (dailyCloses.length >= 20) {
                                        last20 = dailyCloses.slice(-20);
                                        sma20 = parseFloat((last20.reduce(function (a, b) { return a + b; }, 0) / 20).toFixed(2));
                                    }
                                    opts = optionsData;
                                    alphaGex = (_m = (_l = (_j = structureRes === null || structureRes === void 0 ? void 0 : structureRes.netGex) !== null && _j !== void 0 ? _j : (_k = opts === null || opts === void 0 ? void 0 : opts.gems) === null || _k === void 0 ? void 0 : _k.gex) !== null && _l !== void 0 ? _l : opts === null || opts === void 0 ? void 0 : opts.gex) !== null && _m !== void 0 ? _m : null;
                                    alphaPcr = (_o = opts === null || opts === void 0 ? void 0 : opts.putCallRatio) !== null && _o !== void 0 ? _o : null;
                                    alphaGammaFlip = (_r = (_p = structureRes === null || structureRes === void 0 ? void 0 : structureRes.gammaFlipLevel) !== null && _p !== void 0 ? _p : (_q = opts === null || opts === void 0 ? void 0 : opts.gems) === null || _q === void 0 ? void 0 : _q.gammaFlipLevel) !== null && _r !== void 0 ? _r : null;
                                    alphaSqueezeScore = (_s = structureRes === null || structureRes === void 0 ? void 0 : structureRes.squeezeScore) !== null && _s !== void 0 ? _s : null;
                                    if (alphaSqueezeScore === null && alphaGex !== null) {
                                        sq = 25;
                                        absGex = Math.abs(alphaGex);
                                        if (alphaGex < 0)
                                            sq += 15;
                                        if (absGex > 50000000)
                                            sq += 15;
                                        else if (absGex > 10000000)
                                            sq += 10;
                                        else if (absGex > 1000000)
                                            sq += 5;
                                        pcr_1 = alphaPcr !== null && alphaPcr !== void 0 ? alphaPcr : 1;
                                        if (pcr_1 <= 0.4 || pcr_1 >= 1.8)
                                            sq += 10;
                                        else if (pcr_1 <= 0.6 || pcr_1 >= 1.5)
                                            sq += 5;
                                        alphaSqueezeScore = Math.min(100, Math.max(0, sq));
                                    }
                                    rawContracts = (opts === null || opts === void 0 ? void 0 : opts.rawContracts) || [];
                                    currentPrice = stockData.price || 0;
                                    ivSkew = (0, alphaEngine_1.computeIVSkew)(rawContracts, currentPrice);
                                    maxCallOI = 0, maxPutOI = 0;
                                    directCallWall = 0, directPutFloor = 0;
                                    for (_i = 0, rawContracts_1 = rawContracts; _i < rawContracts_1.length; _i++) {
                                        c = rawContracts_1[_i];
                                        oi = c.open_interest || 0;
                                        strike = c.strike_price || 0;
                                        if (c.contract_type === 'call' && oi > maxCallOI) {
                                            maxCallOI = oi;
                                            directCallWall = strike;
                                        }
                                        if (c.contract_type === 'put' && oi > maxPutOI) {
                                            maxPutOI = oi;
                                            directPutFloor = strike;
                                        }
                                    }
                                    impliedMovePct = null;
                                    if (directCallWall > 0 && directPutFloor > 0 && currentPrice > 0) {
                                        impliedMovePct = ((directCallWall - directPutFloor) / currentPrice) * 100;
                                    }
                                    else {
                                        impliedMovePct = (0, alphaEngine_1.computeImpliedMovePct)(rawContracts, currentPrice);
                                    }
                                    whaleIndex = (0, alphaEngine_1.calculateWhaleIndex)(alphaGex);
                                    darkPoolPct = (_t = tradeData === null || tradeData === void 0 ? void 0 : tradeData.darkPoolPercent) !== null && _t !== void 0 ? _t : null;
                                    shortVolPct = (_u = shortVolData === null || shortVolData === void 0 ? void 0 : shortVolData.shortVolPercent) !== null && _u !== void 0 ? _u : null;
                                    blockTradesCount = (_v = tradeData === null || tradeData === void 0 ? void 0 : tradeData.blockTrades) !== null && _v !== void 0 ? _v : null;
                                    netPremium = (_w = structureRes === null || structureRes === void 0 ? void 0 : structureRes.netPremium) !== null && _w !== void 0 ? _w : null;
                                    alphaResult = void 0;
                                    try {
                                        alphaResult = (0, alphaEngine_1.calculateAlphaScore)({
                                            ticker: ticker.toUpperCase(),
                                            session: alphaSession,
                                            price: currentPrice,
                                            prevClose: stockData.prevClose || 0,
                                            changePct: changePct,
                                            vwap: (_x = stockData.vwap) !== null && _x !== void 0 ? _x : null,
                                            return3D: return3D,
                                            rsi14: (_y = stockData.rsi) !== null && _y !== void 0 ? _y : null,
                                            pcr: alphaPcr,
                                            gex: alphaGex,
                                            rawChain: rawContracts,
                                            callWall: directCallWall || (structureRes === null || structureRes === void 0 ? void 0 : structureRes.callWall) || null,
                                            putFloor: directPutFloor || (structureRes === null || structureRes === void 0 ? void 0 : structureRes.putFloor) || null,
                                            gammaFlipLevel: alphaGammaFlip,
                                            squeezeScore: alphaSqueezeScore,
                                            relVol: relVol,
                                            optionsDataAvailable: !!opts,
                                            preMarketChangePct: (_z = stockData.extendedChangePct) !== null && _z !== void 0 ? _z : null,
                                            preMarketVolume: (_0 = stockData.preMarketVolume) !== null && _0 !== void 0 ? _0 : null, // [V5.5]
                                            isOpExWeek: isOpExWeek, // [V5.5]
                                            ndxChangePct: (_1 = macroData === null || macroData === void 0 ? void 0 : macroData.ndxChangePct) !== null && _1 !== void 0 ? _1 : null,
                                            vixValue: (_2 = macroData === null || macroData === void 0 ? void 0 : macroData.vixValue) !== null && _2 !== void 0 ? _2 : null,
                                            vixChangePct: (_3 = macroData === null || macroData === void 0 ? void 0 : macroData.vixChangePct) !== null && _3 !== void 0 ? _3 : null,
                                            tltChangePct: (_4 = macroData === null || macroData === void 0 ? void 0 : macroData.tltChangePct) !== null && _4 !== void 0 ? _4 : null,
                                            gldChangePct: (_5 = macroData === null || macroData === void 0 ? void 0 : macroData.gldChangePct) !== null && _5 !== void 0 ? _5 : null,
                                            dxy: (_6 = macroData === null || macroData === void 0 ? void 0 : macroData.dxy) !== null && _6 !== void 0 ? _6 : null,
                                            realYieldStance: (_7 = macroData === null || macroData === void 0 ? void 0 : macroData.realYieldStance) !== null && _7 !== void 0 ? _7 : null,
                                            darkPoolPct: darkPoolPct,
                                            shortVolPct: shortVolPct,
                                            blockTrades: blockTradesCount,
                                            whaleIndex: whaleIndex,
                                            netFlow: netPremium,
                                            sma20: sma20,
                                            ivSkew: ivSkew,
                                            impliedMovePct: impliedMovePct,
                                            atmIv: (_8 = structureRes === null || structureRes === void 0 ? void 0 : structureRes.atmIv) !== null && _8 !== void 0 ? _8 : null,
                                            fearGreedScore: fearGreedScore,
                                        });
                                    }
                                    catch (e) {
                                        console.error("[Watchlist Batch] V5 Engine failed for ".concat(ticker, ":"), e);
                                        alphaResult = (0, alphaEngine_1.calculateAlphaScore)({
                                            ticker: ticker.toUpperCase(), session: alphaSession, price: currentPrice,
                                            prevClose: stockData.prevClose || 0,
                                            changePct: changePct,
                                            preMarketChangePct: (_9 = stockData.extendedChangePct) !== null && _9 !== void 0 ? _9 : null,
                                            preMarketVolume: (_10 = stockData.preMarketVolume) !== null && _10 !== void 0 ? _10 : null,
                                            isOpExWeek: isOpExWeek,
                                            ndxChangePct: (_11 = macroData === null || macroData === void 0 ? void 0 : macroData.ndxChangePct) !== null && _11 !== void 0 ? _11 : null, vixValue: (_12 = macroData === null || macroData === void 0 ? void 0 : macroData.vixValue) !== null && _12 !== void 0 ? _12 : null,
                                            tltChangePct: (_13 = macroData === null || macroData === void 0 ? void 0 : macroData.tltChangePct) !== null && _13 !== void 0 ? _13 : null, gldChangePct: (_14 = macroData === null || macroData === void 0 ? void 0 : macroData.gldChangePct) !== null && _14 !== void 0 ? _14 : null,
                                        });
                                    }
                                    score = alphaResult.score, grade = alphaResult.grade, action = alphaResult.action, actionKR = alphaResult.actionKR, whyKR = alphaResult.whyKR, triggers = alphaResult.triggerCodes, confidence = alphaResult.dataCompleteness;
                                    hasOptionsData = opts && ((opts === null || opts === void 0 ? void 0 : opts.maxPain) || ((_15 = opts === null || opts === void 0 ? void 0 : opts.gems) === null || _15 === void 0 ? void 0 : _15.gex) || (opts === null || opts === void 0 ? void 0 : opts.gex));
                                    maxPain = hasOptionsData ? ((opts === null || opts === void 0 ? void 0 : opts.maxPain) || null) : null;
                                    rawGex = ((_16 = opts === null || opts === void 0 ? void 0 : opts.gems) === null || _16 === void 0 ? void 0 : _16.gex) || (opts === null || opts === void 0 ? void 0 : opts.gex);
                                    gex = hasOptionsData ? (rawGex || null) : null;
                                    whaleConfidence = 'NONE';
                                    pcr = (opts === null || opts === void 0 ? void 0 : opts.putCallRatio) || 1;
                                    if (gex !== null && gex !== undefined) {
                                        if (gex > 0 && pcr < 0.8)
                                            whaleConfidence = 'HIGH';
                                        else if (gex > 0 && pcr <= 1.2)
                                            whaleConfidence = 'MED';
                                        else
                                            whaleConfidence = 'LOW';
                                    }
                                    gammaFlipLevel = (_17 = structureRes === null || structureRes === void 0 ? void 0 : structureRes.gammaFlipLevel) !== null && _17 !== void 0 ? _17 : null;
                                    structureGexM = (structureRes === null || structureRes === void 0 ? void 0 : structureRes.netGex) ? Number((structureRes.netGex / 1000000).toFixed(2)) : null;
                                    structureMaxPain = (_18 = structureRes === null || structureRes === void 0 ? void 0 : structureRes.maxPain) !== null && _18 !== void 0 ? _18 : null;
                                    iv = (_22 = (_21 = (_19 = structureRes === null || structureRes === void 0 ? void 0 : structureRes.atmIv) !== null && _19 !== void 0 ? _19 : (_20 = opts === null || opts === void 0 ? void 0 : opts.gems) === null || _20 === void 0 ? void 0 : _20.iv) !== null && _21 !== void 0 ? _21 : opts === null || opts === void 0 ? void 0 : opts.iv) !== null && _22 !== void 0 ? _22 : null;
                                    finalMaxPain = structureMaxPain !== null && structureMaxPain !== void 0 ? structureMaxPain : maxPain;
                                    finalMaxPainDist = (finalMaxPain && currentPrice) ? Number(((finalMaxPain - currentPrice) / currentPrice * 100).toFixed(2)) : null;
                                    fullObj = {
                                        ticker: ticker,
                                        alphaSnapshot: {
                                            score: score,
                                            grade: grade,
                                            action: action,
                                            actionKR: actionKR,
                                            whyKR: whyKR,
                                            confidence: Math.round(confidence),
                                            triggers: triggers,
                                            pillars: alphaResult.pillars, gatesApplied: alphaResult.gatesApplied,
                                            engineVersion: alphaResult.engineVersion, capturedAt: new Date().toISOString()
                                        },
                                        realtime: {
                                            price: stockData.price || 0,
                                            changePct: changePct,
                                            session: stockData.session || 'reg',
                                            rsi: stockData.rsi || null, return3d: stockData.return3d || null,
                                            sparkline: ((_23 = stockData.history) === null || _23 === void 0 ? void 0 : _23.slice(-20).map(function (h) { return h.close; })) || [],
                                            maxPain: finalMaxPain, maxPainDist: finalMaxPainDist,
                                            gex: (_24 = structureRes === null || structureRes === void 0 ? void 0 : structureRes.netGex) !== null && _24 !== void 0 ? _24 : null, gexM: structureGexM,
                                            pcr: (opts === null || opts === void 0 ? void 0 : opts.putCallRatio) || null, whaleIndex: Math.round(whaleIndex),
                                            whaleConfidence: whaleConfidence,
                                            gammaFlipLevel: gammaFlipLevel,
                                            iv: iv,
                                            vwap: stockData.vwap || null,
                                            vwapDist: (stockData.vwap && stockData.price) ? Number(((stockData.price - stockData.vwap) / stockData.vwap * 100).toFixed(2)) : null,
                                            callWall: (_26 = (_25 = structureRes === null || structureRes === void 0 ? void 0 : structureRes.levels) === null || _25 === void 0 ? void 0 : _25.callWall) !== null && _26 !== void 0 ? _26 : null, putFloor: (_28 = (_27 = structureRes === null || structureRes === void 0 ? void 0 : structureRes.levels) === null || _27 === void 0 ? void 0 : _27.putFloor) !== null && _28 !== void 0 ? _28 : null,
                                            netPremium: (_29 = structureRes === null || structureRes === void 0 ? void 0 : structureRes.netPremium) !== null && _29 !== void 0 ? _29 : null, volume: stockData.volume || 0,
                                            relVol: relVol !== null && relVol !== void 0 ? relVol : 0,
                                            extendedPrice: stockData.extendedPrice || null,
                                            extendedChangePct: stockData.extendedChangePct || null,
                                            extendedLabel: stockData.extendedLabel || undefined
                                        }
                                    };
                                    // 🔥 [GLOBAL CACHE WARMMER] Instantly write ANY custom ticker to Cache for future Zero-Latency SSR
                                    (0, analysisCache_1.writeAnalysisCache)(ticker, {
                                        ticker: ticker,
                                        timestamp: Date.now(),
                                        alphaSnapshot: fullObj.alphaSnapshot,
                                        rsi: fullObj.realtime.rsi,
                                        return3d: fullObj.realtime.return3d,
                                        sparkline: fullObj.realtime.sparkline,
                                        relVol: fullObj.realtime.relVol,
                                        maxPain: fullObj.realtime.maxPain,
                                        gex: fullObj.realtime.gex,
                                        gexM: fullObj.realtime.gexM,
                                        pcr: fullObj.realtime.pcr,
                                        callWall: fullObj.realtime.callWall,
                                        putFloor: fullObj.realtime.putFloor,
                                        gammaFlipLevel: fullObj.realtime.gammaFlipLevel,
                                        squeezeScore: alphaSqueezeScore,
                                        iv: fullObj.realtime.iv,
                                        whaleIndex: fullObj.realtime.whaleIndex,
                                        whaleConfidence: fullObj.realtime.whaleConfidence,
                                        netPremium: fullObj.realtime.netPremium,
                                        vwapDist: fullObj.realtime.vwapDist,
                                        volume: fullObj.realtime.volume
                                    }).catch(function (e) { return console.error("Failed to write analysis cache for ".concat(ticker), e); });
                                    return [2 /*return*/, fullObj];
                                case 3:
                                    error_1 = _30.sent();
                                    console.error("Batch analyze error for ".concat(ticker, ":"), error_1);
                                    return [2 /*return*/, { ticker: ticker, error: 'Analysis failed' }];
                                case 4: return [2 /*return*/];
                            }
                        });
                    }); }))];
                case 12:
                    results = _o.sent();
                    return [2 /*return*/, {
                            results: results,
                            meta: {
                                count: tickers.length,
                                elapsed: Date.now() - startTime,
                                source: mode === 'full' ? (missingTickers.length === 0 ? 'analysis_cache' : 'hybrid_compute') : 'polygon_snapshot_fast',
                                cached: missingTickers.length === 0
                            }
                        }];
            }
        });
    });
}
