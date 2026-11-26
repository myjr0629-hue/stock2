// ============================================================================
// 체험 만료 다음 날(D+1) «다시 시작» 할인 코드 푸시 — 순수 규칙 + 웹훅 적재 (2026-11-21)
// ----------------------------------------------------------------------------
// 왜: 무료 체험을 끝내고 결제하지 않은 사람에게 애플 «만료 고객 전용» 오퍼 코드(lib/app/comebackOffer — 첫 2개월 할인가 → 정가 자동 갱신)를
//   한 번 안내한다. 대표 11/21 «지금 가장 필요한 건 매출 — 총동원» · 11/16 «업계 표준 수익화 승인». D+7 같은 두 번째 안내는 하지 않는다.
// 흐름:
//   ① RevenueCat 웹훅 EXPIRATION(period TRIAL · APP_STORE · PRODUCTION · 해지로 인한 만료)이 오면 — /api/webhooks/revenuecat
//      그 RC 고객이 체험 중 보고로 묶어 둔 푸시 토큰(push:trial:uid:<해시> — /api/push/trial)이 있을 때만 대상 목록(push:comeback:due, 점수 = 만료 시각)에 넣는다.
//      RC 고객 ID 원문은 저장하지 않는다 — 발송 직전 RC 재확인용으로 «암호화한 값»만(AES-256-GCM, 서버 비밀값에서 유도 · 5일 TTL).
//   ② 매시 크론(/api/cron/trial-push 같은 회차, 체험 알림 뒤)이 만료 +24~72시간 창의 대상을 읽어 규칙(아래 comebackDecision)으로 거른 뒤,
//      보내기 직전에 RC 를 다시 읽어 «활성 권한 없음 · 유료 결제 이력 없음 · 마지막 체험 해지(자동 갱신 꺼짐) 뒤 만료»일 때만 보낸다.
//   ③ 같은 고객이 다시 결제하면(웹훅 INITIAL_PURCHASE·RENEWAL·UNCANCELLATION·NON_RENEWING_PURCHASE·PRODUCT_CHANGE) 대상에서 뺀다.
// 대상: iOS 만(안드로이드는 이번 범위 밖) · 시스템 알림 권한 «허용» 보고 기기(4.5.4) · 알림 전체 끔 제외 · 현지 09~21시 · 6시간 안 앱 실행이면 미룸
//   · ★11/27 혜택·할인 알림 «명시 동의»(preferences.promo === true — lib/push/promoConsent, 블프 푸시와 같은 규칙)한 기기만(애플 4.5.4 · 정보통신망법 50조).
//     동의 없음(no_consent)은 대상에서 지우지 않는다 — 72시간 창 안에 동의하면 다음 회차에 보낸다.
//   · ★11/27 한국 수신자(기기 언어 ko 또는 시간대 Asia/Seoul)는 제목 앞 «(광고)» · 본문 끝 수신거부 방법 · 현지 08:00~20:59 안에서만(야간은 다음 허용 시각으로 미룸).
//   · 가격을 아는 스토어프런트(KR·US·JP — 웹훅 country_code = 실제 구매 나라 · RC 거래 통화로 한 번 더)만 · 코드 유효 기간 안에서만.
// 한 번만: RC 고객(해시)·토큰 둘 다 «보냄» 표식(400일). 실패(응답 유실 포함)도 표식을 놓지 않는다(중복보다 누락).
// 끄기: 환경 변수 COMEBACK_PUSH=off · Redis comeback-push:off(크론 ?comebackOff=1 / 0) · 한 회차만 ?comeback=0.
// ============================================================================
import crypto from 'node:crypto';
import { fallbackTimeZone, localHourIn, TRIAL_PUSH_HOURS, TRIAL_PUSH_RECENT_OPEN_MS } from '@/lib/push/trialPush';
import { toTrialSaveLocale } from '@/lib/app/trialSaveDate';
import { PRO_ENTITLEMENT_ID } from '@/config/iap';
import { TRIAL_PUSH_OWNER_KEY, TRIAL_PUSH_UID_KEY, trialUidHash } from '@/lib/push/trialVerify';
import { boundToken } from '@/lib/push/trialPushLua';
import { promoAllowed, promoKoreaRecipient, toPromoLoc } from '@/lib/push/promoConsent';
import {
  COMEBACK_MONTHS, COMEBACK_PRICES, COMEBACK_PUSH_TYPE, COMEBACK_VALID_FROM, comebackLive, type ComebackStorefront,
} from '@/lib/app/comebackOffer';

const H = 3600_000;

/** 대상 목록 — 멤버 = RC 고객 해시(trialUidHash) · 점수 = 체험 만료 시각 */
export const COMEBACK_ZSET = 'push:comeback:due';
/** 대상 항목(JSON {x: 만료, u: 암호화한 RC ID, at: 적재 시각}) */
export const COMEBACK_ENTRY_KEY = (uh: string) => `push:comeback:e:${uh}`;
export const COMEBACK_ENTRY_TTL_S = 5 * 86400;
/** «보냄» 표식 — 고객당 · 토큰당 한 번(400일: 코드 유효 기간보다 길게) */
export const COMEBACK_SENT_UID_KEY = (uh: string) => `push:comeback:sentuid:${uh}`;
export const COMEBACK_SENT_TOKEN_KEY = (token: string) => `push:comeback:sent:${token}`;
export const COMEBACK_SENT_TTL_S = 400 * 86400;
export const COMEBACK_DAY_KEY = (etDay: string) => `push:comeback:day:${etDay}`;
export const COMEBACK_OFF_KEY = 'comeback-push:off';
/** 만료 뒤 창 — 24시간 뒤부터(D+1) · 72시간이 지나면 버린다(현지 시간·최근 실행으로 미뤄질 여유) */
export const COMEBACK_MIN_AFTER_MS = 24 * H;
export const COMEBACK_MAX_AFTER_MS = 72 * H;
export const COMEBACK_MAX_PER_RUN = 50;
export const COMEBACK_MAX_PER_DAY = 150;

/** 환경 변수 끄기(재배포로 끈다) — 값이 off·0·false 면 꺼짐 */
export function comebackEnvOff(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.COMEBACK_PUSH || '').trim().toLowerCase();
  return v === 'off' || v === '0' || v === 'false';
}

// ── RC 고객 ID 암호화(원문 저장 안 함) ───────────────────────────────────
const keyFrom = (secret: string) => crypto.createHash('sha256').update('comeback-uid-v1\0' + secret).digest();
export function sealUid(uid: string, secret: string): string | null {
  if (!secret || !uid) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const ct = Buffer.concat([c.update(uid, 'utf8'), c.final()]);
  return 'v1.' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}
export function openUid(sealed: unknown, secret: string): string | null {
  if (!secret || typeof sealed !== 'string' || !sealed.startsWith('v1.')) return null;
  try {
    const b = Buffer.from(sealed.slice(3), 'base64url');
    if (b.length < 29) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', keyFrom(secret), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch { return null; }
}

/** x = 만료 시각 · u = 암호화한 RC ID · at = 적재 시각 · sf = 구매 스토어프런트(웹훅 country_code — 가격 안내 기준)
 *  · cc = 웹훅 거래 통화가 그 나라 통화와 맞았나(통화 확인 — RC 거래 통화가 없을 때 이것으로) */
export interface ComebackEntry { x: number; u: string; at: number; sf: ComebackStorefront; cc?: boolean }
export function parseEntry(raw: unknown): ComebackEntry | null {
  let v: unknown = raw;
  if (typeof raw === 'string') { try { v = JSON.parse(raw); } catch { return null; } }
  const e = v as Partial<ComebackEntry> | null;
  return e && typeof e === 'object' && typeof e.x === 'number' && Number.isFinite(e.x) && typeof e.u === 'string' && typeof e.at === 'number'
    && (e.sf === 'KR' || e.sf === 'US' || e.sf === 'JP') ? e as ComebackEntry : null;
}

// ── 웹훅 → 적재·해제 판정(순수) ─────────────────────────────────────────
const CANCEL_TYPES = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'PRODUCT_CHANGE']);
const uidOk = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200;

/** 웹훅 본문 → 할 일. enqueue = 체험 해지 만료(후보 RC ID 들 — app_user_id 먼저, 별칭은 최대 5개) · cancel = 다시 결제(같은 후보들 빼기) · null = 무관 */
export function comebackWebhookAction(body: unknown): { kind: 'enqueue'; uids: string[]; expiredAt: number; storefront: ComebackStorefront; currencyOk: boolean } | { kind: 'cancel'; uids: string[] } | null {
  const e = (body as { event?: Record<string, unknown> } | null)?.event;
  if (!e || typeof e !== 'object' || typeof e.type !== 'string') return null;
  if (e.environment !== 'PRODUCTION') return null;
  const uids = [...new Set([e.app_user_id, e.original_app_user_id, ...(Array.isArray(e.aliases) ? e.aliases.slice(0, 5) : [])].filter(uidOk))];
  if (!uids.length) return null;
  if (CANCEL_TYPES.has(e.type)) return { kind: 'cancel', uids };
  if (e.type !== 'EXPIRATION') return null;
  if (e.period_type !== 'TRIAL' || e.store !== 'APP_STORE') return null;
  // 결제 실패 만료(갱신 켬 · 애플 결제 재시도 중)는 «만료 고객»이 아니다 — 오퍼 코드가 거절된다
  if (e.expiration_reason === 'BILLING_ERROR') return null;
  const ents = Array.isArray(e.entitlement_ids) ? e.entitlement_ids : (typeof e.entitlement_id === 'string' ? [e.entitlement_id] : null);
  if (ents && !ents.includes(PRO_ENTITLEMENT_ID)) return null;
  const x = typeof e.expiration_at_ms === 'number' && Number.isFinite(e.expiration_at_ms) ? e.expiration_at_ms
    : typeof e.event_timestamp_ms === 'number' ? e.event_timestamp_ms : NaN;
  if (!Number.isFinite(x)) return null;
  // 가격은 «구매한 스토어프런트»(웹훅 country_code)로만 안내한다 — 기기 시간대·언어로 추정하지 않는다(관문 11210854 ①). 가격을 아는 나라(KR·US·JP)만
  const storefront = storefrontFromCountry(e.country_code);
  if (!storefront) return null;
  // 웹훅 거래 통화가 있으면 그 나라 통화와 맞아야 한다(다르면 넣지 않는다). 없으면 발송 직전 RC 거래 통화로 확인한다
  const cur = typeof e.currency === 'string' && e.currency ? e.currency.toUpperCase() : null;
  if (cur && cur !== STOREFRONT_CURRENCY[storefront]) return null;
  return { kind: 'enqueue', uids, expiredAt: x, storefront, currencyOk: cur === STOREFRONT_CURRENCY[storefront] };
}

// ── RC 재확인(발송 직전 · 순수) ───────────────────────────────────────────
export type ComebackRcSkip = 'active' | 'paid' | 'no_trial' | 'renewing' | 'family' | 'storefront';
const ms = (v: unknown) => (typeof v === 'string' && v ? Date.parse(v) : NaN);

/** v1 subscriber 응답 → 'eligible' 또는 안 보내는 이유. 활성 권한(평생 포함) 없음 · 유료 결제 이력 없음 · 앱스토어 체험이 해지 뒤 만료 */
export function comebackRcVerdict(json: unknown, now: number, storefront?: ComebackStorefront, webhookCurrencyOk = false): 'eligible' | ComebackRcSkip {
  const sub = (json as { subscriber?: Record<string, any> } | null)?.subscriber;
  if (!sub || typeof sub !== 'object') return 'no_trial';
  const ents = sub.entitlements && typeof sub.entitlements === 'object' ? Object.values(sub.entitlements as Record<string, any>) : [];
  // 권한이 하나라도 살아 있으면(만료일 없음 = 평생·프로모션 포함) 보내지 않는다
  for (const ent of ents) {
    if (!ent || typeof ent !== 'object') continue;
    const x = ms(ent.expires_date);
    if (ent.expires_date == null || !Number.isFinite(x) || x > now) return 'active';
  }
  const nonSubs = sub.non_subscriptions && typeof sub.non_subscriptions === 'object' ? Object.values(sub.non_subscriptions as Record<string, unknown>) : [];
  if (nonSubs.some((v) => Array.isArray(v) && v.length > 0)) return 'paid';
  const subs = sub.subscriptions && typeof sub.subscriptions === 'object' ? Object.values(sub.subscriptions as Record<string, any>).filter((s) => s && typeof s === 'object') : [];
  if (subs.some((s) => !Number.isFinite(ms(s.expires_date)) || ms(s.expires_date) > now)) return 'active';
  if (subs.some((s) => s.period_type === 'normal' || s.period_type === 'intro' || s.period_type === 'prepaid')) return 'paid';
  const trials = subs.filter((s) => s.period_type === 'trial' && s.store === 'app_store')
    .sort((a, b) => ms(b.expires_date) - ms(a.expires_date));
  const last = trials[0];
  if (!last) return 'no_trial';
  if (last.ownership_type === 'FAMILY_SHARED') return 'family';
  // 애플 «만료 고객» = 자동 갱신을 끄고 기간이 끝난 고객 — 해지 표식이 없거나 결제 문제면 아니다
  if (!last.unsubscribe_detected_at || last.billing_issues_detected_at) return 'renewing';
  // 가격 안내 = 웹훅 나라 + 통화 확인(RC 거래 통화가 있으면 그것, 없으면 웹훅 거래 통화). 둘 다 없거나 다르면 가격을 단정하지 않는다(관문 11210900 ①)
  if (storefront) {
    const cur = typeof last.price?.currency === 'string' && last.price.currency ? last.price.currency.toUpperCase() : null;
    if (cur ? cur !== STOREFRONT_CURRENCY[storefront] : !webhookCurrencyOk) return 'storefront';
  }
  return 'eligible';
}

// ── 대상 판정(순수) ───────────────────────────────────────────────────────
export type ComebackTokenRec = {
  app?: string; platform?: string; locale?: string; preferences?: { enabled?: boolean; promo?: boolean } | null;
  notifPerm?: boolean; tz?: string; lastSeenAt?: string;
};
export type ComebackSkip = 'invalid' | 'not_yet' | 'early' | 'window' | 'sent' | 'recent_push' | 'unbound' | 'unregistered' | 'not_ios'
  | 'muted' | 'no_permission' | 'no_consent' | 'recent_open' | 'storefront' | 'quiet_hours' | 'code_closed';

/** 한국 수신자 광고성 푸시 허용 현지 시각 [시작, 끝) — 21~08시는 별도 야간 동의가 필요해 보내지 않는다(정보통신망법 50조 ③) */
export const COMEBACK_KR_PROMO_HOURS: readonly [number, number] = [8, 21];
/** 한국 수신자 표기(정보통신망법 50조 ④ — 제목 앞 «(광고)» · 수신거부 방법) */
export const COMEBACK_KR_AD_PREFIX = '(광고) ';
export const COMEBACK_KR_OPTOUT = '수신거부: 설정 › 알림 › 혜택·할인 알림';
/** 이 토큰 레코드가 한국 수신자인가(블프 푸시와 같은 판정) */
export function comebackKoreaRecipient(tokenRec: ComebackTokenRec | null | undefined): boolean {
  return promoKoreaRecipient(toPromoLoc(tokenRec?.locale), tokenRec?.tz);
}

/** 웹훅 country_code(ISO 3166 두 글자) → 가격을 아는 스토어프런트. 그 밖은 null(보내지 않는다) */
export function storefrontFromCountry(cc: unknown): ComebackStorefront | null {
  const c = typeof cc === 'string' ? cc.trim().toUpperCase() : '';
  return c === 'KR' || c === 'KOR' ? 'KR' : c === 'US' || c === 'USA' ? 'US' : c === 'JP' || c === 'JPN' ? 'JP' : null;
}
/** 스토어프런트 통화(RC 거래 price.currency 대조용) */
export const STOREFRONT_CURRENCY: Record<ComebackStorefront, string> = { KR: 'KRW', US: 'USD', JP: 'JPY' };

/** 지금 보낼까(RC 재확인 전 단계) — 'send' 또는 이유. bound = 지금 그 고객에 묶인 토큰(없으면 null) */
export function comebackDecision(
  entry: ComebackEntry | null,
  token: string | null,
  tokenRec: ComebackTokenRec | null,
  now: number,
  state: { sent: boolean; recentPush: boolean },
): 'send' | ComebackSkip {
  if (!entry) return 'invalid';
  if (!comebackLive(now)) return now < COMEBACK_VALID_FROM ? 'not_yet' : 'code_closed';
  const after = now - entry.x;
  if (after < COMEBACK_MIN_AFTER_MS) return 'early';
  if (after > COMEBACK_MAX_AFTER_MS) return 'window';
  if (state.sent) return 'sent';
  if (!token) return 'unbound';
  if (state.recentPush) return 'recent_push';
  const g = comebackDeviceGate(tokenRec);
  if (g !== 'ok') return g;
  const seen = Date.parse(tokenRec!.lastSeenAt ?? '') || 0;
  if (now - seen < TRIAL_PUSH_RECENT_OPEN_MS) return 'recent_open';
  const loc = toTrialSaveLocale(tokenRec!.locale || 'en');
  const hour = localHourIn(now, tokenRec!.tz || fallbackTimeZone(loc)) ?? localHourIn(now, fallbackTimeZone(loc));
  if (hour == null || hour < TRIAL_PUSH_HOURS[0] || hour >= TRIAL_PUSH_HOURS[1]) return 'quiet_hours';
  // 한국 수신자는 08:00~20:59 를 따로 확인한다(위 창이 바뀌어도 야간 광고 발송이 생기지 않게) — 밖이면 다음 회차로 미룬다
  if (comebackKoreaRecipient(tokenRec) && (hour < COMEBACK_KR_PROMO_HOURS[0] || hour >= COMEBACK_KR_PROMO_HOURS[1])) return 'quiet_hours';
  return 'send';
}

/** 기기 조건(시간·기록 상태 제외) — SIGNUM iOS · 알림 전체 켬 · 시스템 권한 허용 · ★11/27 혜택·할인 알림 명시 동의(블프 푸시와 같은 promoAllowed — iOS 는 promo === true 만).
 *  consent:false 는 11/27 이전 규칙(동의 확인 없음) — 드라이런 모의 비교에만 쓴다 */
export function comebackDeviceGate(tokenRec: ComebackTokenRec | null, opts: { consent?: boolean } = {}): 'ok' | 'unregistered' | 'not_ios' | 'muted' | 'no_permission' | 'no_consent' {
  if (!tokenRec || (tokenRec.app && tokenRec.app !== 'signum')) return 'unregistered';
  if (tokenRec.platform !== 'ios') return 'not_ios';
  if (tokenRec.preferences && tokenRec.preferences.enabled === false) return 'muted';
  if (tokenRec.notifPerm !== true) return 'no_permission';
  if (opts.consent !== false && !promoAllowed(tokenRec)) return 'no_consent';
  return 'ok';
}

// ── 문구(애플 3.1.2 — 할인가·기간·이후 정가·자동 갱신·언제든 해지 · 5.6 — 사실만, 긴급함·선착순·투자 권유 없음) ──
const COPY = {
  ko: {
    title: (o: string) => `PRO 다시 시작 — 첫 ${COMEBACK_MONTHS}개월 월 ${o}`,
    body: (c: string, o: string, r: string) => `체험이 끝난 분께 드리는 코드 ${c}: 첫 ${COMEBACK_MONTHS}개월은 월 ${o}, 이후 월 ${r}로 자동 갱신되며 언제든 해지할 수 있어요. 탭하면 App Store 적용 화면에서 가격을 확인하고 시작할 수 있어요.`,
  },
  en: {
    title: (o: string) => `Restart PRO — ${o}/month for your first ${COMEBACK_MONTHS} months`,
    body: (c: string, o: string, r: string) => `Code ${c} for members whose trial ended: ${o}/month for the first ${COMEBACK_MONTHS} months, then ${r}/month. Renews automatically; cancel anytime. Tap to review the price and apply it in the App Store.`,
  },
  ja: {
    title: (o: string) => `PROを再開 — 最初の${COMEBACK_MONTHS}か月は月額${o}`,
    body: (c: string, o: string, r: string) => `体験が終了した方へのコード${c}：最初の${COMEBACK_MONTHS}か月は月額${o}、以降は月額${r}で自動更新されます。いつでも解約できます。タップするとApp Storeの適用画面で価格を確認して始められます。`,
  },
} as const;

export function comebackContent(tokenRec: ComebackTokenRec | null, code: string, sf: ComebackStorefront | null): { title: string; body: string; storefront: ComebackStorefront } | null {
  const loc = toTrialSaveLocale(tokenRec?.locale || 'en');
  if (!sf || !COMEBACK_PRICES[sf] || !code) return null;
  const p = COMEBACK_PRICES[sf];
  const title = COPY[loc].title(p.offer), body = COPY[loc].body(code, p.offer, p.regular);
  // ★11/27 한국 수신자 — «(광고)» + 수신거부 방법(정보통신망법 50조). 그 밖은 문구 그대로
  if (comebackKoreaRecipient(tokenRec)) return { title: COMEBACK_KR_AD_PREFIX + title, body: `${body} ${COMEBACK_KR_OPTOUT}`, storefront: sf };
  return { title, body, storefront: sf };
}

/** 푸시 데이터(문자열만) — 앱은 type 으로 계측하고 c(코드 — 형식 검사)로 애플 적용 화면을 연다(주소를 데이터로 받지 않는다) */
export function comebackPushData(code: string): Record<string, string> {
  return { type: COMEBACK_PUSH_TYPE, v: '1', c: code };
}

// ── 웹훅 적재·해제(Redis 쓰기) ─────────────────────────────────────────────
export interface ComebackRedis {
  get(key: string): Promise<unknown>;
  set(key: string, value: string, opts?: { nx?: boolean; ex?: number }): Promise<unknown>;
  zadd(key: string, m: { score: number; member: string }): Promise<unknown>;
  zrem(key: string, member: string): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
}

/** RC 웹훅 본문을 받아 대상에 넣거나 뺀다. 실패해도 웹훅 응답에 영향을 주지 않게 호출부가 감싼다 */
export async function applyComebackWebhook(body: unknown, redis: ComebackRedis, secret: string, now = Date.now()):
  Promise<'enqueued' | 'cancelled' | 'ignored' | 'no_token' | 'sent' | 'no_secret' | 'stale'> {
  const a = comebackWebhookAction(body);
  if (!a) return 'ignored';
  if (a.kind === 'cancel') {
    for (const uid of a.uids) { const uh = trialUidHash(uid); await redis.zrem(COMEBACK_ZSET, uh); await redis.del(COMEBACK_ENTRY_KEY(uh)); }
    return 'cancelled';
  }
  if (now - a.expiredAt > COMEBACK_MAX_AFTER_MS) return 'stale';
  if (!secret) return 'no_secret';
  for (const uid of a.uids) {
    const uh = trialUidHash(uid);
    const token = boundToken(await redis.get(TRIAL_PUSH_UID_KEY(uh)));
    if (!token) continue;
    // 그 토큰의 체험 기록 주인이 이 고객일 때만(기기를 다른 사람이 이어 쓰는 경우 — 관문 11210854 ②)
    if (String((await redis.get(TRIAL_PUSH_OWNER_KEY(token))) ?? '') !== uh) continue;
    if ((await redis.get(COMEBACK_SENT_UID_KEY(uh))) != null) return 'sent';
    const u = sealUid(uid, secret);
    if (!u) return 'no_secret';
    const entry: ComebackEntry = { x: a.expiredAt, u, at: now, sf: a.storefront, cc: a.currencyOk };
    await redis.set(COMEBACK_ENTRY_KEY(uh), JSON.stringify(entry), { nx: true, ex: COMEBACK_ENTRY_TTL_S });
    await redis.zadd(COMEBACK_ZSET, { score: a.expiredAt, member: uh });
    return 'enqueued';
  }
  return 'no_token';
}

/** 발송 직전 RC 재확인 — 앱 번들의 공개 키(iOS)로 GET /v1/subscribers(체험 보고 확인과 같은 길). 못 읽으면 'rc_unavailable'(보내지 않고 다음 회차에) */
export async function readComebackRc(uid: string, key: string | undefined, now: number, storefront?: ComebackStorefront, webhookCurrencyOk = false, fetchImpl: typeof fetch = fetch, timeoutMs = 3000):
  Promise<'eligible' | ComebackRcSkip | 'rc_unavailable'> {
  if (!key) return 'rc_unavailable';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      method: 'GET', cache: 'no-store', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, 'X-Platform': 'ios', Accept: 'application/json' },
    });
    if (res.status === 404) return 'no_trial';
    if (!res.ok) return 'rc_unavailable';
    const json = await res.json();
    if (!json || typeof json !== 'object' || !('subscriber' in json)) return 'rc_unavailable';
    return comebackRcVerdict(json, now, storefront, webhookCurrencyOk);
  } catch { return 'rc_unavailable'; } finally { clearTimeout(timer); }
}
