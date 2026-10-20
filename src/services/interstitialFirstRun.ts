const FIRST_RUN_KEY = 'signum_app_first_run_at';
const FIRST_RUN_GRACE_MS = 10 * 60_000;
let firstRunAt: number | null | undefined;

/** 첫 실행 시작 시각을 보존한다. 백그라운드·재실행으로 10분 보호를 연장하지 않는다. */
export function isFirstRunGraceActive(): boolean {
  if (firstRunAt === undefined) {
    try {
      const raw = localStorage.getItem(FIRST_RUN_KEY);
      const saved = raw === null ? NaN : Number(raw);
      if (Number.isFinite(saved) && saved >= 0) firstRunAt = saved;
      else {
        // 표식 도입 전 사용자에게 새 설치 유예를 다시 부여하지 않는다.
        firstRunAt = localStorage.getItem('signum_ad_stats') !== null
          ? Date.now() - FIRST_RUN_GRACE_MS : Date.now();
        localStorage.setItem(FIRST_RUN_KEY, String(firstRunAt));
      }
    } catch {
      firstRunAt = null; // 저장소 불가 시 기존 동작대로 60초 시작 유예만 적용
    }
  }
  return firstRunAt !== null && Date.now() - firstRunAt < FIRST_RUN_GRACE_MS;
}

/** 시험 전용 — 새 JS 수명을 재현한다. */
export function __resetFirstRunForTest() { firstRunAt = undefined; }
