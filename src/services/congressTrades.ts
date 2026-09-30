/**
 * 의회 거래 공시 (상·하원) — 「스마트머니」 축의 신규 지표.
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 만들었나]
 *   Intrinio 이관으로 **다크풀 %** 와 **공매도 잔고**를 영구히 잃었다.
 *   둘 다 「기관이 무엇을 하고 있나」를 보여주던 축이다. 그 자리를
 *   내부자 거래·13F 로 일부 메웠는데, 의회 거래는 성격이 또 다르다:
 *     · 내부자 = 그 회사 임원      (회사 내부 정보)
 *     · 13F    = 기관 분기 보유    (느리고 뭉뚱그려짐)
 *     · 의회   = 정책 결정권자      ← **정책·규제 정보 우위**
 *
 *   STOCK Act 로 45일 내 공시가 의무이고, FMP 플랜에서 열려 있다(실측).
 *
 * [데이터 실측 2026-08-30]
 *   상원 100 + 하원 100건 · 공시일 2026-08-05 ~ 08-28
 *   필드: symbol · transactionDate · disclosureDate · type · amount(구간) ·
 *         firstName/lastName · office/district · assetDescription · link
 *
 * ⚠️ 금액은 **구간**으로만 공시된다("$100,001 - $250,000"). 정확한 금액이
 *    아니므로 중간값을 쓰되, 그 사실을 `amountIsEstimate` 로 밝힌다.
 *    구간을 단일 숫자처럼 보여 주면 없는 정밀도를 주장하는 것이 된다.
 *
 * ★2026-09-27 «90일»은 사실 «원(院)별 최신 250건»이었다.
 *   예전엔 `*-latest` 를 page=0&limit=250 한 번만 불렀다 → 그 250건이 닿는 공시일까지만 보였고,
 *   그걸 90일 창으로 거른 부분집합이 게시물·공개 데이터셋에 «90일 전체»로 나갔다(16명·192건).
 *   이제 원마다 페이지를 넘겨 «한 페이지 전체가 창 시작(−여유)보다 오래된» 지점까지 받고,
 *   어디까지 받았는지(coverage)를 결과에 같이 싣는다 — 부분집합이면 부분집합이라고 말할 수 있게.
 *   창 안의 거래는 공시일 ≥ 매매일 ≥ 창 시작이므로, 공시일 내림차순 원천을 창 시작까지만 받으면 빠짐이 없다.
 *   여유(MARGIN_DAYS)는 원천 정렬이 어긋날 때를 위한 보험이고, 어긋남은 outOfOrder 로 센다.
 */

const FMP_KEY = process.env.FMP_API_KEY || "";
const FMP_BASE = "https://financialmodelingprep.com/stable";

/** 한 페이지 크기 — 예전과 같은 250 */
const PAGE_LIMIT = 250;
/** 원당 최대 페이지 — FMP 호출 예산의 상한(캐시 채울 때 원당 최대 이만큼만 부른다) */
const PAGE_CAP = 12;
const PAGE_TIMEOUT_MS = 8000;
/** 페이지 넘김 전체 시한 — 넘으면 받은 데까지만 쓰고 «불완전»으로 표시한다 */
const FETCH_DEADLINE_MS = 30_000;
/** 기본 창(일) — 라우트의 기본 days 와 같다 */
export const CONGRESS_WINDOW_DAYS = 90;
/** 창 시작보다 더 내려가서 받는 여유(일) */
const MARGIN_DAYS = 14;

export interface CongressTrade {
    ticker: string;
    /** 실제 매매일 */
    transactionDate: string;
    /** 공시일 — 우리가 «알게 된» 날. 지연이 신호의 신선도다 */
    disclosureDate: string;
    side: "buy" | "sell" | "exchange";
    /** 공시 구간 원문 */
    amountRange: string;
    /** 구간 중간값(달러). 정확한 값이 아니다 */
    amountMid: number | null;
    person: string;
    chamber: "senate" | "house";
    /** 매매일 → 공시일 지연(일) */
    lagDays: number | null;
    link: string | null;
}

export interface CongressTickerSignal {
    ticker: string;
    buys: number;
    sells: number;
    /** 매수 − 매도 (중간값 기준, 달러) */
    netMid: number;
    /** 서로 다른 의원 수 — 한 사람이 여러 번 한 것과 구분한다 */
    people: number;
    lastTransaction: string;
    lastDisclosure: string;
    side: "buy" | "sell" | "mixed";
    amountIsEstimate: true;
}

/** 페이지 넘김이 멈춘 이유 — cutoff·exhausted 만 «끝까지 받았다»이다 */
export type CongressStopReason =
    | "cutoff"        // 한 페이지 전체가 목표 공시일보다 오래됐다 → 필요한 만큼 다 받았다
    | "exhausted"     // 원천이 더 줄 게 없다(2쪽 이후 빈 페이지)
    | "empty"         // 첫 페이지부터 비었다 — «공시 0건»이 아니라 실패로 본다
    | "page-cap"      // 페이지 상한에 걸렸다
    | "rate-limited"  // 429
    | "http-error"
    | "timeout"
    | "deadline"
    | "error"
    | "no-key";

export interface CongressChamberCoverage {
    chamber: CongressTrade["chamber"];
    pages: number;
    /** 페이지별로 원천이 준 행 수 — limit 을 지키는지 보는 근거 */
    pageRows: number[];
    /** 원천이 준 행(채권·펀드 등 티커 없는 행 포함) */
    rawRows: number;
    /** 티커·매매구분이 있어 쓰는 행 */
    rows: number;
    newestDisclosure: string | null;
    oldestDisclosure: string | null;
    stop: CongressStopReason;
    /** 앞 페이지들의 가장 오래된 공시일보다 «새» 공시일을 가진 행 수 — 원천 정렬 점검(0 이어야 정상) */
    outOfOrder: number;
    /** 이 공시일(포함) 이후의 행은 전부 받았다. "" = 원천 전체, null = 보장 못 함 */
    coveredFrom: string | null;
}

export interface CongressCoverage {
    fetchedAt: string;
    /** 목표로 한 가장 오래된 공시일(기본 창 시작 − 여유) */
    target: string;
    /** 두 원 모두 이 공시일(포함) 이후를 전부 받았다. null = 보장 못 함 */
    coveredFrom: string | null;
    /** 받은 시점 기준 기본 창(90일)을 전부 덮었는가 */
    complete: boolean;
    ms: number;
    chambers: CongressChamberCoverage[];
}

export interface CongressFetch {
    trades: CongressTrade[];
    coverage: CongressCoverage;
}

/**
 * ★2026-09-27 v1(배열) → v2({ trades, coverage }). 값 모양이 바뀌어 키도 바꾼다 —
 *   프리뷰와 운영이 같은 Redis 를 쓰므로 같은 키에 다른 모양을 쓰면 운영의 옛 라우트가 깨진다.
 */
const CACHE_KEY = "congress:trades:v2";

/** "$100,001 - $250,000" → 175000 · 파싱 실패면 null (0 으로 만들지 않는다) */
export function parseAmountRange(s: string): number | null {
    const nums = String(s || "").match(/[\d,]{4,}/g);
    if (!nums?.length) return null;
    const vals = nums.map((n) => Number(n.replace(/,/g, ""))).filter(Number.isFinite);
    if (!vals.length) return null;
    if (vals.length === 1) return vals[0];
    return Math.round((Math.min(...vals) + Math.max(...vals)) / 2);
}

function normSide(t: string): CongressTrade["side"] | null {
    const s = String(t || "").toLowerCase();
    if (s.includes("purchase") || s === "buy") return "buy";
    if (s.includes("sale") || s.includes("sold") || s === "sell") return "sell";
    if (s.includes("exchange")) return "exchange";
    return null;
}

function dayDiff(a: string, b: string): number | null {
    const x = Date.parse(a), y = Date.parse(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return Math.round((y - x) / 86400_000);
}

/** 창 시작일(YYYY-MM-DD, UTC) — 매매일이 이 날 이상이면 창 안이다 */
export function windowStart(days: number, now = Date.now()): string {
    return new Date(now - days * 86400_000).toISOString().slice(0, 10);
}

function nextDay(d: string): string {
    return new Date(Date.parse(`${d}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);
}

/**
 * 창 안의 «매수·매도» 인가 — 종목 신호(foldByTicker)와 종목별 행 목록이 같은 규칙을 쓴다.
 * 그래야 행 수 = 매수 + 매도 가 늘 맞는다.
 */
export function inWindow(t: Pick<CongressTrade, "side" | "transactionDate">, cut: string): boolean {
    if (t.side === "exchange") return false;
    return !(t.transactionDate && t.transactionDate < cut);
}

function toTrade(r: any, chamber: CongressTrade["chamber"]): CongressTrade | null {
    const ticker = String(r?.symbol || "").toUpperCase().trim();
    const side = normSide(r?.type);
    // 티커가 없으면 종목 신호로 못 쓴다 (채권·펀드 등이 섞여 온다)
    if (!ticker || !side) return null;
    const td = String(r?.transactionDate || "").slice(0, 10);
    const dd = String(r?.disclosureDate || "").slice(0, 10);
    return {
        ticker,
        transactionDate: td,
        disclosureDate: dd,
        side,
        amountRange: String(r?.amount || ""),
        amountMid: parseAmountRange(r?.amount),
        person: [r?.firstName, r?.lastName].filter(Boolean).join(" ").trim() || "—",
        chamber,
        lagDays: td && dd ? dayDiff(td, dd) : null,
        link: r?.link || null,
    };
}

/**
 * 한 원(院)을 페이지 넘기며 받는다 — `target` 공시일보다 «페이지 전체가» 오래된 페이지를 만나면 멈춘다.
 * 중간에 실패하면 받은 데까지 돌려주고 멈춘 이유를 coverage 에 남긴다(예전처럼 통째로 버리지 않는다).
 */
async function fetchChamber(
    path: string,
    chamber: CongressTrade["chamber"],
    target: string,
    deadline: number
): Promise<{ trades: CongressTrade[]; cov: CongressChamberCoverage }> {
    const cov: CongressChamberCoverage = {
        chamber, pages: 0, pageRows: [], rawRows: 0, rows: 0, newestDisclosure: null, oldestDisclosure: null,
        stop: "page-cap", outOfOrder: 0, coveredFrom: null,
    };
    const out: CongressTrade[] = [];
    if (!FMP_KEY) { cov.stop = "no-key"; return { trades: out, cov }; }
    // 짧은 페이지(limit 미만) 뒤에 또 행이 오면 원천이 limit 을 안 지키는 것 → 사이가 비었을 수 있다
    let sawShort = false, gap = false;
    for (let page = 0; page < PAGE_CAP; page++) {
        if (Date.now() > deadline) { cov.stop = "deadline"; break; }
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), PAGE_TIMEOUT_MS);
        let rows: any[];
        try {
            const res = await fetch(`${FMP_BASE}/${path}?page=${page}&limit=${PAGE_LIMIT}&apikey=${FMP_KEY}`, {
                signal: ctrl.signal,
                cache: "no-store",
            });
            if (res.status === 429) { cov.stop = "rate-limited"; break; }
            if (!res.ok) { cov.stop = "http-error"; break; }
            const j = await res.json();
            // 플랜 한도 등은 200 + {"Error Message": …} 로 온다 — 배열이 아니면 실패다
            if (!Array.isArray(j)) { cov.stop = "error"; break; }
            rows = j;
        } catch (e: any) {
            cov.stop = e?.name === "AbortError" ? "timeout" : "error";
            break;
        } finally {
            clearTimeout(timer);
        }
        if (!rows.length) { cov.stop = page === 0 ? "empty" : "exhausted"; break; }
        if (sawShort) gap = true;
        if (rows.length < PAGE_LIMIT) sawShort = true;
        const prevOldest = cov.oldestDisclosure;
        let pageNewest = "";
        for (const r of rows) {
            const dd = String(r?.disclosureDate || "").slice(0, 10);
            if (dd) {
                if (!pageNewest || dd > pageNewest) pageNewest = dd;
                if (!cov.newestDisclosure || dd > cov.newestDisclosure) cov.newestDisclosure = dd;
                if (!cov.oldestDisclosure || dd < cov.oldestDisclosure) cov.oldestDisclosure = dd;
                if (prevOldest && dd > prevOldest) cov.outOfOrder++;
            }
            const t = toTrade(r, chamber);
            if (t) out.push(t);
        }
        cov.pages++;
        cov.pageRows.push(rows.length);
        cov.rawRows += rows.length;
        if (pageNewest && pageNewest < target) { cov.stop = "cutoff"; break; }
    }
    cov.rows = out.length;
    // 어디부터 «빠짐없이» 받았나: 원천이 끝났으면 전부, 정렬이 맞았으면 가장 오래 본 날의 다음 날부터
    // (그날 행은 다음 페이지로 이어질 수 있다), 정렬이 어긋났으면 여유를 믿고 목표일까지만.
    // 페이지 사이가 비었을 수 있으면(gap) 아무것도 보장하지 않는다.
    if (gap || cov.pages === 0) cov.coveredFrom = null;
    else if (cov.stop === "exhausted") cov.coveredFrom = "";
    else if (cov.oldestDisclosure && cov.outOfOrder === 0) cov.coveredFrom = nextDay(cov.oldestDisclosure);
    else if (cov.stop === "cutoff") cov.coveredFrom = target;
    return { trades: out, cov };
}

/** 공시일 내림차순, 같으면 매매일 내림차순 — 같은 날 공시가 여러 건일 때 순서를 고정한다 */
function byDisclosureDesc(a: CongressTrade, b: CongressTrade): number {
    if (a.disclosureDate !== b.disclosureDate) return a.disclosureDate < b.disclosureDate ? 1 : -1;
    if (a.transactionDate !== b.transactionDate) return a.transactionDate < b.transactionDate ? 1 : -1;
    return 0;
}

async function fetchAll(): Promise<CongressFetch> {
    const t0 = Date.now();
    const target = windowStart(CONGRESS_WINDOW_DAYS + MARGIN_DAYS, t0);
    const deadline = t0 + FETCH_DEADLINE_MS;
    const [sen, hou] = await Promise.all([
        fetchChamber("senate-latest", "senate", target, deadline),
        fetchChamber("house-latest", "house", target, deadline),
    ]);
    const chambers = [sen.cov, hou.cov];
    const froms = chambers.map((c) => c.coveredFrom);
    const coveredFrom = froms.some((f) => f === null) ? null : (froms as string[]).reduce((a, b) => (a > b ? a : b), "");
    const coverage: CongressCoverage = {
        fetchedAt: new Date(t0).toISOString(),
        target,
        coveredFrom,
        complete: coveredFrom !== null && coveredFrom <= windowStart(CONGRESS_WINDOW_DAYS, t0),
        ms: Date.now() - t0,
        chambers,
    };
    console.log(
        `[congress] ${chambers.map((c) => `${c.chamber} pages=${c.pages} rows=${c.rows}/${c.rawRows} disclosed=${c.oldestDisclosure}~${c.newestDisclosure} stop=${c.stop} outOfOrder=${c.outOfOrder}`).join(" · ")}` +
        ` · coveredFrom=${coveredFrom} complete=${coverage.complete} ${coverage.ms}ms`
    );
    return { trades: [...sen.trades, ...hou.trades].sort(byDisclosureDesc), coverage };
}

let inflight: Promise<CongressFetch> | null = null;

/**
 * 상·하원 공시를 창(90일+여유)만큼 페이지 넘겨 합쳐 온다.
 * 같은 인스턴스에 동시에 들어온 캐시 미스는 한 번의 수집을 나눠 쓴다(페이지 수만큼 FMP 호출이 곱해지지 않게).
 */
export function getCongressTrades(): Promise<CongressFetch> {
    if (!inflight) inflight = fetchAll().finally(() => { inflight = null; });
    return inflight;
}

/** 이 수집이 요청 창(days)을 빠짐없이 덮는가 */
export function coversWindow(cov: Pick<CongressCoverage, "coveredFrom"> | null | undefined, days: number, now = Date.now()): boolean {
    return !!cov && cov.coveredFrom !== null && cov.coveredFrom !== undefined && cov.coveredFrom <= windowStart(days, now);
}

/**
 * «같은 사람» 판정 키.
 *
 * ★2026-09-23 실측: 같은 의원이 공시마다 다른 표기로 온다 —
 *   "Scott Mr Franklin" / "Scott Franklin", "Gilbert Ray Cisneros" / "Gilbert Cisneros".
 *   이름 문자열 그대로 세면 한 사람이 «서로 다른 의원 2명»이 되고(JPM 3명→실제 2명, GOOGL 4→3, NVDA 4→3),
 *   그 숫자가 카드의 «우연일 가능성이 낮다» 문구를 켠다 — 아래 foldByTicker 가 막으려던 착시를 그대로 만든다.
 *   호칭·접미사를 빼고 «이름 첫 단어 + 성»에 원(院)을 붙여 묶는다. 못 묶는 표기(애칭 등)는 예전처럼 따로 센다.
 */
const HONORIFIC = new Set(["mr", "mrs", "ms", "miss", "dr", "hon", "honorable", "sen", "senator", "rep", "representative"]);
const SUFFIX = new Set(["jr", "sr", "ii", "iii", "iv"]);
export function personKey(person: string, chamber?: string): string {
    const toks = String(person || "").toLowerCase().replace(/[.,]/g, " ").split(/\s+/).filter((w) => w && !HONORIFIC.has(w));
    while (toks.length > 2 && SUFFIX.has(toks[toks.length - 1])) toks.pop();
    const name = toks.length > 1 ? `${toks[0]} ${toks[toks.length - 1]}` : toks[0] || "—";
    return `${chamber || ""}:${name}`;
}

/**
 * 종목별 신호로 접는다.
 *
 * ⚠️ «건수»가 아니라 «사람 수»를 같이 센다. 한 의원이 같은 종목을 여러 번
 *    나눠 신고하는 일이 흔해서(실측: GS 18건 중 상당수가 동일인), 건수만
 *    보면 한 사람의 행동이 집단 신호처럼 보인다.
 */
export function foldByTicker(trades: CongressTrade[], sinceDays = 90): CongressTickerSignal[] {
    const cut = windowStart(sinceDays);
    const map = new Map<string, { buys: number; sells: number; net: number; people: Set<string>; lastT: string; lastD: string }>();
    for (const t of trades) {
        if (!inWindow(t, cut)) continue;
        const e = map.get(t.ticker) || { buys: 0, sells: 0, net: 0, people: new Set<string>(), lastT: "", lastD: "" };
        if (t.side === "buy") { e.buys++; e.net += t.amountMid ?? 0; }
        else { e.sells++; e.net -= t.amountMid ?? 0; }
        e.people.add(personKey(t.person, t.chamber));
        if (t.transactionDate > e.lastT) e.lastT = t.transactionDate;
        if (t.disclosureDate > e.lastD) e.lastD = t.disclosureDate;
        map.set(t.ticker, e);
    }
    return [...map.entries()]
        .map(([ticker, e]) => ({
            ticker,
            buys: e.buys,
            sells: e.sells,
            netMid: e.net,
            people: e.people.size,
            lastTransaction: e.lastT,
            lastDisclosure: e.lastD,
            side: (e.buys > e.sells ? "buy" : e.sells > e.buys ? "sell" : "mixed") as CongressTickerSignal["side"],
            amountIsEstimate: true as const,
        }))
        .sort((a, b) => Math.abs(b.netMid) - Math.abs(a.netMid));
}

export const CONGRESS_CACHE_KEY = CACHE_KEY;
