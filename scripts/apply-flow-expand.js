#!/usr/bin/env node
/**
 * probe-flow-expand 결과를 flowTickers.ts 에 반영한다.
 *
 * ⚠️ 통과한 것만 넣는다. 데이터 없는 페이지를 사이트맵에 넣으면 소프트404가
 *    되어 도메인 전체 평가를 깎는다(sitemap.ts 주석의 원칙).
 *
 * 사용: node scripts/apply-flow-expand.js [probeJSON]
 */
const fs = require("fs"), path = require("path");
const IN = process.argv[2] || path.join(__dirname, "_flow-expand-probe.json");
const TS = path.join(__dirname, "..", "src", "lib", "seo", "flowTickers.ts");

const { pass } = JSON.parse(fs.readFileSync(IN, "utf8"));
let src = fs.readFileSync(TS, "utf8");

const have = new Set([...src.matchAll(/'([A-Z]{1,5})'/g)].map((m) => m[1]));
const add = pass.filter((t) => !have.has(t));
if (add.length === 0) { console.log("추가할 것 없음"); process.exit(0); }

const today = new Date().toISOString().slice(0, 10);
const block = [
    "",
    `  // ── ${today} 확장: ${have.size} → ${have.size + add.length} ─────────────────────`,
    "  // 왜 지금 늘리나: 다크풀(FINRA)이 **전 종목**에 붙으면서 모든 페이지가",
    "  //   지표 3개(장외 비중·물량 배수·공매도 비중)를 더 갖게 됐다. 예전에",
    "  //   «내용 빈약»으로 탈락했던 티커가 이제 충분한 페이지가 된다.",
    "  //",
    `  // 검증: 후보 ${JSON.parse(fs.readFileSync(IN, "utf8")).pass.length + JSON.parse(fs.readFileSync(IN, "utf8")).fail.length}개를 **전부 실제 렌더**해서 확인했다`,
    "  //   (scripts/probe-flow-expand.js). 통과 기준을 3 → 5 로 올렸다 —",
    "  //   다크풀이 3개를 더 주므로 옛 기준은 너무 헐거워졌기 때문이다.",
    "  //   후보는 «FINRA 커버 + 일 거래대금 상위»에서 뽑았다(잡주 제외).",
    ...chunk(add, 10).map((row) => "  " + row.map((t) => `'${t}'`).join(", ") + ","),
].join("\n");

// 배열 마지막 닫는 대괄호 앞에 삽입
const marker = /\n\](\s*as const)?;/;
const m = src.match(marker);
if (!m) { console.error("FLOW_TICKERS 배열 끝을 못 찾음"); process.exit(1); }
src = src.replace(marker, `\n${block}\n]${m[1] || ""};`);
fs.writeFileSync(TS, src);
console.log(`추가 ${add.length}종 → 총 ${have.size + add.length}`);
console.log(`예: ${add.slice(0, 12).join(" ")}`);

function chunk(a, n) { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
