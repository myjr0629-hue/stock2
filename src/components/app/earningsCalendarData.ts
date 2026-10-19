// 앱 실적 화면 전용. 실패를 0건으로 저장하지 않고 마지막 정상본을 보존한다.
// 서버의 90초 실패 캐시가 지난 뒤부터 지수 백오프 3회(90·180·360초).
import { validateRowImplied, type RowImplied } from '@/lib/earnings/earningsImplied';
import { etDateOf } from '@/lib/marketCalendar';

const CACHE_KEY = 'signum:earnings-calendar:v1';
const RETRY_MS = [90_000, 180_000, 360_000] as const;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type CalendarRow = { ticker: string; date: string; hour?: string | null; implied?: RowImplied | null };
type Snapshot = { ok: true; rows: CalendarRow[]; generatedAt: string };
let lastGood: Snapshot | null = null;

function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== 'object') return false;
  const j = value as Record<string, unknown>;
  return j.ok === true && !j.reason && j.stale !== true
    && typeof j.generatedAt === 'string' && Number.isFinite(Date.parse(j.generatedAt))
    && Array.isArray(j.rows) && j.rows.every((r: unknown) => {
      if (!r || typeof r !== 'object') return false;
      const row = r as Record<string, unknown>;
      return typeof row.ticker === 'string' && !!row.ticker
        && typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date);
    });
}

function isRecent(snapshot: Snapshot, nowMs: number): boolean {
  const ageMs = nowMs - Date.parse(snapshot.generatedAt);
  return ageMs >= 0 && ageMs <= MAX_CACHE_AGE_MS;
}

function readLastGood(nowMs: number): Snapshot | null {
  // 저장소가 막혀 있어도 메모리 사본의 나이 제한은 동일하다.
  if (lastGood && !isRecent(lastGood, nowMs)) lastGood = null;
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (isSnapshot(stored) && isRecent(stored, nowMs) && (!lastGood || Date.parse(stored.generatedAt) >= Date.parse(lastGood.generatedAt))) {
      lastGood = stored;
    }
  } catch { /* 저장소 사용 불가·손상이면 메모리 사본만 쓴다 */ }
  return lastGood;
}

function remember(snapshot: Snapshot): void {
  lastGood = snapshot;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot)); } catch { /* 메모리 사본은 유지 */ }
}

/** 마운트 1회 + 실패 후 3회. 반환 함수는 타이머·요청과 늦게 도착한 응답을 모두 정리한다. */
export function watchEarningsCalendar<Row extends CalendarRow>(onRows: (rows: Row[], generatedAt: string) => void): () => void {
  let dead = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const nowMs = Date.now();
  const cached = readLastGood(nowMs);
  // 이전 0건 캐시나 이미 모두 지난 일정으로 이번 조회 실패를 «0건»이라 단정하지 않는다.
  if (cached) {
    const todayET = etDateOf(nowMs);
    const upcoming = cached.rows.filter((row) => row.date >= todayET);
    if (upcoming.length) {
      // 원본 행·생성 시각은 보존하고, 복원하는 값만 현재 날짜·만기 기준으로 검증한다.
      onRows(upcoming.map((row) => row.implied == null ? row
        : { ...row, implied: validateRowImplied(row, row.implied, nowMs) }) as Row[], cached.generatedAt);
    }
  }

  async function request(attempt: number): Promise<void> {
    controller = new AbortController();
    timeoutTimer = setTimeout(() => controller?.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch('/api/market/earnings-calendar', { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('earnings-unavailable');
      const payload: unknown = await response.json();
      // 구버전 200 + reason, 실패 본문, 손상된 응답도 정상 캐시를 덮어쓰지 못한다.
      if (!isSnapshot(payload)) throw new Error('earnings-unavailable');
      if (dead) return;
      const snapshot: Snapshot = { ok: true, rows: payload.rows, generatedAt: payload.generatedAt };
      remember(snapshot);
      onRows(snapshot.rows as Row[], snapshot.generatedAt);
    } catch {
      if (!dead && attempt < RETRY_MS.length) {
        retryTimer = setTimeout(() => { void request(attempt + 1); }, RETRY_MS[attempt]);
      }
      // 실적 화면에 기존 오류 상태가 없으므로, 정상본이 없으면 재시도 소진 뒤에도 null(로딩)을 유지한다.
    } finally {
      clearTimeout(timeoutTimer);
    }
  }

  void request(0);
  return () => {
    dead = true;
    clearTimeout(retryTimer);
    clearTimeout(timeoutTimer);
    controller?.abort();
  };
}
