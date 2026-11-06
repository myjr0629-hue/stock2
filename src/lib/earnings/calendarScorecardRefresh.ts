import { etDateOf } from '@/lib/marketCalendar';
import { calendarScorecardSummary, calendarScorecardWeek } from './calendarScorecardDisplay';

type Summary = { n: number; withinCount: number };
const REFRESH_MS = 10 * 60_000;
const currentWeek = (now: number) => calendarScorecardWeek(etDateOf(now));

/** 다음 ET 주 시작을 찾아 장시간 열린 화면에서도 지난주 수치를 즉시 지운다. */
export function nextScorecardWeekStart(now: number): number {
  const week = currentWeek(now);
  let low = now, high = now + 8 * 86400_000;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (currentWeek(mid) === week) low = mid; else high = mid;
  }
  return high;
}

export function watchCalendarScorecard(setSummary: (summary: Summary | null) => void): () => void {
  let controller: AbortController | null = null;
  let stopped = false;
  let boundary: ReturnType<typeof setTimeout>;
  const load = () => {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    const now = Date.now();
    const week = currentWeek(now);
    setSummary(null);
    clearTimeout(boundary);
    boundary = setTimeout(load, nextScorecardWeekStart(now) - now);
    // 주간 URL에만 의존하면 중간 캐시가 이전 응답을 재사용할 수 있다.
    // 같은 10분 구간의 사용자는 키를 공유해 캐시 분산을 제한한다.
    fetch(`/api/earnings/scorecard?week=${week}&refresh=${Math.floor(now / REFRESH_MS)}`, { signal: request.signal, cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!stopped && !request.signal.aborted) setSummary(calendarScorecardSummary(data, currentWeek(Date.now())));
      })
      .catch(() => { if (!stopped && !request.signal.aborted) setSummary(null); });
  };
  const onVisibility = () => { if (document.visibilityState === 'visible') load(); };
  document.addEventListener('visibilitychange', onVisibility);
  const interval = setInterval(load, REFRESH_MS);
  load();
  return () => {
    stopped = true;
    controller?.abort();
    clearInterval(interval);
    clearTimeout(boundary);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
