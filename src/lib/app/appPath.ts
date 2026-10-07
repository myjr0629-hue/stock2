/**
 * «앱 화면 안인가» — 경로(/app-view/…)로 판정한다. (2026-10-07, 앱 강화 0단계 T6)
 *
 * 앱 셸(Capacitor)은 운영 서버의 /{locale}/app-view/* 를 그린다. 웹용 등급 게이트(FeatureGate/ProGate/EliteGate — 비로그인 guest 등급)가
 * 앱 화면 안에 섞여 있는데(예: Guardian 의 «Gamma Shield AI» 카드), 앱의 잠금 모델은 «광고 1시간 해제 / 앱 PRO(스토어 결제)» 뿐이고
 * 웹 요금제(/pricing — 웹 결제)로 보내는 것은 애플 3.1.1(앱 안 디지털 구매는 인앱결제) 위험이다.
 * 지금까지 앱 화면이 열려 있던 것은 «우연»이었다(게스트 미리보기 쿠키 shq_gv ≤ 5 → 열림, 이 쿠키는 웹 GuestWall 만 올리고 앱 레이아웃엔 GuestWall 이 없어
 * 항상 0). 앱 안에서는 웹 등급 게이트가 «항상 통과»하도록 의도적으로 고정한다.
 *
 * next-intl 의 usePathname 은 로케일 접두사를 뗀 경로(/app-view/dash)를 주지만, 접두사가 붙은 경로(/ko/app-view/dash)여도 같게 판정한다.
 */
export function isAppViewPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return /(^|\/)app-view(\/|$|\?|#)/.test(pathname);
}
