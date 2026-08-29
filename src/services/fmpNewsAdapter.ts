/**
 * FMP 뉴스 → Massive(/v2/reference/news) 응답 형태 어댑터
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 FMP 인가]  Massive 뉴스는 2026-09-23 해지된다. 대안 3사를 실측 비교했다.
 *
 *   | 항목            | Massive(현재) | Intrinio  | **FMP**   |
 *   |-----------------|--------------|-----------|-----------|
 *   | 종목 정확도      | 20/20 100%   | 9/30 30%  | 26/30 87% |
 *   | 발행사 수        | 3곳          | yahoo 1곳 | **17곳**  |
 *   | 본문            | 있음          | 요약만    | 31/50     |
 *   | 다종목 1콜       | ✗            | ✗         | **✓**     |
 *   | 소형주 커버      | -            | -         | ✓         |
 *
 *   Intrinio 뉴스는 `/companies/NVDA/news` 에 「GE Vernova」「Ford」가 섞여 나온다
 *   (30건 중 NVDA 언급 9건). 종목 연결을 신뢰할 수 없어 탈락.
 *   FMP 는 이미 결제된 스택이다.
 *
 * [잃는 것]  Massive 의 `insights`(종목별 감성분석 + 근거)와 `keywords`.
 *            우리는 자체 AI 분석 레이어가 있어 대체 가능하다.
 *            없는 값을 지어내지 않고 **빈 배열**로 둔다.
 *
 * [설계]  소비처 30여 곳이 `fetchMassive('/v2/reference/news')` 를 부른다.
 *         라우팅 지점 한 곳만 바꾸면 소비처는 전부 그대로 동작한다.
 */

const FMP_KEY = process.env.FMP_API_KEY || "";
const FMP_BASE = "https://financialmodelingprep.com/stable";

export function hasFmpKey(): boolean {
    return !!FMP_KEY;
}

interface FmpArticle {
    symbol?: string;
    publishedDate?: string;
    publisher?: string;
    title?: string;
    image?: string;
    site?: string;
    text?: string;
    url?: string;
}

/** "2026-08-28 18:15:00" → "2026-08-28T18:15:00Z" (FMP 는 UTC 로 준다) */
function toIso(d?: string): string {
    if (!d) return new Date().toISOString();
    if (d.includes("T")) return d.endsWith("Z") ? d : `${d}Z`;
    return `${d.replace(" ", "T")}Z`;
}

/** URL 로부터 안정적인 id 생성 — 소비처가 중복 제거에 쓴다 */
function stableId(url: string, title: string): string {
    const s = `${url}|${title}`;
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < s.length; i++) {
        h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0;
        h2 = Math.imul(h2 + s.charCodeAt(i), 2654435761) >>> 0;
    }
    return `fmp_${h1.toString(16)}${h2.toString(16)}`;
}

function toMassiveShape(a: FmpArticle, requestedTickers: string[]) {
    const url = a.url || "";
    const title = a.title || "";
    const site = a.site || a.publisher || "";
    // FMP 는 요청한 심볼을 그대로 돌려준다. 요청이 없었으면(일반 뉴스) 빈 배열.
    const tickers = a.symbol ? [a.symbol.toUpperCase()] : [];
    return {
        id: stableId(url, title),
        publisher: {
            name: a.publisher || site || "Unknown",
            homepage_url: site ? `https://${site.replace(/^https?:\/\//, "")}` : null,
            logo_url: null,
            favicon_url: null,
        },
        title,
        author: null,
        published_utc: toIso(a.publishedDate),
        article_url: url,
        tickers,
        image_url: a.image || null,
        description: a.text || "",
        // Massive 만 제공하던 것 — 지어내지 않고 빈 배열
        keywords: [] as string[],
        insights: [] as any[],
        _source: "fmp",
    };
}

async function fmpGet(path: string, timeoutMs = 12000): Promise<any> {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${FMP_BASE}/${path.replace(/^\//, "")}${sep}apikey=${FMP_KEY}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) throw new Error(`FMP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Massive `/v2/reference/news` 대응.
 *
 * 지원하는 파라미터 (Massive 호출부가 실제로 쓰는 것들):
 *   ticker            — 단일 또는 콤마 구분 다종목
 *   limit             — 최대 건수
 *   published_utc.gte — 이 시각 이후만 (클라이언트 필터로 처리)
 *   order / sort      — 항상 최신순이므로 무시
 */
export async function getNewsFromFmp(params: {
    ticker?: string;
    limit?: number;
    since?: string;
}): Promise<any> {
    if (!FMP_KEY) return undefined;

    const limit = Math.min(Math.max(params.limit || 20, 1), 250);
    const tickers = (params.ticker || "")
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);

    let raw: any;
    if (tickers.length) {
        // 다종목을 1콜로 — Massive 는 종목당 1콜이 필요했다
        raw = await fmpGet(`news/stock?symbols=${tickers.join(",")}&limit=${limit}`);
    } else {
        raw = await fmpGet(`news/general-latest?limit=${limit}`);
    }

    let list: FmpArticle[] = Array.isArray(raw) ? raw : [];

    // published_utc.gte 필터 (FMP 는 서버측 필터가 없다)
    if (params.since) {
        const cut = Date.parse(params.since);
        if (Number.isFinite(cut)) {
            list = list.filter((a) => Date.parse(toIso(a.publishedDate)) >= cut);
        }
    }

    const results = list
        .filter((a) => a.title && a.url)
        .sort((a, b) => Date.parse(toIso(b.publishedDate)) - Date.parse(toIso(a.publishedDate)))
        .slice(0, limit)
        .map((a) => toMassiveShape(a, tickers));

    return {
        status: "OK",
        count: results.length,
        results,
        request_id: `fmp-news-${Date.now()}`,
        _source: "fmp",
    };
}
