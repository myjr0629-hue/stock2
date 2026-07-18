// ============================================================================
// REALTIME-1 — resident real-time auto-trading engine, PAPER MODE ONLY.
// Twin-track mirror of the daily paper engine (signum-xs-paper): SAME cohort,
// SAME sizing (NAV/30), SAME 3-trading-day holds — only the EXECUTION layer is
// real-time (ask fills + spread guard + intraday book-stop + real-time weekly
// kill). The NAV difference between the two tracks IS the measured execution
// cost. Alpha rules are not touched (검증 헌법 §42.3).
//
// Character: selection, sizing, entry, exit are engine decisions — zero human
// stock-picking. The only human control is the kill switch (trade:killswitch).
//
// SAFETY INVARIANT: this file contains NO code path that sends an order to
// Toss (GET /prices, /orderbook via the local executor only). Promotion to
// live is a separate, gate-checked change — not a config flip.
//
// Data paths (measured 2026-07-18):
//   cache:xs:paper, cache:xs:report → Upstash REST ONLY (NULL on ElastiCache)
//   cache:command:unified:SPY, trade:killswitch, trade:auto:* → local proxy :8081
//   quotes → local executor :8090 (HMAC; reuses its single OAuth token — this
//   process must NEVER fetch its own Toss token)
//   Journal/log values written to :8081 are ASCII-ONLY (proxy UTF-8 defect).
//
// pm2: pm2 start ec2-auto-engine.js --name signum-auto-engine --time
// ============================================================================

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'RT-1.0.0';
const MODE = 'PAPER'; // hard-coded; no LIVE branch exists in this file
const CAPITAL = 1000;
const PICKS = 10;            // cohort size (mirrors daily track)
const TRANCHES = 3;          // lot = NAV / (PICKS * TRANCHES) = NAV/30
const MIN_PRICE = 5;
const SPREAD_MAX_BPS = 50;   // skip fill while spread > 50bps; retry in window
const DAY_STOP_PCT = -2;     // intraday book stop: flatten + lock for the day
const WEEK_KILL_PCT = -3;    // real-time weekly kill: flatten + halt to Monday
const HOLD_TRADING_DAYS = 3;
const ENTRY_WINDOW_MIN = 30;  // entry window = [open, open+30min)
const EXIT_WINDOW_MIN = 10;   // exit window = [close-10min, close) — half-days included
const TICK_MS_RTH = 15_000;
const TICK_MS_IDLE = 60_000;
const CALIB_MIN_DAYS = 15;   // calibration-contra gate arms at >=15 labels

const HOME = process.env.HOME || '/home/ec2-user';
const ENV_FILE = path.join(HOME, 'toss-executor', '.env.toss');
const STATE_FILE = path.join(HOME, 'toss-executor', 'auto-state.json');
const EXEC_URL = 'http://127.0.0.1:8090/toss';
const REDIS_URL = 'http://127.0.0.1:8081';

function loadEnv() {
  const env = {};
  try {
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    }
  } catch { /* keys not installed yet */ }
  return env;
}

function request(mod, urlStr, opts) {
  const { method = 'GET', headers = {}, body = null, timeoutMs = 12_000 } = opts || {};
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const data = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const req = mod.request({
      hostname: u.hostname, port: u.port || (mod === https ? 443 : 80),
      path: u.pathname + u.search, method,
      headers: Object.assign({}, headers, data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        let j; try { j = JSON.parse(buf); } catch { j = null; }
        resolve({ status: res.statusCode || 0, json: j, text: buf });
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    if (data) req.write(data);
    req.end();
  });
}
const httpJson = (u, o) => request(http, u, o);
const httpsJson = (u, o) => request(https, u, o);

// ── executor (HMAC) — read-only market data, no orders ──────────────────────
async function toss(p, query) {
  const env = loadEnv();
  if (!env.EXECUTOR_SECRET) throw new Error('EXECUTOR_SECRET not installed');
  const raw = JSON.stringify({ path: p, method: 'GET', query: query || undefined });
  const ts = String(Date.now());
  const sign = crypto.createHmac('sha256', env.EXECUTOR_SECRET).update(ts + '.' + raw).digest('hex');
  return httpJson(EXEC_URL, {
    method: 'POST', body: raw,
    headers: { 'Content-Type': 'application/json', 'X-Exec-Ts': ts, 'X-Exec-Sign': sign },
  });
}

// ── redis: local proxy (ElastiCache) — ASCII values only ────────────────────
async function rGet(key) {
  try {
    const env = loadEnv();
    const r = await httpJson(`${REDIS_URL}/get?key=${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${env.REDIS_PROXY_KEY || 'signum-redis-proxy-2026'}` }, timeoutMs: 4000,
    });
    return r.json ? r.json.result : null;
  } catch { return null; }
}
async function rSet(key, value, ttl) {
  try {
    const env = loadEnv();
    await httpJson(`${REDIS_URL}/set`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.REDIS_PROXY_KEY || 'signum-redis-proxy-2026'}`, 'Content-Type': 'application/json' },
      body: { key, value, ttl }, timeoutMs: 4000,
    });
  } catch { /* mirror is best-effort; file state is the source of truth */ }
}

// ── redis: Upstash REST — the ONLY place cache:xs:paper/report exist ────────
async function upstashGet(key) {
  try {
    const env = loadEnv();
    if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
    const r = await httpsJson(`${env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` }, timeoutMs: 6000,
    });
    const v = r.json ? r.json.result : null;
    if (v == null) return null;
    try { return JSON.parse(v); } catch { return v; }
  } catch { return null; }
}

// Injection points — the simulator overrides these; production uses the real ones.
const IO = { toss, rGet, rSet, upstashGet };
const FILES = { state: STATE_FILE };

// ── ET clock (fallback: month-based EDT/EST offset if ICU lacks timezones) ──
function etParts(ms) {
  const d = new Date(ms);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short',
    }).formatToParts(d).reduce((o, p) => { o[p.type] = p.value; return o; }, {});
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      hm: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`,
      dow: parts.weekday,
    };
  } catch {
    const mo = d.getUTCMonth() + 1; // rough DST split: Apr-Oct EDT(-4), else EST(-5)
    const e = new Date(ms - (mo >= 4 && mo <= 10 ? 4 : 5) * 3600_000);
    return {
      date: e.toISOString().slice(0, 10),
      hm: e.toISOString().slice(11, 16),
      dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][e.getUTCDay()],
    };
  }
}
const etNow = () => etParts(Date.now());
const isWeekday = (dow) => !['Sat', 'Sun'].includes(dow);
const hmAdd = (hm, mins) => {
  const [h, m] = hm.split(':').map(Number);
  const t = Math.max(0, h * 60 + m + mins);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const CLOCK = { now: etNow, etParts };

// ── market calendar: the ONLY authority on trading days & session hours ─────
// (US holidays + half-days; fail-closed: no calendar → no trading, no counting)
let CAL = { at: 0, days: [] }; // [{date, openHm, closeHm}] in ET
async function calendarDay(et) {
  if (Date.now() - CAL.at > 30 * 60_000) {
    try {
      const r = await IO.toss('/api/v1/market-calendar/US', undefined);
      const res = (r.json && r.json.result) || {};
      const days = [];
      for (const d of [res.today, res.previousBusinessDay]) {
        const rm = d && d.regularMarket;
        const o = rm && rm.startTime ? Date.parse(rm.startTime) : NaN;
        const c = rm && rm.endTime ? Date.parse(rm.endTime) : NaN;
        if (Number.isFinite(o) && Number.isFinite(c)) {
          days.push({ date: CLOCK.etParts(o).date, openHm: CLOCK.etParts(o).hm, closeHm: CLOCK.etParts(c).hm });
        }
      }
      CAL = { at: Date.now(), days };
    } catch {
      CAL = { at: Date.now() - 25 * 60_000, days: CAL.days }; // keep last, retry ~5min
      logSkip('CAL', 'market calendar unavailable - fail-closed');
    }
  }
  return CAL.days.find((d) => d.date === et.date) || null;
}

// ── state ───────────────────────────────────────────────────────────────────
function defaultState() {
  return {
    ver: VERSION, mode: MODE, capital: CAPITAL, cash: CAPITAL,
    positions: [], // {t, qty, entryPx, entryAt, entryDate, cohortDate, tradingDaysHeld, lastCountedDate, spreadBps}
    cohort: null,  // {date, symbols:[], entered:[], done:boolean}
    lockedDate: null,           // day-stop lock: no entries this ET date
    haltedUntil: null, haltReason: null, // weekly kill
    weekMonday: null, weekStartNav: CAPITAL,
    dayDate: null, dayStartNav: CAPITAL,
    lastReportDate: null, prevCloseNav: CAPITAL,
    tradesToday: 0, tradesDate: null,
    log: [],
  };
}
let S = defaultState();
function loadStateFromDisk() {
  try {
    const j = JSON.parse(fs.readFileSync(FILES.state, 'utf8'));
    if (j && j.ver) S = Object.assign(defaultState(), j);
  } catch { /* fresh start */ }
}
function saveState() {
  // atomic tmp+rename — a crash mid-write must never truncate the live file
  // (that would silently reset the preregistered track record to $1,000)
  try {
    const tmp = FILES.state + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(S));
    fs.renameSync(tmp, FILES.state);
  } catch { /* best effort */ }
}
// ASCII-only journal (proxy UTF-8 defect) — console renders labels client-side
function log(type, fields) {
  const row = Object.assign({ at: Date.now(), type }, fields || {});
  S.log.unshift(row);
  if (S.log.length > 200) S.log.length = 200;
  console.log(`[auto] ${type}`, JSON.stringify(fields || {}));
}
const round = (v, p) => Math.round(v * 10 ** p) / 10 ** p;
const skipMemo = new Map();
function logSkip(t, reason) {
  const k = `${t}|${reason}`;
  if ((skipMemo.get(k) || 0) > Date.now() - 3600_000) return;
  skipMemo.set(k, Date.now());
  log('SKIP', { t, reason });
}

// ── market data (via executor; account header not needed on these paths) ────
async function prices(symbols) {
  if (!symbols.length) return new Map();
  const r = await IO.toss('/api/v1/prices', { symbols: symbols.join(',') });
  const rows = (r.json && r.json.result) || [];
  const m = new Map();
  for (const row of rows) {
    const px = Number(row.lastPrice);
    if (row.symbol && Number.isFinite(px) && px > 0) m.set(String(row.symbol), px);
  }
  return m;
}
async function book(symbol) {
  const r = await IO.toss('/api/v1/orderbook', { symbol });
  const ob = r.json && r.json.result;
  const ask = Number(ob && ob.asks && ob.asks[0] && ob.asks[0].price);
  const bid = Number(ob && ob.bids && ob.bids[0] && ob.bids[0].price);
  return {
    ask: Number.isFinite(ask) && ask > 0 ? ask : null,
    bid: Number.isFinite(bid) && bid > 0 ? bid : null,
  };
}

// ── paper fills (NO Toss orders — ever, in this file) ───────────────────────
function bumpTrades() {
  const today = CLOCK.now().date;
  if (S.tradesDate !== today) { S.tradesDate = today; S.tradesToday = 0; }
  S.tradesToday += 1;
}
function paperBuy(t, usd, ask, cohortDate, spreadBps) {
  const qty = round(usd / ask, 6);
  S.positions.push({
    t, qty, entryPx: ask, entryAt: Date.now(), entryDate: CLOCK.now().date,
    cohortDate, tradingDaysHeld: 0, lastCountedDate: CLOCK.now().date, spreadBps,
  });
  S.cash = round(S.cash - qty * ask, 4);
  bumpTrades();
  log('ENTRY', { t, px: ask, qty, reason: `cohort ${cohortDate} spread ${spreadBps}bps` });
}
function paperSell(pos, px, reason, type) {
  S.cash = round(S.cash + pos.qty * px, 4);
  S.positions = S.positions.filter((p) => p !== pos);
  bumpTrades();
  log(type || 'EXIT', { t: pos.t, px, qty: pos.qty, reason: `${reason} entry $${pos.entryPx} ret ${round(((px - pos.entryPx) / pos.entryPx) * 100, 2)}%` });
}
function flattenAll(px, reason, type) {
  for (const pos of [...S.positions]) {
    const p = px.get(pos.t) || pos.entryPx;
    paperSell(pos, p, reason, type);
  }
}

// ── cohort staging: consume the daily track's cohort verbatim ───────────────
async function refreshCohort() {
  const paper = await IO.upstashGet('cache:xs:paper');
  if (!paper || !paper.date) return;
  if (S.cohort && S.cohort.date === paper.date) return;   // already staged
  if (!paper.tradingDay || paper.halted) { logSkip('COHORT', `daily track inactive (${paper.date})`); return; }
  const symbols = (paper.newOrders || [])
    .map((s) => String(s).split(':')[0])
    .filter((t) => /^[A-Z]{1,6}(\.[A-Z])?$/.test(t))
    .slice(0, PICKS);
  if (!symbols.length) { logSkip('COHORT', `no newOrders in ${paper.date}`); return; }

  // calibration-contra gate: the engine may not act on an edge its own
  // measured calibration reliably contradicts (>=15 labels, top decile <= 0)
  const rep = await IO.upstashGet('cache:xs:report');
  const c9 = rep && rep.calibration && rep.calibration['9'];
  if (c9 && c9.days >= CALIB_MIN_DAYS && c9.adjF3 <= 0) {
    S.cohort = { date: paper.date, symbols: [], entered: [], done: true };
    log('SKIP', { t: 'COHORT', reason: `calib-contra top-decile adjF3 ${c9.adjF3} over ${c9.days}d` });
    return;
  }
  S.cohort = { date: paper.date, symbols, entered: [], done: false };
  log('INFO', { reason: `cohort staged ${paper.date}: ${symbols.join(' ')}` });
}

// SPY dealer-gamma regime (risk overlay ONLY — evidence: vol-state variable).
// Negative regime → half lot. Fail-open with a journal flag.
async function gammaRegime() {
  try {
    const spy = await IO.rGet('cache:command:unified:SPY');
    const d = typeof spy === 'string' ? JSON.parse(spy) : spy;
    const g = d && (Number(d.structure && d.structure.netGex) || Number(d.volatility && d.volatility.gex) || Number(d.gex && d.gex.netGex));
    if (Number.isFinite(g) && g !== 0) return g < 0 ? 'NEG' : 'POS';
  } catch { /* fall through */ }
  return 'UNKNOWN';
}

// ── the loop ────────────────────────────────────────────────────────────────
let lastKill = null;
async function tick() {
  const et = CLOCK.now();
  const day = await calendarDay(et);              // null on holidays/weekends → fail-closed
  const rth = Boolean(day) && et.hm >= day.openHm && et.hm < day.closeHm;
  const entryTo = day ? hmAdd(day.openHm, ENTRY_WINDOW_MIN) : '';
  const exitFrom = day ? hmAdd(day.closeHm, -EXIT_WINDOW_MIN) : '';

  // cohort staging: outside RTH, while an entry is pending, or during the entry
  // window itself (covers a restart right at the open that missed overnight staging)
  if (!rth || !S.cohort || !S.cohort.done || et.hm < entryTo) await refreshCohort();

  // weekly window roll (auto-resume: paper mode + zero-intervention mandate;
  // deviation from the daily track's manual resume is documented in PREREG)
  if (isWeekday(et.dow)) {
    const monday = mondayOf(et.date);
    if (S.weekMonday !== monday) {
      S.weekMonday = monday;
      S.weekStartNav = await navAtMarks();
      if (S.haltedUntil && S.haltedUntil <= et.date) { S.haltedUntil = null; S.haltReason = null; log('INFO', { reason: 'weekly kill released - rearming' }); }
    }
  }

  // marks: one batch quote call for held + pending cohort names
  const held = S.positions.map((p) => p.t);
  const pending = (S.cohort && !S.cohort.done) ? S.cohort.symbols.filter((t) => !S.cohort.entered.includes(t)) : [];
  const want = [...new Set([...held, ...pending])];
  const px = await prices(want);
  let nav = markNav(px);

  // day roll
  if (rth && S.dayDate !== et.date) { S.dayDate = et.date; S.dayStartNav = nav; }

  // killswitch round-trips as STRING '1'/'0' (proxy JSON) — Boolean('0') is a trap
  const killRaw = await IO.rGet('trade:killswitch');
  const kill = killRaw === '1' || killRaw === '"1"' || killRaw === 1 || killRaw === true;
  if (kill !== lastKill) {
    if (lastKill !== null || kill) log('INFO', { reason: kill ? 'killswitch ON - entries blocked' : 'killswitch OFF' });
    lastKill = kill;
  }

  if (rth && !S.haltedUntil) {
    // trading-day counter (mirrors daily track: entry day not counted)
    for (const pos of S.positions) {
      if (pos.lastCountedDate !== et.date) { pos.tradingDaysHeld += 1; pos.lastCountedDate = et.date; }
    }

    // ① intraday book stop: flatten + lock for the day
    if (S.lockedDate !== et.date && S.dayStartNav > 0 && ((nav - S.dayStartNav) / S.dayStartNav) * 100 <= DAY_STOP_PCT) {
      flattenAll(px, `day book stop ${DAY_STOP_PCT}%`, 'KILL');
      S.lockedDate = et.date;
      log('KILL', { reason: `day stop ${DAY_STOP_PCT}% - locked for ${et.date}` });
    }

    // ② real-time weekly kill
    nav = markNav(px);
    if (!S.haltedUntil && S.weekStartNav > 0 && ((nav - S.weekStartNav) / S.weekStartNav) * 100 <= WEEK_KILL_PCT) {
      flattenAll(px, `week kill ${WEEK_KILL_PCT}%`, 'KILL');
      S.haltedUntil = nextMonday(et.date);
      S.haltReason = `week kill ${WEEK_KILL_PCT}%`;
      log('KILL', { reason: `${S.haltReason} - halted until ${S.haltedUntil}` });
    }

    // ③ regular time exits (3rd trading day, window before the session close —
    //    half-days included via the calendar's closeHm)
    if (et.hm >= exitFrom) {
      for (const pos of [...S.positions]) {
        if (pos.tradingDaysHeld < HOLD_TRADING_DAYS) continue;
        const ob = await book(pos.t);
        const fill = ob.bid || px.get(pos.t) || pos.entryPx;
        paperSell(pos, fill, `${HOLD_TRADING_DAYS}d time exit`, 'EXIT');
      }
    }

    // ④ cohort entries (entry window only; ask fill + spread guard; the whole
    //    cohort enters at NAV/30 each — mirror of the daily track's sizing)
    if (!kill && S.lockedDate !== et.date && !S.haltedUntil
        && et.hm < entryTo
        && S.cohort && !S.cohort.done && S.cohort.symbols.length) {
      const regime = await gammaRegime();
      const lot = (markNav(px) / (PICKS * TRANCHES)) * (regime === 'NEG' ? 0.5 : 1);
      if (regime === 'NEG' && !S.cohort.gammaLogged) { S.cohort.gammaLogged = true; log('INFO', { reason: 'SPY gamma regime NEG - half lots today' }); }
      for (const t of [...pending]) {
        const last = px.get(t);
        if (last == null) { logSkip(t, 'no quote'); continue; }
        if (last < MIN_PRICE) { logSkip(t, `price $${last} < $${MIN_PRICE}`); continue; }
        if (S.cash < lot) { logSkip(t, 'cash short'); continue; }
        const ob = await book(t);
        if (!ob.ask || !ob.bid) { logSkip(t, 'no orderbook'); continue; }
        const spreadBps = Math.round(((ob.ask - ob.bid) / ob.ask) * 10_000);
        if (spreadBps > SPREAD_MAX_BPS) { logSkip(t, `spread ${spreadBps}bps > ${SPREAD_MAX_BPS}`); continue; }
        paperBuy(t, lot, ob.ask, S.cohort.date, spreadBps);
        S.cohort.entered.push(t);
      }
    }
    // entry window closed → unfilled cohort names lapse (journaled once)
    if (S.cohort && !S.cohort.done && et.hm >= entryTo) {
      const lapsed = S.cohort.symbols.filter((t) => !S.cohort.entered.includes(t));
      if (lapsed.length) log('INFO', { reason: `lapsed (window closed): ${lapsed.join(' ')}` });
      S.cohort.done = true;
    }
  }

  // ⑤ daily report once per TRADING date, after that date's session close
  //    (calendar-gated: no phantom rows on holidays/weekends)
  if (day && et.hm >= day.closeHm && S.lastReportDate !== et.date) {
    const dayRet = S.prevCloseNav > 0 ? round(((nav - S.prevCloseNav) / S.prevCloseNav) * 100, 3) : null;
    const report = {
      date: et.date, nav: round(nav, 2), dayRet,
      trades: S.tradesDate === et.date ? S.tradesToday : 0,
      note: `pos ${S.positions.length} cash $${round(S.cash, 2)}${S.haltedUntil ? ` halted(${S.haltReason})` : ''}${S.lockedDate === et.date ? ' day-locked' : ''} cohort ${S.cohort ? S.cohort.date : '-'}`,
    };
    await IO.rSet('trade:auto:report', report, 30 * 86_400);
    S.lastReportDate = et.date;
    S.prevCloseNav = nav;
    log('INFO', { reason: `daily report NAV $${report.nav} (${dayRet != null ? (dayRet >= 0 ? '+' : '') + dayRet + '%' : '-'})` });
  }

  // ⑥ heartbeat + mirrors (console reads these)
  await IO.rSet('trade:auto:state', {
    mode: S.haltedUntil ? 'OFF' : MODE, ver: VERSION, capital: S.capital,
    nav: round(nav, 2), cash: round(S.cash, 2),
    positions: S.positions.map((p) => ({ t: p.t, qty: p.qty, entryPx: p.entryPx, entryAt: p.entryAt })),
    universeDate: S.cohort ? S.cohort.date : null, updatedAt: Date.now(),
  }, 7 * 86_400);
  await IO.rSet('trade:auto:log', S.log.slice(0, 60), 7 * 86_400);
  saveState();
  return rth;

  function markNav(pxMap) {
    let v = S.cash;
    for (const p of S.positions) v += p.qty * (pxMap.get(p.t) || p.entryPx);
    return v;
  }
  async function navAtMarks() {
    const m = await prices(S.positions.map((p) => p.t));
    let v = S.cash;
    for (const p of S.positions) v += p.qty * (m.get(p.t) || p.entryPx);
    return v;
  }
}

function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function nextMonday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

async function loop() {
  let rth = false;
  try { rth = await tick(); } catch (e) { log('INFO', { reason: `tick error: ${String(e.message || e).slice(0, 140)}` }); }
  setTimeout(loop, rth ? TICK_MS_RTH : TICK_MS_IDLE);
}

// simulator hooks (harness overrides IO/CLOCK/FILES and drives tick() directly)
module.exports = {
  tick, IO, CLOCK, FILES,
  _state: () => S,
  _reset: () => { S = defaultState(); },
  _calReset: () => { CAL = { at: 0, days: [] }; },
  CONFIG: { VERSION, MODE, CAPITAL, PICKS, TRANCHES, MIN_PRICE, SPREAD_MAX_BPS, DAY_STOP_PCT, WEEK_KILL_PCT, HOLD_TRADING_DAYS, CALIB_MIN_DAYS },
};

if (require.main === module) {
  loadStateFromDisk();
  console.log(`[auto] REALTIME-1 ${VERSION} starting — MODE=${MODE} (no live-order code path exists)`);
  loop();
}
