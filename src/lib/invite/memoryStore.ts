/**
 * 시험용 메모리 저장소 — InviteStore 와 같은 동작(원자 연산은 단일 스레드라 자연히 원자적). 운영 코드는 import 하지 않는다.
 */
import type { InviteStore } from './engine';

export function memoryInviteStore(): InviteStore & { dump(): Record<string, unknown> } {
  const kv = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const hashes = new Map<string, Map<string, string>>();
  const ttl = new Map<string, number>();
  return {
    get: async (k) => (kv.has(k) ? kv.get(k)! : null),
    del: async (k) => { kv.delete(k); sets.delete(k); hashes.delete(k); ttl.delete(k); },
    set: async (k, v, t) => { kv.set(k, v); ttl.set(k, t); },
    setNx: async (k, v, t) => { if (kv.has(k)) return false; kv.set(k, v); ttl.set(k, t); return true; },
    incr: async (k, t) => { const n = (Number(kv.get(k)) || 0) + 1; kv.set(k, String(n)); ttl.set(k, t); return n; },
    decr: async (k) => { const n = (Number(kv.get(k)) || 0) - 1; kv.set(k, String(n)); return n; },
    spop: async (k) => {
      const s = sets.get(k);
      if (!s || s.size === 0) return null;
      const v = s.values().next().value as string;
      s.delete(v);
      return v;
    },
    sadd: async (k, m) => { if (!sets.has(k)) sets.set(k, new Set()); sets.get(k)!.add(m); return 1; },
    scard: async (k) => sets.get(k)?.size ?? 0,
    hset: async (k, f, v, t, keepTtl = false) => { if (!hashes.has(k)) hashes.set(k, new Map()); hashes.get(k)!.set(f, v); if (!keepTtl || !ttl.has(k)) ttl.set(k, t); },
    hdel: async (k, f) => { hashes.get(k)?.delete(f); },
    hgetall: async (k) => Object.fromEntries(hashes.get(k) ?? []),
    dump: () => ({ kv: Object.fromEntries(kv), sets: Object.fromEntries([...sets].map(([k, s]) => [k, [...s]])), hashes: Object.fromEntries([...hashes].map(([k, h]) => [k, Object.fromEntries(h)])), ttl: Object.fromEntries(ttl) }),
  };
}
