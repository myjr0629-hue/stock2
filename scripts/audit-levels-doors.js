#!/usr/bin/env node
/**
 * audit-levels-doors — 옵션 레벨(맥스페인·콜월·풋플로어·감마플립)을 내보내는 «모든 문»의 검사기 (읽기 전용)
 * ============================================================================
 * 왜 (2026-09-29):
 *   9/28 운영 watchlist/batch?mode=price 가 MU 현재가 1038.87 에 콜월 1000(현재가 아래)·풋플로어 60·감마플립 530,
 *   TSLA 풋플로어 200·감마플립 280 을 내보냈다. 같은 시각 구조 API 는 MU 1100/900/970 — 정의대로였다.
 *   값의 출처는 DynamoDB signum-gex-history(수집 Lambda: 체인 전체 최대 OI 벽 · «(콜월+풋플로어)/2» 감마플립)였고,
 *   문마다 그 값을 다른 길로 받았다. 한 문만 보는 검사는 다른 문을 놓친다 → 문 전부를 한 번에 본다.
 *
 * 검사 (행마다 = 문 × 종목):
 *   DEF — 그 행의 가격(시간외 가격 || 표시 가격; 가격이 없는 문은 구조의 현물) 기준으로 정의를 지키는가
 *         콜월 S<K≤1.2S · 풋플로어 0.8S≤K<S · 감마플립 |K−S|≤0.15S · 맥스페인 |K−S|≤0.35S  (src/lib/optionLevelGate.ts 와 같다)
 *   ONE — 그 행의 값이 구조 API(한 벌)의 값과 같은가. 구조 값도 그 행의 가격으로 게이트한 뒤 비교한다
 *         (현물이 벽을 넘었으면 문은 null 을 내야 맞다). 0 은 «없음»(인텔 라우트 규약)으로 본다.
 *
 * 사용:
 *   node scripts/audit-levels-doors.js                         # 운영(www.signumhq.com)에서 받아 판정
 *   node scripts/audit-levels-doors.js --save /tmp/lv-prod     # 받은 응답을 저장(나중에 --from 으로 다시 판정)
 *   node scripts/audit-levels-doors.js --from /tmp/lv-preview  # 다른 수집기(ego 세션 = 보호된 프리뷰)가 저장한 응답으로 판정
 *   node scripts/audit-levels-doors.js --paths                 # 수집할 경로 목록(JSON)만 출력 — 프리뷰 수집기가 쓴다
 *   node scripts/audit-levels-doors.js --tickers NVDA,MU,TSLA  # 바구니 바꾸기
 * 종료 코드: DEF 위반 또는 ONE 불일치가 하나라도 있으면 1.
 * ============================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const BASE = opt('--base') || 'https://www.signumhq.com';
const FROM = opt('--from');
const SAVE = opt('--save');
const BASKET = (opt('--tickers') || 'NVDA,MU,AAPL,TSLA,MSFT,AMZN,META,GOOGL,AMD,CRWD,LMT,COST').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const SECTOR_ROUTES = ['m7', 'siliconcore', 'orbitdefense', 'cybershield', 'biopulse', 'powermatrix', 'quantumedge', 'fintechpulse', 'cloudfortress'];

// ── 정의 게이트 — src/lib/optionLevelGate.ts levelViolations 와 같은 식(바꾸면 둘 다 바꾼다) ──
const pos = (x) => { if (x === null || x === undefined || x === '') return null; const n = Number(x); return Number.isFinite(n) && n > 0 ? n : null; };
function violations(lv, spot) {
    const s = pos(spot); if (!lv || s == null) return [];
    const eps = s * 1e-9, bad = [];
    const cw = pos(lv.callWall), pf = pos(lv.putFloor), gf = pos(lv.gammaFlipLevel), mp = pos(lv.maxPain);
    if (cw != null && !(cw > s && cw <= s * 1.2 + eps)) bad.push('callWall');
    if (pf != null && !(pf < s && pf >= s * 0.8 - eps)) bad.push('putFloor');
    if (gf != null && !(Math.abs(gf - s) <= s * 0.15 + eps)) bad.push('gammaFlipLevel');
    if (mp != null && !(Math.abs(mp - s) <= s * 0.35 + eps)) bad.push('maxPain');
    return bad;
}
function gated(lv, ...spots) {
    const out = { maxPain: pos(lv.maxPain), callWall: pos(lv.callWall), putFloor: pos(lv.putFloor), gammaFlipLevel: pos(lv.gammaFlipLevel) };
    for (const s of spots) for (const f of violations(out, s)) out[f] = null;
    return out;
}

// ── 문 목록: 경로 + 응답에서 (종목, 가격, 레벨) 행을 꺼내는 법 ──
const enc = encodeURIComponent;
function doors() {
    const list = [];
    for (const t of BASKET) list.push({ key: `structure_${t}`, door: 'structure', path: `/api/live/options/structure?t=${enc(t)}`, ref: t });
    const tick = BASKET.join(',');
    list.push({ key: 'watchlist_price', door: 'watchlist/batch?mode=price', path: `/api/watchlist/batch?tickers=${enc(tick)}&mode=price`,
        rows: (j) => (j.results || []).filter((r) => r.realtime).map((r) => ({ t: r.ticker, px: pos(r.realtime.extendedPrice) ?? pos(r.realtime.price), lv: r.realtime })) });
    list.push({ key: 'watchlist_full', door: 'watchlist/batch(full)', path: `/api/watchlist/batch?tickers=${enc(tick)}`,
        rows: (j) => (j.results || []).filter((r) => r.realtime).map((r) => ({ t: r.ticker, px: pos(r.realtime.extendedPrice) ?? pos(r.realtime.price), lv: r.realtime })) });
    list.push({ key: 'portfolio_price', door: 'portfolio/batch?mode=price', path: `/api/portfolio/batch?tickers=${enc(tick)}&mode=price`,
        rows: (j) => (j.results || []).filter((r) => r.realtime).map((r) => ({ t: r.ticker, px: pos(r.realtime.extPrice) ?? pos(r.realtime.extendedPrice) ?? pos(r.realtime.price), lv: r.realtime })) });
    for (const s of SECTOR_ROUTES) {
        list.push({ key: `intel_${s}`, door: `intel/${s}`, path: `/api/intel/${s}`,
            rows: (j) => (j.data || []).map((q) => ({ t: q.ticker, px: pos(q.extendedPrice) ?? pos(q.price), lv: q })) });
    }
    for (const s of ['m7', 'silicon_core']) {
        list.push({ key: `intelfast_${s}`, door: `intel/fast?sector=${s}`, path: `/api/intel/fast?sector=${s}`,
            rows: (j) => (j.data || j.quotes || []).map((q) => ({ t: q.ticker, px: pos(q.extendedPrice) ?? pos(q.price), lv: q })) });
    }
    list.push({ key: 'dashboard', door: 'dashboard/unified', path: `/api/dashboard/unified?tickers=${enc(tick)}`,
        rows: (j) => Object.entries(j.tickers || {}).map(([t, r]) => ({ t, px: pos(r?.fundamentals?.extendedPrice) ?? pos(r?.underlyingPrice) ?? pos(r?.display?.price),
            lv: { maxPain: r?.maxPain, callWall: r?.levels?.callWall, putFloor: r?.levels?.putFloor, gammaFlipLevel: r?.gammaFlipLevel } })) });
    for (const t of BASKET) {
        list.push({ key: `ticker_${t}`, door: 'live/ticker', path: `/api/live/ticker?t=${enc(t)}&chain=0`,
            rows: (j) => j && j.flow ? [{ t, px: pos(j.price) ?? pos(j.prevClose), lv: j.flow }] : [] });
        list.push({ key: `command_${t}`, door: 'command/unified', path: `/api/command/unified?t=${enc(t)}&lang=en`,
            rows: (j) => j && j.structure ? [{ t, px: null, lv: { maxPain: j.structure.maxPain, callWall: j.structure.levels?.callWall, putFloor: j.structure.levels?.putFloor,
                gammaFlipLevel: j.structure.gammaFlipLevel ?? j.volatility?.flipLevel } }] : [] });
        list.push({ key: `volregime_${t}`, door: 'live/volatility-regime', path: `/api/live/volatility-regime?t=${enc(t)}`,
            rows: (j) => j && j.flipLevel !== undefined ? [{ t, px: pos(j.underlyingPrice), lv: { gammaFlipLevel: j.flipLevel } }] : [] });
    }
    return list;
}

async function collect(list) {
    const got = {};
    for (const d of list) {
        const t0 = Date.now();
        try {
            const r = await fetch(BASE + d.path, { headers: { 'user-agent': 'Mozilla/5.0 (SIGNUM levels audit)' }, signal: AbortSignal.timeout(90000) });
            const text = await r.text();
            got[d.key] = { status: r.status, ms: Date.now() - t0, body: JSON.parse(text) };
        } catch (e) {
            got[d.key] = { status: 0, ms: Date.now() - t0, error: String(e.message || e).slice(0, 120) };
        }
        if (SAVE) { fs.mkdirSync(SAVE, { recursive: true }); fs.writeFileSync(path.join(SAVE, d.key + '.json'), JSON.stringify(got[d.key])); }
    }
    return got;
}

function load(list) {
    const got = {};
    for (const d of list) {
        const f = path.join(FROM, d.key + '.json');
        if (fs.existsSync(f)) got[d.key] = JSON.parse(fs.readFileSync(f, 'utf8'));
    }
    return got;
}

const fmt = (v) => (v == null ? '—' : String(v));

(async () => {
    const list = doors();
    if (args.includes('--paths')) { console.log(JSON.stringify(list.map((d) => ({ key: d.key, path: d.path })))); return; }
    const got = FROM ? load(list) : await collect(list);

    // 구조 한 벌(기준)
    const ref = {};
    for (const d of list.filter((x) => x.door === 'structure')) {
        const b = got[d.key]?.body; const s = b && (b.data || b);
        if (!s) continue;
        ref[d.ref] = { S: pos(s.underlyingPrice), status: s.options_status, exp: s.expiration, chainDate: s.chainDate ?? null,
            lv: { maxPain: s.maxPain, callWall: s.levels?.callWall, putFloor: s.levels?.putFloor, gammaFlipLevel: s.gammaFlipLevel } };
    }
    console.log(`기준(구조 API) ${Object.keys(ref).length}/${BASKET.length}종목 · 출처 ${FROM ? FROM : BASE}`);
    for (const t of BASKET) { const r = ref[t]; if (r) console.log(`  ${t.padEnd(5)} S=${fmt(r.S)} ${r.status} exp ${fmt(r.exp)} OI ${fmt(r.chainDate)} · 맥스페인 ${fmt(r.lv.maxPain)} 콜월 ${fmt(r.lv.callWall)} 풋플로어 ${fmt(r.lv.putFloor)} 감마플립 ${fmt(r.lv.gammaFlipLevel)}`); }

    let defBad = 0, oneBad = 0, rowsTotal = 0;
    const perDoor = new Map();
    for (const d of list.filter((x) => x.rows)) {
        const g = got[d.key];
        const st = perDoor.get(d.door) || { rows: 0, def: 0, one: 0, nulls: 0, ms: [], serverMs: [], errors: 0, notes: [] };
        if (!g || !g.body) { st.errors++; st.notes.push(`${d.key}: ${g ? (g.error || 'HTTP ' + g.status) : '응답 없음'}`); perDoor.set(d.door, st); continue; }
        st.ms.push(g.ms);
        const sm = g.body?.meta?.elapsed ?? g.body?.meta?.elapsedMs; if (Number.isFinite(sm)) st.serverMs.push(sm);
        for (const row of d.rows(g.body)) {
            const r = ref[String(row.t).toUpperCase()];
            const lv = { maxPain: row.lv?.maxPain, callWall: row.lv?.callWall, putFloor: row.lv?.putFloor, gammaFlipLevel: row.lv?.gammaFlipLevel };
            const spot = row.px ?? (r ? r.S : null);
            st.rows++; rowsTotal++;
            const v = violations(lv, spot);
            if (v.length) { st.def++; defBad++; st.notes.push(`DEF ${row.t} S=${fmt(spot)} ${v.map((f) => `${f}=${fmt(lv[f])}`).join(' ')}`); }
            if (!r) continue;
            const want = gated(r.lv, r.S, spot);
            const mism = [];
            for (const f of ['maxPain', 'callWall', 'putFloor', 'gammaFlipLevel']) {
                if (!(f in (row.lv || {})) && f !== 'gammaFlipLevel') continue;   // 문이 그 필드를 아예 안 내면 비교 안 함
                if (d.door.startsWith('intel/') && f === 'gammaFlipLevel' && row.lv?.gammaFlipLevel === undefined) continue;
                const have = pos(lv[f]);
                if (have == null && want[f] == null) continue;
                if (have !== want[f]) mism.push(`${f} ${fmt(have)}≠${fmt(want[f])}`);
            }
            if (Object.values(lv).every((x) => pos(x) == null)) st.nulls++;
            if (mism.length) { st.one++; oneBad++; st.notes.push(`ONE ${row.t} ${mism.join(' · ')}`); }
        }
        perDoor.set(d.door, st);
    }

    console.log(`\n문별 결과 (행 = 문×종목, DEF = 정의 위반, ONE = 구조 한 벌과 다름)`);
    const med = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    for (const [door, st] of perDoor) {
        const mark = st.def || st.one || st.errors ? '✗' : '✓';
        console.log(`${mark} ${door.padEnd(28)} 행 ${String(st.rows).padStart(3)} · DEF ${st.def} · ONE ${st.one} · 레벨 전무 ${st.nulls}${st.errors ? ` · 오류 ${st.errors}` : ''}` +
            `${st.ms.length ? ` · 응답 중앙값 ${med(st.ms)}ms` : ''}${st.serverMs.length ? ` · 서버 ${med(st.serverMs)}ms` : ''}`);
        for (const n of st.notes.slice(0, 8)) console.log(`     ${n}`);
        if (st.notes.length > 8) console.log(`     … ${st.notes.length - 8}건 더`);
    }
    console.log(`\n합계: 행 ${rowsTotal} · 정의 위반 ${defBad} · 한 벌 불일치 ${oneBad}`);
    if (defBad || oneBad) { console.log('⛔ 화면으로 나가는 레벨 중 정의를 어기거나 구조 한 벌과 다른 값이 있다'); process.exit(1); }
    console.log('✅ 모든 문이 구조 한 벌·정의 게이트를 지킨다');
})().catch((e) => { console.error('audit failed:', e.message); process.exit(2); });
