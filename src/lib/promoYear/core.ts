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
import { createHash } from 'node:crypto';
import { PRO_ENTITLEMENT_ID } from '@/config/iap';

export const PROMO_YEAR_PRODUCT_ID = 'com.signumhq.app.pro.year.promo';
export const PROMO_YEAR_MS = 365 * 86_400_000;
const COVER_SLACK_MS = 2 * 3600_000;         // 이미 붙은 만료가 목표와 2시간 넘게 다르면 다시 맞춘다(RC 도 2시간 안은 중복으로 본다)
const FUTURE_SKEW_MS = 10 * 60_000;           // 구매 시각이 서버 시계보다 10분 넘게 미래면 이상값으로 본다
export const RC_UID_RE = /^\$RCAnonymousID:[0-9a-f]{32}$|^[A-Za-z0-9._:-]{8,100}$/;

/** 구매 한 건 — tx = 애플 거래 ID(RC store_transaction_id · 웹훅 transaction_id). 없으면 'ms:<구매 시각>' */
export type Purchase = { tx: string; ms: number };
export type PromoPlan =
  | { kind: 'grant'; purchase: Purchase; endMs: number }
  | { kind: 'none'; why: 'no_purchase' | 'expired' | 'covered' };

const ms = (v: unknown): number => (typeof v === 'string' ? Date.parse(v) : NaN);
const txOf = (v: unknown, at: number) => (typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : `ms:${at}`);

/**
 * RC v1 GET /subscribers/{id} 응답 + 우리 환불 기록 → 붙일지·만료 시각. 순수 함수.
 *   유효 구매 = RC 기록(app_store · 환불 표시 없음) ∪ hint(인증된 웹훅의 구매 — 기록 반영 지연)
 *               − 환불된 구매(RC 환불 표시 · 우리 환불 기록). 같은 구매 판정은 거래 ID 또는 'ms:<구매 시각>' 중 하나라도 같으면.
 *   그중 가장 최근 구매 + 365일.
 */
export function planPromoYear(json: unknown, now: number, opts: { hint?: Purchase; refunded?: string[] } = {}): PromoPlan {
  const sub = ((json as { subscriber?: Record<string, unknown> } | null)?.subscriber ?? {}) as Record<string, unknown>;
  const list = (sub.non_subscriptions as Record<string, unknown> | undefined)?.[PROMO_YEAR_PRODUCT_ID];
  const refunded = new Set((opts.refunded ?? []).filter((x) => typeof x === 'string'));
  const keys = (p: Purchase) => [p.tx, `ms:${p.ms}`];
  const cands: Purchase[] = [];
  if (Array.isArray(list)) {
    for (const p of list) {
      if (!p || typeof p !== 'object') continue;
      const rec = p as { store?: unknown; purchase_date?: unknown; refunded_at?: unknown; store_transaction_id?: unknown };
      const t = ms(rec.purchase_date);
      if (!Number.isFinite(t)) continue;
      const pur = { tx: txOf(rec.store_transaction_id, t), ms: t };
      if (rec.refunded_at != null) { for (const k of keys(pur)) refunded.add(k); continue; }   // 환불된 구매는 근거가 아니다
      if (rec.store !== 'app_store') continue;
      cands.push(pur);
    }
  }
  if (opts.hint) cands.push(opts.hint);
  let best: Purchase | null = null;
  for (const c of cands) {
    if (!c || typeof c.ms !== 'number' || !Number.isFinite(c.ms) || c.ms <= 0 || c.ms > now + FUTURE_SKEW_MS) continue;
    if (keys(c).some((k) => refunded.has(k))) continue;
    if (!best || c.ms > best.ms) best = c;
  }
  if (!best) return { kind: 'none', why: 'no_purchase' };
  const endMs = best.ms + PROMO_YEAR_MS;
  if (endMs <= now) return { kind: 'none', why: 'expired' };
  if (currentPromoExpiry(sub) >= endMs - COVER_SLACK_MS) return { kind: 'none', why: 'covered' };
  return { kind: 'grant', purchase: best, endMs };
}

/** 지금 붙은 pro 프로모셔널의 가장 늦은 만료(없으면 NaN · 평생이면 Infinity) */
function currentPromoExpiry(sub: Record<string, unknown>): number {
  let current = NaN;
  for (const [pid, v] of Object.entries((sub.subscriptions ?? {}) as Record<string, unknown>)) {
    const x = (v ?? {}) as { store?: unknown; expires_date?: unknown };
    if (x.store !== 'promotional' || !pid.startsWith(`rc_promo_${PRO_ENTITLEMENT_ID}_`)) continue;
    const e = x.expires_date === null ? Infinity : ms(x.expires_date);
    if (!Number.isNaN(e) && (Number.isNaN(current) || e > current)) current = e;
  }
  return current;
}

export type EnsureResult =
  | { kind: 'granted'; endMs: number }
  | { kind: 'none'; why: 'no_purchase' | 'expired' | 'covered' | 'uid' }
  | { kind: 'unavailable'; why: 'no_key' | 'read' | 'grant' };

/** 고객별 환불 기록(환불 웹훅이 남기고, 부여 판정이 읽는다) — 읽기 실패는 던진다(부여는 닫힘 → 503 재시도). */
export interface PromoLedger {
  refunded(uid: string): Promise<string[]>;
  addRefund(uid: string, keys: string[]): Promise<void>;
}
export interface EnsureDeps { secret?: string; fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number; ledger?: PromoLedger }

const LEDGER_TTL_S = 400 * 86400;
const lkey = (uid: string) => `promo-year:v1:refund:${createHash('sha256').update('promo-year:' + uid).digest('hex').slice(0, 32)}`;
type EvalStore = { eval: (script: string, keys: string[], args: (string | number)[]) => Promise<unknown> };
/** Upstash(eval 만 있는 저장소)로 만든 환불 기록 */
export function evalPromoLedger(store: EvalStore): PromoLedger {
  return {
    async refunded(uid) {
      const r = await store.eval("return redis.call('SMEMBERS', KEYS[1])", [lkey(uid)], []);
      if (!Array.isArray(r)) throw new Error('ledger');
      return r.map(String);
    },
    async addRefund(uid, keys) {
      if (!keys.length) return;
      await store.eval("for i = 2, #ARGV do redis.call('SADD', KEYS[1], ARGV[i]) end redis.call('EXPIRE', KEYS[1], ARGV[1]) return 1", [lkey(uid)], [LEDGER_TTL_S, ...keys]);
    },
  };
}

async function rc(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetchImpl(url, { ...init, cache: 'no-store', signal: ctrl.signal }); }
  catch { return null; } finally { clearTimeout(timer); }
}

type Ctx = { fetchImpl: typeof fetch; timeoutMs: number; base: string; headers: Record<string, string>; now: number };
function ctx(uid: string, deps: EnsureDeps): Ctx {
  return {
    fetchImpl: deps.fetchImpl ?? fetch, timeoutMs: deps.timeoutMs ?? 5000, now: (deps.now ?? Date.now)(),
    base: `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
    headers: { Authorization: `Bearer ${deps.secret}`, Accept: 'application/json', 'Content-Type': 'application/json' },
  };
}
async function readSubscriber(c: Ctx): Promise<unknown | null> {
  const res = await rc(c.fetchImpl, c.base, { method: 'GET', headers: c.headers }, c.timeoutMs);
  if (!res || !res.ok) return null;
  try { return await res.json(); } catch { return null; }
}
const grantUrl = (c: Ctx) => `${c.base}/entitlements/${encodeURIComponent(PRO_ENTITLEMENT_ID)}/promotional`;

/** RC 기록을 읽고(진실 원천) 필요하면 «구매 + 365일» 프로모셔널 pro 를 붙인다. 던지지 않는다. 두 요청이 겹쳐도 같은 만료로 붙어 무해(RC 2시간 중복 억제). */
export async function ensurePromoYear(uid: string, deps: EnsureDeps, hint?: Purchase): Promise<EnsureResult> {
  if (typeof uid !== 'string' || !RC_UID_RE.test(uid)) return { kind: 'none', why: 'uid' };
  if (!deps.secret) return { kind: 'unavailable', why: 'no_key' };
  const c = ctx(uid, deps);
  const json = await readSubscriber(c);
  if (json == null) return { kind: 'unavailable', why: 'read' };
  let refunded: string[] = [];
  try { if (deps.ledger) refunded = await deps.ledger.refunded(uid); } catch { return { kind: 'unavailable', why: 'read' }; }
  const plan = planPromoYear(json, c.now, { hint, refunded });
  if (plan.kind === 'none') return plan;
  const g = await rc(c.fetchImpl, grantUrl(c), { method: 'POST', headers: c.headers, body: JSON.stringify({ end_time_ms: plan.endMs }) }, c.timeoutMs);
  if (!g || !g.ok) return { kind: 'unavailable', why: 'grant' };
  return { kind: 'granted', endMs: plan.endMs };
}

/**
 * 환불(RC 웹훅 CANCELLATION · 이 상품) → 그 구매를 환불 기록에 남긴다(이후 어떤 경로로도 그 구매로 다시 붙이지 않는다).
 *   이미 붙은 권한을 «자동 회수하지 않는다» — 결정(2026-11-14): 이 상품은 무료(0원) 오퍼 코드로만 배포되고 앱 페이월에 없어
 *   환불될 금액이 없다. RC v1 회수(revoke_promotionals)는 고객의 프로모셔널 전부를 지워 정당한 권한까지 날릴 수 있다.
 *   유료 환불이 실제로 생기면(사실상 불가) RC 대시보드에서 고객별로 처리한다.
 */
export async function recordPromoYearRefund(uid: string, keys: string[], deps: EnsureDeps): Promise<'recorded' | 'none' | 'unavailable'> {
  if (typeof uid !== 'string' || !RC_UID_RE.test(uid) || !keys.length || !deps.ledger) return 'none';
  try { await deps.ledger.addRefund(uid, keys); return 'recorded'; } catch { return 'unavailable'; }
}

function eventPurchase(e: Record<string, unknown>): Purchase | undefined {
  const at = e.purchased_at_ms;
  if (typeof at !== 'number' || !Number.isSafeInteger(at) || at <= 0) return undefined;
  return { tx: txOf(e.transaction_id, at), ms: at };
}

/** RC 웹훅이 «이 상품 구매의 환불»인가(비갱신 구매 환불은 CANCELLATION 으로 온다) — 그 구매를 가리키는 키(거래 ID · 'ms:<구매 시각>') */
export function promoYearRefundFromWebhook(body: unknown): { uid: string; keys: string[] } | null {
  const e = (body as { event?: Record<string, unknown> } | null)?.event;
  if (!e || typeof e !== 'object') return null;
  if (e.type !== 'CANCELLATION' || e.product_id !== PROMO_YEAR_PRODUCT_ID || e.store !== 'APP_STORE') return null;
  const uid = e.app_user_id;
  if (typeof uid !== 'string' || !RC_UID_RE.test(uid)) return null;
  const keys: string[] = [];
  if (typeof e.transaction_id === 'string' && e.transaction_id.length > 0 && e.transaction_id.length <= 200) keys.push(e.transaction_id);
  const at = e.purchased_at_ms;
  if (typeof at === 'number' && Number.isSafeInteger(at) && at > 0) keys.push(`ms:${at}`);
  return { uid, keys };
}

/** RC 웹훅 본문이 «이 상품의 실제 구매»인가(프로모셔널 부여가 만든 이벤트는 제외 — 되먹임 방지) */
export function promoYearFromWebhook(body: unknown): { uid: string; purchase?: Purchase } | null {
  const e = (body as { event?: Record<string, unknown> } | null)?.event;
  if (!e || typeof e !== 'object') return null;
  if (e.type !== 'NON_RENEWING_PURCHASE' || e.product_id !== PROMO_YEAR_PRODUCT_ID) return null;
  if (e.store !== 'APP_STORE' || e.period_type === 'PROMOTIONAL') return null;
  const uid = e.app_user_id;
  if (typeof uid !== 'string' || !RC_UID_RE.test(uid)) return null;
  const p = eventPurchase(e);
  return p ? { uid, purchase: p } : { uid };
}
