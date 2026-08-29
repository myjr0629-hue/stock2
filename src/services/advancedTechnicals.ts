/**
 * 고급 기술지표 + 합성 지표
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 만들었나]
 *   ① Massive 에 없던 것이 Intrinio 에 있다. 실측(2026-08-29 · NVDA):
 *        ATR 7.663 · ADX 16.84 (+DI 26.59 / −DI 21.55)
 *        OBV 6,938,049,941 · BB 205.95 / 218.05 / 230.14
 *      전부 200, 1거래일 전, 필드 완전. **놀리고 있던 API 다.**
 *
 *   ② 공매도 잔고(short_interest)가 현재 플랜에서 403 이라
 *      「SQUEEZE」 카드가 siPercent=null 로 **죽어 있다.**
 *      볼린저 밴드폭 압축은 변동성 폭발 전조로 널리 쓰이는 신호이고
 *      우리가 지금 잴 수 있다 → **죽은 카드를 다른 근거로 되살린다.**
 *      (공매도 스퀴즈와 다른 개념이므로 라벨·설명도 함께 바꿔야 한다)
 *
 * [합성 지표 — 우리만 만들 수 있는 것]
 *   · 변동성 프리미엄 (IV − RV)
 *       ATM IV 는 옵션 체인에서, 실현변동성(RV)은 20일 종가로 계산한다.
 *       둘 다 가진 서비스는 드물다. IV > RV 면 옵션이 «비싸다»(매도 우위),
 *       IV < RV 면 «싸다»(매수 우위). 방향이 아니라 **가격의 적정성**을 말한다.
 *
 *       ⚠️ RV 를 ATR 로 근사하지 않는다. ATR 은 갭을 포함해 종가 기준
 *          변동성보다 체계적으로 크다. 실제 종가 수익률의 표준편차를 쓴다.
 *          (근사치를 지표로 내보내면 «비싸다/싸다» 판정이 통째로 밀린다)
 *
 *   · 추세 품질 (ADX 게이트)
 *       지금 TREND PHASE 는 SMA 교차만 본다. 그런데 ADX < 20 인 구간의
 *       골든크로스는 대부분 무의미하다(추세가 없으니 교차가 잦다).
 *       ADX 를 **신뢰도 게이트**로 붙이면 거짓 신호를 걸러낼 수 있다.
 *
 * [비용]  종목당 4콜(atr·adx·obv·bb). 6시간 캐시 — EOD 지표라 하루 한 번 변한다.
 *         RV 는 이미 Redis 에 있는 20일 종가를 쓰므로 추가 콜 0.
 */

import { getTechnicalIndicator, getCloseHistory } from "@/services/intrinioClient";

export interface AdvancedTechnicals {
    ticker: string;
    asOf: string | null;
    /** 평균 실제 범위 — 절대값과 가격 대비 % */
    atr: { value: number; pct: number } | null;
    /** 추세 강도 + 방향 */
    adx: {
        value: number;
        diPos: number;
        diNeg: number;
        /** RANGE(<20) · WEAK(20~25) · TREND(25~40) · STRONG(>40) */
        regime: "RANGE" | "WEAK" | "TREND" | "STRONG";
        direction: "UP" | "DOWN" | "NONE";
    } | null;
    /** 누적 거래량 — 추세와 가격 다이버전스 */
    obv: { value: number; slopePct: number | null; divergence: "BULL" | "BEAR" | null } | null;
    /** 볼린저 밴드 + 밴드폭 압축(스퀴즈) */
    bb: {
        upper: number; middle: number; lower: number;
        widthPct: number;
        /** 자기 자신의 과거 분포 대비 백분위 (0=역대 최저 폭) */
        percentile: number | null;
        /** 백분위 20 이하 = 압축 */
        squeeze: boolean;
        /** 현재가의 밴드 내 위치 0~100 */
        position: number | null;
    } | null;
    /** 합성 — 변동성 프리미엄 */
    volPremium: {
        ivPct: number | null;
        rvPct: number | null;
        spread: number | null;
        /** RICH = 옵션 비쌈 · CHEAP = 쌈 · FAIR */
        label: "RICH" | "CHEAP" | "FAIR" | null;
    } | null;
    _partial: string[];
}

/** 실현변동성 — 종가 로그수익률 표준편차의 연율화 (%) */
export function realizedVolPct(closes: number[]): number | null {
    const px = closes.filter((c) => Number.isFinite(c) && c > 0);
    if (px.length < 10) return null;                 // 표본이 얇으면 만들지 않는다
    const rets: number[] = [];
    for (let i = 1; i < px.length; i++) rets.push(Math.log(px[i] / px[i - 1]));
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const varc = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
    return Math.sqrt(varc) * Math.sqrt(252) * 100;
}

/** 값이 자기 과거 분포에서 몇 번째 백분위인지 (0~100) */
function percentileOf(value: number, series: number[]): number | null {
    const s = series.filter((n) => Number.isFinite(n));
    if (s.length < 20) return null;
    const below = s.filter((n) => n < value).length;
    return Math.round((below / s.length) * 100);
}

function firstNum(rows: any[], key: string): number | null {
    for (const r of rows) {
        const v = Number(r?.[key]);
        if (Number.isFinite(v)) return v;
    }
    return null;
}

/**
 * @param price   현재가 — ATR%, 밴드 내 위치 계산에 쓴다
 * @param atmIv   옵션 체인의 ATM IV (%) — 없으면 변동성 프리미엄은 null
 */
export async function getAdvancedTechnicals(
    ticker: string,
    price: number | null,
    atmIv: number | null
): Promise<AdvancedTechnicals> {
    const sym = ticker.toUpperCase();
    const partial: string[] = [];

    const [atrR, adxR, obvR, bbR, closes] = await Promise.all([
        getTechnicalIndicator("atr", sym, { limit: "2" }).catch(() => null),
        getTechnicalIndicator("adx", sym, { limit: "2" }).catch(() => null),
        getTechnicalIndicator("obv", sym, { limit: "22" }).catch(() => null),
        getTechnicalIndicator("bb", sym, { limit: "130" }).catch(() => null),
        getCloseHistory(sym).catch(() => null),
    ]);

    // ── ATR ──────────────────────────────────────────────────────
    let atr: AdvancedTechnicals["atr"] = null;
    const atrRows = atrR?._rows || [];
    const atrVal = firstNum(atrRows, "atr");
    if (atrVal != null && price && price > 0) {
        atr = { value: Math.round(atrVal * 10000) / 10000, pct: Math.round((atrVal / price) * 10000) / 100 };
    } else if (atrVal == null) partial.push("atr");

    // ── ADX ──────────────────────────────────────────────────────
    let adx: AdvancedTechnicals["adx"] = null;
    const adxRows = adxR?._rows || [];
    const adxVal = firstNum(adxRows, "adx");
    const diPos = firstNum(adxRows, "di_pos");
    const diNeg = firstNum(adxRows, "di_neg");
    if (adxVal != null && diPos != null && diNeg != null) {
        const regime = adxVal >= 40 ? "STRONG" : adxVal >= 25 ? "TREND" : adxVal >= 20 ? "WEAK" : "RANGE";
        // 추세가 없는 구간(ADX<20)에서는 방향을 말하지 않는다 — DI 교차가 잦아 의미가 없다
        const direction = regime === "RANGE" ? "NONE" : diPos > diNeg ? "UP" : "DOWN";
        adx = {
            value: Math.round(adxVal * 100) / 100,
            diPos: Math.round(diPos * 100) / 100,
            diNeg: Math.round(diNeg * 100) / 100,
            regime, direction,
        };
    } else partial.push("adx");

    // ── OBV + 가격 다이버전스 ─────────────────────────────────────
    let obv: AdvancedTechnicals["obv"] = null;
    const obvRows = obvR?._rows || [];
    const obvVal = firstNum(obvRows, "obv");
    if (obvVal != null) {
        const series = obvRows.map((r: any) => Number(r.obv)).filter(Number.isFinite);
        let slopePct: number | null = null;
        let divergence: "BULL" | "BEAR" | null = null;
        if (series.length >= 20) {
            // API 는 최신순 — 20거래일 전 대비 변화율
            const now = series[0], then = series[series.length - 1];
            if (Math.abs(then) > 0) slopePct = Math.round(((now - then) / Math.abs(then)) * 10000) / 100;
            const px = closes?.closes || [];
            if (px.length >= 10 && slopePct != null) {
                const pxChg = ((px[px.length - 1] - px[0]) / px[0]) * 100;
                // 가격과 거래량 흐름이 반대로 가면 다이버전스
                if (pxChg < -1 && slopePct > 1) divergence = "BULL";      // 가격↓ 자금↑
                else if (pxChg > 1 && slopePct < -1) divergence = "BEAR"; // 가격↑ 자금↓
            }
        }
        obv = { value: obvVal, slopePct, divergence };
    } else partial.push("obv");

    // ── 볼린저 + 밴드폭 압축 ──────────────────────────────────────
    let bb: AdvancedTechnicals["bb"] = null;
    const bbRows = bbR?._rows || [];
    if (bbRows.length) {
        const up = firstNum(bbRows, "upper_band");
        const mid = firstNum(bbRows, "middle_band");
        const lo = firstNum(bbRows, "lower_band");
        if (up != null && mid != null && lo != null && mid > 0) {
            const widthPct = ((up - lo) / mid) * 100;
            const widthSeries = bbRows
                .map((r: any) => {
                    const u = Number(r.upper_band), m = Number(r.middle_band), l = Number(r.lower_band);
                    return m > 0 && Number.isFinite(u) && Number.isFinite(l) ? ((u - l) / m) * 100 : NaN;
                })
                .filter(Number.isFinite);
            const pct = percentileOf(widthPct, widthSeries);
            bb = {
                upper: Math.round(up * 100) / 100,
                middle: Math.round(mid * 100) / 100,
                lower: Math.round(lo * 100) / 100,
                widthPct: Math.round(widthPct * 100) / 100,
                percentile: pct,
                squeeze: pct != null && pct <= 20,
                position: price && up > lo ? Math.max(0, Math.min(100, Math.round(((price - lo) / (up - lo)) * 100))) : null,
            };
        }
    }
    if (!bb) partial.push("bb");

    // ── 합성: 변동성 프리미엄 (IV − RV) ───────────────────────────
    let volPremium: AdvancedTechnicals["volPremium"] = null;
    const rv = closes?.closes ? realizedVolPct(closes.closes) : null;
    if (atmIv != null && atmIv > 0 && rv != null) {
        const spread = atmIv - rv;
        // ±10%p 를 중립대로 둔다 — 그 안은 계산 오차와 만기 구조 차이로 갈릴 수 있다
        const label = spread > 10 ? "RICH" : spread < -10 ? "CHEAP" : "FAIR";
        volPremium = {
            ivPct: Math.round(atmIv * 10) / 10,
            rvPct: Math.round(rv * 10) / 10,
            spread: Math.round(spread * 10) / 10,
            label,
        };
    } else {
        volPremium = { ivPct: atmIv ?? null, rvPct: rv != null ? Math.round(rv * 10) / 10 : null, spread: null, label: null };
        if (rv == null) partial.push("rv");
        if (atmIv == null) partial.push("iv");
    }

    return {
        ticker: sym,
        asOf: (atrRows[0]?.date_time || bbRows[0]?.date_time || "").slice(0, 10) || null,
        atr, adx, obv, bb, volPremium,
        _partial: partial,
    };
}
