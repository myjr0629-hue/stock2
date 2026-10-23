import { cashSessionPhaseAt, shownRegularSessionDate } from './marketCalendar';
import { normalizeVwap } from './vwap';

/** 표시용 직전장 값은 유지하되 정규장 당일 판정에는 당일 원천 날짜만 허용한다. */
export function vwapForCalculation(value: unknown, date: unknown, nowMs: number = Date.now()): number | null {
    if (cashSessionPhaseAt(nowMs) === 'regular' && date !== shownRegularSessionDate(nowMs)) return null;
    return normalizeVwap(value);
}
