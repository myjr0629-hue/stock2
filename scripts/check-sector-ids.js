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

const missing = [...read.keys()].filter((id) => !written.has(id));
const orphan = [...written].filter((id) => !read.has(id));

console.log(`  섹터 id 대조 · 크론 ${written.size}개 · 설정 ${read.size}개`);
console.log("=".repeat(72));
if (!missing.length && !orphan.length) {
    console.log("  \x1b[32m전부 일치\x1b[0m");
    process.exit(0);
}
if (missing.length) {
    console.log(`\n  \x1b[31m설정에만 있는 id (크론이 이 이름으로 안 쓴다 → 화면이 빈다)\x1b[0m`);
    for (const id of missing) {
        // 가장 가까운 크론 이름을 제안한다
        const norm = (s) => s.replace(/_/g, "");
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
