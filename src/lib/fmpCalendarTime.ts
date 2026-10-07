/**
 * FMP 경제지표 캘린더(`fmp:econ-calendar`)의 date·time 은 «UTC» 다 — ET 로 바꿔 쓴다. 순수 함수만(네트워크·Redis 없음).
 *
 * ★2026-10-07 운영 실측(모닝브리핑): en «The FOMC Minutes release at 18:00 ET» · ja «本日18:00 ETのFOMC議事録公開».
 *   FOMC 의사록은 14:00 ET 다. 캐시 원본은 FMP 의 «UTC 시각» 이다(같은 캐시: Initial Jobless Claims 12:30 = 08:30 ET · CPI 12:30 = 08:30 ET ·
 *   MBA 11:00 = 07:00 ET · EIA 14:30 = 10:30 ET · Existing Home Sales 14:00 = 10:00 ET · Beige Book 18:00 = 14:00 ET — 전부 EDT 기준 +4시간).
 *   크론(cron/economic-calendar)은 FMP 의 date 문자열에서 시각만 잘라 그대로 저장하고, 브리핑 생성은 그 값에 «ET» 를 붙여 모델에 줬다.
 *   → 브리핑이 4시간 늦은 «ET» 시각을 매일 쓴다(08:05 ET 에 «12:30 ET 발표»라고 쓰면 이미 08:30 에 나온 지표다).
 * 캐시 형식을 바꾸면 같은 캐시를 읽는 다른 곳(EC2 워커 이벤트 임팩트·웹 달력 위젯·WIM)의 동작이 한꺼번에 바뀌므로, 여기서는 «브리핑 프롬프트를 만드는 곳»만 변환한다.
 */
import { etDateOf, etMinutesOf } from '@/lib/marketCalendar';

/** FMP(UTC) date·time → ET 날짜·시각. 모양이 틀리면 null. DST 는 America/New_York 이 정한다(EDT +4 · EST +5). */
export function fmpCalendarToET(date: unknown, time: unknown): { date: string; time: string } | null {
    const d = String(date ?? '').trim();
    const t = String(time ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{1,2}:\d{2}$/.test(t)) return null;
    const ms = Date.parse(`${d}T${t.padStart(5, '0')}:00Z`);
    if (!Number.isFinite(ms)) return null;
    const m = etMinutesOf(ms);
    return { date: etDateOf(ms), time: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` };
}

/** 브리핑 프롬프트에 넣을 «오늘(ET) 고영향 지표» 줄 — 시각은 ET 로 바꿔 쓴다. */
export function calendarPromptLines(events: unknown, todayET: string, max = 5): string[] {
    if (!Array.isArray(events)) return [];
    const out: Array<{ key: string; line: string }> = [];
    for (const e of events as any[]) {
        if (!e || e.impact !== 'HIGH') continue;
        const et = fmpCalendarToET(e.date, e.time);
        if (!et || et.date !== todayET) continue;
        out.push({ key: `${et.date} ${et.time}`, line: `${et.time} ET: ${e.event} (Est: ${e.estimate || 'N/A'}, Prev: ${e.previous || 'N/A'})` });
    }
    out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return out.slice(0, max).map((x) => x.line);
}
