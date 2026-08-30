#!/usr/bin/env node
/**
 * 아직 Massive 를 타는 호출부를 전수로 찾는다.
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 필요한가]
 *   Massive 계정은 2026-09-23 에 해지된다. 그런데 남은 경로들은 **오늘
 *   전부 HTTP 200 이다** — 시세 권한만 403 이었고 나머지는 살아 있다.
 *   즉 화면상 아무 이상이 없어서 «다 이관됐다»고 착각하기 쉽고,
 *   해지일에 8개 화면이 동시에 죽는다.
 *
 *   실측(2026-08-30): 고유 32종 / 호출 83건 중 **10종 18건**이 미이관.
 *     /fed/v1/treasury-yields · /fed/v1/inflation · financials · filings
 *     · risk-factors · /v3/reference/tickers/{t} · aggs/grouped · v3/snapshot
 *
 * 사용:  node scripts/check-massive-leftovers.js
 *        UNKNOWN 이 0 이 되면 이관 완료.
 */
const fs = require("fs"), path = require("path");
const root = process.cwd();

const UNSUPPORTED = ["/stocks/v1/short-volume", "/v3/reference/conditions",
    "/stocks/v1/short-interest", "/v1/related-companies", "/v3/trades",
    "/v3/quotes", "/v2/last/trade"];

// ── 라우터가 «실제로» 잡는 패턴을 소스에서 읽는다 ──────────────────
//    ⚠️ 손으로 적으면 반드시 어긋난다. 실제로 어긋났다(2026-08-30):
//       /v3/reference/tickers/{t} 는 라우터가 처리하고 있었는데
//       분류기의 손으로 적은 목록에 없어서 «미이관»으로 셌다.
const routerSrc = fs.readFileSync("src/services/intrinioRouter.ts", "utf8");

// (a) 정확일치:  path === "/x/y"
const exactPaths = [...routerSrc.matchAll(/path === "([^"]+)"/g)].map((m) => m[1]);
// (b) 정규식 분기 — 라우터는 두 가지 형태를 쓴다:
//       path.match(/^\/v2\/aggs\/.../)   ·   /^\/v2\/snapshot\/.../.test(path)
//     한쪽만 보면 또 어긋난다(실제로 «일괄 스냅샷 7건»을 미이관으로 셌다).
const rePatterns = [
    ...[...routerSrc.matchAll(/path\.match\((\/\^[^\n]*?\/)\)/g)].map((m) => m[1]),
    ...[...routerSrc.matchAll(/(\/\^[^\n]*?\/)\.test\(path\)/g)].map((m) => m[1]),
]
    .map((lit) => { try { return new RegExp(lit.slice(1, -1)); } catch { return null; } })
    .filter(Boolean);

const files = [];
(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        // massiveClient 는 «어댑터 자신»이다 — 소비처가 아니므로 센다면 오탐이다
        if (/node_modules|\.next|\.git|services\/massiveClient\.ts/.test(p)) continue;
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx|js)$/.test(e.name)) files.push(p);
    }
})(path.join(root, "src"));

const hits = new Map();
for (const f of files) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    lines.forEach((ln, i) => {
        const m = /fetchMassive\(\s*[`'"]([^`'"]+)[`'"]/.exec(ln);
        if (!m) return;
        // 템플릿 자리(`${...}`)는 라우터 정규식이 판정할 수 있게 채워야 한다.
        // 자리마다 기대 타입이 다르다 — 티커는 [^/]+, 날짜는 [\d-]+ 다.
        // 한 값으로 채우면 오탐이 난다(«/v1/open-close/X/X» 가 그랬다).
        // 그래서 두 벌을 만들어 «하나라도 맞으면 이관됨»으로 본다.
        const ep = m[1].replace(/\$\{[^}]*\}/g, "X");
        if (!hits.has(ep)) hits.set(ep, []);
        hits.get(ep).push(`${path.relative(root, f)}:${i + 1}`);
    });
}

const cls = (ep) => {
    const bare = ep.split("?")[0];
    if (UNSUPPORTED.some((u) => bare.startsWith(u))) return "EMPTY";
    if (exactPaths.includes(bare)) return "INTRINIO";
    // X 자리를 날짜로도 한 번 시도한다 (open-close · aggs 의 날짜 인자)
    const variants = [bare, bare.replace(/\bX\b/g, "2026-01-01")];
    if (rePatterns.some((re) => variants.some((v) => re.test(v)))) return "INTRINIO";
    return "UNKNOWN";
};

const buckets = { INTRINIO: [], EMPTY: [], UNKNOWN: [] };
for (const [ep, where] of hits) buckets[cls(ep)].push({ ep, n: where.length, where });

const total = [...hits.values()].reduce((a, b) => a + b.length, 0);
console.log(`fetchMassive 고유 ${hits.size}종 / 호출 ${total}건`);
console.log(`라우터 패턴: 정확일치 ${exactPaths.length}개 · 정규식 ${rePatterns.length}개\n`);
for (const k of ["INTRINIO", "EMPTY", "UNKNOWN"]) {
    const b = buckets[k].sort((a, z) => z.n - a.n);
    if (!b.length) { console.log(`── ${k} : 0\n`); continue; }
    console.log(`── ${k} : ${b.length}종 / ${b.reduce((a, z) => a + z.n, 0)}건`);
    for (const x of b) {
        console.log(`   ${String(x.n).padStart(3)}x  ${x.ep}`);
        if (k === "UNKNOWN") for (const w of x.where) console.log(`         ${w}`);
    }
    console.log();
}
if (buckets.UNKNOWN.length) process.exit(1);
