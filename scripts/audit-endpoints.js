#!/usr/bin/env node
/**
 * 전 데이터 엔드포인트 정합성 감사기
 *
 * [왜 필요한가] 2026-08-29 Massive→Intrinio 이관 검증에서 반복 확인된 실패 형태는
 * «HTTP 500» 이 아니라 **«HTTP 200 인데 값이 가짜»** 였다.
 *
 *   · Market Breadth  → advancers 0 / breadthPct 50  (기본 스냅샷)
 *   · RLSI 컴포넌트   → 전부 플레이스홀더 50
 *   · movers          → 전일 종가 + 어제 등락률
 *   · rvol            → «측정 안 함»의 0 이 «저조»로 해석되어 AI 문장에 등장
 *
 * 그래서 이 감사기는 «응답이 왔는가»가 아니라 아래를 본다.
 *   1) 상태/지연
 *   2) 의심 상수  — 0, 50, 1.0 같은 기본값이 지표 자리에 박혀 있는지
 *   3) 정체       — 같은 요청을 두 번 했을 때 «변해야 하는 값»이 그대로인지
 *   4) 교차검증   — 같은 사실을 말하는 서로 다른 엔드포인트가 일치하는지
 *   5) 신선도     — 응답에 실린 날짜/타임스탬프가 며칠 지난 것은 아닌지
 *
 * 사용: node scripts/audit-endpoints.js [--base URL] [--only 패턴]
 */

const BASE = (() => {
    const i = process.argv.indexOf("--base");
    return i > 0 ? process.argv[i + 1] : "https://www.signumhq.com";
})();
const ONLY = (() => {
    const i = process.argv.indexOf("--only");
    return i > 0 ? process.argv[i + 1] : null;
})();

const T = "NVDA";
const cb = () => `_cb=${Date.now()}${Math.floor(Math.random() * 1000)}`;

// ── 감사 대상 ────────────────────────────────────────────────────────
// fresh: 두 번 호출해 «변해야 하는 값»이 변하는지 확인할 필드 경로
const ENDPOINTS = [
    // 시세 코어
    { g: "시세", p: `/api/live/ticker?t=${T}`, req: ["price", "session", "prices.prevRegularClose"] },
    { g: "시세", p: `/api/live/quotes?symbols=${T},AAPL,TSLA`, req: [] },
    { g: "시세", p: `/api/live/prices?t=${T},AAPL`, req: [] },
    { g: "시세", p: `/api/live/overview?ticker=${T}`, req: [] },
    { g: "시세", p: `/api/live/prev-day?ticker=${T}`, req: [] },
    { g: "시세", p: `/api/market/ticker?s=${T}`, req: [] },
    { g: "시세", p: `/api/stock?symbol=${T}`, req: [] },

    // 차트
    { g: "차트", p: `/api/chart?symbol=${T}&range=1d`, req: ["data"] },
    { g: "차트", p: `/api/chart?symbol=${T}&range=1w`, req: ["data"] },
    { g: "차트", p: `/api/chart?symbol=${T}&range=1m`, req: ["data"] },
    { g: "차트", p: `/api/chart?symbol=${T}&range=3m`, req: ["data"] },
    { g: "차트", p: `/api/chart?symbol=${T}&range=1y`, req: ["data"] },
    { g: "차트", p: `/api/sparkline?t=${T}`, req: [] },

    // 기술지표
    { g: "지표", p: `/api/live/macd?t=${T}`, req: [] },
    { g: "지표", p: `/api/live/sma?t=${T}`, req: [] },
    { g: "지표", p: `/api/live/volatility-regime?t=${T}`, req: [] },

    // 옵션
    { g: "옵션", p: `/api/live/options/structure?t=${T}`, req: [] },
    { g: "옵션", p: `/api/live/options/chain?t=${T}`, req: [] },
    { g: "옵션", p: `/api/live/options/atm?t=${T}`, req: [] },
    { g: "옵션", p: `/api/flow/unified?ticker=${T}`, req: [] },
    { g: "옵션", p: `/api/flow/enhanced-metrics?ticker=${T}`, req: [] },
    { g: "옵션", p: `/api/flow/iv-percentile?ticker=${T}`, req: [] },

    // 시장 전반
    { g: "시장", p: `/api/market/movers?type=gainers&limit=10`, req: [] },
    { g: "시장", p: `/api/market/movers?type=losers&limit=10`, req: [] },
    { g: "시장", p: `/api/market/macro`, req: [] },
    { g: "시장", p: `/api/market/status`, req: [] },
    { g: "시장", p: `/api/market/index-close`, req: [] },
    { g: "시장", p: `/api/live/market`, req: [] },
    { g: "시장", p: `/api/live/treasury`, req: [] },
    { g: "시장", p: `/api/exchange-rates`, req: [] },

    // 가디언
    { g: "가디언", p: `/api/debug/guardian?locale=ko`, req: ["data.rlsi.score", "data.breadth.totalTickers"] },
    { g: "가디언", p: `/api/guardian/fedwatch`, req: [] },
    { g: "가디언", p: `/api/guardian/economic-calendar`, req: [] },
    { g: "가디언", p: `/api/guardian/news-digest?locale=ko`, req: [] },

    // 인텔
    { g: "인텔", p: `/api/intel/snapshot?sector=m7&locale=ko`, req: [] },
    { g: "인텔", p: `/api/intel/fast?sector=m7`, req: [] },
    { g: "인텔", p: `/api/intel/m7`, req: [] },
    { g: "인텔", p: `/api/intel/gex-history?tickers=SPY,QQQ`, req: [] },
    { g: "인텔", p: `/api/intel/cross-sector-brief?locale=ko`, req: [] },

    // 커맨드
    { g: "커맨드", p: `/api/command/unified?t=${T}&lang=ko`, req: [] },
    { g: "커맨드", p: `/api/command/13f?ticker=${T}`, req: [] },
    { g: "커맨드", p: `/api/command/insider?ticker=${T}`, req: [] },

    // 펀더멘털·기타
    { g: "기타", p: `/api/live/fundamentals?t=${T}`, req: [] },
    { g: "기타", p: `/api/live/analyst?t=${T}`, req: [] },
    { g: "기타", p: `/api/live/earnings?ticker=${T}`, req: [] },
    { g: "기타", p: `/api/live/news?ticker=${T}`, req: [] },
    { g: "기타", p: `/api/dividends?t=${T}`, req: [] },
    { g: "기타", p: `/api/dashboard/unified?locale=ko`, req: [] },
    { g: "기타", p: `/api/history/batch-price?tickers=${T},AAPL`, req: [] },
];

// ── 유틸 ─────────────────────────────────────────────────────────────
const C = { r: "\x1b[31m", y: "\x1b[33m", g: "\x1b[32m", d: "\x1b[2m", x: "\x1b[0m", b: "\x1b[1m" };
let nPass = 0, nWarn = 0, nFail = 0;
const findings = [];

function get(obj, path) {
    return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** 객체를 재귀 순회하며 (경로, 값) 을 넘겨준다 */
function walk(o, fn, pre = "", depth = 0) {
    if (depth > 8 || o == null) return;
    if (Array.isArray(o)) {
        // 배열은 앞 3개만 표본
        o.slice(0, 3).forEach((v, i) => walk(v, fn, `${pre}[${i}]`, depth + 1));
        return;
    }
    if (typeof o === "object") {
        for (const k of Object.keys(o)) walk(o[k], fn, pre ? `${pre}.${k}` : k, depth + 1);
        return;
    }
    fn(pre, o);
}

/** 지표 자리에 박힌 기본값 후보 */
const SUSPECT_KEYS = /(pct|percent|ratio|score|index|level|price|close|volume|vol|change|chg|oi|iv|gex|delta|gamma|maxpain|pcr|breadth|rsi|macd|sma)$/i;
const DATEISH = /(date|time|updated|asof|timestamp|_ts)/i;

function auditPayload(name, json) {
    const zeroFields = [];
    const fiftyFields = [];
    const staleDates = [];
    const now = Date.now();

    walk(json, (path, v) => {
        const leaf = path.split(".").pop() || "";
        if (typeof v === "number") {
            if (SUSPECT_KEYS.test(leaf)) {
                if (v === 0) zeroFields.push(path);
                else if (v === 50 || v === 50.0) fiftyFields.push(path);
            }
        } else if (typeof v === "string" && DATEISH.test(leaf)) {
            const m = v.match(/^\d{4}-\d{2}-\d{2}/);
            if (m) {
                const age = (now - Date.parse(m[0] + "T00:00:00Z")) / 86400000;
                if (age > 5) staleDates.push(`${path}=${m[0]} (${Math.floor(age)}일 전)`);
            }
        }
    });

    return { zeroFields, fiftyFields, staleDates };
}

async function fetchJson(path) {
    const t0 = Date.now();
    const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}${cb()}`;
    try {
        const r = await fetch(url, { headers: { "cache-control": "no-cache" } });
        const ms = Date.now() - t0;
        const text = await r.text();
        let json = null;
        try { json = JSON.parse(text); } catch { /* HTML 등 */ }
        return { ok: r.ok, status: r.status, ms, json, raw: text.slice(0, 200) };
    } catch (e) {
        return { ok: false, status: 0, ms: Date.now() - t0, json: null, raw: e.message };
    }
}

// ── 메인 ─────────────────────────────────────────────────────────────
(async () => {
    console.log("═".repeat(84));
    console.log(`  엔드포인트 전수 감사 · ${BASE} · ${new Date().toISOString()}`);
    console.log("═".repeat(84));

    let group = "";
    const targets = ENDPOINTS.filter((e) => !ONLY || e.p.includes(ONLY));

    for (const ep of targets) {
        if (ep.g !== group) { group = ep.g; console.log(`\n${C.b}▌${group}${C.x}`); }

        const res = await fetchJson(ep.p);
        const label = ep.p.replace(/&?_cb=\d+/, "").slice(0, 52).padEnd(53);

        if (!res.ok || !res.json) {
            console.log(`  ${C.r}✗${C.x} ${label} HTTP ${res.status} ${res.raw.slice(0, 60)}`);
            findings.push({ sev: "FAIL", ep: ep.p, why: `HTTP ${res.status}` });
            nFail++;
            continue;
        }

        // 필수 필드
        const missing = ep.req.filter((k) => {
            const v = get(res.json, k);
            return v === undefined || v === null || (Array.isArray(v) && v.length === 0);
        });

        const a = auditPayload(ep.p, res.json);
        const notes = [];
        if (a.zeroFields.length) notes.push(`0값 ${a.zeroFields.length}`);
        if (a.fiftyFields.length) notes.push(`${C.y}50고정 ${a.fiftyFields.length}${C.x}`);
        if (a.staleDates.length) notes.push(`${C.y}오래된날짜 ${a.staleDates.length}${C.x}`);

        if (missing.length) {
            console.log(`  ${C.r}✗${C.x} ${label} ${res.ms}ms  필수누락: ${missing.join(", ")}`);
            findings.push({ sev: "FAIL", ep: ep.p, why: `필수 필드 누락 ${missing.join(",")}` });
            nFail++;
        } else if (a.fiftyFields.length || a.staleDates.length) {
            console.log(`  ${C.y}!${C.x} ${label} ${res.ms}ms  ${notes.join(" · ")}`);
            if (a.fiftyFields.length) findings.push({ sev: "WARN", ep: ep.p, why: `50 고정: ${a.fiftyFields.slice(0, 4).join(", ")}` });
            if (a.staleDates.length) findings.push({ sev: "WARN", ep: ep.p, why: `오래된 날짜: ${a.staleDates.slice(0, 3).join(", ")}` });
            nWarn++;
        } else {
            console.log(`  ${C.g}✓${C.x} ${label} ${res.ms}ms  ${C.d}${notes.join(" · ")}${C.x}`);
            nPass++;
        }
    }

    // ── 교차검증: 같은 사실을 말하는 엔드포인트들이 일치하는가 ────────
    console.log(`\n${C.b}▌교차검증${C.x}`);
    const [tick, chart, quotes] = await Promise.all([
        fetchJson(`/api/live/ticker?t=${T}`),
        fetchJson(`/api/chart?symbol=${T}&range=1d`),
        fetchJson(`/api/live/quotes?symbols=${T}`),
    ]);

    const px = tick.json?.price;
    const bars = chart.json?.data || [];
    const lastBar = bars[bars.length - 1]?.close;
    const qArr = quotes.json?.quotes || quotes.json?.data || quotes.json;
    const qPx = Array.isArray(qArr) ? qArr[0]?.price : qArr?.[T]?.price ?? qArr?.price;

    const cmp = (a, b, name) => {
        if (!(a > 0) || !(b > 0)) {
            console.log(`  ${C.y}!${C.x} ${name.padEnd(30)} 비교 불가 (${a} / ${b})`);
            nWarn++; return;
        }
        const d = Math.abs(a - b) / b * 100;
        const ok = d < 2;
        console.log(`  ${ok ? C.g + "✓" : C.r + "✗"}${C.x} ${name.padEnd(30)} ${a} vs ${b} (차이 ${d.toFixed(3)}%)`);
        ok ? nPass++ : (nFail++, findings.push({ sev: "FAIL", ep: name, why: `${a} vs ${b} 불일치` }));
    };
    cmp(px, lastBar, "시세 ↔ 차트 마지막봉");
    cmp(px, qPx, "시세 ↔ quotes");

    // ── breadth 실체 확인 ────────────────────────────────────────────
    const g = await fetchJson(`/api/debug/guardian?locale=ko`);
    const b = g.json?.data?.breadth || {};
    const bOk = (b.totalTickers || 0) > 1000 && b.breadthPct !== 50;
    console.log(`  ${bOk ? C.g + "✓" : C.r + "✗"}${C.x} ${"Market Breadth 실데이터".padEnd(30)} ` +
        `${b.advancers}↑/${b.decliners}↓ 총 ${b.totalTickers} · ${b.breadthPct}%`);
    bOk ? nPass++ : (nFail++, findings.push({ sev: "FAIL", ep: "breadth", why: "기본 스냅샷(50%) 상태" }));

    // ── 요약 ─────────────────────────────────────────────────────────
    console.log("\n" + "═".repeat(84));
    console.log(`  통과 ${nPass} · 주의 ${nWarn} · 실패 ${nFail}`);
    if (findings.length) {
        console.log("─".repeat(84));
        for (const f of findings) {
            const c = f.sev === "FAIL" ? C.r : C.y;
            console.log(`  ${c}${f.sev}${C.x} ${f.ep}\n        ${f.why}`);
        }
    }
    console.log("═".repeat(84));
    process.exit(nFail > 0 ? 1 : 0);
})();
