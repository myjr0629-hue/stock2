/**
 * «이 숫자는 어느 세션의 것인가» — 화면·AI 문장이 시간을 틀리지 않게 하는 순수 함수 모음.
 * 서버(API)와 클라이언트(UC·WIM 화면)가 «같은 코드»로 판정한다(미러를 따로 두지 않는다).
 *
 * ══════════════════════════════════════════════════════════════════════
 * [2026-09-28 월 08:56 ET 실측] UC «THE MARKET NOW · Morning edition, Mon»:
 *   «Stocks are modestly higher today — NASDAQ +0.48%, Dow +0.93% … 10Y 5.17% (down 1bp)»
 *   실제: 금요일 등락(+0.48%·+0.93%)이었고, 같은 시각 선물은 S&P −0.3%·나스닥100 −0.5%,
 *   10년물은 5.21%(+2.5bp, 대시보드와 같은 원천). 지수 API 가 «어느 세션 값인지»를 버리고 넘겼고,
 *   프롬프트는 그 숫자를 «지금 시장»이라고 불렀다.
 *   WIM 도 같은 모양: 월요일 내내 «Today's mover ZS ±10.1%»(금요일 움직임), «US 10Y 5.17%»(FRED 전일).
 *
 * 규칙: 값에는 세션 날짜가 붙어 다닌다. «오늘»은 그 날짜가 ET 오늘이고 살아 있을 때만 쓴다.
 * ══════════════════════════════════════════════════════════════════════
 *
 * ⚠️ ET 시각은 formatToParts + hourCycle 'h23' 로 읽는다. hour12:false 는 구형 V8(Node 20)에서
 *    자정을 «24시»로 준다(memory: intl-hour12-false-gives-24-at-midnight). 'M/D/YYYY, h:mm:ss AM'
 *    문자열을 new Date() 로 다시 파싱하는 방식은 사파리(WKWebView — UC·WIM 앱 셸)에서 보장되지 않는다.
 */
import { isNonTradingDay, isUsMarketHoliday } from './marketCalendar';

export type SessionLoc = 'ko' | 'en' | 'ja';

export interface EtClock {
    /** ET 달력 날짜 YYYY-MM-DD */
    date: string;
    /** ET 자정 기준 분 (09:30 = 570, 16:00 = 960) */
    minutes: number;
    /** 0=일 … 6=토 */
    weekday: number;
}

export const REG_OPEN_MIN = 9 * 60 + 30;
export const REG_CLOSE_MIN = 16 * 60;

const ET_PARTS = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** 'YYYY-MM-DD' 의 요일 (0=일). 날짜 문자열에서 계산해 로컬 타임존 영향이 없다. */
export function weekdayOfDate(date: string): number {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function etClock(ms: number = Date.now()): EtClock {
    const p: Record<string, string> = {};
    for (const x of ET_PARTS.formatToParts(new Date(ms))) p[x.type] = x.value;
    let h = Number(p.hour);
    if (h === 24) h = 0; // 방어: 어떤 엔진은 hourCycle 을 무시하고 자정을 24로 준다
    const date = `${p.year}-${p.month}-${p.day}`;
    return { date, minutes: h * 60 + Number(p.minute), weekday: weekdayOfDate(date) };
}

/** ISO 시각 → 그 순간의 ET 날짜 (없거나 못 읽으면 null) */
export function etDateOfIso(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? etClock(ms).date : null;
}

/** ET 벽시계(날짜 + 자정 기준 분) → epoch ms. EDT/EST 를 몰라도 두 후보 중 맞는 쪽을 고른다. */
export function etWallTimeToMs(date: string, minutes: number): number {
    const [y, m, d] = date.split('-').map(Number);
    for (const off of [4, 5]) {
        const ms = Date.UTC(y, m - 1, d, off, 0) + minutes * 60_000;
        const c = etClock(ms);
        if (c.date === date && c.minutes === minutes) return ms;
    }
    return Date.UTC(y, m - 1, d, 5, 0) + minutes * 60_000; // DST 전환 한 시간 틈 — 보수적으로 EST
}

export function shiftDate(date: string, delta: number): string {
    const [y, m, d] = date.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + delta));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

export function isTradingDate(date: string): boolean {
    return !isNonTradingDay(date);
}

/** date 바로 앞의 거래일 (주말·휴장을 건너뛴다) */
export function prevTradingDate(date: string): string {
    let s = shiftDate(date, -1);
    for (let i = 0; i < 10 && !isTradingDate(s); i++) s = shiftDate(s, -1);
    return s;
}

export type CashPhase = 'pre-open' | 'regular' | 'after-close' | 'closed-day';

/** 현물(정규장) 기준 지금이 어느 구간인가. 휴장·주말은 하루 종일 closed-day. */
export function cashPhase(c: EtClock): CashPhase {
    if (!isTradingDate(c.date)) return 'closed-day';
    if (c.minutes < REG_OPEN_MIN) return 'pre-open';
    if (c.minutes < REG_CLOSE_MIN) return 'regular';
    return 'after-close';
}

/**
 * 그 시점에 «마지막으로 끝난» 정규장 날짜. 16:00 ET 전이면 그날은 아직 안 끝났다.
 * 토·일·휴장·평일 새벽·장중 → 직전 거래일, 거래일 16:00 이후 → 그날.
 * (fix/weekend-screens 의 marketCalendar.etLastClosedSessionDate 와 같은 규칙 — 두 브랜치가
 *  합쳐지면 한쪽으로 모은다. marketCalendar.ts 는 대기 중인 브랜치 둘이 이미 서로 충돌해서
 *  여기서 건드리지 않는다.)
 */
export function lastClosedSessionDate(ms: number = Date.now()): string {
    const c = etClock(ms);
    if (isTradingDate(c.date) && c.minutes >= REG_CLOSE_MIN) return c.date;
    return prevTradingDate(c.date);
}

/**
 * CME 글로벡스 지수 선물이 지금 열려 있는가 (규칙은 fix/weekend-screens 의 isCmeGlobexOpenAt('equity') 와 같다):
 * 일 18:00 ET 개장 · 평일 17:00–18:00 일일 휴식 · 금 17:00 주말 마감 · 토 휴장 ·
 * 휴장일엔 13:00 에 멈췄다가 18:00 에 다음 거래일 세션을 연다.
 */
export function isEquityFuturesOpen(ms: number = Date.now()): boolean {
    const c = etClock(ms);
    const t = c.minutes / 60;
    if (c.weekday === 6) return false;
    if (c.weekday === 0) return t >= 18;
    if (isUsMarketHoliday(c.date)) return t < 13 || t >= 18;
    if (c.weekday === 5) return t < 17;
    return t < 17 || t >= 18;
}

// ── 라벨 ────────────────────────────────────────────────────────────────────

const WD_LONG: Record<SessionLoc, string[]> = {
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    ko: ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'],
    ja: ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'],
};
const WD_SHORT: Record<SessionLoc, string[]> = {
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    ko: ['일', '월', '화', '수', '목', '금', '토'],
    ja: ['日', '月', '火', '水', '木', '金', '土'],
};

export function weekdayName(date: string, loc: SessionLoc, short = false): string {
    return (short ? WD_SHORT : WD_LONG)[loc][weekdayOfDate(date)];
}

/** '2026-09-25' → '9/25' */
export function monthDay(date: string): string {
    const [, m, d] = date.split('-').map(Number);
    return `${m}/${d}`;
}

/** 마감 값 꼬리표: «Fri 9/25 close» · «9/25(금) 마감 기준» · «9/25(金) 終値» */
export function closeLabel(date: string, loc: SessionLoc): string {
    const md = monthDay(date);
    const wd = weekdayName(date, loc, true);
    if (loc === 'ko') return `${md}(${wd}) 마감 기준`;
    if (loc === 'ja') return `${md}(${wd}) 終値`;
    return `${wd} ${md} close`;
}

// ── 화면 문구의 «상대 날짜» 대신 — 데이터에 실린 세션 날짜로만 요일을 단다 (2026-10-03) ──────────
//   대시보드 «어제 새로 깔린 옵션»이 고정 문구였다. 그 숫자는 묶음 prevDate 세션(고래 신규 포지션 — b725812cf)의 것이라
//   토요일엔 목요일, 월요일 저녁엔 금요일이다 — «어제»는 거의 늘 틀린다. 판정(어느 세션인가)은 데이터가 이미 들고 온다.
//   여기서는 그 날짜를 «요일 글자»로 바꾸기만 한다. 날짜가 없으면 상대 날짜 없는 문구를 쓴다(«어제·오늘»로 메우지 않는다).
//   데이터 날짜는 달력 날짜라 보는 사람의 시간대(한국·미국)와 상관없이 같은 요일이다.

/** 정확히 'YYYY-MM-DD' 일 때만 세션 날짜로 받는다. ISO 시각·다른 모양은 null — 날짜를 지어내지 않는다. */
export function sessionYmd(x: unknown): string | null {
    return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null;
}

/** «{d} …» 틀에 그 세션의 요일(긴 이름)을 넣는다 — «목요일 새로 깔린 옵션». 날짜가 없으면 fallback. */
export function withSessionDay(tpl: string, date: unknown, loc: SessionLoc, fallback: string): string {
    const d = sessionYmd(date);
    return d ? tpl.split('{d}').join(weekdayName(d, loc)) : fallback;
}

/** closeLabel 의 날짜 검사판 — «10/2(금) 마감 기준». 세션 날짜가 없거나 모양이 틀리면 fallback. */
export function closeLabelOr(date: unknown, loc: SessionLoc, fallback: string): string {
    const d = sessionYmd(date);
    return d ? closeLabel(d, loc) : fallback;
}
