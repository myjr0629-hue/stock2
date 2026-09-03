#!/usr/bin/env node
// ============================================================================
// audit-screen-numbers — 화면에 뜨는 «모든 수치»의 정합성을 한 번에 검사한다.
//
// 왜 (2026-08-31 대표 지적):
//   「내가 말할 때마다 하나씩 보지 말고 전수조사를 해서 정합성을 완벽하게」
//   한 종목씩 눈으로 보면 반드시 놓친다. 프리마켓 기준선이 한 세션 밀린 것도,
//   VWAP 이 종가의 1/3 이던 것도 «한 종목을 자세히 봐서» 찾았다.
//   같은 부류를 다시 놓치지 않으려면 기계가 전부 훑어야 한다.
//
// 검사 원칙:
//   ① 자기 자신과 일치하는가 (표시값 = 그 값들로 다시 계산한 값)
//   ② 다른 엔드포인트와 일치하는가 (같은 화면에 두 벤더가 섞여 있다)
//   ③ 물리적으로 가능한가 (RSI 0~100, 고가 ≥ 저가, VWAP 이 주가의 1/3 아님)
//
// 실행: node scripts/audit-screen-numbers.js [티커,티커,...]
// ============================================================================
const BASE = process.env.AUDIT_BASE || 'https://www.signumhq.com';
const DEFAULT = 'NVDA,TSLA,AAPL,MSFT,GOOGL,AMZN,META,AMD,MU,AVGO,PLTR,TSM,INTC,NFLX,COIN,ARM,QCOM,SMCI,MRVL,UBER';
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
const pct = (a, b) => (b ? (a - b) / b : NaN);

const j = (u) => fetch(`${BASE}${u}${u.includes('?') ? '&' : '?'}_cb=${Date.now()}`).then((r) => r.json()).catch(() => null);

async function auditTicker(t) {
    const bad = [];
    const add = (code, msg) => bad.push({ code, msg });

    const [k, q] = await Promise.all([
        j(`/api/live/ticker?t=${t}&skip_alpha=1&chain=0`),
        j(`/api/live/quotes?symbols=${t}`),
    ]);
    if (!k) return [{ code: 'FETCH', msg: 'live/ticker 응답 없음' }];
    const Q = q?.data?.[t] || null;

    const P = k.prices || {};
    const D = k.display || {};
    const base = P.prevRegularClose;
    const price = k.price;
    const session = k.session;

    // ── ① 기준선 자체 ────────────────────────────────────────
    if (!(base > 0)) add('BASE_ZERO', `기준선이 ${base}`);
    if (base > 0 && price > 0 && Math.abs(pct(price, base)) > 0.25)
        add('BASE_FAR', `가격 ${price} 이 기준선 ${base} 에서 ${(pct(price, base) * 100).toFixed(1)}% — 한 세션 밀렸을 수 있다`);

    // 기준선 날짜는 «실제 거래일»이어야 한다 (일요일이 찍힌 적이 있다)
    const bd = k.baseline?.dateET;
    if (bd) {
        const dow = new Date(`${bd}T12:00:00Z`).getUTCDay();
        if (dow === 0 || dow === 6) add('BASE_WEEKEND', `기준선 날짜 ${bd} 가 주말이다`);
    } else add('BASE_NODATE', '기준선 날짜가 없다');

    // ── ② 표시값이 스스로와 맞는가 ───────────────────────────
    const recomputed = pct(price, base);
    if (Number.isFinite(recomputed) && Number.isFinite(k.changePct) && !near(recomputed, k.changePct, 0.0005))
        add('CHG_MISMATCH', `changePct ${(k.changePct * 100).toFixed(2)}% ≠ 재계산 ${(recomputed * 100).toFixed(2)}%`);
    if (Number.isFinite(D.changePctPct) && !near(D.changePctPct, k.changePct * 100, 0.05))
        add('DISPLAY_MISMATCH', `display ${D.changePctPct}% ≠ changePct ${(k.changePct * 100).toFixed(2)}%`);

    // ── ③ VWAP — 종가의 1/3 조작값이 매일 아침 나갔다 ────────
    const vw = k.vwap;
    if (!(vw > 0)) add('VWAP_ZERO', `vwap ${vw}`);
    else {
        if (near(price / vw, 3, 0.25)) add('VWAP_THIRD', `vwap ${vw} 이 가격의 1/3 — (h+l+c)/3 에서 h·l 이 0`);
        if (Math.abs(pct(price, vw)) > 0.35) add('VWAP_FAR', `vwap ${vw} 이 가격 ${price} 에서 ${(pct(price, vw) * 100).toFixed(0)}%`);
    }

    // ── ④ 범위 ──────────────────────────────────────────────
    if (P.high != null && P.low != null) {
        if (!(P.high > 0 && P.low > 0)) add('RANGE_ZERO', `고 ${P.high} 저 ${P.low}`);
        else if (P.high < P.low) add('RANGE_INVERT', `고 ${P.high} < 저 ${P.low}`);
    } else add('RANGE_NULL', '고저가 없음');

    // ── ⑤ 지표가 물리적으로 가능한가 ─────────────────────────
    const rsi = D.rsi14 ?? k.technical?.rsi14;
    if (rsi != null && !(rsi > 0 && rsi < 100)) add('RSI_RANGE', `rsi14 ${rsi}`);

    const F = k.flow || {};
    for (const [key, label] of [['maxPain', '맥스페인'], ['gammaFlipLevel', '감마플립'], ['callWall', '콜월'], ['putFloor', '풋플로어']]) {
        const v = F[key];
        if (v != null && v > 0 && price > 0 && Math.abs(pct(v, price)) > 0.6)
            add('LEVEL_FAR', `${label} ${v} 가 가격 ${price} 에서 ${(pct(v, price) * 100).toFixed(0)}%`);
    }
    if (F.darkPoolPct != null && !(F.darkPoolPct >= 0 && F.darkPoolPct <= 100)) add('DP_RANGE', `다크풀 ${F.darkPoolPct}%`);
    if (F.darkPoolShortPct != null && !(F.darkPoolShortPct >= 0 && F.darkPoolShortPct <= 100)) add('DPS_RANGE', `다크풀 공매도 ${F.darkPoolShortPct}%`);

    // ── ⑥ 엔드포인트끼리 일치하는가 (벤더가 둘이다) ──────────
    if (Q) {
        // quotes.price 는 «마지막 정규장 종가» = ticker 의 prevRegularClose (PRE 기준)
        const expect = session === 'PRE' ? base : null;
        if (expect && Q.price > 0 && !near(Q.price, expect, Math.max(0.5, expect * 0.002)))
            add('XEP_PRICE', `quotes.price ${Q.price} ≠ ticker 기준선 ${expect}`);
        // ⚠️ [2026-09-03 교정 — 검사기 버그였다]
        //   `Q.extendedPrice`(장외 가격)를 `price`(현재가)와 비교하고 있었다.
        //   정규장 중에는 price 가 정규장 가격이고 extendedPrice 는 «아침 프리마켓의
        //   잔존값»이라 서로 다른 것이 **정상**이다. 종목이 하루 동안 움직였을 뿐인데
        //   3.9% 차이를 정합성 위반으로 보고했다(실측: SMCI 프리 37.42 vs 정규 35.98).
        //   → 장외 세션(PRE/POST)에서만, 같은 세션의 값끼리 비교한다.
        //   ⚠️ [2026-09-04] 여기서 `T` 를 썼는데 이 함수의 페이로드 변수는 `k` 다.
        //     정규장 중에는 이 분기를 안 타서 몰랐다가, 장이 POST 로 넘어가는 순간
        //     `ReferenceError: T is not defined` 로 **검사기가 통째로 죽었다.**
        //     (검사기가 죽으면 「이상 없음」도 「이상 있음」도 못 본다)
        const tickerExt = session === 'PRE' ? k?.extended?.prePrice
            : session === 'POST' ? k?.extended?.postPrice : null;
        if (Q.extendedPrice > 0 && tickerExt > 0 && Math.abs(pct(Q.extendedPrice, tickerExt)) > 0.03)
            add('XEP_EXT', `quotes 장외 ${Q.extendedPrice} vs ticker 장외 ${tickerExt} — ${(pct(Q.extendedPrice, tickerExt) * 100).toFixed(1)}% 차이 (${session})`);
    } else add('XEP_NONE', 'live/quotes 응답 없음');

    return bad;
}

(async () => {
    const tickers = (process.argv[2] || DEFAULT).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    console.log(`전수 정합성 검사 · ${tickers.length}종목 · ${BASE}\n`);
    let total = 0;
    const byCode = {};
    // 순차로 돌면 20종목에 2분이 넘는다 — 5개씩 병렬로 훑는다
    const CONC = 5;
    const results = [];
    for (let i = 0; i < tickers.length; i += CONC) {
        const batch = tickers.slice(i, i + CONC);
        const got = await Promise.all(batch.map(async (t) => [t, await auditTicker(t)]));
        results.push(...got);
    }
    for (const [t, bad] of results) {
        total += bad.length;
        for (const b of bad) (byCode[b.code] ||= []).push(t);
        console.log(`${bad.length === 0 ? '✓' : '✗'} ${t.padEnd(6)} ${bad.length === 0 ? '이상 없음' : bad.map((b) => `[${b.code}] ${b.msg}`).join('\n         ')}`);
    }
    console.log(`\n${'─'.repeat(60)}`);
    if (total === 0) console.log(`★ ${tickers.length}종목 전부 이상 없음`);
    else {
        console.log(`⚠ 위반 ${total}건`);
        for (const [c, ts] of Object.entries(byCode).sort((a, b) => b[1].length - a[1].length))
            console.log(`  ${c.padEnd(18)} ${ts.length}종목  ${ts.slice(0, 8).join(' ')}${ts.length > 8 ? ' …' : ''}`);
    }
    process.exit(total === 0 ? 0 : 1);
})();
