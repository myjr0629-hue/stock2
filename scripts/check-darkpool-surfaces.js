#!/usr/bin/env node
/**
 * 다크풀 표면 감사.
 *
 * 배경: 2026-08-28 massive.com 권한 상실로 다크풀 원천이 **영구 소멸**했다.
 *       그런데 코드는 200여 파일에서 다크풀을 참조한다. 값이 사라진 자리에
 *       0 이나 상수가 들어가면 「다크풀 0%」라는 **거짓 주장**이 된다.
 *       (실제로 대시보드는 42.5% 를, 인텔 화면은 감마에서 합성한 64% 를
 *        내보내고 있었다.)
 *
 * 이 검사기는 참조를 4종으로 가른다:
 *   FABRICATE — 없는 값을 숫자로 메운다  ← 반드시 고칠 것
 *   RENDER    — 사용자에게 값을 보여 준다 ← null 처리 확인 필요
 *   COPY      — 마케팅·교육 문구         ← 못 지키는 약속인지 판단
 *   TYPE      — 타입·주석·죽은 코드       ← 정리 대상(급하지 않음)
 */
const fs = require("fs"), path = require("path");

const ROOT = path.join(__dirname, "..", "src");
const ID = /darkPool|dark_pool|darkpool|D\.POOL|다크풀|ダークプール|[Dd]ark\s[Pp]ool/;

// 없는 값을 숫자로 메우는 형태
const FABRICATE = [
  /darkPool\w*\s*[:=]\s*[^;,\n]*\?\?\s*\d/i,
  /darkPool\w*\s*[:=]\s*[^;,\n]*\|\|\s*\d/i,
  /darkPool\w*\s*\?\?\s*\d/i,
  /darkPool\w*\s*\|\|\s*\d/i,
  /darkPool\w*\s*[:=]\s*\d+(\.\d+)?\s*[;,]/i,      // 상수 직접 대입
  /darkPool\w*[^;\n]*[-+*/]\s*(Math\.abs|\w+Pulse|\w+Score)/i, // 다른 지표에서 합성
];
const COPY_DIRS = ["/learn/", "/how-it-works/", "/pricing/", "/terms/", "/(home)/", "/feed.xml/", "marketing/", "/wim/", "/undercurrent/"];

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
})(ROOT);

const buckets = { FABRICATE: [], RENDER: [], COPY: [], TYPE: [] };

for (const f of files) {
  const rel = f.slice(f.indexOf("/src/") + 1);
  const lines = fs.readFileSync(f, "utf8").split("\n");
  const isCopy = COPY_DIRS.some(d => f.includes(d));
  lines.forEach((raw, i) => {
    if (!ID.test(raw)) return;
    const line = raw.trim();
    if (/^(\/\/|\*|\/\*)/.test(line)) return;               // 주석
    const hit = { file: rel, line: i + 1, text: line.slice(0, 120) };

    // `|| 0` 뒤에 `.filter(v => v > 0)` 가 붙으면 0 은 «버려진다» → 지어내지 않는다
    const guarded = /\.filter\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\s*>\s*0\s*\)/.test(line);
    if (!guarded && FABRICATE.some(re => re.test(line))) { buckets.FABRICATE.push(hit); return; }
    if (isCopy) { buckets.COPY.push(hit); return; }
    // 타입 선언 / import / 키 정의만 있는 줄
    if (/^\s*darkPool\w*\??\s*:\s*(number|string|boolean)(\s*\|\s*null)?;?\s*$/i.test(line)
        || /^import\b/.test(line) || /^\s*\/\//.test(line)) { buckets.TYPE.push(hit); return; }
    // JSX 안에서 값이 그려지는가
    if (/[<>{}]/.test(line) && /darkPool|다크풀|D\.POOL|[Dd]ark\s[Pp]ool/.test(line)) { buckets.RENDER.push(hit); return; }
    buckets.TYPE.push(hit);
  });
}

const C = { r: "\x1b[31m", y: "\x1b[33m", c: "\x1b[36m", d: "\x1b[2m", x: "\x1b[0m", b: "\x1b[1m" };
console.log("=".repeat(92));
console.log(`  다크풀 표면 감사 · ${files.length}개 파일 (원천은 2026-08-28 소멸)`);
console.log("=".repeat(92));
for (const [k, arr] of Object.entries(buckets)) {
  const col = k === "FABRICATE" ? C.r : k === "RENDER" ? C.y : k === "COPY" ? C.c : C.d;
  const byFile = new Map();
  for (const h of arr) byFile.set(h.file, (byFile.get(h.file) || 0) + 1);
  console.log(`\n${col}${C.b}${k}${C.x}  ${arr.length}건 / ${byFile.size}개 파일`);
  if (k === "FABRICATE" || k === "RENDER") {
    for (const h of arr.slice(0, k === "FABRICATE" ? 60 : 30)) {
      console.log(`  ${col}:${h.line}${C.x} ${h.file}\n      ${C.d}${h.text}${C.x}`);
    }
    if (arr.length > 60) console.log(`  … 외 ${arr.length - 60}건`);
  } else {
    for (const [f, n] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${C.d}${n.toString().padStart(3)}× ${f}${C.x}`);
    if (byFile.size > 12) console.log(`  ${C.d}… 외 ${byFile.size - 12}개 파일${C.x}`);
  }
}
console.log("\n" + "=".repeat(92));
if (buckets.FABRICATE.length) { console.log(`${C.r}${C.b}  FABRICATE ${buckets.FABRICATE.length}건 — 없는 값을 숫자로 메우고 있다${C.x}`); process.exitCode = 1; }
else console.log(`  ${C.b}FABRICATE 0${C.x} — 지어내는 곳 없음`);
console.log("=".repeat(92));
