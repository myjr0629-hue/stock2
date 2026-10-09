/**
 * «신규 포지션 구축» 카드가 어느 세션을, 무엇으로(확정 / 추정) 말할지 — 순수 함수 (I/O·시계 없음, now 는 인자).
 *
 * ══════════════════════════════════════════════════════════════════════
 * 왜 (대표 10/9) — «목요일 장이 마감됐는데 수요일 자료가 나온다는 건 말이 안 된다. 자료는 항상 신선하고 정확해야 한다.»
 *
 *   옵션 EOD 묶음 = 공급사 레코드 D(저녁 16:4x~17:3x ET 에 올라옴). 레코드 D 의 두 칸은 세션이 다르다:
 *     · 거래량(v)      = D 세션의 것                     → D 마감 직후부터 안다
 *     · 미결제약정(oi) = D 아침 OCC 공시 = D−1 마감 포지션 → 증가분(d)이 «열린 세션» = prevDate
 *   그래서 확정치(OI 증가분)는 «한 세션 늦다». 목요일 저녁 묶음(D=목, prevDate=수)의 확정치는 수요일 것이고,
 *   목요일 장에 열린 포지션의 확정치는 금요일 저녁 레코드가 올라와야 생긴다 — 그 사이 누구도(우리도) 알 수 없다.
 *
 *   그 빈 시간을 «그 세션 거래량으로 어림한 추정»으로 메운다(업계 표준 Vol > OI). 추정은 추정이라고 부르고,
 *   확정치가 그 세션까지 오면 확정치를 쓴다. 진행 중인 세션은 절대 추정하지 않는다(거래량이 반쯤이다).
 *
 * 카드가 말하는 세션 = «마지막으로 끝난 정규장» L (marketSession.lastClosedSessionDate).
 *   ① 확정치 세션 P(=prevDate) ≥ L          → 확정치 (확정치가 L 까지 왔다)
 *   ② 아니고 레코드 D 가 L 이하의 거래일    → 추정 (세션 = D). D < L 이면(마감 직후 ~ 묶음 갱신 전, 약 1시간)
 *                                              D 의 추정을 그대로 둔다 — 날짜를 단 채로 한 칸 뒤로 물러나지 않는다.
 *   ③ 그 외(레코드가 없거나 D > L = 진행 중 세션)  → 확정치 (세션 = P)
 *   장중·장 시작 전·주말·휴장일에는 L 이 «직전 마감 세션»이므로 같은 규칙이 그대로 적용된다
 *   (장중 금요일 11:00 ET → L=목 → 묶음 D=목이면 «목요일 추정», 진행 중인 금요일은 건드리지 않는다).
 *
 * 추정 정의 (정본 — 이 파일과 institutionalFlow.summarizeEstimate 가 같은 식)
 *   계약마다 열린 계약 수 = max(0, 그 세션 거래량 v − 직전 미결제약정 oi)   [oi = 레코드 D 의 OI = 세션 D 시작 시점]
 *   금액 = 계약 수 × 100 × 행사가 (확정치와 같은 식·같은 단위·같은 종목 범위 = 묶음 top 행)
 *   뺀다: 만기가 «그 세션 다음 거래일» 이내인 계약(0·1일 만기). 하루 안에 사고판 거래가 대부분이라 남는 포지션과
 *         거리가 멀다 — 10/8 실측으로 넣으면 $1,030B(확정치 $44B 의 23배), 빼면 $20B(확정치 중 같은 범위 $25B 와 같은 자릿수).
 *   → 보수적이다: top 12행 한정 + 단기 만기 제외라 확정치보다 작게 나오는 쪽이다.
 * ══════════════════════════════════════════════════════════════════════
 */
import { isTradingDate, lastClosedSessionDate, shiftDate, sessionYmd } from './marketSession';

export type NewPosBasis = 'confirmed' | 'estimate';

export interface NewPosPick {
    basis: NewPosBasis;
    /** 카드가 말하는 세션(요일 표기의 원천). 알 수 없으면 null */
    session: string | null;
}

/** date 바로 뒤의 거래일 (주말·휴장을 건너뛴다) */
export function nextTradingDate(date: string): string {
    let s = shiftDate(date, 1);
    for (let i = 0; i < 10 && !isTradingDate(s); i++) s = shiftDate(s, 1);
    return s;
}

/**
 * 시점 `now`(ms), 묶음의 레코드 날짜 `date`(D)·확정치 세션 `prevDate`(P) → 무엇을 보여 줄지.
 * 모양이 틀린 날짜(ISO 시각·빈 값)는 «없음»으로 본다 — 날짜를 지어내지 않는다.
 */
export function pickNewPositionBasis(args: { now?: number; date: unknown; prevDate: unknown }): NewPosPick {
    const D = sessionYmd(args.date);
    const P = sessionYmd(args.prevDate);
    const L = lastClosedSessionDate(args.now ?? Date.now());

    if (P && P >= L) return { basis: 'confirmed', session: P };                       // ①
    if (D && D <= L && isTradingDate(D) && (!P || D > P)) return { basis: 'estimate', session: D };  // ②
    return { basis: 'confirmed', session: P };                                         // ③
}

/** 추정에서 뺄 만기 경계 — 만기가 이 날짜 이하인 계약은 뺀다(세션 D 의 다음 거래일 이내 만기). */
export function estimateExpiryCutoff(session: string): string {
    return nextTradingDate(session);
}

/**
 * 한 계약 행의 «열린 계약 수» 추정. 거래량·미결제약정이 숫자가 아니거나 만기가 경계 이내면 0.
 * (row = 묶음 top 행 { v, oi, e })
 */
export function estimatedOpenedContracts(row: { v?: unknown; oi?: unknown; e?: unknown } | null | undefined, cutoff: string): number {
    if (!row) return 0;
    const v = row.v, oi = row.oi;
    if (typeof v !== 'number' || typeof oi !== 'number' || !Number.isFinite(v) || !Number.isFinite(oi)) return 0;
    const e = row.e;
    if (typeof e !== 'string' || !e || e <= cutoff) return 0;     // 만기를 모르면 넣지 않는다(보수적)
    const x = v - oi;
    return x > 0 ? x : 0;
}
