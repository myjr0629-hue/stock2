/**
 * 옵션 EOD 수집기(scripts/intrinio-options-eod.js)의 순수 함수 — 2026-10-03 «묶음이 공급사 판을 늦게 따라간다» 수리
 * 실행: node tests/optionsEodCollector.test.js
 *
 * 지키는 것:
 *   · 달력: 수집기의 휴장 목록 = src/lib/marketCalendar.ts US_MARKET_HOLIDAYS(정본) · 직전 거래일 · 저녁 경로의 «세션 날짜» 게이트
 *     (16:00 ET 전·ET 자정 뒤·주말·휴장 = 없음, EDT·EST 둘 다)
 *   · API 행 → 벌크와 같은 값: 계약 코드 밑줄 채움(기준선 키) · float32 꼬리 제거(그릭스·IV 소수 5자리, 행사가 1/1000)
 *   · 집계: 행이 들어오는 순서가 바뀌어도 결과가 같다(동점은 코드로 끊는다) · 동점이 아닌 곳은 예전 알고리즘과 글자 그대로 같다
 *   · «판이 갖춰짐»: 직전 묶음 종목 98% 이상 + 지수 ETF 4종 전부
 */
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const M = require("../scripts/intrinio-options-eod.js");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

// ── 달력 ────────────────────────────────────────────────────────────
t("휴장 목록 = marketCalendar 정본", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/lib/marketCalendar.ts"), "utf8");
    const block = src.slice(src.indexOf("US_MARKET_HOLIDAYS = new Set(["), src.indexOf("]);", src.indexOf("US_MARKET_HOLIDAYS = new Set([")));
    const canon = [...block.matchAll(/"(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]).sort();
    assert.ok(canon.length >= 20);
    assert.deepEqual([...M.US_HOLIDAYS].sort(), canon);
});

t("직전 거래일 — 주말·휴장을 건너뛴다", () => {
    assert.equal(M.prevTradingDay("2026-10-05"), "2026-10-02");   // 월 → 금
    assert.equal(M.prevTradingDay("2026-09-08"), "2026-09-04");   // 노동절 다음 날 → 금
    assert.equal(M.prevTradingDay("2026-11-27"), "2026-11-25");   // 추수감사절 다음 날 → 수
    assert.equal(M.prevTradingDay("2026-10-02"), "2026-10-01");
});

const Z = (iso) => Date.parse(iso);
t("저녁 경로 세션 날짜 — 16:00 ET 이후 같은 ET 날짜 안에서만", () => {
    assert.equal(M.apiSessionFor(Z("2026-10-03T02:36:00Z")), "2026-10-02");   // 10/2 22:36 EDT (문제의 시각)
    assert.equal(M.apiSessionFor(Z("2026-10-02T19:59:00Z")), null);           // 15:59 EDT — 장중
    assert.equal(M.apiSessionFor(Z("2026-10-02T20:00:00Z")), "2026-10-02");   // 16:00 EDT
    assert.equal(M.apiSessionFor(Z("2026-10-03T03:59:00Z")), "2026-10-02");   // 23:59 EDT
    assert.equal(M.apiSessionFor(Z("2026-10-03T04:00:00Z")), null);           // 토 00:00 EDT
    assert.equal(M.apiSessionFor(Z("2026-10-06T04:00:00Z")), null);           // 화 00:00 EDT — 자정 뒤는 벌크 몫
    assert.equal(M.apiSessionFor(Z("2026-09-07T22:00:00Z")), null);           // 노동절 18:00 EDT
    assert.equal(M.apiSessionFor(Z("2026-11-02T21:30:00Z")), "2026-11-02");   // EST 16:30
    assert.equal(M.apiSessionFor(Z("2026-11-02T20:59:00Z")), null);           // EST 15:59
    assert.equal(M.apiSessionFor(Z("2026-11-03T04:59:00Z")), "2026-11-02");   // EST 23:59
});

t("마지막으로 끝난 세션 — marketCalendar.etLastClosedSessionDate 와 같은 규칙", () => {
    assert.equal(M.lastClosedSession(Z("2026-10-03T02:36:00Z")), "2026-10-02");
    assert.equal(M.lastClosedSession(Z("2026-10-02T19:59:00Z")), "2026-10-01");
    assert.equal(M.lastClosedSession(Z("2026-10-04T15:00:00Z")), "2026-10-02");   // 일요일
    assert.equal(M.lastClosedSession(Z("2026-09-08T12:00:00Z")), "2026-09-04");   // 노동절 다음 날 아침
});

t("ET 시각 — 자정을 «24시»로 주지 않는다(hourCycle h23)", () => {
    const p = M.etParts(Z("2026-10-06T04:00:30Z"));
    assert.deepEqual(p, { date: "2026-10-06", minutes: 0 });
});

// ── API 행 → 벌크 값 ────────────────────────────────────────────────
t("계약 코드 — 기초 6자리 밑줄 채움(벌크·기준선 키와 같게)", () => {
    assert.equal(M.bulkContractCode("NVDA261002C00232500"), "NVDA__261002C00232500");
    assert.equal(M.bulkContractCode("A261016P00150000"), "A_____261016P00150000");
    assert.equal(M.bulkContractCode("BRKB261002C00270000"), "BRKB__261002C00270000");
    assert.equal(M.bulkContractCode("GOOGL261016C00250000"), "GOOGL_261016C00250000");
    assert.equal(M.bulkContractCode("NVDA1261002C00232500"), "NVDA1_261002C00232500");
    assert.equal(M.bulkContractCode("261002C00232500"), null);
    assert.equal(M.bulkContractCode("ABCDEFG261002C00232500"), null);   // OCC 기초는 6자 이하
    assert.equal(M.bulkContractCode("NVDA261002X00232500"), null);
    assert.equal(M.bulkContractCode(null), null);
});

t("API 행 — float32 꼬리 제거 · 빈 거래량 0 · 가격 없음 = 버림", () => {
    const row = {
        option: { code: "NVDA261002C00232500", ticker: "NVDA", expiration: "2026-10-02", strike: 232.5, type: "call" },
        price: { date: "2026-10-01", volume: 256096, open_interest: 52943, implied_volatility: 0.3195100128650665, delta: 0.36448001861572266, gamma: 2.9999999242136255e-05 },
    };
    assert.deepEqual(M.mapApiRow("NVDA", row), {
        sym: "NVDA", contract: "NVDA__261002C00232500", date: "2026-10-01", oi: 52943, vol: 256096, isCall: true,
        gamma: 0.00003, strike: 232.5, iv: 0.31951, delta: 0.36448, exp: "2026-10-02",
    });
    const nullVol = M.mapApiRow("NVDA", { option: { ...row.option, type: "put" }, price: { ...row.price, volume: null, gamma: null, delta: null, implied_volatility: null } });
    assert.equal(nullVol.vol, 0); assert.equal(nullVol.gamma, 0); assert.equal(nullVol.iv, 0); assert.equal(nullVol.isCall, false);
    assert.equal(M.mapApiRow("NVDA", { option: row.option, price: null }), null);
    // 벌크 CSV 문자열을 그대로 읽은 값과 같은 double 이 된다(0.31951 · 3.0e-05 · -0.00057)
    assert.equal(M.mapApiRow("NVDA", { option: row.option, price: { ...row.price, implied_volatility: 0.31951001 } }).iv, Number("0.31951"));
    assert.equal(M.mapApiRow("NVDA", { option: row.option, price: { ...row.price, delta: -0.000569999 } }).delta, Number("-0.00057"));
    // 조정 계약(인도물이 바뀐 시리즈 AZN1·BABA2 …)은 벌크가 별도 SYMBOL 로 적어 유니버스에서 빠진다 — API 도 같은 범위로
    const adj = { option: { code: "AZN1270115C00032500", ticker: "AZN1", expiration: "2027-01-15", strike: 32.5, type: "call" }, price: { date: "2026-10-01", open_interest: 1, volume: null } };
    assert.equal(M.mapApiRow("AZN", adj), null);
    assert.equal(M.mapApiRow("AZN", { ...adj, option: { ...adj.option, code: "AZN270115C00032500", ticker: "AZN" } }).contract, "AZN___270115C00032500");
});

// ── 집계 ────────────────────────────────────────────────────────────
// 예전(10/2 까지 운영) 알고리즘 — 점수만으로 안정 정렬. 동점이 아닌 곳은 새 집계와 글자 그대로 같아야 한다.
function oldAggregate(rows, prevOi) {
    const agg = new Map();
    for (const r of rows) {
        const { sym, contract, oi, vol, isCall, gamma, strike, iv, delta, exp } = r;
        if (oi <= 0 && vol <= 0) continue;
        let a = agg.get(sym);
        if (!a) { a = { callOI: 0, putOI: 0, callVol: 0, putVol: 0, gammaOI: 0, n: 0, top: [] }; agg.set(sym, a); }
        a.n++;
        if (isCall) { a.callOI += oi; a.callVol += vol; } else { a.putOI += oi; a.putVol += vol; }
        a.gammaOI += gamma * oi * (isCall ? 1 : -1);
        const before = prevOi ? prevOi[contract] : undefined;
        const oiChg = before === undefined ? null : oi - before;
        const score = oiChg != null ? Math.abs(oiChg) * 2 + vol : vol;
        if (score > 0) {
            a.top.push({ c: contract, k: strike, e: exp, t: isCall ? "C" : "P", v: vol, oi, d: oiChg, iv, dl: delta, s: score });
            if (a.top.length > 36) { a.top.sort((x, y) => y.s - x.s); a.top.length = 12; }
        }
    }
    const tickers = {};
    for (const [sym, a] of agg) {
        a.top.sort((x, y) => y.s - x.s);
        tickers[sym] = {
            callOI: a.callOI, putOI: a.putOI, callVol: a.callVol, putVol: a.putVol,
            pcrOI: a.callOI > 0 ? Math.round((a.putOI / a.callOI) * 1000) / 1000 : null,
            pcrVol: a.callVol > 0 ? Math.round((a.putVol / a.callVol) * 1000) / 1000 : null,
            gammaOI: Math.round(a.gammaOI), contracts: a.n,
            top: a.top.slice(0, 12).map(({ s, ...r }) => r),
        };
    }
    return tickers;
}
function newAggregate(rows, prevOi) {
    const A = M.createAggregator(prevOi);
    for (const r of rows) A.add(r);
    return { tickers: M.finalizeTickers(A.agg), oiOut: A.oiOut, kept: A.stats.kept };
}
// 결정적 난수(시드) — 시험이 매번 같은 자료를 쓴다
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function synth(seed, { ties = false } = {}) {
    const R = rng(seed);
    const rows = [], prev = {};
    for (const sym of ["AAA", "BBB", "CCC", "SPY"]) {
        const nC = 60 + Math.floor(R() * 120);
        for (let i = 0; i < nC; i++) {
            const k = 50 + i * 2.5, isCall = R() < 0.5;
            const contract = `${sym.padEnd(6, "_")}2610${String(16 + (i % 3)).padStart(2, "0")}${isCall ? "C" : "P"}${String(Math.round(k * 1000)).padStart(8, "0")}`;
            // ties: 점수가 같은 계약을 일부러 많이 만든다(작은 정수 범위)
            const oi = ties ? Math.floor(R() * 6) * 10 : Math.floor(R() * 50000);
            const vol = ties ? Math.floor(R() * 4) : Math.floor(R() * 20000) + i;   // + i 로 점수 동점 회피
            const r = R();
            if (r < 0.7) prev[contract] = Math.max(0, oi + (ties ? (Math.floor(R() * 3) - 1) * 5 : Math.floor((R() - 0.5) * 8000)));
            rows.push({ sym, contract, oi, vol, isCall, gamma: Math.round(R() * 1e5) / 1e7, strike: k, iv: Math.round(R() * 1e5) / 1e5, delta: Math.round((R() * 2 - 1) * 1e5) / 1e5, exp: `2026-10-${16 + (i % 3)}` });
        }
    }
    return { rows, prev };
}
// 종목 키 순서(첫 행이 들어온 순서)는 소비처가 쓰지 않는다 — 값만 비교한다
const canon = (tickers) => JSON.stringify(Object.keys(tickers).sort().map((k) => [k, tickers[k]]));
const shuffled = (arr, seed) => { const R = rng(seed); const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

t("동점이 없으면 예전 알고리즘과 글자 그대로 같다(합계·상위 12·순서)", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
        const { rows, prev } = synth(seed);
        const oldT = oldAggregate(rows, prev);
        const { tickers } = newAggregate(rows, prev);
        // 동점 없는 자료인지 확인(상위 13위까지 점수가 모두 다름)
        assert.equal(JSON.stringify(tickers), JSON.stringify(oldT), `seed ${seed}`);
    }
});

t("행 순서가 바뀌어도(벌크 파일 순서 ↔ API 순서) 결과가 같다 — 동점이 많아도", () => {
    for (const seed of [11, 12, 13]) {
        const { rows, prev } = synth(seed, { ties: true });
        const a = newAggregate(rows, prev).tickers;
        for (const s2 of [101, 202, 303]) {
            const b = newAggregate(shuffled(rows, s2), prev).tickers;
            // gammaOI 는 부동소수 합의 순서 차이로 반올림이 1 갈릴 수 있다 — 동점 시험 자료는 감마가 작아 같아야 한다
            assert.equal(canon(b), canon(a), `seed ${seed}/${s2}`);
        }
    }
});

t("동점은 계약 코드 오름차순으로 끊는다(12번째 자리)", () => {
    const base = { sym: "ZZZ", oi: 100, isCall: true, gamma: 0, strike: 10, iv: 0, delta: 0, exp: "2026-10-16" };
    const rows = [];
    for (let i = 0; i < 14; i++) rows.push({ ...base, contract: `ZZZ___261016C${String(10000 + i).padStart(8, "0")}`, vol: i < 11 ? 100 + i : 50 });
    // 50점 셋(코드 …011·…012·…013) 중 12번째 자리는 가장 작은 코드 …011 이어야 한다 — 들어온 순서와 무관
    for (const order of [rows, rows.slice().reverse()]) {
        const top = newAggregate(order, {}).tickers.ZZZ.top;
        assert.equal(top.length, 12);
        assert.equal(top[11].c, "ZZZ___261016C00010011");
    }
});

t("집계 규칙 — OI·거래량 둘 다 0 은 버림 · OI ≥ 50 만 기준선 · 증감 없으면 거래량 점수", () => {
    const rows = [
        { sym: "Q", contract: "Q_____261016C00010000", oi: 0, vol: 0, isCall: true, gamma: 0.1, strike: 10, iv: 0.5, delta: 0.5, exp: "2026-10-16" },
        { sym: "Q", contract: "Q_____261016C00011000", oi: 49, vol: 5, isCall: true, gamma: 0.1, strike: 11, iv: 0.5, delta: 0.5, exp: "2026-10-16" },
        { sym: "Q", contract: "Q_____261016P00009000", oi: 500, vol: 7, isCall: false, gamma: 0.2, strike: 9, iv: 0.6, delta: -0.4, exp: "2026-10-16" },
    ];
    const { tickers, oiOut, kept } = newAggregate(rows, { "Q_____261016P00009000": 400 });
    assert.equal(kept, 2);
    assert.deepEqual(oiOut, { "Q_____261016P00009000": 500 });
    assert.equal(tickers.Q.contracts, 2);
    assert.equal(tickers.Q.top[0].d, 100);         // 증감 +100 → 점수 207
    assert.equal(tickers.Q.top[1].d, null);        // 기준선 없음 → 거래량 점수 5
    assert.equal(tickers.Q.gammaOI, Math.round(0.1 * 49 - 0.2 * 500));
    // 저녁 경로는 기준선을 모으지 않는다
    const A = M.createAggregator({}, { trackOi: false }); for (const r of rows) A.add(r);
    assert.deepEqual(A.oiOut, {});
});

t("플로우 이력 한 줄 — 예전 인라인 계산과 같다", () => {
    const { rows, prev } = synth(7);
    const { tickers } = newAggregate(rows, prev);
    let total = 0, call = 0, cnt = 0;
    for (const v of Object.values(tickers)) { for (const c of v.top) { if (!(c.d > 0)) continue; const x = c.d * 100 * (c.k || 0); total += x; if (c.t === "C") call += x; } cnt += 1; }
    assert.deepEqual(M.flowPoint(tickers, "2026-10-01"), { date: "2026-10-01", notional: Math.round(total), callPct: Math.round((call / total) * 1000) / 10, tickers: cnt });
    assert.equal(M.flowPoint({ X: { top: [{ d: -5, k: 10, t: "C" }] } }, "2026-10-01"), null);
});

// ── 판이 갖춰졌나 ───────────────────────────────────────────────────
t("판 갖춤 — 98% 이상 + 지수 ETF 4종 전부 · 유니버스 밖은 세지 않는다", () => {
    const syms = Array.from({ length: 100 }, (_, i) => `S${i}`).concat(["SPY", "QQQ", "IWM", "DIA"]);
    const uni = new Set(syms);
    const all = new Set(syms);
    assert.equal(M.apiReadiness(syms, all, (s) => uni.has(s)).ready, true);
    // 2종목 지각(102/104 = 98.08%) → 준비됨, 지각 목록에 그 둘
    const minus2 = new Set(syms.filter((s) => s !== "S1" && s !== "S2"));
    const r2 = M.apiReadiness(syms, minus2, (s) => uni.has(s));
    assert.equal(r2.ready, true); assert.deepEqual(r2.laggards, ["S1", "S2"]);
    // 3종목 지각(101/104 = 97.1%) → 아직
    const minus3 = new Set(syms.filter((s) => !["S1", "S2", "S3"].includes(s)));
    assert.equal(M.apiReadiness(syms, minus3, (s) => uni.has(s)).ready, false);
    // 지수 ETF 하나라도 빠지면 아직(비율이 99%여도)
    const noSpy = new Set(syms.filter((s) => s !== "SPY"));
    const r3 = M.apiReadiness(syms, noSpy, (s) => uni.has(s));
    assert.equal(r3.ready, false); assert.deepEqual(r3.mustMissing, ["SPY"]);
    // 직전 묶음에 있었지만 유니버스에서 빠진 종목은 분모에서 뺀다
    const r4 = M.apiReadiness(syms.concat(["GONE1", "GONE2", "GONE3"]), all, (s) => uni.has(s));
    assert.equal(r4.ready, true); assert.equal(r4.expected, 104);
    assert.equal(M.apiReadiness([], all, (s) => uni.has(s)).ready, false);
});

t("묶음 대조 — 같은 판이면 전부 같음", () => {
    const { rows, prev } = synth(9);
    const a = newAggregate(rows, prev).tickers;
    const b = newAggregate(shuffled(rows, 9), prev).tickers;
    const c = M.compareTickers(a, b);
    assert.equal(c.same, c.common); assert.equal(c.diff.length, 0);
    const b2 = JSON.parse(JSON.stringify(b)); b2.AAA.callOI += 1; delete b2.BBB;
    const c2 = M.compareTickers(a, b2);
    assert.deepEqual(c2.diff, ["AAA"]); assert.deepEqual(c2.onlyA, ["BBB"]);
});

console.log(`\n${n}개 통과`);
