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

// intrinioRouter 가 잡는 패턴 (소스에서 직접 읽어 어긋나지 않게)
const routerSrc = fs.readFileSync("src/services/intrinioRouter.ts", "utf8");
const exactPaths = [...routerSrc.matchAll(/path === "([^"]+)"/g)].map(m => m[1]);
const regexes = [...routerSrc.matchAll(/\/\^\\?\/[^\/]*\/[gimsuy]*/g)].map(m => m[0]);
const reLines = [...routerSrc.matchAll(/const m = (?:path|endpoint)\.match\((\/[^\n]+?\/)\)/g)].map(m => m[1]);

const files = [];
(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (/node_modules|\.next|\.git/.test(p)) continue;
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx|js)$/.test(e.name)) files.push(p);
    }
})(path.join(root, "src"));

const hits = new Map();  // endpoint -> [{file,line}]
for (const f of files) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    lines.forEach((ln, i) => {
        const m = /fetchMassive\(\s*[`'"]([^`'"]+)[`'"]/.exec(ln)
            || /fetchMassive\(\s*\n?\s*[`'"]([^`'"]+)[`'"]/.exec(ln);
        if (!m) return;
        const ep = m[1].replace(/\$\{[^}]*\}/g, "{X}");
        if (!hits.has(ep)) hits.set(ep, []);
        hits.get(ep).push(`${path.relative(root, f)}:${i + 1}`);
    });
}

const cls = (ep) => {
    const p = ep.split("?")[0];
    if (UNSUPPORTED.some(u => p.startsWith(u))) return "EMPTY";
    if (exactPaths.includes(p)) return "INTRINIO";
    // 라우터가 정규식으로 잡는 것들
    if (/^\/v2\/aggs\/ticker\//.test(p)) return "INTRINIO";
    if (/^\/v2\/snapshot\//.test(p)) return "INTRINIO";
    if (/^\/v3\/snapshot\//.test(p)) return "INTRINIO";
    if (/^\/v1\/open-close\//.test(p)) return "INTRINIO";
    if (/^\/v1\/indicators\//.test(p)) return "INTRINIO";
    return "UNKNOWN";
};

const buckets = { INTRINIO: [], EMPTY: [], UNKNOWN: [] };
for (const [ep, where] of hits) buckets[cls(ep)].push({ ep, n: where.length, where });

console.log(`fetchMassive 고유 엔드포인트 ${hits.size}종 / 호출 ${[...hits.values()].reduce((a, b) => a + b.length, 0)}건\n`);
for (const k of ["INTRINIO", "EMPTY", "UNKNOWN"]) {
    const b = buckets[k].sort((a, z) => z.n - a.n);
    console.log(`── ${k} : ${b.length}종 / ${b.reduce((a, z) => a + z.n, 0)}건`);
    for (const x of b) console.log(`   ${String(x.n).padStart(3)}×  ${x.ep}${k === "UNKNOWN" ? "   ← " + x.where.slice(0, 2).join(", ") : ""}`);
    console.log();
}
