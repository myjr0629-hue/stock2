import { etLastClosedSessionDate, prevTradingDate } from '@/lib/marketCalendar';

// 같은 요청 창·같은 종가·같은 seed를 사용한다. 250봉의 초기 seed 가중치는 약 3e-8이다.
export function dailyRsiWindow(nowMs: number = Date.now()): { from: string; to: string } {
    const to = etLastClosedSessionDate(nowMs);
    const start = new Date(`${to}T12:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 550);
    return { from: start.toISOString().slice(0, 10), to };
}

// 캐시의 원천·계산법을 구분한다. 옛 원본 종가/공급사 RSI에는 이 표식이 없다.
export const DAILY_RSI_BASIS = 'intrinio-adj-close-wilder14-250-v1';

/** 분할·배당 조정 일봉 종가, Wilder 14. 시간외/진행 중 일봉은 제외한다. */
export function dailyRsi14(rows: readonly { t: number; adjustedClose?: number | null }[], sessionDate: string): number | null {
    if (rows.some(row => typeof row.t !== 'number' || !Number.isFinite(new Date(row.t).getTime()))) return null;
    const dated = rows.map(row => ({ row, date: new Date(row.t).toISOString().slice(0, 10) }))
        .filter(({ date }) => date && date <= sessionDate)
        .sort((a, b) => a.date.localeCompare(b.date));
    const recent = dated.slice(-250);
    if (recent.length < 15 || recent.at(-1)?.date !== sessionDate) return null;
    // 결측 봉을 지워서 서로 다른 날짜를 이어 붙이거나 0으로 채우지 않는다.
    if (recent.some(({ row }, i) => typeof row.adjustedClose !== 'number' || !Number.isFinite(row.adjustedClose) || row.adjustedClose <= 0
        || (i > 0 && recent[i - 1].date === recent[i].date))) return null;
    let gain = 0, loss = 0;
    for (let i = 1; i < recent.length; i++) {
        const delta = recent[i].row.adjustedClose! - recent[i - 1].row.adjustedClose!;
        if (i <= 14) {
            gain += Math.max(delta, 0) / 14;
            loss += Math.max(-delta, 0) / 14;
        } else {
            gain = (gain * 13 + Math.max(delta, 0)) / 14;
            loss = (loss * 13 + Math.max(-delta, 0)) / 14;
        }
    }
    if (gain === 0 && loss === 0) return 50;
    return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

/**
 * 완료 세션 일봉이 아직 공급사에 없을 때(마감 직후 EOD 도착 전) 빈칸 대신 «직전 거래일까지»의 RSI를 쓴다.
 * 완료 세션 일봉이 있는데 값이 깨졌으면 직전 거래일로 되돌아가지 않는다(null).
 * date 는 실제 계산에 쓴 마지막 일봉 날짜다.
 */
export function dailyRsi14Latest(rows: readonly { t: number; adjustedClose?: number | null }[], sessionDate: string): { rsi14: number | null; date: string } {
    const exact = dailyRsi14(rows, sessionDate);
    if (exact != null) return { rsi14: exact, date: sessionDate };
    const hasSessionBar = rows.some(row => typeof row.t === 'number' && Number.isFinite(new Date(row.t).getTime())
        && new Date(row.t).toISOString().slice(0, 10) === sessionDate);
    if (hasSessionBar) return { rsi14: null, date: sessionDate };
    const prev = prevTradingDate(sessionDate);
    const fallback = dailyRsi14(rows, prev);
    return fallback != null ? { rsi14: fallback, date: prev } : { rsi14: null, date: sessionDate };
}

/** 저장된 RSI 계산일이 지금 유효한가 — 완료 세션 또는(그 일봉 도착 전) 직전 거래일. */
export function isCurrentDailyRsiDate(date: string | null | undefined, sessionDate: string): boolean {
    return date === sessionDate || date === prevTradingDate(sessionDate);
}
