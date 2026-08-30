/**
 * 애널리스트 «변화 이벤트» — 등급 상하향 + 목표가 리비전 추세.
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 만들었나]
 *   컨센서스 «스냅샷»은 이미 쓰고 있다(/api/live/analyst → Command 화면):
 *     NVDA BUY · 79명 · 76% 강세 · 목표가 $345.21
 *   그런데 그건 **정지 화면**이다. 「방금 무슨 일이 있었나」가 없다 —
 *   골드만이 어제 중립→매수로 올렸다는 사실이 어디에도 안 나온다.
 *   컨센서스는 천천히 움직이므로, 움직임 자체가 정보다.
 *
 * [데이터 실측 2026-08-30]
 *   grades?symbol=X  — 실명 기관 · previousGrade → newGrade · action
 *     NVDA 1138건 {maintain 1023, upgrade 71, downgrade 44}
 *     AMD  776건  · 최근: 2026-08-25 Raymond James Outperform → Strong Buy
 *     TSLA 1315건 {maintain 1110, upgrade 96, downgrade 109}
 *   price-target-summary?symbol=X — 기간별 평균 목표가
 *     NVDA 1개월 343.95(21명) · 분기 343.32(22) · 1년 298.28(97)
 *
 * ⚠️ 대부분은 `maintain` 이다. 그걸 이벤트로 세면 «매일 무슨 일이 일어나는»
 *    것처럼 보인다. 상하향만 이벤트로 취급한다.
 */

const FMP_KEY = process.env.FMP_API_KEY || "";
const FMP_BASE = "https://financialmodelingprep.com/stable";

export interface GradeChange {
    date: string;
    firm: string;
    from: string | null;
    to: string;
    action: "upgrade" | "downgrade";
}

/** 목표가 «건별» 변경 — 누가 언제 얼마로 */
export interface TargetChange {
    date: string;
    firm: string;
    /** 애널리스트 개인명 — 있으면 신뢰도가 다르다 */
    analyst: string | null;
    target: number;
    /** 그 시점의 주가 — 목표가만 보면 «얼마나 공격적인지»를 모른다 */
    priceThen: number | null;
    /** 발표 시점 기준 상승여력(%) */
    upsideThen: number | null;
    publisher: string | null;
    url: string | null;
}

export interface AnalystEvents {
    ticker: string;
    /** 창(일) 안의 상하향만 — maintain 은 이벤트가 아니다 */
    windowDays: number;
    upgrades: number;
    downgrades: number;
    /** 상향 − 하향. 0 이면 «균형»이 아니라 «변화 없음»일 수 있으니 count 를 같이 본다 */
    net: number;
    recent: GradeChange[];
    /** 목표가 건별 변경 (최신순). 화면은 접었다 펼친다 */
    targetChanges: TargetChange[];
    /**
     * 목표가 «중앙값». 평균만 보면 치우친 분포에서 왜곡된다 —
     * 실측 AMD: 고 1250 / 저 260 → 평균 594.04 vs **중앙값 625**.
     * 소수의 극단 목표가가 평균을 끌어내리고 있었다.
     */
    targetMedian: number | null;
    /**
     * 컨센서스 «구성»의 월별 변화 (최신순 4개월) — 등급 분포가 이동 중인지.
     *
     * 카드가 이미 Buy/Hold/Sell 3구간 막대를 쓰므로 여기서도 같은 구간으로
     * 접어 둔다. SB/B/H/S/SS 5개 × 4개월 = 숫자 20개를 그대로 보여 주면
     * 읽히지 않는다.
     */
    composition: Array<{
        date: string;
        strongBuy: number; buy: number; hold: number; sell: number; strongSell: number;
        /** 화면용 3구간 — bullish = SB+B · bearish = S+SS */
        bullish: number; neutral: number; bearish: number; total: number;
    }>;
    /**
     * 가장 오래된 달 → 최신 달의 «순 이동». 변화가 0 이면 **null** 이다 —
     * 「변화 없음」을 굳이 화면에 쓰지 않는다(AVGO 는 4개월 내내 동일했다).
     */
    compositionShift: { bullish: number; bearish: number; months: number } | null;
    /** 목표가 리비전 추세 — 못 구하면 null (0 으로 만들지 않는다) */
    targetTrend: {
        lastMonthAvg: number | null;
        lastQuarterAvg: number | null;
        lastYearAvg: number | null;
        lastMonthCount: number | null;
        /** 1개월 평균 vs 1년 평균 (%). 컨센서스가 올라오는 중인지 */
        revisionPct: number | null;
        direction: "RAISING" | "LOWERING" | "FLAT" | null;
    } | null;
}

async function fmp(path: string, timeoutMs = 8000): Promise<any> {
    if (!FMP_KEY) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const sep = path.includes("?") ? "&" : "?";
        const res = await fetch(`${FMP_BASE}/${path}${sep}apikey=${FMP_KEY}`, {
            signal: ctrl.signal,
            cache: "no-store",
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

const num = (v: any): number | null => {
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
};

export async function getAnalystEvents(ticker: string, windowDays = 90): Promise<AnalystEvents> {
    const T = ticker.toUpperCase().trim();
    const empty: AnalystEvents = {
        ticker: T, windowDays, upgrades: 0, downgrades: 0, net: 0, recent: [],
        targetChanges: [], targetMedian: null, composition: [], compositionShift: null, targetTrend: null,
    };
    if (!T) return empty;

    const [grades, summary, ptNews, ptConsensus, hist] = await Promise.all([
        fmp(`grades?symbol=${encodeURIComponent(T)}`),
        fmp(`price-target-summary?symbol=${encodeURIComponent(T)}`),
        fmp(`price-target-news?symbol=${encodeURIComponent(T)}&page=0&limit=40`),
        fmp(`price-target-consensus?symbol=${encodeURIComponent(T)}`),
        fmp(`grades-historical?symbol=${encodeURIComponent(T)}&limit=4`),
    ]);

    // ── 등급 변경 ────────────────────────────────────────────────────
    const cut = new Date(Date.now() - windowDays * 86400_000).toISOString().slice(0, 10);
    const changes: GradeChange[] = Array.isArray(grades)
        ? grades
            .filter((g: any) => {
                const a = String(g?.action || "").toLowerCase();
                return (a === "upgrade" || a === "downgrade") && String(g?.date || "") >= cut;
            })
            .map((g: any) => ({
                date: String(g.date).slice(0, 10),
                firm: String(g.gradingCompany || "—"),
                from: g.previousGrade || null,
                to: String(g.newGrade || ""),
                action: String(g.action).toLowerCase() as GradeChange["action"],
            }))
            .sort((a, b) => (a.date < b.date ? 1 : -1))
        : [];

    const upgrades = changes.filter((c) => c.action === "upgrade").length;
    const downgrades = changes.length - upgrades;

    // ── 목표가 리비전 추세 ───────────────────────────────────────────
    const s = Array.isArray(summary) ? summary[0] : null;
    let targetTrend: AnalystEvents["targetTrend"] = null;
    if (s) {
        const m = num(s.lastMonthAvgPriceTarget);
        const q = num(s.lastQuarterAvgPriceTarget);
        const y = num(s.lastYearAvgPriceTarget);
        // 1년 평균이 있어야 «올라오는 중»을 말할 수 있다. 없으면 방향을 말하지 않는다.
        const revisionPct = m != null && y != null && y > 0
            ? Math.round(((m - y) / y) * 1000) / 10
            : null;
        targetTrend = {
            lastMonthAvg: m,
            lastQuarterAvg: q,
            lastYearAvg: y,
            lastMonthCount: num(s.lastMonthCount),
            revisionPct,
            // ±3%p 안쪽은 잡음으로 본다 — 목표가는 종목마다 분산이 크다
            direction: revisionPct == null ? null
                : revisionPct > 3 ? "RAISING"
                    : revisionPct < -3 ? "LOWERING" : "FLAT",
        };
    }

    // ── 목표가 건별 변경 ────────────────────────────────────────────
    //   목표가만 보면 «얼마나 공격적인지»를 모른다. 발표 시점 주가를 같이
    //   실어 그때 기준 상승여력을 계산한다. 주가를 못 얻으면 null 이다.
    const targetChanges: TargetChange[] = Array.isArray(ptNews)
        ? ptNews
            .map((x: any): TargetChange | null => {
                const target = num(x?.adjPriceTarget ?? x?.priceTarget);
                const date = String(x?.publishedDate || "").slice(0, 10);
                if (target == null || !date) return null;
                const priceThen = num(x?.priceWhenPosted);
                return {
                    date,
                    firm: String(x?.analystCompany || "—"),
                    analyst: x?.analystName || null,
                    target,
                    priceThen,
                    upsideThen: priceThen && priceThen > 0
                        ? Math.round(((target - priceThen) / priceThen) * 1000) / 10
                        : null,
                    publisher: x?.newsPublisher || null,
                    url: x?.newsURL || null,
                };
            })
            .filter(Boolean)
            .sort((a: any, b: any) => (a.date < b.date ? 1 : -1)) as TargetChange[]
        : [];

    // ── 목표가 중앙값 ───────────────────────────────────────────────
    const pc = Array.isArray(ptConsensus) ? ptConsensus[0] : null;
    const targetMedian = num(pc?.targetMedian);

    // ── 컨센서스 구성의 월별 변화 ───────────────────────────────────
    const composition = Array.isArray(hist)
        ? hist
            .map((h: any) => {
                const strongBuy = num(h?.analystRatingsStrongBuy) ?? 0;
                const buy = num(h?.analystRatingsBuy) ?? 0;
                const hold = num(h?.analystRatingsHold) ?? 0;
                const sell = num(h?.analystRatingsSell) ?? 0;
                const strongSell = num(h?.analystRatingsStrongSell) ?? 0;
                return {
                    date: String(h?.date || "").slice(0, 10),
                    strongBuy, buy, hold, sell, strongSell,
                    bullish: strongBuy + buy,
                    neutral: hold,
                    bearish: sell + strongSell,
                    total: strongBuy + buy + hold + sell + strongSell,
                };
            })
            .filter((h: any) => h.date && h.total > 0)
            .sort((a: any, b: any) => (a.date < b.date ? 1 : -1))
            .slice(0, 4)
        : [];

    // 순 이동 — 변화가 전혀 없으면 null (「변화 없음」을 화면에 쓰지 않는다)
    let compositionShift: AnalystEvents["compositionShift"] = null;
    if (composition.length >= 2) {
        const newest = composition[0];
        const oldest = composition[composition.length - 1];
        const dB = newest.bullish - oldest.bullish;
        const dS = newest.bearish - oldest.bearish;
        if (dB !== 0 || dS !== 0) {
            compositionShift = { bullish: dB, bearish: dS, months: composition.length - 1 };
        }
    }

    return {
        ticker: T,
        windowDays,
        upgrades,
        downgrades,
        net: upgrades - downgrades,
        recent: changes.slice(0, 6),
        targetChanges: targetChanges.slice(0, 30),
        targetMedian,
        composition,
        compositionShift,
        targetTrend,
    };
}
