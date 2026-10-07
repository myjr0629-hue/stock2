// ============================================================================
// 스토어 평점 요청 «순간» 두 곳 — 앱 세션 횟수 · 내 종목 담기 성공 (대표 10/7 10시)
// ----------------------------------------------------------------------------
// 요청 자체는 src/hooks/useReviewPrompt.ts 가 한다(OS 제공 시트만 · 가이드라인 5.6.1 · 이 파일은 그 훅을
// «그대로» 쓴다). 여기는 «언제 부르는가»만 정한다 — React 를 가져오지 않아 node 시험에서 그대로 돈다.
//
// 왜 두 곳을 더했나(10/7 실측): 평점 수 미국 2 · 한국 4 · 일본 0. 평점 수는 스토어 검색 순위·전환율의 입력값인데
//   앱 안의 요청 순간이 Intel 열람(2·7번째)과 하트 담기(3·12번째, 9/30)뿐이라 대부분의 사용자는 한 번도 못 받는다.
//
//   ① 앱 세션  signum.appSessions  [3, 10]  — 웹뷰 세션당 1회(sessionStorage 표식) · 시작 2.5초 뒤
//   ② 담기 성공 signum.watchAdds    [2]      — 담기 성공 «뒤» · 토스트(2.5초)가 사라진 뒤(3초)
//
// 담기 쪽은 «한 곳»에서 센다: 담는 경로가 일곱(하트·검색 Enter·검색 행·길게 누르기·대시 칩·빈 목록 칩·
//   PRO 직후 자동 담기)인데 모두 starActions.addStar 로 모인다 → addStar 성공 끝에서 이벤트 한 번을 쏘고
//   (announceWatchlistAdded), 앱 레이아웃에 한 번 마운트된 ReviewPromptMoments 가 받아 훅을 부른다.
//   (예전엔 StarButton 안에 signum.wlAdds [3,12] 가 있었다 — 하트 버튼 한 경로만 셌고, 이걸 남기면 2번째에 이어
//    3번째 담기에서 또 요청이 가므로 이 공용 지점으로 흡수했다.)
//
// 세지 않는 담기:
//   · src === 'restore' — 한도 시트에서 PRO 가 된 직후의 «자동 담기». 결제 흐름의 일부라 성공 순간이 아니다.
//   · 저장 실패 경고가 뜬 담기(사생활 모드·용량 초과) — 성공이 아니다(addStar 가 이벤트를 쏘지 않는다).
//
// 광고·시스템 팝업과 겹치지 않는 근거(10/7 코드 확인):
//   · 앱 오픈 광고는 없다(src/services/adManager.ts — 배너·전면·보상형뿐).
//   · 전면 광고의 활성 호출처는 둘 — Intel 섹터 열람 3회마다 · 하단 탭 전환 5회마다 — 모두 adManager.maybeShowInterstitial 을
//     거치고, 거기에 «시작 후 60초 유예 · 3분 간격 · 세션 3회 상한»이 걸려 있다 → 시작 2.5초 뒤의 세션 요청과는 겹칠 수 없다.
//     (보상형은 «광고 보고 열기» 버튼을 누를 때만 · components/native/ValueWall 은 어디서도 쓰이지 않는다.)
//   · 훅 주석의 «3의 배수 회피»는 Intel 전면 광고와 같은 카운터를 쓰는 «열람 횟수»(signum.reportOpens)에만 해당한다 —
//     세션·담기 카운터는 광고 카운터와 무관하다.
//   · 시작 시점 시스템 팝업은 모두 «처음 한 번» 계열이다: ATT(iOS 미결정일 때만) · UMP 동의(EEA·미응답일 때만) ·
//     푸시 권한(온보딩 끝에서 한 번). 온보딩(약관 동의)을 3번째 세션까지 끝내지 않은 극히 드문 경우엔 그 위로 요청이 갈 수 있다 —
//     OS 가 365일 3회로 거르는 범위로 두었다(세션 카운트를 «온보딩 끝난 뒤»로 미루면 모든 사용자의 3번째가 4번째로 밀린다).
//
// 웹(비네이티브)은 완전 무동작: 훅이 isNativePlatform 으로 막는 것에 더해, 여기서도 네이티브가 아니면
//   sessionStorage 표식도 쓰지 않고 이벤트 구독도 걸지 않는다.
// ============================================================================

export interface ReviewMomentConfig {
  /** 누적 횟수를 담는 localStorage 키(훅이 쓴다) */
  storageKey: string;
  /** 시트를 «요청»할 누적 횟수 */
  milestones: number[];
  /** 순간 직후 얼마나 기다렸다 물어볼지(ms) */
  delayMs: number;
}

// ⚠️ 모듈 상수로 둔다 — 훅의 useCallback 의존성이 milestones 배열 «참조»라, 렌더마다 새 배열이면 콜백이 매번 바뀐다.
/** ① 앱 세션 — 3·10번째 세션. 첫 화면이 그려진 뒤(2.5초) 뜨게 한다. */
export const APP_SESSION_REVIEW: ReviewMomentConfig = { storageKey: 'signum.appSessions', milestones: [3, 10], delayMs: 2500 };
/** ② 내 종목 담기 성공 — 2번째 담기. 담기 토스트(2.5초)가 사라진 뒤(3초)에 뜬다(토스트의 «보기»를 가리지 않게). */
export const WATCH_ADD_REVIEW: ReviewMomentConfig = { storageKey: 'signum.watchAdds', milestones: [2], delayMs: 3000 };

/** 이 웹뷰 세션에서 이미 셌다는 표식(sessionStorage) */
export const APP_SESSION_MARK_KEY = 'signum.appSessionCounted';

/** «담기 성공» 이벤트 — 빼기(sg:watchlist-removed)와 같은 이름 규칙 */
export const WATCHLIST_ADDED_EVENT = 'sg:watchlist-added';

type StoreLike = Pick<Storage, 'getItem' | 'setItem'>;

/** window 에서 이 파일이 만지는 부분만 — 시험에서 가짜를 꽂는다(진짜 window 는 그대로 넘기면 된다) */
export interface MomentsWindow {
  Capacitor?: { isNativePlatform?: () => boolean };
  /** 읽는 것만으로 던질 수 있다(차단된 환경) */
  sessionStorage?: StoreLike;
  addEventListener?: (type: string, listener: (e: Event) => void) => void;
  removeEventListener?: (type: string, listener: (e: Event) => void) => void;
}

export interface WatchlistAddedDetail {
  t?: string;
  src?: string;
}

/** 네이티브 앱(Capacitor 셸) 안인가 — 훅과 같은 판정 */
export function isNativeApp(win: MomentsWindow | null | undefined): boolean {
  try { return !!win?.Capacitor?.isNativePlatform?.(); } catch { return false; }
}

/**
 * 이 웹뷰 세션에서 «처음»이면 표식을 남기고 true. 이미 셌거나 저장소를 못 쓰면 false.
 * 못 쓸 때 세지 않는 이유: 표식을 못 남기면 «세션당 1회»를 보장할 수 없어 마운트(언어 전환 재마운트 등)마다
 * 세게 된다 = 요청이 앞당겨진다. 요청이 늦는 쪽이 앞서는 쪽보다 안전하다.
 */
export function markAppSessionOnce(store: StoreLike | null | undefined): boolean {
  try {
    if (!store) return false;
    if (store.getItem(APP_SESSION_MARK_KEY) === '1') return false;
    store.setItem(APP_SESSION_MARK_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

/**
 * ① 앱 세션 한 번을 센다 — 네이티브이고 이 세션에서 처음일 때만 ask()(= 훅 콜백, 누적+1 → 마일스톤이면 시트 요청).
 * 센 경우 true.
 */
export function runSessionMoment(win: MomentsWindow | null | undefined, ask: () => void): boolean {
  if (!isNativeApp(win)) return false;
  let store: StoreLike | null = null;
  try { store = win?.sessionStorage ?? null; } catch { store = null; }   // 접근 실패 — 조용히 세지 않는다
  if (!markAppSessionOnce(store)) return false;
  try { ask(); } catch { /* 평점 요청이 앱을 막으면 안 된다 */ }
  return true;
}

/** 이 «담기»를 성공 순간으로 셀 것인가 — 사용자가 직접 담은 것만(PRO 직후 자동 담기 'restore' 제외) */
export function countsAsWatchAdd(detail: WatchlistAddedDetail | null | undefined): boolean {
  return detail?.src !== 'restore';
}

/**
 * ② 담기 성공 이벤트를 받아 ask() 를 부른다. 해제 함수를 돌려준다.
 * 네이티브가 아니면 구독 자체를 걸지 않는다.
 */
export function subscribeWatchAddMoment(win: MomentsWindow | null | undefined, ask: () => void): () => void {
  if (!win || !isNativeApp(win) || typeof win.addEventListener !== 'function') return () => {};
  const onAdded = (e: Event) => {
    try {
      if (countsAsWatchAdd((e as CustomEvent<WatchlistAddedDetail>).detail)) ask();
    } catch { /* 평점 요청이 담기를 막으면 안 된다 */ }
  };
  win.addEventListener(WATCHLIST_ADDED_EVENT, onAdded);
  return () => { try { win.removeEventListener?.(WATCHLIST_ADDED_EVENT, onAdded); } catch { /* noop */ } };
}

/**
 * starActions.addStar 가 «담기 성공» 끝에서 부른다. 구독자가 없어도(웹·앱 레이아웃 밖) 아무 일도 없다.
 * 던지지 않는다 — 평점 쪽 사정이 담기를 깨뜨리면 안 된다.
 */
export function announceWatchlistAdded(detail: WatchlistAddedDetail): void {
  try {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(WATCHLIST_ADDED_EVENT, { detail }));
  } catch { /* 오래된 웹뷰 */ }
}
