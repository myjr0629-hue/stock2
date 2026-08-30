#!/usr/bin/env node
/**
 * 「바깥 변수를 안쪽에서 다시 선언」 검사기 (AST 기반)
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜]  2026-08-30 실측: structureService 에서 `availableExpirations` 와
 *   `targetExpiry` 를 안쪽 블록에서 **다시 선언**하고 있었다. 그러면 그 안의
 *   대입이 바깥 변수에 닿지 않는다. 결과는 «에러 없이 빈 값» —
 *   같은 섹터에서 AVGO 는 만기 8개인데 **TSM 은 0개**로 나왔다.
 *   계약(strikes)은 안쪽 값으로 받아오니 채워지고 «메타만» 비어서
 *   눈으로는 거의 못 잡는 형태였다.
 *
 * [정규식으로는 못 잡는다]  함수 경계를 모르면 오탐이 쏟아진다(처음에 112건
 *   나왔고 대부분 서로 다른 함수의 동명 지역변수였다). TS 컴파일러로 스코프를 본다.
 *
 * [무엇을 보는가]  같은 함수 안에서
 *   ① 바깥 스코프에 let/var 선언이 있고
 *   ② 안쪽 블록이 같은 이름을 다시 선언하며
 *   ③ 그 블록 «뒤»에서 바깥 이름을 다시 읽는다
 *   → 값 유실이 실제로 일어나는 형태만 보고한다.
 *
 * 사용: node scripts/check-shadowed-vars.js [경로...]
 */
const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const roots = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const DIRS = roots.length ? roots : ["src/services", "src/app/api", "src/lib"];

const files = [];
for (const d of DIRS) {
    if (!fs.existsSync(d)) continue;
    if (fs.statSync(d).isFile()) { files.push(d); continue; }
    (function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p); }
            else if (/\.tsx?$/.test(e.name)) files.push(p);
        }
    })(d);
}

const findings = [];

for (const file of files) {
    const src = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const line = (n) => src.getLineAndCharacterOfPosition(n.getStart()).line + 1;

    // 함수 단위로 검사 — 함수가 다르면 같은 이름이어도 문제가 아니다
    const visitFn = (fn) => {
        // 함수 본문 «직속» 블록의 let 선언 (바깥 후보)
        const outer = new Map();   // name → { node, line }
        const body = fn.body;
        if (!body || !body.statements) return;
        for (const st of body.statements) {
            if (ts.isVariableStatement(st) && !(st.declarationList.flags & ts.NodeFlags.Const)) {
                for (const d of st.declarationList.declarations) {
                    if (ts.isIdentifier(d.name)) outer.set(d.name.text, { line: line(d), end: d.getEnd() });
                }
            }
        }
        if (!outer.size) return;

        // 안쪽 블록에서 같은 이름을 다시 선언하는가
        const inner = [];
        const walk = (n, depth) => {
            if (n !== body && (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n))) return; // 중첩 함수는 별개
            if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && depth > 0) {
                const o = outer.get(n.name.text);
                if (o && n.getStart() > o.end) inner.push({ name: n.name.text, line: line(n), start: n.getStart(), outerLine: o.line });
            }
            n.forEachChild((c) => walk(c, ts.isBlock(n) || ts.isCaseBlock(n) ? depth + 1 : depth));
        };
        walk(body, 0);
        if (!inner.length) return;

        // 재선언 «뒤»에서 바깥 이름을 다시 읽는지 (= 유실이 실제로 드러나는지)
        for (const s of inner) {
            let usedAfter = false;
            const scan = (n) => {
                if (usedAfter) return;
                if (ts.isIdentifier(n) && n.text === s.name && n.getStart() > s.start
                    && !(n.parent && ts.isVariableDeclaration(n.parent) && n.parent.name === n)) {
                    // 안쪽 블록 «밖»에서 읽히는가 — 위치로 근사
                    usedAfter = true;
                }
                n.forEachChild(scan);
            };
            // 함수 본문 직속 문장 중 재선언 이후 것만 본다
            for (const st of body.statements) if (st.getStart() > s.start) scan(st);
            if (usedAfter) findings.push({ file, ...s });
        }
    };

    const visit = (n) => {
        if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)) visitFn(n);
        n.forEachChild(visit);
    };
    visit(src);
}

const C = { r: "\x1b[31m", g: "\x1b[32m", d: "\x1b[2m", x: "\x1b[0m" };
console.log("═".repeat(92));
console.log(`  섀도잉 검사 (AST) · ${files.length}개 파일`);
console.log("═".repeat(92));
if (!findings.length) console.log(`  ${C.g}의심 없음${C.x}`);
else {
    for (const f of findings) {
        console.log(`  ${C.r}✗${C.x} ${f.file.replace(/^src\//, "")}  ${C.d}${f.name}${C.x}  바깥 ${f.outerLine}행 → 안쪽 재선언 ${f.line}행`);
    }
    console.log(`\n  ${C.r}${findings.length}건${C.x} — 안쪽 대입이 바깥에 닿지 않아 «에러 없이 빈 값»이 될 수 있다`);
}
console.log("═".repeat(92));
process.exit(findings.length ? 1 : 0);
