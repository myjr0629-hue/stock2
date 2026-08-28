/**
 * Lambda 공용 Intrinio 어댑터 — Massive(Polygon) 응답 스키마로 변환
 *
 * Vercel 쪽 src/services/intrinioClient.ts + intrinioRouter.ts 와 **같은 로직**이다.
 * 인프라맵 §0 원칙: "동일한 티커는 Lambda/Vercel 어디서든 같은 공식으로 같은 결과."
 * 한쪽을 고치면 반드시 다른 쪽도 함께 고칠 것.
 *
 * 사용법 — 각 Lambda 의 httpsGet() 안에서:
 *   const { routeMassiveUrl } = require('./intrinio-adapter');
 *   const routed = await routeMassiveUrl(url);
 *   if (routed !== undefined) return routed;
 *
 * ⚠️ 뉴스(/v2/reference/news)는 라우팅하지 않는다 — Massive 유지(2026-09-23 해지까지).
 */

const INTRINIO_BASE = process.env.INTRINIO_BASE_URL || 'https://api-v2.intrinio.com';
const INTRINIO_KEY = process.env.INTRINIO_API_KEY || '';

const PASSTHROUGH = ['/v2/reference/news'];

const UNSUPPORTED = [
  '/stocks/v1/short-interest',
  '/v1/short-volume',
  '/v3/reference/dividends',
  '/v1/related-companies',
  '/v3/trades',
  '/v3/quotes',
  '/v2/last/trade',
];

// ── 저수준 호출 ──────────────────────────────────────────────
async function callIntrinio(path, params = {}, timeoutMs = 15000) {
  if (!INTRINIO_KEY) throw new Error('ENV_MISSING: INTRINIO_API_KEY');
  const qs = new URLSearchParams({ ...params, api_key: INTRINIO_KEY });
  const url = `${INTRINIO_BASE}/${String(path).replace(/^\//, '')}?${qs}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Intrinio ${res.status} ${path}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const num = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
const toMs = (iso) => { const t = Date.parse(iso || ''); return Number.isNaN(t) ? 0 : t; };
const dateToMs = (d) => { const t = Date.parse(`${d}T00:00:00Z`); return Number.isNaN(t) ? 0 : t; };
function addDays(d, n) {
  const t = Date.parse(`${d}T00:00:00Z`);
  if (Number.isNaN(t)) return d;
  return new Date(t + n * 86400000).toISOString().slice(0, 10);
}

function bar(o, h, l, c, v, vw) {
  const close = num(c) || 0;
  return {
    o: num(o) || 0, h: num(h) || 0, l: num(l) || 0, c: close, v: num(v) || 0,
    vw: num(vw) != null ? num(vw)
      : (close > 0 ? Math.round((((num(h) || 0) + (num(l) || 0) + close) / 3) * 10000) / 10000 : 0),
  };
}

// ── 1) 개별 스냅샷 ───────────────────────────────────────────
async function getTickerSnapshot(ticker) {
  const sym = String(ticker).toUpperCase();
  const [rt, hist] = await Promise.all([
    callIntrinio(`securities/${sym}/prices/realtime`).catch(() => null),
    callIntrinio(`securities/${sym}/prices`, { page_size: '2' }).catch(() => null),
  ]);

  const bars = (hist && hist.stock_prices) || [];
  const todayBar = bars[0] || null;
  const prevBar = bars[1] || null;
  if (!rt && !todayBar) return { status: 'NOT_FOUND', ticker: null };

  const prevClose = num(rt && rt.eod_close_price) ?? num(todayBar && todayBar.close) ?? num(prevBar && prevBar.close) ?? 0;
  const last = num(rt && rt.last_price) ?? num(rt && rt.normal_market_hours_last_price) ?? num(rt && rt.close_price) ?? prevClose;
  const change = last != null && prevClose ? last - prevClose : 0;
  const changePerc = prevClose ? (change / prevClose) * 100 : 0;

  const dayBar = bar(rt && rt.open_price, rt && rt.high_price, rt && rt.low_price, last,
    (rt && (rt.market_volume || rt.exchange_volume)) || 0);
  const prevSrc = todayBar || prevBar;
  const prevDayBar = prevSrc
    ? bar(prevSrc.open, prevSrc.high, prevSrc.low, prevSrc.close, prevSrc.volume)
    : bar(0, 0, 0, prevClose, 0);

  return {
    status: 'OK',
    ticker: {
      ticker: sym,
      todaysChange: Math.round(change * 10000) / 10000,
      todaysChangePerc: Math.round(changePerc * 10000) / 10000,
      updated: toMs(rt && (rt.updated_on || rt.last_time)) * 1e6,
      day: dayBar,
      prevDay: prevDayBar,
      lastTrade: { p: last || 0, s: num(rt && rt.last_size) || 0, t: toMs(rt && rt.last_time) * 1e6, c: [] },
      lastQuote: {
        P: num(rt && rt.ask_price) || 0, S: num(rt && rt.ask_size) || 0,
        p: num(rt && rt.bid_price) || 0, s: num(rt && rt.bid_size) || 0,
        t: toMs(rt && rt.bid_time) * 1e6,
      },
      min: Object.assign({}, dayBar, { t: toMs(rt && rt.last_time), n: 0 }),
    },
  };
}

// ── 2) 일봉 ──────────────────────────────────────────────────
async function getDailyAggregates(ticker, from, to, opts = {}) {
  const sym = String(ticker).toUpperCase();
  const limit = Math.min(opts.limit || 5000, 10000);
  const data = await callIntrinio(`securities/${sym}/prices`, {
    start_date: from, end_date: to, frequency: 'daily',
    page_size: String(Math.min(limit, 10000)),
  });
  const rows = (data && data.stock_prices) || [];
  const ordered = opts.sort === 'desc' ? rows : rows.slice().reverse();
  const results = ordered.slice(0, limit).map((r) => ({
    t: dateToMs(r.date),
    o: num(r.open) || 0, h: num(r.high) || 0, l: num(r.low) || 0,
    c: num(r.close) || 0, v: num(r.volume) || 0,
    vw: Math.round((((num(r.high) || 0) + (num(r.low) || 0) + (num(r.close) || 0)) / 3) * 10000) / 10000,
    n: 0,
  }));
  return { ticker: sym, queryCount: results.length, resultsCount: results.length, adjusted: true, results, status: 'OK' };
}

// ── 2-b) 분봉/시간봉 ─────────────────────────────────────────
// Intrinio: securities/{t}/prices/intervals?interval_size=5m
// 지원: 1m 5m 15m 30m 60m
function toIntrinioInterval(mult, span) {
  const s = String(span).toLowerCase();
  if (s === 'hour') return mult === 1 ? '60m' : null;
  if (s !== 'minute') return null;
  if ([1, 5, 15, 30, 60].includes(mult)) return `${mult}m`;
  if (mult < 5) return '1m';
  if (mult < 15) return '5m';
  if (mult < 30) return '15m';
  if (mult < 60) return '30m';
  return '60m';
}

async function getIntradayAggregates(ticker, mult, span, from, to, opts = {}) {
  const interval = toIntrinioInterval(Number(mult), span);
  if (!interval) return undefined;

  const sym = String(ticker).toUpperCase();
  const limit = Math.min(opts.limit || 1000, 1000);
  // ⚠️ end_date 는 배타적(exclusive) → +1일. page_size 상한 1000. (2026-08-29 실측)
  const data = await callIntrinio(`securities/${sym}/prices/intervals`, {
    interval_size: interval,
    start_date: from,
    end_date: addDays(to, 1),
    page_size: String(Math.min(Math.max(limit, 100), 1000)),
  });

  const rows = (data && data.intervals) || [];
  const ordered = opts.sort === 'desc' ? rows : rows.slice().reverse();
  const results = ordered.slice(0, limit).map((r) => ({
    t: toMs(r.time),
    o: num(r.open) || 0, h: num(r.high) || 0, l: num(r.low) || 0,
    c: num(r.close) || 0, v: num(r.volume) || 0,
    vw: num(r.average) ?? num(r.close) ?? 0,
    n: num(r.trade_count) || 0,
  }));

  return { ticker: sym, queryCount: results.length, resultsCount: results.length, adjusted: true, results, status: 'OK' };
}

// ── 3) 옵션 체인 ─────────────────────────────────────────────
async function getOptionChain(ticker, opts = {}) {
  const sym = String(ticker).toUpperCase();
  const maxExp = opts.maxExpirations || 6;

  let expirations = [];
  if (opts.expiration) expirations = [opts.expiration];
  else {
    const exp = await callIntrinio(`options/expirations/${sym}/eod`, {
      after: new Date().toISOString().slice(0, 10),
    }).catch(() => null);
    expirations = ((exp && exp.expirations) || []).slice().sort().slice(0, maxExp);
  }
  if (!expirations.length) return { results: [], status: 'OK', count: 0 };

  let underlying = opts.underlyingPrice || 0;
  if (!underlying) {
    const rt = await callIntrinio(`securities/${sym}/prices/realtime`).catch(() => null);
    underlying = num(rt && rt.last_price) ?? num(rt && rt.eod_close_price) ?? 0;
  }

  const chains = await Promise.all(
    expirations.map((e) => callIntrinio(`options/chain/${sym}/${e}/eod`).catch(() => null))
  );

  const results = [];
  for (const ch of chains) {
    for (const row of (ch && ch.chain) || []) {
      const o = row.option || {};
      const p = row.prices || {};
      const type = String(o.type || '').toLowerCase();
      results.push({
        details: {
          ticker: `O:${o.code || ''}`,
          contract_type: type === 'put' ? 'put' : 'call',
          exercise_style: p.exercise_style === 'E' ? 'european' : 'american',
          expiration_date: o.expiration || null,
          shares_per_contract: 100,
          strike_price: num(o.strike) || 0,
        },
        greeks: {
          delta: num(p.delta) || 0, gamma: num(p.gamma) || 0,
          theta: num(p.theta) || 0, vega: num(p.vega) || 0,
        },
        implied_volatility: num(p.implied_volatility) || 0,
        open_interest: num(p.open_interest) || 0,
        break_even_price: type === 'put'
          ? (num(o.strike) || 0) - (num(p.close) || 0)
          : (num(o.strike) || 0) + (num(p.close) || 0),
        day: {
          open: num(p.open) || 0, high: num(p.high) || 0, low: num(p.low) || 0,
          close: num(p.close) || 0, last: num(p.close) || 0,
          volume: num(p.volume) || 0, vwap: num(p.mark) ?? num(p.close) ?? 0,
          change: 0, change_percent: 0, previous_close: 0,
        },
        last_quote: {
          bid: num(p.close_bid) || 0, bid_size: num(p.close_bid_size) || 0,
          ask: num(p.close_ask) || 0, ask_size: num(p.close_ask_size) || 0,
          midpoint: num(p.mark) ?? (((num(p.close_bid) || 0) + (num(p.close_ask) || 0)) / 2),
          last_updated: dateToMs(p.date) * 1e6,
        },
        underlying_asset: { ticker: sym, price: underlying, timeframe: 'DELAYED', last_updated: Date.now() * 1e6 },
      });
    }
  }
  return { results, status: 'OK', count: results.length };
}

// ── 4) 기술지표 ──────────────────────────────────────────────
const TECH_KEY = {
  rsi: 'rsi', sma: 'sma', macd: 'macd_line', adx: 'adx', atr: 'atr',
  cci: 'cci', mfi: 'mfi', obv: 'obv', vwap: 'vwap', trix: 'trix', ao: 'ao', sr: 'sr',
};

async function getTechnical(indicator, ticker, params = {}) {
  const sym = String(ticker).toUpperCase();
  const ind = String(indicator).toLowerCase();
  const q = { page_size: params.limit || '100' };
  if (params.window) q.period = params.window;
  if (params.timespan) q.frequency = params.timespan === 'day' ? 'daily' : params.timespan;

  const data = await callIntrinio(`securities/${sym}/prices/technicals/${ind}`, q);
  const rows = (data && data.technicals) || [];
  const key = TECH_KEY[ind] || ind;
  const values = rows.map((r) => {
    const v = { timestamp: toMs(r.date_time), value: num(r[key]) ?? num(r.value) ?? 0 };
    if (ind === 'macd') { v.signal = num(r.signal_line) || 0; v.histogram = num(r.macd_histogram) || 0; }
    return v;
  });
  return { results: { values, underlying: { url: '' } }, status: 'OK' };
}

// ── 5) 티커 레퍼런스 ─────────────────────────────────────────
async function getTickerDetails(ticker) {
  const sym = String(ticker).toUpperCase();
  const c = await callIntrinio(`companies/${sym}`);
  return {
    status: 'OK',
    results: {
      ticker: sym,
      name: (c && (c.name || c.legal_name)) || sym,
      market: 'stocks', locale: 'us', type: 'CS', active: true, currency_name: 'usd',
      primary_exchange: (c && c.stock_exchange) || null,
      cik: (c && c.cik) || null,
      description: (c && (c.short_description || c.long_description)) || null,
      sic_code: (c && c.sic) || null,
      total_employees: num(c && c.employees),
      list_date: (c && c.first_stock_price_date) || null,
    },
  };
}

// ── 6) 시장 상태 (자체 캘린더) ───────────────────────────────
const US_HOLIDAYS = new Set([
  '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25',
  '2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
  '2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31',
  '2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24',
]);

function getMarketStatus() {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const dateStr = `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`;
  const dow = et.getDay();
  const mins = et.getHours() * 60 + et.getMinutes();
  let market = 'closed';
  if (dow !== 0 && dow !== 6 && !US_HOLIDAYS.has(dateStr)) {
    if (mins >= 570 && mins < 960) market = 'open';
    else if ((mins >= 240 && mins < 570) || (mins >= 960 && mins < 1200)) market = 'extended-hours';
  }
  return {
    market, serverTime: now.toISOString(), earlyAdjournment: false,
    exchanges: { nasdaq: market, nyse: market, otc: market },
    currencies: { fx: 'open', crypto: 'open' },
    _source: 'intrinio-adapter-calendar',
  };
}

// ── 7) open-close ────────────────────────────────────────────
async function getOpenClose(ticker, date) {
  const sym = String(ticker).toUpperCase();
  const d = await callIntrinio(`securities/${sym}/prices`, {
    start_date: date, end_date: date, frequency: 'daily', page_size: '1',
  });
  const r = d && d.stock_prices && d.stock_prices[0];
  if (!r) return { status: 'NOT_FOUND', symbol: sym, from: date };
  return {
    status: 'OK', from: r.date, symbol: sym,
    open: num(r.open) || 0, high: num(r.high) || 0, low: num(r.low) || 0,
    close: num(r.close) || 0, volume: num(r.volume) || 0,
    afterHours: num(r.close) || 0, preMarket: num(r.open) || 0,
  };
}

// ── 라우터 ───────────────────────────────────────────────────
/**
 * Massive 전체 URL(또는 경로)을 받아 Intrinio 결과를 돌려준다.
 * 처리 불가하면 undefined → 호출부가 기존 Massive 경로로 폴백.
 */
async function routeMassiveUrl(input) {
  if (!input || !INTRINIO_KEY) return undefined;

  let path, query;
  if (String(input).startsWith('http')) {
    let u;
    try { u = new URL(input); } catch { return undefined; }
    const host = u.hostname.toLowerCase();
    if (!(host.endsWith('polygon.io') || host.endsWith('massive.com'))) return undefined;
    path = u.pathname;
    query = u.searchParams;
  } else {
    const qi = String(input).indexOf('?');
    path = qi === -1 ? input : input.slice(0, qi);
    query = new URLSearchParams(qi === -1 ? '' : input.slice(qi + 1));
  }

  if (PASSTHROUGH.some((p) => path.startsWith(p))) return undefined;
  if (UNSUPPORTED.some((p) => path.startsWith(p))) {
    return { status: 'OK', results: [], tickers: [], count: 0, _unsupported: true };
  }

  const q = (k) => query.get(k) || undefined;
  let m;

  m = path.match(/^\/v2\/snapshot\/locale\/us\/markets\/stocks\/tickers\/([^/]+)$/);
  if (m) return await getTickerSnapshot(m[1]);

  m = path.match(/^\/v2\/snapshot\/locale\/us\/markets\/stocks\/(gainers|losers)$/);
  if (m) return { status: 'OK', tickers: [], count: 0, _needsEod: true };

  if (/^\/v2\/snapshot\/locale\/us\/markets\/stocks\/tickers$/.test(path)) {
    const list = q('tickers');
    if (!list) return { status: 'OK', tickers: [], count: 0, _needsEod: true };
    const syms = list.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30);
    const settled = await Promise.allSettled(syms.map((s) => getTickerSnapshot(s)));
    const tickers = settled
      .map((r) => (r.status === 'fulfilled' && r.value && r.value.ticker) || null)
      .filter(Boolean);
    return { status: 'OK', count: tickers.length, tickers };
  }

  m = path.match(/^\/v2\/aggs\/ticker\/([^/]+)\/range\/(\d+)\/(\w+)\/([^/]+)\/([^/]+)$/);
  if (m) {
    const opts = { sort: q('sort') || 'asc', limit: q('limit') ? Number(q('limit')) : undefined };
    if (m[3] === 'day') return await getDailyAggregates(m[1], m[4], m[5], opts);
    // 분봉/시간봉 — 이 분기가 없으면 1D 차트가 죽는다 (2026-08-29 실제 발생)
    const intraday = await getIntradayAggregates(m[1], Number(m[2]), m[3], m[4], m[5], opts);
    if (intraday !== undefined) return intraday;
    return { ticker: m[1], queryCount: 0, resultsCount: 0, results: [], status: 'OK' };
  }

  m = path.match(/^\/v2\/aggs\/ticker\/([^/]+)\/prev$/);
  if (m) {
    const to = new Date(); const from = new Date(to.getTime() - 14 * 86400000);
    const iso = (d) => d.toISOString().slice(0, 10);
    return await getDailyAggregates(m[1], iso(from), iso(to), { sort: 'desc', limit: 1 });
  }

  m = path.match(/^\/v3\/snapshot\/options\/([^/]+)$/);
  if (m) {
    const res = await getOptionChain(m[1], {
      expiration: q('expiration_date'),
      maxExpirations: q('expiration_date.gte') ? 8 : 6,
    });
    const ct = q('contract_type');
    if (ct) { res.results = res.results.filter((r) => r.details.contract_type === ct); res.count = res.results.length; }
    return res;
  }

  m = path.match(/^\/v1\/indicators\/(\w+)\/([^/]+)$/);
  if (m) return await getTechnical(m[1], m[2], { window: q('window'), timespan: q('timespan'), limit: q('limit') });

  m = path.match(/^\/v3\/reference\/tickers\/([^/]+)$/);
  if (m) return await getTickerDetails(m[1]);

  if (path === '/v1/marketstatus/now') return getMarketStatus();
  if (path === '/v1/marketstatus/upcoming') return [];

  m = path.match(/^\/v1\/open-close\/([^/]+)\/([\d-]+)$/);
  if (m) return await getOpenClose(m[1], m[2]);

  return undefined;
}

module.exports = {
  routeMassiveUrl,
  getTickerSnapshot,
  getDailyAggregates,
  getIntradayAggregates,
  getOptionChain,
  getTechnical,
  getTickerDetails,
  getMarketStatus,
  getOpenClose,
  callIntrinio,
};
