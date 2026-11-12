// ============================================================================
// 체험 보고 서버 확인(2026-11-12 야간 검토 ②) — /api/push/trial 이 «발송 대상에 넣기» 전에 RevenueCat 에서 직접 확인한다.
// ----------------------------------------------------------------------------
// 왜: 보고 API 는 기기가 말한 «갱신 꺼진 체험»을 그대로 믿었다 → 임의 토큰을 /api/push/register 에 등록한 뒤
//   가짜 체험을 보고하면 D-2 발송 대상에 들어가, 하루 발송 시도 상한(300)을 태우거나 앞쪽 쪽(page)을 메워 실제 대상을 가릴 수 있었다.
// 방법: 대가 렌즈 서버 판정(lib/guruLens/proAccess)과 같은 길 — 앱 번들에 이미 있는 공개 키(NEXT_PUBLIC_RC_*)로
//   GET /v1/subscribers/{앱 사용자 ID}. 대상 목록에는 «RC 가 체험 중 · 해지 감지(갱신 꺼짐)»라고 답한 기기만,
//   만료 시각도 RC 값으로 넣는다. RC 고객 하나는 토큰 하나에만 묶는다(진짜 체험 하나로 여러 토큰을 채우지 못하게).
//   공급사 호출 전 예산: IP(10분 30) · 고객 ID(10분 6) · 전체(10분 300). ⚠ v1 GET 은 없는 ID 를 «만든다» — 형식·예산 통과분만 간다.
// 저장: 고객 ID 원문은 저장하지 않는다(해시만 — 묶음 키).
// ============================================================================
import crypto from 'node:crypto';
import { PRO_ENTITLEMENT_ID } from '@/config/iap';

export const RC_UID_RE = /^\$RCAnonymousID:[0-9a-f]{32}$|^[A-Za-z0-9._:-]{8,100}$/;
export const TRIAL_VERIFY_WINDOW_S = 600;
export const TRIAL_VERIFY_LIMIT_IP = 30;
export const TRIAL_VERIFY_LIMIT_UID = 6;
export const TRIAL_VERIFY_LIMIT_ALL = 300;
export const TRIAL_VERIFY_TIMEOUT_MS = 4000;

export const trialUidHash = (uid: string) => crypto.createHash('sha256').update('trialuid:' + uid).digest('hex').slice(0, 32);
const ipHash = (ip: string) => crypto.createHash('sha256').update('trialip:' + ip).digest('hex').slice(0, 32);
/** RC 고객(해시) → 지금 묶인 푸시 토큰 */
export const TRIAL_PUSH_UID_KEY = (uidHash: string) => `push:trial:uid:${uidHash}`;

export type VerifiedTrial = { expiresAt: number; willRenew: boolean; periodType: 'TRIAL'; store: 'APP_STORE' | 'PLAY_STORE' };
export type TrialVerdict =
  | { kind: 'trial'; trial: VerifiedTrial }
  | { kind: 'not_trial' }
  | { kind: 'limited' }
  | { kind: 'unavailable' };

const ms = (v: unknown) => (typeof v === 'string' && v ? Date.parse(v) : NaN);

/**
 * v1 subscriber 응답 → 활성 'pro' 체험이면 만료·갱신 여부. 체험이 아니거나(유료·평생·만료·가족 공유) 값이 이상하면 null.
 * 갱신 꺼짐 = 해지 감지(unsubscribe_detected_at) 또는 결제 문제(billing_issues_detected_at) — SDK willRenew 와 같은 뜻.
 */
export function trialFromSubscriber(json: unknown, now: number): VerifiedTrial | null {
  const sub = (json as { subscriber?: Record<string, any> } | null)?.subscriber;
  const ent = sub?.entitlements?.[PRO_ENTITLEMENT_ID];
  if (!ent || typeof ent !== 'object' || typeof ent.product_identifier !== 'string') return null;
  const entExp = ms(ent.expires_date);
  if (!Number.isFinite(entExp) || entExp <= now) return null;
  const subs = (sub?.subscriptions && typeof sub.subscriptions === 'object') ? sub.subscriptions as Record<string, any> : {};
  // 안드(기본 요금제)는 구독 키가 «상품:기본요금제»일 수 있다 — 같은 키 또는 상품 접두가 같은 키만 후보(관계없는 구독은 보지 않는다).
  //   후보가 여럿이면(지난 기본 요금제 기록 등) 아직 끝나지 않은 것 중 만료 시각이 권한 만료와 가장 가까운 것(관문 11121015 ③)
  const pid = ent.product_identifier as string;
  const base = (k: string) => k.split(':')[0];
  const s = Object.entries(subs)
    .filter(([k, v]) => v && typeof v === 'object' && (k === pid || base(k) === base(pid)) && ms(v.expires_date) > now)
    .sort(([ka, a], [kb, b]) => (Number(kb === pid) - Number(ka === pid)) || (Math.abs(ms(a.expires_date) - entExp) - Math.abs(ms(b.expires_date) - entExp)))[0]?.[1];
  if (!s || typeof s !== 'object' || s.period_type !== 'trial') return null;
  if (s.ownership_type === 'FAMILY_SHARED') return null;
  const expiresAt = ms(s.expires_date);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  const store = s.store === 'app_store' ? 'APP_STORE' : s.store === 'play_store' ? 'PLAY_STORE' : null;
  if (!store) return null;
  const willRenew = !s.unsubscribe_detected_at && !s.billing_issues_detected_at;
  return { expiresAt, willRenew, periodType: 'TRIAL', store };
}

export interface TrialVerifyStore {
  /** 각 키 +1 후 값(창 키에 TTL) */
  incr(keys: string[], ttlSec: number): Promise<number[]>;
}
export interface TrialVerifyDeps {
  store: TrialVerifyStore;
  keys: { ios?: string; android?: string };
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

/** 예산 → RC 확인. 예산을 셀 수 없으면(Redis 장애) 공급사를 부르지 않고 'unavailable'(대상에 넣지 않음 — 다음 진입에 다시) */
export async function verifyTrialWithRc(uid: string, platform: 'ios' | 'android', ip: string | null, deps: TrialVerifyDeps): Promise<TrialVerdict> {
  if (!RC_UID_RE.test(uid)) return { kind: 'not_trial' };
  const now = (deps.now ?? Date.now)();
  const w = Math.floor(now / 1000 / TRIAL_VERIFY_WINDOW_S);
  const h = trialUidHash(uid);
  let first: number[], all: number[];
  try {
    first = await deps.store.incr([`push:trial:vrl:ip:${ipHash(ip || 'unknown')}:${w}`, `push:trial:vrl:id:${h}:${w}`], TRIAL_VERIFY_WINDOW_S * 2);
    if (!(first.length === 2 && first.every(Number.isFinite))) return { kind: 'unavailable' };
    if (first[0] > TRIAL_VERIFY_LIMIT_IP || first[1] > TRIAL_VERIFY_LIMIT_UID) return { kind: 'limited' };
    all = await deps.store.incr([`push:trial:vrl:all:${w}`], TRIAL_VERIFY_WINDOW_S * 2);
    if (!(all.length === 1 && Number.isFinite(all[0]))) return { kind: 'unavailable' };
    if (all[0] > TRIAL_VERIFY_LIMIT_ALL) return { kind: 'limited' };
  } catch { return { kind: 'unavailable' }; }
  const key = platform === 'ios' ? deps.keys.ios : deps.keys.android;
  if (!key) return { kind: 'unavailable' };
  const fetchImpl = deps.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<TrialVerdict>((resolve) => { timer = setTimeout(() => { ctrl.abort(); resolve({ kind: 'unavailable' }); }, deps.timeoutMs ?? TRIAL_VERIFY_TIMEOUT_MS); });
  const read = (async (): Promise<TrialVerdict> => {
    try {
      const res = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
        method: 'GET', cache: 'no-store', signal: ctrl.signal,
        headers: { Authorization: `Bearer ${key}`, 'X-Platform': platform, Accept: 'application/json' },
      });
      if (res.status === 400 || res.status === 404) return { kind: 'not_trial' };
      if (res.status === 429) return { kind: 'limited' };
      if (!res.ok) return { kind: 'unavailable' };
      const json = await res.json();
      if (!json || typeof json !== 'object' || !('subscriber' in json)) return { kind: 'unavailable' };
      const trial = trialFromSubscriber(json, (deps.now ?? Date.now)());
      return trial ? { kind: 'trial', trial } : { kind: 'not_trial' };
    } catch { return { kind: 'unavailable' }; }
  })();
  try { return await Promise.race([read, deadline]); } finally { clearTimeout(timer); }
}
