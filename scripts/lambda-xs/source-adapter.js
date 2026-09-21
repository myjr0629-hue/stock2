// ============================================================================
// SIGNUM XS — SOURCE ADAPTER (input plumbing only · 2026-09-16)
// ============================================================================
//
// Why this file exists
//   Until 2026-08-28 the engine's only input was DynamoDB `signum-unified-cache`,
//   bulk-written every 15 min by the old signum-harvest (`v8-structureService`).
//   The Massive→Intrinio migration retired that writer; only on-demand rows
//   (1~23/day, written by the app's command screen) have been landing since.
//   The engine's 4-day zombie guard then correctly saw 0 fresh universe rows and
//   threw `universe too small: 0` every day from 09-01.
//
// What this file does
//   Assembles the SAME per-ticker snapshot shape the engine has always consumed
//   ({price, mcap, netGex, pcr, iv, squeeze, darkPool, shortVol, blockTrades,
//   bullishPct, smaDist, dtc, peers}) from the stores that are alive today:
//
//   field        live source (read-only)                              refresh
//   ─────────    ──────────────────────────────────────────────────    ────────
//   price/netGex Upstash `structure:part:v2:{0..7}` — baked by the     5×/day,
//   pcr/squeeze  Vercel cron /api/cron/structure-build with the very   last bake
//                function the screen uses (getStructureData). Same    21:05 UTC
//                netGex sign convention as the retired writer
//                (call = −1, put = +1; verified 2026-09-16).
//   iv           ATM IV recomputed from the raw chain the flow          ≤20 min
//                harvester parks on the EC2 Redis
//                (`polygon:snapshot:probe:{T}`), with the ATM rule the
//                retired writer used (nearest strike, call/put mean,
//                >40pp spread → min). Fallback: today's alpha-history
//                row / latest gex-history row (≤4 days).
//   darkPool     EC2 Redis `finra:offexchange` (FINRA regShoDaily,       daily
//   shortVol     12.7k tickers). One session behind at 22:10 UTC —      (T+0 at
//                same lag the Polygon-era value effectively had.          ~21:45)
//   dtc          FINRA consolidatedShortInterest, latest settlement,    2×/month
//                bulk-paged (5,000/page). No auth.
//   bullishPct   DynamoDB `signum-pattern-db` ANALYST:{T} (signum-fmp)  daily
//   peers        DynamoDB `signum-pattern-db` RELATED:{T}. ⚠ static     frozen
//                since 08-28 (vendor has no related-companies API).    08-28
//   mcap         Intrinio `securities/{T}/data_point/marketcap`,        weekly
//                cached in this engine's own table (`_SRC_` row).        per ticker
//                ETFs return 404 → excluded, as before (they never had
//                fundamentals.marketCap).
//   smaDist      (SMA50−SMA200)/SMA200×100 — identical to the retired   daily
//                writer's `sma.distance`. SMAs are computed from a
//                200-session close ring kept in the `_SRC_` row: seeded
//                once from Intrinio daily prices (adj_close), then
//                extended every run from the EC2 `intrinio:eod:history`
//                matrix (official closes, T+1) plus today's bake price.
//   blockTrades  ❌ no live source (Intrinio Startup has no trades feed;
//                flow harvester runs degraded). Left null → the engine
//                skips the factor cross-sectionally (<MIN_UNIVERSE rows).
//
// Zombie guard (kept): a ticker is admitted only if its structure row was
//   baked within 4 days AND it has an official EOD close within 4 sessions.
//
// Ring hygiene after the 2-week outage (see sanitizeRings): the engine's own
//   close ring is back-filled with official EOD closes for the missing dates so
//   "1D reversal" is really 1 session, and the 7-slot GEX/analyst rings drop
//   entries older than 14 days so "ΔGEX 5d" can never span three weeks. Factor
//   formulas are untouched (validation constitution §42.3) — only the freshness
//   of what they are fed.
//
// Vendor budget: Intrinio calls are paced to XS_INTRINIO_RATE_PER_MIN (default
//   300/min) with a per-run cap, so this Lambda never competes with the
//   flow-harvest shards (900/min) for the 2,000/min contract.
// ============================================================================
'use strict';

const { QueryCommand, BatchGetCommand } = require('@aws-sdk/lib-dynamodb');

const REDIS_PROXY = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
// no hardcoded default on purpose (proxy key rotated 2026-09-16) — the Lambda env carries it
const REDIS_PROXY_KEY = (process.env.REDIS_PROXY_KEY || process.env.EC2_REDIS_PROXY_KEY || '').trim();
const UPSTASH_URL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').trim();
const UPSTASH_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '').trim();
const INTRINIO_BASE = process.env.INTRINIO_BASE_URL || 'https://api-v2.intrinio.com';
const INTRINIO_KEY = (process.env.INTRINIO_API_KEY || '').trim();
const FINRA_SI_API = 'https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest';

const STRUCT_PARTS = 8;
const STRUCT_PART_KEY = (i) => `structure:part:v2:${i}`;
const SRC_DATE_KEY = '_SRC_';                 // this adapter's own row in signum-xs-history
const PATTERN_TABLE = 'signum-pattern-db';
const ALPHA_TABLE = 'signum-alpha-history';
const GEX_TABLE = 'signum-gex-history';
const UNIFIED_TABLE = 'signum-unified-cache';

const SMA_RING = 200;
const MCAP_REFRESH_MS = 7 * 86400000;         // refresh a ticker's market cap weekly
const MCAP_MISS_RETRY_MS = 30 * 86400000;     // ETF / unknown → retry monthly
const ANALYST_MAX_AGE_MS = 10 * 86400000;     // consensus refresh is daily; tolerate a week+
const RING_PRUNE_MS = 14 * 86400000;          // 7-slot rings can never legitimately span this
const INTRINIO_RATE_PER_MIN = Number(process.env.XS_INTRINIO_RATE_PER_MIN) || 300;
const INTRINIO_CONCURRENCY = 6;
const MCAP_MAX_PER_RUN = Number(process.env.XS_MCAP_MAX_PER_RUN) || 400;
const SMA_SEED_MAX_PER_RUN = Number(process.env.XS_SMA_SEED_MAX_PER_RUN) || 300;
const CHAIN_CONCURRENCY = 8;
const DDB_CONCURRENCY = 24;

// ── tiny utils ───────────────────────────────────────────────────────────────
// ⚠ JSON `null` must stay null: Number(null) === 0 would turn "no chain" into "zero gamma".
const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

async function fetchText(url, init, timeoutMs) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs || 20000);
    try {
        const res = await fetch(url, { ...(init || {}), signal: ctl.signal });
        const body = await res.text();
        return { ok: res.ok, status: res.status, body };
    } finally { clearTimeout(t); }
}

function parseMaybeJson(s) { if (typeof s !== 'string') return s; try { return JSON.parse(s); } catch { return s; } }

async function mapPool(items, n, fn) {
    const out = new Array(items.length);
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
        while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = undefined; } }
    }));
    return out;
}

// ── EC2 Redis proxy (GET + querystring, Bearer) ─────────────────────────────
// A wrong/rotated proxy key does NOT throw — every read just comes back null and the
// universe quietly loses IV / dark pool / SMA. Say so once per status so the log
// (and a reader of `[XS-SRC] coverage`) can tell "no data" from "locked out".
let _proxyKeyWarned = false;
const _proxyStatusWarned = new Set();
async function proxyGet(key, timeoutMs) {
    if (!REDIS_PROXY_KEY) { if (!_proxyKeyWarned) { _proxyKeyWarned = true; console.log('[XS-SRC] ⚠ REDIS_PROXY_KEY missing — EC2 Redis reads disabled'); } return null; }
    const r = await fetchText(`${REDIS_PROXY}/get?key=${encodeURIComponent(key)}`,
        { headers: { Authorization: `Bearer ${REDIS_PROXY_KEY}` } }, timeoutMs || 30000);
    if (!r.ok) {
        if (!_proxyStatusWarned.has(r.status)) { _proxyStatusWarned.add(r.status); console.log(`[XS-SRC] ⚠ EC2 Redis proxy GET ${key} → HTTP ${r.status}${r.status === 401 ? ' (key rotated? check REDIS_PROXY_KEY / EC2_REDIS_PROXY_KEY in the Lambda env)' : ''}`); }
        return null;
    }
    const j = parseMaybeJson(r.body);
    return j && typeof j === 'object' && 'result' in j ? parseMaybeJson(j.result) : null;
}

// ── Upstash REST pipeline ────────────────────────────────────────────────────
async function upstash(cmds) {
    if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
    const r = await fetchText(`${UPSTASH_URL}/pipeline`, {
        method: 'POST', headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cmds),
    }, 20000);
    if (!r.ok) return null;
    return parseMaybeJson(r.body);
}

// ── Intrinio pacing (token bucket shared by every caller in this process) ──
let _nextSlot = 0;
async function paceIntrinio() {
    const gap = 60000 / INTRINIO_RATE_PER_MIN;
    const now = Date.now();
    const at = Math.max(now, _nextSlot);
    _nextSlot = at + gap;
    if (at > now) await sleep(at - now);
}
async function intrinioGet(path, params) {
    if (!INTRINIO_KEY) return { ok: false, status: 0, body: '' };
    const qs = new URLSearchParams({ ...(params || {}), api_key: INTRINIO_KEY }).toString();
    await paceIntrinio();
    return fetchText(`${INTRINIO_BASE}/${path}?${qs}`, {}, 15000);
}

// ── 1. structure rows (Vercel structure-build bake) ─────────────────────────
/**
 * 구조 캐시(가격·감마·맥스페인)를 읽는다.
 *
 * ★2026-09-22 사고 수리 — «창고가 둘로 갈라져 있었다».
 *   Vercel 크론(`/api/cron/structure-build`)은 **EC2 레디스 프록시**에 굽는데,
 *   여기서는 **Upstash** 만 읽고 있었다. 9/16 프록시 이관 때 이 함수만 남겨졌다.
 *   그 결과 Upstash 에는 `structure:part:v2:*` 가 아예 없어서(실측: DBSIZE 31,596 인데 해당 키는 null)
 *   rows 가 0 이 되고, 호출부가 **「캐시가 비었다 — 크론이 죽었나?」**라고 «엉뚱한 범인»을 지목했다.
 *   크론은 멀쩡히 21:05 UTC 에 8조각(각 250행)을 구워 두고 있었다.
 *
 *   → Upstash 에서 한 조각도 못 얻으면 **프록시로 폴백**한다. 어느 쪽에서 읽었는지 `src` 로 돌려준다.
 *      («조용한 null» 이 장애를 숨기지 못하게. 폴백은 있되 «보이는» 폴백이어야 한다.)
 */
async function loadStructureRows(staleCutoff) {
    const rows = new Map(); // t → row
    let parts = 0, newestTs = 0, src = 'ec2-proxy';

    const take = (v) => {
        if (!v || !Array.isArray(v.rows)) return false;
        parts++;
        if (v.ts > newestTs) newestTs = v.ts;
        for (const x of v.rows) {
            if (!x || typeof x.t !== 'string' || !(x.px > 0)) continue;
            if (!(x.rt > staleCutoff)) continue;                 // zombie guard (bake age)
            const prev = rows.get(x.t);
            if (!prev || (x.rt || 0) > (prev.rt || 0)) rows.set(x.t, x);
        }
        return true;
    };

    // ★순서가 중요하다: 크론이 «실제로 굽는 곳»을 먼저 읽는다(현재 EC2 프록시).
    //   Upstash 를 먼저 읽으면, 거기 «오래된» 조각이 되살아났을 때 신선한 프록시 조각 대신
    //   그걸 집는다 — 폴백이 장애를 숨기는 전형적인 모양이다. 그래서 «있는 쪽»이 1순위다.
    const got = await Promise.all(
        Array.from({ length: STRUCT_PARTS }, (_, i) => proxyGet(STRUCT_PART_KEY(i), 20000).catch(() => null)),
    );
    for (const v of got) take(v);

    if (parts === 0) {
        src = 'upstash';
        const res = await upstash(Array.from({ length: STRUCT_PARTS }, (_, i) => ['GET', STRUCT_PART_KEY(i)]));
        for (const r of (Array.isArray(res) ? res : [])) take(parseMaybeJson(r && r.result));
        if (parts > 0) console.log(`[XS-SRC] structure cache: EC2 프록시 0조각 → Upstash 에서 ${parts}조각 읽음(크론 기록처가 바뀌었는지 확인할 것)`);
    }

    return { rows, parts, newestTs, src };
}

// ── 2. FINRA off-exchange (dark pool % · short volume %) via EC2 Redis ─────
async function loadFinraOffExchange(staleCutoff) {
    const v = await proxyGet('finra:offexchange', 45000);
    const out = new Map();
    if (!v || !v.tickers) return { map: out, date: null };
    const topDate = v.date || null;
    for (const [sym, row] of Object.entries(v.tickers)) {
        if (!row) continue;
        const d = row.d || topDate;
        if (!d || !(Date.parse(`${d}T21:00:00Z`) > staleCutoff)) continue; // carried-over rows carry their own date
        out.set(sym, { darkPool: num(row.pct), shortVol: num(row.shortPct), d });
    }
    return { map: out, date: topDate };
}

// ── 3. FINRA consolidated short interest (days-to-cover), latest settlement ──
function parseCsvLine(line) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { q = !q; continue; }
        if (c === ',' && !q) { out.push(cur); cur = ''; continue; }
        cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
}
async function finraPost(body, timeoutMs) {
    const r = await fetchText(FINRA_SI_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, timeoutMs || 30000);
    if (!r.ok) return [];
    return r.body.split('\n').filter((l) => l.trim().length > 0);
}
function settlementCandidates() {
    // 15th and month-end (±3 days), newest first — FINRA only answers exact-match settlement dates.
    const cands = []; const now = new Date();
    for (let m = 0; m < 3; m++) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
        const y = d.getUTCFullYear(), mo = d.getUTCMonth();
        const eom = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
        for (const base of [eom, 15]) for (let back = 0; back <= 3; back++) {
            const day = base - back; if (day < 1) continue;
            cands.push(`${y}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
        }
    }
    const today = now.toISOString().slice(0, 10);
    return [...new Set(cands)].filter((d) => d <= today).sort().reverse();
}
async function loadShortInterest() {
    const out = new Map();
    let date = null;
    for (const d of settlementCandidates()) {
        const rows = await finraPost({ limit: 1, compareFilters: [
            { fieldName: 'settlementDate', fieldValue: d, compareType: 'equal' },
            { fieldName: 'symbolCode', fieldValue: 'AAPL', compareType: 'equal' }] }, 12000);
        if (rows.length > 1) { date = d; break; }
    }
    if (!date) return { map: out, date: null };
    for (let offset = 0; offset < 60000; offset += 5000) {
        const rows = await finraPost({ limit: 5000, offset, fields: ['symbolCode', 'daysToCoverQuantity', 'settlementDate'],
            compareFilters: [{ fieldName: 'settlementDate', fieldValue: date, compareType: 'equal' }] }, 45000);
        if (rows.length < 2) break;
        const head = parseCsvLine(rows[0]);
        const iS = head.indexOf('symbolCode'), iD = head.indexOf('daysToCoverQuantity');
        if (iS < 0 || iD < 0) break;
        for (let i = 1; i < rows.length; i++) {
            const c = parseCsvLine(rows[i]);
            const sym = c[iS]; const dtc = num(c[iD]);
            if (sym && dtc != null) out.set(sym, dtc);
        }
        if (rows.length < 5001) break;
    }
    return { map: out, date };
}

// ── 4. official EOD close matrix (EC2 loader, T+1) ──────────────────────────
async function loadEodHistory() {
    const h = await proxyGet('intrinio:eod:history', 45000);
    if (!h || !Array.isArray(h.dates) || !h.closes) return { dates: [], closes: {} };
    return { dates: h.dates, closes: h.closes };
}

// ── 5. DynamoDB helpers ─────────────────────────────────────────────────────
async function queryLatest(ddb, table, keyName, keyValue) {
    const r = await ddb.send(new QueryCommand({
        TableName: table, KeyConditionExpression: '#k = :v',
        ExpressionAttributeNames: { '#k': keyName }, ExpressionAttributeValues: { ':v': keyValue },
        ScanIndexForward: false, Limit: 1,
    }));
    return (r.Items && r.Items[0]) || null;
}
async function batchGet(ddb, table, keys, keyField) {
    const out = new Map();
    for (let i = 0; i < keys.length; i += 100) {
        let req = { RequestItems: { [table]: { Keys: keys.slice(i, i + 100) } } };
        for (let attempt = 0; attempt < 5; attempt++) {
            const res = await ddb.send(new BatchGetCommand(req));
            for (const it of (res.Responses && res.Responses[table]) || []) out.set(it[keyField], it);
            const un = res.UnprocessedKeys && res.UnprocessedKeys[table];
            if (!un || !un.Keys || !un.Keys.length) break;
            req = { RequestItems: { [table]: un } };
            await sleep(200 * (attempt + 1));
        }
    }
    return out;
}

// ── 6. ATM IV from the raw chain (retired writer's rule, vendor-decimal aware) ──
function extractIv(c) {
    const raw = c && (c.implied_volatility ?? (c.greeks && c.greeks.implied_volatility) ?? c.iv);
    if (typeof raw !== 'number' || !(raw > 0)) return null;
    const pct = raw < 5 ? raw * 100 : raw;      // vendor gives decimals (0.45 = 45%); IV ≥ 500% is noise
    return pct > 0 && pct < 1000 ? pct : null;
}
function atmIvFromChain(chain, px) {
    if (!chain || !(px > 0)) return null;
    const all = [...(chain.probeResults || []), ...(chain.exactResults || [])]
        .map((c) => ({ k: num(c.details && c.details.strike_price), type: String((c.details && c.details.contract_type) || '').toLowerCase(), c }))
        .filter((x) => x.k > 0 && (x.type === 'call' || x.type === 'put'));
    if (!all.length) return null;
    let use = all;
    if (chain.weeklyExpiry) {
        const wk = all.filter((x) => x.c.details.expiration_date === chain.weeklyExpiry);
        if (wk.length) use = wk;
    }
    const strikes = [...new Set(use.map((x) => x.k))].sort((a, b) => a - b);
    const atm = strikes.reduce((best, s) => Math.abs(s - px) < Math.abs(best - px) ? s : best);
    const callIv = extractIv((use.find((x) => x.k === atm && x.type === 'call') || {}).c);
    const putIv = extractIv((use.find((x) => x.k === atm && x.type === 'put') || {}).c);
    if (callIv != null && putIv != null) {
        const spread = Math.abs(callIv - putIv);
        return Math.round(spread > 40 ? Math.min(callIv, putIv) : (callIv + putIv) / 2);
    }
    const fb = callIv ?? putIv;
    return fb != null ? Math.round(fb) : null;
}
async function loadChainIv(tickers, pxOf, staleCutoff) {
    const out = new Map();
    await mapPool(tickers, CHAIN_CONCURRENCY, async (t) => {
        const chain = await proxyGet(`polygon:snapshot:probe:${t}`, 20000);
        if (!chain || !(chain._ts > staleCutoff)) return;
        const iv = atmIvFromChain(chain, pxOf(t));
        if (iv != null) out.set(t, iv);
    });
    return out;
}

// ── 7. Intrinio: market cap + close-ring seed ───────────────────────────────
async function fetchMarketCap(t) {
    const r = await intrinioGet(`securities/${encodeURIComponent(t)}/data_point/marketcap/number`);
    if (r.status === 404) return { mcap: null, status: 404 };
    if (!r.ok) return { mcap: null, status: r.status || 0 };
    const n = num(String(r.body).trim());
    return { mcap: n != null && n > 0 ? n : null, status: 200 };
}
async function fetchCloseRing(t) {
    const r = await intrinioGet(`securities/${encodeURIComponent(t)}/prices`, { page_size: String(SMA_RING + 10), frequency: 'daily' });
    if (!r.ok) return null;
    const j = parseMaybeJson(r.body);
    const rows = (j && j.stock_prices) || [];
    const ring = [];
    for (const p of rows) { const c = num(p.adj_close ?? p.close); if (p.date && c > 0) ring.push({ d: p.date, c }); }
    ring.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
    return ring.length ? ring.slice(-SMA_RING) : null;
}

// ring = [{d, c}] ascending. Returns a NEW ring extended with `hist` dates missing from it.
function extendRing(ring, dates, closesArr) {
    if (!Array.isArray(dates) || !Array.isArray(closesArr)) return ring;
    const have = new Set(ring.map((x) => x.d));
    let changed = false;
    const out = ring.slice();
    for (let i = 0; i < dates.length; i++) {
        const c = num(closesArr[i]);
        if (!(c > 0) || have.has(dates[i])) continue;
        out.push({ d: dates[i], c }); changed = true;
    }
    if (!changed) return ring;
    out.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
    return out.slice(-SMA_RING);
}
function smaDistance(ring, todayPx, today) {
    if (!ring || !ring.length) return null;
    const closes = ring.map((x) => x.c);
    if (todayPx > 0 && ring[ring.length - 1].d < today) closes.push(todayPx); // today's bake price as the running bar
    if (closes.length < SMA_RING) return null;
    const last = closes.slice(-SMA_RING);
    const sma200 = mean(last), sma50 = mean(last.slice(-50));
    if (!(sma200 > 0) || !(sma50 > 0)) return null;
    return Math.round(((sma50 - sma200) / sma200) * 10000) / 100;   // retired writer: distance = (sma50−sma200)/sma200×100 (2dp)
}
function looksLikeSplit(ring, todayPx) {
    if (!ring || !ring.length || !(todayPx > 0)) return false;
    const ratio = todayPx / ring[ring.length - 1].c;
    return ratio > 1.66 || ratio < 0.6;
}

// ── main entry ───────────────────────────────────────────────────────────────
/**
 * @param {object} p
 * @param {import('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient} p.ddb
 * @param {string} p.table       signum-xs-history (own store; `_SRC_` rows live here)
 * @param {string} p.today       YYYY-MM-DD (UTC, engine convention)
 * @param {number} p.staleCutoff epoch ms — anything older is a zombie
 * @param {number} p.mcapMin
 * @param {boolean} [p.seedAll]  backfill mode: ignore per-run Intrinio caps
 * @returns {{ snaps: Map, srcWrites: object[], eodCloses: Map, coverage: object }}
 */
async function buildSourceSnapshots(p) {
    const { ddb, table, today, staleCutoff, mcapMin } = p;
    const seedAll = !!p.seedAll;
    const log = p.log || console.log;
    const t0 = Date.now();

    // A. independent bulk reads in parallel
    const [struct, finra, si, eod] = await Promise.all([
        loadStructureRows(staleCutoff),
        loadFinraOffExchange(staleCutoff).catch((e) => { log(`[XS-SRC] finra:offexchange fail: ${e.message}`); return { map: new Map(), date: null }; }),
        loadShortInterest().catch((e) => { log(`[XS-SRC] short-interest fail: ${e.message}`); return { map: new Map(), date: null }; }),
        loadEodHistory().catch((e) => { log(`[XS-SRC] eod:history fail: ${e.message}`); return { dates: [], closes: {} }; }),
    ]);
    if (struct.rows.size === 0) {
        // ★메시지가 «범인»을 지목하게 한다. 조각을 읽었는데 행이 0 이면 «오래됨»이고,
        //   조각 자체가 0 이면 «못 읽음»(자격·창고 문제)이다. 둘은 처방이 완전히 다르다.
        const age = struct.newestTs ? Math.round((Date.now() - struct.newestTs) / 60000) + '분' : '알 수 없음';
        throw new Error(struct.parts === 0
            ? `structure cache unreadable — Upstash·EC2 프록시 양쪽에서 ${STRUCT_PARTS}조각 중 0조각(자격증명 또는 저장소 불일치를 먼저 본다. 크론 문제가 아니다)`
            : `structure cache all stale — ${struct.parts}조각을 ${struct.src} 에서 읽었으나 staleCutoff 를 통과한 행이 0 (최신 굽기 ${age} 전)`);
    }

    // zombie guard #2: must have an official EOD bar within the last 4 sessions
    const recentDates = eod.dates.slice(-4);
    const hasRecentEod = (t) => {
        const arr = eod.closes[t];
        if (!Array.isArray(arr) || !recentDates.length) return eod.dates.length === 0; // matrix unavailable → don't block on it
        for (let i = eod.dates.length - recentDates.length; i < eod.dates.length; i++) if (num(arr[i]) > 0) return true;
        return false;
    };
    const tickers = [...struct.rows.keys()].filter((t) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(t) && hasRecentEod(t)).sort();
    log(`[XS-SRC] structure rows ${struct.rows.size} (parts ${struct.parts}/${STRUCT_PARTS}, newest bake ${struct.newestTs ? new Date(struct.newestTs).toISOString() : '-'}) → ${tickers.length} live tickers · finra ${finra.map.size} (${finra.date}) · short-interest ${si.map.size} (${si.date}) · eod matrix ${eod.dates.length}d/${Object.keys(eod.closes).length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

    // B. per-ticker DynamoDB reads (own _SRC_ rows, analyst, peers) in parallel
    const [srcItems, analyst, related] = await Promise.all([
        batchGet(ddb, table, tickers.map((t) => ({ ticker: t, date: SRC_DATE_KEY })), 'ticker'),
        (async () => { const m = new Map(); await mapPool(tickers, DDB_CONCURRENCY, async (t) => { const it = await queryLatest(ddb, PATTERN_TABLE, 'pattern', `ANALYST:${t}`); if (it && it.timestamp > Date.now() - ANALYST_MAX_AGE_MS && num(it.bullishPct) != null) m.set(t, num(it.bullishPct)); }); return m; })(),
        (async () => { const m = new Map(); await mapPool(tickers, DDB_CONCURRENCY, async (t) => { const it = await queryLatest(ddb, PATTERN_TABLE, 'pattern', `RELATED:${t}`); if (it && Array.isArray(it.tickers) && it.tickers.length) m.set(t, it.tickers.filter((x) => typeof x === 'string' && x && x !== t).slice(0, 8)); }); return m; })(),
    ]);
    log(`[XS-SRC] ddb: _SRC_ ${srcItems.size} · analyst ${analyst.size} · peers ${related.size} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

    // C. ATM IV from raw chains (only where a chain plausibly exists)
    const withChain = tickers.filter((t) => struct.rows.get(t).gex != null || struct.rows.get(t).oi > 0);
    const chainIv = await loadChainIv(withChain, (t) => struct.rows.get(t).px, staleCutoff);
    // fallbacks for tickers the flow harvester does not park (the app's on-demand names)
    const needIv = tickers.filter((t) => !chainIv.has(t));
    if (needIv.length) {
        const ah = await batchGet(ddb, ALPHA_TABLE, needIv.map((t) => ({ ticker: t, date: today })), 'ticker');
        for (const [t, it] of ah) { const v = num(it.atmIv); if (v > 0) chainIv.set(t, v); }
        const still = needIv.filter((t) => !chainIv.has(t));
        await mapPool(still, DDB_CONCURRENCY, async (t) => {
            const it = await queryLatest(ddb, GEX_TABLE, 'ticker', t);
            if (it && it.timestamp > staleCutoff && num(it.atmIv) > 0) chainIv.set(t, num(it.atmIv));
        });
    }
    log(`[XS-SRC] iv: chain ${withChain.length} → ${chainIv.size} with IV (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

    // D. market cap + close ring maintenance (own _SRC_ rows; paced Intrinio)
    const now = Date.now();
    const srcState = new Map(); // t → { mcap, mcapAt, mcapStatus, ring, seededAt, dirty }
    for (const t of tickers) {
        const it = srcItems.get(t) || {};
        let ring = null;
        if (Array.isArray(it.sd) && Array.isArray(it.sc) && it.sd.length === it.sc.length) ring = it.sd.map((d, i) => ({ d, c: num(it.sc[i]) })).filter((x) => x.d && x.c > 0);
        srcState.set(t, { mcap: num(it.mcap), mcapAt: num(it.mcapAt) || 0, mcapStatus: it.mcapStatus || null, ring, seededAt: it.seededAt || null, dirty: false });
    }
    // D1. extend rings with official closes (T+1 matrix) — zero vendor calls
    for (const t of tickers) {
        const s = srcState.get(t);
        if (!s.ring || !s.ring.length) continue;
        if (looksLikeSplit(s.ring, struct.rows.get(t).px)) { s.ring = null; s.seededAt = null; s.dirty = true; continue; } // reseed (adjusted) below
        const ext = extendRing(s.ring, eod.dates, eod.closes[t]);
        if (ext !== s.ring) { s.ring = ext; s.dirty = true; }
    }
    // D2. what needs a vendor call this run (oldest first, capped)
    const mcapDue = tickers.filter((t) => {
        const s = srcState.get(t);
        if (s.mcap > 0) return now - s.mcapAt > MCAP_REFRESH_MS;
        return now - s.mcapAt > (s.mcapStatus === 404 ? MCAP_MISS_RETRY_MS : 86400000 / 2);
    }).sort((a, b) => srcState.get(a).mcapAt - srcState.get(b).mcapAt);
    // young listings never reach 200 sessions — don't re-seed those more than weekly
    const seedDue = tickers.filter((t) => { const s = srcState.get(t); return (!s.ring || s.ring.length < SMA_RING) && (!s.seededAt || now - s.seededAt > MCAP_REFRESH_MS); });
    const mcapBatch = seedAll ? mcapDue : mcapDue.slice(0, MCAP_MAX_PER_RUN);
    const seedBatch = seedAll ? seedDue : seedDue.slice(0, SMA_SEED_MAX_PER_RUN);
    log(`[XS-SRC] intrinio due: mcap ${mcapDue.length} (doing ${mcapBatch.length}) · sma-seed ${seedDue.length} (doing ${seedBatch.length}) @ ${INTRINIO_RATE_PER_MIN}/min`);
    if (!INTRINIO_KEY && (mcapBatch.length || seedBatch.length)) log('[XS-SRC] ⚠ INTRINIO_API_KEY missing — market cap / SMA seeding skipped this run');
    const jobs = [
        ...mcapBatch.map((t) => ({ t, kind: 'mcap' })),
        ...seedBatch.map((t) => ({ t, kind: 'seed' })),
    ];
    let mcapOk = 0, mcap404 = 0, mcapFail = 0, seedOk = 0, seedFail = 0;
    if (INTRINIO_KEY) {
        await mapPool(jobs, INTRINIO_CONCURRENCY, async (job) => {
            const s = srcState.get(job.t);
            if (job.kind === 'mcap') {
                const r = await fetchMarketCap(job.t);
                if (r.status === 200 && r.mcap > 0) { s.mcap = r.mcap; s.mcapAt = now; s.mcapStatus = 200; s.dirty = true; mcapOk++; }
                else if (r.status === 404) { s.mcap = null; s.mcapAt = now; s.mcapStatus = 404; s.dirty = true; mcap404++; }
                else mcapFail++;                                    // transient → keep old value, retry next run
            } else {
                const ring = await fetchCloseRing(job.t);
                if (ring && ring.length >= 50) { s.ring = extendRing(ring, eod.dates, eod.closes[job.t]); s.seededAt = now; s.dirty = true; seedOk++; }
                else seedFail++;
            }
        });
    }
    log(`[XS-SRC] intrinio: mcap ok ${mcapOk} / 404 ${mcap404} / fail ${mcapFail} · seed ok ${seedOk} / fail ${seedFail} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

    // D3. last-resort market cap: the frozen unified row scaled by price (vendor outage / first-run cap)
    const noMcap = tickers.filter((t) => { const s = srcState.get(t); return !(s.mcap > 0) && s.mcapStatus !== 404; });
    let mcapScaled = 0;
    if (noMcap.length) {
        const uni = await batchGet(ddb, UNIFIED_TABLE, noMcap.map((t) => ({ pk: t })), 'pk').catch(() => new Map());
        for (const t of noMcap) {
            const it = uni.get(t); if (!it) continue;
            const d = typeof it.data === 'string' ? parseMaybeJson(it.data) : it.data;
            const m0 = num(d && d.fundamentals && d.fundamentals.marketCap), p0 = num(d && d.structure && d.structure.underlyingPrice);
            const px = struct.rows.get(t).px;
            if (m0 > 0 && p0 > 0 && px > 0) { srcState.get(t).mcapFallback = m0 * (px / p0); mcapScaled++; }
        }
    }

    // E. assemble snapshots (engine shape) + coverage
    const snaps = new Map();
    const cov = { struct: tickers.length, mcap: 0, mcapScaled, gex: 0, pcr: 0, squeeze: 0, iv: 0, darkPool: 0, shortVol: 0, analyst: 0, sma: 0, dtc: 0, peers: 0, belowMcap: 0, noMcap: 0 };
    for (const t of tickers) {
        const row = struct.rows.get(t), s = srcState.get(t);
        const mcap = s.mcap > 0 ? s.mcap : (s.mcapFallback > 0 ? s.mcapFallback : null);
        if (!(mcap > 0)) { cov.noMcap++; continue; }
        if (!(row.px > 1) || !(mcap >= mcapMin)) { cov.belowMcap++; continue; }   // stocks only, no micro/ETF-ish (unchanged rule)
        const f = finra.map.get(t);
        const smaDist = smaDistance(s.ring, row.px, today);
        const snap = {
            price: row.px,
            mcap,
            netGex: num(row.gex),
            pcr: num(row.pcr),
            iv: chainIv.has(t) ? chainIv.get(t) : null,
            squeeze: num(row.sq),
            darkPool: f ? f.darkPool : null,
            shortVol: f ? f.shortVol : null,
            blockTrades: null,                                   // no live source (documented above)
            bullishPct: analyst.has(t) ? analyst.get(t) : null,
            smaDist,
            dtc: si.map.has(t) ? si.map.get(t) : null,
            peers: related.get(t) || [],
        };
        snaps.set(t, snap);
        cov.mcap++;
        if (snap.netGex != null) cov.gex++; if (snap.pcr != null) cov.pcr++; if (snap.squeeze != null) cov.squeeze++;
        if (snap.iv != null) cov.iv++; if (snap.darkPool != null) cov.darkPool++; if (snap.shortVol != null) cov.shortVol++;
        if (snap.bullishPct != null) cov.analyst++; if (snap.smaDist != null) cov.sma++; if (snap.dtc != null) cov.dtc++;
        if (snap.peers.length >= 3) cov.peers++;
    }

    // F. own-store writes (only rows that changed)
    const srcWrites = [];
    const nowIso = new Date().toISOString();
    for (const t of tickers) {
        const s = srcState.get(t);
        if (!s.dirty) continue;
        const ring = s.ring || [];
        srcWrites.push({
            ticker: t, date: SRC_DATE_KEY,
            mcap: s.mcap > 0 ? Math.round(s.mcap) : null, mcapAt: s.mcapAt || null, mcapStatus: s.mcapStatus || null,
            sd: ring.map((x) => x.d), sc: ring.map((x) => Math.round(x.c * 10000) / 10000),
            seededAt: s.seededAt || null, updatedAt: nowIso,
        });
    }

    // official closes per ticker, for the engine's own close-ring backfill
    const eodCloses = new Map();
    for (const t of snaps.keys()) {
        const arr = eod.closes[t];
        if (!Array.isArray(arr)) continue;
        const list = [];
        for (let i = 0; i < eod.dates.length; i++) { const c = num(arr[i]); if (c > 0 && eod.dates[i] < today) list.push({ d: eod.dates[i], c }); }
        if (list.length) eodCloses.set(t, list);
    }

    log(`[XS-SRC] coverage ${JSON.stringify(cov)} · srcWrites ${srcWrites.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    return { snaps, srcWrites, eodCloses, coverage: cov, sources: { structureBake: struct.newestTs ? new Date(struct.newestTs).toISOString() : null, finraDate: finra.date, shortInterestDate: si.date, eodLast: eod.dates[eod.dates.length - 1] || null } };
}

/**
 * Ring hygiene for the engine's own `_STATE_` item after an outage.
 *  - closes: back-fill missing sessions with official EOD closes (so c1/c3 are
 *    truly 1 and 3 sessions ago); keep the engine's own entries where present.
 *  - gexes / bulls: drop entries older than 14 calendar days — a 7-slot ring
 *    cannot legitimately reach that far, so such entries would make "5d ago"
 *    mean "three weeks ago".
 * Mutates and returns `st`. Pure input freshness; factor formulas untouched.
 */
function sanitizeRings(st, eodClosesForTicker, today, closeRing) {
    if (!st) return st;
    const nowMs = Date.parse(`${today}T00:00:00Z`);
    const tooOld = (d) => !d || nowMs - Date.parse(`${d}T00:00:00Z`) > RING_PRUNE_MS;
    if (Array.isArray(eodClosesForTicker) && eodClosesForTicker.length) {
        const own = new Map((st.closes || []).filter((x) => x && x.d && x.c > 0).map((x) => [x.d, x.c]));
        let changed = false;
        for (const x of eodClosesForTicker) if (!own.has(x.d)) { own.set(x.d, x.c); changed = true; }
        if (changed) st.closes = [...own.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([d, c]) => ({ d, c })).slice(-(closeRing || 22));
    }
    for (const k of ['gexes', 'bulls']) {
        if (!Array.isArray(st[k]) || !st[k].length) continue;
        const kept = st[k].filter((x) => x && !tooOld(x.d));
        if (kept.length !== st[k].length) st[k] = kept;
    }
    return st;
}

module.exports = { buildSourceSnapshots, sanitizeRings, atmIvFromChain, smaDistance, extendRing, SRC_DATE_KEY };
