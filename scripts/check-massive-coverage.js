#!/usr/bin/env node
/**
 * Massive 이관 커버리지 검사 — «아직 Massive 로 새는 엔드포인트가 있는가»
 *
 * [왜] `MASSIVE_PASSTHROUGH` 를 비웠다고 이관이 끝난 게 아니다.
 *      `routeToIntrinio()` 가 `undefined` 를 돌려주면 호출부가 **조용히**
 *      Massive 로 폴백한다. 그 벤더는 죽어 있으므로 403 이 나고,
 *      대부분의 소비처는 `.catch(() => null)` 로 삼킨다 — 즉 **안 보인다.**
 *
 *      그래서 코드에서 «실제로 호출되는 엔드포인트 패턴»을 전부 뽑아
 *      라우터가 처리하는지 하나씩 대조한다.
 *
 * 사용: node scripts/check-massive-coverage.js
 */

const { execSync } = require("child_process");

// 코드에서 실측한 호출 패턴 (scripts/ src/ harvest_lambda/ 전수 grep 결과)
const ENDPOINTS = [
    // 시세·집계
    ["/v2/snapshot/locale/us/markets/stocks/tickers/NVDA", "개별 스냅샷"],
    ["/v2/snapshot/locale/us/markets/stocks/tickers", "전 종목 스냅샷"],
    ["/v2/snapshot/locale/us/markets/stocks/tickers?tickers=NVDA,AAPL", "다중 스냅샷"],
    ["/v2/snapshot/locale/us/markets/stocks/gainers", "상승 상위"],
    ["/v2/snapshot/locale/us/markets/stocks/losers", "하락 상위"],
    ["/v2/aggs/ticker/NVDA/range/1/day/2026-08-01/2026-08-28", "일봉"],
    ["/v2/aggs/ticker/NVDA/range/1/minute/2026-08-28/2026-08-28", "분봉"],
    ["/v2/aggs/ticker/NVDA/range/5/minute/2026-08-25/2026-08-28", "5분봉"],
    ["/v2/aggs/ticker/NVDA/prev", "전일 봉"],
    ["/v2/aggs/grouped/locale/us/market/stocks/2026-08-27", "전 종목 일봉"],
    // 옵션
    ["/v3/snapshot/options/NVDA", "옵션 체인"],
    ["/v3/snapshot/options/NVDA?expiration_date=2026-09-04", "옵션 체인(만기지정)"],
    ["/v3/reference/options/contracts?underlying_ticker=NVDA", "옵션 계약 목록"],
    // 레퍼런스
    ["/v3/reference/tickers/NVDA", "티커 상세"],
    ["/v3/reference/tickers?market=stocks", "티커 목록"],
    ["/v3/reference/dividends?ticker=NVDA", "배당"],
    ["/v3/reference/splits?ticker=NVDA", "분할"],
    ["/v3/reference/conditions", "거래 조건"],
    // 지표
    ["/v1/indicators/sma/NVDA", "SMA"],
    ["/v1/indicators/rsi/NVDA", "RSI"],
    ["/v1/indicators/macd/NVDA", "MACD"],
    // 시장
    ["/v1/marketstatus/now", "시장 상태"],
    ["/v1/marketstatus/upcoming", "휴장 일정"],
    ["/v1/open-close/NVDA/2026-08-27", "일별 시/종가"],
    ["/v1/related-companies/NVDA", "연관 종목"],
    // 틱 (미지원 확정)
    ["/v3/trades/NVDA", "체결 틱"],
    ["/v3/quotes/NVDA", "호가 틱"],
    ["/v2/last/trade/NVDA", "마지막 체결"],
    ["/stocks/v1/short-volume?ticker=NVDA", "공매도 거래량"],
    ["/stocks/v1/short-interest?ticker=NVDA", "공매도 잔고"],
    // 뉴스
    ["/v2/reference/news?ticker=NVDA&limit=5", "종목 뉴스"],
    ["/v2/reference/news?limit=10", "일반 뉴스"],
];

const TS = `
import { routeToIntrinio, isUnsupported } from "./src/services/intrinioRouter";
const EPS = ${JSON.stringify(ENDPOINTS)};
(async () => {
  const out: any[] = [];
  for (const [ep, name] of EPS) {
    if (isUnsupported(ep)) { out.push({ ep, name, verdict: "미지원(의도)" }); continue; }
    try {
      const r = await routeToIntrinio(ep);
      if (r === undefined) out.push({ ep, name, verdict: "MASSIVE 폴백" });
      else {
        const n = r?.resultsCount ?? r?.count ?? (Array.isArray(r?.results) ? r.results.length : null)
          ?? (Array.isArray(r?.tickers) ? r.tickers.length : null);
        out.push({ ep, name, verdict: "라우팅됨", n });
      }
    } catch (e: any) { out.push({ ep, name, verdict: "예외", err: e?.message?.slice(0, 60) }); }
  }
  console.log(JSON.stringify(out));
})();
`;

const fs = require("fs");
const tmp = "_tmp_coverage.ts";
fs.writeFileSync(tmp, TS);

const C = { r: "\x1b[31m", y: "\x1b[33m", g: "\x1b[32m", d: "\x1b[2m", x: "\x1b[0m", b: "\x1b[1m" };
try {
    const raw = execSync(`npx tsx ${tmp} 2>/dev/null | tail -1`, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
    const rows = JSON.parse(raw.trim());
    console.log("═".repeat(84));
    console.log("  Massive 이관 커버리지 — «아직 Massive 로 새는 곳이 있는가»");
    console.log("═".repeat(84));
    let leak = 0, routed = 0, unsupported = 0, err = 0;
    for (const r of rows) {
        let mark;
        if (r.verdict === "라우팅됨") { mark = `${C.g}✓ 라우팅${C.x}`; routed++; }
        else if (r.verdict === "미지원(의도)") { mark = `${C.d}· 미지원${C.x}`; unsupported++; }
        else if (r.verdict === "MASSIVE 폴백") { mark = `${C.r}✗ 누수  ${C.x}`; leak++; }
        else { mark = `${C.y}! 예외  ${C.x}`; err++; }
        console.log(`  ${mark} ${r.name.padEnd(20)} ${C.d}${r.ep.slice(0, 46).padEnd(47)}${C.x}` +
            (r.n != null ? `${r.n}건` : "") + (r.err ? ` ${r.err}` : ""));
    }
    console.log("─".repeat(84));
    console.log(`  라우팅 ${routed} · 의도적 미지원 ${unsupported} · ${leak ? C.r : C.g}Massive 누수 ${leak}${C.x} · 예외 ${err}`);
    console.log("═".repeat(84));
    process.exit(leak > 0 ? 1 : 0);
} finally {
    try { fs.unlinkSync(tmp); } catch { }
}
