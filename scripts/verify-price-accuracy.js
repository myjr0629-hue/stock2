#!/usr/bin/env node
/**
 * 가격 정확도 교차검증 — 화면에 나가는 숫자를 «일봉 진실»과 대조한다
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 필요한가]  2026-08-29 실측에서 앱이 NVDA −4.57% 를 **+0.01%** 로,
 *   GOOGL +1.74% 를 +0.04% 로 표시하고 있었다. 엔드포인트는 전부 200 이었고
 *   필드도 다 차 있었다. «응답이 왔는가»를 보는 감사기로는 절대 못 잡는다.
 *
 * [무엇을 보는가]  일봉 두 개(직전 종가 → 최신 종가)가 유일한 정답이다.
 *   그 값과 각 소비 엔드포인트가 내는 등락률을 **직접 비교**한다.
 *     1) 본장 등락률이 일봉 계산과 일치하는가        (허용 0.05%p)
 *     2) 본장 종가가 일봉 종가와 일치하는가          (허용 0.1%)
 *     3) «전 종목이 보합» 패턴이 아닌가              ← 이번 버그의 지문
 *     4) PRE/POST 등락률이 «본장 종가» 기준인가
 *
 * [3번이 핵심]  기준선이 오염되면 종목이 달라도 등락률이 전부 0 근처로 몰린다.
 *   개별 종목만 보면 «그럴 수도 있지»로 넘어가지만, 여러 종목이 동시에
 *   |등락률| < 0.1% 면 그건 시장이 아니라 **코드**다.
 *
 * 사용: node scripts/verify-price-accuracy.js [--base URL] [--tickers A,B,C]
 */

const BASE = (() => { const i = process.argv.indexOf("--base"); return i > 0 ? process.argv[i + 1] : "https://www.signumhq.com"; })();
const TICKERS = (() => {
    const i = process.argv.indexOf("--tickers");
    return (i > 0 ? process.argv[i + 1] : "NVDA,GOOGL,TSLA,AAPL,MSFT,AMZN,META,SPY").split(",").map((s) => s.trim()).filter(Boolean);
})();

const C = { r: "\x1b[31m", y: "\x1b[33m", g: "\x1b[32m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m" };
const TOL_PCT = 0.05;    // 등락률 허용 오차 (%p)
const TOL_PX = 0.1;      // 가격 허용 오차 (%)

async function get(url) {
    try {
        const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30000) });
        return r.ok ? await r.json() : null;
    } catch { return null; }
}

/** 일봉 마지막 2개 → 진실 */
async function truth(t) {
    const j = await get(`${BASE}/api/chart?symbol=${t}&range=1m`);
    const a = j?.data || j?.candles || j?.bars || j?.results || [];
    if (a.length < 2) return null;
    const cl = (x) => Number(x.c ?? x.close);
    const dt = (x) => String(x.t ?? x.time ?? x.date ?? "").slice(0, 10);
    const [p, n] = a.slice(-2);
    const pc = cl(p), c = cl(n);
    if (!(pc > 0) || !(c > 0)) return null;
    return { prevClose: pc, close: c, chgPct: ((c - pc) / pc) * 100, date: dt(n), prevDate: dt(p) };
}

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };

(async () => {
    console.log("═".repeat(96));
    console.log(`  가격 정확도 교차검증 · ${BASE} · ${new Date().toISOString()}`);
    console.log("═".repeat(96));
    console.log(`  기준: /api/chart 일봉 마지막 2개 (허용 등락률 ±${TOL_PCT}%p · 가격 ±${TOL_PX}%)\n`);

    let bad = 0;
    const seen = [];

    for (const t of TICKERS) {
        const T = await truth(t);
        if (!T) { console.log(`${C.y}?${C.x} ${t.padEnd(6)} 일봉 부족 — 판정 불가`); continue; }

        const tick = await get(`${BASE}/api/live/ticker?t=${t}`);
        if (!tick) { console.log(`${C.r}✗${C.x} ${t.padEnd(6)} ticker 응답 없음`); bad++; continue; }

        const gotPct = num(tick.changePct) != null ? num(tick.changePct) * 100 : num(tick.changePercent);
        const gotPx = num(tick.price);
        const gotPrev = num(tick.prevClose) ?? num(tick.previousClose);

        const dPct = gotPct == null ? null : Math.abs(gotPct - T.chgPct);
        const dPx = gotPx == null ? null : Math.abs((gotPx - T.close) / T.close) * 100;
        const prevOk = gotPrev == null ? null : Math.abs((gotPrev - T.prevClose) / T.prevClose) * 100 <= TOL_PX;

        const okPct = dPct != null && dPct <= TOL_PCT;
        const okPx = dPx != null && dPx <= TOL_PX;
        const ok = okPct && okPx && prevOk !== false;
        if (!ok) bad++;
        seen.push({ t, gotPct, truth: T.chgPct });

        console.log(`${ok ? C.g + "✓" : C.r + "✗"}${C.x} ${t.padEnd(6)} ` +
            `진실 ${T.prevDate}→${T.date}  ${T.prevClose} → ${T.close}  ${T.chgPct >= 0 ? "+" : ""}${T.chgPct.toFixed(2)}%`);
        console.log(`     표시  가격 ${gotPx ?? "—"}${okPx ? "" : C.r + " ← 불일치" + C.x}` +
            `  등락 ${gotPct == null ? "—" : (gotPct >= 0 ? "+" : "") + gotPct.toFixed(2) + "%"}${okPct ? "" : C.r + ` ← 오차 ${dPct?.toFixed(2)}%p` + C.x}` +
            `  전일 ${gotPrev ?? "—"}${prevOk === false ? C.r + " ← 불일치" + C.x : ""}`);
    }

    // ── «전 종목 보합» 지문 ─────────────────────────────────────
    console.log();
    const flat = seen.filter((s) => s.gotPct != null && Math.abs(s.gotPct) < 0.1);
    const trulyFlat = seen.filter((s) => Math.abs(s.truth) < 0.1);
    if (seen.length >= 3 && flat.length >= seen.length - 1 && trulyFlat.length < flat.length) {
        console.log(`${C.r}${C.b}✗ 「전 종목 보합」 패턴 감지${C.x} — ${seen.length}종목 중 ${flat.length}개가 |등락률| < 0.1%`);
        console.log(`  종목이 달라도 등락률이 0 근처로 몰리면 그건 시장이 아니라 **기준선 오염**이다.`);
        bad++;
    } else {
        console.log(`${C.g}✓${C.x} 「전 종목 보합」 패턴 없음 (보합 ${flat.length}/${seen.length}, 실제 보합 ${trulyFlat.length})`);
    }

    console.log("\n" + "═".repeat(96));
    console.log(bad === 0
        ? `  ${C.g}${C.b}전 항목 일치${C.x}`
        : `  ${C.r}${C.b}불일치 ${bad}건${C.x} — 화면 숫자가 일봉과 다르다`);
    console.log("═".repeat(96));
    process.exit(bad ? 1 : 0);
})();
