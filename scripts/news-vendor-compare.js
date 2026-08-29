#!/usr/bin/env node
/**
 * 뉴스 벤더 실측 비교기
 *
 * [왜] Massive 뉴스가 2026-09-23 해지된다. 대안을 «문서»가 아니라
 *      **같은 종목·같은 시각에 실제로 받아** 비교한다.
 *
 * [무엇을 보는가]  뉴스는 «건수»가 아니라 «쓸모»로 평가해야 한다.
 *   1) 종목 정확도   — 요청한 종목이 실제로 기사 주제인가 (가장 중요)
 *   2) 발행사 다양성 — 한 곳에서만 오면 편향된다
 *   3) 본문 충실도   — AI 요약·분석의 재료가 되는가
 *   4) 신선도        — 최신 기사가 몇 시간 전인가
 *   5) 커버리지      — 소형주도 되는가
 *   6) 부가 필드     — 감성분석·키워드·이미지 등
 *   7) 호출 효율     — 다종목 1콜이 되는가
 *
 * 사용: ENV_FILE=<env> node scripts/news-vendor-compare.js
 */

const https = require("https");
require("dotenv").config({ path: process.env.ENV_FILE || ".env.local" });

const FMP = process.env.FMP_API_KEY || "";
const FINNHUB = process.env.FINNHUB_API_KEY || "";
const MASSIVE = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || "";

const TICKERS = ["NVDA", "TSLA", "AAPL"];
const SMALL_CAPS = ["IONQ", "AEHR", "BBAI", "CRCL", "RGTI"];

function get(url) {
    return new Promise((r) => {
        const t0 = Date.now();
        https.get(url, { timeout: 20000 }, (x) => {
            const c = [];
            x.on("data", (d) => c.push(d));
            x.on("end", () => {
                const s = Buffer.concat(c).toString();
                let j = null;
                try { j = JSON.parse(s); } catch { }
                r({ s: x.statusCode, ms: Date.now() - t0, j, raw: s });
            });
        }).on("error", (e) => r({ s: 0, ms: 0, raw: e.message }));
    });
}

const AGE_H = (iso) => {
    const t = Date.parse(String(iso).includes("T") ? iso : String(iso).replace(" ", "T") + "Z");
    return Number.isFinite(t) ? (Date.now() - t) / 3600000 : null;
};

/** 기사가 실제로 그 종목 얘기인가 — 제목+본문에 티커/회사명이 있는가 */
const NAME = { NVDA: /nvda|nvidia/i, TSLA: /tsla|tesla/i, AAPL: /aapl|apple/i };
function relevance(items, ticker, titleKey, bodyKey) {
    const re = NAME[ticker];
    if (!re || !items.length) return null;
    const hit = items.filter((a) => re.test(`${a[titleKey] || ""} ${a[bodyKey] || ""}`)).length;
    return { hit, total: items.length, pct: Math.round((hit / items.length) * 100) };
}

function summarize(name, items, opt) {
    if (!items || !items.length) return { name, ok: false };
    const { titleKey, bodyKey, dateKey, pubKey, imgKey, urlKey } = opt;
    const pubs = new Set(items.map((a) => a[pubKey] || "?").filter(Boolean));
    const ages = items.map((a) => AGE_H(a[dateKey])).filter((x) => x != null);
    const bodies = items.filter((a) => String(a[bodyKey] || "").length > 200).length;
    const imgs = items.filter((a) => a[imgKey]).length;
    const urls = items.filter((a) => a[urlKey]).length;
    return {
        name, ok: true,
        n: items.length,
        pubs: pubs.size,
        pubTop: [...pubs].slice(0, 4).join(", "),
        newestH: ages.length ? Math.min(...ages).toFixed(1) : "-",
        oldestH: ages.length ? Math.max(...ages).toFixed(1) : "-",
        bodyPct: Math.round((bodies / items.length) * 100),
        imgPct: Math.round((imgs / items.length) * 100),
        urlPct: Math.round((urls / items.length) * 100),
    };
}

(async () => {
    console.log("═".repeat(96));
    console.log(`  뉴스 벤더 실측 비교 · ${new Date().toISOString()}`);
    console.log("═".repeat(96));

    const rows = [];

    for (const t of TICKERS) {
        console.log(`\n▌${t}`);

        // ── FMP ──
        if (FMP) {
            const r = await get(`https://financialmodelingprep.com/stable/news/stock?symbols=${t}&limit=40&apikey=${FMP}`);
            const a = Array.isArray(r.j) ? r.j : [];
            const s = summarize("FMP", a, { titleKey: "title", bodyKey: "text", dateKey: "publishedDate", pubKey: "site", imgKey: "image", urlKey: "url" });
            const rel = relevance(a, t, "title", "text");
            if (s.ok) {
                console.log(`  FMP      ${String(s.n).padStart(3)}건 · 관련 ${rel ? rel.pct + "%" : "-"} · 발행사 ${s.pubs} · 본문 ${s.bodyPct}% · 이미지 ${s.imgPct}% · 최신 ${s.newestH}h`);
                rows.push({ t, ...s, rel: rel?.pct, ms: r.ms });
            } else console.log(`  FMP      실패 ${r.s} ${String(r.raw).slice(0, 60)}`);
        }

        // ── Finnhub ──
        if (FINNHUB) {
            const from = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
            const to = new Date().toISOString().slice(0, 10);
            const r = await get(`https://finnhub.io/api/v1/company-news?symbol=${t}&from=${from}&to=${to}&token=${FINNHUB}`);
            const a = (Array.isArray(r.j) ? r.j : []).slice(0, 40).map((x) => ({
                ...x, _iso: new Date((x.datetime || 0) * 1000).toISOString(),
            }));
            const s = summarize("Finnhub", a, { titleKey: "headline", bodyKey: "summary", dateKey: "_iso", pubKey: "source", imgKey: "image", urlKey: "url" });
            const rel = relevance(a, t, "headline", "summary");
            if (s.ok) {
                console.log(`  Finnhub  ${String(s.n).padStart(3)}건 · 관련 ${rel ? rel.pct + "%" : "-"} · 발행사 ${s.pubs} · 본문 ${s.bodyPct}% · 이미지 ${s.imgPct}% · 최신 ${s.newestH}h`);
                rows.push({ t, ...s, rel: rel?.pct, ms: r.ms });
            } else console.log(`  Finnhub  실패 ${r.s} ${String(r.raw).slice(0, 60)}`);
        }

        // ── Massive (기존, 9/23 해지) ──
        if (MASSIVE) {
            const r = await get(`https://api.polygon.io/v2/reference/news?ticker=${t}&limit=40&apiKey=${MASSIVE}`);
            const a = (r.j && r.j.results) || [];
            const a2 = a.map((x) => ({ ...x, _pub: x.publisher?.name }));
            const s = summarize("Massive", a2, { titleKey: "title", bodyKey: "description", dateKey: "published_utc", pubKey: "_pub", imgKey: "image_url", urlKey: "article_url" });
            const rel = relevance(a2, t, "title", "description");
            const withInsights = a.filter((x) => (x.insights || []).length).length;
            if (s.ok) {
                console.log(`  Massive  ${String(s.n).padStart(3)}건 · 관련 ${rel ? rel.pct + "%" : "-"} · 발행사 ${s.pubs} · 본문 ${s.bodyPct}% · 이미지 ${s.imgPct}% · 최신 ${s.newestH}h · 감성분석 ${Math.round(withInsights / a.length * 100)}%`);
                rows.push({ t, ...s, rel: rel?.pct, ms: r.ms });
            } else console.log(`  Massive  실패 ${r.s} ${String(r.raw).slice(0, 60)}`);
        }
    }

    // ── 소형주 커버리지 ──
    console.log(`\n▌소형주 커버리지 (${SMALL_CAPS.join(", ")})`);
    for (const [vendor, fn] of [
        ["FMP", async (t) => {
            const r = await get(`https://financialmodelingprep.com/stable/news/stock?symbols=${t}&limit=20&apikey=${FMP}`);
            return Array.isArray(r.j) ? r.j.length : 0;
        }],
        ["Finnhub", async (t) => {
            const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
            const to = new Date().toISOString().slice(0, 10);
            const r = await get(`https://finnhub.io/api/v1/company-news?symbol=${t}&from=${from}&to=${to}&token=${FINNHUB}`);
            return Array.isArray(r.j) ? r.j.length : 0;
        }],
    ]) {
        if ((vendor === "FMP" && !FMP) || (vendor === "Finnhub" && !FINNHUB)) continue;
        const counts = [];
        for (const t of SMALL_CAPS) counts.push(`${t}:${await fn(t)}`);
        console.log(`  ${vendor.padEnd(8)} ${counts.join("  ")}`);
    }

    // ── 다종목 1콜 지원 ──
    console.log(`\n▌다종목 1콜 효율`);
    if (FMP) {
        const r = await get(`https://financialmodelingprep.com/stable/news/stock?symbols=NVDA,TSLA,AAPL,MSFT,AMZN&limit=60&apikey=${FMP}`);
        const a = Array.isArray(r.j) ? r.j : [];
        const bySym = {};
        a.forEach((x) => { bySym[x.symbol] = (bySym[x.symbol] || 0) + 1; });
        console.log(`  FMP      5종목 1콜 → ${a.length}건 · ${JSON.stringify(bySym)} · ${r.ms}ms`);
    }
    if (FINNHUB) console.log(`  Finnhub  다종목 미지원 (종목당 1콜 필요)`);

    // ── 일반/시장 뉴스 ──
    console.log(`\n▌일반 시장 뉴스`);
    if (FMP) {
        const r = await get(`https://financialmodelingprep.com/stable/news/general-latest?limit=50&apikey=${FMP}`);
        const a = Array.isArray(r.j) ? r.j : [];
        console.log(`  FMP      ${a.length}건 · 발행사 ${new Set(a.map(x => x.site)).size} · 최신 ${a.length ? AGE_H(a[0].publishedDate)?.toFixed(1) : "-"}h`);
    }
    if (FINNHUB) {
        const r = await get(`https://finnhub.io/api/v1/news?category=general&token=${FINNHUB}`);
        const a = Array.isArray(r.j) ? r.j : [];
        console.log(`  Finnhub  ${a.length}건 · 발행사 ${new Set(a.map(x => x.source)).size} · 최신 ${a.length ? ((Date.now() - a[0].datetime * 1000) / 3600000).toFixed(1) : "-"}h`);
    }

    console.log("\n" + "═".repeat(96));
})();
