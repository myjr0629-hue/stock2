/**
 * 이상 신호 시험 공용 부품 — 구조 판본 만들기 · 가짜 저장소 · 가짜 읽기 · 가짜 발송. (이름이 .test.ts 가 아니라 실행기가 건너뛴다)
 * 기준일: 2026-10-13(화, EDT = UTC−4). 11:05 ET = 15:05Z.
 */
import type { SigDeps, SigKv, SigReaders, SigStore, SendItem, SendOutcome, OptionsBundle } from '../src/lib/signals/run';
import type { DarkRow, EarnEntry } from '../src/lib/signals/detect';
import { devKey } from '../src/lib/signals/plan';

export const T = (day: string, hh: number, mm = 0): number => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d, hh + 4, mm);      // EDT(UTC−4) 벽시계 → ms
};

export interface DocOpts {
  ticker?: string; price?: number; session?: 'PRE' | 'REG' | 'POST' | 'CLOSED'; at: number; cw?: number | null; pf?: number | null; mp?: number | null; gf?: number | null;
  expiry?: string; chain?: string | null; gfType?: string; status?: string;
}
export function structDoc(o: DocOpts): { data: any; timestamp: number } {
  return {
    timestamp: o.at,
    data: {
      ticker: o.ticker ?? 'NVDA', options_status: o.status ?? 'OK', underlyingPrice: o.price ?? 249, expiration: o.expiry ?? '2026-10-16', chainDate: o.chain === undefined ? '2026-10-12' : o.chain,
      session: o.session ?? 'REG', gammaFlipType: o.gfType ?? 'EXACT', gexConfidence: 'HIGH',
      gammaFlipLevel: o.gf === undefined ? null : o.gf, maxPain: o.mp === undefined ? 240 : o.mp,
      levels: { callWall: o.cw === undefined ? 250 : o.cw, putFloor: o.pf === undefined ? 230 : o.pf },
    },
  };
}

/** Upstash 흉내 — 맵 하나 + 호출 기록 */
export class FakeStore implements SigStore {
  m = new Map<string, unknown>();
  sets = new Map<string, Set<string>>();
  writes: string[] = [];
  ttl = new Map<string, number>();
  async smembers(k: string) { return Array.from(this.sets.get(k) ?? []); }
  async mget(keys: string[]) { return keys.map((k) => (this.m.has(k) ? this.m.get(k) : null)); }
  async get(k: string) { return this.m.has(k) ? this.m.get(k) : null; }
  async setNx(k: string, v: string, ex: number) { if (this.m.has(k)) return false; this.m.set(k, v); this.ttl.set(k, ex); this.writes.push(`setnx:${k}`); return true; }
  async set(k: string, v: string, ex?: number) { this.m.set(k, v); if (ex) this.ttl.set(k, ex); this.writes.push(`set:${k}`); }
  async incr(k: string, ex: number) { const n = (Number(this.m.get(k)) || 0) + 1; this.m.set(k, n); this.ttl.set(k, ex); this.writes.push(`incr:${k}`); return n; }
  async decr(k: string) { const n = (Number(this.m.get(k)) || 0) - 1; this.m.set(k, n); this.writes.push(`decr:${k}`); return n; }
  async del(keys: string[]) { for (const k of keys) { this.m.delete(k); this.writes.push(`del:${k}`); } }
  async srem(k: string, members: string[]) { for (const x of members) this.sets.get(k)?.delete(x); this.writes.push(`srem:${k}`); }
  addDevice(token: string, rec: Record<string, unknown>) {
    if (!this.sets.has('push:token_list')) this.sets.set('push:token_list', new Set());
    this.sets.get('push:token_list')!.add(token);
    this.m.set(`push:tokens:${token}`, JSON.stringify({ token, platform: token.includes(':') ? 'android' : 'ios', locale: 'ko', app: 'signum', ...rec }));
  }
  ledgerKeys() { return Array.from(this.m.keys()).filter((k) => k.startsWith('push:sig:') && k !== 'push:sig:mode'); }
}

export class FakeKv implements SigKv {
  m = new Map<string, unknown>();
  writes: string[] = [];
  async get<X>(k: string) { return (this.m.has(k) ? (this.m.get(k) as X) : null); }
  async mget<X>(keys: string[]) { return keys.map((k) => (this.m.has(k) ? (this.m.get(k) as X) : null)); }
  async set(k: string, v: unknown, _ttl: number) { this.m.set(k, v); this.writes.push(k); }
}

export interface ReaderFixtures {
  structure?: Record<string, { data?: any; timestamp?: number } | null>;
  mpStats?: Record<string, { p90: number; n: number } | null>;
  dark?: Record<string, DarkRow>;
  darkOk?: boolean;
  bundle?: OptionsBundle | null;
  earnings?: EarnEntry[];
  implied?: Record<string, { pct: number | null; expiry: string | null }>;
  etf?: string[];
}
export function fakeReaders(f: ReaderFixtures): SigReaders & { calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  const hit = (n: string) => { calls[n] = (calls[n] ?? 0) + 1; };
  return {
    calls,
    async structure(tickers) { hit('structure'); return new Map(tickers.map((t) => [t, f.structure?.[t] ?? null])); },
    async maxPainStats(t) { hit('maxPainStats'); return f.mpStats?.[t] ?? null; },
    async darkRows(tickers) { hit('darkRows'); return { ok: f.darkOk !== false, rows: new Map(tickers.filter((t) => f.dark?.[t]).map((t) => [t, f.dark![t]])) }; },
    async optionsBundle() { hit('bundle'); return f.bundle ?? null; },
    async earningsOn(date, tickers) { hit('earnings'); return (f.earnings ?? []).filter((e) => e.date === date && tickers.includes(e.ticker)); },
    async implied(entries) { hit('implied'); return new Map(entries.map((e) => [e.ticker, f.implied?.[e.ticker] ?? { pct: null, expiry: null }])); },
    isEtf: (t) => (f.etf ?? ['SPY', 'QQQ', 'IWM']).includes(t),
  };
}

export class FakeSender {
  items: SendItem[] = [];
  calls = 0;
  failIds: ((it: SendItem) => SendOutcome | null) | null = null;
  async send(items: SendItem[]) {
    this.calls++;
    this.items.push(...items);
    const out = new Map<string, SendOutcome>();
    for (const it of items) out.set(it.id, this.failIds?.(it) ?? 'ok');
    return out;
  }
}

export function deps(store: FakeStore, kv: FakeKv, readers: SigReaders, sender: FakeSender | null, ai: SigDeps['ai'] = null): SigDeps {
  return { store, kv, readers, ai, sender };
}

export const IOS_TOKEN = 'a'.repeat(64);
export const IOS_TOKEN2 = 'b'.repeat(64);
export const AND_TOKEN = 'dQw4w9WgXcQ:APA91bHexample';
export const devOf = (t: string) => devKey(t);
