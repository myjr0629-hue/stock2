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

export type MacroTrend = "UP" | "DOWN" | "FLAT";

export interface MacroMetric {
    key: string;
    /** 업계에서 쓰는 이름 그대로 — 지어낸 합성어를 쓰지 않는다 */
    label: { en: string; ko: string; ja: string };
    /** 화면에 찍을 값 */
    value: number;
    unit: "percent" | "index" | "thousands" | "billions";
    /** 이 값이 «언제» 것인가 — 월간 지표에서 이게 없으면 거짓말이 된다 */
    asOf: string;
    /** 직전 관측 대비 변화 */
    change: number | null;
    /** 변화의 방향 — 좋고 나쁨은 지표마다 달라서 여기서 판정하지 않는다 */
    trend: MacroTrend;
    /** 갱신 주기 */
    cadence: "daily" | "monthly" | "quarterly";
}

export interface MacroEconomy {
    metrics: MacroMetric[];
    /** 가장 최근 관측일 — 블록 전체의 신선도 */
    newestAsOf: string | null;
    /** 실패한 계열 수. 0 이 아니면 화면에서 조용히 빠진 것이 있다는 뜻 */
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
    const push = (m: MacroMetric | null) => { if (m) metrics.push(m); else missing += 1; };

    // ── 정책금리 (일간)
    push(dff.length >= 2 ? {
        key: "fedFunds",
        label: { en: "Fed Funds Rate", ko: "연방기금금리", ja: "FF金利" },
        value: r2(dff[0].value), unit: "percent", asOf: dff[0].date,
        change: r2(dff[0].value - dff[1].value),
        trend: trendOf(dff[0].value - dff[1].value, 0.005), cadence: "daily",
    } : null);

    // ── 실업률 (월간)
    push(unrate.length >= 2 ? {
        key: "unemployment",
        label: { en: "Unemployment Rate", ko: "실업률", ja: "失業率" },
        value: r1(unrate[0].value), unit: "percent", asOf: unrate[0].date,
        change: r1(unrate[0].value - unrate[1].value),
        trend: trendOf(unrate[0].value - unrate[1].value, 0.05), cadence: "monthly",
    } : null);

    // ── CPI 전년동월비 (원시 지수값은 쓸모없다 → YoY 로 바꾼다)
    if (cpi.length >= 13) {
        const yoy = ((cpi[0].value / cpi[12].value) - 1) * 100;
        const yoyPrev = cpi.length >= 14 ? ((cpi[1].value / cpi[13].value) - 1) * 100 : null;
        push({
            key: "cpiYoY",
            label: { en: "CPI (YoY)", ko: "소비자물가 전년비", ja: "CPI(前年比)" },
            value: r1(yoy), unit: "percent", asOf: cpi[0].date,
            change: yoyPrev == null ? null : r1(yoy - yoyPrev),
            trend: trendOf(yoyPrev == null ? null : yoy - yoyPrev, 0.05), cadence: "monthly",
        });
    } else missing += 1;

    // ── 비농업고용 «증감» (수준 159,075천명은 아무 말도 안 한다)
    push(payems.length >= 2 ? {
        key: "payrolls",
        label: { en: "Nonfarm Payrolls (MoM)", ko: "비농업고용 전월비", ja: "非農業部門雇用者数(前月比)" },
        value: Math.round(payems[0].value - payems[1].value), unit: "thousands", asOf: payems[0].date,
        change: payems.length >= 3 ? Math.round((payems[0].value - payems[1].value) - (payems[1].value - payems[2].value)) : null,
        trend: trendOf(payems[0].value - payems[1].value, 1), cadence: "monthly",
    } : null);

    // ── 소비자심리 (월간)
    push(umcsent.length >= 2 ? {
        key: "consumerSentiment",
        label: { en: "Consumer Sentiment", ko: "소비자심리지수", ja: "消費者信頼感指数" },
        value: r1(umcsent[0].value), unit: "index", asOf: umcsent[0].date,
        change: r1(umcsent[0].value - umcsent[1].value),
        trend: trendOf(umcsent[0].value - umcsent[1].value, 0.1), cadence: "monthly",
    } : null);

    // ── GDP 전분기비 연율 아님 — «전분기 대비 증감률»로만 말한다(과장 금지)
    push(gdp.length >= 2 ? {
        key: "gdpQoQ",
        label: { en: "GDP (QoQ)", ko: "GDP 전분기비", ja: "GDP(前期比)" },
        value: r1(((gdp[0].value / gdp[1].value) - 1) * 100), unit: "percent", asOf: gdp[0].date,
        change: null,
        trend: trendOf(gdp[0].value - gdp[1].value, 1), cadence: "quarterly",
    } : null);

    // ── 10Y-2Y 커브 (일간) — 음수면 역전
    push(curve.length >= 2 ? {
        key: "curve10y2y",
        label: { en: "10Y-2Y Spread", ko: "10년-2년 스프레드", ja: "10年-2年スプレッド" },
        value: r2(curve[0].value), unit: "percent", asOf: curve[0].date,
        change: r2(curve[0].value - curve[Math.min(20, curve.length - 1)].value),
        trend: trendOf(curve[0].value - curve[Math.min(20, curve.length - 1)].value, 0.02), cadence: "daily",
    } : null);

    const newestAsOf = metrics.length
        ? metrics.map((m) => m.asOf).sort().slice(-1)[0]
        : null;

    return { metrics, newestAsOf, missing };
}
