// ============================================================================
// XS PAPER-TRADE ENGINE — Stage A of the pre-registered live validation
// (.agent/XS_AUTOTRADE_PREREG.md, CONFIRMED 2026-07-17. Rules are FROZEN there;
//  this file hardcodes them — no runtime-configurable strategy parameters.)
//
// Daily (22:40 UTC, after signum-xs):
//   1. Trading-day guard (median |1d change| > 0.05% — phantom-row defense)
//   2. Fill yesterday-evening BUY orders at TODAY's OPEN (signum-alpha-history)
//   3. Positions on their 3rd trading day since entry → SELL at TODAY's CLOSE
//   4. Generate tomorrow's orders: XS top decile ∩ mcap≥$2B ∩ price≥$5,
//      top 10 equal-weight, sized NAV/30 (3-tranche rolling)
//   5. Weekly kill switch: NAV < weekStart×0.97 → liquidate + halt (manual resume)
//   6. Journal everything to signum-trade-journal + Redis cache:xs:paper
//
// PAPER MODE: fills are frictionless (slippage=0 by construction) — stage B
// (broker mock account) measures real fills. No broker API, no credentials.
// READS: signum-unified-cache, signum-xs-history, signum-alpha-history (all RO)
// WRITES: signum-trade-journal + cache:xs:paper only.
// ============================================================================

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, BatchGetCommand, BatchWriteCommand, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const VERSION = 'PAPER-1.0.0';
const JOURNAL = 'signum-trade-journal';
const XS_TABLE = 'signum-xs-history';
const ALPHA_TABLE = 'signum-alpha-history';
const SOURCE_TABLE = 'signum-unified-cache';
const DRY = process.env.DRY === '1';

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
async function redisSet(key, value, ttlSec) {
    if (!REDIS_URL) return;
    try { await fetch(`${REDIS_URL}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify([['SET', key, JSON.stringify(value), 'EX', String(ttlSec)]]) }); } catch { /* best-effort */ }
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
            req = { RequestItems: { [table]: un } };
            await sleep(200 * (a + 1));
        }
    }
    return out;
}

async function run() {
    const t0 = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    console.log(`[PAPER] ${VERSION} run ${today} ${DRY ? '(DRY)' : ''}`);

    // ── state ────────────────────────────────────────────────────────────────
    const stRes = await ddb.send(new GetCommand({ TableName: JOURNAL, Key: { pk: 'STATE', sk: '_CURRENT_' } })).catch(() => ({}));
    const state = stRes.Item || { pk: 'STATE', sk: '_CURRENT_', cash: CAPITAL0, halted: false, haltReason: null, weekId: null, weekStartNav: CAPITAL0, lastRun: null };
    const posRes = await ddb.send(new GetCommand({ TableName: JOURNAL, Key: { pk: 'POS', sk: '_OPEN_' } })).catch(() => ({}));
    let positions = posRes.Item?.list || []; // [{t, qty, entryPx, entryDate, tradingDaysHeld}]
    const ordKey = state.lastRun || 'none';
    const ordRes = state.lastRun ? await ddb.send(new GetCommand({ TableName: JOURNAL, Key: { pk: 'ORDERS', sk: state.lastRun } })).catch(() => ({})) : {};
    const pendingOrders = (ordRes.Item?.orders || []).filter(o => !o.filled);
    if (state.lastRun === today) console.log('[PAPER] re-run same day — idempotent path');

    // manual kill switch (separate from marketing killswitch)
    const tradeKill = (await redisGet('trade:killswitch')) === '1' || (await redisGet('trade:killswitch')) === '"1"';

    // ── market snapshot: unified cache (price/mcap) ──────────────────────────
    const snaps = new Map();
    let lastKey;
    do {
        const res = await ddb.send(new ScanCommand({ TableName: SOURCE_TABLE, ExclusiveStartKey: lastKey }));
        for (const it of (res.Items || [])) {
            const ticker = it.pk;
            if (!ticker || typeof ticker !== 'string' || ticker.includes(':')) continue;
            const d = typeof it.data === 'string' ? (() => { try { return JSON.parse(it.data); } catch { return null; } })() : it.data;
            if (!d) continue;
            const price = num(d.structure?.underlyingPrice);
            const mcap = num(d.fundamentals?.marketCap);
            if (!(price > 0)) continue;
            snaps.set(ticker, { price, mcap });
        }
        lastKey = res.LastEvaluatedKey;
    } while (lastKey);
    console.log(`[PAPER] snapshots: ${snaps.size}`);

    // ── today's OHLC rows for tickers we act on (fills need OPEN/CLOSE) ─────
    const actTickers = [...new Set([...pendingOrders.map(o => o.t), ...positions.map(p => p.t)])];
    // sample for the trading-day guard: 60 liquid names from snaps
    const sample = [...snaps.entries()].filter(([, s]) => s.mcap >= 1e10).slice(0, 60).map(([t]) => t);
    const ohlcKeys = [...new Set([...actTickers, ...sample, 'SPY'])].map(t => ({ ticker: t, date: today }));
    const ohlc = ohlcKeys.length ? await batchGet(ALPHA_TABLE, ohlcKeys) : new Map();

    // ── trading-day guard (phantom weekend/holiday rows defense) ────────────
    const changes = sample.map(t => ohlc.get(t)).filter(r => r && num(r.changePct) != null).map(r => Math.abs(r.changePct / 100));
    const med = median(changes);
    const isTradingDay = med != null && med > TRADING_DAY_MEDIAN;
    console.log(`[PAPER] trading-day guard: median|chg|=${med == null ? 'n/a' : (med * 100).toFixed(3) + '%'} → ${isTradingDay ? 'TRADING DAY' : 'NOT a trading day (skip)'}`);

    const trades = [];
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
            trades.push({ pk: 'TRADE', sk: `${today}#${p.t}#${Math.random().toString(36).slice(2, 6)}`, t: p.t, entryDate: p.entryDate, entryPx: p.entryPx, exitDate: today, exitPx: closePx, qty: p.qty, pnl: round(pnl, 4), pnlPct: round((closePx / p.entryPx - 1) * 100, 3), ver: VERSION });
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

    // ── 4. weekly kill switch ────────────────────────────────────────────────
    const wk = isoWeek(today);
    if (state.weekId !== wk) { state.weekId = wk; state.weekStartNav = nav; }
    if (!state.halted && isTradingDay && nav < state.weekStartNav * (1 - WEEK_KILL)) {
        // liquidate everything at today's close and halt (manual resume only)
        for (const p of positions) {
            const px = num(ohlc.get(p.t)?.close) ?? snaps.get(p.t)?.price ?? p.entryPx;
            state.cash += p.qty * px;
            trades.push({ pk: 'TRADE', sk: `${today}#${p.t}#KILL`, t: p.t, entryDate: p.entryDate, entryPx: p.entryPx, exitDate: today, exitPx: px, qty: p.qty, pnl: round((px - p.entryPx) * p.qty, 4), pnlPct: round((px / p.entryPx - 1) * 100, 3), kill: true, ver: VERSION });
        }
        positions = [];
        state.halted = true;
        state.haltReason = `weekly kill: NAV ${round(nav, 2)} < ${round(state.weekStartNav * (1 - WEEK_KILL), 2)} (weekStart ${round(state.weekStartNav, 2)})`;
        console.log('[PAPER] 🔴 ' + state.haltReason);
    }

    // ── 5. tomorrow's orders from today's XS top decile ──────────────────────
    let newOrders = [];
    if (isTradingDay && !state.halted && !tradeKill) {
        const candidates = [...snaps.entries()].filter(([, s]) => s.mcap >= MCAP_MIN && s.price >= PRICE_MIN).map(([t]) => t);
        const xsRows = await batchGet(XS_TABLE, candidates.map(t => ({ ticker: t, date: today })));
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
        newOrders: newOrders.map(o => `${o.t}:$${o.usd}`), spyClose,
        capital0: CAPITAL0, elapsedMs: Date.now() - t0,
    };

    if (DRY) { console.log('[PAPER DRY]', JSON.stringify(summary, null, 1)); return summary; }

    // ── persist ──────────────────────────────────────────────────────────────
    const writes = [
        { ...state },
        { pk: 'POS', sk: '_OPEN_', list: positions, updatedAt: new Date().toISOString() },
        { pk: 'NAV', sk: today, nav: round(nav, 2), cash: round(state.cash, 2), posValue: round(posValue, 2), spyClose, tradingDay: isTradingDay, ver: VERSION },
        ...(isTradingDay && pendingOrders.length ? [{ pk: 'ORDERS', sk: ordKey, orders: pendingOrders, settledAt: new Date().toISOString() }] : []),
        ...(newOrders.length ? [{ pk: 'ORDERS', sk: today, orders: newOrders, createdAt: new Date().toISOString() }] : []),
        ...trades,
    ];
    for (let i = 0; i < writes.length; i += 25) {
        let req = { RequestItems: { [JOURNAL]: writes.slice(i, i + 25).map(Item => ({ PutRequest: { Item } })) } };
        for (let a = 0; a < 5; a++) {
            const res = await ddb.send(new BatchWriteCommand(req));
            const un = res.UnprocessedItems?.[JOURNAL];
            if (!un || !un.length) break;
            req = { RequestItems: { [JOURNAL]: un } };
            await sleep(300 * (a + 1));
        }
    }
    await redisSet('cache:xs:paper', summary, 90 * 86400);
    console.log(`[PAPER] done — NAV $${summary.nav} (cash $${summary.cash} + pos $${summary.posValue}), trades ${trades.length}, orders ${newOrders.length}`);
    return summary;
}

exports.handler = async () => {
    const r = await run();
    return { statusCode: 200, body: JSON.stringify({ date: r.date, nav: r.nav, halted: r.halted }) };
};

if (require.main === module) {
    run().then(r => console.log('[PAPER] exit', r.date)).catch(e => { console.error(e); process.exit(1); });
}
