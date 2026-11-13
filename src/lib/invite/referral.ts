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
 *        · first_seen 이 우리 조회 시각 2초 안(우리 GET 이 만든 고객) → unseen(설치 증거 아님 — 2026-11-14 야간 교차 검토 ③) — 끝
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
/** 샌드박스(시험) 고객은 구매 전엔 RC 응답으로 구분되지 않는다 — first_seen 뒤 이만큼 기다렸다가(그 사이 시험 구매가 생기면 sandbox 로 걸린다) 지급한다(관문 11131233 ②).
 *  시험 흐름은 보통 설치 직후 구매까지 해 보므로 2시간. 친구 앱이 7일 안에 다시 열리거나 켜 둔 동안 3분마다 다시 확인한다. */
export const SANDBOX_HOLD_MS = 2 * 3600_000;
/** 샌드박스 대기 환경 조정 — INVITE_REWARD_HOLD_MS(0~7일). 없거나 형식 밖이면 기본값 */
export function rewardHoldMs(env: Record<string, string | undefined> = process.env): number | undefined {
  const raw = env.INVITE_REWARD_HOLD_MS;
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 && n <= 7 * 86400_000 ? n : undefined;
}
/**
 * [2026-11-14 야간 교차 검토 ③] RC 는 없는 앱 사용자 ID 를 GET 하면 «만든다» — 설치 없이 스크립트가 새 ID 로 확인을 부르면 우리 조회가 만든 고객의
 * first_seen 이 «첫 실행 60분 안 신규»를 통과했다. 그래서 RC 가 이 고객을 처음 본 시각이 «우리 조회 시각» 이만큼 안이면 설치 증거가 아니다(unseen, 보상 없음).
 *   RC first_seen 은 초 단위(잘림)라 우리 조회가 만든 고객은 조회 시각과 ±1초 안 → 2초.
 *   진짜 앱은 확인 전에 SDK 로 자기 고객 정보를 먼저 받고 RC 가 처음 본 뒤 3.5초가 지나도록 기다렸다가 부른다(tokenClient.VERIFY_FRESH_WAIT_MS).
 */
export const PROBE_FRESH_MS = 2000;
export const VERIFY_WINDOW_S = 600;
export const VERIFY_LIMIT_SELF = 6;
export const VERIFY_LIMIT_IP = 30;
export const VERIFY_LIMIT_ALL = 300;
export const VERIFY_TIMEOUT_MS = 4000;
const LONG_TTL = 400 * 24 * 3600;
const DAY_TTL = 3 * 24 * 3600;
const MONTH_TTL = 40 * 24 * 3600;
const DONE_TTL = CLAIM_TTL_SEC + 86400;

export type RcVerdict = { verdict: 'verified'; txn: string | null; firstSeen: number } | { verdict: 'pending' | 'existing' | 'sandbox' | 'late' | 'unseen' };

const ms = (v: unknown) => (typeof v === 'string' && v ? Date.parse(v) : NaN);

/**
 * RC v1 subscriber 응답 → 신규성 판정. since = 친구가 초대 링크를 연 시각(터치) · arrivedAt = 첫 실행 도착 기록 시각. 순수 함수.
 *   requestedAt = 우리 조회 시각 — RC 응답의 request_date_ms(RC 시계)가 있으면 그것, 없으면 넘겨받은 서버 시각. 둘 다 없으면 이 검사는 건너뛴다.
 *   거래 후보 = subscriptions 값 + non_subscriptions 배열 원소(있으면 이미 고객·샌드박스 판정에만 쓰고, 지급 조건은 아니다).
 */
export function rcNewness(json: unknown, since: number, arrivedAt: number = since, requestedAt?: number): RcVerdict {
  const sub = (json as { subscriber?: Record<string, any> } | null)?.subscriber;
  if (!sub || typeof sub !== 'object') return { verdict: 'pending' };
  const floor = since - CLICK_SKEW_MS;
  const first = ms(sub.first_seen);
  if (!Number.isFinite(first)) return { verdict: 'pending' };
  if (first < floor) return { verdict: 'existing' };
  const rd = Number((json as { request_date_ms?: unknown }).request_date_ms);
  const req = Number.isFinite(rd) && rd > 0 ? rd : requestedAt;
  // 우리 조회가 처음 만든(또는 기기 SDK 가 한 번도 부르지 않은) 고객 — 설치 증거가 아니다(PROBE_FRESH_MS)
  if (typeof req === 'number' && Number.isFinite(req) && req - first < PROBE_FRESH_MS) return { verdict: 'unseen' };
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
  return { verdict: 'verified', txn, firstSeen: first };
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
  | { state: 'pending'; reason: 'no_record' | 'hold' | 'day_cap' | 'limited' | 'unavailable' | 'missing' }
  | { state: 'credited' }
  | { state: 'final'; reason: 'self' | 'same_ip' | 'existing' | 'sandbox' | 'late' | 'unseen' | 'dup' | 'ip' | 'inviter_cap' | 'credited' | 'again' };

export interface VerifyInput {
  key: unknown; rcUid: unknown; os: unknown; ipHash: string; now?: number; vercelEnv?: string;
  secret: string; rc: RcFetch;
  /** 샌드박스 대기(기본 SANDBOX_HOLD_MS) */
  holdMs?: number;
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
  return verifyBySelfRef(store, { selfRef: inviteRefOf(key), uid: i.rcUid, os: i.os, ipHash: i.ipHash, now: i.now, vercelEnv: i.vercelEnv, secret: i.secret, rc: i.rc, holdMs: i.holdMs });
}

// ── 대기 중인 확인을 «초대자 선물함 열기»로도 마친다 ─────────────────────────
// 2시간 샌드박스 대기 동안 친구가 앱을 닫고 다시 안 열면 확인할 주체가 없다(관문 11131236). 그래서 대기(hold·하루 상한)에 걸린 기록은
// 친구 RC ID 를 «서버 비밀로 암호화(AES-256-GCM)»해 7일 보관하고, 초대자가 선물함을 열 때(/api/invite/inbox) 만기된 것부터 서버가 다시 확인한다.
// 초대자는 보상을 보려면 어차피 앱을 연다 — 그 순간 확인·적립·번호 배정이 한 번에 된다. RC ID 원문은 저장하지 않는다(암호문만, 7일 TTL).
export const PENDING_PER_INBOX = 3;
const encKey = (secret: string) => crypto.createHash('sha256').update(`inv-uid-enc|${secret}`).digest();
export function sealUid(uid: string, secret: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(secret), iv);
  const body = Buffer.concat([c.update(uid, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
}
export function openUid(sealed: string, secret: string): string | null {
  try {
    const [iv, tag, body] = sealed.split('.').map((x) => Buffer.from(x, 'base64url'));
    const d = crypto.createDecipheriv('aes-256-gcm', encKey(secret), iv);
    d.setAuthTag(tag);
    const uid = Buffer.concat([d.update(body), d.final()]).toString('utf8');
    return REFERRAL_RC_UID_RE.test(uid) ? uid : null;
  } catch { return null; }
}
type PendingItem = { s: string; due: number };
/** 대기 목록 = HASH 친구 ref → 만기 시각(필드마다 7일 TTL). 필드 단위 쓰기라 동시에 두 친구가 들어와도 서로 덮어쓰지 않는다(관문 11131239 ②). */
async function readPending(store: InviteStore, key: string): Promise<PendingItem[]> {
  try {
    return Object.entries(await store.hgetall(key)).map(([s, v]) => ({ s, due: Number(v) })).filter((x) => Number.isFinite(x.due)).sort((a, b) => a.due - b.due);
  } catch { return []; }
}
async function park(store: InviteStore, k: ReturnType<typeof inviteKeys>, inviterRef: string, selfRef: string, uid: string, due: number, secret: string) {
  try {
    await store.set(k.claimUid(selfRef), sealUid(uid, secret), CLAIM_TTL_SEC);
    await store.hsetExpiring(k.pending(inviterRef), selfRef, String(due), CLAIM_TTL_SEC);
  } catch { /* 보관 실패 — 친구 앱의 다음 확인이 남는다 */ }
}
async function unpark(store: InviteStore, k: ReturnType<typeof inviteKeys>, inviterRef: string, selfRef: string) {
  try {
    await store.hdel(k.pending(inviterRef), selfRef);
    await store.del(k.claimUid(selfRef));
  } catch { /* TTL 이 지운다 */ }
}

/** 초대자 선물함 열기 때 — 만기된 대기 확인을 최대 3건 서버가 다시 한다. 적립된 수를 돌려준다. 실패는 삼킨다. */
export async function verifyPendingFor(store: InviteStore, i: { inviterRef: string; now?: number; vercelEnv?: string; secret: string; rc: RcFetch; holdMs?: number }): Promise<number> {
  if (!i.secret) return 0;
  const now = i.now ?? Date.now();
  const k = inviteKeys(i.vercelEnv);
  let credited = 0;
  const due = (await readPending(store, k.pending(i.inviterRef))).filter((x) => x.due <= now).slice(0, PENDING_PER_INBOX);
  for (const item of due) {
    try {
      const sealed = await store.get(k.claimUid(item.s));
      const uid = sealed ? openUid(sealed, i.secret) : null;
      const raw = await store.get(k.claim(item.s));
      let c: { os?: unknown; ip?: unknown } | null = null;
      try { c = raw ? JSON.parse(raw) : null; } catch { c = null; }
      if (!uid || !c || !isOs(c.os) || typeof c.ip !== 'string') { await unpark(store, k, i.inviterRef, item.s); continue; }
      const r = await verifyBySelfRef(store, { selfRef: item.s, uid, os: c.os, ipHash: c.ip, now, vercelEnv: i.vercelEnv, secret: i.secret, rc: i.rc, holdMs: i.holdMs });
      if (r.state === 'credited') credited++;
    } catch { /* 다음 기회에 */ }
  }
  return credited;
}

async function verifyBySelfRef(store: InviteStore, i: { selfRef: string; uid: string; os: Os; ipHash: string; now?: number; vercelEnv?: string; secret: string; rc: RcFetch; holdMs?: number }): Promise<VerifyState> {
  const uid = i.uid;
  const now = i.now ?? Date.now();
  const k = inviteKeys(i.vercelEnv);
  const selfRef = i.selfRef;
  const done = await store.get(k.claimDone(selfRef));
  // 결론이 이미 났는데 대기 목록 정리가 실패해 남아 있던 항목은 여기서 지운다(앞쪽 3칸을 막지 않게 — 관문 11131242). 초대자 ref 는 대기 기록에서.
  if (done) {
    try { const c0 = JSON.parse((await store.get(k.claim(selfRef))) || 'null'); if (c0 && typeof c0.r === 'string') await unpark(store, k, c0.r, selfRef); } catch { /* TTL 이 지운다 */ }
  }
  if (done) return { state: 'final', reason: (['self', 'same_ip', 'existing', 'sandbox', 'late', 'unseen', 'dup', 'ip', 'inviter_cap', 'credited'].includes(done) ? done : 'again') as 'again' };
  const raw = await store.get(k.claim(selfRef));
  if (!raw) return { state: 'none' };
  let c: { r?: unknown; u?: unknown; at?: unknown; arr?: unknown; ip?: unknown } | null = null;
  try { c = JSON.parse(raw); } catch { c = null; }
  const inviterRef = typeof c?.r === 'string' ? c.r : '';
  const at = typeof c?.at === 'number' ? c.at : NaN;
  const ip = typeof c?.ip === 'string' && /^[0-9a-f]{24}$/.test(c.ip) ? c.ip : '';
  if (!inviterRef || !Number.isFinite(at) || !ip || typeof c?.u !== 'string') return { state: 'none' };
  const finish = async (reason: 'self' | 'same_ip' | 'existing' | 'sandbox' | 'late' | 'unseen'): Promise<VerifyState> => {
    await store.setNx(k.claimDone(selfRef), reason, DONE_TTL);
    await unpark(store, k, inviterRef, selfRef);
    return { state: 'final', reason };
  };
  // 자기 초대·같은 기기: 친구 RC 고객 = 초대자 RC 고객(토큰 u). 열쇠가 같은 경우는 도착 단계(self)에서 이미 걸렀다.
  if (rcUidTag(uid, i.secret) === c.u) return finish('self');
  // 같은 기기·같은 망: 친구가 첫 실행한 IP = 초대자가 토큰을 받은 IP(최근 5개) → 보상 없음.
  //   RC 앱 사용자 ID 는 기기가 고를 수 있어(토큰 발급 때 남의 ID 를 내도 막을 수 없다 — 관문 11131202 ①) RC 비교만으로는 «같은 기기 재설치»를 못 막는다.
  //   같은 와이파이의 가족·동료도 걸리지만(정상 초대 일부 손실) 금전 가치 보상이라 보수적으로 막는다(설계 §부정 방지).
  if ((await inviterIps(store, k.tokenIps(inviterRef))).includes(ip)) return finish('same_ip');

  // RC 확인 «전»에 먼저 보관한다 — 공급사 제한·장애·기록 지연으로 이번에 못 끝내도 초대자 선물함 열기가 다시 확인할 수 있게(관문 11131239 ①).
  //   결론(적립·제외)이 나면 unpark 가 지운다. 만기 = 지금(다음 선물함 열기에 바로 다시).
  await park(store, k, inviterRef, selfRef, uid, now, i.secret);

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
  const v = rcNewness(got.json, at, arrivedAt, now);
  // unseen = 우리 조회가 이 RC 고객을 처음 만들었다(설치·첫 실행의 SDK 가 아니다) → 끝(다시 불러도 그 고객은 «예전부터 있던» 것처럼 보이므로 결론을 남긴다)
  if (v.verdict === 'existing' || v.verdict === 'sandbox' || v.verdict === 'late' || v.verdict === 'unseen') return finish(v.verdict);
  if (v.verdict !== 'verified') return { state: 'pending', reason: 'no_record' };
  const hold = i.holdMs ?? SANDBOX_HOLD_MS;
  if (now - v.firstSeen < hold) {
    await park(store, k, inviterRef, selfRef, uid, v.firstSeen + hold, i.secret);
    return { state: 'pending', reason: 'hold' };
  }

  const uidHash = rcUidKeyHash(uid, i.secret);
  const txHash = v.txn ? 't' + crypto.createHmac('sha256', i.secret).update(`inv-tx|${v.txn}`).digest('hex').slice(0, 31) : `n${uidHash}`;
  const r = await store.verifyCredit({
    keys: [k.claim(selfRef), k.claimDone(selfRef), k.rcUser(uidHash), k.rcTxn(txHash), k.ipCredit(ip),
      k.month(inviterRef, etMonth(now)), k.day(etDay(now)), k.credit(inviterRef), k.friends(inviterRef)],
    now, inviterRef, monthCap: INVITER_MONTHLY_CAP, dailyCap: DAILY_CREDIT_CAP, hasTxn: !!v.txn,
    rcTtl: LONG_TTL, ipTtl: IP_CREDIT_TTL_SEC, longTtl: LONG_TTL, dayTtl: DAY_TTL, monthTtl: MONTH_TTL, doneTtl: DONE_TTL,
  });
  if (r === 'day_cap') {
    await park(store, k, inviterRef, selfRef, uid, now + 3600_000, i.secret);
    return { state: 'pending', reason: 'day_cap' };
  }
  await unpark(store, k, inviterRef, selfRef);
  if (r === 'credited') return { state: 'credited' };
  if (r === 'none') return { state: 'none' };
  return { state: 'final', reason: r };
}
