#!/usr/bin/env node
/**
 * «조용히 틀리는» 코드 유형 전수 검사.
 *
 * ══════════════════════════════════════════════════════════════════════
 * 2026-08-30 하루에 같은 유형이 반복해서 나왔다. 전부 200 OK 에 그럴듯한
 * 응답이라 에러로 안 보였고, 화면을 직접 열어야 알 수 있었다.
 *
 *   ① 빈 배열이 게이트를 통과   — JS 에서 `[]` 는 truthy 다
 *      실제: `if (c && c.probeResults && c.exactResults)` → PLTR 옵션 전멸
 *   ② 항상 참인 조건            — `cached.length >= 0`
 *      실제: secFilings 가 빈 결과를 «성공»으로 캐시
 *   ③ 캐시를 내용 검증 없이 반환 — `if (cached) return cached`
 *      실제: Lambda 축약본이 토요일 화면에 session REG·prevClose 0 으로
 *   ④ 배열 순서 가정            — `[0]` 을 «최신»으로
 *      실제: 같은 이름의 getGexHistory 가 두 개인데 정렬이 반대 → IV RANK 사망
 *
 * 이 검사기는 «의심 지점»을 뽑아 준다. 전부가 버그는 아니다 — 사람이 판정한다.
 * 다만 이 목록을 한 번도 안 보고 지나가면 위 넷이 또 생긴다.
 *
 * 사용:  node scripts/check-silent-failures.js [--all]
 */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const SKIP = /node_modules|\.next|\.git|dist|build|coverage|\/messages\/|scripts\/check-|scripts\/test-/;

const files = [];
(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (SKIP.test(p)) continue;
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
    }
})(path.join(ROOT, "src"));

const hits = { emptyTruthy: [], alwaysTrue: [], blindCache: [], orderAssume: [] };
const rel = (f) => path.relative(ROOT, f);

for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    const lines = src.split("\n");

    lines.forEach((ln, i) => {
        const t = ln.trim();
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
        const at = { file: rel(f), line: i + 1, code: t.slice(0, 118) };

        // ① 배열로 보이는 것을 «존재»로만 «게이트»에 쓴다 — 빈 배열이 통과한다
        //    노리는 모양:  if (x && x.results && x.other)   /   if (c?.items && ...)
        //    제외:        Array.isArray(...) 삼항 · 대입 · .length 를 이미 보는 줄
        const isGuard = /^\s*(?:\}\s*)?(?:else\s+)?if\s*\(/.test(ln) || /&&\s*$/.test(ln);
        const arrayish = /([A-Za-z_$][\w$]*\??\.[\w$]*(?:[Rr]esults|[Ii]tems|[Rr]ows|[Ll]ist|[Cc]hain|[Cc]ontracts|[Tt]rades|[Ee]vents|[Ff]ilings|[Hh]olders))\s*&&/.exec(ln);
        if (isGuard && arrayish
            && !/\.length/.test(ln)
            && !/Array\.isArray/.test(ln)
            && !/[^=!<>]=[^=]/.test(ln)) {
            hits.emptyTruthy.push({ ...at, expr: arrayish[1] });
        }

        // ② 항상 참인 비교
        if (/\.length\s*>=\s*0\b/.test(ln)) hits.alwaysTrue.push({ ...at, expr: "length >= 0" });

        // ③ 캐시를 내용 검증 없이 그대로 반환
        if (/if\s*\(\s*cached\s*\)\s*return\s+cached/.test(ln) || /if\s*\(\s*cached\s*\)\s*\{?\s*$/.test(ln)) {
            // 다음 두 줄 안에 return 이 있으면 «검증 없이 반환»으로 본다
            const next = (lines[i + 1] || "") + (lines[i + 2] || "");
            if (/return/.test(next) || /return\s+cached/.test(ln)) hits.blindCache.push(at);
        }

        // ④ «최신»을 배열 인덱스로 가정
        if (/(?:latest|current|newest|recent)[\w$]*\s*=\s*[A-Za-z_$][\w$]*\s*\[\s*0\s*\]/i.test(ln)) {
            hits.orderAssume.push({ ...at, expr: "[0] as latest" });
        }
    });
}

const TITLES = {
    emptyTruthy: ["빈 배열이 게이트를 통과할 수 있다 (JS 에서 [] 는 truthy)", "\x1b[31m"],
    alwaysTrue: ["항상 참인 조건 — 검사가 사실상 없다", "\x1b[31m"],
    blindCache: ["캐시를 내용 검증 없이 반환 — 축약본·빈 결과가 그대로 나간다", "\x1b[33m"],
    orderAssume: ["배열 [0] 을 «최신»으로 가정 — 정렬이 보장되는지 확인 필요", "\x1b[33m"],
};

let total = 0;
console.log(`  조용한 실패 유형 검사 · ${files.length}개 파일`);
console.log("=".repeat(78));
for (const [k, arr] of Object.entries(hits)) {
    if (!arr.length) continue;
    total += arr.length;
    const [title, color] = TITLES[k];
    console.log(`\n${color}  [${k}] ${title} — ${arr.length}건\x1b[0m`);
    for (const h of arr.slice(0, 14)) {
        console.log(`    ${h.file}:${h.line}`);
        console.log(`      ${h.code}`);
    }
    if (arr.length > 14) console.log(`    … 외 ${arr.length - 14}건`);
}
console.log();
if (!total) { console.log("  \x1b[32m의심 지점 없음\x1b[0m\n"); process.exit(0); }
console.log(`  총 ${total}건 — \x1b[33m전부가 버그는 아니다. 사람이 판정할 것.\x1b[0m\n`);
