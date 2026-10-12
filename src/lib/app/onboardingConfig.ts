// ============================================================================
// 첫 실행 «가치 먼저» 끄기 스위치 — 서버·클라이언트 공용 순수 규칙 (2026-10-12)
// ----------------------------------------------------------------------------
// ⚠ React·저장소·화면 모듈을 가져오지 않는다(타입 import 만) — 서버 라우트(app/api/app/onboarding-config)와 모든 앱 화면에 실리는 오버레이(AppFirstRunOnboarding)가
//   이 파일을 읽는다. 무거운 것(카드·시세·레벨·AI 줄)은 firstRunValue.ts · firstRunValueData.ts · FirstRunValueStep.tsx 에 있고 오버레이가 «필요할 때만» 불러온다.
//   (firstRunValue.ts 는 내 종목 저장소(React 훅)를 가져오므로 서버 라우트에서 import 하면 빌드가 «클라이언트 훅» 오류로 멈춘다 — 10/12 로컬 실측)
// ============================================================================

import type { FunnelSrc } from '@/lib/app/funnelSchema';

export type OnbMode = 'v2' | 'legacy';

/** 레디스 키 — 값이 있으면 옛 흐름(재배포 없이). 환경변수 ONB2_OFF=1 도 같다. */
export const ONB2_OFF_KEY = 'onb2:off';

/** 서버: 끄기 스위치 판정(환경변수 · 레디스 값). 값이 하나라도 «참 같으면» 끈다. */
export function onb2Enabled(input: { env?: string | undefined; redis: unknown }): boolean {
  if (input.env === '1') return false;
  const r = input.redis;
  if (r == null || r === '' || r === 0 || r === false || r === '0' || r === 'false') return true;
  return false;
}

/** 클라이언트: /api/app/onboarding-config 응답 → 모드(모르면 null — 호출자가 legacy 로 간다) */
export function parseOnbConfig(j: unknown): OnbMode | null {
  if (!j || typeof j !== 'object') return null;
  const v2 = (j as { v2?: unknown }).v2;
  return v2 === true ? 'v2' : v2 === false ? 'legacy' : null;
}

// ── 단계 ─────────────────────────────────────────────────────────────────
/** legal = 법적 고지(공통) · value = 종목 고르기(v2) · notif = 알림(v2, 네이티브만) · alert = 옛 2/2 알림 단계(legacy) */
export type OnbStep = 'legal' | 'value' | 'notif' | 'alert';

/**
 * 번호가 붙는 단계 수 — 법적 고지 «1 / 2»(기존 화면 글자 그대로 — 건드리지 않는다) 와 가치 «2 / 2».
 * 알림 단계는 번호 없이 «선택 · 알림»으로 그 뒤에 온다(네이티브만 · 건너뛰어도 되는 마지막 화면).
 */
export const ONB_NUMBERED_STEPS = 2;
export function onbStepNo(step: OnbStep): number {
  return step === 'legal' ? 1 : step === 'value' ? 2 : step === 'notif' ? 3 : 2;
}
/** 법적 고지를 마친 다음 — v2 는 가치, legacy 는 옛 알림 단계 */
export function stepAfterLegal(mode: OnbMode): OnbStep {
  return mode === 'v2' ? 'value' : 'alert';
}
/** 가치 단계를 마치거나 건너뛴 다음 — 푸시 권한이 있는 네이티브면 알림, 아니면 끝 */
export function stepAfterValue(native: boolean): OnbStep | 'done' {
  return native ? 'notif' : 'done';
}
/** 단계 → 계측 출처(onb_*) */
export function stepSrc(step: OnbStep, mode: OnbMode): FunnelSrc {
  if (step === 'legal') return 'onb_legal';
  if (step === 'value') return 'onb_value';
  if (step === 'notif') return 'onb_notif';
  return mode === 'legacy' ? 'onb_oldalert' : 'onb_notif';
}

// ── 푸시 권한 결과 → 계측 출처 ─────────────────────────────────────────────
export type PushResult = 'granted' | 'denied' | 'na';
export function permSrc(r: PushResult): FunnelSrc | null {
  return r === 'granted' ? 'onb_allow' : r === 'denied' ? 'onb_deny' : null;
}

/** 네이티브 앱 셸인가(동기) — Capacitor 가 웹뷰에 주입한 전역으로 본다(funnelBeacon.platformNow 와 같은 방법). 웹·시험에서는 false */
export function isNativeShell(): boolean {
  try {
    const cap = (globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch {
    return false;
  }
}
