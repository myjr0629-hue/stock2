/**
 * 실물경제 지표 축 (FRED 계열 · Intrinio `indices/economic`)
 * ══════════════════════════════════════════════════════════════════════
 * [왜 붙이나]  /api/market/macro 의 10개 팩터는 전부 «가격»이다
 *   (NQ·SPX·VIX·US10Y·DXY·BTC·금·유가·SOX·RUT).
 *   가격은 «무엇이 일어났나»를 말하지만 «왜»를 말하지 않는다.
 *   고용·물가·정책금리·소비심리는 어떤 가격 피드도 주지 않는다.
 *
 * [실측 2026-09-14]  우리 키로 전 계열 확인:
 *   $DFF 3.63 · $UNRATE 4.1 · $CPIAUCSL 334.131 · $PAYEMS 159075 ·
 *   $UMCSENT 55.2 · $GDP 32486.066 · $T10Y2Y 0.33 · $T10Y3M 0.89
 *   ⚠️ 주가지수 계열($SPX·$DJI)은 **403** 이다. 목록 엔드포인트만 200 이라
 *      열린 것처럼 보이지만 과거데이터는 플랜에 없다. 그래서 여기 없다.
 *      (지수 가격은 이미 SPY·QQQ·DIA 로 커버된다 — 중복 이유도 없다.)
 *
 * [설계 원칙]
 *   1. 원시 지수값을 그대로 내보내지 않는다. CPI 334.131 은 사용자에게 무의미하다.
 *      → 전년동월비·전월비 같은 «읽을 수 있는 값»으로 파생시킨다.
 *   2. 이 계열들은 **월간·분기간**이다. 오래된 것이 정상이다.
 *      그래서 `asOf` 를 반드시 함께 준다 — 날짜 없는 거시지표는 거짓말이 된다
 *      (죽은 데이터가 새 타임스탬프로 되살아나는 전형을 피한다).
 *   3. 한 계열이 실패해도 나머지는 준다. 전부-아니면-전무는 화면을 통째로 죽인다.
 */
import { getEconomicSeries } from "./intrinioClient";
import { observationMonthsAgo } from "@/lib/economicSeries";

export type MacroTrend = "UP" | "DOWN" | "FLAT";

export interface MacroMetric {
    key: string;
    /** 업계에서 쓰는 이름 그대로 — 지어낸 합성어를 쓰지 않는다 */
    label: { en: string; ko: string; ja: string };
    /**
     * 화면에 찍을 값. null = 이 지표의 값을 계산할 관측이 없다(예: GDP 비교 분기 결측).
     * 그래도 행은 목록에 남긴다 — 칸·라벨은 그대로 두고 값만 «—» 로 그린다(칸 숨김 금지).
     */
    value: number | null;
    unit: "percent" | "index" | "thousands" | "billions";
    /** 이 값이 «언제» 것인가 — 월간 지표에서 이게 없으면 거짓말이 된다. 관측이 하나도 없으면 null */
    asOf: string | null;
    /** 직전 관측 대비 변화 */
    change: number | null;
    /** 변화의 방향 */
    trend: MacroTrend;
    /**
     * 어느 방향이 «우호적»인가.
     * 실업률 상승과 고용 상승은 뜻이 정반대다 — 그래서 색을 화면에서 정하면 안 되고
     * 지표마다 여기서 선언해야 한다. neutral = 좋고 나쁨을 우리가 말하지 않는다.
     */
    favorable: "up" | "down" | "neutral";
    /** 지금 «주목해야 할» 상태인가. 이유를 함께 준다(빈 문자열이면 평상시) */
    watch: { on: boolean; reason: { en: string; ko: string; ja: string } } | null;
    /** 갱신 주기 */
    cadence: "daily" | "monthly" | "quarterly";
}

export interface MacroEconomy {
    metrics: MacroMetric[];
    /** 출처 표기 — 화면에 반드시 보여준다. 출처 없는 거시지표는 신뢰를 못 얻는다 */
    attribution: string;
    /** 가장 최근 관측일 — 블록 전체의 신선도 */
    newestAsOf: string | null;
    /** 값이 없는(value null) 지표 수. 행은 남고 값만 «—» 다 */
    missing: number;
}

const FLAT_EPS = 1e-9;

function trendOf(change: number | null, eps: number): MacroTrend {
    if (change == null || Math.abs(change) < Math.max(eps, FLAT_EPS)) return "FLAT";
    return change > 0 ? "UP" : "DOWN";
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 실물경제 블록을 만든다.
 * 계열마다 필요한 관측 수가 다르다 — 전년동월비를 내려면 13개월이 필요하다.
 */
export async function getMacroEconomy(): Promise<MacroEconomy> {
    const [dff, unrate, cpi, payems, umcsent, gdp, curve] = await Promise.all([
        getEconomicSeries("$DFF", 8),        // 일간 — 최근 며칠
        getEconomicSeries("$UNRATE", 3),     // 월간
        getEconomicSeries("$CPIAUCSL", 14),  // 전년동월비에 13개월 필요
        getEconomicSeries("$PAYEMS", 3),     // 월간 — 전월비 «증감»이 본질
        getEconomicSeries("$UMCSENT", 3),    // 월간
        getEconomicSeries("$GDP", 3),        // 분기
        getEconomicSeries("$T10Y2Y", 25),    // 일간 — 20영업일 전 대비
    ]);

    const metrics: MacroMetric[] = [];
    let missing = 0;
    // 값이 없어도 행은 버리지 않는다 — 비교 기간 결측(예: GDP 4월)이 «칸 사라짐»이 되면 안 된다.
    // 값을 만들 수 없는 지표는 같은 key·label·단위로 남기고 value·change 만 null 로 둔다.
    type Shell = Pick<MacroMetric, "key" | "label" | "unit" | "cadence" | "favorable">;
    const push = (shell: Shell, m: Omit<MacroMetric, keyof Shell> | null, latestDate?: string) => {
        if (m && m.value != null && Number.isFinite(m.value)) { metrics.push({ ...shell, ...m }); return; }
        missing += 1;
        metrics.push({ ...shell, value: null, asOf: latestDate || null, change: null, trend: "FLAT", watch: null });
    };

    // ── 정책금리 (일간)
    const dffChange = dff.length >= 2 ? dff[0].value - dff[1].value : null;
    push({
        key: "fedFunds",
        label: { en: "Fed Funds Rate", ko: "연방기금금리", ja: "FF金利" },
        unit: "percent", cadence: "daily", favorable: "neutral",
    }, dff.length ? {
        value: r2(dff[0].value), asOf: dff[0].date,
        change: dffChange == null ? null : r2(dffChange),
        trend: trendOf(dffChange, 0.005),
        watch: null,
    } : null, dff[0]?.date);

    // ── 실업률 (월간)
    const unratePrev = observationMonthsAgo(unrate, unrate[0]?.date, 1);
    const unrateChange = unratePrev ? unrate[0].value - unratePrev.value : null;
    push({
        key: "unemployment",
        label: { en: "Unemployment Rate", ko: "실업률", ja: "失業率" },
        unit: "percent", cadence: "monthly", favorable: "down",
    }, unrate.length ? {
        value: r1(unrate[0].value), asOf: unrate[0].date,
        change: unrateChange == null ? null : r1(unrateChange),
        trend: trendOf(unrateChange, 0.05),
        // 실업률이 한 달에 0.2%p 이상 뛰면 과거에 국면 전환의 초기 신호였던 적이 많다
        watch: unrateChange != null && unrateChange >= 0.2
            ? { on: true, reason: { en: "Jumped in one month", ko: "한 달 만에 급등", ja: "1カ月で急上昇" } }
            : null,
    } : null, unrate[0]?.date);

    // ── CPI 전년동월비 (원시 지수값은 쓸모없다 → YoY 로 바꾼다)
    //    전년 동월 관측이 없으면 전년비를 지어내지 않는다 — 행은 남기고 값만 null.
    const cpiYearAgo = observationMonthsAgo(cpi, cpi[0]?.date, 12);
    let cpiMetric: Omit<MacroMetric, "key" | "label" | "unit" | "cadence" | "favorable"> | null = null;
    if (cpi.length && cpiYearAgo && cpiYearAgo.value > 0) {
        const yoy = ((cpi[0].value / cpiYearAgo.value) - 1) * 100;
        const prev = observationMonthsAgo(cpi, cpi[0].date, 1);
        const prevYearAgo = observationMonthsAgo(cpi, prev?.date, 12);
        const yoyPrev = prev && prevYearAgo && prevYearAgo.value > 0
            ? ((prev.value / prevYearAgo.value) - 1) * 100 : null;
        cpiMetric = {
            value: r1(yoy), asOf: cpi[0].date,
            change: yoyPrev == null ? null : r1(yoy - yoyPrev),
            trend: trendOf(yoyPrev == null ? null : yoy - yoyPrev, 0.05),
            // 연준 목표는 2% 다. 3% 를 넘으면 금리 경로가 바뀔 수 있는 구간이다.
            watch: yoy >= 3
                ? { on: true, reason: { en: "Above the 2% target", ko: "연준 목표 2% 상회", ja: "FRB目標2%を上回る" } }
                : null,
        };
    }
    push({
        key: "cpiYoY",
        label: { en: "CPI (YoY)", ko: "소비자물가 전년비", ja: "CPI(前年比)" },
        unit: "percent", cadence: "monthly", favorable: "down",
    }, cpiMetric, cpi[0]?.date);

    // ── 비농업고용 «증감» (수준 159,075천명은 아무 말도 안 한다)
    //    전월 관측이 없으면 증감을 지어내지 않는다 — 행은 남기고 값만 null.
    const payrollPrev = observationMonthsAgo(payems, payems[0]?.date, 1);
    const payrollPrev2 = observationMonthsAgo(payems, payems[0]?.date, 2);
    push({
        key: "payrolls",
        label: { en: "Nonfarm Payrolls (MoM)", ko: "비농업고용 전월비", ja: "非農業部門雇用者数(前月比)" },
        unit: "thousands", cadence: "monthly", favorable: "up",
    }, payems.length && payrollPrev ? {
        value: Math.round(payems[0].value - payrollPrev.value), asOf: payems[0].date,
        change: payrollPrev2 ? Math.round((payems[0].value - payrollPrev.value) - (payrollPrev.value - payrollPrev2.value)) : null,
        trend: trendOf(payems[0].value - payrollPrev.value, 1),
        watch: (payems[0].value - payrollPrev.value) < 0
            ? { on: true, reason: { en: "Payrolls contracted", ko: "고용이 줄었다", ja: "雇用が減少" } }
            : null,
    } : null, payems[0]?.date);

    // ── 소비자심리 (월간)
    const sentimentPrev = observationMonthsAgo(umcsent, umcsent[0]?.date, 1);
    const sentimentChange = sentimentPrev ? umcsent[0].value - sentimentPrev.value : null;
    push({
        key: "consumerSentiment",
        label: { en: "Consumer Sentiment", ko: "소비자심리지수", ja: "消費者信頼感指数" },
        unit: "index", cadence: "monthly", favorable: "up",
    }, umcsent.length ? {
        value: r1(umcsent[0].value), asOf: umcsent[0].date,
        change: sentimentChange == null ? null : r1(sentimentChange),
        trend: trendOf(sentimentChange, 0.1),
        watch: null,
    } : null, umcsent[0]?.date);

    // ── GDP 전분기비 연율 아님 — «전분기 대비 증감률»로만 말한다(과장 금지)
    //    직전 분기(정확히 3개월 전) 관측이 없으면 6개월 전과 비교하지 않는다 — 행은 남기고 값만 null.
    const gdpPrev = observationMonthsAgo(gdp, gdp[0]?.date, 3);
    push({
        key: "gdpQoQ",
        label: { en: "GDP (QoQ)", ko: "GDP 전분기비", ja: "GDP(前期比)" },
        unit: "percent", cadence: "quarterly", favorable: "up",
    }, gdp.length && gdpPrev && gdpPrev.value > 0 ? {
        value: r1(((gdp[0].value / gdpPrev.value) - 1) * 100), asOf: gdp[0].date,
        change: null,
        trend: trendOf(gdp[0].value - gdpPrev.value, 1),
        watch: gdp[0].value < gdpPrev.value
            ? { on: true, reason: { en: "Contracted vs prior quarter", ko: "전분기 대비 역성장", ja: "前期比マイナス成長" } }
            : null,
    } : null, gdp[0]?.date);

    // ── 10Y-2Y 커브 (일간) — 음수면 역전
    const curveChange = curve.length >= 2 ? curve[0].value - curve[Math.min(20, curve.length - 1)].value : null;
    push({
        key: "curve10y2y",
        label: { en: "10Y-2Y Spread", ko: "10년-2년 스프레드", ja: "10年-2年スプレッド" },
        unit: "percent", cadence: "daily", favorable: "up",
    }, curve.length ? {
        value: r2(curve[0].value), asOf: curve[0].date,
        change: curveChange == null ? null : r2(curveChange),
        trend: trendOf(curveChange, 0.02),
        // 음수 = 장단기 금리 역전. 역사적으로 침체를 앞선 신호로 가장 많이 인용된다.
        watch: curve[0].value < 0
            ? { on: true, reason: { en: "Yield curve inverted", ko: "장단기 금리 역전", ja: "長短金利の逆転" } }
            : null,
    } : null, curve[0]?.date);

    // 7개 지표 «전부» 값이 없으면 블록 실패다 — 값 없는 7행을 «성공»으로 6시간 캐시하지 않도록 목록을 비운다
    // (라우트가 마지막 정상본을 주거나 503 을 낸다 — 기존 계약). 하나라도 값이 있으면 7행 전부를 같은 순서로 준다.
    if (metrics.every((m) => m.value == null)) metrics.length = 0;

    const dates = metrics.map((m) => m.asOf).filter((d): d is string => !!d).sort();
    const newestAsOf = dates.length ? dates[dates.length - 1] : null;

    return {
        metrics,
        // 원천은 미국 공공기관(연준/노동통계국/상무부)이 발표하고 세인트루이스 연준 FRED 가
        // 집계한 계열이다. 우리는 Intrinio 를 경유해 받는다 — 둘 다 밝힌다.
        attribution: "FRED (St. Louis Fed) via Intrinio",
        newestAsOf,
        missing,
    };
}
