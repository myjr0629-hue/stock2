/**
 * 추천 보상 저장소 — Upstash REST 직접(원자 연산이 필요해서 EC2 래퍼가 아니다 · lib/marketing/couponClaim.upstashCouponStore 와 같은 방식). 서버 전용.
 *   · 설정(URL·토큰)이 없으면 null — 호출한 라우트는 «조용히 건너뛴다»(터치) 또는 503(도착·선물함).
 *   · automaticDeserialization 끔: 번호(대문자·숫자)가 숫자로 바뀌지 않게.
 *   · retry 끔: SPOP·INCR·DECR 은 멱등이 아니다 — 재시도로 두 장이 빠지지 않게.
 *   · 시간 상한은 «함수형» 신호(명령마다 새 3초) — 신호 «객체»가 끊기면 @upstash/redis 가 예외 대신 «Aborted» 를 정상 응답처럼 돌려준다(2026-10-05 실측).
 */
import { Redis } from '@upstash/redis';
import type { InviteStore } from './engine';

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
    hset: async (key, field, value, ttlSec) => {
      await r.pipeline().hset(key, { [field]: value }).expire(key, ttlSec).exec();
    },
    hgetall: async (key) => {
      const o = await r.hgetall<Record<string, string>>(key);
      const out: Record<string, string> = {};
      for (const [f, v] of Object.entries(o || {})) out[f] = String(v);
      return out;
    },
  };
}
