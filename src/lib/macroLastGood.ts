/**
 * 실물경제 지표 «마지막 정상값» 채움 규칙 — /api/market/economy 전용(2026-10-19).
 * 라우트 파일은 HTTP 처리기만 export 할 수 있어 규칙을 여기로 뺐다(시험도 여기를 부른다).
 */
import type { MacroEconomy, MacroMetric } from "@/services/macroEconomy";

export type LastGood = Record<string, MacroMetric>;

export const hasValue = (m: MacroMetric | undefined | null): m is MacroMetric =>
    !!m && m.value != null && Number.isFinite(m.value);

/** 화면 행 순서·라벨(macroEconomy.ts 와 같은 7행). 벤더가 전부 실패해도 행이 사라지지 않게 한다. */
export const METRIC_ORDER: Pick<MacroMetric, "key" | "label" | "unit" | "cadence" | "favorable">[] = [
    { key: "fedFunds", label: { en: "Fed Funds Rate", ko: "연방기금금리", ja: "FF金利" }, unit: "percent", cadence: "daily", favorable: "neutral" },
    { key: "unemployment", label: { en: "Unemployment Rate", ko: "실업률", ja: "失業率" }, unit: "percent", cadence: "monthly", favorable: "down" },
    { key: "cpiYoY", label: { en: "CPI (YoY)", ko: "소비자물가 전년비", ja: "CPI(前年比)" }, unit: "percent", cadence: "monthly", favorable: "down" },
    { key: "payrolls", label: { en: "Nonfarm Payrolls (MoM)", ko: "비농업고용 전월비", ja: "非農業部門雇用者数(前月比)" }, unit: "thousands", cadence: "monthly", favorable: "up" },
    { key: "consumerSentiment", label: { en: "Consumer Sentiment", ko: "소비자심리지수", ja: "消費者信頼感指数" }, unit: "index", cadence: "monthly", favorable: "up" },
    { key: "gdpQoQ", label: { en: "GDP (QoQ)", ko: "GDP 전분기비", ja: "GDP(前期比)" }, unit: "percent", cadence: "quarterly", favorable: "up" },
    { key: "curve10y2y", label: { en: "10Y-2Y Spread", ko: "10년-2년 스프레드", ja: "10年-2年スプレッド" }, unit: "percent", cadence: "daily", favorable: "up" },
] as any;

/** 값이 빈 지표를 마지막 정상값으로 채운다. 행이 없는 지표는 METRIC_ORDER 의 빈 행으로 보탠다(행 소실 금지). */
export function fillFromLastGood(data: MacroEconomy, lastGood: LastGood | null): { data: MacroEconomy; filled: number; stillMissing: number } {
    let filled = 0;
    const byKey = new Map(data.metrics.map((m) => [m.key, m]));
    const keys = [...METRIC_ORDER.map((s) => s.key), ...data.metrics.map((m) => m.key).filter((k) => !METRIC_ORDER.some((s) => s.key === k))];
    const metrics = keys.map((key) => {
        const cur = byKey.get(key);
        if (hasValue(cur)) return cur;
        const prev = lastGood?.[key];
        if (hasValue(prev)) {
            filled += 1;
            return { ...prev, label: cur?.label ?? prev.label };
        }
        if (cur) return cur;
        const shell = METRIC_ORDER.find((s) => s.key === key)!;
        return { ...shell, value: null, asOf: null, change: null, trend: "FLAT", watch: null } as MacroMetric;
    });
    const stillMissing = metrics.filter((m) => !hasValue(m)).length;
    const dates = metrics.map((m) => m.asOf).filter((d): d is string => !!d).sort();
    return {
        data: { ...data, metrics, missing: stillMissing, newestAsOf: dates.length ? dates[dates.length - 1] : (data.newestAsOf ?? null) },
        filled,
        stillMissing,
    };
}

