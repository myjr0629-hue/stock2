/**
 * 낡은 가격으로 계산된 밸류에이션(시총·P/E·P/S·P/B·FCF 수익률)을 «최신 종가» 기준으로 다시 센다 — 순수 함수.
 *
 * [감사 M1 · 10/23] /api/live/fundamentals 의 NVDA P/E 27.7·시총 5.349T 는 10/21 종가(≈$222) 기준이었다.
 *   10/22 종가 212.21 이 나온 뒤에도 같은 값이 나갔다 — 값의 원천(Intrinio marketcap 데이터 포인트)은
 *   «읽은 날 직전 거래일 종가 × 주식수»이고(운영 실측 2점: 5.349T/10/21 종가 = 5.114T/10/22 종가 = 24.10B주),
 *   그 값을 DynamoDB(하루 1회 09:25 ET 수확)·SWR 6시간이 그대로 들고 있었다.
 *
 * 규칙
 *   · 기준(basis) = 그 값이 반영한 종가의 날짜와 그때의 원값(시총·비율·점수). 한 번 정하면 바꾸지 않는다(반복 환산 누적 금지).
 *   · 최신 종가의 날짜가 기준 날짜보다 «뒤»일 때만 k = 최신 종가 / 기준 종가로 환산한다. 같거나 앞이면 원값 그대로(회귀 0).
 *   · 기준·최신 종가 중 하나라도 없으면 원값 그대로 — 빈칸을 만들지 않는다.
 *   · 점수·등급은 P/E·FCF 두 항목만 같은 구간표로 다시 매기고 나머지 항목 점수는 기준 그대로다.
 *   · |k−1| 이 50 % 를 넘으면(분할·병합 등 종가 불연속 의심) 환산하지 않는다.
 */
import { etDateOf, etMinutesOf, isNonTradingDay, prevTradingDate, sessionCloseMinutes } from './marketCalendar';

export interface PriceBasis {
    /** 값이 반영한 정규장 종가의 거래일 (YYYY-MM-DD) */
    date: string;
    close: number;
    marketCap: number | null;
    pe: number | null;
    ps: number | null;
    pb: number | null;
    fcfYield: number | null;
    score: number | null;
    peScore: number | null;
    fcfScore: number | null;
    /** 기준을 DynamoDB 수확 기록(FUND)의 읽은 시각으로 정했는가 (true) · 응답이 직접 읽은 시각인가 (없음) */
    inferred?: boolean;
}

/** 09:25 ET — 이 시각 이후 읽은 marketcap 은 직전 거래일 종가 기준이다(Lambda 일일 수확 09:25~35 ET 의 운영 실측 2점). */
const MORNING_READY_MIN = 565;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * 그 시각에 Intrinio marketcap 을 읽었다면 그 값은 어느 거래일 종가 기준인가.
 *   거래일 09:25 ET ~ 정규장 마감 전 → 직전 거래일(그날 장은 아직 안 끝났고, 밤사이 갱신은 끝났다)
 *   휴장일·주말 09:25 ET 이후 → 직전 거래일
 *   그 밖(마감 뒤 저녁·새벽)은 벤더 갱신 시각을 모르므로 null — 기준을 지어내지 않는다.
 */
export function valuationBasisDate(readAtMs: number): string | null {
    if (!Number.isFinite(readAtMs) || readAtMs <= 0) return null;
    const d = etDateOf(readAtMs);
    const m = etMinutesOf(readAtMs);
    if (m < MORNING_READY_MIN) return null;
    if (isNonTradingDay(d)) return prevTradingDate(d);
    return m < sessionCloseMinutes(d) ? prevTradingDate(d) : null;
}

export function peScoreOf(pe: number | null): number {
    if (pe === null || !(pe > 0)) return 0;
    return pe < 15 ? 20 : pe < 25 ? 16 : pe < 35 ? 12 : pe < 50 ? 8 : 4;
}

export function fcfScoreOf(fcfYield: number | null): number {
    if (fcfYield === null) return 0;
    return fcfYield > 8 ? 20 : fcfYield > 5 ? 16 : fcfYield > 3 ? 12 : fcfYield > 1 ? 8 : 4;
}

export function gradeOf(score: number): string {
    return score >= 80 ? 'A' : score >= 70 ? 'A-' : score >= 60 ? 'B+' : score >= 50 ? 'B' : score >= 40 ? 'C+' : score >= 30 ? 'C' : score >= 20 ? 'D' : 'F';
}

/** 재무 객체(f)의 현재 값으로 기준을 만든다. raw 가 있으면 반올림 전 원값을 쓴다. */
export function makePriceBasis(
    f: any, date: string | null, close: number | null,
    raw: Partial<Pick<PriceBasis, 'marketCap' | 'pe' | 'ps' | 'pb' | 'fcfYield'>> = {}, inferred = false,
): PriceBasis | null {
    if (!f || typeof f !== 'object' || !date || !(typeof close === 'number' && close > 0)) return null;
    const pick = (k: 'marketCap' | 'pe' | 'ps' | 'pb' | 'fcfYield') => (k in raw ? num(raw[k]) : num(f[k]));
    const basis: PriceBasis = {
        date, close,
        marketCap: pick('marketCap'), pe: pick('pe'), ps: pick('ps'), pb: pick('pb'), fcfYield: pick('fcfYield'),
        score: num(f.score), peScore: num(f.breakdown?.pe?.score), fcfScore: num(f.breakdown?.fcf?.score),
    };
    if (inferred) basis.inferred = true;
    return basis.marketCap !== null || basis.pe !== null || basis.ps !== null || basis.pb !== null || basis.fcfYield !== null ? basis : null;
}

export function isPriceBasis(b: any): b is PriceBasis {
    return !!b && typeof b === 'object' && typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date)
        && typeof b.close === 'number' && b.close > 0;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * 기준(f._priceBasis)에서 최신 종가로 환산한 재무 객체를 돌려준다. 환산 조건이 아니면 f 그대로.
 * 항상 «기준 원값»에서 계산하므로 이미 환산된 객체를 다시 넣어도 결과가 같다.
 */
export function rebaseFundamentals<T>(f: T, latest: { date: string; close: number } | null | undefined): T {
    const src: any = f;
    const b = src?._priceBasis;
    if (!isPriceBasis(b) || !latest || typeof latest.date !== 'string' || !(latest.close > 0)) return f;
    if (!(latest.date > b.date)) return f;
    const k = latest.close / b.close;
    if (!Number.isFinite(k) || k <= 0 || Math.abs(k - 1) > 0.5) return f;

    const out: any = { ...src, _repricedTo: { date: latest.date, close: latest.close } };
    if (b.marketCap !== null) out.marketCap = Math.round(b.marketCap * k);
    const pe = b.pe !== null ? b.pe * k : null;
    const fcf = b.fcfYield !== null ? b.fcfYield / k : null;
    if (pe !== null) out.pe = r1(pe);
    if (b.ps !== null) out.ps = r1(b.ps * k);
    if (b.pb !== null) out.pb = r1(b.pb * k);
    if (fcf !== null) out.fcfYield = r1(fcf);

    // 점수: P/E·FCF 두 항목만, 그리고 «반올림 전 원값»을 아는 기준(새로 읽은 값)일 때만 다시 매긴다(나머지 항목은 가격과 무관).
    //   반올림된 저장값뿐인 옛 기준(inferred)은 구간 경계에서 오채점할 수 있으므로 점수·등급은 저장값 그대로 두고 표시값만 환산한다.
    const rescore = !b.inferred;
    const bd = src.breakdown && typeof src.breakdown === 'object' ? { ...src.breakdown } : null;
    let score = b.score;
    if (bd && pe !== null && bd.pe) {
        const s = rescore && b.peScore !== null ? peScoreOf(pe) : bd.pe.score;
        bd.pe = { ...bd.pe, value: pe.toFixed(1), score: s };
        if (rescore && score !== null && b.peScore !== null) score += s - b.peScore;
    }
    if (bd && fcf !== null && bd.fcf) {
        const s = rescore && b.fcfScore !== null ? fcfScoreOf(fcf) : bd.fcf.score;
        bd.fcf = { ...bd.fcf, value: fcf.toFixed(1) + '%', score: s };
        if (rescore && score !== null && b.fcfScore !== null) score += s - b.fcfScore;
    }
    if (bd) out.breakdown = bd;
    if (rescore && score !== null && b.score !== null && src.grade !== 'NO_DATA' && num(src.score) !== null) {
        out.score = score;
        out.grade = gradeOf(score);
    }
    return out as T;
}
