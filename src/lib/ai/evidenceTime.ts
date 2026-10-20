import { fmpEtToMs } from '@/lib/fmpTime';
import { etDateOf, etMinutesOf } from '@/lib/marketCalendar';

/** 캐시 원천 계약. 경제 일정은 UTC, FMP 뉴스 publishedDate와 실적 etTime/time은 뉴욕 벽시계다.
 * 실적 hour(BMO/AMC)는 시각이 아니며 호출자가 별도 경계로 다룬다. 명시된 UTC 오프셋은 보존한다.
 */
type EvidenceTimeSource = 'fmp:econ-calendar' | 'fmp:news' | 'news:utc' | 'earnings:et';

export function evidenceTime(source: EvidenceTimeSource, value: unknown): {
    ms: number; iso: string; date: string; time: string;
} | null {
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
