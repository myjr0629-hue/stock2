/**
 * 크레딧 우선 사다리의 저장소 — 월 원장·서킷 브레이커·호출 기록·입력 캡처.
 *
 * 왜 Upstash 직접인가: 원장은 «원자 증가»(INCRBYFLOAT)가 필요하다. EC2 래퍼(getFromCache/setInCache)에는 증가 연산이 없다.
 * 선례: lib/marketing/couponClaim.ts(promo:*) 도 같은 이유로 Upstash REST 를 직접 쓴다. 키 접두사는 `llm:` 로 통일한다.
 *
 * 이 저장소가 느리거나 죽어도 AI 호출은 절대 영향을 받지 않는다 — 모든 연산은 짧은 시간 제한 + 예외 삼킴.
 * (원장을 못 읽으면 «한도 미만»으로 보고 ① 을 쓴다. 이중 안전장치 = 콘솔의 월 지출 한도 $200.)
 */
import { Redis } from '@upstash/redis';

export interface LlmStore {
    get(key: string): Promise<string | null>;
    setEx(key: string, value: string, ttlSec: number): Promise<void>;
    /** INCRBYFLOAT + (키가 새로 생겼을 때를 위해) EXPIRE */
    incrByFloat(key: string, delta: number, ttlSec: number): Promise<number | null>;
    /** RPUSH + EXPIRE */
    rpush(key: string, value: string, ttlSec: number): Promise<void>;
    lrange(key: string, start: number, stop: number): Promise<string[]>;
    /** LPUSH + LTRIM(0, max-1) + EXPIRE */
    lpushTrim(key: string, value: string, max: number, ttlSec: number): Promise<void>;
    del(key: string): Promise<void>;
}

const OP_TIMEOUT_MS = 2500;

function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
    return new Promise<T>((resolve) => {
        const t = setTimeout(() => resolve(fallback), OP_TIMEOUT_MS);
        p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
    });
}

let _redis: Redis | null | undefined;
function redis(): Redis | null {
    if (_redis !== undefined) return _redis;
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) { _redis = null; return null; }
    // automaticDeserialization 끔 — 문자열은 문자열로(숫자·JSON 이 몰래 바뀌지 않게)
    _redis = new Redis({ url, token, automaticDeserialization: false });
    return _redis;
}

export const upstashStore: LlmStore = {
    async get(key) {
        const r = redis(); if (!r) return null;
        return withTimeout(r.get<string>(key).then((v) => (v == null ? null : String(v))), null);
    },
    async setEx(key, value, ttlSec) {
        const r = redis(); if (!r) return;
        await withTimeout(r.set(key, value, { ex: Math.max(1, Math.ceil(ttlSec)) }).then(() => undefined), undefined);
    },
    async incrByFloat(key, delta, ttlSec) {
        const r = redis(); if (!r) return null;
        return withTimeout((async () => {
            const p = r.pipeline();
            p.incrbyfloat(key, delta);
            p.expire(key, Math.max(1, Math.ceil(ttlSec)));
            const res = await p.exec<[number | string, number]>();
            const n = Number(res?.[0]);
            return Number.isFinite(n) ? n : null;
        })(), null);
    },
    async rpush(key, value, ttlSec) {
        const r = redis(); if (!r) return;
        await withTimeout((async () => {
            const p = r.pipeline();
            p.rpush(key, value);
            p.expire(key, Math.max(1, Math.ceil(ttlSec)));
            await p.exec();
        })(), undefined);
    },
    async lrange(key, start, stop) {
        const r = redis(); if (!r) return [];
        return withTimeout(r.lrange<string>(key, start, stop).then((a) => (a || []).map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))), [] as string[]);
    },
    async lpushTrim(key, value, max, ttlSec) {
        const r = redis(); if (!r) return;
        await withTimeout((async () => {
            const p = r.pipeline();
            p.lpush(key, value);
            p.ltrim(key, 0, Math.max(0, max - 1));
            p.expire(key, Math.max(1, Math.ceil(ttlSec)));
            await p.exec();
        })(), undefined);
    },
    async del(key) {
        const r = redis(); if (!r) return;
        await withTimeout(r.del(key).then(() => undefined), undefined);
    },
};

/** 시험용 메모리 저장소 */
export function memoryStore(): LlmStore & { data: Map<string, any> } {
    const data = new Map<string, any>();
    return {
        data,
        async get(k) { const v = data.get(k); return typeof v === 'string' ? v : v == null ? null : String(v); },
        async setEx(k, v) { data.set(k, v); },
        async incrByFloat(k, d) { const n = (Number(data.get(k)) || 0) + d; data.set(k, String(n)); return n; },
        async rpush(k, v) { const a = data.get(k) || []; a.push(v); data.set(k, a); },
        async lrange(k) { return [...(data.get(k) || [])]; },
        async lpushTrim(k, v, max) { const a = data.get(k) || []; a.unshift(v); data.set(k, a.slice(0, max)); },
        async del(k) { data.delete(k); },
    };
}
