import { etMinutesOf, etWeekdayOf } from '@/lib/marketCalendar';

/**
 * 미국 주식 «움직이는 시간» — ET 평일 04:00~19:59(프리·정규·애프터). 휴장일은 따지지 않는다(캐시 수명 판정용).
 * 뉴욕 시계로 판정하므로 서머타임(EDT, UTC−4)·표준시(EST, UTC−5)가 바뀌어도 같은 ET 구간이다.
 * (2026-11-02) 예전 «08:00 UTC~자정 UTC» 고정은 EDT 에만 맞았다 — EST 에는 19:00~20:00 ET(= 00~01 UTC)가 빠졌다.
 */
export function isUsExtendedWindowAt(ms: number): boolean {
    const wd = etWeekdayOf(ms);
    const m = etMinutesOf(ms);
    return wd >= 1 && wd <= 5 && m >= 4 * 60 && m < 20 * 60;
}
