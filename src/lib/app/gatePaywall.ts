// ============================================================================
// 게이트 «가치 순간» 페이월 (2026-11-16 매출 스프린트) — 순수 판정 + 하루 1회 기록
// ----------------------------------------------------------------------------
// 왜: 28일(ET 10/19~11/15) 퍼널 실측 — 페이월 열림 44회 중 게이트(가치 벽·대시보드 게이트·광고 창) 출처는 7회,
//   iOS 결제 단추 6회·결제 성공 0. 첫 실행 iOS 101명이 잠긴 분석을 만나도 결제 화면은 거의 보지 않았다.
//   게이트의 주 단추가 «광고 보고 1시간 잠금해제»이고, 네이티브에서 보상형 광고가 없거나(무광고 공급·준비 전)
//   끝까지 안 보면 «광고 없는 30초 대기 창»이 그대로 1시간을 열어 줬다 — 광고 수입도 결제 노출도 0 인 누수.
// 무엇(결제 흐름·가격·문구·배치는 그대로 — 언제 페이월을 보이느냐만):
//   ① 하루 첫 게이트 탭(네이티브 · 결제 가능 · PRO 상태 확인됨 · PRO 아님)이면 광고 전에 페이월을 한 번 보인다(출처 gate_first).
//      닫으면 원래 누른 대로 광고가 이어진다(사용자 의도 유지).
//   ② 네이티브에서 보상형 광고가 안 나왔을 때 대체 30초 창 «전에» 페이월(출처 ad_nofill). 닫으면 예전 대체 창 그대로.
//      ①에서 이미 페이월을 본 같은 탭이면 ②는 건너뛴다(연달아 두 번 보이지 않는다).
//   무료 경로(광고·대체 창)는 언제나 남는다.
// ============================================================================

export const GATE_PAYWALL_DAY_KEY = 'signum_gate_paywall_day';

/** 기기 현지 날짜 YYYY-MM-DD — «하루 1회»의 경계(사용자 체감 하루) */
export function localDay(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export type GateState = {
  /** 네이티브 앱이고 결제 가능(useProStatus().iapAvailable) */
  iapAvailable: boolean;
  /** PRO 상태를 한 번이라도 받았다(useProStatus().ready) — 모르면 보이지 않는다(코드 PRO 사용자에게 페이월 금지) */
  ready: boolean;
  isPro: boolean;
};

/** ① 하루 첫 게이트 탭에 페이월을 먼저 보일까 */
export function shouldShowFirstGatePaywall(s: GateState, lastDay: string | null, today: string): boolean {
  if (!s.iapAvailable || !s.ready || s.isPro) return false;
  return lastDay !== today;
}

/** ② 보상형 광고가 안 나왔을 때 대체 창 전에 페이월을 보일까 — 같은 탭에서 ①을 이미 봤으면 아니다 */
export function shouldShowNoFillPaywall(s: GateState, alreadyShownThisTap: boolean): boolean {
  if (!s.iapAvailable || !s.ready || s.isPro) return false;
  return !alreadyShownThisTap;
}

export function readGateDay(): string | null {
  try { return localStorage.getItem(GATE_PAYWALL_DAY_KEY); } catch { return null; }
}

/** 기록 실패(사파리 개인 모드 등)면 false — 그 경우 ①은 건너뛴다(매 탭 페이월 반복 방지) */
export function markGateDay(today: string): boolean {
  try { localStorage.setItem(GATE_PAYWALL_DAY_KEY, today); return localStorage.getItem(GATE_PAYWALL_DAY_KEY) === today; } catch { return false; }
}
