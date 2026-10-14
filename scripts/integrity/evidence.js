'use strict';
// 회차 증거는 가격·시각 허용 목록만 저장한다. 응답 본문·헤더·인증 정보는 저장하지 않는다.
const rules = require('./rules');
const screen = require('./screen');
const MAX_TRADES = 120;
const MAX_TRADE_BYTES = 24 * 1024;
const numeric = (v) => typeof v === 'number' && Number.isFinite(v) ? v : null;
const timestamp = (v) => {
    if (typeof v === 'number') return v > 0 && Number.isFinite(v) ? v : null;
    if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(v)) return null;
    const n = Date.parse(v); return Number.isFinite(n) ? n : null;
};
const date = (v) => typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) ? v : null;
const label = (v) => ['PRE', 'POST', 'PRE CLOSE', 'POST (CLOSED)', 'PRE (CLOSED)', 'live', 'close', 'pre', 'post', 'regular', 'closed'].includes(v) ? v : null;
function request(r) {
    return { ok: !!(r && r.ok), status: numeric(r && r.status), startedAt: timestamp(r && r.startedAt), receivedAt: timestamp(r && r.receivedAt) };
}
function quote(q) {
    if (!q) return null;
    return { price: numeric(q.price), previousClose: numeric(q.previousClose), changePercent: numeric(q.changePercent),
        extendedPrice: numeric(q.extendedPrice), extendedChangePercent: numeric(q.extendedChangePercent), extendedTime: timestamp(q.extendedTime),
        extendedDate: date(q.extendedDate), extendedLabel: label(q.extendedLabel), extendedKind: label(q.extendedKind), session: label(q.session) };
}
function ticker(t) {
    if (!t) return null;
    const extended = {}, prices = {};
    for (const k of ['pre', 'post', 'prevPost']) {
        const x = t.extended || {};
        extended[k + 'Price'] = numeric(x[k + 'Price']);
        extended[k + 'Time'] = timestamp(x[k + 'Time']);
        extended[k + 'Date'] = date(x[k + 'Date']);
    }
    for (const k of ['prePrice', 'postPrice', 'regularCloseToday', 'prevRegularClose']) prices[k] = numeric((t.prices || {})[k]);
    return { extended, prices, stale: !!t._stale, failed: !!t.__error };
}
function boundedTrades(trades) {
    const items = []; let bytes = 2;
    for (const t of [...trades].sort((a, b) => b.ms - a.ms)) {
        const row = { ms: timestamp(t.ms), price: numeric(t.price), lo: numeric(t.lo), hi: numeric(t.hi), size: numeric(t.size), src: t.src === 'n' ? 'n' : 'y', matchOnly: !!t.matchOnly };
        const size = Buffer.byteLength(JSON.stringify(row)) + (items.length ? 1 : 0);
        if (items.length >= MAX_TRADES || bytes + size > MAX_TRADE_BYTES) break;
        items.push(row); bytes += size;
    }
    return { total: trades.length, retained: items.length, truncated: items.length < trades.length, bytes, items };
}
function flowObservation(ctx, sym, displayed = null) {
    const q = ctx.quotes.data[sym], t = ctx.tickers.out[sym];
    const shown = displayed || screen.flowScreen(q, t, null, ctx.S.session === 'closed');
    if (!shown) return { source: null, time: null, receivedAt: null };
    if (q && q.extendedPrice > 0 && q.extendedLabel) return { source: 'quotes', time: timestamp(q.extendedTime), receivedAt: timestamp((ctx.quotes.receipts || {})[sym]?.receivedAt) };
    const x = (t && t.extended) || {};
    const key = shown.carry && ctx.S.session === 'pre' ? 'prevPost' : /^POST/.test(shown.extLabel) ? 'post' : 'pre';
    // prices.* 대체값에는 대응 체결 시각이 없다. 값이 우연히 같은 다른 시각을 붙이지 않는다.
    const fromExtended = x[key + 'Price'] > 0 && x[key + 'Price'] === shown.extPrice;
    return { source: 'ticker', time: fromExtended ? timestamp(x[key + 'Time']) : null,
        receivedAt: timestamp((ctx.tickers.receipts || {})[sym]?.receivedAt), missingTime: !fromExtended || !timestamp(x[key + 'Time']) };
}
function timing(f, ctx) {
    let obs = { source: null, time: null, receivedAt: null };
    if (/^(TRANSIENT_)?EXT_/.test(f.code)) {
        if (f.door === 'screen:flow') obs = flowObservation(ctx, f.sym);
        else if (['quotes', 'screen:list'].includes(f.door)) obs = { source: 'quotes', time: timestamp(ctx.quotes.data[f.sym]?.extendedTime), receivedAt: timestamp((ctx.quotes.receipts || {})[f.sym]?.receivedAt) };
    }
    const delta = obs.time != null && obs.receivedAt != null ? (obs.time - obs.receivedAt) / 60000 : null;
    return { source: obs.source, appTradeTimeMs: obs.time, receivedAt: obs.receivedAt,
        appMinusReceivedMin: delta == null ? null : Math.round(delta * 10000) / 10000,
        delayedFeedSuspected: delta != null && delta >= -17 && delta <= -13 };
}
// 증거 설명 전용. 판정 규칙·비교 후보·집계에는 연결하지 않는다.
function extCoverage(now, S, ref, kind) {
    const nas = kind === 'pre' ? ref._nPre : ref._nPost;
    const trades = ref.extTrades(kind, S.today, nas).filter((t) => t.src === 'n' && t.ms <= now);
    const earliest = trades.length ? Math.min(...trades.map((t) => t.ms)) : null;
    const latest = trades.length ? Math.max(...trades.map((t) => t.ms)) : null;
    const requiredFrom = now - rules.EXT_DELAY_MS - 6 * 60e3, requiredTo = now - 6 * 60e3;
    const reasons = [];
    if (!nas) reasons.push('Nasdaq 조회 실패 또는 미조회');
    else {
        const day = rules.parseEnDate(nas.asOf);
        if (!day) reasons.push('Nasdaq 기준 날짜 없음');
        else if (day !== S.today) reasons.push('Nasdaq 기준 날짜 불일치');
        if (!trades.length) reasons.push('당일 Nasdaq 체결 목록 없음');
        else {
            if (earliest > requiredFrom) reasons.push('Nasdaq 체결 범위가 지연 허용 창보다 짧음');
            if (latest < requiredTo) reasons.push('Nasdaq 최신 체결이 오래됨');
        }
    }
    return { sufficient: reasons.length === 0, reasons, count: trades.length, earliest, latest, requiredFrom, requiredTo };
}
function postCarryCoverage(S, ref) {
    const p = ref.postClose, nas = ref._nPost, reasons = [];
    if (!nas) reasons.push('직전 POST Nasdaq 조회 실패 또는 미조회');
    else if (rules.parseEnDate(nas.asOf) !== S.lastClosed) reasons.push('직전 POST 기준 날짜 누락 또는 불일치');
    const trades = (p && p.trades || []).filter((t) => t.src === 'n');
    if (!p || p.src !== 'n' || !trades.some((t) => t.ms >= trades[0].ms - 1000 && Math.abs(t.price - p.price) <= rules.tolExt(p.price))) {
        reasons.push('직전 POST 통합 마지막 체결 목록 미확보');
    }
    return { sufficient: reasons.length === 0, reasons };
}
function annotate(findings, ctx) {
    const refs = new Map();
    for (const f of findings) {
        f.timing = timing(f, ctx);
        if (f.timing.delayedFeedSuspected) f.msg += ' [지연 피드 의심]';
        if (!/^(TRANSIENT_)?EXT_/.test(f.code) || !f.sym || !['pre', 'post'].includes(ctx.S.session)) continue;
        if (!refs.has(f.sym)) refs.set(f.sym, rules.deriveRef(ctx.t0, ctx.S, ctx.refRaw[f.sym] || {}));
        const ref = refs.get(f.sym);
        const q = ctx.quotes.data[f.sym];
        const shown = f.door === 'screen:flow' ? screen.flowScreen(q, ctx.tickers.out[f.sym], null, false) : null;
        const carry = ctx.S.session === 'pre' && /^POST/.test(shown ? shown.extLabel : q && q.extendedLabel || '');
        f.referenceCoverage = carry ? postCarryCoverage(ctx.S, ref) : extCoverage(ctx.t0, ctx.S, ref, ctx.S.session);
        if (!f.referenceCoverage.sufficient) f.msg += ` [기준 부족: ${f.referenceCoverage.reasons.join('; ')}]`;
    }
    return findings;
}
function findingSummary(findings) {
    return findings.map((f) => ({ sev: f.sev, code: f.code, door: f.door, sym: f.sym, field: f.field,
        app: numeric(f.app), ref: numeric(f.ref), timing: f.timing, referenceCoverage: f.referenceCoverage }));
}
function capture(ctx, findings) {
    const rows = {};
    for (const sym of new Set(findings.filter((f) => /^(TRANSIENT_)?EXT_/.test(f.code) && f.sym).map((f) => f.sym))) {
        const raw = ctx.refRaw[sym]; if (!raw) continue;
        const ref = rules.deriveRef(ctx.t0, ctx.S, raw), S = ctx.S;
        const windows = [['pre', S.today], ['post', S.lastClosed]];
        const comparisons = windows.map(([kind, day]) => {
            const nas = kind === 'pre' ? ref._nPre : ref._nPost;
            return { kind, date: day, request: request(raw[kind === 'pre' ? 'nPre' : 'nPost']), asOfDate: rules.parseEnDate(nas && nas.asOf),
                last: numeric(nas && nas.last), volume: numeric(nas && nas.volume), trades: boundedTrades(ref.extTrades(kind, day, nas)) };
        });
        rows[sym] = { quote: quote(ctx.quotes.data[sym]), quoteRequest: request((ctx.quotes.receipts || {})[sym]),
            ticker: ticker(ctx.tickers.out[sym]), tickerRequest: request((ctx.tickers.receipts || {})[sym]),
            yahooRequest: request(raw.y1m), comparisons,
            coverage: ['pre', 'post'].includes(S.session) ? extCoverage(ctx.t0, S, ref, S.session) : null,
            postCarryCoverage: S.session === 'pre' ? postCarryCoverage(S, ref) : null };
    }
    return { at: ctx.t0, capturedAt: Date.now(), rows };
}
module.exports = { request, quote, ticker, boundedTrades, flowObservation, timing, extCoverage, postCarryCoverage, annotate, findingSummary, capture, MAX_TRADES, MAX_TRADE_BYTES };
