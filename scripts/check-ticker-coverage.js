#!/usr/bin/env node
/**
 * 전 종목 지표 커버리지 검사 — 「어떤 종목이든 비면 안 된다」
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 만들었나]
 *   한 종목만 조용히 죽는 형태가 반복됐다. 화면을 열어 보지 않으면 모른다.
 *     · TSM  — 변수 섀도잉으로 옵션 지표 전멸 (2026-08-30)
 *     · PLTR — Lambda 캐시의 **빈 배열**이 게이트를 통과 (2026-08-30)
 *     · 토요일 전 종목 — Lambda 축약본이 세션 REG·prevClose 0 으로 (2026-08-30)
 *
 *   공통점: 200 OK 에 그럴듯한 응답이라 «에러»로 안 보인다.
 *   그래서 사람이 아니라 검사기가 매번 전수로 봐야 한다.
 *
 * 사용:  node scripts/check-ticker-coverage.js [--all]
 *        기본 60종목 · --all 은 SEO 유니버스 전체
 */
const BASE = process.env.SIGNUM_BASE || "https://www.signumhq.com";

const CORE = ["NVDA","TSLA","AAPL","MSFT","AMZN","GOOGL","META","AMD","AVGO","TSM",
  "MU","ARM","PLTR","COIN","MRVL","SMCI","INTC","QCOM","ASML","NFLX",
  "CRM","ORCL","ADBE","NOW","PANW","CRWD","LRCX","KLAC","AMAT","SPY",
  "SNOW","NET","DDOG","MDB","ZS","OKTA","TWLO","HOOD","SOFI","RBLX",
  "U","DASH","ABNB","UBER","LYFT","SHOP","XYZ","AFRM","IONQ","RGTI",
  "ASTS","LUNR","RKLB","SMR","OKLO","VST","CEG","GEV","QQQ","IWM"];

/** 어떤 종목에서도 비면 안 되는 필드 */
const REQUIRED = ["gamma", "maxPain", "callWall", "putFloor", "ivSkew", "volumePcr"];
/** 비어 있을 수 있으나 추적은 하는 필드 (유동성이 낮으면 실제로 없을 수 있다) */
const TRACKED = ["oiPcr", "squeezeScore"];

const pad = (s, n) => String(s).padEnd(n);

(async () => {
    const tickers = CORE;
    const out = [];
    for (let i = 0; i < tickers.length; i += 6) {
        const r = await Promise.all(tickers.slice(i, i + 6).map(async (t) => {
            try {
                const res = await fetch(`${BASE}/api/live/ticker?t=${t}&skip_alpha=1`,
                    { signal: AbortSignal.timeout(55000) });
                if (!res.ok) return { t, err: `HTTP ${res.status}` };
                const d = await res.json();
                const f = d.flow || {};
                return {
                    t,
                    contracts: f.contractsProcessed ?? 0,
                    missReq: REQUIRED.filter((k) => f[k] == null),
                    missTrk: TRACKED.filter((k) => f[k] == null),
                    session: d.session,
                    prevClose: d.prevClose,
                    price: d.price,
                    src: d._source || null,
                };
            } catch (e) { return { t, err: String(e?.name || e).slice(0, 16) }; }
        }));
        out.push(...r);
    }

    const failed = out.filter((x) => x.err);
    const missing = out.filter((x) => !x.err && x.missReq.length);
    const tracked = out.filter((x) => !x.err && !x.missReq.length && x.missTrk.length);
    // 「어느 순간에도 빈 화면이 아니어야 한다」 — 가격·세션 정합성도 같이 본다
    const badPrev = out.filter((x) => !x.err && Number(x.price) > 0 && !(Number(x.prevClose) > 0));
    const badSrc = out.filter((x) => !x.err && x.src && String(x.src).includes("lambda"));

    console.log(`  종목 커버리지 · ${out.length}종목 · ${BASE}`);
    console.log("=".repeat(76));
    console.log(`  완전 ${out.length - failed.length - missing.length - tracked.length} · 추적필드누락 ${tracked.length} · 필수누락 ${missing.length} · 실패 ${failed.length}`);

    if (tracked.length) {
        console.log(`\n  \x1b[33m추적 필드 누락 (유동성 낮은 종목이면 정상일 수 있다)\x1b[0m`);
        for (const x of tracked) console.log(`    ${pad(x.t, 6)} 계약 ${pad(x.contracts, 5)} ${x.missTrk.join(",")}`);
    }
    if (missing.length) {
        console.log(`\n  \x1b[31m필수 필드 누락 — 어떤 종목에서도 있으면 안 된다\x1b[0m`);
        for (const x of missing) console.log(`    ${pad(x.t, 6)} 계약 ${pad(x.contracts, 5)} ${x.missReq.join(",")}`);
    }
    if (badPrev.length) console.log(`\n  \x1b[31m전일종가 0 (등락률이 거짓이 된다): ${badPrev.map((x) => x.t).join(", ")}\x1b[0m`);
    if (badSrc.length) console.log(`\n  \x1b[31mLambda 축약본이 그대로 나감: ${badSrc.map((x) => x.t).join(", ")}\x1b[0m`);
    for (const x of failed) console.log(`    ✗ ${pad(x.t, 6)} ${x.err}`);

    console.log();
    process.exit(missing.length || failed.length || badPrev.length || badSrc.length ? 1 : 0);
})();
