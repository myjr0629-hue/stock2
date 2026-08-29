#!/usr/bin/env node
/**
 * 세션별 가격 판정 테스트
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 테스트가 필요한가]  이 로직은 «지금이 어느 세션인가»에 따라 분기한다.
 *   토요일에 코드를 고치면 REG/PRE 분기는 **실화면으로 검증할 방법이 없다.**
 *   그래서 실측한 실제 API 응답을 고정값(fixture)으로 박아 두고 4개 세션을
 *   전부 돌린다. 이게 유일한 방어선이다.
 *
 * [고정값 출처]  2026-08-29 Intrinio 실제 응답 (NVDA/GOOGL)
 *   NVDA  realtime: eod_close_price 217.55 · eod_close_date 2026-08-28
 *                   normal_market_hours_last_price 217.58 @ 19:59:59Z
 *                   last_price 217.86 @ 23:59:59Z
 *         일봉: 8/28 c=217.55 · 8/27 c=227.98 · 8/26 c=209.66
 *   → 금요일 정규장 등락 = (217.55 − 227.98) / 227.98 = **−4.575%**
 *
 * 사용: node scripts/test-session-prices.js
 */

// 컴파일 없이 테스트하려고 순수 함수를 그대로 옮겨 둔다.
// ⚠️ src/services/intrinioClient.ts 의 resolveSessionPrices 와 **같아야 한다.**
//    갈리면 이 테스트가 거짓 안심을 준다.
function etDateOf(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const et = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const p = (n) => String(n).padStart(2, "0");
    return `${et.getFullYear()}-${p(et.getMonth() + 1)}-${p(et.getDate())}`;
}

function resolveSessionPrices(i) {
    const n = (v) => { const x = Number(v); return Number.isFinite(x) && x !== 0 ? x : null; };
    const b0 = i.bars?.[0] || null;
    const b1 = i.bars?.[1] || null;
    const d0 = String(b0?.date || "");

    let regularClose = n(b0?.close) ?? i.eodClosePrice ?? null;
    let prevClose = n(b1?.close) ?? null;
    let regularDate = d0 || i.eodCloseDate || "";
    let basis = b0 ? "bars" : i.eodClosePrice != null ? "eod-only" : "none";

    if (i.session === "REG") {
        if (d0 && d0 === i.todayEt) {
            regularClose = i.regularLastPrice ?? regularClose;
        } else {
            regularClose = i.regularLastPrice ?? regularClose;
            prevClose = n(b0?.close) ?? i.eodClosePrice ?? prevClose;
        }
        regularDate = i.todayEt;
        basis = "live-intraday";
    } else if (d0 && d0 < i.todayEt) {
        const regTradeDate = etDateOf(i.regularLastTime);
        if (regTradeDate === i.todayEt && i.regularLastPrice != null) {
            prevClose = n(b0?.close) ?? prevClose;
            regularClose = i.regularLastPrice;
            regularDate = i.todayEt;
            basis = "post-before-publish";
        }
    }
    return { regularClose, prevClose, regularDate, basis };
}

// ── 실측 고정값 ──────────────────────────────────────────────────
const NVDA_BARS = [
    { date: "2026-08-28", close: 217.55 },
    { date: "2026-08-27", close: 227.98 },
    { date: "2026-08-26", close: 209.66 },
];
const pct = (a, b) => (b ? ((a - b) / b) * 100 : 0);

let pass = 0, fail = 0;
function check(name, got, want, tol = 0.005) {
    const ok = want == null ? got == null
        : typeof want === "number" ? got != null && Math.abs(got - want) <= tol
            : got === want;
    if (ok) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}  = ${got}`); }
    else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}  기대 ${want} · 실제 ${got}`); }
}

console.log("═".repeat(78));
console.log("  세션별 가격 판정 — 실측 고정값 (NVDA 2026-08-28)");
console.log("═".repeat(78));

// ① 주말/야간 (CLOSED) — 금요일 봉이 이미 게시됨
console.log("\n▌① CLOSED · 토요일 (금요일 봉 게시됨)  ← 대표가 본 화면");
{
    const r = resolveSessionPrices({
        bars: NVDA_BARS, session: "CLOSED", todayEt: "2026-08-28",
        eodClosePrice: 217.55, eodCloseDate: "2026-08-28",
        regularLastPrice: 217.58, regularLastTime: "2026-08-28T19:59:59.827Z",
    });
    check("본장 종가", r.regularClose, 217.55);
    check("전일 종가", r.prevClose, 227.98);
    check("본장 등락률", pct(r.regularClose, r.prevClose), -4.5750, 0.001);
    check("본장 날짜", r.regularDate, "2026-08-28");
    check("판정 근거", r.basis, "bars");
    // 시간외: last 217.86 vs 본장 217.55
    check("POST 등락률", pct(217.86, r.regularClose), 0.1425, 0.001);
}

// ② 금요일 마감 직후 POST — 오늘 봉이 아직 게시 전
console.log("\n▌② POST · 금요일 16:30 ET (오늘 봉 아직 없음)");
{
    const r = resolveSessionPrices({
        bars: NVDA_BARS.slice(1), session: "POST", todayEt: "2026-08-28",
        eodClosePrice: 227.98, eodCloseDate: "2026-08-27",
        regularLastPrice: 217.58, regularLastTime: "2026-08-28T19:59:59.827Z",
    });
    check("본장 종가(실시간 대체)", r.regularClose, 217.58);
    check("전일 종가", r.prevClose, 227.98);
    check("본장 등락률", pct(r.regularClose, r.prevClose), -4.5618, 0.01);
    check("판정 근거", r.basis, "post-before-publish");
}

// ③ 월요일 프리마켓 — 오늘 정규장은 아직 없었다
console.log("\n▌③ PRE · 월요일 07:00 ET (마지막 체결은 금요일)");
{
    const r = resolveSessionPrices({
        bars: NVDA_BARS, session: "PRE", todayEt: "2026-08-31",
        eodClosePrice: 217.55, eodCloseDate: "2026-08-28",
        regularLastPrice: 217.58, regularLastTime: "2026-08-28T19:59:59.827Z",
    });
    check("본장 종가(금요일 유지)", r.regularClose, 217.55);
    check("전일 종가(목요일)", r.prevClose, 227.98);
    check("본장 등락률(금요일 것)", pct(r.regularClose, r.prevClose), -4.5750, 0.001);
    check("본장 날짜", r.regularDate, "2026-08-28");
    check("판정 근거(실시간으로 안 밀림)", r.basis, "bars");
}

// ④ 장중 REG — 오늘 봉 없음
console.log("\n▌④ REG · 월요일 11:00 ET (오늘 봉 없음, 실시간 220.10)");
{
    const r = resolveSessionPrices({
        bars: NVDA_BARS, session: "REG", todayEt: "2026-08-31",
        eodClosePrice: 217.55, eodCloseDate: "2026-08-28",
        regularLastPrice: 220.10, regularLastTime: "2026-08-31T15:00:00.000Z",
    });
    check("본장 현재가", r.regularClose, 220.10);
    check("전일 종가(금요일)", r.prevClose, 217.55);
    check("등락률", pct(r.regularClose, r.prevClose), 1.1721, 0.01);
    check("판정 근거", r.basis, "live-intraday");
}

// ⑤ 장중 REG — 벤더가 진행 중 봉을 이미 올린 경우
console.log("\n▌⑤ REG · 벤더가 오늘 봉을 이미 게시 (진행 중 값)");
{
    const r = resolveSessionPrices({
        bars: [{ date: "2026-08-31", close: 219.0 }, ...NVDA_BARS], session: "REG", todayEt: "2026-08-31",
        eodClosePrice: 217.55, eodCloseDate: "2026-08-28",
        regularLastPrice: 220.10, regularLastTime: "2026-08-31T15:00:00.000Z",
    });
    check("본장 현재가(실시간 우선)", r.regularClose, 220.10);
    check("전일 종가(금요일)", r.prevClose, 217.55);
    check("진행 중 봉을 전일로 쓰지 않음", r.prevClose !== 219.0, true);
}

// ⑥ 회귀 방지 — 옛 버그 재현 시도
console.log("\n▌⑥ 회귀 방지 — «eod_close_price 를 전일로» 쓰면 안 된다");
{
    const r = resolveSessionPrices({
        bars: NVDA_BARS, session: "CLOSED", todayEt: "2026-08-28",
        eodClosePrice: 217.55, eodCloseDate: "2026-08-28",
        regularLastPrice: 217.58, regularLastTime: "2026-08-28T19:59:59.827Z",
    });
    check("전일 종가가 eod_close_price 가 아님", r.prevClose !== 217.55, true);
    check("등락률이 0 근처가 아님", Math.abs(pct(r.regularClose, r.prevClose)) > 1, true);
}

// ⑦ 데이터 부족 — 지어내지 않는다
console.log("\n▌⑦ 일봉이 하나뿐 — 등락률을 만들지 않는다");
{
    const r = resolveSessionPrices({
        bars: [{ date: "2026-08-28", close: 217.55 }], session: "CLOSED", todayEt: "2026-08-28",
        eodClosePrice: 217.55, eodCloseDate: "2026-08-28",
        regularLastPrice: 217.58, regularLastTime: "2026-08-28T19:59:59.827Z",
    });
    check("본장 종가", r.regularClose, 217.55);
    check("전일 종가 = null (0 이 아니다)", r.prevClose, null);
}

console.log("\n" + "═".repeat(78));
console.log(`  통과 ${pass} · 실패 ${fail}`);
console.log("═".repeat(78));
process.exit(fail ? 1 : 0);
