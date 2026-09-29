#!/usr/bin/env node
/**
 * audit-levels-doors — 옵션 레벨(맥스페인·콜월·풋플로어·감마플립)을 내보내는 «모든 문»의 검사기 (읽기 전용)
 * ============================================================================
 * 왜 (2026-09-29 → 09-30):
 *   9/28 운영 watchlist/batch?mode=price 가 MU 현재가 1038.87 에 콜월 1000·풋플로어 60·감마플립 530 을 냈다(다른 생산자의 값).
 *   9/29 에 «구조 한 벌 + 정의 게이트»로 막았지만, 9/30 00:16 KST 운영 감사에서 DEF 2·ONE 39 — 원인은 두 가지였다:
 *   ① 이 검사기가 기준(구조 API)을 처음에 한 번 받고 문들을 2분에 걸쳐 차례로 받아, 그 사이 갱신된 판본을 «불일치»로 셌다
 *   ② 실제로 판본이 문마다 달랐다(마지막 정상본 57분 · 인스턴스 메모리 사본 · 응답 캐시).
 *   → 문마다 «바로 앞·바로 뒤» 기준을 받아 같은 순간끼리 비교하고, 판본 표식(levelsAsOf)·가려짐·재선택·체인 날짜를 따로 센다.
 *
 * 검사 (행 = 문 × 종목, 기준 = 그 문 요청 바로 앞/뒤의 구조 API):
 *   DEF    — 그 행의 가격(시간외 가격 || 표시 가격; 가격이 없는 문은 판본 기준가) 기준으로 정의를 지키는가
 *            콜월 S<K≤1.2S · 풋플로어 0.8S≤K<S · 감마플립 |K−S|≤0.15S · 맥스페인 |K−S|≤0.35S (src/lib/optionLevelGate.ts 와 같다)
 *   ONE    — 그 행의 값이 «같은 순간의 판본(앞 또는 뒤 기준)을 그 행의 가격으로 표시한 값»과 같은가
 *            (표시 = lib displayLevels: 판본 값, 표시 가격이 레벨을 넘었으면 같은 분포에서 다시 고름 — 이 파일의 expectAt)
 *   가려짐 — 행이 levelsDropped 를 싣거나, 기대값이 있는데 행이 비었다(null/0) — 안전망 발동 = 실패
 *   재선택 — 행이 levelsReselected 를 실었다(실제 돌파 — 정상 동작, 개수만 센다)
 *   판본   — 행의 levelsAsOf 가 앞/뒤 기준의 판본과 같은가(표식을 싣는 문만)
 *   체인   — 기준의 chainDate 가 기대 체인 날짜(직전 완결 세션)와 같은가(종목별)
 *   레벨전무 — 기대값이 있는데 네 칸이 다 빈 행(실패) · 정의상없음 — 판본에도 값이 없는 행(얇은 체인: 범위 안 OI>0 행사가 없음·맥스페인 ±35% 밖)
 *
 * 사용:
 *   node scripts/audit-levels-doors.js                         # 운영(www.signumhq.com)에서 받아 판정
 *   node scripts/audit-levels-doors.js --save <dir>            # 받은 응답(앞/문/뒤)을 저장 — 나중에 --from 으로 다시 판정
 *   node scripts/audit-levels-doors.js --from <dir>            # 다른 수집기(ego 세션 = 보호된 프리뷰)가 저장한 응답으로 판정
 *   node scripts/audit-levels-doors.js --plan                  # 수집 계획(JSON)만 출력 — 프리뷰 수집기가 쓴다
 *   node scripts/audit-levels-doors.js --tickers NVDA,MU,TSLA  # 바구니 바꾸기
 *   node scripts/audit-levels-doors.js --expect-chain 2026-09-28  # 기대 체인 날짜를 직접 준다(기본: 달력으로 계산)
 * 종료 코드: DEF·ONE·가려짐이 하나라도 있으면 1.
 * ============================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');

// ── 정의 — src/lib/optionLevelGate.ts 와 같은 식(바꾸면 둘 다 바꾼다; tests/optionLevelGate.test.ts 가 둘을 대조한다) ──
const BANDS = { callWallMax: 1.2, putFloorMin: 0.8, gammaFlip: 0.15, maxPain: 0.35 };
const pos = (x) => { if (x === null || x === undefined || x === '') return null; const n = Number(x); return Number.isFinite(n) && n > 0 ? n : null; };
function violations(lv, spot) {
    const s = pos(spot); if (!lv || s == null) return [];
    const eps = s * 1e-9, bad = [];
    const cw = pos(lv.callWall), pf = pos(lv.putFloor), gf = pos(lv.gammaFlipLevel), mp = pos(lv.maxPain);
    if (cw != null && !(cw > s && cw <= s * BANDS.callWallMax + eps)) bad.push('callWall');
    if (pf != null && !(pf < s && pf >= s * BANDS.putFloorMin - eps)) bad.push('putFloor');
    if (gf != null && !(Math.abs(gf - s) <= s * BANDS.gammaFlip + eps)) bad.push('gammaFlipLevel');
    if (mp != null && !(Math.abs(mp - s) <= s * BANDS.maxPain + eps)) bad.push('maxPain');
    return bad;
}
function levelsAt(pr, spot) {
    const out = { callWall: null, putFloor: null, gammaFlipLevel: null, gammaFlipType: 'NO_DATA' };
    const S = pos(spot); const ks = pr && Array.isArray(pr.strikes) ? pr.strikes : null;
    if (!ks || S == null) return out;
    const hi = S * BANDS.callWallMax, lo = S * BANDS.putFloorMin;
    let cwOi = 0, pfOi = 0;
    for (let i = 0; i < ks.length; i++) {
        const k = ks[i]; if (!(k > 0)) continue;
        const c = pr.callsOI && pr.callsOI[i], p = pr.putsOI && pr.putsOI[i];
        if (k > S && k <= hi && typeof c === 'number' && c > cwOi) { cwOi = c; out.callWall = k; }
        if (k < S && k >= lo && typeof p === 'number' && p > pfOi) { pfOi = p; out.putFloor = k; }
    }
    const g = pr.gexCum;
    if (Array.isArray(g)) {
        const aMin = S * (1 - BANDS.gammaFlip), aMax = S * (1 + BANDS.gammaFlip);
        let prev = 0, seen = false, best = null, bestD = Infinity, nz = null, nzAbs = Infinity;
        for (let i = 0; i < ks.length; i++) {
            const cum = g[i], k = ks[i];
            if (typeof cum !== 'number' || !Number.isFinite(cum)) continue;
            const inAtm = k >= aMin && k <= aMax;
            if (seen && inAtm && ((prev < 0 && cum >= 0) || (prev > 0 && cum <= 0))) { const d = Math.abs(k - S); if (d < bestD) { bestD = d; best = k; } }
            if (inAtm && Math.abs(cum) < nzAbs) { nzAbs = Math.abs(cum); nz = k; }
            prev = cum; seen = true;
        }
        if (!seen) out.gammaFlipType = 'NO_DATA';
        else if (best != null) { out.gammaFlipLevel = best; out.gammaFlipType = 'EXACT'; }
        else if (nz != null) { out.gammaFlipLevel = nz; out.gammaFlipType = 'NEAR_ZERO'; }
        else out.gammaFlipType = prev > 0 ? 'ALL_LONG' : 'ALL_SHORT';
    }
    return out;
}
function profileOf(s) {
    const st = s && s.structure; const ks = st && st.strikes;
    if (!Array.isArray(ks) || !ks.length || !Array.isArray(st.callsOI) || !Array.isArray(st.putsOI)) return null;
    if (st.callsOI.length !== ks.length || st.putsOI.length !== ks.length) return null;
    return { strikes: ks, callsOI: st.callsOI, putsOI: st.putsOI, gexCum: Array.isArray(st.gexCum) && st.gexCum.length === ks.length ? st.gexCum : null };
}
/** 구조 API 응답(판본) → 그 행의 가격 P 로 «표시해야 할» 값 (lib displayLevels 와 같은 규칙) */
function expectAt(ref, P) {
    if (!ref || ref.status !== 'OK') return { maxPain: null, callWall: null, putFloor: null, gammaFlipLevel: null };
    const s0 = ref.S;
    const lv = { maxPain: pos(ref.lv.maxPain), callWall: pos(ref.lv.callWall), putFloor: pos(ref.lv.putFloor), gammaFlipLevel: pos(ref.lv.gammaFlipLevel) };
    for (const f of violations(lv, s0)) lv[f] = null;                  // levelsFromStructure: 자기 현물로 게이트
    const p = pos(P);
    // 맥스페인은 표시 가격 ±35% 밖이면 정의상 «범위 밖»(lib displayLevels 와 같다 — 재선택이지 가림이 아니다, 분포 없이도)
    if (p != null && lv.maxPain != null && violations({ maxPain: lv.maxPain }, p).length) lv.maxPain = null;
    if (ref.profile) {
        if (p != null) {
            const bad = violations(lv, p).filter((f) => f !== 'maxPain');
            if (bad.length) {
                const re = levelsAt(ref.profile, p);
                for (const f of bad) if (f !== 'gammaFlipLevel' || re.gammaFlipType !== 'NO_DATA') lv[f] = re[f];
            }
        }
        for (const f of violations(lv, p != null ? p : s0)) lv[f] = null;
    } else {
        for (const s of [s0, p]) for (const f of violations(lv, s)) lv[f] = null;
    }
    return lv;
}

// ── 기대 체인 날짜(직전 완결 세션) — src/lib/marketCalendar.ts 의 휴장 목록과 같다 ──
const HOLIDAYS = new Set(['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
    '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24']);
const nonTrading = (d) => HOLIDAYS.has(d) || [0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay());
const shift = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
/** 장 마감 뒤 벤더 EOD 공표 전(ET 20:00 전)까지는 «그 전 거래일» — 체인의 미결제약정은 전일 EOD 다. */
function expectedChainDate(now = Date.now()) {
    const et = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'America/New_York' }));
    let d = `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`;
    const mins = et.getHours() * 60 + et.getMinutes();
    if (!nonTrading(d) && mins < 20 * 60) d = shift(d, -1);
    for (let i = 0; i < 10 && nonTrading(d); i++) d = shift(d, -1);
    return d;
}

if (require.main !== module) { module.exports = { violations, levelsAt, profileOf, expectAt, expectedChainDate }; return; }

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const BASE = opt('--base') || 'https://www.signumhq.com';
const FROM = opt('--from');
const SAVE = opt('--save');
const BASKET = (opt('--tickers') || 'NVDA,MU,AAPL,TSLA,MSFT,AMZN,META,GOOGL,AMD,CRWD,LMT,COST').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const SECTORS = ['m7', 'siliconcore', 'orbitdefense', 'cybershield', 'biopulse', 'powermatrix', 'quantumedge', 'fintechpulse', 'cloudfortress'];
const enc = encodeURIComponent;
const structPath = (t) => `/api/live/options/structure?t=${enc(t)}`;

// ── 행의 표시 가격 — lib rowSpot 과 같다(정규장이면 표시 가격, 시간외면 시간외 가격) ──
function shownPrice(o) {
    const sess = String((o && o.session) || '').toLowerCase();
    if (sess === 'reg' || sess === 'regular') return pos(o.price) ?? pos(o.extendedPrice) ?? pos(o.extPrice);
    return pos(o && o.extendedPrice) ?? pos(o && o.extPrice) ?? pos(o && o.price);
}
// ── 문 목록: 경로 + 응답에서 (종목, 가격, 레벨, 표식) 행을 꺼내는 법 ──
const rowOf = (t, px, o, extra = {}) => ({ t: String(t || '').toUpperCase(), px, lv: { maxPain: o && o.maxPain, callWall: o && o.callWall, putFloor: o && o.putFloor, gammaFlipLevel: o && o.gammaFlipLevel },
    asOf: o && o.levelsAsOf != null ? Number(o.levelsAsOf) : null, dropped: (o && o.levelsDropped) || null, reselected: (o && o.levelsReselected) || null, ...extra });
function doors() {
    const list = [];
    const tick = BASKET.join(',');
    const batchRows = (priceOf) => (j) => (j.results || []).filter((r) => r.realtime).map((r) => rowOf(r.ticker, priceOf(r.realtime), r.realtime));
    list.push({ id: 'watchlist_price', door: 'watchlist/batch?mode=price', path: `/api/watchlist/batch?tickers=${enc(tick)}&mode=price`, tickers: BASKET,
        rows: batchRows(shownPrice) });
    list.push({ id: 'watchlist_full', door: 'watchlist/batch(full)', path: `/api/watchlist/batch?tickers=${enc(tick)}`, tickers: BASKET,
        rows: batchRows(shownPrice) });
    list.push({ id: 'portfolio_price', door: 'portfolio/batch?mode=price', path: `/api/portfolio/batch?tickers=${enc(tick)}&mode=price`, tickers: BASKET,
        rows: batchRows(shownPrice) });
    for (const s of SECTORS) {
        list.push({ id: `intel_${s}`, door: `intel/${s}`, path: `/api/intel/${s}`, tickers: null,
            rows: (j) => (j.data || []).map((q) => rowOf(q.ticker, shownPrice(q), q)) });
    }
    for (const s of ['m7', 'silicon_core']) {
        list.push({ id: `intelfast_${s}`, door: `intel/fast?sector=${s}`, path: `/api/intel/fast?sector=${s}`, tickers: null,
            rows: (j) => (j.data || j.quotes || []).map((q) => rowOf(q.ticker, shownPrice(q), q)) });
    }
    list.push({ id: 'dashboard', door: 'dashboard/unified', path: `/api/dashboard/unified?tickers=${enc(tick)}`, tickers: BASKET,
        rows: (j) => Object.entries(j.tickers || {}).map(([t, r]) => rowOf(t, shownPrice({ session: r && (r.session ?? (r.display && r.display.session)), price: (r && r.display && r.display.price) ?? (r && r.underlyingPrice), extendedPrice: r && r.fundamentals && r.fundamentals.extendedPrice }),
            { maxPain: r && r.maxPain, callWall: r && r.levels && r.levels.callWall, putFloor: r && r.levels && r.levels.putFloor, gammaFlipLevel: r && r.gammaFlipLevel,
                levelsAsOf: r && r.levelsAsOf, levelsDropped: r && r.levelsDropped, levelsReselected: r && r.levelsReselected })) });
    for (const t of BASKET) {
        list.push({ id: `ticker_${t}`, door: 'live/ticker', path: `/api/live/ticker?t=${enc(t)}&chain=0`, tickers: [t],
            rows: (j) => (j && j.flow ? [rowOf(t, pos(j.price) ?? pos(j.prevClose), j.flow)] : []) });
        list.push({ id: `command_${t}`, door: 'command/unified', path: `/api/command/unified?t=${enc(t)}&lang=en`, tickers: [t],
            rows: (j) => (j && j.structure ? [rowOf(t, null, { maxPain: j.structure.maxPain, callWall: j.structure.levels && j.structure.levels.callWall, putFloor: j.structure.levels && j.structure.levels.putFloor,
                gammaFlipLevel: j.structure.gammaFlipLevel ?? (j.volatility && j.volatility.flipLevel), levelsAsOf: j.structure.levelsAsOf, levelsDropped: j.structure.levelsDropped,
                levelsReselected: j.structure.levelsReselected })] : []) });
        list.push({ id: `volregime_${t}`, door: 'live/volatility-regime', path: `/api/live/volatility-regime?t=${enc(t)}`, tickers: [t],
            rows: (j) => (j && j.flipLevel !== undefined ? [rowOf(t, pos(j.underlyingPrice), { gammaFlipLevel: j.flipLevel }, { onlyFlip: true })] : []) });
    }
    return list;
}

// ── 수집: 문마다 [앞 기준(병렬) → 문 → 뒤 기준(병렬)]. 종목을 문이 정하면(섹터) 문을 먼저 한 번 받아 종목을 안다 ──
async function get(p) {
    const t0 = Date.now();
    try {
        const r = await fetch(BASE + p, { headers: { 'user-agent': 'Mozilla/5.0 (SIGNUM levels audit)' }, signal: AbortSignal.timeout(90000) });
        const text = await r.text();
        let body = null; try { body = JSON.parse(text); } catch { body = null; }
        return { status: r.status, ms: Date.now() - t0, at: t0, cache: r.headers.get('x-vercel-cache'), age: r.headers.get('age'), body };
    } catch (e) { return { status: 0, ms: Date.now() - t0, at: t0, error: String(e.message || e).slice(0, 120) }; }
}
async function collectOne(d) {
    let tickers = d.tickers;
    if (!tickers) { const first = await get(d.path); tickers = Array.from(new Set(d.rows((first && first.body) || {}).map((r) => r.t))).filter(Boolean); }
    const before = Object.fromEntries(await Promise.all(tickers.map(async (t) => [t, await get(structPath(t))])));
    const door = await get(d.path);
    const after = Object.fromEntries(await Promise.all(tickers.map(async (t) => [t, await get(structPath(t))])));
    return { id: d.id, tickers, before, door, after };
}

function refOf(g) {
    const b = g && g.body; const s = b && (b.data || b);
    if (!s) return null;
    return { S: pos(s.underlyingPrice), status: s.options_status, exp: s.expiration, chainDate: s.chainDate ?? null, asOf: s.levelsAsOf != null ? Number(s.levelsAsOf) : null,
        lv: { maxPain: s.maxPain, callWall: s.levels && s.levels.callWall, putFloor: s.levels && s.levels.putFloor, gammaFlipLevel: s.gammaFlipLevel }, profile: profileOf(s) };
}

const fmt = (v) => (v == null ? '—' : String(v));
const same = (a, b) => pos(a) === pos(b);

(async () => {
    const list = doors();
    if (args.includes('--plan')) { console.log(JSON.stringify(list.map((d) => ({ id: d.id, path: d.path, tickers: d.tickers })))); return; }
    const runAt = Date.now();
    const expChain = opt('--expect-chain') || expectedChainDate(runAt);
    const got = {};
    for (const d of list) {
        if (FROM) { const f = path.join(FROM, d.id + '.json'); if (fs.existsSync(f)) got[d.id] = JSON.parse(fs.readFileSync(f, 'utf8')); continue; }
        got[d.id] = await collectOne(d);
        if (SAVE) { fs.mkdirSync(SAVE, { recursive: true }); fs.writeFileSync(path.join(SAVE, d.id + '.json'), JSON.stringify(got[d.id])); }
    }
    console.log(`출처 ${FROM || BASE} · 판정 ${new Date(runAt).toISOString()} · 기대 체인 날짜 ${expChain}`);

    let rowsTotal = 0, defBad = 0, oneBad = 0, masked = 0, reselected = 0, verDiff = 0, verKnown = 0, emptyRows = 0, undefRows = 0;
    const noMarket = new Set();   // 기준이 «옵션 없음»인 종목 — 옵션이 상장된 종목이면 실패(벤더 빈 응답이 굳은 것)
    const chainByTicker = new Map();
    const perDoor = new Map();
    for (const d of list) {
        const g = got[d.id];
        const st = perDoor.get(d.door) || { rows: 0, def: 0, one: 0, masked: 0, resel: 0, verDiff: 0, verKnown: 0, empty: 0, undef: 0, ms: [], server: [], cacheHits: 0, errors: 0, notes: [] };
        perDoor.set(d.door, st);
        if (!g || !g.door || !g.door.body) { st.errors++; st.notes.push(`${d.id}: ${g && g.door ? (g.door.error || 'HTTP ' + g.door.status) : '응답 없음'}`); continue; }
        st.ms.push(g.door.ms);
        const meta = g.door.body.meta || {}; const sm = meta.elapsed ?? meta.elapsedMs; if (Number.isFinite(sm)) st.server.push(sm);
        if (g.door.cache === 'HIT' || g.door.cache === 'STALE') st.cacheHits++;
        for (const row of d.rows(g.door.body)) {
            const rb = refOf(g.before && g.before[row.t]), ra = refOf(g.after && g.after[row.t]);
            const ref = rb || ra;
            for (const r of [rb, ra]) if (r && r.status === 'OK') { const c = chainByTicker.get(row.t) || new Set(); c.add(r.chainDate == null ? 'null' : r.chainDate); chainByTicker.set(row.t, c); }
            for (const r of [rb, ra]) if (r && r.status && r.status !== 'OK') noMarket.add(`${row.t}:${r.status}`);
            st.rows++; rowsTotal++;
            const spot = row.px ?? (ref ? ref.S : null);
            const v = violations(row.lv, spot);
            if (v.length) { st.def++; defBad++; st.notes.push(`DEF ${row.t} S=${fmt(spot)} ${v.map((f) => `${f}=${fmt(row.lv[f])}`).join(' ')}`); }
            if (row.reselected && row.reselected.length) { st.resel++; reselected++; st.notes.push(`재선택 ${row.t} S=${fmt(spot)} ${row.reselected.join(',')}`); }
            const fields = row.onlyFlip ? ['gammaFlipLevel'] : ['maxPain', 'callWall', 'putFloor', 'gammaFlipLevel'];
            if (!ref) continue;
            const eb = rb ? expectAt(rb, row.px) : null, ea = ra ? expectAt(ra, row.px) : null;
            const expectAny = [eb, ea].some((e) => e && fields.some((f) => pos(e[f]) != null));
            if (fields.every((f) => pos(row.lv[f]) == null)) {
                if (expectAny) { st.empty++; emptyRows++; st.notes.push(`레벨전무 ${row.t} S=${fmt(spot)}`); }
                else if (ref.status === 'OK') { st.undef++; undefRows++; }
            }
            const okWith = (e) => !!e && fields.every((f) => same(row.lv[f], e[f]));
            const e = eb || ea;
            // 가려짐: 안전망 표식, 또는 «앞·뒤 기준 모두 값이 있는데 빈 칸»
            const hidden = fields.filter((f) => pos(row.lv[f]) == null && (!eb || pos(eb[f]) != null) && (!ea || pos(ea[f]) != null));
            if ((row.dropped && row.dropped.length) || hidden.length) {
                st.masked++; masked++;
                st.notes.push(`가려짐 ${row.t} S=${fmt(spot)} ${Array.from(new Set([...(row.dropped || []), ...hidden])).join(',')}`);
            }
            if (!(okWith(eb) || okWith(ea))) {
                st.one++; oneBad++;
                const why = fields.filter((f) => !same(row.lv[f], e[f])).map((f) => `${f} ${fmt(pos(row.lv[f]))}≠${fmt(pos(e[f]))}${ea && eb && !same(ea[f], eb[f]) ? `(뒤 ${fmt(pos(ea[f]))})` : ''}`).join(' · ');
                st.notes.push(`ONE ${row.t} ${why} · 판본 행 ${fmt(row.asOf)} 앞 ${fmt(rb && rb.asOf)} 뒤 ${fmt(ra && ra.asOf)}`);
            }
            if (row.asOf != null && (rb || ra)) {
                st.verKnown++; verKnown++;
                if (![rb && rb.asOf, ra && ra.asOf].includes(row.asOf)) { st.verDiff++; verDiff++; }
            }
        }
    }

    console.log(`\n문별 결과 (행 = 문×종목 · DEF 정의 위반 · ONE 같은 순간 판본과 다름 · 가려짐 = 안전망 발동/빈칸 · 재선택 = 실제 돌파 · 판본다름 = levelsAsOf 가 앞/뒤 기준과 다름)`);
    const med = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    for (const [door, st] of perDoor) {
        const mark = st.def || st.one || st.masked || st.empty || st.errors ? '✗' : '✓';
        console.log(`${mark} ${door.padEnd(30)} 행 ${String(st.rows).padStart(3)} · DEF ${st.def} · ONE ${st.one} · 가려짐 ${st.masked} · 재선택 ${st.resel} · 판본다름 ${st.verDiff}/${st.verKnown} · 레벨전무 ${st.empty} · 정의상없음 ${st.undef}` +
            `${st.errors ? ` · 오류 ${st.errors}` : ''}${st.ms.length ? ` · 응답 중앙값 ${med(st.ms)}ms` : ''}${st.server.length ? ` · 서버 ${med(st.server)}ms` : ''}${st.cacheHits ? ` · CDN적중 ${st.cacheHits}` : ''}`);
        for (const n of st.notes) console.log(`     ${n}`);
    }
    // 기대(직전 완결 세션)보다 «오래된» 체인만 실패다. 더 새 날짜는 벤더가 그날 EOD 를 일찍 게시한 것(ET 16:4x~) — 앞선 것이지 틀린 것이 아니다.
    const chainBad = [], chainNewer = [];
    for (const [t, set] of chainByTicker) {
        const vals = [...set];
        if (vals.some((x) => x === 'null' || x < expChain)) chainBad.push(`${t}:${vals.join('/')}`);
        else if (vals.some((x) => x > expChain)) chainNewer.push(`${t}:${vals.join('/')}`);
    }
    console.log(`\n기준이 OK 가 아닌 종목(옵션 없음·계산 실패 — 옵션이 상장된 종목이면 실패): ${noMarket.size ? [...noMarket].join(' ') : '없음'}`);
    console.log(`체인 날짜: 종목 ${chainByTicker.size} · 기대 ${expChain} 보다 오래된(또는 없는) 종목 ${chainBad.length}${chainBad.length ? ` — ${chainBad.join(' ')}` : ''}` +
        ` · 더 새 날짜(당일 EOD 게시 뒤) ${chainNewer.length}${chainNewer.length ? ` — ${chainNewer.join(' ')}` : ''}`);
    console.log(`합계: 행 ${rowsTotal} · 정의 위반 ${defBad} · 한 벌 불일치 ${oneBad} · 가려짐 ${masked} · 재선택 ${reselected} · 판본다름 ${verDiff}/${verKnown} · 레벨전무 ${emptyRows} · 정의상없음 ${undefRows}`);
    const errorsTotal = [...perDoor.values()].reduce((a, st) => a + st.errors, 0);
    if (!rowsTotal || errorsTotal) { console.log(`⛔ 판정할 수 없다 — 행 ${rowsTotal} · 응답 오류 ${errorsTotal}(수집 실패)`); process.exit(2); }
    if (defBad || oneBad || masked || emptyRows) { console.log('⛔ 화면으로 나가는 레벨 중 정의를 어기거나, 같은 순간 판본과 다르거나, 가려진 값이 있다'); process.exit(1); }
    console.log('✅ 모든 문이 같은 순간 같은 판본·정의대로·가림 없음');
})().catch((e) => { console.error('audit failed:', e.stack || e.message); process.exit(2); });
