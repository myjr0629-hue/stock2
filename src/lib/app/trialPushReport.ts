'use client';
// ============================================================================
// 체험 상태 → 서버(D-2 푸시용) 보고 (2026-11-11). 네이티브 앱에서만, 푸시 토큰이 있을 때만.
//   보내는 것: 이미 등록된 푸시 토큰 · 만료 시각 · 자동 갱신 여부 · 기간 종류 · 스토어 · 플랫폼 · 언어. 계정·RC 고객 ID 없음.
//   체험(TRIAL)이 아니면 보내지 않는다 — 단 예전에 체험을 보고한 기기가 유료·평생으로 바뀌었거나 체험이 끝났으면
//   «해제»({clear:true})를 한 번 보내 서버 발송 대상에서 뺀다(틀린 «결제되지 않아요» 푸시 방지).
//   같은 내용은 하루 한 번(마지막 3일 + 갱신 꺼짐이면 3시간에 한 번 — 서버의 «최근 6시간 안에 앱을 열었으면 푸시 안 함» 판정용).
//   서버가 stored:true 로 답했을 때만 «보냈음»을 기록한다.
//   ★ 체험 중이면 매번, 아니면 보낼 일이 있을 때만 SDK 캐시를 비우고 «새로 읽은 값»으로 판단해 보낸다 — 캐시 값(옛 «갱신 꺼짐»)을 보내지 않게.
//   ★ 보내는 중에 새 상태가 오면 버리지 않고 끝난 뒤 이어서 보낸다. 호출 제한(429)이면 6초 뒤 한 번 더.
//   부르는 곳: 체험 종료 안내(앱 진입·복귀) · PRO 공용 상태의 고객 정보 리스너(구매·복원·SDK 갱신).
// ============================================================================
import type { CustomerInfo } from '@revenuecat/purchases-capacitor';
import { TRIAL_PUSH_REPORT_KEY, trialPushFingerprint, trialPushState } from '@/lib/app/trialSave';
import { localDayKey, TRIAL_OFF_WINDOW_MS } from '@/lib/app/trialRenewalOff';
import { resolveAppLocale } from '@/lib/appLocale';
import { PRO_ENTITLEMENT_ID } from '@/config/iap';

type Info = Pick<CustomerInfo, 'entitlements'>;
type Snapshot = { customerInfo: Info; platform: string };
export type FreshRead = () => Promise<Info | null>;

const PUSH_TOKEN_KEY = 'signumhq.push.token';
const CLEARED = 'cleared';
let inflight = false;
let queued: { snapshot: Snapshot; readFresh?: FreshRead } | null = null;

/** SDK 캐시를 비우고 새로 읽는다(5초 상한). 실패하면 null — 보내지 않는다 */
async function defaultReadFresh(): Promise<Info | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const { initRevenueCat } = await import('@/services/revenueCat');
        if (!(await initRevenueCat())) return null;
        const { Purchases } = await import('@revenuecat/purchases-capacitor');
        await Purchases.invalidateCustomerInfoCache();
        const { customerInfo } = await Purchases.getCustomerInfo();
        return customerInfo;
      })(),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 5000); }),
    ]);
  } catch { return null; } finally { clearTimeout(timer); }
}

async function post(body: Record<string, unknown>): Promise<'stored' | 'retry' | 'no'> {
  const res = await fetch('/api/push/trial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status === 429) return 'retry';
  if (!res.ok) return 'no';
  const j = await res.json().catch(() => null) as { stored?: unknown } | null;
  return j?.stored === true ? 'stored' : 'no';
}
async function postWithRetry(body: Record<string, unknown>, wait: (ms: number) => Promise<void>): Promise<boolean> {
  let r = await post(body);
  if (r === 'retry') { await wait(6000); r = await post(body); }
  return r === 'stored';
}
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 체험이 아닌 «활성 PRO»(유료·평생)인가 */
function paidPro(info: Info): boolean {
  const pro = info?.entitlements?.active?.[PRO_ENTITLEMENT_ID];
  return !!pro?.isActive && pro.periodType !== 'TRIAL';
}

/** 지금 상태로 무엇을 보낼지(없으면 null) — 순수.
 *  해제: 예전에 체험을 보고했거나(기록 있음) «유료·평생 PRO»면(설정에서 캐시를 지워 기록이 사라졌어도 — 관문 11110920 ②) 한 번. */
function plan(info: Info, token: string, last: string | null, now: number): { kind: 'clear' } | { kind: 'state'; fp: string; state: NonNullable<ReturnType<typeof trialPushState>> } | null {
  const state = trialPushState(info, now);
  if (!state) return last !== CLEARED && (!!last || paidPro(info)) ? { kind: 'clear' } : null;
  const hot = !state.willRenew && state.expiresAt - now <= TRIAL_OFF_WINDOW_MS;
  const bucket = hot ? `${localDayKey(now)}T${Math.floor(new Date(now).getHours() / 3)}` : localDayKey(now);
  const fp = trialPushFingerprint(state, token, bucket);
  return last === fp ? null : { kind: 'state', fp, state };
}

export async function reportTrialPush(snapshot: Snapshot | null, readFresh: FreshRead = defaultReadFresh, wait: (ms: number) => Promise<void> = sleep): Promise<'sent' | 'cleared' | 'skip' | 'queued'> {
  if (!snapshot || (snapshot.platform !== 'ios' && snapshot.platform !== 'android')) return 'skip';
  if (inflight) { queued = { snapshot, readFresh }; return 'queued'; }
  inflight = true;
  try {
    const token = window.localStorage.getItem(PUSH_TOKEN_KEY);
    if (!token) return 'skip';
    const last = window.localStorage.getItem(TRIAL_PUSH_REPORT_KEY);
    // 체험 중이면 매 진입 새로 읽는다(캐시가 «지난번과 같음»이어도 그사이 스토어에서 갱신을 켰을 수 있다 — 관문 11110920 ①).
    //   체험이 아니면 캐시로 «보낼 일(해제)이 있나»만 보고, 있을 때만 새로 읽는다. 무료 사용자는 아무 일도 하지 않는다.
    const cachedTrial = !!trialPushState(snapshot.customerInfo, Date.now());
    if (!cachedTrial && !plan(snapshot.customerInfo, token, last, Date.now())) return 'skip';
    const fresh = await readFresh();
    if (!fresh) return 'skip';
    const now = Date.now();
    const next = plan(fresh, token, last, now);
    if (!next) return 'skip';
    if (next.kind === 'clear') {
      if (!(await postWithRetry({ token, clear: true }, wait))) return 'skip';
      try { window.localStorage.setItem(TRIAL_PUSH_REPORT_KEY, CLEARED); } catch { /* 다음 실행에 다시 */ }
      return 'cleared';
    }
    if (!(await postWithRetry({ token, platform: snapshot.platform, locale: resolveAppLocale(), ...next.state }, wait))) return 'skip';
    try { window.localStorage.setItem(TRIAL_PUSH_REPORT_KEY, next.fp); } catch { /* 다음 실행에 다시 */ }
    return 'sent';
  } catch { return 'skip'; } finally {
    inflight = false;
    const q = queued; queued = null;
    if (q) void reportTrialPush(q.snapshot, q.readFresh, wait);
  }
}
