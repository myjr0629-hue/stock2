/**
 * 알림용 거래일 계산 — 순수 함수(날짜 문자열만 다룬다).
 *
 * 휴장·주말 판정은 `lib/marketCalendar.isNonTradingDay`(단일 정본)를 쓴다.
 * 그 파일은 다른 수리 브랜치(fix/afterclose-session·fix/weekend-screens)가 고치는 중이라
 * 여기서는 «읽기만» 하고, 이 모듈에 필요한 이동·세기만 따로 둔다(충돌 0).
 * ⚠️ 조기 폐장(반일장)은 달력에 없다 — 13:00 ET 뒤에는 봉이 끊겨 «봉 나이» 게이트가 막는다.
 */
import { isNonTradingDay, etDateOf, etMinutesOf } from '@/lib/marketCalendar';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateStr(s: unknown): s is string {
    return typeof s === 'string' && DATE_RE.test(s);
}

/** 달력상 하루 이동(UTC 로 계산해 로컬 타임존 영향이 없다) */
export function shiftCalendarDay(dateStr: string, delta: number): string {
    const m = DATE_RE.exec(dateStr);
    if (!m) return dateStr;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + delta));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function isTradingDate(dateStr: string): boolean {
    return isDateStr(dateStr) && !isNonTradingDay(dateStr);
}

/** dateStr 다음(엄격히 뒤)의 첫 거래일 */
export function nextTradingDate(dateStr: string): string {
    let d = shiftCalendarDay(dateStr, 1);
    for (let i = 0; i < 15 && !isTradingDate(d); i++) d = shiftCalendarDay(d, 1);
    return d;
}

/** dateStr 이전(엄격히 앞)의 마지막 거래일 */
export function prevTradingDate(dateStr: string): string {
    let d = shiftCalendarDay(dateStr, -1);
    for (let i = 0; i < 15 && !isTradingDate(d); i++) d = shiftCalendarDay(d, -1);
    return d;
}

/**
 * from..to(둘 다 포함) 사이의 거래일 수. to < from 이면 0.
 * 예: 만기 금요일, 오늘 수요일 → 3 (수·목·금). 오늘이 만기일이면 1.
 */
export function tradingSessionsInclusive(from: string, to: string): number {
    if (!isDateStr(from) || !isDateStr(to) || to < from) return 0;
    let n = 0;
    let d = from;
    for (let i = 0; i < 400 && d <= to; i++) {
        if (isTradingDate(d)) n++;
        d = shiftCalendarDay(d, 1);
    }
    return n;
}

/** 달력상 두 날짜의 차이(일) — «내일»인지 가리는 데만 쓴다 */
export function calendarDaysBetween(from: string, to: string): number {
    const a = DATE_RE.exec(from), b = DATE_RE.exec(to);
    if (!a || !b) return NaN;
    return Math.round((Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3])) / 86400000);
}

export { etDateOf, etMinutesOf };

/** ET 기준 «지금»의 날짜·분·거래일 여부 한 번에 */
export function etClock(nowMs: number): { date: string; minutes: number; tradingDay: boolean } {
    const date = etDateOf(nowMs);
    return { date, minutes: etMinutesOf(nowMs), tradingDay: isTradingDate(date) };
}
