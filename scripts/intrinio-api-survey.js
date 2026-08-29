#!/usr/bin/env node
/**
 * Intrinio API 전수 실측 조사기
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜]  대표 지시: «모든 API 엔드포인트를 직접 때려보고 들어오는 데이터의
 *       질이 어떤지 보고. 사용할 수 있는 것과 새롭게 할 수 있는 부분을 파악.»
 *
 * [무엇을 보는가]  «200 이 왔다» 로는 아무것도 알 수 없다. 다음을 본다.
 *   1) 접근 가능 여부      — 200 / 401 / 403 / 404
 *   2) 실제 레코드 수      — 200 인데 빈 배열인 경우가 흔하다
 *   3) 신선도              — 최신 날짜가 며칠 전인가 (T+1? T+30?)
 *   4) 필드 충실도         — 필드는 있는데 전부 null 인 경우(라이선스 강등)
 *   5) 우리에게 새로운가   — Massive 에 없던 것인가
 *
 * 사용:
 *   KEY_FILE=<키파일> node scripts/intrinio-api-survey.js [--family 이름] [--json 출력경로]
 */

const fs = require("fs");
const https = require("https");

const KEY = (() => {
    if (process.env.INTRINIO_API_KEY) return process.env.INTRINIO_API_KEY.trim();
    const f = process.env.KEY_FILE;
    if (f && fs.existsSync(f)) return fs.readFileSync(f, "utf8").trim();
    console.error("INTRINIO_API_KEY 또는 KEY_FILE 필요");
    process.exit(1);
})();

const BASE = "https://api-v2.intrinio.com";
const FAMILY = (() => { const i = process.argv.indexOf("--family"); return i > 0 ? process.argv[i + 1] : null; })();
const JSON_OUT = (() => { const i = process.argv.indexOf("--json"); return i > 0 ? process.argv[i + 1] : null; })();

const TICKER = "AAPL";        // 대형주 — 커버리지가 가장 좋은 케이스
const TICKER2 = "NVDA";
const ETF = "SPY";
const today = new Date().toISOString().slice(0, 10);
const ago = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

// ── 레이트 제어 (2,000/분 한도. 조사기는 여유 있게 600/분) ──────────
let last = 0;
const MIN_GAP_MS = 100;
async function gate() {
    const now = Date.now();
    const wait = Math.max(0, last + MIN_GAP_MS - now);
    last = now + wait;
    if (wait) await new Promise((r) => setTimeout(r, wait));
}

function get(path) {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${BASE}/${path.replace(/^\//, "")}${sep}api_key=${encodeURIComponent(KEY)}`;
    return new Promise((resolve) => {
        const t0 = Date.now();
        const req = https.get(url, { timeout: 25000 }, (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => {
                const raw = Buffer.concat(chunks).toString("utf8");
                let json = null;
                try { json = JSON.parse(raw); } catch { }
                resolve({ status: res.statusCode, ms: Date.now() - t0, json, raw });
            });
        });
        req.on("timeout", () => { req.destroy(); resolve({ status: 0, ms: 25000, json: null, raw: "timeout" }); });
        req.on("error", (e) => resolve({ status: 0, ms: Date.now() - t0, json: null, raw: e.message }));
    });
}

// ── 응답 품질 분석 ──────────────────────────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

/** 응답에서 «레코드 배열» 을 찾는다 (Intrinio 는 키 이름이 제각각) */
function findRecords(j) {
    if (!j || typeof j !== "object") return null;
    let best = null;
    for (const [k, v] of Object.entries(j)) {
        if (Array.isArray(v) && (best === null || v.length > best.rows.length)) {
            best = { key: k, rows: v };
        }
    }
    return best;
}

/** 값이 실제로 채워져 있는가 — 필드는 있는데 전부 null 인 라이선스 강등 탐지 */
function fieldFill(rows) {
    if (!rows || !rows.length) return null;
    const sample = rows.slice(0, 20).filter((r) => r && typeof r === "object");
    if (!sample.length) return null;
    const keys = new Set();
    sample.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
    let filled = 0, total = 0, empties = [];
    for (const k of keys) {
        let has = 0;
        for (const r of sample) {
            const v = r[k];
            if (v !== null && v !== undefined && v !== "" && !(typeof v === "string" && !v.trim())) has++;
        }
        total++;
        if (has > 0) filled++; else empties.push(k);
    }
    return { fields: total, filled, empties: empties.slice(0, 6) };
}

/** 가장 최근 날짜를 찾아 신선도(일)를 잰다 */
function freshness(j) {
    let newest = "";
    const walk = (o, d = 0) => {
        if (d > 5 || o == null) return;
        if (Array.isArray(o)) { o.slice(0, 40).forEach((x) => walk(x, d + 1)); return; }
        if (typeof o === "object") { for (const v of Object.values(o)) walk(v, d + 1); return; }
        if (typeof o === "string" && DATE_RE.test(o)) {
            const d10 = o.slice(0, 10);
            if (d10 > newest && d10 <= today) newest = d10;
        }
    };
    walk(j);
    if (!newest) return null;
    const days = Math.round((Date.parse(today) - Date.parse(newest)) / 86400000);
    return { newest, days };
}

// ── 조사 대상 카탈로그 ──────────────────────────────────────────────
// note: Massive(Polygon) 에 없던 것 / 우리가 아직 안 쓰는 것을 표시
const CATALOG = [
    // ═══ 시세 ═══
    ["시세", "realtime 시세", `securities/${TICKER}/prices/realtime`, "사용중"],
    ["시세", "일봉", `securities/${TICKER}/prices?page_size=5`, "사용중"],
    ["시세", "분봉(정규장만)", `securities/${TICKER}/prices/intervals?interval_size=1m&start_date=${ago(4)}&end_date=${today}&page_size=10`, "사용중"],
    ["시세", "전종목 호가 스냅샷", `securities/snapshots`, "사용중"],
    ["시세", "가격 조정(분할/배당)", `securities/${TICKER}/prices/adjustments?page_size=5`, "★신규"],
    ["시세", "증권 검색", `securities/search?query=apple&page_size=3`, "★신규"],
    ["시세", "증권 스크리너", `securities/screen?page_size=3`, "★신규"],
    ["시세", "증권 메타", `securities/${TICKER}`, "사용중"],
    ["시세", "거래소 목록", `stock_exchanges?page_size=5`, "★신규"],
    ["시세", "거래소별 증권", `stock_exchanges/USCOMP/securities?page_size=3`, "★신규"],

    // ═══ 기업/펀더멘털 ═══
    ["기업", "회사 개요", `companies/${TICKER}`, "★신규"],
    ["기업", "회사 검색", `companies/search?query=nvidia&page_size=3`, "★신규"],
    ["기업", "회사 뉴스", `companies/${TICKER}/news?page_size=5`, "★신규(뉴스 대안!)"],
    ["기업", "전체 뉴스", `companies/news?page_size=5`, "★신규(뉴스 대안!)"],
    ["기업", "펀더멘털 목록", `companies/${TICKER}/fundamentals?page_size=5`, "★신규"],
    ["기업", "필터된 펀더멘털", `companies/${TICKER}/fundamentals?statement_code=income_statement&fiscal_period=Q1&page_size=3`, "★신규"],
    ["기업", "데이터포인트(시총)", `companies/${TICKER}/data_point/marketcap/number`, "★신규"],
    ["기업", "데이터포인트(PER)", `companies/${TICKER}/data_point/pricetoearnings/number`, "★신규"],
    ["기업", "과거 데이터(시총)", `companies/${TICKER}/historical_data/marketcap?page_size=5`, "★신규"],
    ["기업", "공시 목록", `companies/${TICKER}/filings?page_size=5`, "★신규"],
    ["기업", "내부자 거래", `companies/${TICKER}/insider_transaction_filings?page_size=5`, "★신규"],
    ["기업", "데이터 태그 목록", `data_tags?page_size=5`, "★신규"],
    ["기업", "기업 이벤트", `companies/${TICKER}/answers?query=revenue`, "★신규"],

    // ═══ 재무제표 ═══
    ["재무", "표준화 재무제표", `fundamentals/${TICKER}-income_statement-2025-FY/standardized_financials`, "★신규"],
    ["재무", "보고 재무제표", `fundamentals/${TICKER}-income_statement-2025-FY/reported_financials`, "★신규"],
    ["재무", "펀더멘털 상세", `fundamentals/${TICKER}-income_statement-2025-FY`, "★신규"],

    // ═══ 옵션 ═══
    ["옵션", "만기 목록", `options/expirations/${TICKER}/eod?after=${today}`, "사용중"],
    ["옵션", "EOD 체인", `options/chain/${TICKER}/__EXP__/eod`, "사용중"],
    ["옵션", "실시간 체인", `options/chain/${TICKER}/__EXP__/realtime`, "확인"],
    ["옵션", "계약 목록", `options/${TICKER}?page_size=5`, "★신규"],
    ["옵션", "계약 EOD 가격", `options/prices/__CONTRACT__/eod?page_size=3`, "★신규"],
    ["옵션", "계약 실시간", `options/prices/__CONTRACT__/realtime`, "확인"],
    ["옵션", "이상거래(UOA)", `options/unusual_activity/${TICKER}`, "확인"],
    ["옵션", "전체 UOA", `options/unusual_activity`, "확인"],
    ["옵션", "옵션 집계", `options/aggregates?page_size=3`, "★신규"],
    ["옵션", "옵션 스냅샷", `options/snapshots`, "★신규"],
    ["옵션", "만기별 통계", `options/stats/${TICKER}/__EXP__/eod`, "★신규"],
    ["옵션", "인터벌 무브먼트", `options/intervals/movement/${TICKER}?page_size=3`, "★신규"],

    // ═══ ETF ═══
    ["ETF", "ETF 목록", `etfs?page_size=5`, "★신규"],
    ["ETF", "ETF 메타", `etfs/${ETF}`, "★신규"],
    ["ETF", "ETF 보유종목", `etfs/${ETF}/holdings?page_size=10`, "★★신규(섹터 정확도!)"],
    ["ETF", "ETF 애널리틱스", `etfs/${ETF}/analytics`, "★신규"],
    ["ETF", "ETF 통계", `etfs/${ETF}/stats`, "★신규"],

    // ═══ 지수 ═══
    ["지수", "주식지수 목록", `indices/stock_market?page_size=5`, "★신규"],
    ["지수", "주식지수 상세", `indices/stock_market/$DJI`, "★신규"],
    ["지수", "경제지표 목록", `indices/economic?page_size=5`, "★신규"],
    ["지수", "경제지표 데이터", `indices/economic/$GDP/historical_data/level?page_size=5`, "★신규(FRED 대안)"],
    ["지수", "SIC 산업지수", `indices/sic?page_size=5`, "★신규"],

    // ═══ 소유/기관 ═══
    ["소유", "소유자 목록", `owners?page_size=5`, "★신규"],
    ["소유", "기관 보유(13F)", `owners/__OWNER__/institutional_holdings?page_size=5`, "★★신규(13F!)"],
    ["소유", "증권별 기관보유", `securities/${TICKER}/institutional_ownership?page_size=5`, "★★신규(13F!)"],
    ["소유", "내부자 소유", `securities/${TICKER}/insider_ownership?page_size=5`, "★신규"],

    // ═══ Zacks (애널리스트) ═══
    ["Zacks", "애널리스트 등급", `zacks/analyst_ratings?identifier=${TICKER}&page_size=3`, "★★신규"],
    ["Zacks", "EPS 추정", `zacks/eps_estimates?identifier=${TICKER}&page_size=3`, "★★신규"],
    ["Zacks", "EPS 서프라이즈", `zacks/eps_surprises?page_size=3`, "★★신규"],
    ["Zacks", "매출 추정", `zacks/sales_estimates?identifier=${TICKER}&page_size=3`, "★★신규"],
    ["Zacks", "목표주가", `zacks/target_price_consensuses?identifier=${TICKER}&page_size=3`, "★★신규"],
    ["Zacks", "장기성장률", `zacks/long_term_growth_rates?identifier=${TICKER}&page_size=3`, "★신규"],
    ["Zacks", "ETF 보유", `zacks/etf_holdings?etf_ticker=${ETF}&page_size=5`, "★신규"],
    ["Zacks", "기관 보유", `zacks/institutional_holdings?ticker=${TICKER}&page_size=3`, "★신규"],

    // ═══ 공시 ═══
    ["공시", "전체 공시", `filings?page_size=5`, "★신규"],
    ["공시", "공시 노트", `filings/notes?page_size=3`, "★신규"],
    ["공시", "내부자 공시", `insider_transaction_filings?page_size=5`, "★신규"],

    // ═══ ESG ═══
    ["ESG", "ESG 회사", `esg/companies?page_size=3`, "★신규"],
    ["ESG", "ESG 종합점수", `esg/companies/${TICKER}/comprehensive_ratings?page_size=3`, "★신규"],

    // ═══ 외환/암호화폐 ═══
    ["외환", "통화쌍", `forex/pairs?page_size=5`, "★신규"],
    ["외환", "환율 가격", `forex/prices/EURUSD/D1?page_size=3`, "★신규(환율 대안)"],
    ["암호", "암호화폐 가격", `crypto/prices?page_size=3`, "★신규"],
    ["암호", "암호화폐 페어", `crypto/pairs?page_size=5`, "★신규"],

    // ═══ 기술지표 ═══
    ["기술", "SMA", `securities/${TICKER}/prices/technicals/sma?period=50&page_size=3`, "사용중"],
    ["기술", "RSI", `securities/${TICKER}/prices/technicals/rsi?period=14&page_size=3`, "사용중"],
    ["기술", "MACD", `securities/${TICKER}/prices/technicals/macd?page_size=3`, "사용중"],
    ["기술", "볼린저밴드", `securities/${TICKER}/prices/technicals/bb?page_size=3`, "★신규"],
    ["기술", "ATR", `securities/${TICKER}/prices/technicals/atr?page_size=3`, "★신규"],
    ["기술", "ADX", `securities/${TICKER}/prices/technicals/adx?page_size=3`, "★신규"],
    ["기술", "OBV", `securities/${TICKER}/prices/technicals/obv?page_size=3`, "★신규"],
    ["기술", "스토캐스틱", `securities/${TICKER}/prices/technicals/stoch?page_size=3`, "★신규"],
    ["기술", "지표 목록", `securities/prices/technicals`, "★신규"],

    // ═══ 시장 상태/기타 ═══
    ["기타", "벌크 다운로드", `bulk_downloads/links`, "사용중"],
    ["기타", "배당(증권)", `securities/${TICKER}/dividends?page_size=3`, "확인"],
    ["기타", "실적일정", `securities/${TICKER}/earnings?page_size=3`, "확인"],
    ["기타", "주식분할", `securities/${TICKER}/stock_price_adjustments?page_size=3`, "확인"],
    ["기타", "시장 상태", `securities/${TICKER2}/prices/realtime?source=iex`, "확인"],
];

// ── 실행 ────────────────────────────────────────────────────────────
const C = { r: "\x1b[31m", y: "\x1b[33m", g: "\x1b[32m", d: "\x1b[2m", x: "\x1b[0m", b: "\x1b[1m", c: "\x1b[36m" };

(async () => {
    console.log("═".repeat(112));
    console.log(`  Intrinio API 전수 실측 · ${new Date().toISOString()} · 대상 ${CATALOG.length}개`);
    console.log("═".repeat(112));

    // 동적 치환값 확보 (만기 · 계약코드 · 소유자ID)
    let EXP = "", CONTRACT = "", OWNER = "";
    await gate();
    const e = await get(`options/expirations/${TICKER}/eod?after=${today}`);
    EXP = ((e.json && e.json.expirations) || []).slice().sort()[0] || "";
    if (EXP) {
        await gate();
        const ch = await get(`options/chain/${TICKER}/${EXP}/eod`);
        const first = ((ch.json && ch.json.chain) || [])[0];
        CONTRACT = (first && first.option && first.option.code) || "";
    }
    await gate();
    const ow = await get(`owners?page_size=1`);
    OWNER = (((ow.json && ow.json.owners) || [])[0] || {}).id || "";
    console.log(`  치환값 — 만기 ${EXP || "없음"} · 계약 ${CONTRACT || "없음"} · 소유자 ${OWNER || "없음"}\n`);

    const results = [];
    let fam = "";
    for (const [family, name, pathTpl, tag] of CATALOG) {
        if (FAMILY && family !== FAMILY) continue;
        if (family !== fam) { fam = family; console.log(`\n${C.b}▌${family}${C.x}`); }

        const path = pathTpl
            .replace("__EXP__", EXP)
            .replace("__CONTRACT__", CONTRACT)
            .replace("__OWNER__", OWNER);
        if (path.includes("__")) {
            console.log(`  ${C.d}—  ${name.padEnd(22)} 치환값 없음 — 건너뜀${C.x}`);
            continue;
        }

        await gate();
        const r = await get(path);
        const rec = findRecords(r.json);
        const fill = rec ? fieldFill(rec.rows) : null;
        const fresh = freshness(r.json);

        let mark, detail;
        if (r.status === 200) {
            const n = rec ? rec.rows.length : (r.json && typeof r.json === "object" ? 1 : 0);
            if (n === 0) { mark = `${C.y}빈값${C.x}`; detail = "200 인데 레코드 0"; }
            else {
                mark = `${C.g}OK  ${C.x}`;
                const parts = [`${n}건`];
                if (rec) parts.push(`[${rec.key}]`);
                if (fill) parts.push(`필드 ${fill.filled}/${fill.fields}` + (fill.empties.length ? ` 빈:${fill.empties.slice(0, 3).join(",")}` : ""));
                if (fresh) parts.push(`최신 ${fresh.newest}(${fresh.days}일전)`);
                detail = parts.join(" · ");
            }
        } else {
            mark = `${C.r}${String(r.status).padEnd(4)}${C.x}`;
            const msg = (r.json && (r.json.message || r.json.error)) || r.raw.slice(0, 70);
            detail = String(msg).slice(0, 78);
        }

        console.log(`  ${mark} ${name.padEnd(22)} ${C.c}${tag.padEnd(18)}${C.x} ${detail}`);
        results.push({
            family, name, tag, path, status: r.status, ms: r.ms,
            records: rec ? rec.rows.length : null,
            recordKey: rec ? rec.key : null,
            fieldsFilled: fill ? `${fill.filled}/${fill.fields}` : null,
            emptyFields: fill ? fill.empties : null,
            newest: fresh ? fresh.newest : null,
            ageDays: fresh ? fresh.days : null,
            sample: rec && rec.rows[0] ? JSON.stringify(rec.rows[0]).slice(0, 400) : (r.json ? JSON.stringify(r.json).slice(0, 400) : null),
        });
    }

    // ── 요약 ────────────────────────────────────────────────────────
    const ok = results.filter((x) => x.status === 200 && (x.records === null || x.records > 0));
    const empty = results.filter((x) => x.status === 200 && x.records === 0);
    const denied = results.filter((x) => x.status === 403 || x.status === 401);
    const missing = results.filter((x) => x.status === 404);
    const other = results.filter((x) => ![200, 401, 403, 404].includes(x.status));

    console.log("\n" + "═".repeat(112));
    console.log(`  사용 가능 ${ok.length} · 빈값 ${empty.length} · 권한없음 ${denied.length} · 미존재 ${missing.length} · 기타 ${other.length}`);
    console.log("═".repeat(112));

    const newUsable = ok.filter((x) => x.tag.includes("신규"));
    if (newUsable.length) {
        console.log(`\n${C.b}▌새로 쓸 수 있는 것 (${newUsable.length}개)${C.x}`);
        for (const x of newUsable) {
            console.log(`  ${C.g}✓${C.x} ${x.family}/${x.name.padEnd(22)} ${x.records ?? "-"}건 · 필드 ${x.fieldsFilled || "-"}` +
                (x.ageDays != null ? ` · ${x.ageDays}일전` : ""));
        }
    }

    if (JSON_OUT) {
        fs.writeFileSync(JSON_OUT, JSON.stringify(results, null, 2));
        console.log(`\n상세 결과 → ${JSON_OUT}`);
    }
})();
