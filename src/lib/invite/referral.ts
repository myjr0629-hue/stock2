/**
 * 양면 추천 보상 — «토큰 귀속 + RC 신규 고객 확인» 뒤에만 초대자 크레딧 (2026-11-13, 브랜치 feat/referral-1113). 서버 전용.
 * 설계: ~/Documents/signum-work/2026-11-12/referral-reward/DESIGN.md (흐름 4·5, 부정 방지)
 *
 * 흐름:
 *   ① 초대자 앱이 /api/invite/token 에 비공개 열쇠 + RC 앱 사용자 ID 를 보내 서명 토큰을 받는다(lib/invite/token) → 공유 링크에 inv= 로 싣는다.
 *   ② 친구가 링크를 «폰에서 사람이» 열면 /app 이 터치에 토큰의 초대자 RC 태그(u)를 같이 적는다(서명·만료·ref 대조 통과분만).
 *   ③ 친구가 앱을 새로 설치해 첫 실행 → /api/invite/arrive(requireToken) → 토큰 터치와 맞으면 «확인 대기»(clm:<친구 ref>, 7일)만 남긴다. 적립 없음.
 *   ④ 친구 앱이 실행·복귀 때 /api/invite/verify 에 자기 열쇠 + RC 앱 사용자 ID 를 보낸다 → 서버가 RevenueCat 에서 «직접» 읽어 판정:
 *        · 친구 RC 고객 = 토큰의 초대자 RC 고객            → self(자기 초대·같은 기기) — 보상 없음, 끝
 *        · first_seen 이 링크 클릭보다 이전 · 클릭 전 구매 기록 → existing(이미 고객) — 끝
 *        · 샌드박스(시험) 구매가 하나라도 있다                → sandbox — 끝
 *        · first_seen 이 첫 실행(도착) 60분 뒤보다 늦다        → late(첫 실행의 RC 고객이 아님) — 끝
 *        · 그 밖(클릭 뒤 ~ 첫 실행 무렵 처음 생긴 비샌드박스 RC 고객) → verified → 원자 적립(같은 RC 고객·같은 거래·같은 IP 1회, 초대자 월 3, 전체 하루 25)
 *      ★2026-11-13 코디네이터 결정 «조건을 기존 문구(친구가 설치하면 코드)에 맞춘다» — 처음엔 «클릭 뒤 운영 스토어 구매·체험 시작»까지 요구했으나 뺐다.
 *      익명 RC ID 는 기기가 만들 수 있는 값이라 «RC 고객이 있다»만으로는 신규 사람의 증거가 아니다(설계 §흐름 4) — 이 완화로 남는 위험은
 *      같은 망 제외·같은 IP 30일 1회·초대자 월 3·하루 25·첫 실행 60분 창이 받친다(RESULT.md 남은 위험).
 *   ⑤ 초대자 앱의 선물함(/api/invite/inbox)이 크레딧을 기존 풀·mintOne 으로 번호 1장으로 바꾼다(기존 그대로) → 앱 안 «친구가 설치했어요» 카드.
 * 리뷰·평점과 무관하다(애플 3.2.2·5.6) — 조건은 설치·첫 실행뿐.
 * 개인정보: RC ID·열쇠·IP·번호 원문은 저장·로그하지 않는다(HMAC 해시만). 결론 표식에는 사유 단어만.
 */
import { DAILY_CREDIT_CAP, CLAIM_TTL_SEC, INVITER_MONTHLY_CAP, IP_CREDIT_TTL_SEC, etDay, inviteKeys, isOs, type InviteStore, type Os } from './engine';
import { inviteRefOf, normalizeInviteKey } from './identity';
import { rcUidKeyHash, rcUidTag } from './token';
import crypto from 'node:crypto';

/** RC 앱 사용자 ID 형식 — lib/push/trialVerify.RC_UID_RE 와 같다(익명 ID 또는 앱이 정한 ID) */
export const REFERRAL_RC_UID_RE = /^\$RCAnonymousID:[0-9a-f]{32}$|^[A-Za-z0-9._:-]{8,100}$/;
/** 서버 시계 차 여유 — 진짜 초대 설치는 «클릭 → 스토어 → 설치 → 첫 실행(RC 고객 생성)» 순서라 first_seen·구매는 늘 클릭 «뒤»다.
 *  10분이면 «클릭 몇 분 전에 이미 설치한 사람»도 신규로 통과한다(관문 11131202 ②) → 60초(RC·Vercel 서버 시계 차만). */
export const CLICK_SKEW_MS = 60_000;
/** first_seen 이 첫 실행(도착 기록) 뒤 이만큼 안이어야 «그 첫 실행의 RC 고객»으로 본다(나중에 따로 만든 ID 로 받는 것 방지) */
export const FIRST_RUN_WINDOW_MS = 60 * 60_000;
export const VERIFY_WINDOW_S = 600;
export const VERIFY_LIMIT_SELF = 6;
export const VERIFY_LIMIT_IP = 30;
export const VERIFY_LIMIT_ALL = 300;
export const VERIFY_TIMEOUT_MS = 4000;
const LONG_TTL = 400 * 24 * 3600;
const DAY_TTL = 3 * 24 * 3600;
const MONTH_TTL = 40 * 24 * 3600;
const DONE_TTL = CLAIM_TTL_SEC + 86400;

export type RcVerdict = { verdict: 'verified'; txn: string | null } | { verdict: 'pending' | 'existing' | 'sandbox' | 'late' };

const ms = (v: unknown) => (typeof v === 'string' && v ? Date.parse(v) : NaN);

/**
 * RC v1 subscriber 응답 → 신규성 판정. since = 친구가 초대 링크를 연 시각(터치) · arrivedAt = 첫 실행 도착 기록 시각. 순수 함수.
 *   거래 후보 = subscriptions 값 + non_subscriptions 배열 원소(있으면 이미 고객·샌드박스 판정에만 쓰고, 지급 조건은 아니다).
 */
export function rcNewness(json: unknown, since: number, arrivedAt: number = since): RcVerdict {
  const sub = (json as { subscriber?: Record<string, any> } | null)?.subscriber;
  if (!sub || typeof sub !== 'object') return { verdict: 'pending' };
  const floor = since - CLICK_SKEW_MS;
  const first = ms(sub.first_seen);
  if (!Number.isFinite(first)) return { verdict: 'pending' };
  if (first < floor) return { verdict: 'existing' };
  if (first > Math.max(arrivedAt, since) + FIRST_RUN_WINDOW_MS) return { verdict: 'late' };
  const items: Record<string, any>[] = [];
  if (sub.subscriptions && typeof sub.subscriptions === 'object') {
    for (const v of Object.values(sub.subscriptions as Record<string, unknown>)) if (v && typeof v === 'object') items.push(v as Record<string, any>);
  }
  if (sub.non_subscriptions && typeof sub.non_subscriptions === 'object') {
    for (const arr of Object.values(sub.non_subscriptions as Record<string, unknown>)) {
      if (Array.isArray(arr)) for (const v of arr) if (v && typeof v === 'object') items.push(v as Record<string, any>);
    }
  }
  if (items.some((it) => it.is_sandbox === true)) return { verdict: 'sandbox' };
  for (const it of items) {
    const orig = ms(it.original_purchase_date);
    const bought = ms(it.purchase_date);
    if ((Number.isFinite(orig) && orig < floor) || (Number.isFinite(bought) && bought < floor)) return { verdict: 'existing' };
  }
  // 구매·체험은 지급 조건이 아니다(코디네이터 결정). 있으면 그 거래로도 중복을 막는다(같은 거래 1회).
  const fresh = items.find((it) => it.is_sandbox === false && !it.refunded_at
    && (it.store === 'app_store' || it.store === 'play_store')
    && Number.isFinite(ms(it.purchase_date)) && ms(it.purchase_date) >= floor);
  const txn = !fresh ? null : typeof fresh.store_transaction_id === 'string' && fresh.store_transaction_id ? fresh.store_transaction_id
    : typeof fresh.id === 'string' && fresh.id ? fresh.id : null;
  return { verdict: 'verified', txn };
}

export type RcFetch = (uid: string, os: Os) => Promise<{ kind: 'ok'; json: unknown } | { kind: 'missing' | 'limited' | 'unavailable' }>;

/** 공개(SDK) 키로 GET /v1/subscribers/{id} — lib/push/trialVerify 와 같은 길. ⚠ 없는 ID 는 RC 가 «만든다» — 대기 기록·예산을 통과한 것만 부른다. */
export function rcSubscriberFetcher(keys: { ios?: string; android?: string }, fetchImpl: typeof fetch = fetch, timeoutMs = VERIFY_TIMEOUT_MS): RcFetch {
  return async (uid, os) => {
    const key = os === 'ios' ? keys.ios : keys.android;
    if (!key) return { kind: 'unavailable' };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
        method: 'GET', cache: 'no-store', signal: ctrl.signal,
        headers: { Authorization: `Bearer ${key}`, 'X-Platform': os, Accept: 'application/json' },
      });
      if (res.status === 400 || res.status === 404) return { kind: 'missing' };
      if (res.status === 429) return { kind: 'limited' };
      if (!res.ok) return { kind: 'unavailable' };
      const json = await res.json();
      return json && typeof json === 'object' && 'subscriber' in json ? { kind: 'ok', json } : { kind: 'unavailable' };
    } catch { return { kind: 'unavailable' }; } finally { clearTimeout(timer); }
  };
}

/** ET 달력월 YYYY-MM — 초대자 월 상한의 칸 */
export function etMonth(now = Date.now()): string { return etDay(now).slice(0, 7); }

export type VerifyState =
  | { state: 'none' }                       // 이 기기에는 확인할 초대가 없다(멈춘다)
  | { state: 'pending'; reason: 'no_record' | 'day_cap' | 'limited' | 'unavailable' | 'missing' }
  | { state: 'credited' }
  | { state: 'final'; reason: 'self' | 'same_ip' | 'existing' | 'sandbox' | 'late' | 'dup' | 'ip' | 'inviter_cap' | 'credited' | 'again' };

export interface VerifyInput {
  key: unknown; rcUid: unknown; os: unknown; ipHash: string; now?: number; vercelEnv?: string;
  secret: string; rc: RcFetch;
}

/** 초대자가 토큰을 받은 IP 해시(최근 5개) — /api/invite/token 이 적는다 */
export const TOKEN_IP_KEEP = 5;
export const TOKEN_IP_TTL_SEC = 30 * 86400;
export async function inviterIps(store: InviteStore, key: string): Promise<string[]> {
  try {
    const v = JSON.parse((await store.get(key)) || '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && /^[0-9a-f]{24}$/.test(x)) : [];
  } catch { return []; }
}
export async function noteInviterIp(store: InviteStore, key: string, ipHash: string): Promise<void> {
  const cur = (await inviterIps(store, key)).filter((x) => x !== ipHash);
  await store.set(key, JSON.stringify([...cur, ipHash].slice(-TOKEN_IP_KEEP)), TOKEN_IP_TTL_SEC);
}

const budgetId = (s: string) => crypto.createHash('sha256').update(`inv-vb|${s}`).digest('hex').slice(0, 20);

export async function verifyClaim(store: InviteStore, i: VerifyInput): Promise<VerifyState | null> {
  const key = normalizeInviteKey(i.key);
  if (!key || !isOs(i.os) || typeof i.rcUid !== 'string' || !REFERRAL_RC_UID_RE.test(i.rcUid) || !i.secret) return null;
  const uid = i.rcUid;
  const now = i.now ?? Date.now();
  const k = inviteKeys(i.vercelEnv);
  const selfRef = inviteRefOf(key);
  const done = await store.get(k.claimDone(selfRef));
  if (done) return { state: 'final', reason: (['self', 'same_ip', 'existing', 'sandbox', 'late', 'dup', 'ip', 'inviter_cap', 'credited'].includes(done) ? done : 'again') as 'again' };
  const raw = await store.get(k.claim(selfRef));
  if (!raw) return { state: 'none' };
  let c: { r?: unknown; u?: unknown; at?: unknown; arr?: unknown; ip?: unknown } | null = null;
  try { c = JSON.parse(raw); } catch { c = null; }
  const inviterRef = typeof c?.r === 'string' ? c.r : '';
  const at = typeof c?.at === 'number' ? c.at : NaN;
  const ip = typeof c?.ip === 'string' && /^[0-9a-f]{24}$/.test(c.ip) ? c.ip : '';
  if (!inviterRef || !Number.isFinite(at) || !ip || typeof c?.u !== 'string') return { state: 'none' };
  const finish = async (reason: 'self' | 'same_ip' | 'existing' | 'sandbox' | 'late'): Promise<VerifyState> => {
    await store.setNx(k.claimDone(selfRef), reason, DONE_TTL);
    return { state: 'final', reason };
  };
  // 자기 초대·같은 기기: 친구 RC 고객 = 초대자 RC 고객(토큰 u). 열쇠가 같은 경우는 도착 단계(self)에서 이미 걸렀다.
  if (rcUidTag(uid, i.secret) === c.u) return finish('self');
  // 같은 기기·같은 망: 친구가 첫 실행한 IP = 초대자가 토큰을 받은 IP(최근 5개) → 보상 없음.
  //   RC 앱 사용자 ID 는 기기가 고를 수 있어(토큰 발급 때 남의 ID 를 내도 막을 수 없다 — 관문 11131202 ①) RC 비교만으로는 «같은 기기 재설치»를 못 막는다.
  //   같은 와이파이의 가족·동료도 걸리지만(정상 초대 일부 손실) 금전 가치 보상이라 보수적으로 막는다(설계 §부정 방지).
  if ((await inviterIps(store, k.tokenIps(inviterRef))).includes(ip)) return finish('same_ip');

  // 공급사 호출 전 예산(10분 창): 친구 ref·IP·전체
  const w = Math.floor(now / 1000 / VERIFY_WINDOW_S);
  try {
    const a = await store.incr(k.verifyBudget('s', budgetId(selfRef), w), VERIFY_WINDOW_S * 2);
    const b = await store.incr(k.verifyBudget('i', budgetId(i.ipHash), w), VERIFY_WINDOW_S * 2);
    if (a > VERIFY_LIMIT_SELF || b > VERIFY_LIMIT_IP) return { state: 'pending', reason: 'limited' };
    const all = await store.incr(k.verifyBudget('a', 'all', w), VERIFY_WINDOW_S * 2);
    if (all > VERIFY_LIMIT_ALL) return { state: 'pending', reason: 'limited' };
  } catch { return { state: 'pending', reason: 'unavailable' }; }

  const got = await i.rc(uid, i.os);
  if (got.kind !== 'ok') return { state: 'pending', reason: got.kind };
  const arrivedAt = typeof c?.arr === 'number' && Number.isFinite(c.arr) ? c.arr : at;
  const v = rcNewness(got.json, at, arrivedAt);
  if (v.verdict === 'existing' || v.verdict === 'sandbox' || v.verdict === 'late') return finish(v.verdict);
  if (v.verdict !== 'verified') return { state: 'pending', reason: 'no_record' };

  const uidHash = rcUidKeyHash(uid, i.secret);
  const txHash = v.txn ? 't' + crypto.createHmac('sha256', i.secret).update(`inv-tx|${v.txn}`).digest('hex').slice(0, 31) : `n${uidHash}`;
  const r = await store.verifyCredit({
    keys: [k.claim(selfRef), k.claimDone(selfRef), k.rcUser(uidHash), k.rcTxn(txHash), k.ipCredit(ip),
      k.month(inviterRef, etMonth(now)), k.day(etDay(now)), k.credit(inviterRef), k.friends(inviterRef)],
    now, inviterRef, monthCap: INVITER_MONTHLY_CAP, dailyCap: DAILY_CREDIT_CAP, hasTxn: !!v.txn,
    rcTtl: LONG_TTL, ipTtl: IP_CREDIT_TTL_SEC, longTtl: LONG_TTL, dayTtl: DAY_TTL, monthTtl: MONTH_TTL, doneTtl: DONE_TTL,
  });
  if (r === 'credited') return { state: 'credited' };
  if (r === 'day_cap') return { state: 'pending', reason: 'day_cap' };
  if (r === 'none') return { state: 'none' };
  return { state: 'final', reason: r };
}
