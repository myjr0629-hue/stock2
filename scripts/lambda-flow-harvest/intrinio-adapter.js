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

// ⚠️ 2026-08-29: 뉴스도 FMP 로 이관. Massive 는 9/23 해지되고, 3사 실측에서
//    FMP 가 대안으로 확정됐다(Intrinio 는 종목 연결 30% 로 부정확).
//    Vercel(intrinioRouter.ts)과 동일 규칙 — 한쪽만 고치면 갈린다.
const PASSTHROUGH = [];

const UNSUPPORTED = [
  '/stocks/v1/short-interest',
  '/stocks/v1/short-volume',
  '/v1/short-volume',
  '/v3/reference/conditions',
  '/v1/related-companies',
  '/v3/trades',
  '/v3/quotes',
  '/v2/last/trade',
];

// ─────────────────────────────────────────────────────────────
// 뉴스 — FMP (Massive 9/23 해지 대응)
// ─────────────────────────────────────────────────────────────
const FMP_KEY = process.env.FMP_API_KEY || '';

function _fmpIso(d) {
  if (!d) return new Date().toISOString();
  if (String(d).includes('T')) return String(d).endsWith('Z') ? d : `${d}Z`;
  return `${String(d).replace(' ', 'T')}Z`;
}

function _fmpId(url, title) {
  const s = `${url}|${title}`;
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + s.charCodeAt(i), 2654435761) >>> 0;
  }
  return `fmp_${h1.toString(16)}${h2.toString(16)}`;
}

async function getNewsFromFmp(ticker, limit, since) {
  if (!FMP_KEY) return undefined;
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 250);
  const tickers = String(ticker || '').split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
  const path = tickers.length
    ? `news/stock?symbols=${tickers.join(',')}&limit=${lim}`
    : `news/general-latest?limit=${lim}`;
  try {
    const res = await fetch(`https://financialmodelingprep.com/stable/${path}&apikey=${FMP_KEY}`);
    if (!res.ok) return undefined;
    let list = await res.json();
    if (!Array.isArray(list)) return undefined;
    if (since) {
      const cut = Date.parse(since);
      if (Number.isFinite(cut)) list = list.filter((a) => Date.parse(_fmpIso(a.publishedDate)) >= cut);
    }
    const results = list
      .filter((a) => a && a.title && a.url)
      .sort((a, b) => Date.parse(_fmpIso(b.publishedDate)) - Date.parse(_fmpIso(a.publishedDate)))
      .slice(0, lim)
      .map((a) => ({
        id: _fmpId(a.url, a.title),
        publisher: { name: a.publisher || a.site || 'Unknown', homepage_url: null, logo_url: null },
        title: a.title,
        author: null,
        published_utc: _fmpIso(a.publishedDate),
        article_url: a.url,
        tickers: a.symbol ? [String(a.symbol).toUpperCase()] : [],
        image_url: a.image || null,
        description: a.text || '',
        keywords: [],
        insights: [],
        _source: 'fmp',
      }));
    return results.length ? { status: 'OK', count: results.length, results, _source: 'fmp' } : undefined;
  } catch (e) {
    console.warn('[FMP news] fail:', e && e.message);
    return undefined;
  }
}

// ── 저수준 호출 ──────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// 레이트 리미터 (토큰 버킷)
//
// ⚠️ [2026-08-29] Massive 시절 구조가 Intrinio 한도를 크게 넘긴다.
//    signum-flow-harvest 실측: 2,001종목 × 동시 10 × 종목당 약 7콜을
//    31초에 쏟아부어 **분당 2만 콜 이상**. 전건 실패의 실체는 스로틀이었다.
//    (단발 테스트로는 잘 되다가 대량 실행에서만 0건이 되어 원인이 안 보였다)
//    한 프로세스 안의 모든 Intrinio 호출을 여기서 직렬 제어한다.
// ─────────────────────────────────────────────────────────────
// ⚠️ 이 버킷은 **Lambda 컨테이너마다 따로** 존재한다(모듈 전역 상태).
//   flow-harvest 는 샤드 4개가 «동시에» 도므로 계약 한도(2,000콜/분)를 4로 나눈
//   값이 샤드당 상한이다. 1200 으로 두면 4×1200=4,800 로 한도를 넘길 수 있다.
//   500×4 = 2,000 이 정확히 한도이므로 10% 여유를 둔다.
const RATE_PER_MIN = Number(process.env.INTRINIO_RATE_PER_MIN || 450);
let _tokens = RATE_PER_MIN;
let _refillAt = Date.now();
let _queue = Promise.resolve();

function _takeToken() {
  const now = Date.now();
  const elapsed = now - _refillAt;
  if (elapsed > 0) {
    _tokens = Math.min(RATE_PER_MIN, _tokens + (elapsed / 60000) * RATE_PER_MIN);
    _refillAt = now;
  }
  if (_tokens >= 1) { _tokens -= 1; return 0; }
  // 토큰 1개가 다시 차는 데 필요한 시간(ms)
  return Math.ceil((1 - _tokens) * (60000 / RATE_PER_MIN));
}

/** 호출 직전에 await 한다. 한도를 넘으면 그만큼 기다린다. */
function rateGate() {
  const run = async () => {
    for (;;) {
      const wait = _takeToken();
      if (wait === 0) return;
      await new Promise((r) => setTimeout(r, wait));
    }
  };
  _queue = _queue.then(run, run);
  return _queue;
}

async function callIntrinio(path, params = {}, timeoutMs = 15000) {
  await rateGate();
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

  // ⚠️ day.c 는 **정규장 종가**여야 한다. 시간외 가격을 넣으면 소비처의
  //   regularCloseToday 가 오염돼 POST 등락률이 항상 0% 가 된다.
  //   (2026-08-28 애프터마켓 실제 발생)
  const regularClose = num(rt && rt.normal_market_hours_last_price)
    ?? num(rt && rt.qualified_last_price) ?? num(rt && rt.close_price) ?? last;
  const regularTime = toMs(rt && rt.normal_market_hours_last_time);
  const lastTime = toMs(rt && rt.last_time);
  const hasExtendedTrade = lastTime > 0 && regularTime > 0 && lastTime > regularTime + 60000;
  const extendedPrice = hasExtendedTrade ? last : null;

  const change = regularClose != null && prevClose ? regularClose - prevClose : 0;
  const changePerc = prevClose ? (change / prevClose) * 100 : 0;

  const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const etMins = etNow.getHours() * 60 + etNow.getMinutes();
  const isPreSession = etMins >= 240 && etMins < 570;
  const isPostSession = etMins >= 960 && etMins < 1200;

  const dayBar = bar(rt && rt.open_price, rt && rt.high_price, rt && rt.low_price, regularClose,
    (rt && (rt.market_volume || rt.exchange_volume)) || 0);
  // ⚠️ prevDay.c 는 반드시 prevClose(eod_close_price). 첫 행은 «오늘 진행 중 봉»일 수 있다.
  const prevSrc = bars.find(b => num(b && b.close) === prevClose) || prevBar || todayBar;
  const prevDayBar = prevSrc
    ? bar(prevSrc.open, prevSrc.high, prevSrc.low, prevClose, prevSrc.volume)
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
      preMarket: isPreSession && extendedPrice ? extendedPrice : undefined,
      afterHours: isPostSession && extendedPrice ? extendedPrice : undefined,
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
// ─────────────────────────────────────────────────────────────
// 전 종목 일봉 (grouped) — EC2 ElastiCache 의 적재물을 읽는다
//
// Intrinio 에는 grouped-aggs 대응 REST 가 없다. EC2 적재기
// (`scripts/intrinio-eod-snapshot.js`)가 벌크 CSV 를 파싱해 두 키를 채운다.
//   intrinio:eod:snapshot — 최신 거래일 OHLCV
//   intrinio:eod:history  — 20거래일 종가 행렬 (signum-xs 가 17일치를 요구)
// ─────────────────────────────────────────────────────────────
const REDIS_PROXY = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
const REDIS_PROXY_KEY = process.env.REDIS_PROXY_KEY || process.env.EC2_REDIS_PROXY_KEY || 'signum-redis-proxy-2026';
const _redisCache = new Map();          // key → { at, val }
const REDIS_TTL_MS = 30 * 60 * 1000;

async function readRedis(key) {
  const hit = _redisCache.get(key);
  if (hit && Date.now() - hit.at < REDIS_TTL_MS) return hit.val;
  try {
    const res = await fetch(`${REDIS_PROXY}/get?key=${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_PROXY_KEY}` },
    });
    if (!res.ok) return null;
    const raw = await res.json();
    const val = typeof raw.result === 'string' ? JSON.parse(raw.result) : raw.result;
    _redisCache.set(key, { at: Date.now(), val });
    return val;
  } catch (e) {
    console.warn('[Intrinio] redis read fail:', e && e.message);
    return null;
  }
}

async function getGroupedDaily(reqDate) {
  const empty = { status: 'OK', adjusted: true, queryCount: 0, resultsCount: 0, results: [] };

  const snap = await readRedis('intrinio:eod:snapshot');
  if (snap && snap.date === reqDate && Array.isArray(snap.rows)) {
    // row = [ticker,o,h,l,c,v,chg,chgPct]
    const results = snap.rows
      .filter((r) => Array.isArray(r) && Number(r[4]) > 0)
      .map((r) => ({
        T: r[0], t: Date.parse(`${reqDate}T00:00:00Z`),
        o: Number(r[1]) || 0, h: Number(r[2]) || 0, l: Number(r[3]) || 0,
        c: Number(r[4]), v: Number(r[5]) || 0,
        vw: Number(r[4]), n: 0,
      }));
    return { ...empty, queryCount: results.length, resultsCount: results.length, results, _eodDate: reqDate };
  }

  const hist = await readRedis('intrinio:eod:history');
  const idx = hist && Array.isArray(hist.dates) ? hist.dates.indexOf(reqDate) : -1;
  if (hist && idx >= 0) {
    const t = Date.parse(`${reqDate}T00:00:00Z`);
    const results = [];
    for (const [T, arr] of Object.entries(hist.closes || {})) {
      const c = Number(arr[idx]) || 0;
      if (c > 0) results.push({ T, t, o: c, h: c, l: c, c, v: 0, vw: c, n: 0 });
    }
    return { ...empty, queryCount: results.length, resultsCount: results.length, results, _eodDate: reqDate, _source: 'intrinio-eod-history' };
  }

  return { ...empty, _requested: reqDate };
}

// ─────────────────────────────────────────────────────────────
// 전 종목 스냅샷 — EOD(전일 확정) + 호가 스냅샷 CSV(현재가) 결합
//
// ⚠️ 예전에는 `_needsEod: true` 와 함께 **빈 배열**을 돌려주고 있었다(미완성
//    자리표시자). 그래서 signum-harvest 의 harvestPrices 가 0건을 받고,
//    그 뒤 warmFlowCache 가 506종목 전부 «price<=0» 으로 즉시 실패했다.
//    TS 어댑터(buildMarketTickers)와 같은 규칙으로 채운다.
// ─────────────────────────────────────────────────────────────
const MAX_QUOTE_SPREAD_PCT = 1;   // 미드를 가격으로 인정할 최대 스프레드
let _quoteCache = null;           // { at, rows: Map }
const QUOTE_TTL_MS = 5 * 60 * 1000;

function _parseCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

/** 현재 미국장 «거래일»(ET). EOD 가 T+1 이라 이 날짜와 비교해야 한다. */
function _currentEtTradingDate() {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  if (et.getHours() < 4) et.setDate(et.getDate() - 1);
  while (et.getDay() === 0 || et.getDay() === 6) et.setDate(et.getDate() - 1);
  const p = (n) => String(n).padStart(2, '0');
  return `${et.getFullYear()}-${p(et.getMonth() + 1)}-${p(et.getDate())}`;
}

/** Intrinio 호가 스냅샷 CSV — 1콜에 전 종목 */
async function loadQuoteSnapshot() {
  if (_quoteCache && Date.now() - _quoteCache.at < QUOTE_TTL_MS) return _quoteCache.rows;
  const rows = new Map();
  try {
    const meta = await callIntrinio('securities/snapshots');
    const file = meta && meta.snapshots && meta.snapshots[0] && meta.snapshots[0].files && meta.snapshots[0].files[0];
    if (!file || !file.url) return rows;
    const res = await fetch(file.url);
    if (!res.ok) return rows;
    let buf = Buffer.from(await res.arrayBuffer());
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = require('zlib').gunzipSync(buf);
    const lines = buf.toString('utf8').split('\n');
    if (lines.length < 2) return rows;
    const H = new Map();
    _parseCsvLine(lines[0]).forEach((h, i) => H.set(h.toUpperCase(), i));
    const iS = H.get('SYMBOL'), iP = H.get('TRADE PRICE'), iV = H.get('TOTAL TRADE VOLUME'),
      iH = H.get('TRADE HIGH PRICE'), iL = H.get('TRADE LOW PRICE'),
      iA = H.get('ASK PRICE'), iB = H.get('BID PRICE');
    if (iS == null) return rows;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const c = _parseCsvLine(line);
      if (c.length <= iS) continue;
      const sym = (c[iS] || '').toUpperCase();
      if (!sym) continue;
      // Startup 플랜은 TRADE PRICE 가 비어 있고 NBBO 만 채운다 → 미드로 대체
      const trade = Number(c[iP]) || 0;
      const ask = iA != null ? Number(c[iA]) || 0 : 0;
      const bid = iB != null ? Number(c[iB]) || 0 : 0;
      const midRaw = ask > 0 && bid > 0 ? (ask + bid) / 2 : 0;
      const spread = midRaw > 0 ? ((ask - bid) / midRaw) * 100 : Infinity;
      const mid = spread >= 0 && spread <= MAX_QUOTE_SPREAD_PCT ? midRaw : 0;
      rows.set(sym, {
        last: trade > 0 ? trade : mid,
        high: Number(c[iH]) || 0,
        low: Number(c[iL]) || 0,
        vol: Number(c[iV]) || 0,
      });
    }
    _quoteCache = { at: Date.now(), rows };
  } catch (e) {
    console.warn('[Intrinio] quote snapshot fail:', e && e.message);
  }
  return rows;
}

/**
 * @param wantList 특정 종목만 (없으면 전 종목)
 * @param opts.dropStale  EOD 가 뒤처졌는데 실시간가도 없는 종목을 «버릴지».
 *
 *   버리는 게 옳은 소비처 : movers / breadth
 *     → 어제 등락률을 오늘 값으로 내보내면 조용히 틀린 화면이 된다.
 *   버리면 안 되는 소비처 : harvestPrices / flowWarm
 *     → 이쪽은 «등락률»이 아니라 «현재 가격»이 필요하다. 종목이 사라지면
 *       그 뒤 단계가 통째로 실패한다(실측: 506종목 전건 실패).
 *   기본값은 **보존**이고, 등락률에는 _stale 표식을 단다.
 */
async function getFullMarketSnapshot(wantList, opts) {
  const dropStale = !!(opts && opts.dropStale);
  const want = wantList && wantList.length ? new Set(wantList.map((x) => x.toUpperCase())) : null;
  const [snap, quotes] = await Promise.all([readRedis('intrinio:eod:snapshot'), loadQuoteSnapshot()]);
  const eodRows = (snap && Array.isArray(snap.rows)) ? snap.rows : [];
  if (!eodRows.length) return { status: 'OK', tickers: [], count: 0, _noEod: true };

  const stale = !!snap.date && snap.date < _currentEtTradingDate();
  const tickers = [];
  for (const r of eodRows) {
    if (!Array.isArray(r) || r.length < 8) continue;
    const T = r[0];
    if (want && !want.has(T)) continue;
    const c = Number(r[4]) || 0, v = Number(r[5]) || 0, chg = Number(r[6]) || 0, chgPct = Number(r[7]) || 0;
    if (!(c > 0)) continue;
    const q = quotes.get(T);
    const live = q && q.last > 0 ? q.last : null;
    // EOD 가 «오늘»이면 prevClose = c - chg, 뒤처졌으면 c 자체가 전일 종가다
    const prevClose = stale ? c : c - chg;
    if (stale && !live && dropStale) continue;
    const last = live != null ? live : c;
    const change = prevClose > 0 ? last - prevClose : chg;
    const pct = prevClose > 0 ? (change / prevClose) * 100 : chgPct;
    const bar = (o, h, l, cc, vv) => ({ o: o || 0, h: h || 0, l: l || 0, c: cc || 0, v: vv || 0, vw: cc || 0 });
    tickers.push({
      ticker: T,
      todaysChange: Math.round(change * 10000) / 10000,
      todaysChangePerc: Math.round(pct * 10000) / 10000,
      updated: Date.now() * 1e6,
      day: bar(Number(r[1]), (q && q.high) || Number(r[2]), (q && q.low) || Number(r[3]), last, (q && q.vol) || v),
      prevDay: bar(0, 0, 0, prevClose > 0 ? prevClose : c, 0),
      lastTrade: { p: last, s: 0, t: Date.now() * 1e6, c: [] },
      // 실시간가가 없어 «오늘» 등락을 만들 수 없는 종목 표식
      _stale: stale && live == null ? true : undefined,
      min: bar(Number(r[1]), (q && q.high) || Number(r[2]), (q && q.low) || Number(r[3]), last, (q && q.vol) || v),
      _eodDate: snap.date,
    });
  }
  return { status: 'OK', count: tickers.length, tickers, _source: 'intrinio-eod+quotes' };
}

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

  // 뉴스 → FMP (Intrinio 키와 무관)
  if (path === '/v2/reference/news') {
    if (process.env.NEWS_SOURCE === 'massive') return undefined;
    return await getNewsFromFmp(q('ticker'), q('limit'), q('published_utc.gte'));
  }

  m = path.match(/^\/v2\/snapshot\/locale\/us\/markets\/stocks\/tickers\/([^/]+)$/);
  if (m) return await getTickerSnapshot(m[1]);

  m = path.match(/^\/v2\/snapshot\/locale\/us\/markets\/stocks\/(gainers|losers)$/);
  if (m) {
    const dir = m[1];
    // movers 는 «오늘 등락»이 핵심이므로 뒤처진 종목을 버린다
    const full = await getFullMarketSnapshot(null, { dropStale: true });
    const eligible = (full.tickers || []).filter(
      (t) => (t.day && t.day.v >= 200000) && (t.lastTrade && t.lastTrade.p >= 1) && t.todaysChangePerc !== 0
    );
    eligible.sort((a, b) => (dir === 'gainers' ? b.todaysChangePerc - a.todaysChangePerc : a.todaysChangePerc - b.todaysChangePerc));
    const top = eligible.slice(0, 50);
    return { status: 'OK', count: top.length, tickers: top };
  }

  if (/^\/v2\/snapshot\/locale\/us\/markets\/stocks\/tickers$/.test(path)) {
    const list = q('tickers');
    // 필터 없는 «전 종목» 요청 — EOD + 호가 스냅샷으로 구성한다.
    // (예전에는 빈 배열을 돌려줘 signum-harvest 가 통째로 0건이었다)
    if (!list) return await getFullMarketSnapshot(null);
    const syms = list.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30);
    const settled = await Promise.allSettled(syms.map((s) => getTickerSnapshot(s)));
    const tickers = settled
      .map((r) => (r.status === 'fulfilled' && r.value && r.value.ticker) || null)
      .filter(Boolean);
    return { status: 'OK', count: tickers.length, tickers };
  }

  m = path.match(/^\/v2\/aggs\/grouped\/locale\/us\/market\/stocks\/([\d-]+)$/);
  if (m) return await getGroupedDaily(m[1]);

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

  // 배당 — securities/{t}/dividends 는 404 지만 prices/adjustments 에 들어 있다
  if (path === '/v3/reference/dividends') {
    const t = q('ticker');
    if (!t) return { status: 'OK', count: 0, results: [] };
    const lim = Number(q('limit')) || 16;
    const d = await callIntrinio(`securities/${String(t).toUpperCase()}/prices/adjustments`, {
      page_size: String(Math.min(Math.max(lim * 4, 40), 200)),
    }).catch(() => null);
    const rows = (d && d.stock_price_adjustments) || [];
    const divs = rows
      .filter((r) => Number(r && r.dividend) > 0 && /^\d{4}-\d{2}-\d{2}/.test(String(r.date)))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    let frequency = null;
    if (divs.length >= 3) {
      const gaps = [];
      for (let i = 0; i < Math.min(divs.length - 1, 8); i++) {
        const g = (Date.parse(divs[i].date) - Date.parse(divs[i + 1].date)) / 86400000;
        if (g > 0) gaps.push(g);
      }
      if (gaps.length) {
        gaps.sort((a, b) => a - b);
        const med = gaps[Math.floor(gaps.length / 2)];
        frequency = med <= 10 ? 52 : med <= 45 ? 12 : med <= 120 ? 4 : med <= 250 ? 2 : 1;
      }
    }
    const results = divs.slice(0, lim).map((x) => ({
      cash_amount: Number(x.dividend),
      currency: x.dividend_currency || 'USD',
      ex_dividend_date: String(x.date),
      pay_date: null, record_date: null, declaration_date: null,
      frequency, dividend_type: 'CD', ticker: String(t).toUpperCase(),
    }));
    return { status: 'OK', count: results.length, results, _source: 'intrinio-adjustments' };
  }

  if (path === '/v1/marketstatus/now') return getMarketStatus();
  if (path === '/v1/marketstatus/upcoming') return [];

  m = path.match(/^\/v1\/open-close\/([^/]+)\/([\d-]+)$/);
  if (m) return await getOpenClose(m[1], m[2]);

  return undefined;
}

module.exports = {
  routeMassiveUrl,
  getGroupedDaily,
  getFullMarketSnapshot,
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
