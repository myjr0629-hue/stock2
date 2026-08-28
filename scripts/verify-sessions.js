#!/usr/bin/env node
/**
 * 세션별 데이터 정합성 검증 — PRE / REG / POST / CLOSED
 *
 * [왜 필요한가] 2026-08-29 Intrinio 이관 검증을 **정규장 중에만** 수행해서
 *   세션 전환 시점의 버그를 놓쳤다:
 *     · day.c(정규장 종가)에 시간외 가격이 들어가 postChangePct 가 항상 0%
 *     · prevDay.c 에 «오늘 진행 중 봉»의 close 가 들어가 등락률이 0 에 수렴
 *   값이 «있다»가 아니라 «세션 규칙에 맞다»를 봐야 한다.
 *
 * 사용: node scripts/verify-sessions.js [ticker...]
 */
const BASE = process.env.VERIFY_BASE || "https://www.signumhq.com";
const TICKERS = process.argv.slice(2).length ? process.argv.slice(2) : ["NVDA", "TSLA", "AAPL", "SPY"];

function etNow() {
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    return { d, mins: d.getHours() * 60 + d.getMinutes(), dow: d.getDay() };
}

function expectedSession() {
    const { mins, dow } = etNow();
    if (dow === 0 || dow === 6) return "CLOSED";
    if (mins >= 240 && mins < 570) return "PRE";
    if (mins >= 570 && mins < 960) return "REG";
    if (mins >= 960 && mins < 1200) return "POST";
    return "CLOSED";
}

const P = (v, n = 2) => (v === null || v === undefined ? "—" : Number(v).toFixed(n));
let pass = 0, fail = 0;
const check = (ok, label, detail) => {
    console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(34)} ${detail}`);
    ok ? pass++ : fail++;
};

(async () => {
    const exp = expectedSession();
    const { d } = etNow();
    console.log("═".repeat(76));
    console.log(`  세션 정합성 검증 · 미동부 ${d.toLocaleString("en-US")} · 기대 세션 ${exp}`);
    console.log("═".repeat(76));

    for (const t of TICKERS) {
        const r = await fetch(`${BASE}/api/live/ticker?t=${t}&_cb=${Date.now()}`, {
            headers: { "cache-control": "no-cache" },
        });
        if (!r.ok) { check(false, `${t} 응답`, `HTTP ${r.status}`); continue; }
        const q = await r.json();
        const px = q.prices || {};
        const ex = q.extended || {};

        console.log(`\n[${t}] session=${q.session} price=$${P(q.price)} (${P((q.changePct || 0) * 100)}%)`);

        // 1) 세션 판정
        check(q.session === exp || (exp === "CLOSED" && q.session === "CLOSED"),
            "세션 판정", `응답 ${q.session} / 기대 ${exp}`);

        // 2) 전일 종가가 오늘 값이 아닐 것
        const prevOk = px.prevRegularClose > 0 && Math.abs(px.prevRegularClose - q.price) / q.price > 0.0001;
        check(prevOk, "전일종가 ≠ 현재가",
            `prev $${P(px.prevRegularClose)} vs now $${P(q.price)}`);

        // 3) 등락률 = (기준가 - 전일종가)/전일종가 와 일치
        const base = q.session === "POST" || q.session === "CLOSED"
            ? (px.regularCloseToday ?? q.price) : q.price;
        const calc = px.prevRegularClose > 0 ? (base - px.prevRegularClose) / px.prevRegularClose : 0;
        check(Math.abs(calc - (q.changePct || 0)) < 0.005, "등락률 재계산",
            `응답 ${P((q.changePct || 0) * 100)}% vs 계산 ${P(calc * 100)}%`);

        // 4) POST 세션이면 정규장 종가와 현재가가 분리되어야 함
        if (q.session === "POST") {
            const sep = px.regularCloseToday != null &&
                Math.abs(px.regularCloseToday - (ex.postPrice ?? q.price)) > 0.001;
            check(sep, "정규장종가 ≠ 애프터마켓",
                `reg $${P(px.regularCloseToday)} vs post $${P(ex.postPrice)}`);

            const pcOk = ex.postChangePct !== 0 || Math.abs((ex.postPrice ?? 0) - (px.regularCloseToday ?? 0)) < 0.001;
            check(pcOk, "POST 등락률",
                `${P((ex.postChangePct || 0) * 100)}%`);
        }

        // 5) PRE 세션이면 프리마켓 가격이 있어야 함
        if (q.session === "PRE") {
            check(ex.prePrice > 0, "PRE 가격", `$${P(ex.prePrice)} (${P((ex.preChangePct || 0) * 100)}%)`);
        }

        // 6) 옵션 구조 지표
        const f = q.flow || {};
        check(f.gammaFlipLevel > 0 && f.oiPcr > 0, "옵션 구조",
            `GF ${P(f.gammaFlipLevel)} · PCR ${P(f.oiPcr)} · callWall ${P(f.callWall)}`);

        // 7) 차트 마지막 봉과 시세 일치
        const c = await fetch(`${BASE}/api/chart?symbol=${t}&range=1d&_cb=${Date.now()}`);
        if (c.ok) {
            const cd = await c.json();
            const arr = cd.data || [];
            const lastBar = arr[arr.length - 1];
            if (lastBar) {
                const diff = Math.abs(lastBar.close - q.price) / q.price * 100;
                check(diff < 2, "차트↔시세", `${arr.length}봉 · 끝 $${P(lastBar.close)} · 차이 ${P(diff)}%`);
            } else check(false, "차트↔시세", "차트 비어있음");
        }
    }

    console.log("\n" + "═".repeat(76));
    console.log(`  통과 ${pass} · 실패 ${fail}`);
    console.log("═".repeat(76));
    process.exit(fail > 0 ? 1 : 0);
})();
