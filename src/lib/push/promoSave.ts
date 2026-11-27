// ============================================================================
// 혜택·할인 알림 동의 저장 (2026-11-27 동의 한 번 묻기) — 설정 화면 토글(app-view/settings updatePrefs)과 «같은 길»
//   ① localStorage signumhq.push.prefs 에 promo 를 얹는다(설정 화면 loadPrefs 기본값 그대로 — 다른 칸은 바꾸지 않는다)
//   ② 푸시 토큰이 있으면 PUT /api/push/preferences {token, enabled, morning, closing, signals, promo} — 서버가 mergePrefs·promoChangedAt 로 promoAt 기록
//   ③ PUT 이 실패해도 다음 실행의 /api/push/register 가 readStoredPushPrefs() 로 같은 값을 싣는다(mergeRegistration 이 promoAt 기록)
//   → 블프 크론(lib/push/bfPush)·comeback(lib/push/comebackPush)이 promoAllowed 로 자동 포함.
// ============================================================================
import { PUSH_PREFS_STORAGE_KEY } from '@/lib/push/prefs';
import { nextStoredPrefs, PUSH_TOKEN_KEY } from '@/lib/app/promoAsk';

export type PromoSaveDeps = {
  store: { getItem(k: string): string | null; setItem(k: string, v: string): void } | null;
  fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status?: number }>;
};

/** 'server' = 서버 기록까지 확인 · 'local' = 기기에만(다음 실행 등록이 싣는다) · 'fail' = 기기 저장도 실패 */
export async function savePromoConsent(on: boolean, deps?: Partial<PromoSaveDeps>): Promise<'server' | 'local' | 'fail'> {
  const store = deps?.store !== undefined ? deps.store : (() => { try { return window.localStorage; } catch { return null; } })();
  const doFetch = deps?.fetch ?? ((u: string, i: RequestInit) => fetch(u, i));
  if (!store) return 'fail';
  let next;
  try {
    next = nextStoredPrefs(store.getItem(PUSH_PREFS_STORAGE_KEY), on);
    store.setItem(PUSH_PREFS_STORAGE_KEY, JSON.stringify(next));
  } catch { return 'fail'; }
  let token: string | null = null;
  try { token = store.getItem(PUSH_TOKEN_KEY); } catch { token = null; }
  if (!token) return 'local';
  try {
    const r = await doFetch('/api/push/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, enabled: next.enabled, morning: next.morning, closing: next.closing, signals: next.signals, promo: next.promo }),
    });
    return r.ok ? 'server' : 'local';
  } catch { return 'local'; }
}
