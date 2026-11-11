'use client';
// ============================================================================
// 체험 상태 → 서버(D-2 푸시용) 보고 (2026-11-11). 네이티브 앱에서만, 푸시 토큰이 있을 때만.
//   보내는 것: 이미 등록된 푸시 토큰 · 만료 시각 · 자동 갱신 여부 · 기간 종류 · 스토어 · 플랫폼 · 언어. 계정·RC 고객 ID 없음.
//   체험(TRIAL)이 아니면 보내지 않는다 — 단 예전에 체험을 보고한 기기가 유료·평생으로 바뀌었거나 체험이 끝났으면
//   «해제»({clear:true})를 한 번 보내 서버 발송 대상에서 뺀다(틀린 «결제되지 않아요» 푸시 방지).
//   같은 내용은 하루 한 번(마지막 3일 + 갱신 꺼짐이면 3시간에 한 번 — 서버의 «최근 6시간 안에 앱을 열었으면 푸시 안 함» 판정용).
//   서버가 stored:true 로 답했을 때만 «보냈음»을 기록한다.
//   부르는 곳: 체험 종료 안내(앱 진입·복귀 때의 SDK 읽기) · PRO 공용 상태의 고객 정보 리스너(구매·복원 직후).
// ============================================================================
import type { CustomerInfo } from '@revenuecat/purchases-capacitor';
import { TRIAL_PUSH_REPORT_KEY, trialPushFingerprint, trialPushState } from '@/lib/app/trialSave';
import { localDayKey, TRIAL_OFF_WINDOW_MS } from '@/lib/app/trialRenewalOff';
import { resolveAppLocale } from '@/lib/appLocale';

const PUSH_TOKEN_KEY = 'signumhq.push.token';
const CLEARED = 'cleared';
let inflight = false;

async function post(body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch('/api/push/trial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) return false;
  const j = await res.json().catch(() => null) as { stored?: unknown } | null;
  return j?.stored === true;
}

export async function reportTrialPush(snapshot: { customerInfo: Pick<CustomerInfo, 'entitlements'>; platform: string } | null): Promise<'sent' | 'cleared' | 'skip'> {
  if (inflight) return 'skip';
  inflight = true;
  try {
    if (!snapshot || (snapshot.platform !== 'ios' && snapshot.platform !== 'android')) return 'skip';
    const token = window.localStorage.getItem(PUSH_TOKEN_KEY);
    if (!token) return 'skip';
    const now = Date.now();
    const last = window.localStorage.getItem(TRIAL_PUSH_REPORT_KEY);
    const state = trialPushState(snapshot.customerInfo, now);
    if (!state) {
      // 예전에 체험을 보고했던 기기만 해제를 보낸다(무료·유료 사용자는 아무것도 보내지 않는다)
      if (!last || last === CLEARED) return 'skip';
      if (!(await post({ token, clear: true }))) return 'skip';
      try { window.localStorage.setItem(TRIAL_PUSH_REPORT_KEY, CLEARED); } catch { /* 다음 실행에 다시 */ }
      return 'cleared';
    }
    const hot = !state.willRenew && state.expiresAt - now <= TRIAL_OFF_WINDOW_MS;
    const bucket = hot ? `${localDayKey(now)}T${Math.floor(new Date(now).getHours() / 3)}` : localDayKey(now);
    const fp = trialPushFingerprint(state, token, bucket);
    if (last === fp) return 'skip';
    if (!(await post({ token, platform: snapshot.platform, locale: resolveAppLocale(), ...state }))) return 'skip';
    try { window.localStorage.setItem(TRIAL_PUSH_REPORT_KEY, fp); } catch { /* 다음 실행에 다시 */ }
    return 'sent';
  } catch { return 'skip'; } finally { inflight = false; }
}
