'use strict';
/* ============================================================================
 * 데이터 무결성 감시기 — 기준값 읽기 (I/O)
 *
 *   ⚠ 감시 대조 전용. 여기서 읽은 값은 화면에 쓰지 않고, 저장도 «감시 결과 파일»에만 한다(대표 지시 10/13).
 *   기준 둘을 같이 읽는다 — 하나가 틀려도 다른 하나가 있으면 «기준 불일치»로 분류해 오탐을 줄인다.
 *     야후 차트(Yahoo chart)  1분봉(프리·애프터 포함) + 일봉(공식 종가·분할/배당 이벤트)
 *     나스닥 공개 시세        정규장 마지막 체결 · 프리/애프터 «통합 마지막 체결»(Consolidated Last Trade) + 체결 목록(시각)
 *   Intrinio 는 부르지 않는다(429 사고 재발 방지). 공개 기준에도 간격·동시성 제한을 둔다.
 * ========================================================================== */
const { etDateOf } = require('./clock');

const YAHOO_UA = 'Mozilla/5.0';                     // 브라우저형 UA 는 야후가 429 로 막는다(10/13 실측) — 짧은 UA 만 통과
const NQ_HEAD = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const yahooSym = (s) => String(s).toUpperCase().replace(/\./g, '-');

/** 동시 N · 호출 간격 최소 gapMs 의 작은 작업 큐 */
function limiter(concurrency, gapMs) {
    let active = 0, lastStart = 0;
    const waiters = [];
    const pump = async () => {
        while (active < concurrency && waiters.length) {
            const job = waiters.shift();
            active++;
            const wait = Math.max(0, lastStart + gapMs - Date.now());
            lastStart = Date.now() + wait;
            (async () => { if (wait) await sleep(wait); try { job.resolve(await job.fn()); } catch (e) { job.reject(e); } finally { active--; pump(); } })();
        }
    };
    return (fn) => new Promise((resolve, reject) => { waiters.push({ fn, resolve, reject }); pump(); });
}

async function getJson(url, headers, { timeoutMs = 20000, retries = 2 } = {}) {
    let last = { ok: false, status: 0, body: null, err: 'unreached' };
    for (let i = 0; i <= retries; i++) {
        try {
            const r = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
            const txt = await r.text();
            let body = null; try { body = JSON.parse(txt); } catch { /* 429 본문은 "Too Many Requests" 평문 */ }
            last = { ok: r.ok && body !== null, status: r.status, body, err: r.ok ? null : txt.slice(0, 60) };
            if (last.ok) return last;
            if (r.status !== 429 && r.status < 500) return last;   // 429·5xx 만 다시 시도
        } catch (e) { last = { ok: false, status: 0, body: null, err: String(e && e.message || e) }; }
        await sleep(1200 * (i + 1));
    }
    return last;
}

const yq = limiter(3, 160);
const nq = limiter(3, 220);

const money = (s) => { const n = Number(String(s ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) && String(s ?? '').trim() !== '' ? n : null; };

/** 야후 1분봉(프리·애프터 포함) 2일 */
function fetchYahoo1m(sym) {
    return yq(async () => {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym(sym))}?interval=1m&range=2d&includePrePost=true`;
        const r = await getJson(url, { 'User-Agent': YAHOO_UA, Accept: 'application/json' });
        const res = r.body && r.body.chart && r.body.chart.result && r.body.chart.result[0];
        if (!r.ok || !res || !Array.isArray(res.timestamp)) return { ok: false, status: r.status, err: r.err || 'no result', bars: [] };
        const q = res.indicators && res.indicators.quote && res.indicators.quote[0] || {};
        const bars = [];
        for (let i = 0; i < res.timestamp.length; i++) {
            const c = q.close && q.close[i];
            if (!(c > 0)) continue;
            bars.push({ t: res.timestamp[i] * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c, v: q.volume[i] || 0 });
        }
        const m = res.meta || {};
        return { ok: true, status: r.status, bars, meta: { regularMarketPrice: m.regularMarketPrice, regularMarketTime: m.regularMarketTime ? m.regularMarketTime * 1000 : null, previousClose: m.previousClose, chartPreviousClose: m.chartPreviousClose, instrumentType: m.instrumentType } };
    });
}

/** 야후 일봉 15일 + 분할·배당 이벤트 */
function fetchYahooDaily(sym) {
    return yq(async () => {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym(sym))}?interval=1d&range=15d&events=div%2Csplit`;
        const r = await getJson(url, { 'User-Agent': YAHOO_UA, Accept: 'application/json' });
        const res = r.body && r.body.chart && r.body.chart.result && r.body.chart.result[0];
        if (!r.ok || !res || !Array.isArray(res.timestamp)) return { ok: false, status: r.status, err: r.err || 'no result', daily: [], events: [] };
        const q = res.indicators && res.indicators.quote && res.indicators.quote[0] || {};
        const daily = [];
        for (let i = 0; i < res.timestamp.length; i++) {
            const c = q.close && q.close[i];
            if (!(c > 0)) continue;
            daily.push({ date: etDateOf(res.timestamp[i] * 1000), o: q.open[i], h: q.high[i], l: q.low[i], c, v: q.volume[i] || 0 });
        }
        const ev = [];
        const evs = res.events || {};
        for (const [kind, map] of [['dividend', evs.dividends], ['split', evs.splits]]) {
            for (const x of Object.values(map || {})) ev.push({ kind, date: etDateOf((x.date || 0) * 1000), amount: x.amount ?? null, ratio: x.numerator && x.denominator ? x.numerator / x.denominator : null });
        }
        return { ok: true, status: r.status, daily, events: ev };
    });
}

/** 나스닥 info — 정규장 마지막 체결(마감 뒤엔 공식 종가) */
function fetchNasdaqInfo(sym, cls) {
    return nq(async () => {
        const classes = cls ? [cls] : ['stocks', 'etf'];
        let r = null;
        for (const c of classes) {
            r = await getJson(`https://api.nasdaq.com/api/quote/${encodeURIComponent(String(sym).toUpperCase())}/info?assetclass=${c}`, NQ_HEAD, { retries: 1 });
            const d = r.body && r.body.data;
            if (d && d.primaryData) {
                const p = d.primaryData;
                return { ok: true, cls: c, price: money(p.lastSalePrice), net: money(p.netChange), pct: money(String(p.percentageChange || '').replace('%', '')), stamp: p.lastTradeTimestamp || null, realTime: !!p.isRealTime, status: d.marketStatus || null, secondary: d.secondaryData || null, volume: money(p.volume) };
            }
        }
        return { ok: false, status: r && r.status, err: r && (r.err || (r.body && r.body.status && JSON.stringify(r.body.status.bCodeMessage))) || 'no data' };
    });
}

/** 나스닥 프리/애프터 — 통합 마지막 체결 + 체결 목록(시각 ET) */
function fetchNasdaqExt(sym, cls, kind) {
    return nq(async () => {
        const r = await getJson(`https://api.nasdaq.com/api/quote/${encodeURIComponent(String(sym).toUpperCase())}/extended-trading?assetclass=${cls || 'stocks'}&markettype=${kind}`, NQ_HEAD, { retries: 1 });
        const d = r.body && r.body.data;
        if (!r.ok || !d || !d.infoTable) return { ok: false, status: r.status, err: r.err || 'no data', trades: [] };
        const row = (d.infoTable.rows || [])[0] || {};
        const m = /^\s*\$?([\d,.]+)/.exec(String(row.consolidated || ''));
        const trades = ((d.tradeDetailTable && d.tradeDetailTable.rows) || []).map((x) => ({ hms: x.time, price: money(x.price), size: Number(String(x.shareVolume || '0').replace(/,/g, '')) || 0 })).filter((x) => x.price > 0);
        return { ok: true, last: m ? Number(m[1].replace(/,/g, '')) : null, volume: money(row.volume), asOf: (d.lastUpdateInfo || [])[0] || null, trades };
    });
}

module.exports = { fetchYahoo1m, fetchYahooDaily, fetchNasdaqInfo, fetchNasdaqExt, limiter, getJson, money, yahooSym, sleep };
