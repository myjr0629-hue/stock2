// ============================================================================
// SIGNUM XS ENGINE — Cross-Sectional Absolute Score (XS-1.0.0)
// ============================================================================
//
// The shadow "quantum" engine. Runs once daily after US close. Fully isolated:
//   READS  (read-only): DynamoDB `signum-unified-cache` (2k tickers: options,
//           flow, analyst, SMA, fundamentals, peer graph — written by harvest)
//   WRITES (own stores only): DynamoDB `signum-xs-history` + Redis `cache:xs:*`
// It never touches the live alphaScore, any UI, or any existing pipeline.
//
// Why it's different from every prior engine version (V3→V8):
//   1. CROSS-SECTIONAL: every factor is ranked ACROSS the universe each day
//      (rank-z), so the score measures relative attractiveness, not market mood.
//   2. SELF-ACCUMULATING: keeps its own close/GEX/analyst rings in a per-ticker
//      _STATE_ item → Δ-factors (reversal, ΔGEX, analyst revision) need no
//      third-party history and no schema coupling.
//   3. IC-ADAPTIVE: factor weights = research priors blended with realized
//      rolling ICs measured on its own T+3 labels. Factors that die lose weight
//      automatically — no more hand retuning cycles.
//   4. PEER-RESIDUAL: composite is partially residualized against RELATED peers.
//   5. SMOOTH + CALIBRATED: EMA(0.4) composite → universe percentile (xsScore
//      0-100) → trailing decile table maps score bands to realized market-adj
//      T+3 alpha & hit-rate = the operational definition of an ABSOLUTE score.
//
// Validation constitution (INFRASTRUCTURE_MAP §42.3) is enforced by design:
// objective = daily cross-sectional Spearman IC vs T+3 market-adjusted returns,
// measured out-of-sample on the engine's own live records (shadow mode).
//
// Zero-dependency: uses global fetch (Upstash REST) + @aws-sdk v3 (bundled in
// the nodejs20.x Lambda runtime). Runs as Lambda handler or local CLI (DRY=1).
// ============================================================================

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, BatchGetCommand, BatchWriteCommand, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const __intrinio = require('./intrinio-adapter');   // Massive → Intrinio 라우팅

// 1.1.0: main xsScore path is IDENTICAL to 1.0.0 — the bump only adds shadow
// variant instrumentation (frozen / anti composites, see FROZEN_PRIORS note).
// 2.0.0 (2026-08-03, 레이스 10일차 판정): MAIN = ensemble mean of the three
// fixed variants (frozen/anti/clean) — every fixed variant beat the adaptive
// main on recon(18d) + live race(5-8d) + gate history, while the single leader
// kept flipping weekly (anti→clean), so the ensemble is the only structure the
// data supports. The old adaptive composite is demoted to a tracked shadow
// (variants.adaptive). Calibration/hit histories RESET at this flip — the new
// main earns its own gate record from day one.
const ENGINE_VERSION = 'XS-2.0.0';
const TABLE = 'signum-xs-history';
const SOURCE_TABLE = 'signum-unified-cache';
const DRY = process.env.DRY === '1';

const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '').trim();

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
    marshallOptions: { removeUndefinedValues: true },
});

// ── Factor registry ─────────────────────────────────────────────────────────
// sign is embedded in extract(); prior = research-measured IC prior (2026-07-06
// full-history backtest, .agent/CONTEXT_SCORE_DEEP_RESEARCH_2026-07.md).
// Factors with prior 0 start neutral and earn weight only via realized IC.
const FACTORS = [
    { key: 'revChg', label: '1D reversal', prior: 0.012, minDays: 2 },     // -(1d own-close change)
    { key: 'revRet3', label: '3D reversal', prior: 0.015, minDays: 4 },    // -(3d own-close return)
    { key: 'gexInv', label: 'Gamma regime (inv)', prior: 0.020, minDays: 1 }, // -(netGex rank) — measured IC -0.073
    { key: 'dGex5', label: 'ΔGEX 5d (inv)', prior: 0.010, minDays: 6 },    // -(gex - gex5dAgo)
    { key: 'pcr', label: 'PCR fear', prior: 0.010, minDays: 1 },           // +pcRatio — measured IC -0.034 on raw pcr→fwd... sign: high PCR = contrarian buy
    { key: 'ivLow', label: 'IV underpricing', prior: 0.008, minDays: 1 },  // -(iv)
    { key: 'squeeze', label: 'Squeeze score', prior: 0, minDays: 1 },      // +squeezeScore (adaptive)
    { key: 'darkPool', label: 'Dark pool', prior: 0, minDays: 1 },         // +darkPool% (adaptive — Apr evidence ambiguous)
    { key: 'shortVol', label: 'Short volume (inv)', prior: 0, minDays: 1 },// -(shortVol%) (adaptive)
    { key: 'blockTrades', label: 'Block trades', prior: 0, minDays: 1 },   // +count (adaptive)
    { key: 'analystRev', label: 'Analyst revision 5d', prior: 0.020, minDays: 6 }, // +Δ(bullishPct,5d) — literature-strong
    { key: 'smaExt', label: 'SMA overextension (inv)', prior: 0, minDays: 1 },     // -(sma distance) (adaptive)
    { key: 'dtc', label: 'Days-to-cover', prior: 0, minDays: 1 },          // +daysToCover (adaptive)
];
// ── v1.1 shadow variants (instrumentation ONLY — main xsScore untouched) ────
// Motivation (2026-07-17 walk-forward lab, V8 price history, 63 OOS days):
// trailing-IC adaptive weighting came out systematically inverted at T+3
// (adaptive IC -0.025 / faster-chasing -0.044 vs no-adaptation +0.005; factor-IC
// autocorrelation negative 10/12). Two live variants let real labels adjudicate:
//   frozen = priors only, adaptation OFF (squeeze gets a literature-level prior
//            so the frozen sleeve isn't blind to short-squeeze structure)
//   anti   = the adaptive term sign-flipped (bets factor ICs mean-revert)
// Their daily/rolling ICs are recorded under report.variants — no score output.
const FROZEN_PRIORS = { revChg: 0.012, revRet3: 0.015, gexInv: 0.020, dGex5: 0.010, pcr: 0.010, ivLow: 0.008, analystRev: 0.020, squeeze: 0.010 };
// v1.2 "clean" variant (PREREGISTERED 2026-07-22, obs-level lab): drops the five
// factors with negative live evidence (revRet3 — D9-loser toxicity t=-3.46,
// shortVol IC t=-2.33, ivLow, pcr, dGex5) and keeps the positive-evidence set at
// the exact C2 recipe that went 3/3 positive days in-sample. Weights are FROZEN
// (no adaptation) so the race tests one clean hypothesis. Shadow scoring only.
const CLEAN_WEIGHTS = { revChg: 0.19, squeeze: 0.15, smaExt: 0.12, gexInv: 0.09, analystRev: 0.08, dtc: 0.02 };

const IC_WINDOW = 60;         // rolling days kept per factor
const PRIOR_WEIGHT_DAYS = 15; // shrinkage: prior dominates until ~15 labeled days
const WEIGHT_CAP = 0.30;      // no factor may exceed 30% of total |weight|
const EMA_ALPHA = 0.4;
const PEER_RESIDUAL = 0.5;    // subtract 50% of peer-mean raw composite
const MIN_FACTORS = 4;        // per-ticker minimum available factors to score
const MIN_UNIVERSE = 40;      // minimum scored tickers for a valid day
const MCAP_MIN = 3e8;
// Z_RING 30 (was 6): labeled observations used to rotate out after ~3 days,
// killing observation-level research. 30 keeps a month of z+label archaeology
// (~7KB/ticker state growth — harmless).
const CLOSE_RING = 22, GEX_RING = 7, ANALYST_RING = 7, Z_RING = 30;

// ── small stats ──────────────────────────────────────────────────────────────
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
function spearman(xs, ys) {
    const n = xs.length; if (n < 10) return null;
    const rank = (arr) => {
        const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
        const r = new Array(n); let i = 0;
        while (i < n) { let j = i; while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; }
        return r;
    };
    const rx = rank(xs), ry = rank(ys), mx = mean(rx), my = mean(ry);
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) { const a = rx[i] - mx, b = ry[i] - my; num += a * b; dx += a * a; dy += b * b; }
    return (dx && dy) ? num / Math.sqrt(dx * dy) : null;
}
// cross-sectional rank → z in (-1, 1)
function rankZ(pairs /* [{i, v}] */) {
    const sorted = [...pairs].sort((a, b) => a.v - b.v);
    const out = new Map();
    sorted.forEach((p, r) => out.set(p.i, ((r + 0.5) / sorted.length) * 2 - 1));
    return out;
}

async function redisSet(key, value, ttlSec) {
    if (!REDIS_URL) return;
    try {
        await fetch(`${REDIS_URL}/pipeline`, {
            method: 'POST', headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify([['SET', key, JSON.stringify(value), 'EX', String(ttlSec)]]),
        });
    } catch { /* report mirror is best-effort */ }
}

// ── main ─────────────────────────────────────────────────────────────────────
async function run() {
    const t0 = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    console.log(`[XS] ${ENGINE_VERSION} run ${today} ${DRY ? '(DRY)' : ''}`);

    // 1. Scan unified-cache (read-only source of truth for today's snapshot)
    // Zombie guard (2026-08-07): delisted/renamed tickers keep frozen cache
    // rows forever (harvest never rewrites symbols absent from the snapshot
    // feed — e.g. BK→BNY left BK frozen since 05-21 yet scored daily). A row
    // whose updatedAt is older than 4 days cannot be a live listing.
    const STALE_CUTOFF = Date.now() - 4 * 86400000;
    const snaps = new Map(); // ticker → snapshot
    let lastKey;
    do {
        const res = await ddb.send(new ScanCommand({ TableName: SOURCE_TABLE, ExclusiveStartKey: lastKey }));
        for (const it of (res.Items || [])) {
            const ticker = it.pk;
            if (!ticker || typeof ticker !== 'string' || ticker.includes(':')) continue;
            if (!(Date.parse(it.updatedAt || '') > STALE_CUTOFF)) continue; // zombie/garbage row
            const d = typeof it.data === 'string' ? safeParse(it.data) : it.data;
            if (!d) continue;
            const price = num(d.structure?.underlyingPrice);
            const mcap = num(d.fundamentals?.marketCap);
            if (!(price > 1) || !(mcap >= MCAP_MIN)) continue; // stocks only, no micro/ETF-ish
            snaps.set(ticker, {
                price,
                mcap,
                netGex: num(d.structure?.netGex ?? d.volatility?.gex),
                pcr: num(d.structure?.pcRatio),
                iv: num(d.volatility?.iv),
                squeeze: num(d.volatility?.squeezeScore),
                darkPool: num(d.institutional?.darkPool?.percent),
                shortVol: num(d.squeeze?.shortVolPercent ?? d.institutional?.shortVolume?.percent),
                blockTrades: num(d.institutional?.blockTrade?.count),
                bullishPct: num(d.analyst?.bullishPct),
                smaDist: num(d.sma?.distance),
                dtc: num(d.squeeze?.daysToCover),
                peers: Array.isArray(d.related?.topRelated) ? d.related.topRelated.map(p => p.ticker).filter(Boolean).slice(0, 8) : [],
            });
        }
        lastKey = res.LastEvaluatedKey;
    } while (lastKey);
    console.log(`[XS] source snapshots: ${snaps.size} tickers (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    if (snaps.size < MIN_UNIVERSE) throw new Error(`universe too small: ${snaps.size}`);

    // 2. BatchGet own _STATE_ items (close/gex/analyst rings + z history)
    const tickers = [...snaps.keys()];
    const states = new Map();
    for (let i = 0; i < tickers.length; i += 100) {
        const keys = tickers.slice(i, i + 100).map(t => ({ ticker: t, date: '_STATE_' }));
        let req = { RequestItems: { [TABLE]: { Keys: keys } } };
        for (let attempt = 0; attempt < 4; attempt++) {
            const res = await ddb.send(new BatchGetCommand(req));
            for (const it of (res.Responses?.[TABLE] || [])) states.set(it.ticker, it);
            const un = res.UnprocessedKeys?.[TABLE];
            if (!un || !un.Keys?.length) break;
            req = { RequestItems: { [TABLE]: un } };
            await sleep(200 * (attempt + 1));
        }
    }
    console.log(`[XS] states loaded: ${states.size}`);

    // 3. Load weights doc (rolling ICs) — single item
    let wdoc = null;
    try {
        const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { ticker: '_WEIGHTS_', date: '_CURRENT_' } }));
        wdoc = r.Item || null;
    } catch { /* first run */ }
    const icHist = wdoc?.icHist || {}; // factorKey → [daily ICs]
    // Gate clock: calibration/hit histories belong to a specific MAIN definition.
    // On a main flip (XS-2.0 ensemble switch) they reset — the new main must earn
    // its own gate record; factor icHist / variant histories are unaffected.
    const mainFlipped = (wdoc?.mainVer || null) !== ENGINE_VERSION;
    const calibHist = mainFlipped ? {} : (wdoc?.calibHist || {}); // decile → [daily mean adjF3]
    const hitHist = mainFlipped ? {} : (wdoc?.hitHist || {});     // decile → [daily hit rates]
    if (mainFlipped) console.log(`[XS] main flipped → ${ENGINE_VERSION}: calibration gate clock RESET`);

    // 4. Per-ticker raw factor values (self-accumulated deltas from state rings)
    const F = new Map(); // ticker → {factorKey: value}
    for (const [ticker, s] of snaps) {
        const st = states.get(ticker);
        const closes = st?.closes || []; // [{d, c}] oldest→newest
        const gexes = st?.gexes || [];
        const bulls = st?.bulls || [];
        const f = {};
        // deltas from own history (exclude same-day duplicates on re-runs)
        const prevCloses = closes.filter(x => x.d !== today);
        const c1 = prevCloses[prevCloses.length - 1], c3 = prevCloses[prevCloses.length - 3];
        if (c1 && c1.c > 0) f.revChg = -((s.price - c1.c) / c1.c);
        if (c3 && c3.c > 0) f.revRet3 = -((s.price - c3.c) / c3.c);
        if (s.netGex != null) f.gexInv = -s.netGex;
        const g5 = gexes.filter(x => x.d !== today);
        if (s.netGex != null && g5.length >= 5 && g5[g5.length - 5].g != null) f.dGex5 = -(s.netGex - g5[g5.length - 5].g);
        if (s.pcr != null) f.pcr = s.pcr;
        if (s.iv != null && s.iv > 0) f.ivLow = -s.iv;
        if (s.squeeze != null) f.squeeze = s.squeeze;
        if (s.darkPool != null) f.darkPool = s.darkPool;
        if (s.shortVol != null) f.shortVol = -s.shortVol;
        if (s.blockTrades != null) f.blockTrades = s.blockTrades;
        const b5 = bulls.filter(x => x.d !== today);
        if (s.bullishPct != null && b5.length >= 5 && b5[b5.length - 5].b != null) f.analystRev = s.bullishPct - b5[b5.length - 5].b;
        if (s.smaDist != null) f.smaExt = -Math.abs(s.smaDist) * Math.sign(s.smaDist); // above SMA = extended → negative
        if (s.dtc != null) f.dtc = s.dtc;
        F.set(ticker, f);
    }

    // 5. Cross-sectional rank-z per factor
    const Z = new Map(); // ticker → {factorKey: z}
    for (const t of tickers) Z.set(t, {});
    for (const { key } of FACTORS) {
        const pairs = [];
        for (const t of tickers) { const v = F.get(t)[key]; if (Number.isFinite(v)) pairs.push({ i: t, v }); }
        if (pairs.length < MIN_UNIVERSE) continue;
        const zm = rankZ(pairs);
        for (const [t, z] of zm) Z.get(t)[key] = z;
    }

    // 6. Weights: prior ⊕ realized rolling IC (shrinkage), capped, normalized
    const weights = {};
    for (const { key, prior } of FACTORS) {
        const ics = icHist[key] || [];
        const realized = ics.length ? mean(ics) : 0;
        const k = ics.length / (ics.length + PRIOR_WEIGHT_DAYS);
        let w = (1 - k) * prior + k * realized;
        weights[key] = w;
    }
    // cap + normalize to Σ|w| = 1
    let sumAbs = Object.values(weights).reduce((s, w) => s + Math.abs(w), 0) || 1;
    for (const k in weights) weights[k] = Math.max(-WEIGHT_CAP, Math.min(WEIGHT_CAP, weights[k] / sumAbs));
    sumAbs = Object.values(weights).reduce((s, w) => s + Math.abs(w), 0) || 1;
    for (const k in weights) weights[k] /= sumAbs;

    // 6b. v1.1 variant weights (shadow instrumentation; same cap/normalize)
    const weightsFrozen = {};
    for (const { key } of FACTORS) weightsFrozen[key] = FROZEN_PRIORS[key] || 0;
    const weightsAnti = {};
    for (const { key, prior } of FACTORS) {
        const ics = icHist[key] || [];
        const realized = ics.length ? mean(ics) : 0;
        const k = ics.length / (ics.length + PRIOR_WEIGHT_DAYS);
        weightsAnti[key] = (1 - k) * prior - k * realized; // adaptive term flipped
    }
    const weightsClean = {};
    for (const { key } of FACTORS) weightsClean[key] = CLEAN_WEIGHTS[key] || 0;
    for (const wv of [weightsFrozen, weightsAnti, weightsClean]) {
        let sa = Object.values(wv).reduce((s, w) => s + Math.abs(w), 0) || 1;
        for (const k in wv) wv[k] = Math.max(-WEIGHT_CAP, Math.min(WEIGHT_CAP, wv[k] / sa));
        sa = Object.values(wv).reduce((s, w) => s + Math.abs(w), 0) || 1;
        for (const k in wv) wv[k] /= sa;
    }

    // 7. Variant raw composites (same z's, variant weights) + adaptive shadow
    const rawVar = new Map(); // ticker → { f: frozen, a: anti, c: clean, d: adaptive(shadow, 구메인) }
    for (const t of tickers) {
        const z = Z.get(t);
        let nf = 0, df = 0, na = 0, da = 0, nc = 0, dc = 0, nd = 0, dd = 0, cnt = 0;
        for (const { key } of FACTORS) {
            if (z[key] === undefined) continue;
            cnt++;
            if (weightsFrozen[key]) { nf += weightsFrozen[key] * z[key]; df += Math.abs(weightsFrozen[key]); }
            if (weightsAnti[key]) { na += weightsAnti[key] * z[key]; da += Math.abs(weightsAnti[key]); }
            if (weightsClean[key]) { nc += weightsClean[key] * z[key]; dc += Math.abs(weightsClean[key]); }
            if (weights[key]) { nd += weights[key] * z[key]; dd += Math.abs(weights[key]); }
        }
        if (cnt >= MIN_FACTORS) rawVar.set(t, {
            f: df > 0 ? nf / df : null, a: da > 0 ? na / da : null,
            c: dc > 0 ? nc / dc : null, d: dd > 0 ? nd / dd : null,
        });
    }

    // 7b. MAIN raw = ensemble mean of the fixed variants (>=2 of 3 required).
    // Downstream (peer residualization → EMA → percentile) unchanged.
    const rawMap = new Map();
    for (const [t, v] of rawVar) {
        const parts = [v.f, v.a, v.c].filter(x => x !== null);
        if (parts.length >= 2) rawMap.set(t, mean(parts));
    }

    // 8. Peer residualization (50% of peer-mean removed)
    const resMap = new Map();
    for (const [t, raw] of rawMap) {
        const peers = snaps.get(t).peers.map(p => rawMap.get(p)).filter(v => v !== undefined);
        const peerMean = peers.length >= 3 ? mean(peers) : 0;
        resMap.set(t, raw - PEER_RESIDUAL * peerMean);
    }

    // 9. EMA smoothing (state-carried) → percentile → xsScore
    const emaMap = new Map();
    for (const [t, res] of resMap) {
        const st = states.get(t);
        const prevEma = (st && Number.isFinite(st.ema) && st.emaDate !== today) ? st.ema : null;
        emaMap.set(t, prevEma == null ? res : EMA_ALPHA * res + (1 - EMA_ALPHA) * prevEma);
    }
    const scored = [...emaMap.entries()];
    const pct = rankZ(scored.map(([t, v]) => ({ i: t, v })));
    const xs = new Map(); // ticker → 0-100
    for (const [t, z] of pct) xs.set(t, Math.round(((z + 1) / 2) * 1000) / 10);

    // 10. LABELING + IC UPDATE — labeler L2 (2026-08-07).
    // f3(d) = officialClose(d+3 sessions) / officialClose(d) - 1, from Polygon
    // grouped-daily ADJUSTED closes (split/dividend-safe), never from the
    // engine's own snapshot prices. Every due entry labels every run (no
    // oldest-first queue → nothing can block → no horizon drift). No
    // informative censoring: only a |f3|>150 corruption guard (logged, marked
    // nl so it can never re-enter). Entries whose ticker is absent from the
    // official D or D+3 session (delisted/renamed) are marked nl once that
    // session's data is final.
    const POLY_KEY = (process.env.POLYGON_API_KEY || '').trim();
    const polyDays = []; // [{d, closes: Map t→adjClose}] trading days only, oldest→newest
    if (POLY_KEY) {
        for (let back = 16; back >= 0; back--) {
            const d = new Date(Date.parse(`${today}T12:00:00Z`) - back * 86400000).toISOString().slice(0, 10);
            const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
            if (dow === 0 || dow === 6) continue;
            try {
                // [2026-08-29] Massive 차단 → Intrinio 이관.
                // grouped-aggs 대응 REST 가 Intrinio 에 없으므로, EC2 적재기가
                // 벌크 CSV 로 채워 둔 20거래일 종가 행렬을 어댑터가 읽어 준다.
                // (이 루프는 17거래일을 요구한다 — 이력 없이는 2일밖에 못 받는다)
                const g = await __intrinio.getGroupedDaily(d);
                if (g && g.resultsCount > 100) {
                    const m = new Map();
                    for (const gr of g.results) if (gr.c > 0) m.set(gr.T, gr.c);
                    polyDays.push({ d, closes: m });
                }
            } catch (e) { console.log(`[XS] grouped fetch fail ${d}: ${e.message}`); }
            await sleep(150);
        }
    } else console.log('[XS] POLYGON_API_KEY missing — labeling skipped this run');
    const dayIdx = new Map(polyDays.map((x, i) => [x.d, i]));
    const labelByDay = new Map(); // score-day → label rows (one cohort per day)
    for (const t of tickers) {
        const st = states.get(t);
        if (!st) continue;
        for (const x of (st.zring || [])) {
            if (x.f3 !== undefined || x.nl) continue;
            if (daysBetween(x.d, today) > 12) continue;
            const i = dayIdx.get(x.d);
            if (i === undefined) continue;      // official data for d not fetched/published
            const j = i + 3;                    // exactly 3 trading sessions after d
            if (j >= polyDays.length) continue; // D+3 session not closed/published yet
            const c0 = polyDays[i].closes.get(t), c3 = polyDays[j].closes.get(t);
            if (!(c0 > 0) || !(c3 > 0)) { x.nl = 1; continue; }
            const f3 = (c3 / c0 - 1) * 100;
            if (Math.abs(f3) > 150) { console.log(`[XS] corrupt-guard ${t} ${x.d} f3=${f3.toFixed(1)}`); x.nl = 1; continue; }
            x.f3 = round(f3, 4); // mark consumed (persisted via stateItems)
            const rows = labelByDay.get(x.d) || [];
            rows.push({ t, d: x.d, z: x.z, raw: x.raw, rawF: x.rawF, rawA: x.rawA, rawC: x.rawC, rawD: x.rawD, xs: x.xs, f3: x.f3 });
            labelByDay.set(x.d, rows);
        }
    }
    // Per-cohort IC/calibration update: each score-day is its own cross-section
    // with its own market mean (catch-up runs may label 2+ cohorts — they must
    // never be pooled into one Spearman). Chronological order preserves the
    // rolling-history semantics; day* report fields carry the newest cohort.
    let dayIC = null;
    const factorICs = {};
    const varIcHist = wdoc?.varIcHist || { frozen: [], anti: [], clean: [], adaptive: [] };
    if (!varIcHist.clean) varIcHist.clean = [];
    if (!varIcHist.adaptive) varIcHist.adaptive = [];
    let dayICF = null, dayICA = null, dayICC = null, dayICD = null;
    // labels are always stored; aggregates push ONCE per cohort day (a late
    // remnant of an already-pushed cohort must not double-count that day)
    const icDays = new Set(Array.isArray(wdoc?.icDays) ? wdoc.icDays : []);
    let labeledTotal = 0;
    for (const rows of labelByDay.values()) labeledTotal += rows.length;
    for (const cohortDay of [...labelByDay.keys()].sort()) {
        const rows = labelByDay.get(cohortDay);
        if (rows.length < MIN_UNIVERSE) continue;
        if (icDays.has(cohortDay)) continue;
        icDays.add(cohortDay);
        const mkt = mean(rows.map(r => r.f3));
        const adj = rows.map(r => r.f3 - mkt);
        // composite IC
        dayIC = spearman(rows.map(r => r.raw), adj);
        // variant ICs (rows carry rawF/rawA/rawC/rawD only after each deploy)
        const subF = rows.map((r, i) => ({ v: r.rawF, a: adj[i] })).filter(x => Number.isFinite(x.v));
        if (subF.length >= MIN_UNIVERSE) {
            dayICF = spearman(subF.map(x => x.v), subF.map(x => x.a));
            if (dayICF != null) varIcHist.frozen = [...(varIcHist.frozen || []), dayICF].slice(-IC_WINDOW);
        }
        const subA = rows.map((r, i) => ({ v: r.rawA, a: adj[i] })).filter(x => Number.isFinite(x.v));
        if (subA.length >= MIN_UNIVERSE) {
            dayICA = spearman(subA.map(x => x.v), subA.map(x => x.a));
            if (dayICA != null) varIcHist.anti = [...(varIcHist.anti || []), dayICA].slice(-IC_WINDOW);
        }
        const subC = rows.map((r, i) => ({ v: r.rawC, a: adj[i] })).filter(x => Number.isFinite(x.v));
        if (subC.length >= MIN_UNIVERSE) {
            dayICC = spearman(subC.map(x => x.v), subC.map(x => x.a));
            if (dayICC != null) varIcHist.clean = [...(varIcHist.clean || []), dayICC].slice(-IC_WINDOW);
        }
        const subD = rows.map((r, i) => ({ v: r.rawD, a: adj[i] })).filter(x => Number.isFinite(x.v));
        if (subD.length >= MIN_UNIVERSE) {
            dayICD = spearman(subD.map(x => x.v), subD.map(x => x.a));
            if (dayICD != null) varIcHist.adaptive = [...(varIcHist.adaptive || []), dayICD].slice(-IC_WINDOW);
        }
        // factor ICs → rolling icHist
        for (const { key } of FACTORS) {
            const sub = rows.map((r, i) => ({ z: r.z?.[key], a: adj[i] })).filter(x => Number.isFinite(x.z));
            if (sub.length >= MIN_UNIVERSE) {
                const ic = spearman(sub.map(x => x.z), sub.map(x => x.a));
                if (ic != null) {
                    factorICs[key] = ic;
                    icHist[key] = [...(icHist[key] || []), ic].slice(-IC_WINDOW);
                }
            }
        }
        // decile calibration from labeled xs
        const withXs = rows.filter(r => Number.isFinite(r.xs));
        if (withXs.length >= MIN_UNIVERSE) {
            const sorted = [...withXs].sort((a, b) => a.xs - b.xs);
            for (let dec = 0; dec < 10; dec++) {
                const lo = Math.floor(dec / 10 * sorted.length), hi = Math.floor((dec + 1) / 10 * sorted.length);
                const bucket = sorted.slice(lo, hi);
                if (!bucket.length) continue;
                const adjs = bucket.map(r => r.f3 - mkt);
                calibHist[dec] = [...(calibHist[dec] || []), mean(adjs)].slice(-40);
                hitHist[dec] = [...(hitHist[dec] || []), bucket.filter(r => r.f3 - mkt > 0).length / bucket.length * 100].slice(-40);
            }
        }
    }

    // 11. Persist: history rows + state rows + weights + report
    const nowIso = new Date().toISOString();
    const historyItems = [], stateItems = [];
    for (const t of tickers) {
        if (!rawMap.has(t)) continue;
        const s = snaps.get(t), st = states.get(t) || {};
        const zOut = Z.get(t);
        historyItems.push({
            ticker: t, date: today, ver: ENGINE_VERSION,
            close: round(s.price, 4), mcap: Math.round(s.mcap),
            xsScore: xs.get(t), raw: round(rawMap.get(t), 5), res: round(resMap.get(t), 5), ema: round(emaMap.get(t), 5),
            z: compactZ(zOut), updatedAt: nowIso,
        });
        const closes = [...(st.closes || []).filter(x => x.d !== today), { d: today, c: round(s.price, 4) }].slice(-CLOSE_RING);
        const gexes = [...(st.gexes || []).filter(x => x.d !== today), { d: today, g: s.netGex ?? null }].slice(-GEX_RING);
        const bulls = [...(st.bulls || []).filter(x => x.d !== today), { d: today, b: s.bullishPct ?? null }].slice(-ANALYST_RING);
        const zring = [...(st.zring || []).filter(x => x.d !== today), { d: today, z: compactZ(zOut), raw: round(rawMap.get(t), 5), rawF: round(rawVar.get(t)?.f ?? null, 5), rawA: round(rawVar.get(t)?.a ?? null, 5), rawC: round(rawVar.get(t)?.c ?? null, 5), rawD: round(rawVar.get(t)?.d ?? null, 5), xs: xs.get(t) }].slice(-Z_RING);
        stateItems.push({ ticker: t, date: '_STATE_', closes, gexes, bulls, zring, ema: round(emaMap.get(t), 5), emaDate: today, updatedAt: nowIso });
    }

    const report = {
        date: today, ver: ENGINE_VERSION, universe: snaps.size, scored: rawMap.size,
        labeled: labeledTotal, labeler: 'L2', dayIC: dayIC != null ? round(dayIC, 4) : null,
        factorICs: mapRound(factorICs, 4),
        rollingIC: Object.fromEntries(Object.entries(icHist).map(([k, v]) => [k, round(mean(v), 4)])),
        rollingDays: Object.fromEntries(Object.entries(icHist).map(([k, v]) => [k, v.length])),
        weights: mapRound(weights, 4),
        variants: {
            frozen: { dayIC: round(dayICF, 4), rolling: round(mean(varIcHist.frozen || []), 4), days: (varIcHist.frozen || []).length },
            anti: { dayIC: round(dayICA, 4), rolling: round(mean(varIcHist.anti || []), 4), days: (varIcHist.anti || []).length },
            clean: { dayIC: round(dayICC, 4), rolling: round(mean(varIcHist.clean || []), 4), days: (varIcHist.clean || []).length },
            adaptive: { dayIC: round(dayICD, 4), rolling: round(mean(varIcHist.adaptive || []), 4), days: (varIcHist.adaptive || []).length },
        },
        calibration: Object.fromEntries(Object.entries(calibHist).map(([d, v]) => [d, { adjF3: round(mean(v), 3), hit: round(mean(hitHist[d] || []), 1), days: v.length }])),
        top10: [...xs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, v]) => `${t}:${v}`),
        bottom10: [...xs.entries()].sort((a, b) => a[1] - b[1]).slice(0, 10).map(([t, v]) => `${t}:${v}`),
        elapsedMs: Date.now() - t0,
    };

    if (DRY) {
        console.log('[XS DRY] scored:', rawMap.size, 'labeled:', labeledTotal);
        console.log('[XS DRY] weights:', JSON.stringify(report.weights));
        console.log('[XS DRY] variants:', JSON.stringify(report.variants));
        console.log('[XS DRY] top10:', report.top10.join(' '));
        console.log('[XS DRY] bottom10:', report.bottom10.join(' '));
        return report;
    }

    // batch write (25/req) with unprocessed retry
    const allWrites = [...historyItems, ...stateItems,
        { ticker: '_WEIGHTS_', date: '_CURRENT_', icHist, calibHist, hitHist, weights, varIcHist, mainVer: ENGINE_VERSION, icDays: [...icDays].sort().slice(-90), updatedAt: nowIso },
        { ticker: '_REPORT_', date: today, ...report, updatedAt: nowIso },
    ];
    let written = 0;
    for (let i = 0; i < allWrites.length; i += 25) {
        let req = { RequestItems: { [TABLE]: allWrites.slice(i, i + 25).map(Item => ({ PutRequest: { Item } })) } };
        for (let attempt = 0; attempt < 5; attempt++) {
            const res = await ddb.send(new BatchWriteCommand(req));
            written += req.RequestItems[TABLE].length - (res.UnprocessedItems?.[TABLE]?.length || 0);
            const un = res.UnprocessedItems?.[TABLE];
            if (!un || !un.length) break;
            req = { RequestItems: { [TABLE]: un } };
            await sleep(300 * (attempt + 1));
        }
    }
    await redisSet('cache:xs:report', report, 90 * 86400);
    // Full per-ticker score map for the product's Context Score display
    // (consumed by src/services/xsScores.ts via cache:xs:scores).
    await redisSet('cache:xs:scores', { date: today, scores: Object.fromEntries(xs) }, 7 * 86400);
    console.log(`[XS] wrote ${written} items | scored=${rawMap.size} labeled=${labeledTotal} dayIC=${report.dayIC} | ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    return report;
}

// ── utils ────────────────────────────────────────────────────────────────────
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
function round(v, p) { return v == null ? null : Math.round(v * 10 ** p) / 10 ** p; }
function mapRound(o, p) { return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v, p)])); }
function compactZ(z) { const o = {}; for (const k in z) o[k] = round(z[k], 4); return o; }
function daysBetween(d1, d2) { return Math.round((new Date(d2) - new Date(d1)) / 86400000); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

exports.handler = async () => {
    const r = await run();
    return { statusCode: 200, body: JSON.stringify({ date: r.date, scored: r.scored, dayIC: r.dayIC }) };
};

if (require.main === module) {
    run().then(r => { console.log('[XS] done', r.date); }).catch(e => { console.error(e); process.exit(1); });
}
