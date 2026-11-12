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

/**
 * 계측 «단계 노출»을 실행(세션)당 한 번만 — sessionStorage 로 센다 (2026-11-12).
 *   앱 셸은 늘 /en/app-view/dash 로 켜지고 app-view/layout 이 기기 언어(/ko·/ja)로 router.replace 한다. 언어 구간이 바뀌면
 *   이 오버레이가 새로 마운트돼 컴포넌트 안 Set 가드가 비워지고, 한국어·일본어 기기는 첫 실행 한 번에 법적 고지 노출이 2번 찍혔다
 *   (11/12 에뮬레이터 실측: ko 1회 실행 = onb_show/onb_legal +2, en = +1). 그래서 안드 «노출 2 → 마침 0» 같은 숫자가 실제의 두 배로 보였다.
 *   sessionStorage 는 같은 웹뷰 안 이동에는 남고 앱을 새로 켜면 비므로 «실행당 한 번» 뜻이 그대로다. 저장소를 못 쓰면 true(예전처럼 마운트당 한 번).
 */
export const ONB_SHOWN_SESSION_KEY = 'signumhq.onb.shown.v1';
export function claimOnbShow(src: string, storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined): boolean {
  if (!storage) return true;
  try {
    const raw = storage.getItem(ONB_SHOWN_SESSION_KEY) || '';
    const seen = raw ? raw.split(',') : [];
    if (seen.includes(src)) return false;
    seen.push(src);
    storage.setItem(ONB_SHOWN_SESSION_KEY, seen.join(','));
  } catch {
    // 저장소 접근 실패 — 세지 못하는 것보다 마운트당 한 번이 낫다
  }
  return true;
}

// ── 네이티브 첫 실행: 기기 언어가 정해질 때까지 법적 고지를 잠시 늦춘다 (2026-11-12) ──────────────
/**
 * 앱 셸은 늘 /en/app-view/dash 로 켜지고 app-view/layout 이 기기 언어(resolveAppLocale)로 router.replace 한다.
 * 그 몇 초(데스크톱 2~4초 · 로컬 개발 서버 약 9초 · 에뮬레이터 75초까지) 동안 한국어·일본어 기기에 «영어» 법적 고지가 먼저 보였고, 그 사이 체크·[계속]은
 * /ko 재마운트 때 풀려 처음으로 돌아갔다(11/12 출시본 1.3.2 재현). 첫 요청에는 «우리 앱» 표식이 없어(쿠키는 첫 화면이 심는다 ·
 * 셸은 UA 를 바꾸지 않는다) 서버가 미리 /ko 로 보낼 수 없다 → 클라이언트에서 «URL 언어 ≠ 가야 할 언어» 인 동안은
 * 법적 고지 대신 중립 로딩(같은 배경 · 글자 없음)을 그린다. 법적 동의를 건너뛰면 안 되므로 시간 상한 뒤에는 반드시 띄운다
 * (그 뒤 늦게 언어가 바뀌어도 진행 상태는 아래 draft 로 살아남는다). 웹(브라우저)은 native=false 라 그대로다.
 */
export const ONB_LOCALE_WAIT_MS = 8000;
export function onbLocalePending(input: { native: boolean; urlLocale: string; desired: string }): boolean {
  return input.native && !!input.desired && input.urlLocale !== input.desired;
}

/**
 * 첫 실행 진행 상태(동의 체크 · 단계)를 «언어가 바뀌는 재마운트»에 살려 둔다 — sessionStorage(앱을 새로 켜면 빈다).
 * 저장한 언어와 지금 언어가 «다를 때만» 되살린다: 같은 언어에서의 새로고침·재마운트 동작은 예전 그대로(처음부터).
 * 첫 안내를 마치면(markDone) 지운다.
 */
export const ONB_DRAFT_SESSION_KEY = 'signumhq.onb.draft.v1';
export type OnbDraft = { accepted: boolean; step: OnbStep; loc: string };
type SessionLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const ONB_STEPS: readonly OnbStep[] = ['legal', 'value', 'notif', 'alert'];

export function writeOnbDraft(storage: SessionLike | null | undefined, draft: OnbDraft): void {
  if (!storage) return;
  try {
    // 아무것도 안 한 상태(법적 고지 · 체크 안 함)는 적지 않는다 — 되살릴 것이 없다
    if (draft.step === 'legal' && !draft.accepted) storage.removeItem(ONB_DRAFT_SESSION_KEY);
    else storage.setItem(ONB_DRAFT_SESSION_KEY, JSON.stringify(draft));
  } catch { /* 저장소 차단 — 예전처럼 재마운트 때 처음부터 */ }
}

/** 다른 언어에서 저장된 진행 상태가 있으면 돌려준다(같은 언어·형식 오류·저장소 없음이면 null) */
export function readOnbDraftForLocaleSwitch(storage: SessionLike | null | undefined, currentLoc: string): OnbDraft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(ONB_DRAFT_SESSION_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<OnbDraft>;
    if (!j || typeof j !== 'object') return null;
    if (typeof j.loc !== 'string' || j.loc === currentLoc) return null;
    if (typeof j.step !== 'string' || !ONB_STEPS.includes(j.step as OnbStep)) return null;
    const accepted = j.accepted === true;
    // 법적 고지를 넘긴 단계는 동의가 있었을 때만 되살린다(동의 없이 다음 단계로 가는 길을 만들지 않는다)
    if (j.step !== 'legal' && !accepted) return null;
    return { accepted, step: j.step as OnbStep, loc: j.loc };
  } catch {
    return null;
  }
}

export function clearOnbDraft(storage: SessionLike | null | undefined): void {
  try { storage?.removeItem(ONB_DRAFT_SESSION_KEY); } catch { /* 저장소 차단 */ }
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
