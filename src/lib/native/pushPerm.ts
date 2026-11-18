// ============================================================================
// 푸시 알림 OS 권한 «읽기만» (2026-11-18 체험자 알림 다시 묻기) — 묻지 않는다(requestPermissions 는 부르지 않는다)
//   네이티브가 아니거나 플러그인이 없거나 던지면 'unknown' — 허용/거절로 추정하지 않는다.
// ============================================================================
import { normPerm, type PermState } from '@/lib/app/trialPushOptIn';

export async function checkPushPerm(): Promise<PermState> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return 'unknown';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // @ts-ignore — @capacitor/push-notifications is installed at native build time
    const PushMod: any = await import('@capacitor/push-notifications');
    return normPerm(await PushMod.PushNotifications.checkPermissions());
  } catch {
    return 'unknown';
  }
}
