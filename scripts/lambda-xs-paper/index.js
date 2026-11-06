// ============================================================================
// XS PAPER-TRADE ENGINE — Stage A of the pre-registered live validation
// (.agent/XS_AUTOTRADE_PREREG.md, CONFIRMED 2026-07-17. Rules are FROZEN there;
//  this file hardcodes them — no runtime-configurable strategy parameters.)
//
// Daily (22:40 UTC, after signum-xs):
//   1. Trading-day guard (SPY had a session today per the vendor quote; legacy
//      median |1d change| > 0.05% phantom-row defense as fallback)
//   2. Fill yesterday-evening BUY orders at TODAY's OPEN
//   3. Positions on their 3rd trading day since entry → SELL at TODAY's CLOSE
//   4. Generate tomorrow's orders: XS top decile ∩ mcap≥$2B ∩ price≥$5,
//      top 10 equal-weight, sized NAV/30 (3-tranche rolling)
//   5. Weekly kill switch: NAV < weekStart×0.97 → liquidate + halt (manual resume)
//   6. Journal everything to signum-trade-journal + Redis cache:xs:paper
//
// PAPER MODE: fills are frictionless (slippage=0 by construction) — stage B
// (broker mock account) measures real fills. No broker API, no credentials.
//
// [2026-09-16 input plumbing — strategy rules above unchanged]
//   · OPEN/CLOSE (fills, exits, marks, SPY benchmark) come from the Intrinio
//     session quote (`securities/{t}/prices/realtime`: open_price/close_price of
//     the session that last traded). The alpha-history open/close/high/low
//     fields they used to come from stopped on 2026-08-28 with the vendor
//     migration → spyClose null, every fill lapsed ("no open px"), NAV frozen.
//     alpha-history rows remain the fallback.
//   · Universe price/mcap come from the XS engine's own rows (signum-xs-history,
//     `cache:xs:scores` date) instead of `signum-unified-cache`, whose bulk
//     writer retired the same day (rows frozen at 08-28 prices).
//   · Logs `[PAPER] xs-scores-present N` / `xs-scores-age-days N` for the
//     CloudWatch metric filters (scripts/setup-xs-alarms.js).
//
// [2026-11-06 journal persistence — strategy rules above unchanged]
//   · 11/5 weekly kill liquidated names held in several tranches under one key
//     `${date}#${t}#KILL` → BatchWrite «duplicate keys» ×3 → the day was lost.
//     TRADE keys are now `${date}#${t}#${entryDate}#${n}` (KILL: `…#KILL#…`),
//     n = tranche sequence within the run; a duplicate key aborts BEFORE writing.
//   · The whole day (TRADE + POS + NAV + ORDERS + STATE) commits in ONE
//     TransactWriteItems (≤100 items; STATE conditioned on the previous lastRun,
//     TRADE on attribute_not_exists) → all-or-nothing: a failed attempt leaves
//     nothing behind, a retry recomputes from the same STATE, a committed day is
//     never re-applied. cache:xs:paper is re-published on a same-day re-run, and
//     a failed cache write throws so the async retry repairs it.
//   · Journal day = ET session date (undated retries past UTC midnight → same day).
//   · Backfill: {"date":"YYYY-MM-DD"} for the session the vendor still serves
//     (ET date of now, i.e. the evening/night after a failed 22:40Z run), only
//     when it is the next session after STATE.lastRun. Prices come from the same
//     Intrinio session quote as the scheduled run; a missing quote for SPY, a
//     pending order or a live position → explicit error, nothing written.
// READS: signum-xs-history, signum-alpha-history (RO), Redis cache:xs:scores, Intrinio
// WRITES: signum-trade-journal + cache:xs:paper only.
// ============================================================================

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, BatchGetCommand, GetCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');

const VERSION = 'PAPER-1.0.2';   // 1.0.1 = 2026-09-16 input plumbing · 1.0.2 = 2026-11-06 atomic journal/unique TRADE keys (see header); §2 strategy constants unchanged
const JOURNAL = 'signum-trade-journal';
const XS_TABLE = 'signum-xs-history';
const ALPHA_TABLE = 'signum-alpha-history';
const INTRINIO_BASE = process.env.INTRINIO_BASE_URL || 'https://api-v2.intrinio.com';
const INTRINIO_KEY = (process.env.INTRINIO_API_KEY || '').trim();
let DRY = process.env.DRY === '1';   // env DRY=1 or Lambda event {dry:true}; reset per invocation

// §2 frozen strategy constants (PREREG — do not make configurable)
const CAPITAL0 = 1000;        // $1,000 (C-stage size; paper mirrors it 1:1)
const PICKS = 10;             // top-10 names per tranche
const TRANCHES = 3;           // 3-day rolling tranches → per-name = NAV/30
const HOLD_DAYS = 3;          // exit on 3rd trading day after entry, at close
const MCAP_MIN = 2e9;
const PRICE_MIN = 5;
const DECILE_MIN = 90;        // top decile = xsScore ≥ 90
const WEEK_KILL = 0.03;       // weekly loss ≥3% → liquidate + halt
const TRADING_DAY_MEDIAN = 0.0005; // median |1d chg| must exceed 0.05%
const SCHEDULE_UTC = '22:40';   // EventBridge signum-xs-paper-daily (cron 40 22 ? * MON-FRI *)
const SLOT_EARLY_MS = 5 * 60000; // tolerance for an early scheduler fire
const TXN_MAX = 100;          // DynamoDB TransactWriteItems action limit (one day = one transaction)

const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '').trim();

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
    marshallOptions: { removeUndefinedValues: true },
});

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const round = (v, p) => v == null ? null : Math.round(v * 10 ** p) / 10 ** p;
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
function isoWeek(d) { const dt = new Date(d + 'T00:00:00Z'); const day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day + 3); const wk1 = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4)); return dt.getUTCFullYear() + '-W' + String(1 + Math.round(((dt - wk1) / 86400000 - 3 + ((wk1.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0'); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function redisGet(key) {
    if (!REDIS_URL) return null;
    try { const r = await fetch(`${REDIS_URL}/get/${key}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } }); const j = await r.json(); return j.result ?? null; } catch { return null; }
}
// returns true when the SET was acknowledged (or Redis is not configured)
async function redisSet(key, value, ttlSec) {
    if (!REDIS_URL) return true;
    try {
        const r = await fetch(`${REDIS_URL}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify([['SET', key, JSON.stringify(value), 'EX', String(ttlSec)]]) });
        const j = await r.json().catch(() => null);
        return !!(r.ok && Array.isArray(j) && j[0] && j[0].result === 'OK');
    } catch { return false; }
}

async function batchGet(table, keys) {
    const out = new Map();
    for (let i = 0; i < keys.length; i += 100) {
        let req = { RequestItems: { [table]: { Keys: keys.slice(i, i + 100) } } };
        for (let a = 0; a < 4; a++) {
            const res = await ddb.send(new BatchGetCommand(req));
            for (const it of (res.Responses?.[table] || [])) out.set(it.ticker, it);
            const un = res.UnprocessedKeys?.[table];
            if (!un || !un.Keys?.length) break;
            if (a === 3) throw new Error(`Unprocessed reads from ${table}`);
            req = { RequestItems: { [table]: un } };
            await sleep(200 * (a + 1));
        }
    }
    return out;
}

// ── Intrinio session quote → {open, close, high, low, volume, session} ──────
// `close_price` is the official close once the session has ended (verified
// 2026-09-16: SPY close_price 757.39 == EOD adj_close 757.39). Rows are only
// accepted when the quote's last trade falls on TODAY (ET) — a holiday or a
// halted name returns yesterday's session and must not look like today's.
function etDate(ms) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
    const g = k => p.find(x => x.type === k).value;
    return `${g('year')}-${g('month')}-${g('day')}`;
}
async function fetchSessions(tickers, sessionDate) {
    const out = new Map();
    if (!INTRINIO_KEY || !tickers.length) return out;
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(5, tickers.length) }, async () => {
        while (i < tickers.length) {
            const t = tickers[i++];
            try {
                const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 12000);
                const r = await fetch(`${INTRINIO_BASE}/securities/${encodeURIComponent(t)}/prices/realtime?api_key=${INTRINIO_KEY}`, { signal: ctl.signal }).finally(() => clearTimeout(to));
                if (!r.ok) continue;
                const j = await r.json();
                const lastMs = Date.parse(j.last_time || j.updated_on || '');
                if (!Number.isFinite(lastMs) || etDate(lastMs) !== sessionDate) continue;
                const open = num(j.open_price), close = num(j.close_price);
                if (!(open > 0) || !(close > 0)) continue;
                out.set(t, { open, close, high: num(j.high_price), low: num(j.low_price), volume: num(j.market_volume) ?? num(j.exchange_volume) ?? 0, session: sessionDate, src: 'intrinio-realtime' });
            } catch { /* fallback row (alpha-history) may still cover it */ }
            await sleep(120);
        }
    }));
    return out;
}

// ── journal key helpers (pure; unit-tested in scripts/verify) ─────────────────
// One TRADE row per closed position. A name can be held in up to 3 tranches
// (and stale tranches can linger), so ticker alone is NOT unique: the key is
// exit date + ticker + entry date + tranche sequence n (0,1,… for the same
// ticker/entryDate within this run). Deterministic → a retry of the same day
// produces the same keys; never random.
function tradeKey(today, p, kill, seen) {
    const base = `${today}#${p.t}#${kill ? 'KILL#' : ''}${p.entryDate || 'na'}`;
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return `${base}#${n}`;
}
function assertUniqueKeys(items) {
    const seen = new Set(), dup = [];
    for (const it of items) { const k = `${it.pk}|${it.sk}`; if (seen.has(k)) dup.push(k); seen.add(k); }
    if (dup.length) throw new Error(`duplicate journal keys (nothing written): ${dup.join(', ')}`);
}
function weekdaysBetween(a, b) {   // weekdays strictly between ISO dates a < b
    const out = [];
    for (let d = new Date(a + 'T00:00:00Z'); ;) {
        d.setUTCDate(d.getUTCDate() + 1);
        const iso = d.toISOString().slice(0, 10);
        if (iso >= b) return out;
        if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(iso);
    }
}

async function run(date) {
    const t0 = Date.now();
    // The journal day is the US/Eastern session date. At the 22:40Z schedule it
    // equals the UTC date; an undated retry that lands after UTC midnight (ET
    // evening) still resolves to the SAME session → already-committed skip.
    const etToday = etDate(Date.now());
    if (date !== undefined && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date > etToday)) throw new Error('Invalid or future event.date');
    const today = date ?? etToday;
    const historical = date !== undefined;   // explicit date = backfill: strict checks below
    console.log(`[PAPER] ${VERSION} run ${today}${historical ? ' (BACKFILL)' : ''} ${DRY ? '(DRY)' : ''}`);
    // A committed day is final (re-runs skip), so nothing may commit before that
    // day's scheduled slot (22:40Z: past the close and the signum-xs 22:10Z
    // refresh) — an intraday invocation, dated or not, would journal intraday
    // prices and make the real scheduled run skip. DRY may run any time.
    const slotMs = Date.parse(`${today}T${SCHEDULE_UTC}:00Z`) - SLOT_EARLY_MS;
    if (!DRY && Date.now() < slotMs) throw new Error(`run ${today}: before the ${SCHEDULE_UTC}Z scheduled slot — nothing written (use {"dry":true} to preview)`);

    // ── state ────────────────────────────────────────────────────────────────
    const stRes = await ddb.send(new GetCommand({ TableName: JOURNAL, Key: { pk: 'STATE', sk: '_CURRENT_' }, ConsistentRead: true }));
    const state = stRes.Item || { pk: 'STATE', sk: '_CURRENT_', cash: CAPITAL0, halted: false, haltReason: null, weekId: null, weekStartNav: CAPITAL0, lastRun: null };
    const previousLastRun = state.lastRun ?? null;
    if (state.lastRun === today) {
        // committed already (the day is one transaction) → never re-apply; only
        // re-publish the cache in case the first attempt died after the commit
        console.log('[PAPER] re-run same day — already committed, skip');
        const navRow = (await ddb.send(new GetCommand({ TableName: JOURNAL, Key: { pk: 'NAV', sk: today }, ConsistentRead: true }))).Item;
        if (!DRY && navRow?.summary) {
            // never let a late retry of day D overwrite a newer day's cache: re-check
            // that D is still the latest committed day and the cache is not newer
            const latest = (await ddb.send(new GetCommand({ TableName: JOURNAL, Key: { pk: 'STATE', sk: '_CURRENT_' }, ConsistentRead: true }))).Item;
            let cur = null; try { const raw = await redisGet('cache:xs:paper'); cur = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { cur = null; }
            if (latest?.lastRun === today && !(cur?.date && String(cur.date) > today)) {
                if (!(await redisSet('cache:xs:paper', navRow.summary, 90 * 86400))) throw new Error('cache:xs:paper re-publish failed');
            } else console.log(`[PAPER] cache re-publish skipped (lastRun ${latest?.lastRun}, cache ${cur?.date || 'none'})`);
        }
        return { date: today, nav: navRow?.nav ?? null, halted: state.halted, spyClose: navRow?.spyClose ?? null, tradingDay: true, skipped: true };
    }
    if (state.lastRun && state.lastRun > today) throw new Error(`date ${today} is before STATE.lastRun ${state.lastRun} — refusing to rewrite history`);
    if (historical) {
        // Backfill is only possible for the session the vendor quote still
        // serves (ET date of now): alpha-history carries no OHLC since 08-28.
        if (!state.lastRun) throw new Error('Backfill needs an existing STATE.lastRun');
        if (today !== etToday) throw new Error(`Backfill ${today}: no price source (vendor session is ${etToday}) — nothing written`);
        // a weekday in between is fine only if it was journaled as a non-trading
        // day (holiday NAV row, tradingDay:false); anything else is a lost session
        const gap = [];
        for (const d of weekdaysBetween(state.lastRun, today)) {
            const row = (await ddb.send(new GetCommand({ TableName: JOURNAL, Key: { pk: 'NAV', sk: d }, ConsistentRead: true }))).Item;
            if (!row || row.tradingDay !== false) gap.push(d);
        }
        if (gap.length) throw new Error(`Backfill ${today}: unprocessed weekday(s) ${gap.join(',')} after STATE.lastRun ${state.lastRun} — nothing written`);
        const navRes = await ddb.send(new GetCommand({ TableName: JOURNAL, Key: { pk: 'NAV', sk: today }, ConsistentRead: true }));
        if (navRes.Item?.tradingDay) throw new Error(`NAV already exists for ${today}`);
    } else if (state.lastRun) {
        const gap = weekdaysBetween(state.lastRun, today);
        if (gap.length) console.warn(`[PAPER] gap: weekday(s) ${gap.join(',')} after lastRun ${state.lastRun} not journaled (holiday or failed run)`);
    }
    const posRes = await ddb.send(new GetCommand({ TableName: JOURNAL, Key: { pk: 'POS', sk: '_OPEN_' }, ConsistentRead: true }));
    let positions = posRes.Item?.list || []; // [{t, qty, entryPx, entryDate, tradingDaysHeld}]
    const ordKey = state.lastRun || 'none';
    const ordRes = state.lastRun ? await ddb.send(new GetCommand({ TableName: JOURNAL, Key: { pk: 'ORDERS', sk: state.lastRun }, ConsistentRead: true })) : {};
    const pendingOrders = (ordRes.Item?.orders || []).filter(o => !o.filled);

    // manual kill switch (separate from marketing killswitch)
    const tk = await redisGet('trade:killswitch');
    const tradeKill = tk === '1' || tk === '"1"';

    // ── market snapshot: the XS engine's own rows (price/mcap/xsScore) ───────
    // `cache:xs:scores` names the universe and its date; the rows carry close +
    // market cap as the engine saw them. If the key is missing (engine down for
    // 7+ days) there is no universe → no new orders, and the metric line below
    // trips the `signum-xs-scores-missing` alarm. A backfill (same ET session,
    // see above) reads exactly what the scheduled run reads: the cache's date.
    const snaps = new Map();
    let xsDoc = null;
    try { const raw = await redisGet('cache:xs:scores'); xsDoc = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { xsDoc = null; }
    const cacheDate = xsDoc?.date && xsDoc?.scores ? String(xsDoc.date) : null;
    const xsDate = cacheDate;
    const xsUniverse = cacheDate ? Object.keys(xsDoc.scores) : [];
    const xsRowsAll = xsUniverse.length ? await batchGet(XS_TABLE, xsUniverse.map(t => ({ ticker: t, date: xsDate }))) : new Map();
    for (const [t, r] of xsRowsAll) {
        const price = num(r.close), mcap = num(r.mcap);
        if (!(price > 0)) continue;
        snaps.set(t, { price, mcap, xsScore: num(r.xsScore) });
    }
    const xsAgeDays = xsDate ? Math.round((Date.parse(today) - Date.parse(xsDate)) / 86400000) : 99;
    console.log(`[PAPER] snapshots: ${snaps.size} (xs rows for ${xsDate || 'none'})`);
    // metric-filter lines (scripts/setup-xs-alarms.js) — keep the token layout stable
    console.log(`[PAPER] xs-scores-present ${xsDate ? 1 : 0} date=${xsDate || 'none'}`);
    console.log(`[PAPER] xs-scores-age-days ${xsAgeDays} date=${xsDate || 'none'}`);

    // ── today's OPEN/CLOSE for tickers we act on + SPY (Intrinio session quote) ─
    const actTickers = [...new Set([...pendingOrders.map(o => o.t), ...positions.map(p => p.t)])];
    // sample for the legacy trading-day guard: 60 liquid names from snaps
    const sample = [...snaps.entries()].filter(([, s]) => s.mcap >= 1e10).slice(0, 60).map(([t]) => t);
    const sessionDate = today;
    const live = today === etToday ? await fetchSessions([...new Set([...actTickers, 'SPY'])], sessionDate) : new Map();
    const legacyKeys = [...new Set([...actTickers, ...sample, 'SPY'])].map(t => ({ ticker: t, date: today }));
    const ohlc = legacyKeys.length ? await batchGet(ALPHA_TABLE, legacyKeys) : new Map();   // fallback rows
    for (const [t, r] of live) ohlc.set(t, { ...(ohlc.get(t) || {}), ...r });
    if (historical) {
        // a backfill must see exactly what the scheduled run would have: the
        // vendor session for SPY, every pending order and every live position.
        // Overdue positions (held past HOLD_DAYS — the vendor already had no
        // session for them on earlier days) keep the scheduled fallbacks.
        const missing = [];
        if (!live.has('SPY')) missing.push('SPY');
        for (const o of pendingOrders) if (!live.has(o.t)) missing.push(`${o.t}(order)`);
        for (const p of positions) if ((p.tradingDaysHeld || 0) < HOLD_DAYS && !live.has(p.t)) missing.push(`${p.t}(pos ${p.entryDate})`);
        if (missing.length) throw new Error(`Backfill ${today}: no vendor session for ${[...new Set(missing)].join(', ')} — nothing written`);
    }
    console.log(`[PAPER] sessions: intrinio ${live.size}/${new Set([...actTickers, 'SPY']).size} for ${sessionDate} · SPY ${live.has('SPY') ? `open ${live.get('SPY').open} close ${live.get('SPY').close}` : 'no session today (' + (ohlc.get('SPY')?.close ? 'alpha-history close ' + ohlc.get('SPY').close : 'none') + ')'}`);

    // ── trading-day guard ────────────────────────────────────────────────────
    // Primary: SPY traded today (vendor session quote dated today, volume > 0).
    // Fallback (vendor unreachable): legacy phantom-row defense — median |1d
    // change| of the liquid sample must exceed 0.05%.
    const changes = sample.map(t => ohlc.get(t)).filter(r => r && num(r.changePct) != null).map(r => Math.abs(r.changePct / 100));
    const med = median(changes);
    const spy = live.get('SPY');
    const isTradingDay = spy ? (spy.volume > 0 && spy.close > 0) : (med != null && med > TRADING_DAY_MEDIAN);
    console.log(`[PAPER] trading-day guard: ${spy ? `SPY session ${spy.session} vol ${spy.volume}` : `no SPY session → legacy median|chg|=${med == null ? 'n/a' : (med * 100).toFixed(3) + '%'}`} → ${isTradingDay ? 'TRADING DAY' : 'NOT a trading day (skip)'}`);
    if (historical && !isTradingDay) throw new Error(`Backfill ${today}: not a trading day per vendor session — nothing written`);

    const trades = [];
    const keySeen = new Map();
    let filled = 0, exited = 0;

    if (isTradingDay) {
        // ── 1. fill pending BUYs at today's open ─────────────────────────────
        for (const o of pendingOrders) {
            const row = ohlc.get(o.t);
            const openPx = num(row?.open);
            if (!openPx || openPx <= 0) { o.filled = false; o.note = 'no open px — order lapsed'; continue; }
            const qty = o.usd / openPx;
            state.cash -= o.usd;
            positions.push({ t: o.t, qty: round(qty, 6), entryPx: openPx, entryDate: today, tradingDaysHeld: 0 });
            o.filled = true; o.fillPx = openPx;
            filled++;
        }

        // ── 2. age positions; exit those on their 3rd trading day ───────────
        for (const p of positions) {
            if (p.entryDate !== today) p.tradingDaysHeld = (p.tradingDaysHeld || 0) + 1;
        }
        const stay = [], out = [];
        for (const p of positions) (p.tradingDaysHeld >= HOLD_DAYS ? out : stay).push(p);
        for (const p of out) {
            const row = ohlc.get(p.t);
            const closePx = num(row?.close) ?? snaps.get(p.t)?.price;
            if (!closePx || closePx <= 0) { stay.push(p); continue; } // no price → hold one more day
            const proceeds = p.qty * closePx;
            state.cash += proceeds;
            const pnl = (closePx - p.entryPx) * p.qty;
            trades.push({ pk: 'TRADE', sk: tradeKey(today, p, false, keySeen), t: p.t, entryDate: p.entryDate, entryPx: p.entryPx, exitDate: today, exitPx: closePx, qty: p.qty, pnl: round(pnl, 4), pnlPct: round((closePx / p.entryPx - 1) * 100, 3), ver: VERSION });
            exited++;
        }
        positions = stay;
    }

    // ── 3. mark NAV at today's close (fallback: unified price) ──────────────
    let posValue = 0;
    for (const p of positions) {
        const px = num(ohlc.get(p.t)?.close) ?? snaps.get(p.t)?.price ?? p.entryPx;
        posValue += p.qty * px;
    }
    const nav = state.cash + posValue;
    const spyClose = num(ohlc.get('SPY')?.close);
    const spySource = ohlc.get('SPY')?.src || (spyClose != null ? 'alpha-history' : null);

    // ── 4. weekly kill switch ────────────────────────────────────────────────
    const wk = isoWeek(today);
    if (state.weekId !== wk) { state.weekId = wk; state.weekStartNav = nav; }
    if (!state.halted && isTradingDay && nav < state.weekStartNav * (1 - WEEK_KILL)) {
        // liquidate everything at today's close and halt (manual resume only)
        for (const p of positions) {
            const px = num(ohlc.get(p.t)?.close) ?? snaps.get(p.t)?.price ?? p.entryPx;
            state.cash += p.qty * px;
            trades.push({ pk: 'TRADE', sk: tradeKey(today, p, true, keySeen), t: p.t, entryDate: p.entryDate, entryPx: p.entryPx, exitDate: today, exitPx: px, qty: p.qty, pnl: round((px - p.entryPx) * p.qty, 4), pnlPct: round((px / p.entryPx - 1) * 100, 3), kill: true, ver: VERSION });
        }
        positions = [];
        posValue = 0;   // liquidated at the marks above → NAV unchanged, all cash (row stays nav = cash + posValue)
        state.halted = true;
        state.haltReason = `weekly kill: NAV ${round(nav, 2)} < ${round(state.weekStartNav * (1 - WEEK_KILL), 2)} (weekStart ${round(state.weekStartNav, 2)})`;
        console.log('[PAPER] 🔴 ' + state.haltReason);
    }

    // ── 5. tomorrow's orders from today's XS top decile ──────────────────────
    let newOrders = [];
    if (isTradingDay && !state.halted && !tradeKill) {
        const candidates = [...snaps.entries()].filter(([, s]) => s.mcap >= MCAP_MIN && s.price >= PRICE_MIN).map(([t]) => t);
        // today's XS rows: already in hand when the score map is today's; otherwise (engine late/failed) fetch → empty → no orders
        const xsRows = xsDate === today ? new Map(candidates.map(t => [t, xsRowsAll.get(t)]).filter(([, r]) => r)) : await batchGet(XS_TABLE, candidates.map(t => ({ ticker: t, date: today })));
        const ranked = [...xsRows.values()]
            .filter(r => num(r.xsScore) != null && r.xsScore >= DECILE_MIN)
            .sort((a, b) => b.xsScore - a.xsScore)
            .slice(0, PICKS);
        const perName = (state.cash + posValue) / (PICKS * TRANCHES); // NAV/30
        newOrders = ranked.map(r => ({ t: r.ticker, side: 'BUY', usd: round(perName, 2), score: r.xsScore, created: today, filled: false }));
        console.log(`[PAPER] new orders: ${newOrders.length} × $${round(perName, 2)} — ${newOrders.map(o => o.t).join(' ')}`);
    } else if (tradeKill) {
        console.log('[PAPER] trade:killswitch ON — no new entries');
    }

    state.lastRun = isTradingDay ? today : state.lastRun;

    const summary = {
        date: today, ver: VERSION, tradingDay: isTradingDay, halted: state.halted, haltReason: state.haltReason,
        nav: round(nav, 2), cash: round(state.cash, 2), posValue: round(posValue, 2),
        positions: positions.length, filledToday: filled, exitedToday: exited,
        newOrders: newOrders.map(o => `${o.t}:$${o.usd}`), spyClose, spySource, xsDate,
        capital0: CAPITAL0, elapsedMs: Date.now() - t0,
        ...(historical ? { backfilledAt: new Date().toISOString() } : {}),
    };

    // ── persist: the whole day is ONE transaction (all-or-nothing) ─────────
    const nowIso = new Date().toISOString();
    const dayItems = [
        ...trades,
        { pk: 'POS', sk: '_OPEN_', list: positions, updatedAt: nowIso },
        { pk: 'NAV', sk: today, nav: round(nav, 2), cash: round(state.cash, 2), posValue: round(posValue, 2), spyClose, spySource, tradingDay: isTradingDay, ver: VERSION, summary },
        ...(isTradingDay && pendingOrders.length ? [{ pk: 'ORDERS', sk: ordKey, orders: pendingOrders, settledAt: nowIso }] : []),
        ...(newOrders.length ? [{ pk: 'ORDERS', sk: today, orders: newOrders, createdAt: nowIso }] : []),
    ];
    const stateItem = { ...state };
    assertUniqueKeys([...dayItems, stateItem]);
    if (dayItems.length + 1 > TXN_MAX) throw new Error(`day has ${dayItems.length + 1} journal items > ${TXN_MAX} (one transaction) — nothing written`);
    const stateCondition = stRes.Item
        ? (previousLastRun == null
            ? { ConditionExpression: 'attribute_not_exists(lastRun) OR lastRun = :null', ExpressionAttributeValues: { ':null': null } }
            : { ConditionExpression: 'lastRun = :last', ExpressionAttributeValues: { ':last': previousLastRun } })
        : { ConditionExpression: 'attribute_not_exists(pk)' };
    const transactItems = [
        ...dayItems.map(Item => (Item.pk === 'TRADE'
            ? { Put: { TableName: JOURNAL, Item, ConditionExpression: 'attribute_not_exists(pk)' } }
            : { Put: { TableName: JOURNAL, Item } })),
        { Put: { TableName: JOURNAL, Item: stateItem, ...stateCondition } },
    ];
    console.log(`[PAPER] journal: ${transactItems.length} items in one transaction (trades ${trades.length}: exits ${exited}, kill ${trades.length - exited})`);

    if (DRY) { console.log('[PAPER DRY]', JSON.stringify({ ...summary, tradeKeys: trades.map(t => t.sk) }, null, 1)); return summary; }

    await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }));
    if (!(await redisSet('cache:xs:paper', summary, 90 * 86400))) throw new Error('journal committed but cache:xs:paper write failed — retry re-publishes it');
    console.log(`[PAPER] done — NAV $${summary.nav} (cash $${summary.cash} + pos $${summary.posValue}), trades ${trades.length}, orders ${newOrders.length}`);
    return summary;
}

exports.handler = async (event) => {
    DRY = process.env.DRY === '1' || !!(event && event.dry === true);   // manual verification: {"dry": true}
    const r = await run(event?.date);
    return { statusCode: 200, body: JSON.stringify({ date: r.date, nav: r.nav, halted: r.halted, spyClose: r.spyClose, tradingDay: r.tradingDay, skipped: !!r.skipped, dry: DRY }) };
};

if (require.main === module) {
    Promise.resolve().then(() => exports.handler(process.argv[2] ? JSON.parse(process.argv[2]) : {})).then(r => console.log('[PAPER] exit', r.body)).catch(e => { console.error(e); process.exit(1); });
}
module.exports.__test = { fetchSessions, etDate, tradeKey, assertUniqueKeys, weekdaysBetween };   // unit checks only (scripts/verify)
