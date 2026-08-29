#!/usr/bin/env node
/**
 * 「앱에서 비어 있는 곳」 전수 스캐너
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 필요한가]  audit-endpoints.js 는 «엔드포인트가 사는가»를 본다.
 *   그런데 대표가 실제로 보는 것은 **화면의 빈칸**이다. HTTP 200 이어도
 *   그 안의 지표가 null/0 이면 화면엔 «—» 나 «0%» 가 뜬다.
 *
 * [무엇을 보는가]  응답 트리를 끝까지 걸어 «지표로 쓰이는 잎»을 분류한다.
 *   · null/undefined  → 빈칸 (의도된 것일 수도 있다)
 *   · 0               → «없음»인지 «진짜 0»인지 구분이 필요한 값
 *   · 고정 상수(50 등) → 기본값이 지표 자리에 박힌 것
 *   · 빈 배열/객체     → 리스트 화면이 통째로 빔
 *
 *   가격·수량처럼 0 이 정상인 필드, id/문자열은 제외한다.
 *
 * [면제 목록]  «지금은 못 재는 게 맞다»고 확인된 것들. 여기 없는데 비어 있으면
 *   그건 버그다. 면제 목록 자체가 이관 상태의 기록이다.
 *
 * 사용: node scripts/audit-empty-fields.js [--base URL] [--json out.json]
 */

const BASE = (() => { const i = process.argv.indexOf("--base"); return i > 0 ? process.argv[i + 1] : "https://www.signumhq.com"; })();
const JSON_OUT = (() => { const i = process.argv.indexOf("--json"); return i > 0 ? process.argv[i + 1] : null; })();
const T = "NVDA";

const C = { r: "\x1b[31m", y: "\x1b[33m", g: "\x1b[32m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m" };

/** 못 재는 게 맞다고 확인된 것 — 근거를 같이 적는다 */
const EXPECTED_EMPTY = [
    [/darkPool|dark_pool|dpRatio|avgDarkPool|isDarkpool/i, "틱 데이터 미제공 (market_center/sales_conditions 없음)"],
    [/blockTrade|block_trade/i, "체결 틱 미제공"],
    [/shortVol|short_volume|shortInterest|siPercent|daysToCover|siChange/i, "공매도 잔고/거래량 403 (플랜 외)"],
    [/\.insights$|\bkeywords$/i, "FMP 뉴스는 종목별 감성분석 미제공 — 지어내지 않고 빈 배열"],
    [/payDate|recordDate|declarationDate/i, "Intrinio 배당은 배당락일만 제공"],
    [/rvol|currentVol|baselineVol/i, "정규장 지표 — 장 밖에선 측정 안 함(null)"],
    [/todayChange|change$/i, "휴장 중에는 «오늘 변화»가 없다"],
    [/breadth|advancers|decliners|unchanged|totalTickers/i, "정규장 지표 — 직전 정규장 값 또는 중립"],
];

const ENDPOINTS = [
    ["시세", `/api/live/ticker?t=${T}`],
    ["시세", `/api/live/overview?ticker=${T}`],
    ["커맨드", `/api/command/unified?t=${T}&lang=ko`],
    ["커맨드", `/api/command/insider?ticker=${T}`],
    ["커맨드", `/api/command/13f?ticker=${T}`],
    ["옵션", `/api/live/options/structure?t=${T}`],
    ["옵션", `/api/flow/unified?ticker=${T}`],
    ["옵션", `/api/flow/enhanced-metrics?ticker=${T}`],
    ["옵션", `/api/flow/iv-percentile?ticker=${T}`],
    ["플로우", `/api/flow/dark-pool-trades?ticker=${T}`],
    ["플로우", `/api/flow/realtime-metrics?ticker=${T}`],
    ["펀더멘털", `/api/live/fundamentals?t=${T}`],
    ["펀더멘털", `/api/live/analyst?t=${T}`],
    ["펀더멘털", `/api/live/earnings?t=${T}`],
    ["펀더멘털", `/api/dividends?t=${T}`],
    ["지표", `/api/live/sma?t=${T}`],
    ["지표", `/api/live/macd?t=${T}`],
    ["지표", `/api/live/short-squeeze?t=${T}`],
    ["지표", `/api/live/volatility-regime?t=${T}`],
    ["시장", `/api/market/macro`],
    ["시장", `/api/market/movers?type=gainers&limit=10`],
    ["시장", `/api/live/treasury`],
    ["가디언", `/api/debug/guardian?locale=ko`],
    ["가디언", `/api/guardian/fedwatch`],
    ["인텔", `/api/intel/fast?sector=semis`],
    ["대시보드", `/api/dashboard/unified?locale=ko`],
];

async function get(url) {
    const t0 = Date.now();
    try {
        const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(35000) });
        const txt = await r.text();
        let j = null; try { j = JSON.parse(txt); } catch { }
        return { ok: r.ok, status: r.status, ms: Date.now() - t0, j, txt };
    } catch (e) {
        return { ok: false, status: 0, ms: Date.now() - t0, j: null, txt: String(e.message) };
    }
}

/** 지표로 쓰이는 숫자 잎만 본다 — id·타임스탬프·문자열은 제외 */
const SKIP_KEY = /^(_|id$|.*Id$|.*_id$|ticker|symbol|name|title|url|href|locale|lang|status|source|version|timestamp|_ts|updated|date|.*Date$|.*At$|color|icon|type|code|key)/i;

function walk(node, path, acc, depth = 0) {
    if (depth > 8) return;
    if (node === null || node === undefined) { acc.nulls.push(path); return; }
    if (Array.isArray(node)) {
        if (node.length === 0) { acc.emptyArrays.push(path); return; }
        // 배열은 첫 요소만 대표로 (같은 스키마 가정)
        walk(node[0], `${path}[0]`, acc, depth + 1);
        return;
    }
    if (typeof node === "object") {
        const keys = Object.keys(node);
        if (keys.length === 0) { acc.emptyObjects.push(path); return; }
        for (const k of keys) {
            if (SKIP_KEY.test(k)) continue;
            walk(node[k], path ? `${path}.${k}` : k, acc, depth + 1);
        }
        return;
    }
    if (typeof node === "number") {
        if (node === 0) acc.zeros.push(path);
        else if (node === 50) acc.fifties.push(path);
    }
}

function classify(path) {
    for (const [re, why] of EXPECTED_EMPTY) if (re.test(path)) return why;
    return null;
}

(async () => {
    console.log("═".repeat(100));
    console.log(`  «비어 있는 곳» 전수 스캔 · ${BASE} · ${new Date().toISOString()}`);
    console.log("═".repeat(100));

    const report = [];
    let unexplained = 0;

    for (const [group, path] of ENDPOINTS) {
        const r = await get(BASE + path);
        if (!r.ok || !r.j) {
            console.log(`${C.r}✗${C.x} ${group.padEnd(6)} ${path.padEnd(52)} HTTP ${r.status} ${String(r.txt).slice(0, 50)}`);
            report.push({ group, path, status: r.status, error: true });
            continue;
        }
        const acc = { nulls: [], zeros: [], fifties: [], emptyArrays: [], emptyObjects: [] };
        walk(r.j, "", acc);

        const suspicious = [];
        for (const [kind, list] of [["null", acc.nulls], ["0", acc.zeros], ["50", acc.fifties], ["[]", acc.emptyArrays], ["{}", acc.emptyObjects]]) {
            for (const p of list) {
                const why = classify(p);
                if (!why) suspicious.push({ kind, path: p });
            }
        }
        unexplained += suspicious.length;

        const tag = suspicious.length === 0 ? `${C.g}✓${C.x}`
            : suspicious.length <= 3 ? `${C.y}!${C.x}` : `${C.r}!${C.x}`;
        const counts = `${C.d}null ${acc.nulls.length} · 0 ${acc.zeros.length} · [] ${acc.emptyArrays.length}${C.x}`;
        console.log(`${tag} ${group.padEnd(6)} ${path.padEnd(52)} ${String(r.ms).padStart(5)}ms  ${counts}`);
        if (suspicious.length) {
            for (const s of suspicious.slice(0, 12)) console.log(`      ${C.y}${s.kind.padEnd(4)}${C.x} ${s.path}`);
            if (suspicious.length > 12) console.log(`      ${C.d}… 외 ${suspicious.length - 12}개${C.x}`);
        }
        report.push({ group, path, ms: r.ms, ...acc, suspicious });
    }

    console.log("═".repeat(100));
    console.log(`  설명되지 않는 빈칸 합계: ${unexplained === 0 ? C.g + "0" + C.x : C.y + unexplained + C.x}`);
    console.log(`  (면제 규칙 ${EXPECTED_EMPTY.length}개 — «지금은 못 재는 게 맞다»고 확인된 것들)`);
    console.log("═".repeat(100));

    if (JSON_OUT) {
        require("fs").writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
        console.log(`JSON → ${JSON_OUT}`);
    }
})();
