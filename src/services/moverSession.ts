/**
 * 마켓 무버 «세션 보정» 공용 모듈 (2026-11-18 — /api/market/movers 안에 있던 것을 그대로 옮겼다. 동작 변경 없음).
 *
 * 무버 API(app/api/market/movers)와 «✦ 오늘 볼 것»(services/todayPicksService)이 같은 규칙을 쓴다:
 *   · 정규장이 닫혀 있으면 EOD 스냅샷이 «마지막으로 끝난 세션»일 때만 그 종가 목록으로 다시 만든다(applyRegularClose).
 *   · 분할 보정은 services/splitGuard.applySplitGuard(호출자가 이 뒤에 부른다).
 * now 인자는 시험·크론용 — 생략하면 지금 시각(예전과 같다).
 * 배경 설명(9/9 종가 오염 · 9/12 T+1 밀림)은 app/api/market/movers/route.ts 머리말에 그대로 남아 있다.
 */
import { readEodCloses } from '@/services/eodSnapshot';
import { etDateOf, sessionCloseMinutes } from '@/lib/marketCalendar';

const etParts = (now: number) => new Date(new Date(now).toLocaleString('en-US', { timeZone: 'America/New_York' }));

/**
 * 지금 정규장이 «열려 있는가» (평일 09:30~16:00 ET · 조기 폐장일은 13:00 까지).
 * [2026-11-28] 11/27 블프 13:00 마감 뒤에도 16:00 까지 «열림»으로 봐 EOD 보정을 건너뛰었고,
 *   무버가 시간외 체결을 하루 등락으로 보였다(NVDA 무버 −0.03% vs 내 종목 정규장 종가 +0.74%).
 */
export function isRegularSessionOpen(now: number = Date.now()): boolean {
    const d = etParts(now);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) return false;
    const m = d.getHours() * 60 + d.getMinutes();
    return m >= 9 * 60 + 30 && m < sessionCloseMinutes(etDateOf(now));
}

/** 마지막으로 «끝난» 정규장 세션 날짜 (ET, YYYY-MM-DD) — 휴장일은 판별하지 않는다(어긋나면 «덮지 않는» 쪽으로 실패). */
export function lastCompletedSessionDateET(now: number = Date.now()): string {
    const cur = etParts(now);
    const d = new Date(cur);
    const minutes = cur.getHours() * 60 + cur.getMinutes();
    const dow = cur.getDay();
    const finishedToday = dow >= 1 && dow <= 5 && minutes >= sessionCloseMinutes(etDateOf(now));   // 조기 폐장일 13:00
    if (!finishedToday) d.setDate(d.getDate() - 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type EodVerdict = { eodDate: string | null; expected: string; applied: boolean };
/** 진단용 — 마지막 판정 결과(무버 API 응답 meta 의 eod) */
let _lastEodVerdict: EodVerdict | null = null;
export const lastEodVerdict = (): EodVerdict | null => _lastEodVerdict;

export const CLOSED_MIN_UNIVERSE = 200;        // 이보다 얇으면 EOD 를 믿지 않는다
export const CLOSED_MIN_VALUE = 10_000_000;    // 등락 순위에서 잡주를 걸러내는 최소 거래대금

export const isCommonTickerSymbol = (ticker: string): boolean => {
    const likelyWarrantOrUnit = ticker.length === 5 && /[WRU]$/.test(ticker);
    return (
        ticker !== 'ZVZZT' &&
        /^[A-Z]{1,5}$/.test(ticker) &&
        !likelyWarrantOrUnit
    );
};

export const byTradingValue = (a: any, b: any) => b.value - a.value;
export const byGainers = (a: any, b: any) => b.changePercent - a.changePercent || byTradingValue(a, b);
export const byLosers = (a: any, b: any) => a.changePercent - b.changePercent || byTradingValue(a, b);

export function hasMoverSet(data: any): boolean {
    return Boolean(
        data &&
        Array.isArray(data.value) &&
        Array.isArray(data.gainers) &&
        Array.isArray(data.losers) &&
        data.value.length > 0 &&
        data.gainers.length > 0 &&
        data.losers.length > 0
    );
}

/** 정규장이 닫혀 있으면 «마지막으로 끝난 세션»의 EOD 종가로 목록을 다시 만든다(날짜가 맞을 때만). 각 행에 regularCloseFrom = EOD 날짜. */
export async function applyRegularClose<T extends Record<string, any[]>>(lists: T, now: number = Date.now()): Promise<T> {
    if (isRegularSessionOpen(now)) return lists;   // 장중엔 EOD 가 직전 세션이다 — 덮지 않는다
    const eod = await readEodCloses();
    const expected = lastCompletedSessionDateET(now);
    if (!eod) { _lastEodVerdict = { eodDate: null, expected, applied: false }; return lists; }
    // ★ 날짜 게이트 — EOD 가 «마지막으로 끝난 세션»이 아니면 절대 덮지 않는다(벌크 EOD 는 T+1).
    if (eod.date !== expected) {
        _lastEodVerdict = { eodDate: eod.date, expected, applied: false };
        return lists;
    }
    _lastEodVerdict = { eodDate: eod.date, expected, applied: true };

    const rows: any[] = [];
    for (const [t, e] of eod.rows) {
        if (!isCommonTickerSymbol(t)) continue;
        if (!(e.c >= 1) || !(e.v >= 10000)) continue;
        rows.push({
            ticker: t,
            price: e.c,
            prevClose: null, // 벌크 원천에 전일종가 없음 — 반올림 등락률로 역산하지 않는다
            changePercent: e.chgPct,
            volume: e.v,
            value: e.v * e.c,
            up: e.chgPct >= 0,
            spark: null,
            regularCloseFrom: eod.date,
        });
    }
    if (rows.length < CLOSED_MIN_UNIVERSE) return lists;   // 못 믿을 만큼 얇다 — 원래 것을 둔다

    const liquid = rows.filter((r) => r.value >= CLOSED_MIN_VALUE);
    return {
        value: [...rows].sort(byTradingValue).slice(0, 30),
        gainers: liquid.filter((r) => r.changePercent > 0).sort(byGainers).slice(0, 30),
        losers: liquid.filter((r) => r.changePercent < 0).sort(byLosers).slice(0, 30),
    } as unknown as T;
}
