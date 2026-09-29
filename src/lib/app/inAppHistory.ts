// ============================================================================
// 앱 안 이동 기록 — «뒤로» 버튼이 앱 밖(앱을 켠 첫 화면 이전)으로 나가지 않게 (9/29 검토 B12)
// ----------------------------------------------------------------------------
// window.history.length 는 «앞으로 가기» 칸과 앱을 켜기 전 칸까지 센다 — 뒤에 앱 화면이 있는지 알려 주지 않는다.
// 그래서 앱 레이아웃에 늘 떠 있는 WatchlistHost 가 경로가 바뀔 때마다 noteInAppPath() 를 부르고,
// 여기서 «앱 안에서 들어온 깊이»를 센다: 새 경로로 옮기면 +1, 뒤로가기(popstate)로 돌아온 경로면 −1.
//   · 처음 본 경로(앱을 켠 화면·새로고침·딥링크로 바로 연 화면)는 0 — 뒤에 앱 화면이 없다
//   · 언어 바꾸기(router.replace)는 로케일을 뺀 경로가 같아 세지 않는다
//   · 같은 화면 안의 ?t= 바꾸기·시트가 얹은 히스토리 칸도 경로가 같아 세지 않는다
//   틀릴 때는 «덜 세는» 쪽으로만 틀린다 — 그때 «뒤로»는 Dashboard 로 바꿔 간다(앱 밖으로 나가지 않는다).
// ============================================================================

let depth = 0;
let current: string | null = null;
/** 마지막 popstate 가 데려간 주소(그 뒤 경로 변화가 이 주소면 «뒤로 온 것») */
let popTo: string | null = null;
let listening = false;

function here(): string {
  try { return window.location.pathname; } catch { return ''; }
}

function listen() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('popstate', () => { popTo = here(); });
}

/** 경로(로케일을 뺀 앱 경로)가 바뀔 때마다 — 그리고 처음 한 번 — 부른다 */
export function noteInAppPath(path: string): void {
  if (typeof window === 'undefined') return;
  listen();
  if (current === null) { current = path; return; }
  if (path === current) return;
  depth = popTo !== null && popTo === here() ? Math.max(0, depth - 1) : depth + 1;
  popTo = null;
  current = path;
}

/** 뒤에 앱 화면이 있는가 — 없으면 «뒤로»는 history.back() 대신 Dashboard 로 바꿔 간다 */
export function hasInAppBack(): boolean {
  if (typeof window === 'undefined') return false;
  let len = 0;
  try { len = window.history.length; } catch { /* noop */ }
  return depth > 0 && len > 1;
}

/** 시험 전용 — 기록을 비운다 */
export function _resetInAppHistoryForTest(): void {
  depth = 0;
  current = null;
  popTo = null;
}
