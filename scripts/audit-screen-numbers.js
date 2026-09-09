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

// ══════════════════════════════════════════════════════════════════════
// ★ «정답 대조»용 규제 원본 (2026-09-09 추가)
//
//   다크풀 91.6% 가 검사를 통과했다 — 0~100 범위 안이었기 때문이다.
//   실제로는 «9/8 장외물량 ÷ 9/4 거래량» 이라 39%p 부풀어 있었다.
//   범위·타당성 검사만으로는 이런 걸 못 잡는다. 값을 «다시 계산»해야 한다.
//
//   FINRA 일일 공매도 파일(무인증·공개)이 정답이다:
//     날짜|심볼|공매도량|면제량|**총 장외거래량**|시장
//   장외비중 = 총 장외거래량 ÷ 그 날의 «연결 거래량»(일봉 volume)
// ══════════════════════════════════════════════════════════════════════
const finraCache = new Map();
async function finraDay(date) {
    if (!date) return null;
    if (finraCache.has(date)) return finraCache.get(date);
    const url = `https://cdn.finra.org/equity/regsho/daily/CNMSshvol${date.replace(/-/g, '')}.txt`;
    try {
        const res = await fetch(url);
        if (!res.ok) { finraCache.set(date, null); return null; }
        const text = await res.text();
        const map = new Map();
        for (const line of text.split('\n')) {
            const p = line.split('|');
            if (p.length < 5 || p[0] === 'Date') continue;
            const short = Number(p[2]), total = Number(p[4]);
            if (Number.isFinite(short) && Number.isFinite(total) && total > 0) map.set(p[1], { short, total });
        }
        finraCache.set(date, map);
        return map;
    } catch {
        finraCache.set(date, null);
        return null;
    }
}

async function auditTicker(t) {
    const bad = [];
    const add = (code, msg) => bad.push({ code, msg });

    const [k, q, ch, dp] = await Promise.all([
        j(`/api/live/ticker?t=${t}&skip_alpha=1&chain=0`),
        j(`/api/live/quotes?symbols=${t}`),
        j(`/api/chart?symbol=${t}&range=1M`),
        j(`/api/flow/dark-pool?ticker=${t}`),
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

    // ── ②-B ★ 자기들끼리 맞는 것만으로는 부족하다 — «정답»과 대조한다 ──
    //   [2026-09-07 노동절] changePct 와 display 가 서로 «맞아서» 검사기가 통과시켰는데
    //   둘 다 틀렸다. 22종목 중 14종목이 보합(±0.0x%)으로 나갔다.
    //   정답은 화면이 아니라 «일봉»에 있다: 마지막 두 거래일 종가의 비율.
    const bars = (ch?.data || [])
        .map((r) => ({
            // etDate 가 «그 세션의 ET 날짜» 정본이다. date 는 UTC 자정이라 하루가 밀 수 있다.
            d: String(r?.etDate || r?.date || r?.t || '').slice(0, 10),
            c: Number(r?.close ?? r?.c),
            h: Number(r?.high ?? r?.h),
            l: Number(r?.low ?? r?.l),
            v: Number(r?.volume ?? r?.v),
        }))
        .filter((r) => r.d && Number.isFinite(r.c) && r.c > 0)
        .sort((a, b) => a.d.localeCompare(b.d));
    if (bars.length >= 2 && (session === 'CLOSED' || session === 'POST')) {
        const [p2, p1] = [bars[bars.length - 2], bars[bars.length - 1]];
        const truthPct = ((p1.c - p2.c) / p2.c) * 100;
        // 표시 등락률
        if (Number.isFinite(D.changePctPct) && Math.abs(D.changePctPct - truthPct) > 0.05)
            add('TRUTH_MISMATCH', `display ${D.changePctPct}% ≠ 일봉 정답 ${truthPct.toFixed(2)}% (${p2.d} ${p2.c} → ${p1.d} ${p1.c})`);
        // 기준선이 «표시 중인 세션 그 자체»면 자기 자신과 비교한 것이다 — 휴장일의 지문
        if (base > 0 && Math.abs(base - p1.c) / p1.c < 0.0002)
            add('BASE_IS_SELF', `기준선 ${base} 이 직전장 종가 ${p1.c}(${p1.d}) 와 같다 — 자기 자신과 비교하고 있다`);
        // /api/live/quotes 도 같은 정답을 봐야 한다 (생산자가 둘이다)
        const qp = Q?.changePercent;
        if (Number.isFinite(qp) && Math.abs(qp - truthPct) > 0.05)
            add('QUOTES_TRUTH_MISMATCH', `quotes ${qp.toFixed(2)}% ≠ 일봉 정답 ${truthPct.toFixed(2)}%`);
    }

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

    // ── ⑤-B ★ 다크풀·공매도를 «규제 원본»으로 다시 계산한다 ─────
    //   [2026-09-09] 다크풀 91.6% 가 범위검사(0~100)를 통과했다.
    //   실제는 52.4% 였고, «9/8 장외물량 ÷ 9/4 거래량» 이라 39%p 부풀었다.
    //   방향이 종목마다 달라(늘면 부풀고 줄면 깎임) 한 종목만 봐선 안 보인다.
    //   → 값을 다시 계산해서 대조하는 것 말고는 잡을 방법이 없다.
    if (dp && dp.available !== false && typeof dp.pct === 'number') {
        const dpDate = dp.date || null;
        const fin = await finraDay(dpDate);
        const row = fin && fin.get(t);
        // 그 날짜의 일봉(= 연결 거래량). 없으면 분모를 못 만드니 판정하지 않는다.
        const bar = bars.find((b) => b.d === dpDate) || null;
        const barVol = bar ? Number(bar.v) : NaN;

        if (dpDate && !fin) add('DP_NO_SOURCE', `FINRA 원본(${dpDate})을 못 받아 대조 불가`);
        else if (row && Number.isFinite(barVol) && barVol > 0) {
            const truthPct = (row.total / barVol) * 100;
            if (Math.abs(dp.pct - truthPct) > 2)
                add('DP_TRUTH', `장외비중 ${dp.pct}% ≠ 원본 재계산 ${truthPct.toFixed(1)}% (${dpDate}: 장외 ${row.total.toLocaleString()} ÷ 연결 ${barVol.toLocaleString()})`);
            const truthShort = (row.short / row.total) * 100;
            if (typeof dp.shortPct === 'number' && Math.abs(dp.shortPct - truthShort) > 0.3)
                add('DPSHORT_TRUTH', `장외 공매도 ${dp.shortPct}% ≠ 원본 ${truthShort.toFixed(1)}%`);
            // 분자·분모가 «같은 날»인지 — 이번 버그의 지문
            if (typeof dp.volume === 'number' && Math.abs(dp.volume - row.total) / row.total > 0.02)
                add('DP_VOL_MISMATCH', `장외 거래량 ${dp.volume.toLocaleString()} ≠ 원본 ${row.total.toLocaleString()} (${dpDate})`);
        }
        // 다크풀 날짜가 «있지도 않은 세션»이면 안 된다
        if (dpDate && bars.length && dpDate > bars[bars.length - 1].d)
            add('DP_DATE_AHEAD', `다크풀 날짜 ${dpDate} 가 최신 일봉 ${bars[bars.length - 1].d} 보다 앞선다`);
    }

    // ── ⑤-C 고·저가를 «그 세션의 일봉»과 대조 ────────────────
    if (bars.length && (session === 'CLOSED' || session === 'POST')) {
        const last = bars[bars.length - 1];
        if (P.high != null && Number.isFinite(last.h) && last.h > 0 && Math.abs(P.high - last.h) / last.h > 0.005)
            add('HIGH_TRUTH', `고가 ${P.high} ≠ 일봉 ${last.h} (${last.d})`);
        if (P.low != null && Number.isFinite(last.l) && last.l > 0 && Math.abs(P.low - last.l) / last.l > 0.005)
            add('LOW_TRUTH', `저가 ${P.low} ≠ 일봉 ${last.l} (${last.d})`);
    }

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
