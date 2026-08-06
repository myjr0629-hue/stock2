// ============================================================================
// androidBottomInset — 안드로이드 하단 세이프영역을 «믿을 수 있는 값»으로 만든다
// ----------------------------------------------------------------------------
// 배경: 안드로이드 WebView 는 env(safe-area-inset-bottom) 을 0 으로 보고하는
// 알려진 버그가 있어서, 각 앱의 네이티브 셸(MainActivity)이 실측 바 높이를
// CSS 변수(--sig/--uc/--wim-bottom-floor)로 게시하고 웹은 max(env, floor) 를 썼다.
//
// 그런데 실기기에서 두 가지가 깨졌다 (2026-08-06, 삼성 실기기 진단 표시로 실측):
//
//  ① 셸이 **물리 픽셀**을 게시하는 빌드가 있다.
//     실측: `floor 126px` — 이건 48dp × dpr 2.625 다. 밀도로 안 나눈 값.
//     같은 화면에서 env() 는 **48px** 로 «정확히» 나오고 있었다.
//     max(48, 126) = 126 → 탭바가 126px 떠서 «화면 중간»에 뜬 것처럼 보였다.
//     (WIM 은 셸 빌드가 달라 정상값이 와서 처음부터 멀쩡했다.)
//
//  ② 웹뷰가 이미 인셋된 기기(내비바 아래를 안 그림)에서도 셸이 바 높이를 보내면
//     이중 인셋이 된다.
//
// 그래서 «셸을 믿지 않고» 아래 순서로 결정한다. 기기별 하드코딩 없이 성립한다.
//   1. 웹뷰가 화면보다 확실히 작으면 → 플랫폼이 이미 인셋함 → 0
//   2. env() 가 유효하면 → 그것이 정답 (브라우저가 CSS px = dp 로 준다)
//   3. 그래도 0 이면 → 셸 값을 쓰되, 안드로이드 하단 바는 56dp 를 넘지 않으므로
//      그보다 크면 «물리 픽셀»로 판단해 dpr 로 되돌린다.
// ============================================================================

/** env(safe-area-inset-bottom) 의 «실제» 계산값을 px 로 읽는다. 미지원이면 0. */
export function measureEnvBottomPx(): number {
  try {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:-9999px;bottom:0;width:0;pointer-events:none;' +
      'height:env(safe-area-inset-bottom,0px);';
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    probe.remove();
    return Number.isFinite(h) && h > 0 ? h : 0;
  } catch {
    return 0;
  }
}

/** 안드로이드 하단 바가 실제로 차지하는 dp. 56dp 를 넘는 값은 물리 픽셀로 본다. */
const MAX_PLAUSIBLE_BOTTOM_DP = 56;

/**
 * @param floorVar 셸이 게시하는 CSS 변수명 (예: '--uc-bottom-floor')
 * @returns 하단에 비워야 할 px (CSS px = dp)
 */
export function resolveBottomSafePx(floorVar: string): number {
  // 1) 웹뷰가 화면보다 «확실히» 작다 = 플랫폼이 이미 인셋했다. 더 비우면 이중 인셋.
  //    8px 은 반올림 오차 흡수용 하한. 판단이 안 서면 여기서 걸리지 않는다.
  const disp = window.screen?.height ?? 0;
  const view = window.innerHeight ?? 0;
  if (disp > 0 && view > 0 && disp - view >= 8) return 0;

  // 2) env() 가 유효하면 그게 정답이다. 셸 값보다 항상 우선한다.
  const env = measureEnvBottomPx();
  if (env > 0) return Math.round(env);

  // 3) 폴백 — 셸 값. 단위가 어긋난 빌드를 여기서 되돌린다.
  let raw = 0;
  try {
    raw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(floorVar)) || 0;
  } catch { /* ignore */ }
  if (!(raw > 0)) return 0;

  const dpr = window.devicePixelRatio || 1;
  return raw > MAX_PLAUSIBLE_BOTTOM_DP ? Math.round(raw / dpr) : Math.round(raw);
}

/**
 * 안드로이드 네이티브에서만 동작하는 동기화 루프를 건다.
 * 네이티브 셸이 인셋을 늦게(300/1200/3000ms) 게시하므로 그 뒤로도 몇 번 다시 읽는다.
 * @returns 정리 함수
 */
export function watchBottomSafe(
  floorVar: string,
  apply: (px: number) => void,
): () => void {
  const sync = () => apply(resolveBottomSafePx(floorVar));
  const timers = [0, 400, 1400, 3200].map((d) => window.setTimeout(sync, d));
  window.addEventListener('resize', sync);
  document.addEventListener('visibilitychange', sync);
  return () => {
    timers.forEach(clearTimeout);
    window.removeEventListener('resize', sync);
    document.removeEventListener('visibilitychange', sync);
  };
}
