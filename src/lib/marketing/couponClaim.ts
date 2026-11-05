/**
 * 안드로이드 개인 쿠폰(Play 일회용 번호) 배정 — 2026-10-05 (브랜치 feat/coupon-ux)
 *
 * 규칙(운영 세션 지시):
 *   · 같은 IP 해시는 24시간 안에 «같은 번호»를 다시 준다(번호를 여러 장 받아 가지 못하게).
 *   · 하루(KST) 상한 60장 — 넘으면 «오늘 몫이 다 나갔다»를 사실대로(다음 배정 시각과 함께).
 *   · 풀이 비면 «소진»이라고 정직하게.
 * 원자성: EC2 래퍼(get/set)로는 «한 번호를 한 사람에게만»을 보장할 수 없다 → Upstash 직접(SPOP·INCR·SET NX).
 *   · SPOP 은 원자적이라 같은 번호가 두 사람에게 갈 수 없다.
 *   · 같은 IP 의 동시 요청: 둘 다 SPOP 해도 SET NX 에서 한쪽만 이긴다 → 진 쪽은 번호를 풀에 돌려놓고(SADD) 이긴 쪽 번호를 준다.
 *   · 하루 상한: INCR 뒤 넘었으면 DECR(보정) — 실패 경로(소진·경합)도 같은 보정.
 * 저장소 의존은 아래 CouponStore 하나로 묶었다 — 시험은 메모리 가짜로, 운영은 Upstash REST(automaticDeserialization 끔 — 번호가 숫자로 바뀌지 않게).
 */
import crypto from 'crypto';
import { Redis } from '@upstash/redis';
import { couponKeys, kstDay, nextKstMidnight, PLAY_ONE_TIME_RE } from './coupon';
import { UA_BOT_RE, isPreviewBot, clickDevice, type HeaderLike } from './clickHuman';

/** IP 원문은 저장하지 않는다 — 서버 비밀값을 열쇠로 한 HMAC 앞 24자(되돌릴 수 없음). */
export function ipHash(ip: string, secret: string): string {
  return crypto.createHmac('sha256', secret || 'signum-coupon-v1').update(`coupon|${ip.trim().toLowerCase()}`).digest('hex').slice(0, 24);
}

// ── 사람·출처 판정(순수 함수, tests/coupon.test.ts 가 고정한다) ─────────────────
export type DenyReason = 'bot' | 'device' | 'origin' | 'noip';

/**
 * 배정 요청을 받아도 되나 — 하나라도 걸리면 번호를 주지 않는다.
 *   bot    : 수집기 UA·미리보기 봇·Mozilla 없음·Accept-Language 없음(clickHuman 과 같은 표지)
 *   device : 안드로이드가 아님(아이폰·PC 는 이 번호를 쓸 수 없다 — Play 번호)
 *   origin : 우리 쿠폰 화면의 fetch 가 아님 — 전용 헤더(x-coupon: 1)·JSON·Sec-Fetch-Site=same-origin
 *            (Sec-Fetch 가 없는 옛 브라우저는 Origin 이 같은 호스트여야) · Sec-Fetch-Mode 는 cors/same-origin(폼 이동·비콘 거절)
 */
export function claimDenyReason(h: HeaderLike, host: string | null): DenyReason | null {
  const ua = h.get('user-agent') || '';
  if (!/Mozilla\//.test(ua) || UA_BOT_RE.test(ua) || isPreviewBot(ua)) return 'bot';
  if (!(h.get('accept-language') || '').trim()) return 'bot';
  if (clickDevice(ua) !== 'android') return 'device';
  if (h.get('x-coupon') !== '1') return 'origin';
  if (!/application\/json/i.test(h.get('content-type') || '')) return 'origin';
  const site = (h.get('sec-fetch-site') || '').toLowerCase();
  if (site) {
    if (site !== 'same-origin') return 'origin';
  } else {
    const o = h.get('origin');
    try { if (!o || !host || new URL(o).host !== host) return 'origin'; } catch { return 'origin'; }
  }
  const mode = (h.get('sec-fetch-mode') || '').toLowerCase();
  if (mode && mode !== 'cors' && mode !== 'same-origin') return 'origin';
  return null;
}

/**
 * 방문자 IP — Vercel 이 덮어쓰는 헤더만 믿는다(클라이언트가 위조할 수 없다). 못 찾으면 null(배정 거절 — 모두가 한 해시를 나눠 쓰지 않게).
 * 미리보기·로컬에서만 시험용 x-coupon-test-ip 를 받는다(하루 상한·같은 IP 재요청 시험) — 운영에서는 절대 듣지 않는다.
 */
export function clientIp(h: HeaderLike, vercelEnv: string | undefined = process.env.VERCEL_ENV): string | null {
  if (vercelEnv !== 'production') {
    const t = (h.get('x-coupon-test-ip') || '').trim();
    if (/^[A-Za-z0-9.:_-]{1,64}$/.test(t)) return t;
  }
  const v = (h.get('x-vercel-forwarded-for') || h.get('x-real-ip') || (h.get('x-forwarded-for') || '').split(',')[0] || '').trim();
  return v || null;
}

export interface CouponStore {
  get(key: string): Promise<string | null>;
  /** INCR + EXPIRE(초) 를 한 번에 — 새 하루 키가 영원히 남지 않게 */
  incrEx(key: string, seconds: number): Promise<number>;
  decr(key: string): Promise<number>;
  spop(key: string): Promise<string | null>;
  sadd(key: string, member: string): Promise<unknown>;
  /** SET key value NX EX seconds — 새로 썼으면 true */
  setNxEx(key: string, value: string, seconds: number): Promise<boolean>;
  /** HSET + EXPIRE(초) */
  hsetEx(key: string, field: string, value: string, seconds: number): Promise<unknown>;
}

export type ClaimOutcome =
  | { kind: 'new'; code: string }
  | { kind: 'again'; code: string }
  | { kind: 'cap'; resetAt: number }
  | { kind: 'empty' };

const IP_TTL = 24 * 3600;
const DAY_TTL = 3 * 24 * 3600;
const CLAIMS_TTL = 90 * 24 * 3600;

export async function claimPlayCoupon(store: CouponStore, opts: {
  ipHash: string;
  from: string | null;
  /** 링크의 애플 맞춤 코드(출처 기록용) */
  appleCode: string | null;
  cap: number;
  now?: number;
  vercelEnv?: string;
}): Promise<ClaimOutcome> {
  const now = opts.now ?? Date.now();
  const k = couponKeys(opts.vercelEnv);
  const ipKey = k.ip(opts.ipHash);

  const prev = await store.get(ipKey);
  if (prev && PLAY_ONE_TIME_RE.test(prev)) return { kind: 'again', code: prev };

  const dayKey = k.day(kstDay(now));
  const n = await store.incrEx(dayKey, DAY_TTL);
  if (n > opts.cap) {
    await store.decr(dayKey);
    return { kind: 'cap', resetAt: nextKstMidnight(now) };
  }

  // 형식이 틀린 값(있으면 안 되지만)은 내주지 않고 따로 치운다 — 최대 3번
  let code: string | null = null;
  for (let i = 0; i < 3 && code === null; i++) {
    const v = await store.spop(k.pool);
    if (v === null) break;
    if (PLAY_ONE_TIME_RE.test(v)) code = v;
    else await store.sadd(`${k.pool}:bad`, String(v));
  }
  if (code === null) {
    await store.decr(dayKey);
    return { kind: 'empty' };
  }

  if (!(await store.setNxEx(ipKey, code, IP_TTL))) {
    // 같은 IP 의 다른 요청이 먼저 잡았다 — 이 번호는 풀로 돌려놓고, 그쪽 번호를 같이 쓴다
    await store.sadd(k.pool, code);
    await store.decr(dayKey);
    const other = await store.get(ipKey);
    if (other && PLAY_ONE_TIME_RE.test(other)) return { kind: 'again', code: other };
    return { kind: 'empty' };
  }

  await store.hsetEx(k.claims, code, JSON.stringify({
    from: opts.from || null,
    at: new Date(now).toISOString(),
    ip: opts.ipHash,
    ac: opts.appleCode || null,
  }), CLAIMS_TTL);
  return { kind: 'new', code };
}

/**
 * 운영 저장소 — Upstash REST. 설정이 없으면 null(배정 API 는 503).
 * ⚠ 시간 상한은 «함수형» 신호로 준다(명령마다 새 3초 신호). @upstash/redis 1.36 은 신호 «객체»가 끊기면 예외 대신
 *   {result: 중단 사유} 를 «정상 응답»처럼 돌려준다 — SPOP 결과가 «Aborted» 문자열이 될 수 있다. 함수형이면 예외로 던진다.
 */
export function upstashCouponStore(timeoutMs = 3000): CouponStore | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const r = new Redis({
    url, token,
    automaticDeserialization: false,   // 번호(대문자·숫자 23자)를 JSON 으로 해석하지 않는다
    enableTelemetry: false,
    retry: false,                      // SPOP·INCR 는 멱등이 아니다 — 재시도로 두 장이 빠지지 않게
    signal: () => AbortSignal.timeout(timeoutMs),
  });
  const num = (v: unknown) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error('coupon store: not a number');
    return n;
  };
  return {
    get: async (key) => {
      const v = await r.get<string>(key);
      return v == null ? null : String(v);
    },
    incrEx: async (key, seconds) => {
      const [n] = await r.pipeline().incr(key).expire(key, seconds).exec<[number, number]>();
      return num(n);
    },
    decr: async (key) => num(await r.decr(key)),
    spop: async (key) => {
      const v = await r.spop<string>(key);
      return v == null ? null : String(v);
    },
    sadd: (key, member) => r.sadd(key, member),
    setNxEx: async (key, value, seconds) => (await r.set(key, value, { nx: true, ex: seconds })) === 'OK',
    hsetEx: async (key, field, value, seconds) => {
      await r.pipeline().hset(key, { [field]: value }).expire(key, seconds).exec();
    },
  };
}

// ── ★2026-11-05 /app 쿠폰 화면 «애플 코드와 분리»(feat/android-coupon-decouple-1105) ─────────────
/** 쿠폰을 받은 브라우저 표식(배정 API 가 남긴다) — 풀이 비어도 이미 받은 사람은 쿠폰 화면(기기 저장 번호·24시간 재표시)을 다시 본다. 값 없음·식별자 없음. */
export const COUPON_CLAIMED_COOKIE = 'sg_cpn';
export const COUPON_CLAIMED_MAX_AGE = 40 * 24 * 3600;   // 쿠폰 화면의 기기 저장 번호 보존(40일)과 같다
/** IP 해시 열쇠 — 배정 API 와 /app 이 같은 값을 쓴다 */
export const couponIpSecret = (): string => process.env.COUPON_IP_SALT || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

/**
 * 애플 코드가 «살아 있지 않은» /app 링크(코드 없음·끝난 코드)에서 안드로이드 쿠폰 화면을 보여 줄까 — 배정은 하지 않는다(읽기만).
 *   · 받은 표식 쿠키가 있으면 true(저장소 조회 없음) — 풀이 비어도 이미 받은 사람의 재열람은 그대로
 *   · 아니면 Upstash 한 번(파이프라인): 풀 잔량 > 0 이거나 이 IP 가 24시간 안에 받은 번호가 있으면 true
 *   · 설정 없음·시간 초과·오류 = false(호출자는 예전 동작 — Play 302·앱 안 브라우저 안내 화면)
 */
export async function playCouponScreenEligible(opts: { claimed: boolean; ip: string | null; timeoutMs?: number; vercelEnv?: string }): Promise<boolean> {
  if (opts.claimed) return true;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  try {
    const timeoutMs = opts.timeoutMs ?? 1000;
    const r = new Redis({ url, token, automaticDeserialization: false, enableTelemetry: false, retry: false, signal: () => AbortSignal.timeout(timeoutMs) });
    const k = couponKeys(opts.vercelEnv);
    const p = r.pipeline().scard(k.pool);
    if (opts.ip) p.exists(k.ip(ipHash(opts.ip, couponIpSecret())));
    const [count, mine] = await p.exec<[number, number?]>();
    const n = Number(count), m = Number(mine ?? 0);
    if (!Number.isSafeInteger(n) || !Number.isSafeInteger(m)) return false;
    return n > 0 || m > 0;
  } catch { return false; }
}
