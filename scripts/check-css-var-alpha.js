#!/usr/bin/env node
/**
 * `var(--x)` 에 16진 알파를 이어 붙인 곳을 찾는다.
 *
 * 왜: `` `${accent}33` `` 은 accent 가 '#22d3ee' 면 정상(8자리 hex)이지만,
 *     'var(--red)' 면 `var(--red)33` 이라는 **유효하지 않은 CSS** 가 되어
 *     그 선언이 통째로 무시된다. 에러도 경고도 없다 — 테두리·배경이
 *     그냥 «투명»해진다.
 *     2026-08-31 다크풀 카드가 그랬다: border·background·토글 알약이 전부
 *     안 보였는데 코드는 멀쩡해 보였다. computedStyle 을 찍어야 보였다.
 *
 * 판정: 같은 파일에서 그 변수에 `var(--` 가 대입되는지 본다.
 */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "src");

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) files.push(p);
  }
})(ROOT);

const hits = [];
for (const f of files) {
  const rel = f.slice(f.indexOf("/src/") + 1);
  const src = fs.readFileSync(f, "utf8");
  const lines = src.split("\n");
  // ① 직접 리터럴: `var(--x)33`
  lines.forEach((l, i) => {
    if (/var\(--[a-zA-Z0-9-]+\)[0-9a-fA-F]{2}\b/.test(l) && !/^\s*(\/\/|\*)/.test(l.trim())) {
      hits.push({ rel, line: i + 1, kind: "literal", text: l.trim().slice(0, 110) });
    }
  });
  // ② 변수 보간: `${x}33` — 그 변수가 var(--) 를 받는가
  const interp = new Set();
  for (const m of src.matchAll(/\$\{([A-Za-z_$][\w$]*)\}[0-9a-fA-F]{2}(?![0-9a-fA-F])/g)) interp.add(m[1]);
  for (const name of interp) {
    const assign = new RegExp(`(?:const|let|var)\\s+${name}\\s*=[^;]*var\\(--`, "s");
    const ternary = new RegExp(`${name}\\s*=[^;\\n]*var\\(--`);
    if (assign.test(src) || ternary.test(src)) {
      lines.forEach((l, i) => {
        if (new RegExp(`\\$\\{${name}\\}[0-9a-fA-F]{2}`).test(l)) {
          hits.push({ rel, line: i + 1, kind: `var:${name}`, text: l.trim().slice(0, 110) });
        }
      });
    }
  }
}

const C = { r: "\x1b[31m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m" };
console.log("=".repeat(92));
console.log(`  CSS 변수 + 16진 알파 (선언이 조용히 무시된다) · ${files.length}개 파일`);
console.log("  ※ [var:이름] 은 «같은 이름의 다른 변수»일 수 있다 — 정의를 눈으로 확인할 것");
console.log("=".repeat(92));
if (!hits.length) { console.log("\n  없음"); }
for (const h of hits) console.log(`  ${C.r}:${h.line}${C.x} ${h.rel}  ${C.d}[${h.kind}]${C.x}\n      ${C.d}${h.text}${C.x}`);
console.log("\n" + "=".repeat(92));
if (hits.length) process.exitCode = 1;
