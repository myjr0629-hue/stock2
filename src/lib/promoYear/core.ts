// ============================================================================
// «1년 PRO 이용권(자동 갱신 없음)» — 애플 비갱신 구독 com.signumhq.app.pro.year.promo(ASC 6834590717 · 2026-11-14)
// ----------------------------------------------------------------------------
// 왜 따로 있나: RevenueCat 은 애플 비갱신 구독을 권한(pro)에 직접 연결하면 만료 없는 «평생» 권한으로 준다
//   (RC 직원 답변 · 조사 2026-11-13/nonrenew-1y). 그래서 이 상품은 pro 에 연결하지 «않고», 서버가
//   «구매 시각 + 365일»에 끝나는 RC 프로모셔널 권한(pro)을 붙인다.
//   POST https://api.revenuecat.com/v1/subscribers/{id}/entitlements/pro/promotional { end_time_ms } (서버 비밀키 필요)
// 부르는 곳: ① RC 웹훅(NON_RENEWING_PURCHASE · 이 상품) ② 앱이 코드 사용 직후 POST /api/app/promo-year(같은 판정).
//   둘 다 «기기가 한 말»은 믿지 않는다 — RC 고객 기록(non_subscriptions)에 이 상품 구매가 있을 때만 붙인다.
// 멱등: 이미 붙은 프로모셔널(store=promotional)이 같은 만료(±1일) 이상이면 다시 붙이지 않는다
//   (RC 도 같은 만료 2시간 안 요청은 중복으로 본다 — 이중 안전).
// 키(REVENUECAT_SECRET_API_KEY)가 없으면 'unavailable' — 아무것도 쓰지 않는다(닫힘).
// 시험: tests/promoYear.test.ts
// ============================================================================
import { PRO_ENTITLEMENT_ID } from '@/config/iap';

export const PROMO_YEAR_PRODUCT_ID = 'com.signumhq.app.pro.year.promo';
export const PROMO_YEAR_MS = 365 * 86_400_000;
const COVER_SLACK_MS = 86_400_000;           // 이미 붙은 만료가 목표보다 하루 이상 짧을 때만 다시 붙인다
const FUTURE_SKEW_MS = 10 * 60_000;           // 구매 시각이 서버 시계보다 10분 넘게 미래면 이상값으로 본다
export const RC_UID_RE = /^\$RCAnonymousID:[0-9a-f]{32}$|^[A-Za-z0-9._:-]{8,100}$/;

export type PromoPlan =
  | { kind: 'grant'; purchaseMs: number; endMs: number }
  | { kind: 'none'; why: 'no_purchase' | 'expired' | 'covered' };

const ms = (v: unknown): number => (typeof v === 'string' ? Date.parse(v) : NaN);

/** RC v1 GET /subscribers/{id} 응답 → 붙일지·만료 시각. 순수 함수. */
export function planPromoYear(json: unknown, now: number): PromoPlan {
  const sub = (json as { subscriber?: Record<string, unknown> } | null)?.subscriber;
  if (!sub || typeof sub !== 'object') return { kind: 'none', why: 'no_purchase' };
  const list = (sub.non_subscriptions as Record<string, unknown> | undefined)?.[PROMO_YEAR_PRODUCT_ID];
  let purchaseMs = NaN;
  if (Array.isArray(list)) {
    for (const p of list) {
      if (!p || typeof p !== 'object') continue;
      const rec = p as { store?: unknown; purchase_date?: unknown };
      if (rec.store !== 'app_store') continue;
      const t = ms(rec.purchase_date);
      if (!Number.isFinite(t) || t > now + FUTURE_SKEW_MS) continue;
      if (!Number.isFinite(purchaseMs) || t > purchaseMs) purchaseMs = t;   // 가장 최근 구매
    }
  }
  if (!Number.isFinite(purchaseMs)) return { kind: 'none', why: 'no_purchase' };
  const endMs = purchaseMs + PROMO_YEAR_MS;
  if (endMs <= now) return { kind: 'none', why: 'expired' };
  // 이미 붙인 프로모셔널(같은 권한) — subscriptions 의 store=promotional 항목 중 만료가 목표에 닿는 것
  const subs = sub.subscriptions as Record<string, unknown> | undefined;
  if (subs && typeof subs === 'object') {
    for (const [pid, v] of Object.entries(subs)) {
      if (!v || typeof v !== 'object') continue;
      const s = v as { store?: unknown; expires_date?: unknown };
      if (s.store !== 'promotional' || !pid.startsWith(`rc_promo_${PRO_ENTITLEMENT_ID}_`)) continue;
      const exp = ms(s.expires_date);
      if (s.expires_date === null || (Number.isFinite(exp) && exp >= endMs - COVER_SLACK_MS)) return { kind: 'none', why: 'covered' };
    }
  }
  return { kind: 'grant', purchaseMs, endMs };
}

export type EnsureResult =
  | { kind: 'granted'; endMs: number }
  | { kind: 'none'; why: 'no_purchase' | 'expired' | 'covered' | 'uid' }
  | { kind: 'unavailable'; why: 'no_key' | 'read' | 'grant' };

export interface EnsureDeps { secret?: string; fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number }

async function rc(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetchImpl(url, { ...init, cache: 'no-store', signal: ctrl.signal }); }
  catch { return null; } finally { clearTimeout(timer); }
}

/** RC 기록을 읽고(진실 원천) 필요하면 «구매 + 365일» 프로모셔널 pro 를 붙인다. 던지지 않는다. */
export async function ensurePromoYear(uid: string, deps: EnsureDeps): Promise<EnsureResult> {
  if (typeof uid !== 'string' || !RC_UID_RE.test(uid)) return { kind: 'none', why: 'uid' };
  const key = deps.secret;
  if (!key) return { kind: 'unavailable', why: 'no_key' };
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 5000;
  const base = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`;
  const headers = { Authorization: `Bearer ${key}`, Accept: 'application/json', 'Content-Type': 'application/json' };
  const res = await rc(fetchImpl, base, { method: 'GET', headers }, timeoutMs);
  if (!res || !res.ok) return { kind: 'unavailable', why: 'read' };
  let json: unknown;
  try { json = await res.json(); } catch { return { kind: 'unavailable', why: 'read' }; }
  const plan = planPromoYear(json, (deps.now ?? Date.now)());
  if (plan.kind === 'none') return plan;
  const g = await rc(fetchImpl, `${base}/entitlements/${encodeURIComponent(PRO_ENTITLEMENT_ID)}/promotional`,
    { method: 'POST', headers, body: JSON.stringify({ end_time_ms: plan.endMs }) }, timeoutMs);
  if (!g || !g.ok) return { kind: 'unavailable', why: 'grant' };
  return { kind: 'granted', endMs: plan.endMs };
}

/** RC 웹훅 본문이 «이 상품의 실제 구매»인가(프로모셔널 부여가 만든 이벤트는 제외 — 되먹임 방지) */
export function promoYearUidFromWebhook(body: unknown): string | null {
  const e = (body as { event?: Record<string, unknown> } | null)?.event;
  if (!e || typeof e !== 'object') return null;
  if (e.type !== 'NON_RENEWING_PURCHASE' || e.product_id !== PROMO_YEAR_PRODUCT_ID) return null;
  if (e.store !== 'APP_STORE' || e.period_type === 'PROMOTIONAL') return null;
  const uid = e.app_user_id;
  return typeof uid === 'string' && RC_UID_RE.test(uid) ? uid : null;
}
