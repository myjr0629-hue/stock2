/**
 * 앱 하단 탭 라벨 (2026-10-22 대표 지시: «한국 이용자만 한글로, 디자인은 그대로»).
 *
 * - en·ja 는 6/29 이후 그대로 영어 고정(바이트 동일). ko 만 한글.
 * - 한글 이름은 앱 안에서 그 화면을 이미 부르는 이름을 따랐다:
 *   가디언(가디언 화면 제목) · 플로우(«실시간 옵션 플로우» 제목) · 대시보드(ko 사전 «대시보드에서 제거» 등) ·
 *   커맨드(Command 화면은 제목이 영어 고정이라 음역) · 섹터 인텔(ko 사전 «섹터 인텔», 화면 제목 «섹터 인텔리전스»).
 *   «인텔» 단독은 같은 앱에서 INTC 종목 이름(«인텔»)과 겹쳐 쓰지 않는다.
 */
export type BottomNavTabId = 'dash' | 'guardian' | 'cmd' | 'flow' | 'intel';

export const BOTTOM_NAV_EN_LABELS: Record<BottomNavTabId, string> = {
  dash: 'Dashboard',
  guardian: 'Guardian',
  cmd: 'Command',
  flow: 'Flow',
  intel: 'Intel',
};

export const BOTTOM_NAV_KO_LABELS: Record<BottomNavTabId, string> = {
  dash: '대시보드',
  guardian: '가디언',
  cmd: '커맨드',
  flow: '플로우',
  intel: '섹터 인텔',
};

export function bottomNavLabel(id: BottomNavTabId, locale: string | null | undefined): string {
  return locale === 'ko' ? BOTTOM_NAV_KO_LABELS[id] : BOTTOM_NAV_EN_LABELS[id];
}
