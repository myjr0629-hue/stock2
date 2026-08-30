/**
 * 지수 브레드스 — 구성종목 중 «20일 이동평균 위»에 있는 비율.
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 만들었나 — 화면이 라벨과 다른 값을 보여주고 있었다]
 *   가디언 REALITY CHECK 의 게이지가 「NDX 20D」·「DOW 20D」라고 쓰여 있고
 *   도움말도 *「100% 는 구성 종목 전체가 20일 이평선 상위에 위치함을 의미」*
 *   라고 설명하는데, 실제로 그리던 값은 **RVOL(상대거래량)** 이었다.
 *   완전히 다른 지표다.
 *
 *   게다가 RVOL 은 «정규장» 지표라 장 밖에선 측정되지 않는다 → 밤·주말 내내
 *   두 게이지가 «—/장 종료» 로 비어 있었다. 라벨이 말하는 브레드스는
 *   **종가로 계산하므로 주말에도 나와야 하는 값**이다.
 *
 * [데이터]
 *   `intrinio:eod:history` = { dates: [20거래일], closes: { TICKER: [20개] } }
 *   실측(2026-08-30): 20일 × **12,222종목**. 주말에도 금요일까지 채워져 있다.
 *
 * ⚠️ 구성종목 목록은 시간이 지나면 낡는다(지수는 매년 교체된다).
 *    그래서 «몇 종목을 실제로 계산했는지»(coverage)를 같이 돌려준다.
 *    커버리지가 낮으면 화면이 그 사실을 말할 수 있어야 한다 — 낡은 목록으로
 *    계산한 60%를 «시장의 60%»라고 말하면 그게 조용한 거짓이 된다.
 */

const PROXY = process.env.EC2_REDIS_PROXY_URL || "http://52.23.98.13:8081";
const PROXY_KEY = process.env.REDIS_PROXY_KEY || process.env.EC2_REDIS_PROXY_KEY || "signum-redis-proxy-2026";
const HISTORY_KEY = "intrinio:eod:history";

/** 다우 30 (2026 기준) */
export const DOW_30 = [
    "AAPL", "AMGN", "AMZN", "AXP", "BA", "CAT", "CRM", "CSCO", "CVX", "DIS",
    "GS", "HD", "HON", "IBM", "JNJ", "JPM", "KO", "MCD", "MMM", "MRK",
    "MSFT", "NKE", "NVDA", "PG", "SHW", "TRV", "UNH", "V", "VZ", "WMT",
];

/** 나스닥 100 (2026 기준) */
export const NDX_100 = [
    "AAPL", "ABNB", "ADBE", "ADI", "ADP", "ADSK", "AEP", "AMAT", "AMD", "AMGN",
    "AMZN", "ANSS", "APP", "ARM", "ASML", "AVGO", "AZN", "BIIB", "BKNG", "BKR",
    "CCEP", "CDNS", "CDW", "CEG", "CHTR", "CMCSA", "COST", "CPRT", "CRWD", "CSCO",
    "CSGP", "CSX", "CTAS", "CTSH", "DASH", "DDOG", "DLTR", "DXCM", "EA", "EXC",
    "FANG", "FAST", "FTNT", "GEHC", "GFS", "GILD", "GOOGL", "HON", "IDXX", "ILMN",
    "INTC", "INTU", "ISRG", "KDP", "KHC", "KLAC", "LIN", "LRCX", "LULU", "MAR",
    "MCHP", "MDB", "MDLZ", "MELI", "META", "MNST", "MRVL", "MSFT", "MU", "NFLX",
    "NVDA", "NXPI", "ODFL", "ON", "ORLY", "PANW", "PAYX", "PCAR", "PDD", "PEP",
    "PLTR", "PYPL", "QCOM", "REGN", "ROP", "ROST", "SBUX", "SNPS", "TEAM", "TMUS",
    "TSLA", "TTD", "TTWO", "TXN", "VRSK", "VRTX", "WBD", "WDAY", "XEL", "ZS",
];

export interface BreadthResult {
    /** 20일 이평 위에 있는 구성종목 비율 (0~1). 표본이 얇으면 null */
    pctAbove20: number | null;
    /** 실제로 계산에 들어간 종목 수 */
    covered: number;
    /** 목록상 구성종목 수 */
    universe: number;
    /** 마지막 거래일 (표시용) */
    asOf: string | null;
}

type HistoryPayload = { dates: string[]; closes: Record<string, (number | null)[]> };
let _cache: { at: number; data: HistoryPayload } | null = null;
const TTL_MS = 30 * 60_000;

async function loadHistory(): Promise<HistoryPayload | null> {
    if (_cache && Date.now() - _cache.at < TTL_MS) return _cache.data;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
        const res = await fetch(`${PROXY}/get?key=${encodeURIComponent(HISTORY_KEY)}`, {
            headers: { Authorization: `Bearer ${PROXY_KEY}` },
            signal: ctrl.signal,
            cache: "no-store",
        });
        if (!res.ok) return null;
        const raw = await res.json();
        const val = typeof raw?.result === "string" ? JSON.parse(raw.result) : raw?.result;
        if (!Array.isArray(val?.dates) || !val?.closes) return null;
        _cache = { at: Date.now(), data: val as HistoryPayload };
        return _cache.data;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 구성종목 중 «마지막 종가 > 20일 단순이동평균» 인 비율.
 *
 * 종목마다 종가가 20개 다 있진 않다(신규 상장·거래정지). **10개 미만이면
 * 그 종목은 세지 않는다** — 표본이 얇은 평균을 «이평선»이라고 부를 수 없다.
 */
export async function computeIndexBreadth(tickers: string[]): Promise<BreadthResult> {
    const empty: BreadthResult = { pctAbove20: null, covered: 0, universe: tickers.length, asOf: null };
    const h = await loadHistory();
    if (!h) return empty;

    const asOf = h.dates.length ? h.dates[h.dates.length - 1] : null;
    let above = 0;
    let covered = 0;

    for (const t of tickers) {
        const series = h.closes[t];
        if (!Array.isArray(series)) continue;
        const vals = series.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
        if (vals.length < 10) continue;                 // 표본이 얇으면 계산하지 않는다
        const last = vals[vals.length - 1];
        const ma = vals.reduce((a, b) => a + b, 0) / vals.length;
        covered++;
        if (last > ma) above++;
    }

    // 구성종목의 절반도 못 채우면 «지수 브레드스» 라고 말할 수 없다
    if (covered < Math.ceil(tickers.length * 0.5)) {
        return { ...empty, covered, asOf };
    }
    return {
        pctAbove20: Math.round((above / covered) * 1000) / 1000,
        covered,
        universe: tickers.length,
        asOf,
    };
}

export async function getIndexBreadth(): Promise<{ ndx: BreadthResult; dow: BreadthResult }> {
    const [ndx, dow] = await Promise.all([
        computeIndexBreadth(NDX_100),
        computeIndexBreadth(DOW_30),
    ]);
    return { ndx, dow };
}
