import { fmpEtToMs } from '@/lib/fmpTime';
import { etDateOf, etMinutesOf, sessionCloseMinutes } from '@/lib/marketCalendar';

/**
 * AI 근거의 «시각 판정» 정본 — 가디언 Tactical·내 종목 AI 해석이 모두 이 파일만 쓴다(관문 10/20 4회 보류의 공통 뿌리).
 *
 * 원천별 시간대 계약:
 *   · fmp:econ-calendar — FMP 경제 일정 date·time 은 UTC(lib/fmpCalendarTime 머리말 10/7 실측).
 *   · fmp:news          — FMP 뉴스 publishedDate 는 뉴욕 벽시계(lib/fmpTime 머리말 9/24 실측).
 *   · news:utc          — Polygon published_utc·명시 오프셋 문자열.
 *   · wall:et           — 실적 etTime/time·이미 ET 로 바꿔 쓴 근거 줄의 «HH:MM ET».
 *   명시된 오프셋(Z·+09:00)은 어느 원천이든 그대로 믿는다.
 * 실적 hour(BMO/AMC)는 시각이 아니다 → earningsReleaseAt 이 경계로 다룬다.
 */
export type EvidenceTimeSource = 'fmp:econ-calendar' | 'fmp:news' | 'news:utc' | 'wall:et';

export interface EvidenceInstant { ms: number; iso: string; date: string; time: string }

export function evidenceTime(source: EvidenceTimeSource, value: unknown): EvidenceInstant | null {
    if (typeof value !== 'string') return null;
    const s = value.trim().replace(' ', 'T');
    const match = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/i);
    if (!match) return null;
    // Date.parse가 2/30 등을 다음 달로 보정한 값을 근거로 쓰지 않는다.
    const wall = Date.parse(`${match[1]}T${match[2]}:${match[3] || '00'}Z`);
    if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 19) !== `${match[1]}T${match[2]}:${match[3] || '00'}`) return null;
    const utcSource = source === 'fmp:econ-calendar' || source === 'news:utc';
    const ms = match[4] || utcSource ? Date.parse(`${s}${match[4] ? '' : 'Z'}`) : fmpEtToMs(s);
    if (ms === null || !Number.isFinite(ms)) return null;
    const minutes = etMinutesOf(ms);
    const date = etDateOf(ms);
    const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    // 봄 DST 전환의 존재하지 않는 뉴욕 벽시계 시각은 제외한다.
    if (!match[4] && !utcSource && `${date}T${time}` !== `${match[1]}T${match[2]}`) return null;
    return { ms, iso: new Date(ms).toISOString(), date, time };
}

/** ET 달력 날짜의 0시(ET) — DST 전환일에도 그 날짜의 첫 순간. */
export function etDayStartMs(ymd: string): number | null {
    return evidenceTime('wall:et', `${ymd} 00:00`)?.ms ?? null;
}

/** ET 달력의 다음 날짜(24시간 더하기가 아니라 달력 기준). */
export function nextEtDate(ymd: string): string {
    return new Date(Date.parse(`${ymd}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

/**
 * 실적 발표의 «예정에서 빠지는» 시각.
 *   · 공급사 정확 시각(etTime/time, ET 벽시계)이 있으면 그 시각.
 *   · AMC(장 마감 뒤)만 알면 시장 달력의 폐장 시각(평소 16:00 · 조기 폐장 13:00 ET).
 *   · BMO(장 시작 전)만 알면 그 날짜 0시 ET — 장전 발표는 06:00~09:15 어디든 가능해 «당일에 예정»이라고 말할 근거가 없다.
 *   · 시각 정보가 없으면 그 날짜 0시 ET(당일엔 발표 여부 미확인).
 * exact=true 는 정확 시각에서 나온 값.
 */
export function earningsReleaseAt(date: string, hour: unknown, exactTime: unknown): { ms: number; exact: boolean; boundary: 'exact' | 'amc' | 'bmo' | 'day' } | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    if (typeof exactTime === 'string' && HHMM.test(exactTime)) {
        const at = evidenceTime('wall:et', `${date} ${exactTime}`);
        if (at) return { ms: at.ms, exact: true, boundary: 'exact' };
    }
    const h = String(hour || '').toLowerCase();
    if (h === 'amc') {
        const close = sessionCloseMinutes(date);
        const time = `${String(Math.floor(close / 60)).padStart(2, '0')}:${String(close % 60).padStart(2, '0')}`;
        const at = evidenceTime('wall:et', `${date} ${time}`);
        if (at) return { ms: at.ms, exact: false, boundary: 'amc' };
    }
    const start = etDayStartMs(date);
    return start == null ? null : { ms: start, exact: false, boundary: h === 'bmo' ? 'bmo' : 'day' };
}

// ── 근거 «줄»(모델에 준 글)의 시각 ─────────────────────────────────────────────
// 줄 모양(tacticalPrompt.cachedEvidence 가 만든다):
//   [economic calendar; 2026-10-20 08:30 ET] CPI (scheduled; not a released result)
//   [earnings calendar; 2026-10-21; 16:00 ET] AAPL (confirmed; scheduled; not a released result)
//   [earnings calendar; 2026-10-21; AMC timing boundary 16:00 ET; exact release time unknown] X (estimated schedule; scheduled; ...)
//   [earnings calendar; 2026-10-21; BMO; exact release time unknown] X (estimated schedule; scheduled; ...)
export const SCHEDULED_MARK = 'scheduled; not a released result';

/** 근거 줄이 «예정»이면 그 예정이 끝나는 순간(ms). 예정 줄이 아니거나 날짜가 없으면 null. 시각이 없으면 그 날짜 0시 ET. */
export function scheduledLineAt(line: string): number | null {
    if (typeof line !== 'string' || !line.includes(SCHEDULED_MARK)) return null;
    const head = line.match(/^\[([^\]]*)\]/)?.[1] ?? line;
    const date = head.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
    if (!date) return null;
    // 정확 시각 없는 AMC 표식은 저장본의 옛 16:00도 시장 달력으로 판정한다.
    // 근거 문자열 형식을 유지해 조기 폐장~16:00 밖의 프롬프트·검사 결과는 바꾸지 않는다.
    if (head.startsWith('earnings calendar;') && head.endsWith('; AMC timing boundary 16:00 ET; exact release time unknown')) {
        return earningsReleaseAt(date, 'amc', null)?.ms ?? null;
    }
    const time = head.match(/\b(\d{2}:\d{2}(?::\d{2})?) ET\b/)?.[1];
    if (time) return evidenceTime('wall:et', `${date} ${time}`)?.ms ?? null;
    return etDayStartMs(date);
}

/** 지금도 «앞으로 있을» 예정 줄인가. 지난 예정은 결과가 확인되지 않았어도 예정이 아니다. */
export function isUpcomingLine(line: string, nowMs: number): boolean {
    const at = scheduledLineAt(line);
    return at != null && Number.isFinite(nowMs) && at > nowMs;
}

/** 근거 줄 목록에서 «지난 예정»만 뺀다(발표됨·미확인 줄은 그대로). 낡은 코어·캐시의 예정 표시를 현재 시각으로 거른다. */
export function dropElapsedScheduled(lines: readonly string[], nowMs: number): string[] {
    return lines.filter(l => scheduledLineAt(l) == null || isUpcomingLine(l, nowMs));
}

/**
 * 근거로 만든 글의 유효 기한 — 근거 속 가장 이른 예정 시각, 그리고(dayEnd, 기본) 생성한 ET 날짜의 끝(«오늘» 근거가 내일로 넘어가지 않게).
 * 근거 변화를 해시로 따로 확인하는 호출자(내 종목)는 dayEnd:false — 예정 시각만 본다.
 * 이 시각이 지나면 글을 내보내지 않고 다시 만든다.
 */
export function evidenceValidUntil(lines: readonly string[], generatedAtMs: number, opts: { dayEnd?: boolean } = {}): number {
    let until = opts.dayEnd === false ? Infinity : etDayStartMs(nextEtDate(etDateOf(generatedAtMs))) ?? generatedAtMs + 86_400_000;
    for (const l of lines) {
        const at = scheduledLineAt(l);
        if (at != null && at > generatedAtMs && at < until) until = at;
        // 생성 때 이미 지난 «예정» 줄로 만든 글은 처음부터 유효하지 않다.
        if (at != null && at <= generatedAtMs) return generatedAtMs;
    }
    return until;
}
