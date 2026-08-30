#!/usr/bin/env node
/**
 * 화면이 «API 가 내보내지 않는 필드»를 읽는 곳을 찾는다.
 *
 * 왜: 이름이 어긋나면 값이 `undefined` → 폴백 0 이 되어 화면만 조용히 빈다.
 *     에러도 로그도 없다. 2026-08-31 실측: Command 가 `flow.netFlow` 를
 *     읽었는데 API 는 `flow.netPremium` 을 내보냈다 → Flow 화면엔 $22.4M 이
 *     뜨는데 Command 만 «—». 두 화면을 나란히 놓아야 보였다.
 *
 * 사용: node scripts/check-client-field-drift.js [TICKER]
 *   실제 프로덕션 응답의 키 집합과 소스의 `flow.<이름>` 참조를 대조한다.
 */
const fs = require("fs"), path = require("path"), https = require("https");
const TICKER = process.argv[2] || "AAPL";
const BASE = process.env.BASE_URL || "https://www.signumhq.com";

const TARGETS = [
  "src/app/[locale]/app-view/cmd/page.tsx",
  "src/app/[locale]/app-view/flow/page.tsx",
  "src/app/[locale]/app-view/intel/page.tsx",
];

const get = (u) => new Promise((res, rej) => {
  https.get(u, (r) => { let b = ""; r.on("data", (c) => (b += c)); r.on("end", () => res(b)); }).on("error", rej);
});

(async () => {
  const raw = await get(`${BASE}/api/live/ticker?t=${TICKER}`);
  let d; try { d = JSON.parse(raw); } catch { console.error("응답 파싱 실패"); process.exit(1); }
  const flowKeys = new Set(Object.keys(d.flow || {}));
  if (flowKeys.size === 0) { console.error("flow 없음 — 티커를 바꿔 볼 것"); process.exit(1); }

  console.log("=".repeat(88));
  console.log(`  클라이언트가 읽는 flow.<필드> vs API 실제 응답 (${TICKER}, 키 ${flowKeys.size}개)`);
  console.log("=".repeat(88));

  let bad = 0;
  for (const rel of TARGETS) {
    const f = path.join(__dirname, "..", rel);
    if (!fs.existsSync(f)) continue;
    const src = fs.readFileSync(f, "utf8");
    const lines = src.split("\n");
    const miss = new Map();
    lines.forEach((l, i) => {
      const refs = [...l.matchAll(/\bflow\??\.([A-Za-z_]\w*)/g)].map((m) => m[1]);
      if (refs.length === 0) return;
      // ⚠️ 폴백 체인은 정상이다: `flow.gammaFlipLevel ?? flow.gammaFlip` 처럼
      //    올바른 이름을 «먼저» 시도하면 옛 별칭이 남아 있어도 문제가 없다.
      //    같은 줄(또는 바로 앞뒤 2줄)에 유효한 키가 하나라도 있으면 넘어간다.
      const ctx = lines.slice(Math.max(0, i - 2), i + 3).join(" ");
      const ctxRefs = [...ctx.matchAll(/\bflow\??\.([A-Za-z_]\w*)/g)].map((m) => m[1]);
      if (ctxRefs.some((k) => flowKeys.has(k))) return;
      for (const k of refs) {
        if (flowKeys.has(k)) continue;
        if (!miss.has(k)) miss.set(k, []);
        miss.get(k).push(i + 1);
      }
    });
    if (miss.size === 0) { console.log(`\n  \x1b[2m${rel} — 어긋남 없음\x1b[0m`); continue; }
    console.log(`\n  \x1b[33m${rel}\x1b[0m`);
    for (const [k, ls] of miss) { bad++; console.log(`    \x1b[31mflow.${k}\x1b[0m  → API 에 없음  (줄 ${ls.join(", ")})`); }
  }
  console.log("\n" + "=".repeat(88));
  console.log(bad ? `  \x1b[31m${bad}종 어긋남 — 폴백으로 조용히 0 이 된다\x1b[0m` : "  어긋남 없음");
  console.log("=".repeat(88));
  if (bad) process.exitCode = 1;
})();
