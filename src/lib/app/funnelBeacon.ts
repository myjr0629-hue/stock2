// ============================================================================
// 퍼널 비콘 «핵심» — 부작용 없는 모듈 (2026-10-12 funnel.ts 에서 떼어 냄)
// ----------------------------------------------------------------------------
// funnel.ts 는 읽히는 순간 «내 종목» 시트 전송기(setWatchlistAnalyticsTransport)를 꽂는다. 푸시 탭·하루 활성 비콘
// (app-view/layout.tsx)이 그 부작용 없이 같은 전송 규칙(닫힌 목록 · 안드로이드 앱 제외 · 앱 버전)을 쓰게 여기로 옮겼다.
// funnel.ts 가 전부 다시 내보낸다 — 기존 호출부·시험은 그대로.
// ============================================================================

import { normalizeCode, normalizeVersion, isFunnelSrc, type FunnelSrc, type FunnelStage, type FunnelPlatform } from '@/lib/app/funnelSchema';

/**
 * 안드로이드 «앱»도 보낸다 (2026-10-14 켬).
 *   9/30 에는 Play 데이터 보안에 «앱 활동 › 앱 상호작용»이 선언돼 있지 않아 껐다(구글 정의상 익명·집계여도 «수집»은 신고 대상이고
 *   웹뷰 전송도 포함). 10/14 대표 권한(«신고 갱신이던 무엇이던 전권»)으로 Play Console › 앱 콘텐츠 › 데이터 보안에
 *   «앱 상호작용 — 수집 — 분석 — 공유 안 함»(+ 기타 사용자 생성 콘텐츠·구매 기록·기기 ID 목적)을 더해 «심사 제출»한 뒤 켠다.
 *   (안드로이드 «웹 브라우저»는 web 이라 해당 없음) 되돌리려면 false — 게이트 코드(trackFunnel)는 그대로다.
 */
export const FUNNEL_SEND_ANDROID = true;

let lastSrc: FunnelSrc = 'other';
/** 페이월·판매 시트를 연 화면을 적어 둔다 — 결과(구매·복원)가 출처 없이 들어올 때 이것을 쓴다. */
export function noteFunnelSrc(src: FunnelSrc) { lastSrc = src; }
export function currentFunnelSrc(): FunnelSrc { return lastSrc; }

function platformNow(): FunnelPlatform {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
    if (cap?.isNativePlatform?.()) {
      const p = cap.getPlatform?.();
      return p === 'ios' ? 'ios' : p === 'android' ? 'android' : 'web';
    }
  } catch { /* 웹 */ }
  return 'web';
}

let versionP: Promise<string> | null = null;
/** 바이너리 버전(@capacitor/app). 네이티브가 아니거나 1.5초 안에 못 재면 'na' — 지어내지 않는다. */
function appVersion(): Promise<string> {
  if (versionP) return versionP;
  versionP = (async () => {
    if (platformNow() === 'web') return 'na';
    try {
      const { App } = await import('@capacitor/app');
      const info = await Promise.race([
        App.getInfo(),
        new Promise<null>((r) => setTimeout(() => r(null), 1500)),
      ]);
      return normalizeVersion(info && (info as { version?: string }).version);
    } catch { return 'na'; }
  })();
  return versionP;
}

/** 퍼널 이벤트 하나. 화면·결제 흐름을 절대 막지 않는다(비동기·예외 삼킴). */
export function trackFunnel(stage: FunnelStage, opts: { src?: FunnelSrc; code?: string } = {}) {
  if (typeof window === 'undefined') return;
  try {
    const plat = platformNow();
    if (plat === 'android' && !FUNNEL_SEND_ANDROID) return;
    const src = isFunnelSrc(opts.src) ? opts.src : lastSrc; // 핸들러로 잘못 넘어온 클릭 이벤트 등은 버린다
    const code = opts.code ? normalizeCode(opts.code) : '';
    void appVersion().then((v) => {
      const q = `/api/funnel-hit?st=${stage}&s=${src}&p=${plat}&v=${encodeURIComponent(v)}${code ? `&c=${code}` : ''}`;
      try { if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(q)) return; } catch { /* 폴백 */ }
      void fetch(q, { method: 'POST', keepalive: true }).catch(() => {});
    }).catch(() => {});
  } catch { /* 측정이 기능을 깨뜨리지 않는다 */ }
}
