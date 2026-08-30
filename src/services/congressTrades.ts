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
 */

const FMP_KEY = process.env.FMP_API_KEY || "";
const FMP_BASE = "https://financialmodelingprep.com/stable";

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

const CACHE_KEY = "congress:trades:v1";

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

async function fetchChamber(path: string, chamber: CongressTrade["chamber"]): Promise<CongressTrade[]> {
    if (!FMP_KEY) return [];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
        const res = await fetch(`${FMP_BASE}/${path}?page=0&limit=250&apikey=${FMP_KEY}`, {
            signal: ctrl.signal,
            cache: "no-store",
        });
        if (!res.ok) return [];
        const rows = await res.json();
        if (!Array.isArray(rows)) return [];
        return rows
            .map((r: any): CongressTrade | null => {
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
            })
            .filter(Boolean) as CongressTrade[];
    } catch {
        return [];
    } finally {
        clearTimeout(timer);
    }
}

/** 상·하원 최근 공시를 합쳐 온다 */
export async function getCongressTrades(): Promise<CongressTrade[]> {
    const [sen, hou] = await Promise.all([
        fetchChamber("senate-latest", "senate"),
        fetchChamber("house-latest", "house"),
    ]);
    return [...sen, ...hou].sort((a, b) => (a.disclosureDate < b.disclosureDate ? 1 : -1));
}

/**
 * 종목별 신호로 접는다.
 *
 * ⚠️ «건수»가 아니라 «사람 수»를 같이 센다. 한 의원이 같은 종목을 여러 번
 *    나눠 신고하는 일이 흔해서(실측: GS 18건 중 상당수가 동일인), 건수만
 *    보면 한 사람의 행동이 집단 신호처럼 보인다.
 */
export function foldByTicker(trades: CongressTrade[], sinceDays = 90): CongressTickerSignal[] {
    const cut = new Date(Date.now() - sinceDays * 86400_000).toISOString().slice(0, 10);
    const map = new Map<string, { buys: number; sells: number; net: number; people: Set<string>; lastT: string; lastD: string }>();
    for (const t of trades) {
        if (t.side === "exchange") continue;
        if (t.transactionDate && t.transactionDate < cut) continue;
        const e = map.get(t.ticker) || { buys: 0, sells: 0, net: 0, people: new Set<string>(), lastT: "", lastD: "" };
        if (t.side === "buy") { e.buys++; e.net += t.amountMid ?? 0; }
        else { e.sells++; e.net -= t.amountMid ?? 0; }
        e.people.add(t.person);
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
