/**
 * 추천 보상 엔진 — 2026-10-14 (브랜치 feat/viral-loop). 서버 전용(레디스·node:crypto).
 *
 * 흐름(받은 쪽 «클릭» → «설치·실행» 매칭 → 초대자 «보상»):
 *   ① 터치   /app?from=gift|share_*&ref=<초대 id> 를 «폰»에서 «사람»이 연다 → 방문자 IP 해시+기기 종류 칸에 «누구 링크였나»를 72시간 적는다.
 *   ② 도착   앱을 «새로 설치해 처음 실행»하면(첫 안내를 마치기 전 실행) 앱이 /api/invite/arrive 를 한 번 부른다 → 같은 IP 해시+기기 종류의 터치가 있으면
 *           «그 초대자의 친구가 왔다»고 본다 → 초대자에게 보상 1건(크레딧)을 적립한다. 정확한 IP 터치가 없으면 «같은 /24(v6 /48)»의 가장 최근 터치로 한 번 더 찾는다(loose — 이동통신 CGNAT 는
 *           같은 사람의 연결도 요청마다 다른 공인 IP 로 나갈 수 있다: 2026-10-14 운영 실측). 느슨한 매칭은 대역 내 72시간 ref가 하나뿐이고 터치가 30분 이내일 때만 적립하며 지표에 따로 센다(share:matchloose).
 *   ③ 선물함 초대자가 앱을 열면 /api/invite/inbox 가 «쌓인 크레딧»을 번호로 바꿔 준다(애플 일회용 · Play 일회용 — 기존 오퍼만, 새 가격·새 오퍼 없음).
 *           번호는 «조회할 때» 뽑는다(그 사람의 기기 종류에 맞는 풀에서) — 적립 때 뽑으면 아이폰 초대자에게 안드 번호가 갈 수 있다.
 * 친구 쪽 보상(PRO 1개월)은 «설치 전» 쿠폰 화면이 이미 준다(/app?code=… → 아이폰 애플 코드 · 안드 개인 번호) — 이 엔진은 «초대자 보상»만 다룬다.
 *
 * 부정 방지(전부 서버가 센다 — 클라이언트 값은 믿지 않는다):
 *   · 같은 기기: 열쇠(key)→ref 한 칸당 «도착»은 평생 1회(arr:<내 ref> SET NX). 앱 데이터를 지우면 새 기기로 본다 — 그래서 아래 IP·하루 상한이 받친다.
 *   · 같은 IP: 한 IP 해시는 30일에 «보상이 적립되는 도착» 1회(ipc:<해시> SET NX).
 *   · 자기 초대: 터치의 ref 가 내 ref 와 같으면 적립하지 않는다.
 *   · 초대자별 상한: 평생 3건(cnt:<ref>) — 애플 오퍼는 신규·만료 사용자만 쓸 수 있어 그 이상은 의미가 없다.
 *   · 하루 상한: 전체 적립 하루(ET) 25건(day:<날짜>) — 풀이 한꺼번에 새지 않게.
 *   · 풀: 애플 일회용은 전용 풀(promo:inv:pool:ios), 안드 Play 번호는 친구용 풀(promo:play:pool)을 «남은 수가 60 넘을 때만» 나눠 쓴다(친구 쿠폰이 먼저).
 * 저장소는 Upstash 직접(원자 연산 SPOP·INCR·SET NX 가 필요 — 쿠폰 배정과 같은 이유). 접두사 promo: 는 redisClient 에서 Upstash 전용으로 등록돼 있다.
 *   운영은 promo:inv:*, 미리보기·로컬은 promo:pv:inv:* — 시험 풀이 진짜 번호를 건드리지 않게.
 * 개인정보: IP 원문은 저장하지 않는다 — 서버 비밀값을 열쇠로 한 HMAC 앞 24자(되돌릴 수 없음)만, 72시간(터치)·30일(IP 칸) 뒤 사라진다. 이름·연락처와 연결하지 않는다.
 */
import { androidCouponLive, couponKeys } from '@/lib/marketing/coupon';
import { normalizeGiftRef } from '@/lib/gift/gift';
import { inviteRefOf, normalizeInviteKey } from './identity';
import { isInviteFrom } from './kinds';

export type Os = 'ios' | 'android';
export const isOs = (x: unknown): x is Os => x === 'ios' || x === 'android';

// ── 상수 ────────────────────────────────────────────────────────────────────
export const TOUCH_TTL_SEC = 72 * 3600;
export const LOOSE_CREDIT_MAX_AGE_MS = 30 * 60_000;
export const IP_CREDIT_TTL_SEC = 30 * 24 * 3600;
export const ARRIVE_TTL_SEC = 400 * 24 * 3600;
export const INVITER_LIFETIME_CAP = 3;
export const DAILY_CREDIT_CAP = 25;
/** 안드 초대자 보상은 친구용 Play 풀이 이 수 «이하»로 줄면 멈춘다(친구 쿠폰이 먼저) */
export const ANDROID_REWARD_POOL_RESERVE = 60;

const DAY_TTL = 3 * 24 * 3600;
const LONG_TTL = 400 * 24 * 3600;

/** 키 — 운영 promo:inv:* · 그 밖 promo:pv:inv:* */
export function inviteKeys(vercelEnv: string | undefined = process.env.VERCEL_ENV) {
  const p = vercelEnv === 'production' ? 'promo:inv' : 'promo:pv:inv';
  return {
    touch: (os: Os, ipHash: string) => `${p}:t:${os}:${ipHash}`,
    touchLoose: (os: Os, looseHash: string) => `${p}:tl:${os}:${looseHash}`,   // 같은 /24(v6 /48)에서 «가장 최근 터치» — 정확한 IP 가 안 맞을 때(이동통신 CGNAT)의 보조 칸
    looseRefs: (looseHash: string) => `${p}:tlrefs:${looseHash}`,
    arrived: (selfRef: string) => `${p}:arr:${selfRef}`,
    ipCredit: (ipHash: string) => `${p}:ipc:${ipHash}`,
    day: (day: string) => `${p}:day:${day}`,
    cnt: (ref: string) => `${p}:cnt:${ref}`,        // 평생 적립 수(상한)
    credit: (ref: string) => `${p}:cr:${ref}`,      // 아직 번호로 안 바꾼 크레딧
    friends: (ref: string) => `${p}:fr:${ref}`,     // 매칭된 친구 수(표시용)
    box: (ref: string) => `${p}:box:${ref}`,        // HASH 번호 → {os, at}
    poolIos: `${p}:pool:ios`,                       // SET 애플 일회용(보상 전용)
    poolIosBad: `${p}:pool:ios:bad`,
  };
}

// ── 저장소 틈 — 시험은 메모리 가짜로, 운영은 Upstash REST ─────────────────────────
export interface InviteStore {
  get(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  /** SET NX EX — 새로 썼으면 true */
  setNx(key: string, value: string, ttlSec: number): Promise<boolean>;
  /** INCR + EXPIRE */
  incr(key: string, ttlSec: number): Promise<number>;
  decr(key: string): Promise<number>;
  spop(key: string): Promise<string | null>;
  sadd(key: string, member: string): Promise<unknown>;
  scard(key: string): Promise<number>;
  /** keepTtl이면 첫 기록의 만료를 유지한다(선물함). */
  hset(key: string, field: string, value: string, ttlSec: number, keepTtl?: boolean): Promise<void>;
  /** 필드 기록·필드 만료·키 만료를 한 트랜잭션으로 적용한다(대역별 ref). */
  hsetExpiring(key: string, field: string, value: string, ttlSec: number): Promise<void>;
  hexists(key: string, field: string): Promise<boolean>;
  hdel(key: string, field: string): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
}

// ── 사람·출처 판정은 쿠폰 배정과 같은 함수를 쓴다(lib/marketing/couponClaim) — 여기는 «터치 기록 대상»만 정한다 ──

export interface TouchInput { ref: unknown; from: string | null; os: 'ios' | 'android' | 'desktop'; ipHash: string | null; /** 앞 3칸 해시(있으면 보조 칸에도 적는다) */ looseHash?: string | null; human: boolean; now?: number; vercelEnv?: string }

/** 터치를 적을지 — 초대 태그 + 형식 통과 ref + 폰(아이폰·안드) + 사람 + IP 가 있을 때만. 순수 판정(쓰기 없음). */
export function touchPlan(i: TouchInput): { ref: string; os: Os; ipHash: string; from: string } | null {
  if (!i.human || !i.ipHash || !isOs(i.os) || !isInviteFrom(i.from)) return null;
  const ref = normalizeGiftRef(i.ref);
  if (!ref) return null;
  return { ref, os: i.os, ipHash: i.ipHash, from: String(i.from) };
}

/** 필드 만료는 저장소가 맡는다. 읽은 뒤 HDEL하면 동시에 갱신된 ref까지 지울 수 있다. */
async function recentLooseRefs(store: InviteStore, key: string, now: number): Promise<Set<string>> {
  const refs = new Set<string>();
  for (const [field, timestamp] of Object.entries(await store.hgetall(key))) {
    const ref = normalizeGiftRef(field);
    const age = now - Number(timestamp);
    if (ref && Number.isFinite(age) && age >= 0 && age < TOUCH_TTL_SEC * 1000) refs.add(ref);
  }
  return refs;
}

/** ① 터치 기록 — 같은 IP·기기 종류의 이전 터치는 덮어쓴다(가장 최근 링크가 이긴다). 실패는 호출자가 삼킨다. */
export async function recordTouch(store: InviteStore, i: TouchInput): Promise<boolean> {
  const plan = touchPlan(i);
  if (!plan) return false;
  const k = inviteKeys(i.vercelEnv);
  const at = i.now ?? Date.now();
  const val = JSON.stringify({ r: plan.ref, f: plan.from, at });
  await store.set(k.touch(plan.os, plan.ipHash), val, TOUCH_TTL_SEC);
  if (i.looseHash) {
    // ref당 한 필드만 갱신한다. 다른 ref의 72시간 만료는 연장하지 않는다.
    await store.hsetExpiring(k.looseRefs(i.looseHash), plan.ref, String(at), TOUCH_TTL_SEC);
    await store.set(k.touchLoose(plan.os, i.looseHash), val, TOUCH_TTL_SEC);
  }
  return true;
}

// ── ② 도착 ──────────────────────────────────────────────────────────────────
export type ArriveOutcome =
  | { matched: false; reason: 'bad' | 'again' | 'none' | 'self' }
  | { matched: true; credited: false; reason: 'ip' | 'inviter_cap' | 'day_cap' | 'loose_ambiguous'; from: string; inviterRef: string; loose?: boolean }
  | { matched: true; credited: true; from: string; inviterRef: string; loose?: boolean };

/** ET 날짜(YYYY-MM-DD) — 하루 상한·지표 칸의 기준(다른 집계와 같은 시계) */
export function etDay(now = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}

export async function arrive(store: InviteStore, i: { key: unknown; os: unknown; ipHash: string | null; /** 앞 3칸 해시 — 정확한 IP 터치가 없을 때만 보조로 찾는다(loose 매칭으로 따로 센다) */ looseHash?: string | null; now?: number; vercelEnv?: string }): Promise<ArriveOutcome> {
  const key = normalizeInviteKey(i.key);
  if (!key || !isOs(i.os) || !i.ipHash) return { matched: false, reason: 'bad' };
  const now = i.now ?? Date.now();
  const k = inviteKeys(i.vercelEnv);
  const selfRef = inviteRefOf(key);

  // 같은 기기(열쇠)는 평생 한 번만 도착으로 본다 — 매칭 여부와 상관없이 «첫 실행 호출»을 소모한다(재호출로 터치를 기다리지 못하게)
  if (!(await store.setNx(k.arrived(selfRef), String(now), ARRIVE_TTL_SEC))) return { matched: false, reason: 'again' };

  try {
    let raw = await store.get(k.touch(i.os, i.ipHash));
    let loose = false;
    if (!raw && i.looseHash) { raw = await store.get(k.touchLoose(i.os, i.looseHash)); loose = !!raw; }
    let touch: { r?: unknown; f?: unknown; at?: unknown } | null = null;
    try { touch = raw ? JSON.parse(raw) : null; } catch { touch = null; }
    const inviterRef = normalizeGiftRef(touch?.r);
    const from = typeof touch?.f === 'string' && isInviteFrom(touch.f) ? touch.f : null;
    const at = typeof touch?.at === 'number' ? touch.at : 0;
    if (!inviterRef || !from || now - at > TOUCH_TTL_SEC * 1000) return { matched: false, reason: 'none' };

    if (loose) {
      const recent = await recentLooseRefs(store, k.looseRefs(i.looseHash!), now);
      // 이전 배포의 마지막 터치만 남은 경우도 ref 유일성을 증명할 수 없으므로 적립하지 않는다.
      if (recent.size !== 1 || !recent.has(inviterRef) || now < at || now - at > LOOSE_CREDIT_MAX_AGE_MS) {
        return { matched: true, credited: false, reason: 'loose_ambiguous', from, inviterRef, loose: true };
      }
    }

    if (inviterRef === selfRef) return { matched: false, reason: 'self' };

    // 이하 «보상 적립» 관문 — 하나라도 막히면 매칭은 센다(지표) · 적립은 안 한다
    if (!(await store.setNx(k.ipCredit(i.ipHash), inviterRef, IP_CREDIT_TTL_SEC))) {
      return { matched: true, credited: false, reason: 'ip', from, inviterRef, ...(loose ? { loose } : {}) };
    }
    const cnt = await store.incr(k.cnt(inviterRef), LONG_TTL);
    if (cnt > INVITER_LIFETIME_CAP) {
      await store.decr(k.cnt(inviterRef));
      return { matched: true, credited: false, reason: 'inviter_cap', from, inviterRef, ...(loose ? { loose } : {}) };
    }
    const dayKey = k.day(etDay(now));
    const day = await store.incr(dayKey, DAY_TTL);
    if (day > DAILY_CREDIT_CAP) {
      await store.decr(dayKey);
      await store.decr(k.cnt(inviterRef));
      return { matched: true, credited: false, reason: 'day_cap', from, inviterRef, ...(loose ? { loose } : {}) };
    }
    await store.incr(k.credit(inviterRef), LONG_TTL);
    // 적립 이후의 지표 실패는 이미 끝난 적립을 재시도하게 해서는 안 된다.
    try { await store.incr(k.friends(inviterRef), LONG_TTL); } catch { /* 도착 표식·크레딧 유지 */ }
    return { matched: true, credited: true, from, inviterRef, ...(loose ? { loose } : {}) };
  } catch (error) {
    await store.del(k.arrived(selfRef));
    throw error;
  }
}

// ── ③ 선물함 ────────────────────────────────────────────────────────────────
export interface BoxItem { code: string; os: Os; at: number }
export interface InboxResult {
  /** 지금까지 받은 번호(오래된 순) */
  items: BoxItem[];
  /** 이번 조회에서 새로 뽑힌 번호 수 */
  minted: number;
  /** 아직 번호가 안 된 크레딧(풀이 비었거나 안드 예비분을 지키는 중) */
  waiting: number;
  /** 매칭된 친구 수 */
  friends: number;
}

export const APPLE_ONE_TIME_RE = /^[A-Z0-9]{8,24}$/;
export const PLAY_ONE_TIME_RE = /^[A-Z0-9]{23}$/;

export async function inbox(store: InviteStore, i: { key: unknown; os: unknown; /** false 면 번호를 새로 뽑지 않는다(INVITE_REWARD≠1) — 이미 받은 번호만 */ mint?: boolean; now?: number; vercelEnv?: string }): Promise<InboxResult | null> {
  const key = normalizeInviteKey(i.key);
  if (!key || !isOs(i.os)) return null;
  const now = i.now ?? Date.now();
  const k = inviteKeys(i.vercelEnv);
  const ref = inviteRefOf(key);
  const play = couponKeys(i.vercelEnv).pool;

  // 이전 배포에서 TTL이 연장된 기록도 읽기·추가 전에 항목 시각 기준으로 정리한다.
  const existing = await store.hgetall(k.box(ref));
  for (const [code, value] of Object.entries(existing)) {
    let at: unknown;
    try { at = JSON.parse(value)?.at; } catch { continue; }
    if (typeof at === 'number' && now - at >= LONG_TTL * 1000) await store.hdel(k.box(ref), code);
  }

  let minted = 0;
  const pending = i.mint === false ? 0 : Number(await store.get(k.credit(ref))) || 0;
  for (let n = 0; n < Math.min(pending, INVITER_LIFETIME_CAP); n++) {
    // 크레딧 1건을 «먼저» 가져간다 — 음수가 되면 동시 조회가 먼저 가져간 것이므로 되돌린다
    const left = await store.decr(k.credit(ref));
    if (left < 0) { await store.incr(k.credit(ref), LONG_TTL); break; }
    let code: string | null = null;
    const pool = i.os === 'ios' ? k.poolIos : play;
    try {
      if (i.os === 'ios' || androidCouponLive(now, true)) {
        for (let t = 0; t < 3 && code === null; t++) {
          if (i.os === 'android' && await store.scard(pool) <= ANDROID_REWARD_POOL_RESERVE) break;
          code = await store.spop(pool);
          if (code === null) break;
          // 추출 전 수량은 다른 선물함도 읽을 수 있다. 추출 뒤 예비분을 침범했으면 원래 풀로 복구한다.
          if (i.os === 'android' && await store.scard(pool) < ANDROID_REWARD_POOL_RESERVE) {
            await store.sadd(pool, code); code = null; break;
          }
          if (!(i.os === 'ios' ? APPLE_ONE_TIME_RE : PLAY_ONE_TIME_RE).test(code)) {
            await store.sadd(`${pool}:bad`, code); code = null;
          }
        }
      }
      if (code !== null) {
        await store.hset(k.box(ref), code, JSON.stringify({ os: i.os, at: now }), LONG_TTL, true);
        minted++;
      }
    } catch (error) {
      if (code !== null) {
        let delivered: boolean;
        try { delivered = await store.hexists(k.box(ref), code); }
        catch {
          // 저장 응답과 확인 응답을 모두 잃었으면 중복 지급보다 격리를 택한다.
          // 크레딧도 소모 상태로 둔다. limbo는 운영자가 선물함과 대조한 뒤 해소한다.
          await store.sadd(`${pool}:limbo`, code);
          throw error;
        }
        if (delivered) { minted++; continue; }
      }
      // 선물함에 없는 것이 확인된 번호만 풀에 반환한다.
      try { if (code !== null) await store.sadd(pool, code); }
      finally { await store.incr(k.credit(ref), LONG_TTL); }
      throw error;
    }
    if (code === null) { await store.incr(k.credit(ref), LONG_TTL); break; }
  }

  const rawBox = await store.hgetall(k.box(ref));
  const items: BoxItem[] = [];
  for (const [code, v] of Object.entries(rawBox || {})) {
    try {
      const j = JSON.parse(v) as { os?: unknown; at?: unknown };
      if (isOs(j.os) && typeof j.at === 'number') items.push({ code, os: j.os, at: j.at });
    } catch { /* 깨진 칸은 건너뛴다 */ }
  }
  items.sort((a, b) => a.at - b.at);
  const waiting = Math.max(0, Number(await store.get(k.credit(ref))) || 0);
  const friends = Math.max(0, Number(await store.get(k.friends(ref))) || 0);
  return { items, minted, waiting, friends };
}

// ── 설정(켜기·끄기) ──────────────────────────────────────────────────────────
export interface InviteServerConfig {
  /** 공유 단추(앱 안 세 곳)를 그릴지 — 끄기 스위치 INVITE_SHARE_OFF=1 */
  share: boolean;
  /** 초대자 보상(선물함)을 켤지 — INVITE_REWARD=1 */
  rewards: boolean;
}
export function inviteConfig(env: Record<string, string | undefined> = process.env): InviteServerConfig {
  return {
    share: (env.INVITE_SHARE_OFF || '').trim() !== '1',
    rewards: (env.INVITE_REWARD || '').trim() === '1',
  };
}
