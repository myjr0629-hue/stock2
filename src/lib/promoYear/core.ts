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
import { createHash, randomBytes } from 'node:crypto';
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
 * RC v1 GET /subscribers/{id} 응답 + 우리 기록 → 붙일지·만료 시각. 순수 함수.
 *   유효 구매 = RC 기록(app_store · 환불 표시 없음) ∪ hint(인증된 웹훅의 구매 — 기록 반영 지연) ∪ known(우리가 부여한 구매 기록)
 *               − refunded(환불 웹훅이 가리킨 거래 ID) − RC 기록에 환불 표시가 있는 거래. 그중 가장 최근 구매 + 365일.
 *   ignoreCovered = 이미 붙은 프로모셔널을 보지 않는다(환불 정리용).
 */
export function planPromoYear(json: unknown, now: number, opts: { hint?: Purchase; refunded?: string[]; known?: Purchase[]; ignoreCovered?: boolean } = {}): PromoPlan {
  const sub = ((json as { subscriber?: Record<string, unknown> } | null)?.subscriber ?? {}) as Record<string, unknown>;
  const list = (sub.non_subscriptions as Record<string, unknown> | undefined)?.[PROMO_YEAR_PRODUCT_ID];
  const refunded = new Set((opts.refunded ?? []).filter((x) => typeof x === 'string'));
  const cands: Purchase[] = [];
  if (Array.isArray(list)) {
    for (const p of list) {
      if (!p || typeof p !== 'object') continue;
      const rec = p as { store?: unknown; purchase_date?: unknown; refunded_at?: unknown; store_transaction_id?: unknown };
      const t = ms(rec.purchase_date);
      if (!Number.isFinite(t)) continue;
      const tx = txOf(rec.store_transaction_id, t);
      if (rec.refunded_at != null) { refunded.add(tx); continue; }       // 환불된 구매는 근거가 아니다
      if (rec.store !== 'app_store') continue;
      cands.push({ tx, ms: t });
    }
  }
  if (opts.hint) cands.push(opts.hint);
  for (const k of opts.known ?? []) cands.push(k);
  let best: Purchase | null = null;
  for (const c of cands) {
    if (!c || typeof c.ms !== 'number' || !Number.isFinite(c.ms) || c.ms <= 0 || c.ms > now + FUTURE_SKEW_MS || refunded.has(c.tx)) continue;
    if (!best || c.ms > best.ms) best = c;
  }
  if (!best) return { kind: 'none', why: 'no_purchase' };
  const endMs = best.ms + PROMO_YEAR_MS;
  if (endMs <= now) return { kind: 'none', why: 'expired' };
  if (!opts.ignoreCovered && currentPromoExpiry(sub) >= endMs - COVER_SLACK_MS) return { kind: 'none', why: 'covered' };
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
  | { kind: 'unavailable'; why: 'no_key' | 'read' | 'grant' | 'busy' };

/**
 * 고객별 기록 — 환불된 거래 ID(환불 웹훅이 남김) · 우리가 부여한 구매(부여 성공 때 남김) · 직렬화 잠금.
 *   읽기 실패는 던진다(부여·회수는 닫힘 → 503 재시도).
 */
export interface PromoLedger {
  refunded(uid: string): Promise<string[]>;
  addRefund(uid: string, tx: string): Promise<void>;
  granted(uid: string): Promise<Purchase[]>;
  addGranted(uid: string, p: Purchase): Promise<void>;
  /** 못 잡으면 null(호출자는 503 → 재시도). 없으면 잠그지 않는다(시험용). */
  lock?(uid: string): Promise<(() => Promise<void>) | null>;
}
export interface EnsureDeps { secret?: string; fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number; ledger?: PromoLedger }

const LEDGER_TTL_S = 400 * 86400;
const LOCK_MS = 30_000;   // RC 호출 최대 4번 × 5초 + 여유
const lkey = (kind: string, uid: string) => `promo-year:v1:${kind}:${createHash('sha256').update('promo-year:' + uid).digest('hex').slice(0, 32)}`;
type EvalStore = { eval: (script: string, keys: string[], args: (string | number)[]) => Promise<unknown> };
/** Upstash(eval 만 있는 저장소)로 만든 기록 */
export function evalPromoLedger(store: EvalStore): PromoLedger {
  const members = async (key: string) => {
    const r = await store.eval("return redis.call('SMEMBERS', KEYS[1])", [key], []);
    if (!Array.isArray(r)) throw new Error('ledger');
    return r.map(String);
  };
  const add = (key: string, v: string) => store.eval("redis.call('SADD', KEYS[1], ARGV[1]); redis.call('EXPIRE', KEYS[1], ARGV[2]); return 1", [key], [v, LEDGER_TTL_S]).then(() => undefined);
  return {
    refunded: (uid) => members(lkey('refund', uid)),
    addRefund: (uid, tx) => add(lkey('refund', uid), tx),
    async granted(uid) {
      return (await members(lkey('granted', uid))).map((v) => { const i = v.lastIndexOf('|'); return { tx: v.slice(0, i), ms: Number(v.slice(i + 1)) }; })
        .filter((p) => p.tx && Number.isFinite(p.ms));
    },
    addGranted: (uid, p) => add(lkey('granted', uid), `${p.tx}|${p.ms}`),
    async lock(uid) {
      const key = lkey('lock', uid);
      const token = randomBytes(12).toString('hex');
      const ok = await store.eval("if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2]) then return 1 end return 0", [key], [token, LOCK_MS]);
      if (Number(ok) !== 1) return null;
      return async () => { try { await store.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0", [key], [token]); } catch { /* 만료로 풀린다 */ } };
    },
  };
}

async function rc(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetchImpl(url, { ...init, cache: 'no-store', signal: ctrl.signal }); }
  catch { return null; } finally { clearTimeout(timer); }
}

async function withLock<T>(uid: string, deps: EnsureDeps, busy: T, fn: () => Promise<T>): Promise<T> {
  if (!deps.ledger?.lock) return fn();
  let release: (() => Promise<void>) | null;
  try { release = await deps.ledger.lock(uid); } catch { return busy; }
  if (!release) return busy;
  try { return await fn(); } finally { await release(); }
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
const revokeUrl = (c: Ctx) => `${c.base}/entitlements/${encodeURIComponent(PRO_ENTITLEMENT_ID)}/revoke_promotionals`;

/** RC 기록을 읽고(진실 원천) 필요하면 «구매 + 365일» 프로모셔널 pro 를 붙인다 — 고객별 잠금 안에서(환불 정리와 직렬). 던지지 않는다. */
export async function ensurePromoYear(uid: string, deps: EnsureDeps, hint?: Purchase): Promise<EnsureResult> {
  if (typeof uid !== 'string' || !RC_UID_RE.test(uid)) return { kind: 'none', why: 'uid' };
  if (!deps.secret) return { kind: 'unavailable', why: 'no_key' };
  return withLock<EnsureResult>(uid, deps, { kind: 'unavailable', why: 'busy' }, async () => {
    const c = ctx(uid, deps);
    const json = await readSubscriber(c);
    if (json == null) return { kind: 'unavailable', why: 'read' };
    let refunded: string[] = [];
    try { if (deps.ledger) refunded = await deps.ledger.refunded(uid); } catch { return { kind: 'unavailable', why: 'read' }; }
    const plan = planPromoYear(json, c.now, { hint, refunded });
    if (plan.kind === 'none') return plan;
    const g = await rc(c.fetchImpl, grantUrl(c), { method: 'POST', headers: c.headers, body: JSON.stringify({ end_time_ms: plan.endMs }) }, c.timeoutMs);
    if (!g || !g.ok) return { kind: 'unavailable', why: 'grant' };
    // 부여한 구매를 남긴다 — 이후 다른 구매의 환불 정리가 (RC 기록에 아직 안 보이는) 이 구매를 유효로 셀 수 있게
    try { if (deps.ledger) await deps.ledger.addGranted(uid, plan.purchase); } catch { return { kind: 'unavailable', why: 'grant' }; }
    return { kind: 'granted', endMs: plan.endMs };
  });
}

export type RevokeResult = { kind: 'revoked' } | { kind: 'kept'; endMs: number } | { kind: 'shortened'; endMs: number } | { kind: 'none'; why: 'uid' | 'nothing' } | { kind: 'unavailable'; why: 'no_key' | 'read' | 'revoke' | 'ledger' | 'busy' };

/**
 * 환불(RC 웹훅 CANCELLATION · 이 상품) → 남은 유효 구매 기준으로 프로모셔널 pro 를 맞춘다.
 *   남은 유효 구매 없음 → 회수(POST .../revoke_promotionals) · 지금 권한이 남은 구매 기준보다 길면 회수 뒤 다시 · 없거나 짧으면 다시 붙임 · 같으면 유지.
 *   회수는 이 고객의 pro 프로모셔널 «전부»에 걸린다(RC v1 은 건별 회수가 없다) — 우리 코드가 붙이는 프로모셔널은 이 이용권뿐이다.
 *   무료 코드 구매(0원)는 환불될 것이 없어 실제로는 드물다.
 */
export async function revokePromoYearIfRefunded(uid: string, refundedTx: string | undefined, deps: EnsureDeps): Promise<RevokeResult> {
  if (typeof uid !== 'string' || !RC_UID_RE.test(uid)) return { kind: 'none', why: 'uid' };
  // 환불 기록은 잠금 «밖»에서 먼저(잠금·키가 없어 503 이 나도 기록은 남는다 · SADD 라 반복 무해)
  if (deps.ledger && refundedTx) {
    try { await deps.ledger.addRefund(uid, refundedTx); } catch { return { kind: 'unavailable', why: 'ledger' }; }
  }
  if (!deps.secret) return { kind: 'unavailable', why: 'no_key' };
  return withLock<RevokeResult>(uid, deps, { kind: 'unavailable', why: 'busy' }, async () => {
    const c = ctx(uid, deps);
    const json = await readSubscriber(c);
    if (json == null) return { kind: 'unavailable', why: 'read' };
    let refunded: string[] = refundedTx ? [refundedTx] : [];
    let known: Purchase[] = [];
    try { if (deps.ledger) { refunded = refunded.concat(await deps.ledger.refunded(uid)); known = await deps.ledger.granted(uid); } }
    catch { return { kind: 'unavailable', why: 'ledger' }; }
    const sub = ((json as { subscriber?: Record<string, unknown> } | null)?.subscriber ?? {}) as Record<string, unknown>;
    const current = currentPromoExpiry(sub);
    const plan = planPromoYear(json, c.now, { refunded, known, ignoreCovered: true });
    if (plan.kind === 'grant') {
      if (Math.abs(current - plan.endMs) <= COVER_SLACK_MS) return { kind: 'kept', endMs: plan.endMs };
      if (current > plan.endMs) {
        const r = await rc(c.fetchImpl, revokeUrl(c), { method: 'POST', headers: c.headers }, c.timeoutMs);
        if (!r || !r.ok) return { kind: 'unavailable', why: 'revoke' };
      }
      const g = await rc(c.fetchImpl, grantUrl(c), { method: 'POST', headers: c.headers, body: JSON.stringify({ end_time_ms: plan.endMs }) }, c.timeoutMs);
      if (!g || !g.ok) return { kind: 'unavailable', why: 'revoke' };
      return { kind: 'shortened', endMs: plan.endMs };
    }
    if (Number.isNaN(current)) return { kind: 'none', why: 'nothing' };
    const r = await rc(c.fetchImpl, revokeUrl(c), { method: 'POST', headers: c.headers }, c.timeoutMs);
    if (!r || !r.ok) return { kind: 'unavailable', why: 'revoke' };
    return { kind: 'revoked' };
  });
}

function eventPurchase(e: Record<string, unknown>): Purchase | undefined {
  const at = e.purchased_at_ms;
  if (typeof at !== 'number' || !Number.isSafeInteger(at) || at <= 0) return undefined;
  return { tx: txOf(e.transaction_id, at), ms: at };
}

/** RC 웹훅이 «이 상품 구매의 환불»인가(비갱신 구매 환불은 CANCELLATION 으로 온다) — 환불 거래 ID 를 돌려준다 */
export function promoYearRefundFromWebhook(body: unknown): { uid: string; tx?: string } | null {
  const e = (body as { event?: Record<string, unknown> } | null)?.event;
  if (!e || typeof e !== 'object') return null;
  if (e.type !== 'CANCELLATION' || e.product_id !== PROMO_YEAR_PRODUCT_ID || e.store !== 'APP_STORE') return null;
  const uid = e.app_user_id;
  if (typeof uid !== 'string' || !RC_UID_RE.test(uid)) return null;
  const p = eventPurchase(e);
  return p ? { uid, tx: p.tx } : { uid };
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
