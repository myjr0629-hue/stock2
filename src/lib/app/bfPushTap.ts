// ============================================================================
// 블프 «앱 밖» 안내 푸시(/api/cron/bf-push · lib/push/bfPush) 탭 처리 — 앱(app-view/layout)이 부른다 (2026-11-26)
//   ① 탭 계측 push_open/push_bf(하루 합계만 · 식별자 없음)
//   ② 대시보드로 연다(냉시작이면 시작 화면 전환을 버티게 pendingDeepLink 도 남긴다 — 다른 푸시와 같다)
//   ③ 경로가 대시보드에 «자리 잡은 뒤»(0.8초 그대로) 그 플랫폼의 블프 시트를 연다 — 시트는 화면을 옮기면 닫히므로 이동이 끝난 뒤에만.
//      iOS = BF_OPEN_EVENT(블프 줄과 같은 시트: 기기 실제 가격·조건·고지 → 애플 오퍼 코드 창) · 안드 = BF_PUSH_OPEN_EVENT(판정 뒤 Play 할인 시트).
//   블프가 끝났으면 대시보드만 연다.
// ============================================================================
import { BF_OPEN_EVENT, bfLive } from '@/lib/app/blackFriday';

export const BF_PUSH_OPEN_EVENT = 'signum:bf-push-open';
export const BF_PUSH_SETTLE_MS = 800;
export const BF_PUSH_MAX_WAIT_MS = 10_000;

/** 경로가 대시보드인가(언어 접두어 포함) */
export function onDash(pathname: string): boolean {
  return /^\/(ko|en|ja)\/app-view\/dash\/?$/.test(pathname);
}

export function bfPushEventFor(platform: string | null | undefined): string | null {
  return platform === 'ios' ? BF_OPEN_EVENT : platform === 'android' ? BF_PUSH_OPEN_EVENT : null;
}

export function handleBfPushTap(opts: { loc: string; platform: string | null | undefined; navigate: (path: string) => void }): void {
  import('@/lib/app/funnelBeacon').then((m) => m.trackFunnel('push_open', { src: 'push_bf' })).catch(() => {});
  const target = `/${opts.loc}/app-view/dash`;
  try { sessionStorage.setItem('signumhq.pendingDeepLink', target); } catch { /* storage off */ }
  if (!onDash(window.location.pathname)) opts.navigate(target);
  const ev = bfPushEventFor(opts.platform);
  if (!ev || !bfLive(Date.now())) return;
  const started = Date.now();
  let since = 0;
  const tick = () => {
    if (Date.now() - started > BF_PUSH_MAX_WAIT_MS) return;
    if (onDash(window.location.pathname) && document.visibilityState === 'visible') {
      if (!since) since = Date.now();
      if (Date.now() - since >= BF_PUSH_SETTLE_MS) { window.dispatchEvent(new Event(ev)); return; }
    } else since = 0;
    window.setTimeout(tick, 200);
  };
  window.setTimeout(tick, 200);
}
