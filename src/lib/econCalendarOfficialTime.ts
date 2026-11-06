/**
 * FMP 경제지표 캘린더(UTC) 중 «서머타임이 끝났는데 EDT(UTC−4) 기준 UTC 를 그대로 둔» 행을 공식 ET 발표 시각으로 바로잡는다. 순수 함수(네트워크·Redis 없음).
 *
 * ★2026-11-06 운영 실측(서머타임 종료 11/1 뒤, 캐시 fmp:econ-calendar):
 *   - CFTC «… speculative net positions» 11/6 19:30Z = 14:30 EST — 공식(CFTC 발표 일정) 금요일 15:30 ET = 20:30Z.
 *   - «WASDE Report» 11/10 16:00Z = 11:00 EST — 공식(USDA) 12:00 ET = 17:00Z.
 *   같은 캐시의 BLS·CPI·실업수당(13:30Z=08:30)·Michigan(15:00Z=10:00)·MBA(12:00Z=07:00)·API(21:30Z=16:30)·FOMC Minutes(19:00Z=14:00)는 EST 로 맞게 옮겨져 있다.
 *   → 공급자가 일부 행만 EDT 로 남긴다. 고정 오프셋(−4/−5)을 더하지 않고, 알려진 정기 발표의 «공식 ET 벽시계»를 America/New_York 으로 그날의 UTC 로 바꾼다.
 *
 * 안전장치: 공급자 시각과 공식 시각이 «정확히 ±60분»(서머타임 흔적)일 때만 고친다 — 휴일 연기(예: EIA 11/12 12:00 ET)·특별 일정은 건드리지 않는다.
 * 형식(date 'YYYY-MM-DD' · time 'HH:MM' UTC)은 그대로라 같은 캐시를 읽는 다른 곳(EC2 워커·브리핑·오늘 요약)도 그대로 읽는다.
 */
import { etDateOf, etMinutesOf } from '@/lib/marketCalendar';

/** 정기 발표 → 공식 ET 발표 시각. 휴일 연기로 시각이 바뀌는 EIA 주간 재고·Fed 연설은 넣지 않는다. */
const OFFICIAL_ET: ReadonlyArray<{ re: RegExp; et: string }> = [
    { re: /^CFTC .*speculative net positions/i, et: '15:30' },             // CFTC COT — 3:30 p.m. ET
    { re: /^WASDE Report$/i, et: '12:00' },                                  // USDA WASDE — 12:00 p.m. ET
    { re: /^API Crude Oil Stock Change/i, et: '16:30' },                     // API 주간 원유 — 화 4:30 p.m. ET
    { re: /^MBA 30-Year Mortgage Rate|^MBA Mortgage/i, et: '07:00' },        // MBA — 7:00 a.m. ET
    { re: /^(Initial|Continuing) Jobless Claims|^Jobless Claims 4-Week Average/i, et: '08:30' }, // DOL — 8:30 a.m. ET
    { re: /^(Core )?Inflation Rate|^CPI\b/i, et: '08:30' },                  // BLS CPI — 8:30 a.m. ET
    { re: /^(Producer Price Index|Core PPI|PPI)\b/i, et: '08:30' },          // BLS PPI — 8:30 a.m. ET
    { re: /^Non ?Farm Payrolls|^Unemployment Rate|^U-6 Unemployment Rate|^Average Hourly Earnings|^Participation Rate/i, et: '08:30' }, // BLS 고용 — 8:30 a.m. ET
    { re: /^Michigan Consumer Sentiment/i, et: '10:00' },                    // 미시간대 — 10:00 a.m. ET
    { re: /^FOMC Minutes$|^Fed Interest Rate Decision$/i, et: '14:00' },     // FOMC — 2:00 p.m. ET
];

/** ET 날짜·벽시계 → UTC ms. 그날의 실제 뉴욕 오프셋(EDT/EST)을 IANA 로 확인한다. 없는 시각(봄 전환 02:xx)이면 null. */
export function etWallToUtcMs(dateET: string, timeET: string): number | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateET) || !/^\d{2}:\d{2}$/.test(timeET)) return null;
    const [y, m, d] = dateET.split('-').map(Number);
    const [h, min] = timeET.split(':').map(Number);
    for (const off of [4, 5]) {
        const ms = Date.UTC(y, m - 1, d, h + off, min);
        if (etDateOf(ms) === dateET && etMinutesOf(ms) === h * 60 + min) return ms;
    }
    return null;
}

/** 한 행의 date·time(UTC)을 공식 ET 시각에 맞춘다. 고칠 것이 없으면 입력 그대로. */
export function officialUtcTime(event: unknown, date: unknown, time: unknown): { date: string; time: string } {
    const d = String(date ?? '');
    const t = String(time ?? '');
    const name = typeof event === 'string' ? event.trim() : '';
    const rule = name ? OFFICIAL_ET.find((r) => r.re.test(name)) : undefined;
    if (!rule || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) return { date: d, time: t };
    const ms = Date.parse(`${d}T${t}:00Z`);
    if (!Number.isFinite(ms)) return { date: d, time: t };
    const official = etWallToUtcMs(etDateOf(ms), rule.et);
    if (official == null || Math.abs(official - ms) !== 3_600_000) return { date: d, time: t };
    const iso = new Date(official).toISOString();
    return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/**
 * 캐시 행 배열에 적용(형식 유지) + 시각 순 재정렬.
 * ★11/7 06:0x 운영: 공급자가 같은 CFTC 행을 «옛 EDT 시각(19:30Z, 실제치 없음)»과 «공식 시각(20:30Z, 실제치 있음)» 두 벌로 준다 →
 *   보정한 행이 공급자의 공식 시각 행과 겹치면(같은 이름·날짜·시각) 공급자 행을 남기고 보정 행은 뺀다.
 */
export function normalizeEconCalendarTimes<T extends { event?: unknown; date?: unknown; time?: unknown }>(events: T[]): T[] {
    const key = (e: T) => `${String(e.event ?? '').trim()}|${e.date}|${e.time}`;
    const original = new Set(events.filter(Boolean).map(key));
    const out: T[] = [];
    for (const e of events) {
        if (!e) { out.push(e); continue; }
        const fixed = officialUtcTime(e.event, e.date, e.time);
        if (fixed.date === e.date && fixed.time === e.time) { out.push(e); continue; }
        const moved = { ...e, ...fixed };
        if (original.has(key(moved))) continue;
        out.push(moved);
    }
    return out.sort((a, b) => `${a?.date} ${a?.time}`.localeCompare(`${b?.date} ${b?.time}`));
}
