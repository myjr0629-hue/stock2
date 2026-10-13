'use strict';
/* ============================================================================
 * 데이터 무결성 감시기 — 시계·달력 (순수 함수, 시험 대상)
 *
 * 정본은 src/lib/marketCalendar.ts 의 휴장표다(바꾸면 둘 다 바꾼다 — tests/priceIntegrityRules.test.ts 가 둘을 대조한다).
 * 이 파일은 앱 코드를 import 하지 않는다: 감시기는 «앱과 독립»이어야 앱의 같은 결함을 같이 믿지 않는다.
 * ========================================================================== */

const HOLIDAYS = new Set([
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
    '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
]);
const EARLY_CLOSE = new Set(['2026-11-27', '2026-12-24', '2027-11-26']);   // 13:00 ET 조기 폐장

const ET_FMT = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short',
});

const _etCache = new Map();
/** epoch ms → ET 달력 조각 (분 단위 캐시 — 분봉 수천 개를 반복해서 훑는 판정이 Intl 호출로 느려지지 않게) */
function etParts(ms) {
    const sec = Math.floor(ms / 1000);
    const hit = _etCache.get(sec);
    if (hit) return hit;
    const v = etPartsRaw(ms);
    if (_etCache.size > 200000) _etCache.clear();
    _etCache.set(sec, v);
    return v;
}
function etPartsRaw(ms) {
    const p = {};
    for (const x of ET_FMT.formatToParts(new Date(ms))) p[x.type] = x.value;
    const h = Number(p.hour), m = Number(p.minute), s = Number(p.second);
    return { date: `${p.year}-${p.month}-${p.day}`, h, m, s, min: h * 60 + m, sec: h * 3600 + m * 60 + s, wd: p.weekday, hms: `${p.hour}:${p.minute}:${p.second}`, hm: `${p.hour}:${p.minute}` };
}
const etDateOf = (ms) => etParts(ms).date;

const shiftDate = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const dow = (d) => new Date(d + 'T12:00:00Z').getUTCDay();
const isTradingDay = (d) => !!d && !HOLIDAYS.has(d) && dow(d) !== 0 && dow(d) !== 6;
function prevTradingDay(d) { let x = shiftDate(d, -1); for (let i = 0; i < 12 && !isTradingDay(x); i++) x = shiftDate(x, -1); return x; }
function nextTradingDay(d) { let x = shiftDate(d, 1); for (let i = 0; i < 12 && !isTradingDay(x); i++) x = shiftDate(x, 1); return x; }
const regCloseMin = (d) => (EARLY_CLOSE.has(d) ? 13 * 60 : 16 * 60);
const postEndMin = (d) => (EARLY_CLOSE.has(d) ? 17 * 60 : 20 * 60);

/**
 * 지금(ms)의 «진짜 세션». 앱의 session 필드와 독립으로 시계+달력으로 정한다.
 *   session        pre | regular | post | closed
 *   today          ET 달력 오늘
 *   tradingToday   오늘이 거래일인가
 *   lastClosed     "마지막으로 끝난 정규장" 날짜(C0) — 장중(regular)에는 오늘 전 거래일, 마감(16:00) 뒤에는 오늘
 *   prevClosed     C0 의 바로 앞 거래일(C1)
 *   sinceBoundary  가장 가까운 세션 경계(04:00·09:30·16:00·20:00)에서 지난 초(양수) — 경계 근처 오탐 완충용
 *   toBoundary     다음 경계까지 남은 초
 *   early          조기 폐장일
 */
function sessionAt(ms) {
    const e = etParts(ms);
    const trading = isTradingDay(e.date);
    const close = regCloseMin(e.date), postEnd = postEndMin(e.date);
    let session = 'closed';
    if (trading) {
        if (e.min >= 240 && e.min < 570) session = 'pre';
        else if (e.min >= 570 && e.min < close) session = 'regular';
        else if (e.min >= close && e.min < postEnd) session = 'post';
    }
    const completedToday = trading && e.min >= close;
    const lastClosed = completedToday ? e.date : prevTradingDay(trading ? e.date : shiftDate(e.date, 1));
    const bounds = trading ? [240 * 60, 570 * 60, close * 60, postEnd * 60] : [];
    let sinceBoundary = Infinity, toBoundary = Infinity;
    for (const b of bounds) {
        const d = e.sec - b;
        if (d >= 0 && d < sinceBoundary) sinceBoundary = d;
        if (d < 0 && -d < toBoundary) toBoundary = -d;
    }
    return { session, today: e.date, tradingToday: trading, lastClosed, prevClosed: prevTradingDay(lastClosed), sinceBoundary, toBoundary, early: EARLY_CLOSE.has(e.date), et: e };
}

/** ET 날짜 + 'HH:MM[:SS]' → epoch ms (일광절약 경계 처리: 해당 날짜 정오 기준 오프셋 사용) */
function etToMs(date, hms) {
    const [h, m = 0, s = 0] = String(hms).split(':').map(Number);
    const guess = Date.parse(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}Z`);
    // guess 는 "UTC 로 읽은 ET 벽시계" — 실제 UTC 는 오프셋만큼 뒤. 두 번 보정하면 경계일도 맞는다.
    let ms = guess;
    for (let i = 0; i < 2; i++) {
        const p = etParts(ms);
        const wall = Date.parse(`${p.date}T${p.hms}Z`);
        ms += guess - wall;
    }
    return ms;
}

/** 이 ms 가 ET 기준으로 그날(date)의 어느 세션 창에 속하나: pre | regular | post | none */
function windowOf(ms, date) {
    const e = etParts(ms);
    if (e.date !== date) return 'none';
    const close = regCloseMin(date), postEnd = postEndMin(date);
    if (e.min >= 240 && e.min < 570) return 'pre';
    if (e.min >= 570 && e.min < close) return 'regular';
    if (e.min >= close && e.min < postEnd) return 'post';
    return 'none';
}

const kstHm = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
const kstStamp = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(ms)).replace(' ', 'T');

/** 세션 전환 시각(ET 04:00·09:30·16:00·20:00) 중 [from, to] 사이에 있는 것의 epoch ms 목록 */
function transitionsBetween(fromMs, toMs) {
    const out = [];
    const start = shiftDate(etDateOf(fromMs), -1), end = shiftDate(etDateOf(toMs), 1);
    for (let d = start; d <= end; d = shiftDate(d, 1)) {
        if (!isTradingDay(d)) continue;
        const marks = [[4, 0, 'pre'], [9, 30, 'regular'], [Math.floor(regCloseMin(d) / 60), regCloseMin(d) % 60, 'post'], [Math.floor(postEndMin(d) / 60), postEndMin(d) % 60, 'closed']];
        for (const [h, m, name] of marks) {
            const t = etToMs(d, `${h}:${m}:00`);
            if (t > fromMs && t <= toMs) out.push({ at: t, to: name, date: d });
        }
    }
    return out;
}

module.exports = {
    HOLIDAYS, EARLY_CLOSE, etParts, etDateOf, shiftDate, isTradingDay, prevTradingDay, nextTradingDay,
    regCloseMin, postEndMin, sessionAt, etToMs, windowOf, kstHm, kstStamp, transitionsBetween,
};
