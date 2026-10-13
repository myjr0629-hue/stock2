// ============================================================================
// Intrinio 429 계측 + 사전 갱신 단일 실행 잠금 (2026-10-13)
// ----------------------------------------------------------------------------
// 왜 (10/13 긴급): 장 마감 직후 Intrinio 429 가 /api/intel/fast 등 화면 경로에서 군집으로 났고(10/12 20:05Z 226건 · 20:20Z 241건 · 21:05Z 177건 · 23:15Z 194건),
//   사전 갱신 크론(structure-warm)이 같은 벤더 한도를 나눠 쓴다. 로그 줄 수로는 «누가 맞았는가»를 가릴 수 없었다 — 호출한 쪽이 429 를 조용히 삼키는 경로가 많다.
//   → 429 를 받는 순간 «사전 갱신 호출인가(w) 그 밖(u: 화면 경로·다른 크론)인가»를 시간대별로 센다.
//   → 사전 갱신은 «직전 1분에 u 가 429 를 한 건이라도 받았으면» 즉시 멈춘다(사용자 요청 우선).
// 어떻게:
//   · note429 는 callIntrinio 의 429 분기에서만 불리고, 기다리지 않는다(메모리에 모았다가 250ms 뒤 한 번에 Upstash 로 — 던지지 않는다). 사용자 경로 지연 0.
//   · 키(Upstash 직접 — EC2 래퍼에는 증가 연산이 없다. llmStore·couponClaim 과 같은 이유):
//       i429:h:{YYYYMMDDHH UTC}  해시 {u:options, u:securities, u:other, w:…}  7일
//       i429:m:{epochMinute}     같은 모양                                   3시간
//       i429:last:{u|w}          마지막 429 시각(ms)                          10분 — 중단 판정용
//   · 잠금: SET NX EX — 실행이 겹치지 않는다. 잠금 저장소를 못 쓰면 «돌지 않는다»(fail closed).
// ============================================================================
import { Redis } from '@upstash/redis';

export type MeterClass = 'u' | 'w';

export interface MeterStore {
  /** HINCRBY + EXPIRE */
  hincrbyEx(key: string, field: string, by: number, ttlSec: number): Promise<void>;
  hgetall(key: string): Promise<Record<string, number>>;
  setEx(key: string, value: string, ttlSec: number): Promise<void>;
  get(key: string): Promise<string | null>;
  /** SET key value NX EX — 새로 썼으면 true. 저장소를 못 쓰면 false(fail closed) */
  setNxEx(key: string, value: string, ttlSec: number): Promise<boolean>;
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
  _redis = new Redis({ url, token, automaticDeserialization: false });
  return _redis;
}

export const upstashMeterStore: MeterStore = {
  async hincrbyEx(key, field, by, ttlSec) {
    const r = redis(); if (!r) return;
    await withTimeout((async () => { await r.pipeline().hincrby(key, field, by).expire(key, Math.max(1, Math.ceil(ttlSec))).exec(); })(), undefined);
  },
  async hgetall(key) {
    const r = redis(); if (!r) return {};
    return withTimeout((async () => {
      const h = await r.hgetall<Record<string, string>>(key);
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(h || {})) { const n = Number(v); if (Number.isFinite(n)) out[k] = n; }
      return out;
    })(), {} as Record<string, number>);
  },
  async setEx(key, value, ttlSec) {
    const r = redis(); if (!r) return;
    await withTimeout(r.set(key, value, { ex: Math.max(1, Math.ceil(ttlSec)) }).then(() => undefined), undefined);
  },
  async get(key) {
    const r = redis(); if (!r) return null;
    return withTimeout(r.get<string>(key).then((v) => (v == null ? null : String(v))), null);
  },
  async setNxEx(key, value, ttlSec) {
    const r = redis(); if (!r) return false;
    return withTimeout(r.set(key, value, { nx: true, ex: Math.max(1, Math.ceil(ttlSec)) }).then((x) => x === 'OK'), false);
  },
  async del(key) {
    const r = redis(); if (!r) return;
    await withTimeout(r.del(key).then(() => undefined), undefined);
  },
};

let store: MeterStore = upstashMeterStore;
/** 시험 전용 — 저장소를 바꾼다(되돌릴 땐 upstashMeterStore) */
export function __setMeterStore(s: MeterStore): void { store = s; }

export const hourKey = (ms: number) => `i429:h:${new Date(ms).toISOString().slice(0, 13).replace(/[-T]/g, '')}`;
export const minuteKey = (ms: number) => `i429:m:${Math.floor(ms / 60000)}`;
export const lastKey = (cls: MeterClass) => `i429:last:${cls}`;
export const HOUR_TTL_SEC = 7 * 24 * 3600;
export const MINUTE_TTL_SEC = 3 * 3600;
export const LAST_TTL_SEC = 600;
/** 사용자 경로 429 를 «방금»으로 보는 길이 — 사전 갱신은 이 안에 한 건이라도 있으면 멈춘다 */
export const USER_429_WINDOW_MS = 60_000;

/** Intrinio 경로를 큰 갈래로 — options(체인·그릭스) · securities(시세·일봉) · other */
export function categoryOf(path: string): 'options' | 'securities' | 'other' {
  const p = String(path || '').replace(/^\//, '');
  if (p.startsWith('options/')) return 'options';
  if (p.startsWith('securities/')) return 'securities';
  return 'other';
}

// ── 쓰기: 메모리에 모았다가 한 번에 ──
const pending = new Map<string, number>(); // `${key}\u0000${field}` → 건수
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const lastWrittenAt: Record<MeterClass, number> = { u: 0, w: 0 };
const FLUSH_MS = 250;

async function flush(): Promise<void> {
  flushTimer = null;
  const items = [...pending.entries()];
  pending.clear();
  for (const [kf, n] of items) {
    const [key, field] = kf.split('\u0000');
    const ttl = key.startsWith('i429:h:') ? HOUR_TTL_SEC : MINUTE_TTL_SEC;
    try { await store.hincrbyEx(key, field, n, ttl); } catch { /* 계측 실패는 아무에게도 닿지 않는다 */ }
  }
}

/** 시험·종료 전용 — 모아 둔 것을 지금 쓴다 */
export async function flushMeterNow(): Promise<void> {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  await flush();
}

/**
 * 429 한 건을 센다. 기다리지 않고 던지지 않는다 — callIntrinio 의 429 분기에서만 부른다.
 * cls: 'w' = 사전 갱신 호출 관문 안 · 'u' = 그 밖(화면 경로·다른 크론).
 */
export function note429(cls: MeterClass, path: string, now: number = Date.now()): void {
  try {
    const field = `${cls}:${categoryOf(path)}`;
    for (const key of [hourKey(now), minuteKey(now)]) {
      const kf = `${key}\u0000${field}`;
      pending.set(kf, (pending.get(kf) ?? 0) + 1);
    }
    // 중단 판정용 «마지막 429 시각» — 인스턴스당 초당 한 번만 쓴다
    if (now - lastWrittenAt[cls] >= 1000) {
      lastWrittenAt[cls] = now;
      void store.setEx(lastKey(cls), String(now), LAST_TTL_SEC).catch(() => undefined);
    }
    if (!flushTimer) {
      flushTimer = setTimeout(() => { void flush(); }, FLUSH_MS);
      (flushTimer as any)?.unref?.();
    }
  } catch { /* 계측이 호출을 깨뜨리지 않는다 */ }
}

// ── 읽기 ──
export type User429State = 'yes' | 'no' | 'unknown';

/** 직전 windowMs 안에 사용자 경로(u)가 429 를 받았는가. 저장소를 못 읽으면 'unknown'. */
export async function userRecent429(now: number = Date.now(), windowMs: number = USER_429_WINDOW_MS): Promise<{ state: User429State; lastAt: number | null }> {
  try {
    const raw = await store.get(lastKey('u'));
    if (raw == null) return { state: 'no', lastAt: null };
    const at = Number(raw);
    if (!Number.isFinite(at)) return { state: 'unknown', lastAt: null };
    return { state: now - at < windowMs ? 'yes' : 'no', lastAt: at };
  } catch { return { state: 'unknown', lastAt: null }; }
}

/** [fromMs, toMs] 를 덮는 분 버킷의 건수 합 — 클래스별·갈래별 */
export async function count429Between(fromMs: number, toMs: number): Promise<{ u: number; w: number; byField: Record<string, number> }> {
  const out = { u: 0, w: 0, byField: {} as Record<string, number> };
  const a = Math.floor(fromMs / 60000), b = Math.floor(toMs / 60000);
  for (let m = a; m <= b && m - a < 240; m++) {
    const h = await store.hgetall(`i429:m:${m}`).catch(() => ({} as Record<string, number>));
    for (const [f, n] of Object.entries(h)) {
      out.byField[f] = (out.byField[f] ?? 0) + n;
      if (f.startsWith('u:')) out.u += n; else if (f.startsWith('w:')) out.w += n;
    }
  }
  return out;
}

/** 최근 hours 시간의 시간대별(UTC) 건수 — 오래된 순 */
export async function read429Hourly(now: number = Date.now(), hours = 24): Promise<Array<{ hourUtc: string; u: number; w: number; fields: Record<string, number> }>> {
  const out: Array<{ hourUtc: string; u: number; w: number; fields: Record<string, number> }> = [];
  const top = Math.floor(now / 3600000) * 3600000;
  for (let i = Math.min(Math.max(1, hours), 168) - 1; i >= 0; i--) {
    const t = top - i * 3600000;
    const fields = await store.hgetall(hourKey(t)).catch(() => ({} as Record<string, number>));
    let u = 0, w = 0;
    for (const [f, n] of Object.entries(fields)) { if (f.startsWith('u:')) u += n; else if (f.startsWith('w:')) w += n; }
    out.push({ hourUtc: new Date(t).toISOString().slice(0, 13) + 'Z', u, w, fields });
  }
  return out;
}

// ── 사전 갱신 단일 실행 잠금 ──
export const WARM_LOCK_KEY = 'structure-warm:lock';
/** 라우트 maxDuration(300초)보다 길게 — 함수가 죽어도 잠금은 스스로 풀린다 */
export const WARM_LOCK_TTL_SEC = 330;

/** 잠금을 잡았으면 토큰, 이미 돌고 있거나 저장소를 못 쓰면 null(= 돌지 않는다). */
export async function acquireWarmLock(): Promise<string | null> {
  const token = `${process.pid ?? 0}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  try { return (await store.setNxEx(WARM_LOCK_KEY, token, WARM_LOCK_TTL_SEC)) ? token : null; } catch { return null; }
}

/** 내 토큰일 때만 푼다(다른 실행의 잠금을 지우지 않는다) */
export async function releaseWarmLock(token: string | null): Promise<void> {
  if (!token) return;
  try { if ((await store.get(WARM_LOCK_KEY)) === token) await store.del(WARM_LOCK_KEY); } catch { /* TTL 이 푼다 */ }
}

/** 시험용 메모리 저장소 */
export function memoryMeterStore(): MeterStore & { data: Map<string, any> } {
  const data = new Map<string, any>();
  return {
    data,
    async hincrbyEx(k, f, by) { const h = data.get(k) || {}; h[f] = (Number(h[f]) || 0) + by; data.set(k, h); },
    async hgetall(k) { return { ...(data.get(k) || {}) }; },
    async setEx(k, v) { data.set(k, v); },
    async get(k) { const v = data.get(k); return v == null ? null : String(v); },
    async setNxEx(k, v) { if (data.has(k)) return false; data.set(k, v); return true; },
    async del(k) { data.delete(k); },
  };
}
