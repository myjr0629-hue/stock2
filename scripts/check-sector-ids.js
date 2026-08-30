#!/usr/bin/env node
/**
 * 「쓰는 쪽」과 「읽는 쪽」의 섹터 id 가 같은지 검사한다.
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 만들었나 — 실제로 3개 섹터가 죽어 있었다]
 *   vercel.json 크론:  cloud_fortress · fintech_pulse · quantum_edge
 *   src/configs/*   :  cloudfortress  · fintechpulse  · quantumedge
 *
 *   나머지 7개는 우연히 일치해서 「어떤 섹터는 나오고 어떤 섹터는 안 나온다」
 *   로 보였고, 원인이 데이터가 아니라 **이름**이라는 게 안 보였다.
 *   404 는 에러 로그에도 안 남는다 — 화면은 그냥 비어 있었다.
 *
 * 사용:  node scripts/check-sector-ids.js
 */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");

// ── 쓰는 쪽: vercel.json 크론 ──────────────────────────────────────
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const written = new Set();
for (const c of vercel.crons || []) {
    const m = /\/api\/cron\/snapshot\?sector=([\w-]+)/.exec(c.path || "");
    if (m) written.add(m[1]);
}

// ── 읽는 쪽: src/configs/*.config.ts 의 id ────────────────────────
const cfgDir = path.join(root, "src", "configs");
const read = new Map();   // id -> 파일명
for (const f of fs.readdirSync(cfgDir).filter((f) => f.endsWith(".config.ts"))) {
    const src = fs.readFileSync(path.join(cfgDir, f), "utf8");
    const m = /^\s*id:\s*['"]([^'"]+)['"]/m.exec(src);
    if (m) read.set(m[1], f);
}

// ── 조회 쪽 별칭표 — 이 표에 실린 짝은 API 가 알아서 해석한다 ──────
//    (src/app/api/intel/snapshot/route.ts 의 SECTOR_ID_ALIASES 와 같은 내용)
const routeSrc = fs.readFileSync(
    path.join(root, "src", "app", "api", "intel", "snapshot", "route.ts"), "utf8");
const aliasBlock = /SECTOR_ID_ALIASES[^=]*=\s*\{([^}]*)\}/s.exec(routeSrc);
const alias = new Map();
if (aliasBlock) {
    for (const m of aliasBlock[1].matchAll(/(\w+)\s*:\s*['"]([^'"]+)['"]/g)) alias.set(m[1], m[2]);
}
/** 규칙(언더바 빼기) + 별칭표로 도달 가능한 이름들 */
const reachable = (id) => new Set([id, id.replace(/_/g, ""), alias.get(id) || ""].filter(Boolean));

const missing = [...read.keys()].filter((id) => ![...reachable(id)].some((x) => written.has(x)));
const aliased = [...read.keys()].filter(
    (id) => !written.has(id) && [...reachable(id)].some((x) => written.has(x)));
const orphan = [...written].filter(
    (id) => !read.has(id) && ![...read.keys()].some((r) => reachable(r).has(id)));

console.log(`  섹터 id 대조 · 크론 ${written.size}개 · 설정 ${read.size}개`);
console.log("=".repeat(72));

if (aliased.length) {
    // 실패는 아니다 — 조회 쪽이 해석해 준다. 다만 「같지 않다」는 사실은 계속 보인다.
    console.log(`\n  \x1b[33m표기가 다르지만 별칭으로 해결됨 (${aliased.length}개)\x1b[0m`);
    for (const id of aliased) {
        const hit = [...reachable(id)].find((x) => written.has(x));
        console.log(`    ${id.padEnd(18)} → 크론 '${hit}'   (${read.get(id)})`);
    }
}
if (!missing.length && !orphan.length) {
    console.log(`\n  \x1b[32m조회 가능한 섹터 ${read.size}/${read.size}\x1b[0m`);
    process.exit(0);
}
if (missing.length) {
    console.log(`\n  \x1b[31m어느 이름으로도 크론과 안 맞는다 → 그 섹터 화면이 빈다\x1b[0m`);
    const norm = (x) => x.replace(/_/g, "");
    for (const id of missing) {
        const near = [...written].find((w) => norm(w) === norm(id));
        console.log(`    ${id.padEnd(18)} ${read.get(id)}${near ? `   → 크론은 '${near}'` : ""}`);
    }
}
if (orphan.length) {
    console.log(`\n  \x1b[33m크론에만 있는 id (아무도 안 읽는다)\x1b[0m`);
    for (const id of orphan) console.log(`    ${id}`);
}
console.log();
process.exit(1);
