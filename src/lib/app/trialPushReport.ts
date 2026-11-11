'use client';
// ============================================================================
// 체험 상태 → 서버(D-2 푸시용) 보고 (2026-11-11). 네이티브 앱에서만, 푸시 토큰이 있을 때만.
//   보내는 것: 이미 등록된 푸시 토큰 · 만료 시각 · 자동 갱신 여부 · 기간 종류 · 스토어 · 플랫폼 · 언어. 계정·RC 고객 ID 없음.
//   체험(TRIAL)이 아니면 보내지 않는다. 같은 내용은 하루 한 번만(TRIAL_PUSH_REPORT_KEY).
//   읽기는 «체험 종료 안내»가 이미 한 SDK 조회 결과(snapshot)를 받아 쓴다 — SDK 를 따로 부르지 않는다.
// ============================================================================
import type { CustomerInfo } from '@revenuecat/purchases-capacitor';
import { TRIAL_PUSH_REPORT_KEY, trialPushFingerprint, trialPushState } from '@/lib/app/trialSave';
import { localDayKey } from '@/lib/app/trialRenewalOff';
import { resolveAppLocale } from '@/lib/appLocale';

const PUSH_TOKEN_KEY = 'signumhq.push.token';

export async function reportTrialPush(snapshot: { customerInfo: Pick<CustomerInfo, 'entitlements'>; platform: string } | null): Promise<'sent' | 'skip'> {
  try {
    if (!snapshot || (snapshot.platform !== 'ios' && snapshot.platform !== 'android')) return 'skip';
    const now = Date.now();
    const state = trialPushState(snapshot.customerInfo, now);
    if (!state) return 'skip';
    const token = window.localStorage.getItem(PUSH_TOKEN_KEY);
    if (!token) return 'skip';
    const fp = trialPushFingerprint(state, token, localDayKey(now));
    if (window.localStorage.getItem(TRIAL_PUSH_REPORT_KEY) === fp) return 'skip';
    const res = await fetch('/api/push/trial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: snapshot.platform, locale: resolveAppLocale(), ...state }),
    });
    if (!res.ok) return 'skip';
    try { window.localStorage.setItem(TRIAL_PUSH_REPORT_KEY, fp); } catch { /* 다음 실행에 다시 */ }
    return 'sent';
  } catch { return 'skip'; }
}
