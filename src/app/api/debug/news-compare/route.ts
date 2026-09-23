/**
 * GET /api/debug/news-compare — 뉴스 원천 3종(FMP·Intrinio·RSS) «같은 시각·같은 종목» 실측 비교.
 *
 * ★2026-09-24 대표 지시: «추측 말고 실측으로 — FMP·Intrinio·RSS 중 SIGNUM·UC 에 가장 적합한 것».
 *   8/29 비교(fmpNewsAdapter.ts 머리말)는 종목 정확도·발행사·본문만 쟀고 «신선도»와 RSS 는 없었다.
 *
 * 안전: 종목 목록 고정(입력 불가) · 기사 원문을 내보내지 않고 «집계 수치만» · 결과 15분 캐시
 *       (몇 번을 불러도 벤더 호출은 15분에 한 번). 키는 서버 env 에서만 읽고 응답에 싣지 않는다.
 */
import { NextResponse } from "next/server";
import { getFromCache, setInCache } from "@/services/redisClient";
import { fmpEtToMs } from "@/lib/fmpTime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CACHE_KEY = "debug:news-compare:v3"; // v3(9/24): FMP 시각을 뉴욕 벽시계로 해석 — v2 는 FMP 를 4시간 늙게 쟀다
const TTL = 900;
const FMP_KEY = process.env.FMP_API_KEY || "";
const INTRINIO_KEY = process.env.INTRINIO_API_KEY || "";
const INTRINIO_BASE = process.env.INTRINIO_BASE_URL || "https://api-v2.intrinio.com";

const TICKERS: Record<string, RegExp> = {
    NVDA: /\bnvidia\b/i, AAPL: /\bapple\b/i, TSLA: /\btesla\b/i, MU: /\bmicron\b/i, GS: /\bgoldman\b/i,
    COST: /\bcostco\b/i, NKE: /\bnike\b/i, AMD: /\bamd\b|advanced micro/i, META: /\bmeta\b|facebook/i, PLTR: /\bpalantir\b/i,
};

// 구글 뉴스 검색어 — 티커만 쓰면 «COST stock»이 비용 기사로 샌다(v1 실측 COST 정확도 6%) → 회사명으로
const GQ: Record<string, string> = { NVDA: "Nvidia", AAPL: "Apple", TSLA: "Tesla", MU: "Micron", GS: "Goldman Sachs", COST: "Costco", NKE: "Nike", AMD: "AMD", META: "Meta Platforms", PLTR: "Palantir" };
type Item = { title: string; body: string; ts: number | null; publisher: string };

async function getText(url: string, init?: RequestInit): Promise<{ status: number; text: string; ms: number }> {
    const t0 = Date.now();
    try {
        const r = await fetch(url, { ...init, signal: AbortSignal.timeout(12000), cache: "no-store" });
        return { status: r.status, text: await r.text(), ms: Date.now() - t0 };
    } catch (e: any) {
        return { status: 0, text: String(e?.message || e), ms: Date.now() - t0 };
    }
}
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const strip = (s: string) => String(s || "").replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();

function parseRss(xml: string): Item[] {
    const out: Item[] = [];
    for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
        const b = m[0];
        const pick = (tag: string) => { const x = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")); return x ? x[1].replace(/^<!\[CDATA\[|\]\]>$/g, "") : ""; };
        const src = b.match(/<source[^>]*url="([^"]+)"[^>]*>([\s\S]*?)<\/source>/i);
        const d = Date.parse(pick("pubDate"));
        out.push({ title: strip(pick("title")), body: strip(pick("description")), ts: Number.isFinite(d) ? d : null,
            publisher: src ? (host(src[1]) || strip(src[2])) : host(strip(pick("link"))) });
    }
    return out;
}
function fmpItems(json: any): Item[] {
    return (Array.isArray(json) ? json : []).map((a: any) => {
        const d = fmpEtToMs(a.publishedDate); // ★FMP 는 UTC 가 아니라 뉴욕 벽시계(9/24 원문 페이지 대조 12/12 = +240분)
        return { title: String(a.title || ""), body: String(a.text || ""), ts: d, publisher: String(a.site || a.publisher || "") };
    });
}
function intrinioItems(json: any): Item[] {
    return (json?.news || []).map((a: any) => {
        const d = Date.parse(String(a.publication_date || ""));
        return { title: String(a.title || ""), body: String(a.summary || ""), ts: Number.isFinite(d) ? d : null, publisher: host(String(a.url || "")) || String(a.source || "") };
    });
}

function metrics(items: Item[], now: number, rel?: { sym: string; name: RegExp }) {
    const ages = items.map((i) => (i.ts ? (now - i.ts) / 60000 : null)).filter((x): x is number => x !== null && x >= -5);
    const recent = ages.filter((a) => a <= 48 * 60).sort((a, b) => a - b);
    const med = recent.length ? recent[Math.floor(recent.length / 2)] : null;
    const titles = items.map((i) => i.title.toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 80));
    const dup = titles.length - new Set(titles).size;
    const out: Record<string, any> = {
        n: items.length,
        n24h: ages.filter((a) => a <= 1440).length,
        n1h: ages.filter((a) => a <= 60).length,
        newestMin: recent.length ? Math.round(recent[0]) : null,
        medianMin48h: med !== null ? Math.round(med) : null,
        publishers: new Set(items.map((i) => i.publisher).filter(Boolean)).size,
        bodyPct: items.length ? Math.round((items.filter((i) => i.body.length >= 200).length / items.length) * 100) : null,
        dupTitles: dup,
    };
    if (rel) {
        const symRe = new RegExp(`(^|[^A-Za-z])\\$?${rel.sym}([^A-Za-z]|$)`);
        const hit = items.filter((i) => symRe.test(i.title) || rel.name.test(i.title) || rel.name.test(i.body.slice(0, 600)) || symRe.test(i.body.slice(0, 600))).length;
        out.relevantPct = items.length ? Math.round((hit / items.length) * 100) : null;
        out.relevantN = hit;
        // 종목과 무관한 기사를 걸러낸 «뒤»에도 신선한가 — 거른 뒤의 최신 기사 나이와 24시간 건수
        const relItems = items.filter((i) => symRe.test(i.title) || rel.name.test(i.title) || rel.name.test(i.body.slice(0, 600)) || symRe.test(i.body.slice(0, 600)));
        const relAges = relItems.map((i) => (i.ts ? (now - i.ts) / 60000 : null)).filter((x): x is number => x !== null && x >= -5).sort((a, b) => a - b);
        out.relNewestMin = relAges.length ? Math.round(relAges[0]) : null;
        out.rel24h = relAges.filter((a) => a <= 1440).length;
    }
    return out;
}

async function measure() {
    const now = Date.now();
    const perTicker: Record<string, Record<string, any>> = { fmp: {}, intrinio: {}, rss_yahoo: {}, rss_google: {} };
    const http: Record<string, any> = {};
    await Promise.all(Object.entries(TICKERS).map(async ([sym, name]) => {
        const rel = { sym, name };
        const [f, i, y, g] = await Promise.all([
            FMP_KEY ? getText(`https://financialmodelingprep.com/stable/news/stock?symbols=${sym}&limit=50&apikey=${FMP_KEY}`) : Promise.resolve({ status: -1, text: "", ms: 0 }),
            INTRINIO_KEY ? getText(`${INTRINIO_BASE}/companies/${sym}/news?page_size=50`, { headers: { Authorization: `Bearer ${INTRINIO_KEY}` } }) : Promise.resolve({ status: -1, text: "", ms: 0 }),
            getText(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${sym}&region=US&lang=en-US`, { headers: { "user-agent": "Mozilla/5.0" } }),
            getText(`https://news.google.com/rss/search?q=${encodeURIComponent(GQ[sym] + " stock when:2d")}&hl=en-US&gl=US&ceid=US:en`, { headers: { "user-agent": "Mozilla/5.0" } }),
        ]);
        const safe = (fn: () => Item[]) => { try { return fn(); } catch { return []; } };
        perTicker.fmp[sym] = { http: f.status, ms: f.ms, ...metrics(safe(() => fmpItems(JSON.parse(f.text))), now, rel) };
        perTicker.intrinio[sym] = { http: i.status, ms: i.ms, ...metrics(safe(() => intrinioItems(JSON.parse(i.text))), now, rel) };
        perTicker.rss_yahoo[sym] = { http: y.status, ms: y.ms, ...metrics(safe(() => parseRss(y.text)), now, rel) };
        perTicker.rss_google[sym] = { http: g.status, ms: g.ms, ...metrics(safe(() => parseRss(g.text)), now, rel) };
    }));
    // 시장 전체(가디언 뉴스 펄스 용도)
    const market: Record<string, any> = {};
    const mk: [string, Promise<{ status: number; text: string; ms: number }>, (t: string) => Item[]][] = [
        ["fmp_general", FMP_KEY ? getText(`https://financialmodelingprep.com/stable/news/general-latest?limit=50&apikey=${FMP_KEY}`) : Promise.resolve({ status: -1, text: "", ms: 0 }), (t) => fmpItems(JSON.parse(t))],
        ["fmp_stock_latest", FMP_KEY ? getText(`https://financialmodelingprep.com/stable/news/stock-latest?limit=50&apikey=${FMP_KEY}`) : Promise.resolve({ status: -1, text: "", ms: 0 }), (t) => fmpItems(JSON.parse(t))],
        ["intrinio_all_companies", INTRINIO_KEY ? getText(`${INTRINIO_BASE}/companies/news?page_size=50`, { headers: { Authorization: `Bearer ${INTRINIO_KEY}` } }) : Promise.resolve({ status: -1, text: "", ms: 0 }), (t) => intrinioItems(JSON.parse(t))],
        ["rss_cnbc", getText("https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114", { headers: { "user-agent": "Mozilla/5.0" } }), parseRss],
        ["rss_marketwatch", getText("https://feeds.content.dowjones.io/public/rss/mw_topstories", { headers: { "user-agent": "Mozilla/5.0" } }), parseRss],
        ["rss_yahoo_spx", getText("https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US", { headers: { "user-agent": "Mozilla/5.0" } }), parseRss],
        ["rss_google_macro", getText("https://news.google.com/rss/search?q=(stock+market+OR+Federal+Reserve+OR+Treasury+yields+OR+oil+prices)+when:3h&hl=en-US&gl=US&ceid=US:en", { headers: { "user-agent": "Mozilla/5.0" } }), parseRss],
    ];
    await Promise.all(mk.map(async ([k, p, parse]) => {
        const r = await p; let items: Item[] = [];
        try { items = parse(r.text); } catch { /* 형식 오류 = 0건 */ }
        market[k] = { http: r.status, ms: r.ms, ...metrics(items, now) };
    }));
    // 원천별 요약(종목 10개 합산)
    const summary: Record<string, any> = {};
    for (const [src, rows] of Object.entries(perTicker)) {
        const v = Object.values(rows);
        const sum = (k: string) => v.reduce((a, r: any) => a + (Number(r[k]) || 0), 0);
        const medOf = (k: string) => { const xs = v.map((r: any) => r[k]).filter((x: any) => typeof x === "number").sort((a: number, b: number) => a - b); return xs.length ? xs[Math.floor(xs.length / 2)] : null; };
        const n = sum("n");
        summary[src] = { tickersOk: v.filter((r: any) => r.http === 200 && r.n > 0).length, items: n, items24h: sum("n24h"),
            relevantPct: n ? Math.round((sum("relevantN") / n) * 100) : null, medianNewestMin: medOf("newestMin"), medianOfMedianMin48h: medOf("medianMin48h"),
            medianRelNewestMin: medOf("relNewestMin"), rel24h: sum("rel24h"),
            medianPublishers: medOf("publishers"), medianBodyPct: medOf("bodyPct"), dupTitles: sum("dupTitles") };
    }
    return { generatedAt: new Date(now).toISOString(), tickers: Object.keys(TICKERS), keys: { fmp: !!FMP_KEY, intrinio: !!INTRINIO_KEY }, summary, perTicker, market };
}

export async function GET() {
    const cached = await getFromCache<any>(CACHE_KEY).catch(() => null);
    if (cached && cached.generatedAt) return NextResponse.json({ cached: true, ...cached }, { headers: { "Cache-Control": "no-store" } });
    const data = await measure();
    setInCache(CACHE_KEY, data, TTL).catch(() => { /* 측정값 캐시 실패는 무해 */ });
    return NextResponse.json({ cached: false, ...data }, { headers: { "Cache-Control": "no-store" } });
}
