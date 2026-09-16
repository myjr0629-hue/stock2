// ============================================================================
// SIGNUM XS-3.0 — S&P 500 트레이딩 유니버스용 크로스섹션 스코어 (섀도 전용)
// 사전등록: .agent/XS3_PREREG.md — 아래 상수는 등록 후 변경 금지.
// 입력은 전부 읽기 전용(XS-2.0 z 벡터 · EOD 매트릭스 · pattern-db · Wikipedia · FMP).
// 쓰기는 자기 저장소만: DynamoDB signum-xs3-history + Redis cache:xs3:*.
// 주문 코드 없음. UI/마케팅 미노출.
// ============================================================================
'use strict';
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, QueryCommand, GetCommand, PutCommand, BatchGetCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const VER = 'XS-3.0.0';
const SRC_TABLE = 'signum-xs-history';
const TABLE = 'signum-xs3-history';
const PDB = 'signum-pattern-db';
// ── 동결 상수 (PREREG §2~§5) ────────────────────────────────────────────────
const CORE = ['revRet3', 'revChg', 'smaExt', 'squeeze'];
const MIN_CORE = 3;
const EMA_ALPHA = 0.4;
const HORIZON = 5;
const TOP_N = 20;
const TOP_PCT = 0.10;
const COST_RT = 0.0015;
const EARN_EXCL_SESSIONS = 5;
const MIN_PRICE = 5;
const SECTOR_RESID = 0.5;
const VIX_HI = 20, VIX_LO = 14, EXPO_HI = 1.25, EXPO_LO = 0.75;
const TRANCHES = 5;
const CAPITAL0 = 10000;
const WEEK_KILL = -0.03;
const MIN_SP_UNIVERSE = 400;
const LEDGER_MAX = 400;

// ── 수학 ────────────────────────────────────────────────────────────────────
const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
const sd = (a) => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
function rank(arr) { const idx = arr.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(arr.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; }
function pearson(x, y) { const n = x.length; if (n < 5) return null; const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null; }
const spearman = (x, y) => pearson(rank(x), rank(y));
function nwT(s, lag) { const n = s.length; if (n < 3) return NaN; const m = mean(s), e = s.map((v) => v - m); let v = mean(e.map((x) => x * x)); for (let l = 1; l <= lag; l++) { const w = 1 - l / (lag + 1); let g = 0; for (let i = l; i < n; i++) g += e[i] * e[i - l]; v += 2 * w * g / n; } return v > 0 ? m / Math.sqrt(v / n) : NaN; }
function bootCI(series, block = 5, B = 2000) { const n = series.length; if (n < 8) return null; let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; const out = []; for (let b = 0; b < B; b++) { const s = []; while (s.length < n) { const st = Math.floor(rnd() * n); for (let j = 0; j < block && s.length < n; j++) s.push(series[(st + j) % n]); } out.push(mean(s)); } out.sort((a, b) => a - b); return { lo: out[Math.floor(B * 0.025)], hi: out[Math.floor(B * 0.975)], pLe0: out.filter((x) => x <= 0).length / B }; }
const r4 = (x) => (x == null || Number.isNaN(x)) ? null : Math.round(x * 10000) / 10000;
const normT = (t) => String(t || '').toUpperCase().replace(/\./g, '-');

// ── 순수 스코어링 (로컬 백테스트와 Lambda 가 같은 함수를 쓴다) ─────────────
/** rows: [{t, z:{...}, c(close), m(mcap)}], prevEma: Map(t→ema), sp: Map(normT→sector) → {scored:[...], ema:Map} */
function scoreDay(rows, prevEma, sp) {
  const scored = [];
  for (const r of rows) {
    if (!r.z) continue;
    const vals = CORE.map((k) => r.z[k]).filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (vals.length < MIN_CORE) continue;
    const comp = mean(vals);
    const p = prevEma.get(r.t);
    const ema = (typeof p === 'number') ? EMA_ALPHA * comp + (1 - EMA_ALPHA) * p : comp;
    const sector = sp.get(normT(r.t)) || null;
    scored.push({ t: r.t, comp, ema, coreN: vals.length, close: r.c, mcap: r.m, sp500: !!sector, sector, xs2: typeof r.xs === 'number' ? r.xs : null });
  }
  // 변형 B: 섹터 잔차 (S&P 종목만)
  const bySector = new Map();
  for (const s of scored) if (s.sector) { if (!bySector.has(s.sector)) bySector.set(s.sector, []); bySector.get(s.sector).push(s.comp); }
  const secMean = new Map([...bySector].map(([k, v]) => [k, mean(v)]));
  for (const s of scored) s.compB = s.sector ? s.comp - SECTOR_RESID * secMean.get(s.sector) : s.comp;
  // 백분위
  const pct = (arr, key, out) => { const rk = rank(arr.map((s) => s[key])); const n = arr.length; arr.forEach((s, i) => { s[out] = Math.round(((rk[i] - 0.5) / n) * 1000) / 10; }); };
  pct(scored, 'ema', 'xs3');
  pct(scored, 'compB', 'xs3B');
  pct(scored, 'comp', 'xs3D');
  const spOnly = scored.filter((s) => s.sp500);
  if (spOnly.length) pct(spOnly, 'ema', 'spPct');
  const ema = new Map(scored.map((s) => [s.t, s.ema]));
  return { scored, ema };
}

/** 트레이딩 후보: S&P ∩ 가격 ≥5 ∩ 코어≥3 ∩ 실적 제외 → 상위 TOP_N */
function tradeList(scored, earningsSoon, vix) {
  const elig = scored.filter((s) => s.sp500 && s.close >= MIN_PRICE && s.coreN >= MIN_CORE && !earningsSoon.has(normT(s.t)));
  const sorted = elig.slice().sort((a, b) => b.xs3 - a.xs3);
  const top = sorted.slice(0, TOP_N).map((s) => ({ t: s.t, xs3: s.xs3, spPct: s.spPct, sector: s.sector, close: s.close }));
  const topB = elig.slice().sort((a, b) => b.xs3B - a.xs3B).slice(0, TOP_N).map((s) => s.t);
  const topD = elig.slice().sort((a, b) => b.xs3D - a.xs3D).slice(0, TOP_N).map((s) => s.t);
  const topPct = sorted.slice(0, Math.max(TOP_N, Math.floor(sorted.length * TOP_PCT))).map((s) => s.t);
  const exposure = vix == null ? 1 : vix >= VIX_HI ? EXPO_HI : vix < VIX_LO ? EXPO_LO : 1;
  return { eligible: elig.length, top, topB, topD, topPct, exposure, vix };
}

/** 라벨 통계: labeled=[{t, xs3, xs3B, xs2, sp500, adj5, spyAdj5}] → 일일 IC 들 + 데실 + 상위20 순수익 */
function dayStats(labeled, topListThatDay, topB, topD) {
  const all = labeled.filter((x) => Number.isFinite(x.adj5));
  const sp = all.filter((x) => x.sp500);
  const ic = (arr, k, lab = 'adj5') => arr.length >= 30 ? spearman(arr.map((x) => x[k]), arr.map((x) => x[lab])) : null;
  const dec = []; if (sp.length >= 50) { const s = sp.slice().sort((a, b) => a.xs3 - b.xs3); for (let d = 0; d < 10; d++) { const seg = s.slice(Math.floor(d * s.length / 10), Math.floor((d + 1) * s.length / 10)); dec.push({ d, adj: r4(mean(seg.map((x) => x.spyAdj5 ?? x.adj5))), hit: r4(seg.filter((x) => (x.spyAdj5 ?? x.adj5) > 0).length / seg.length), n: seg.length }); } }
  const topStat = (list) => { if (!list || !list.length) return null; const set = new Set(list.map(normT)); const rows = sp.filter((x) => set.has(normT(x.t))); if (rows.length < 5) return null; return { n: rows.length, gross: r4(mean(rows.map((x) => x.f5))), spyAdj: r4(mean(rows.map((x) => x.spyAdj5 ?? x.adj5))), net: r4(mean(rows.map((x) => (x.spyAdj5 ?? x.adj5) - COST_RT))) }; };
  const top20 = topStat(topListThatDay), top20B = topStat(topB), top20D = topStat(topD);
  return { n: all.length, nSp: sp.length, icAll: r4(ic(all, 'xs3')), icSp: r4(ic(sp, 'xs3')), icSpB: r4(ic(sp, 'xs3B')), icSpXs2: r4(ic(sp.filter((x) => typeof x.xs2 === 'number'), 'xs2')), icSpD: r4(ic(sp, 'xs3D')), icSpSpy: r4(ic(sp, 'xs3', 'spyAdj5')), deciles: dec, top20, top20B, top20D };
}

/** 누적 리포트: ledger=[{d, icSp, icSpB, icSpXs2, top20:{net}, ...}] */
function aggregate(ledger) {
  const live = ledger.filter((x) => !x.backfill);
  const agg = (arr, key) => { const v = arr.map((x) => x[key]).filter((x) => typeof x === 'number'); if (!v.length) return null; return { days: v.length, mean: r4(mean(v)), sd: r4(sd(v)), nwT: r4(nwT(v, HORIZON - 1)), icir: r4(mean(v) / sd(v)), pos: r4(v.filter((x) => x > 0).length / v.length), ci: bootCI(v) }; };
  const top20 = (arr, key = 'top20') => { const v = arr.map((x) => x[key] && x[key].net).filter((x) => typeof x === 'number'); if (!v.length) return null; return { periods: v.length, meanNet: r4(mean(v)), pos: r4(v.filter((x) => x > 0).length / v.length), nwT: r4(nwT(v, HORIZON - 1)) }; };
  const duel = (arr) => { const d = arr.filter((x) => typeof x.icSp === 'number' && typeof x.icSpXs2 === 'number').map((x) => x.icSp - x.icSpXs2); return d.length ? { days: d.length, meanDelta: r4(mean(d)), winRate: r4(d.filter((x) => x > 0).length / d.length) } : null; };
  const decileMono = (arr) => { const last = arr.filter((x) => x.deciles && x.deciles.length === 10); if (!last.length) return null; const avg = Array.from({ length: 10 }, (_, d) => mean(last.map((x) => x.deciles[d].adj).filter((v) => typeof v === 'number'))); return { avgByDecile: avg.map(r4), spearman: r4(spearman(avg, avg.map((_, i) => i))) }; };
  const g = { live: { icSp: agg(live, 'icSp'), icSpB: agg(live, 'icSpB'), icSpD: agg(live, 'icSpD'), icAll: agg(live, 'icAll'), icSpXs2: agg(live, 'icSpXs2'), top20: top20(live), top20B: top20(live, 'top20B'), top20D: top20(live, 'top20D'), duel: duel(live), deciles: decileMono(live) }, backfill: { icSp: agg(ledger.filter((x) => x.backfill), 'icSp'), top20: top20(ledger.filter((x) => x.backfill)) } };
  const L = g.live;
  g.gates = {
    ic: !!(L.icSp && L.icSp.days >= 60 && L.icSp.mean >= 0.05 && L.icSp.nwT >= 2.0),
    top20: !!(L.top20 && L.top20.periods >= 60 && L.top20.meanNet > 0 && L.top20.pos >= 0.55),
    mono: !!(L.deciles && L.deciles.spearman >= 0.8),
    duel: !!(L.duel && L.duel.days >= 60 && L.duel.winRate >= 0.55),
    daysLabeled: L.icSp ? L.icSp.days : 0,
  };
  return g;
}

module.exports = { VER, CORE, HORIZON, TOP_N, COST_RT, scoreDay, tradeList, dayStats, aggregate, normT, spearman, nwT, bootCI };

// ── I/O (Lambda 전용) ───────────────────────────────────────────────────────
const REGION = 'us-east-1';
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const UP_URL = process.env.UPSTASH_REDIS_REST_URL || '', UP_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const PROXY_URL = (process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081').replace(/\/$/, '');
const PROXY_KEY = process.env.EC2_REDIS_PROXY_KEY || process.env.REDIS_PROXY_KEY || '';
const FMP_KEY = process.env.FMP_API_KEY || '';

async function upstashSet(key, value, ttl) { if (!UP_URL || !UP_TOKEN) return; try { await fetch(`${UP_URL}/set/${encodeURIComponent(key)}?EX=${ttl}`, { method: 'POST', headers: { Authorization: `Bearer ${UP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); } catch (e) { console.warn('[XS3] upstash set fail', key, e.message); } }
async function proxyGet(key) { if (!PROXY_KEY) return null; try { const r = await fetch(`${PROXY_URL}/get?key=${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${PROXY_KEY}` } }); const j = await r.json(); let v = j.result; if (typeof v === 'string') { try { v = JSON.parse(v); } catch { /* keep */ } } return v ?? null; } catch (e) { console.warn('[XS3] proxy get fail', key, e.message); return null; } }
async function proxySet(key, value, ttl) { if (!PROXY_KEY) return; try { await fetch(`${PROXY_URL}/set`, { method: 'POST', headers: { Authorization: `Bearer ${PROXY_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value: JSON.stringify(value), ttl }) }); } catch (e) { console.warn('[XS3] proxy set fail', key, e.message); } }

async function loadXsRows(date) {
  const rows = []; let lastKey;
  do { const r = await ddb.send(new ScanCommand({ TableName: SRC_TABLE, FilterExpression: '#d = :d', ExpressionAttributeNames: { '#d': 'date', '#c': 'close' }, ExpressionAttributeValues: { ':d': date }, ProjectionExpression: 'ticker, xsScore, #c, mcap, z, ver', ExclusiveStartKey: lastKey })); for (const it of r.Items || []) { if (!it.ticker || it.ticker.startsWith('_')) continue; rows.push({ t: it.ticker, xs: it.xsScore, c: it.close, m: it.mcap, z: it.z, v: it.ver }); } lastKey = r.LastEvaluatedKey; } while (lastKey);
  return rows;
}
async function latestXsDate() { const r = await ddb.send(new QueryCommand({ TableName: SRC_TABLE, KeyConditionExpression: 'ticker = :t', ExpressionAttributeValues: { ':t': '_REPORT_' }, ScanIndexForward: false, Limit: 1 })); return r.Items && r.Items[0] ? r.Items[0].date : null; }
async function loadSP500() {
  try {
    const r = await fetch('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies', { headers: { 'User-Agent': 'Mozilla/5.0 (SIGNUM XS3 research bot)' }, signal: AbortSignal.timeout(20000) });
    const h = await r.text(); const start = h.indexOf('id="constituents"'); const tbl = h.slice(start, h.indexOf('</table>', start));
    const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    const list = []; for (const row of tbl.split(/<tr[^>]*>/).slice(2)) { const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => strip(m[1])); if (tds.length >= 4 && /^[A-Z][A-Z.\-]{0,6}$/.test(tds[0])) list.push({ t: normT(tds[0]), sector: tds[2] }); }
    if (list.length >= MIN_SP_UNIVERSE) { await ddb.send(new PutCommand({ TableName: TABLE, Item: { ticker: '_SP500_', date: '_CURRENT_', list, updatedAt: new Date().toISOString(), source: 'wikipedia' } })); return { map: new Map(list.map((x) => [x.t, x.sector])), source: 'wikipedia', n: list.length }; }
    throw new Error('parsed ' + list.length);
  } catch (e) {
    console.warn('[XS3] SP500 fetch/parse failed:', e.message, '— using cached _SP500_');
    const c = await ddb.send(new GetCommand({ TableName: TABLE, Key: { ticker: '_SP500_', date: '_CURRENT_' } }));
    const list = (c.Item && c.Item.list) || []; return { map: new Map(list.map((x) => [x.t, x.sector])), source: 'cache', n: list.length };
  }
}
async function loadEod() { const v = await proxyGet('intrinio:eod:history'); if (!v || !v.dates || !v.closes) return null; return v; }
async function loadEarnings(tickers) {
  const soon = new Set(); const out = {}; const chunks = []; for (let i = 0; i < tickers.length; i += 20) chunks.push(tickers.slice(i, i + 20));
  for (const ch of chunks) { await Promise.all(ch.map(async (t) => { try { const r = await ddb.send(new QueryCommand({ TableName: PDB, KeyConditionExpression: 'pattern = :p', ExpressionAttributeValues: { ':p': `EARNINGS:${t.replace(/-/g, '.')}` }, ScanIndexForward: false, Limit: 1 })); const it = (r.Items || [])[0]; if (it && it.nextDate) out[t] = it.nextDate; } catch { /* skip */ } })); }
  return out;
}
async function loadVix() { try { if (FMP_KEY) { const r = await fetch(`https://financialmodelingprep.com/stable/quote?symbol=%5EVIX&apikey=${FMP_KEY}`, { signal: AbortSignal.timeout(10000) }); const j = await r.json(); const p = Array.isArray(j) && j[0] ? Number(j[0].price) : NaN; if (Number.isFinite(p)) return p; } } catch { /* fallthrough */ } const v = await proxyGet('yahoo:vix'); const p = v && Number(v.price); return Number.isFinite(p) ? p : null; }
async function loadState(tickers) { const ema = new Map(); for (let i = 0; i < tickers.length; i += 100) { let req = { RequestItems: { [TABLE]: { Keys: tickers.slice(i, i + 100).map((t) => ({ ticker: t, date: '_STATE_' })), ProjectionExpression: 'ticker, ema, lastDate' } } }; for (let k = 0; k < 4; k++) { const r = await ddb.send(new BatchGetCommand(req)); for (const it of (r.Responses && r.Responses[TABLE]) || []) if (typeof it.ema === 'number') ema.set(it.ticker, it.ema); const un = r.UnprocessedKeys && r.UnprocessedKeys[TABLE]; if (!un || !un.Keys || !un.Keys.length) break; req = { RequestItems: { [TABLE]: un } }; } } return ema; }
async function batchPut(items) { for (let i = 0; i < items.length; i += 25) { let req = { RequestItems: { [TABLE]: items.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } })) } }; for (let k = 0; k < 5; k++) { const r = await ddb.send(new BatchWriteCommand(req)); const un = r.UnprocessedItems && r.UnprocessedItems[TABLE]; if (!un || !un.length) break; req = { RequestItems: { [TABLE]: un } }; await new Promise((res) => setTimeout(res, 200 * (k + 1))); } } }
async function loadRowsForDate(date) { const rows = []; let lastKey; do { const r = await ddb.send(new ScanCommand({ TableName: TABLE, FilterExpression: '#d = :d', ExpressionAttributeNames: { '#d': 'date' }, ExpressionAttributeValues: { ':d': date }, ExclusiveStartKey: lastKey })); for (const it of r.Items || []) if (!it.ticker.startsWith('_')) rows.push(it); lastKey = r.LastEvaluatedKey; } while (lastKey); return rows; }

// ── 핸들러 ──────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const t0 = Date.now(); const dry = !!(event && event.dry) || process.env.DRY === '1';
  const today = new Date().toISOString().slice(0, 10);
  const srcDate = await latestXsDate();
  if (!srcDate) throw new Error('no XS-2.0 report date');
  const fresh = srcDate === today;
  console.log(`[XS3] ${VER} run ${today} · source XS-2.0 date ${srcDate}${fresh ? '' : ' (STALE — not today)'} · dry=${dry}`);
  const [rows, sp, eod, vix] = await Promise.all([loadXsRows(srcDate), loadSP500(), loadEod(), loadVix()]);
  console.log(`[XS3] inputs: rows ${rows.length} · sp500 ${sp.n} (${sp.source}) · eod ${eod ? eod.dates.length + 'd/' + Object.keys(eod.closes).length : 'MISSING'} · vix ${vix}`);
  if (rows.length < 200) throw new Error('XS-2.0 rows too few: ' + rows.length);
  if (sp.n < MIN_SP_UNIVERSE) throw new Error('S&P universe too small: ' + sp.n);
  const prevEma = await loadState(rows.map((r) => r.t));
  const { scored, ema } = scoreDay(rows, prevEma, sp.map);
  const spScored = scored.filter((s) => s.sp500);
  // 실적 제외 (S&P 후보만)
  const earn = await loadEarnings(spScored.map((s) => normT(s.t)));
  const soon = new Set(); if (eod) { const idx = eod.dates.indexOf(srcDate); const horizonDates = idx >= 0 ? eod.dates.slice(idx + 1, idx + 1 + EARN_EXCL_SESSIONS) : []; const lastKnown = horizonDates.length ? horizonDates[horizonDates.length - 1] : null; for (const [t, d] of Object.entries(earn)) { if (d > srcDate && (lastKnown ? d <= lastKnown : true)) soon.add(t); } }
  const list = tradeList(scored, soon, vix);
  console.log(`[XS3] scored ${scored.length} (S&P ${spScored.length}) · eligible ${list.eligible} · earnings-excluded ${soon.size} · top${TOP_N}: ${list.top.slice(0, 8).map((x) => x.t + ':' + x.xs3).join(' ')}`);
  // 라벨: srcDate 의 HORIZON 세션 전 행에 f5 부여 (EOD 매트릭스)
  let labelStats = null, labelDate = null;
  if (eod) { const i = eod.dates.indexOf(srcDate); if (i >= HORIZON) { labelDate = eod.dates[i - HORIZON]; const past = await loadRowsForDate(labelDate); if (past.length) { const spy = eod.closes.SPY; const spyF = spy && spy[i] > 0 && spy[i - HORIZON] > 0 ? spy[i] / spy[i - HORIZON] - 1 : null; const lab = []; for (const p of past) { const c = eod.closes[p.ticker] || eod.closes[p.ticker.replace(/-/g, '.')]; if (!c || !(c[i] > 0) || !(c[i - HORIZON] > 0)) continue; const f5 = c[i] / c[i - HORIZON] - 1; if (Math.abs(f5) > 1.5) continue; lab.push({ ...p, t: p.ticker, f5 }); } if (lab.length >= 100) { const mu = mean(lab.map((x) => x.f5)); for (const x of lab) { x.adj5 = x.f5 - mu; x.spyAdj5 = spyF == null ? null : x.f5 - spyF; } const trade = await ddb.send(new GetCommand({ TableName: TABLE, Key: { ticker: '_TRADE_', date: labelDate } })); labelStats = dayStats(lab, trade.Item && trade.Item.top ? trade.Item.top.map((x) => x.t) : [], trade.Item && trade.Item.topB, trade.Item && trade.Item.topD); labelStats.d = labelDate; labelStats.spyF5 = r4(spyF); if (!dry) await batchPut(lab.map((x) => ({ ...x, ticker: x.t, f5: r4(x.f5), adj5: r4(x.adj5), spyAdj5: r4(x.spyAdj5), labeledAt: new Date().toISOString() }))); console.log(`[XS3] labeled ${labelDate}: n=${labelStats.n} icSp=${labelStats.icSp} icSpB=${labelStats.icSpB} icSpXs2=${labelStats.icSpXs2} top20=${JSON.stringify(labelStats.top20)}`); } } } }
  // 레저·리포트
  const ledgerItem = await ddb.send(new GetCommand({ TableName: TABLE, Key: { ticker: '_LEDGER_', date: '_CURRENT_' } }));
  let ledger = (ledgerItem.Item && ledgerItem.Item.days) || [];
  if (labelStats) { ledger = ledger.filter((x) => x.d !== labelStats.d); ledger.push({ ...labelStats, backfill: false }); ledger.sort((a, b) => a.d < b.d ? -1 : 1); if (ledger.length > LEDGER_MAX) ledger = ledger.slice(-LEDGER_MAX); }
  const report = { ver: VER, date: srcDate, runAt: new Date().toISOString(), fresh, scored: scored.length, sp500: spScored.length, spSource: sp.source, eligible: list.eligible, earningsExcluded: soon.size, vix, exposure: list.exposure, top: list.top, topPctN: list.topPct.length, latestLabel: labelStats, ...aggregate(ledger), elapsedMs: Date.now() - t0 };
  if (!dry) {
    await batchPut(scored.map((s) => ({ ticker: s.t, date: srcDate, ver: VER, xs3: s.xs3, xs3B: s.xs3B, xs3D: s.xs3D, spPct: s.spPct ?? null, comp: r4(s.comp), ema: r4(s.ema), coreN: s.coreN, close: s.close, mcap: s.mcap, sp500: s.sp500, sector: s.sector, xs2: s.xs2, updatedAt: report.runAt })));
    await batchPut(scored.map((s) => ({ ticker: s.t, date: '_STATE_', ema: r4(s.ema), lastDate: srcDate })));
    await ddb.send(new PutCommand({ TableName: TABLE, Item: { ticker: '_TRADE_', date: srcDate, ...list, updatedAt: report.runAt } }));
    await ddb.send(new PutCommand({ TableName: TABLE, Item: { ticker: '_LEDGER_', date: '_CURRENT_', days: ledger, updatedAt: report.runAt } }));
    await ddb.send(new PutCommand({ TableName: TABLE, Item: { ticker: '_REPORT_', date: srcDate, ...report } }));
    await upstashSet('cache:xs3:report', report, 90 * 86400); await upstashSet('cache:xs3:trade', { date: srcDate, fresh, ...list }, 7 * 86400); await upstashSet('cache:xs3:scores', { date: srcDate, scores: Object.fromEntries(scored.map((s) => [s.t, s.xs3])) }, 7 * 86400);
    await proxySet('cache:xs3:report', report, 90 * 86400); await proxySet('cache:xs3:trade', { date: srcDate, fresh, ...list }, 7 * 86400);
  }
  console.log(`[XS3] done · gates ${JSON.stringify(report.gates)} · ${report.elapsedMs}ms${dry ? ' (dry: nothing written)' : ''}`);
  return { statusCode: 200, body: JSON.stringify({ ok: true, date: srcDate, fresh, scored: scored.length, sp500: spScored.length, top: list.top.slice(0, 5), gates: report.gates, elapsedMs: report.elapsedMs }) };
};

if (require.main === module) { exports.handler({ dry: process.env.DRY === '1' }).then((r) => console.log(r)).catch((e) => { console.error(e); process.exit(1); }); }
