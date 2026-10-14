/**
 * 추천 보상 저장소 — Upstash REST 직접(원자 연산이 필요해서 EC2 래퍼가 아니다 · lib/marketing/couponClaim.upstashCouponStore 와 같은 방식). 서버 전용.
 *   · 설정(URL·토큰)이 없으면 null — 호출한 라우트는 «조용히 건너뛴다»(터치) 또는 503(도착·선물함).
 *   · automaticDeserialization 끔: 번호(대문자·숫자)가 숫자로 바뀌지 않게.
 *   · retry 끔: SPOP·INCR·DECR 은 멱등이 아니다 — 재시도로 두 장이 빠지지 않게.
 *   · 시간 상한은 «함수형» 신호(명령마다 새 3초) — 신호 «객체»가 끊기면 @upstash/redis 가 예외 대신 «Aborted» 를 정상 응답처럼 돌려준다(2026-10-05 실측).
 */
import { Redis } from '@upstash/redis';
import type { InviteStore } from './engine';

/**
 * HGETALL 응답 정리 — automaticDeserialization 을 끄면 @upstash/redis 가 «필드·값 번갈아 나열한 배열»을 객체로 바꿔 주지 않는다
 * (2026-10-14 운영 e2e 실측: 선물함 번호 칸이 «0 → 번호, 1 → JSON» 두 칸으로 읽혀 번호가 «1»로 보였다). 배열·객체 둘 다 객체로. 순수 함수.
 */
export function hashFromRaw(o: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(o)) {
    for (let i = 0; i + 1 < o.length; i += 2) out[String(o[i])] = String(o[i + 1]);
  } else if (o && typeof o === 'object') {
    for (const [f, v] of Object.entries(o as Record<string, unknown>)) out[f] = String(v);
  }
  return out;
}

export function upstashInviteStore(timeoutMs = 3000): InviteStore | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const r = new Redis({
    url, token,
    automaticDeserialization: false,
    enableTelemetry: false,
    retry: false,
    signal: () => AbortSignal.timeout(timeoutMs),
  });
  const num = (v: unknown) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error('invite store: not a number');
    return n;
  };
  return {
    get: async (key) => {
      const v = await r.get<string>(key);
      return v == null ? null : String(v);
    },
    del: async (key) => { await r.del(key); },
    set: async (key, value, ttlSec) => { await r.set(key, value, { ex: ttlSec }); },
    setNx: async (key, value, ttlSec) => (await r.set(key, value, { nx: true, ex: ttlSec })) === 'OK',
    incr: async (key, ttlSec) => {
      const [n] = await r.pipeline().incr(key).expire(key, ttlSec).exec<[number, number]>();
      return num(n);
    },
    decr: async (key) => num(await r.decr(key)),
    spop: async (key) => {
      const v = await r.spop<string>(key);
      return v == null ? null : String(v);
    },
    sadd: (key, member) => r.sadd(key, member),
    scard: async (key) => num(await r.scard(key)),
    hset: async (key, field, value, ttlSec, keepTtl = false) => {
      // 선물함은 첫 기록부터 최대 400일. 새 번호가 들어와도 기존 만료를 연장하지 않는다.
      const p = r.pipeline().hset(key, { [field]: value });
      if (keepTtl) p.expire(key, ttlSec, 'NX'); else p.expire(key, ttlSec);
      await p.exec();
    },
    hsetExpiring: async (key, field, value, ttlSec) => {
      // pipeline은 명령 사이에 다른 요청이 끼어들 수 있으므로 multi로 필드 TTL까지 묶는다.
      // @upstash/redis 1.36.2: https://upstash.com/docs/redis/sdks/ts/commands/hash/hexpire
      await r.multi().hset(key, { [field]: value }).hexpire(key, field, ttlSec).expire(key, ttlSec).exec();
    },
    hexists: async (key, field) => {
      const exists = await r.hexists(key, field);
      if (exists !== 0 && exists !== 1) throw new Error('invite store: invalid existence response');
      return exists === 1;
    },
    hdel: async (key, field) => { await r.hdel(key, field); },
    hgetall: async (key) => hashFromRaw(await r.hgetall<Record<string, unknown>>(key)),
  };
}
