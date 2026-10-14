/** Test store. Atomic methods contain no await: validation and mutation share one turn. */
import type { InviteStore } from './engine';
import { arriveArgs, mintArgs, counterValue } from './atomic';

export function memoryInviteStore(now: () => number = Date.now): InviteStore & { dump(): Record<string, unknown> } {
  const kv = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const hashes = new Map<string, Map<string, string>>();
  const ttl = new Map<string, number>();
  const expires = new Map<string, number>();
  const fieldExpiry = new Map<string, Map<string, number>>();
  const remove = (k: string) => { kv.delete(k); sets.delete(k); hashes.delete(k); ttl.delete(k); expires.delete(k); fieldExpiry.delete(k); };
  const expire = (k: string, sec: number, nx = false) => {
    if (!nx || !expires.has(k)) { ttl.set(k, sec); expires.set(k, now() + sec * 1000); }
  };
  const purge = (k: string) => {
    if ((expires.get(k) ?? Infinity) <= now()) { remove(k); return; }
    for (const [f, at] of fieldExpiry.get(k) ?? []) if (at <= now()) {
      hashes.get(k)?.delete(f); fieldExpiry.get(k)?.delete(f);
    }
    if (hashes.has(k) && !hashes.get(k)!.size) remove(k);
  };
  const type = (k: string) => { purge(k); return kv.has(k) ? 'string' : sets.has(k) ? 'set' : hashes.has(k) ? 'hash' : 'none'; };
  const check = (k: string, kind: string) => {
    const actual = type(k);
    if (actual !== 'none' && actual !== kind) throw new Error('invite atomic: invalid key type');
  };
  const write = (k: string, v: string, sec: number) => { remove(k); kv.set(k, v); expire(k, sec); };
  const add = (k: string, member: string) => { if (!sets.has(k)) sets.set(k, new Set()); sets.get(k)!.add(member); };
  const pop = (k: string) => {
    const set = sets.get(k);
    if (!set?.size) return null;
    const value = set.values().next().value as string;
    set.delete(value);
    if (!set.size) remove(k);
    return value;
  };
  const putHash = (k: string, f: string, v: string) => {
    if (!hashes.has(k)) hashes.set(k, new Map());
    hashes.get(k)!.set(f, v); fieldExpiry.get(k)?.delete(f);
  };
  return {
    arriveCredit: async (i) => {
      arriveArgs(i);
      i.keys.forEach(k => check(k, 'string'));
      const [arrived, ip, count, day, credit, friends] = i.keys;
      if (kv.has(arrived)) return 'again';
      const values = [count, day, credit, friends].map(k => counterValue(kv.get(k) ?? null));
      write(arrived, String(i.now), i.arriveTtl);
      if (i.decision !== 'eligible') return i.decision;
      if (kv.has(ip)) return 'ip';
      write(ip, i.inviterRef, i.ipTtl);
      if (values[0] >= i.lifetimeCap) return 'inviter_cap';
      if (values[1] >= i.dailyCap) return 'day_cap';
      [count, day, credit, friends].forEach((k, n) => write(k, String(values[n] + 1), k === day ? i.dayTtl : i.longTtl));
      return 'credited';
    },
    mintOne: async (i) => {
      mintArgs(i);
      i.keys.forEach((k, n) => check(k, ['string', 'set', 'set', 'hash'][n]));
      const [credit, pool, bad, box] = i.keys;
      const pending = counterValue(kv.get(credit) ?? null);
      if (!pending) return 'no_credit';
      if (i.os === 'android' && i.now >= i.playEnd) return 'expired';
      const item = JSON.stringify({ os: i.os, at: i.now });
      for (let n = 0; n < 3; n++) {
        if (i.os === 'android' && (sets.get(pool)?.size ?? 0) <= i.reserve) return 'reserve';
        const code = pop(pool);
        if (code === null) return 'empty';
        if (/[^A-Z0-9]/.test(code) || !(i.os === 'ios' ? /^[A-Z0-9]{8,24}$/ : /^[A-Z0-9]{23}$/).test(code)) add(bad, code);
        else {
          putHash(box, code, item); expire(box, i.boxTtl, true);
          kv.set(credit, String(pending - 1)); // DECR preserves the original credit expiry.
          return 'minted';
        }
      }
      return 'invalid';
    },
    get: async (k) => { check(k, 'string'); return kv.get(k) ?? null; },
    del: async (k) => { remove(k); },
    set: async (k, v, t) => { write(k, v, t); },
    setNx: async (k, v, t) => { if (type(k) !== 'none') return false; write(k, v, t); return true; },
    incr: async (k, t) => { check(k, 'string'); const n = Number(kv.get(k) ?? 0) + 1; kv.set(k, String(n)); expire(k, t); return n; },
    decr: async (k) => { check(k, 'string'); const n = Number(kv.get(k) ?? 0) - 1; kv.set(k, String(n)); return n; },
    spop: async (k) => { check(k, 'set'); return pop(k); },
    sadd: async (k, m) => { check(k, 'set'); const present = sets.get(k)?.has(m); add(k, m); return present ? 0 : 1; },
    scard: async (k) => { check(k, 'set'); return sets.get(k)?.size ?? 0; },
    hset: async (k, f, v, t, keepTtl = false) => { check(k, 'hash'); putHash(k, f, v); expire(k, t, keepTtl); },
    hsetExpiring: async (k, f, v, t) => {
      check(k, 'hash'); putHash(k, f, v); expire(k, t);
      if (!fieldExpiry.has(k)) fieldExpiry.set(k, new Map());
      fieldExpiry.get(k)!.set(f, now() + t * 1000);
    },
    hexists: async (k, f) => { check(k, 'hash'); return hashes.get(k)?.has(f) ?? false; },
    hdel: async (k, f) => { check(k, 'hash'); hashes.get(k)?.delete(f); fieldExpiry.get(k)?.delete(f); if (!hashes.get(k)?.size) remove(k); },
    hgetall: async (k) => { check(k, 'hash'); return Object.fromEntries(hashes.get(k) ?? []); },
    dump: () => {
      new Set([...kv.keys(), ...sets.keys(), ...hashes.keys()]).forEach(purge);
      return { kv: Object.fromEntries(kv), sets: Object.fromEntries([...sets].map(([k, s]) => [k, [...s]])), hashes: Object.fromEntries([...hashes].map(([k, h]) => [k, Object.fromEntries(h)])), ttl: Object.fromEntries(ttl), expires: Object.fromEntries(expires) };
    },
  };
}
