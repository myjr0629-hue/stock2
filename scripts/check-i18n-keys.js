#!/usr/bin/env node
/**
 * 번역키 누락 검사기 (ko / en / ja)
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜]  2026-08-30 실화면에서 가디언 RVOL 게이지에 «GUARDIAN.MARKETCLOSED» 가
 *   그대로 떠 있었다. 코드는 t('marketClosed') 를 부르는데 guardian
 *   네임스페이스에 그 키가 없었던 것. 타입체크도 빌드도 안 잡는다.
 *
 * [주의]  한 파일에 useTranslations 가 **여러 개**인 경우가 흔하다.
 *   const t = useTranslations('command')  ·  const tCommon = useTranslations('common')
 *   파일당 네임스페이스를 하나로 가정하면 오탐이 쏟아진다(처음에 75건 나왔고
 *   전부 거짓이었다). **변수명 → 네임스페이스**로 매핑해야 한다.
 *
 * 사용: node scripts/check-i18n-keys.js
 */
const fs = require("fs"), path = require("path");
const LANGS = ["ko", "en", "ja"];

const files = [];
(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p); }
        else if (/\.tsx?$/.test(e.name)) files.push(p);
    }
})("src");

const msgs = Object.fromEntries(LANGS.map(l => [l, JSON.parse(fs.readFileSync(`src/messages/${l}.json`, "utf8"))]));
const get = (o, p) => p.split(".").reduce((x, s) => x?.[s], o);

const missing = new Map();
for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    const nsOf = {};
    for (const m of src.matchAll(/const\s+(\w+)\s*=\s*useTranslations\((["'])([\w.]+)\2\)/g)) nsOf[m[1]] = m[3];
    if (!Object.keys(nsOf).length) continue;
    for (const m of src.matchAll(/\b(\w+)\((["'])([\w.]+)\2\)/g)) {
        const ns = nsOf[m[1]];
        if (!ns) continue;
        const key = `${ns}.${m[3]}`;
        for (const l of LANGS) {
            if (get(msgs[l], key) === undefined) {
                if (!missing.has(key)) missing.set(key, { langs: new Set(), file: f.replace("src/", "") });
                missing.get(key).langs.add(l);
            }
        }
    }
}

const rows = [...missing.entries()];
console.log("═".repeat(88));
console.log(`  번역키 누락 검사 · ${files.length}개 파일 · ${LANGS.join(" / ")}`);
console.log("═".repeat(88));
if (!rows.length) {
    console.log("  \x1b[32m누락 없음\x1b[0m");
} else {
    for (const [k, v] of rows) console.log(`  \x1b[31m✗\x1b[0m ${k.padEnd(40)} [${[...v.langs].join(",")}]  ${v.file}`);
    console.log(`\n  \x1b[31m고유 키 ${rows.length}건\x1b[0m — 화면에 «NAMESPACE.KEY» 가 그대로 노출된다`);
}
console.log("═".repeat(88));
process.exit(rows.length ? 1 : 0);
