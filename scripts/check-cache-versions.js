#!/usr/bin/env node
/**
 * 응답 캐시 키의 «버전»을 한눈에 본다.
 *
 * 왜: 응답 모양을 바꾸고 캐시 키를 안 올리면 옛 페이로드가 그대로 나가서
 *     새 필드가 «조용히» 빠진다. 200 OK 라 아무도 모른다.
 *     2026-08-31 하루에 세 번 겪었다 (tech:adv · analyst-events ·
 *     undercurrent:ticker · flow:ticker).
 *
 * 쓰는 법: 응답 필드를 추가/삭제했으면 그 라우트의 키 버전을 올렸는지
 *          이 목록으로 확인한다. SWR 라우트는 stale 도 돌려주므로 더 오래 남는다.
 */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "src", "app", "api");

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) files.push(p);
  }
})(ROOT);

const rows = [];
for (const f of files) {
  const rel = f.slice(f.indexOf("/src/") + 1);
  const src = fs.readFileSync(f, "utf8");
  const re = /(?:cacheKey|CACHE_KEY|KEY)\s*=\s*[`"']([^`"']+)[`"']/g;
  let m;
  while ((m = re.exec(src))) {
    const key = m[1];
    if (!key.includes(":")) continue;
    const ver = key.match(/:v(\d+)/);
    const swr = /serveSWR/.test(src);
    rows.push({ rel, key, ver: ver ? `v${ver[1]}` : null, swr });
  }
}

const C = { y: "\x1b[33m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m", g: "\x1b[32m" };
console.log("=".repeat(92));
console.log(`  응답 캐시 키 ${rows.length}개 · 응답 모양을 바꿨으면 버전을 올렸는지 볼 것`);
console.log("=".repeat(92));
const noVer = rows.filter(r => !r.ver);
const withVer = rows.filter(r => r.ver);
console.log(`\n${C.b}버전 있음 ${withVer.length}${C.x}`);
for (const r of withVer.sort((a, b) => a.key.localeCompare(b.key))) {
  console.log(`  ${C.g}${r.ver.padEnd(4)}${C.x} ${r.key.padEnd(42)} ${C.d}${r.rel}${r.swr ? "  [SWR]" : ""}${C.x}`);
}
console.log(`\n${C.b}버전 없음 ${noVer.length}${C.x} ${C.d}(날짜·티커가 키에 있으면 대개 괜찮다)${C.x}`);
for (const r of noVer.sort((a, b) => a.key.localeCompare(b.key))) {
  const dated = /\$\{[^}]*(date|Date|day|ticker|symbol|sector)/.test(r.key);
  console.log(`  ${dated ? C.d + "  ·  " : C.y + "  ?  "}${r.key.padEnd(42)} ${r.rel}${r.swr ? "  [SWR]" : ""}${C.x}`);
}
console.log("\n" + "=".repeat(92));
