#!/usr/bin/env node
/**
 * 「없는 값」이 「0 이라는 사실」로 둔갑하는 자리를 찾는다.
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 만들었나 — 실제로 당한 것들]
 *   · `let pcr = 1`            → 옵션 데이터가 없는데 화면은 «중립» 이라고 말했다
 *   · `analysis.gex || 0`      → GEX 미수집이 «감마 0» 으로 보였다
 *   · `stock.gex || 0`         → 인텔 타일 전 종목이 0
 *   · `rvol || 1.0`            → 엔진을 고쳤는데도 화면은 계속 «저조»
 *   · `avgDarkPool || 48 + …`  → 아예 다른 지표에서 값을 **합성**하고 있었다
 *
 *   공통점: 어느 것도 에러를 내지 않는다. 그래서 «그럴듯한 숫자»로 남는다.
 *   주식 앱에서 이건 오답보다 나쁘다 — 사용자가 그것을 사실로 읽는다.
 *
 * [판정 기준]
 *   측정값 성격의 식별자에 `|| <숫자>` 또는 `?? <숫자>` 가 붙으면 보고한다.
 *   0 은 «없음»이 아니라 **측정된 0** 일 수 있으므로 항상 사람이 봐야 한다.
 *
 * 사용:  node scripts/check-fake-defaults.js [--all]
 *        (기본은 지표성 필드만, --all 은 후보 전부)
 */
const fs = require("fs"), path = require("path");

/** 측정값 — 없으면 «없다»고 말해야 하는 것들 */
const METRICS = [
    "gex", "netGex", "gammaOI", "pcr", "pcrOI", "pcrVol", "maxPain", "flip", "flipLevel",
    "callWall", "putFloor", "iv", "ivRank", "ivPercentile", "skew", "rvol", "relVolume",
    "darkPool", "darkPoolPct", "shortInterest", "siPercent", "atr", "adx", "obv",
    "whaleIndex", "sweepCount", "openInterest", "oiChange", "notional", "premium",
    "changePercent", "changePct", "prevClose", "regularClose", "afterHours", "preMarket",
    "rlsi", "breadth", "mcClellan", "vix", "yield", "creditSpread", "newOiNotional",
];
const RE_METRIC = new RegExp(`\\b(${METRICS.join("|")})\\b`, "i");

const SKIP_DIR = /node_modules|\.next|\.git|dist|build|coverage|scripts\/(check|verify|test)-/;
const files = [];
(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (SKIP_DIR.test(p)) continue;
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) files.push(p);
    }
})(path.join(__dirname, "..", "src"));

const ALL = process.argv.includes("--all");
const hits = [];
// `X || 0`, `X ?? 0`, `X || 1`, `= 1;` 형태
const RE = /([A-Za-z_$][\w$.?\[\]'"]*)\s*(\|\||\?\?)\s*(-?\d+(?:\.\d+)?)\b/g;

for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    const lines = src.split("\n");
    lines.forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("*")) return;
        let m;
        RE.lastIndex = 0;
        while ((m = RE.exec(line))) {
            const [full, ident, op, num] = m;
            if (!ALL && !RE_METRIC.test(ident)) continue;
            // 명백한 비지표(길이·인덱스·개수)는 제외 — 0 이 진짜 «없음»과 같다
            if (/\b(length|index|idx|count|Count|size|page|offset|limit|width|height|top|left|ms|timeout|retry|ttl)\b/.test(ident)) continue;
            hits.push({ file: path.relative(process.cwd(), f), line: i + 1, expr: full.trim(), code: t.slice(0, 110) });
        }
    });
}

if (!hits.length) {
    console.log("✅ 지표성 필드에 가짜 기본값 없음");
    process.exit(0);
}
console.log(`⚠️  ${hits.length}건 — 「없는 값」이 숫자로 굳는 자리 (사람이 판정 필요)\n`);
const byFile = {};
for (const h of hits) (byFile[h.file] || (byFile[h.file] = [])).push(h);
for (const [f, rows] of Object.entries(byFile).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`── ${f}  (${rows.length})`);
    for (const r of rows) console.log(`   :${r.line}  ${r.expr}\n        ${r.code}`);
}
