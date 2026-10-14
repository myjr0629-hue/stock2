/** Shared data table: memoryInviteStore locally; real EVAL in scripts/invite-lua-probe.ts.
 * Only fabricated members are used. Assertions/errors must never print live data.
 */
import assert from 'node:assert/strict';
import type { InviteStore } from '../src/lib/invite/engine';
import type { ArriveCreditInput, ArriveCreditResult, MintOneInput, MintOneResult } from '../src/lib/invite/atomic';

const NOW = Date.parse('2026-10-14T12:00:00Z');
const END = Date.parse('2026-10-31T00:00:00Z');
const LONG = 400 * 86400;
const IOS = (n: number) => `GZTEST${String(n).padStart(4, '0')}`;
const PLAY = (n: number) => `ZZTEST${String(n).padStart(17, '0')}`;
type Seed = { key: string; value: string; ttl?: number } | { key: string; members: string[] } | { key: string; fields: Record<string, string>; ttl?: number };
type Arrival = { kind: 'arrive'; self?: string; ip?: string; ref?: string; day?: string; decision?: ArriveCreditInput['decision']; limits?: Partial<Pick<ArriveCreditInput, 'arriveTtl' | 'ipTtl' | 'longTtl' | 'dayTtl' | 'lifetimeCap' | 'dailyCap'>> };
type Mint = { kind: 'mint'; ref?: string; os?: 'ios' | 'android'; now?: number; reserve?: number; boxTtl?: number };
type Operation = (Arrival | Mint) & { fault?: 'before' | 'after'; expect: ArriveCreditResult | MintOneResult | 'error' };
type Step = Operation | { parallel: Operation[] } | { wait: number };
export interface AtomicScenario {
  name: string;
  seed?: Seed[];
  steps: Step[];
  strings?: Record<string, string | null>;
  sizes?: Record<string, number>;
  boxes?: Record<string, number>;
  ttl?: Record<string, number>;
  unchanged?: boolean;
  unorderedBoxes?: boolean;
}
const credit = (ref = 'a', value = '1'): Seed => ({ key: `credit:${ref}`, value });
const pool = (os: 'ios' | 'android', count: number): Seed => ({ key: `pool:${os}`, members: Array.from({ length: count }, (_, n) => os === 'ios' ? IOS(n) : PLAY(n)) });
const minted: Operation = { kind: 'mint', expect: 'minted' };
const credited: Operation = { kind: 'arrive', expect: 'credited' };
export const ATOMIC_SCENARIOS: AtomicScenario[] = [
  { name: 'arrival-credit-and-friends', steps: [credited], strings: { 'credit:a': '1', 'friends:a': '1', 'count:a': '1', 'day:today': '1' }, ttl: { 'arr:b': LONG, 'ip:one': 30 * 86400, 'credit:a': LONG, 'friends:a': LONG, 'day:today': 3 * 86400 } },
  ...(['none', 'self', 'loose_ambiguous'] as const).map(decision => ({ name: `arrival-${decision}-consumes-launch`, steps: [{ kind: 'arrive' as const, decision, expect: decision }, { kind: 'arrive' as const, expect: 'again' as const }], strings: { 'credit:a': null, 'ip:one': null } })),
  { name: 'arrival-lost-reply-other-ip', steps: [{ ...credited, fault: 'after', expect: 'error' }, { kind: 'arrive', ip: 'two', expect: 'again' }], strings: { 'credit:a': '1', 'friends:a': '1', 'count:a': '1', 'day:today': '1', 'ip:two': null } },
  { name: 'arrival-failure-before-eval-retry', steps: [{ ...credited, fault: 'before', expect: 'error' }, credited], strings: { 'credit:a': '1', 'friends:a': '1' } },
  { name: 'arrival-same-device-concurrent', steps: [{ parallel: [credited, { kind: 'arrive', ip: 'two', expect: 'again' }] }], strings: { 'credit:a': '1', 'friends:a': '1' } },
  { name: 'arrival-same-ip-concurrent', steps: [{ parallel: [credited, { kind: 'arrive', self: 'c', expect: 'ip' }] }], strings: { 'credit:a': '1', 'friends:a': '1' } },
  { name: 'arrival-lifetime-cap-concurrent', seed: [{ key: 'count:a', value: '2' }], steps: [{ parallel: [credited, { kind: 'arrive', self: 'c', ip: 'two', expect: 'inviter_cap' }] }], strings: { 'credit:a': '1', 'count:a': '3', 'day:today': '1' } },
  { name: 'arrival-day-cap-concurrent', seed: [{ key: 'day:today', value: '24' }], steps: [{ parallel: [credited, { kind: 'arrive', self: 'c', ip: 'two', expect: 'day_cap' }] }], strings: { 'credit:a': '1', 'friends:a': '1', 'count:a': '1', 'day:today': '25' } },
  { name: 'arrival-day-change', seed: [{ key: 'day:yesterday', value: '25' }], steps: [credited], strings: { 'day:yesterday': '25', 'day:today': '1' } },
  { name: 'arrival-ip-ttl-expiry', steps: [{ ...credited, limits: { ipTtl: 1 } }, { wait: 1100 }, { ...credited, self: 'c' }], strings: { 'credit:a': '2', 'friends:a': '2' } },
  ...['count:a', 'day:today', 'credit:a', 'friends:a'].flatMap(key => [
    { name: `arrival-invalid-counter-${key}`, seed: [{ key, value: 'broken' }], steps: [{ ...credited, expect: 'error' as const }], unchanged: true },
    { name: `arrival-wrong-type-${key}`, seed: [{ key, members: ['fixture'] }], steps: [{ ...credited, expect: 'error' as const }], unchanged: true },
  ]),
  { name: 'arrival-counter-newline', seed: [{ key: 'friends:a', value: '1\n' }], steps: [{ ...credited, expect: 'error' }], unchanged: true },
  { name: 'arrival-overflow-before-marker', seed: [{ key: 'friends:a', value: '9223372036854775807' }], steps: [{ ...credited, expect: 'error' }], unchanged: true },
  { name: 'arrival-invalid-ttl-before-marker', steps: [{ ...credited, limits: { longTtl: 0 }, expect: 'error' }], unchanged: true },
  { name: 'mint-ios', seed: [credit(), pool('ios', 1)], steps: [minted, { kind: 'mint', expect: 'no_credit' }], strings: { 'credit:a': '0' }, sizes: { 'pool:ios': 0 }, boxes: { a: 1 }, ttl: { 'box:a': LONG } },
  { name: 'mint-leading-zero-member', seed: [credit(), { key: 'pool:ios', members: ['00000000000000000000000'] }], steps: [minted], boxes: { a: 1 } },
  { name: 'mint-no-credit', seed: [pool('ios', 1)], steps: [{ kind: 'mint', expect: 'no_credit' }], unchanged: true },
  { name: 'mint-empty', seed: [credit()], steps: [{ kind: 'mint', expect: 'empty' }], unchanged: true },
  ...[END - 1, END, END + 1].map(now => ({ name: `mint-play-expiry-${now - END}`, seed: [credit(), pool('android', 61)], steps: [{ kind: 'mint' as const, os: 'android' as const, now, expect: now < END ? 'minted' as const : 'expired' as const }], strings: { 'credit:a': now < END ? '0' : '1' }, sizes: { 'pool:android': now < END ? 60 : 61 }, boxes: { a: now < END ? 1 : 0 } })),
  ...[59, 60, 61].map(count => ({ name: `mint-play-reserve-${count}`, seed: [credit(), pool('android', count)], steps: [{ kind: 'mint' as const, os: 'android' as const, expect: count > 60 ? 'minted' as const : 'reserve' as const }], strings: { 'credit:a': count > 60 ? '0' : '1' }, sizes: { 'pool:android': Math.min(count, 60) } })),
  { name: 'mint-invalid-max-three', seed: [credit(), { key: 'pool:ios', members: ['bad one', 'bad two', 'bad three', 'bad four'] }], steps: [{ kind: 'mint', expect: 'invalid' }], strings: { 'credit:a': '1' }, sizes: { 'pool:ios': 1, 'pool:ios:bad': 3 }, boxes: { a: 0 } },
  { name: 'mint-member-newline-invalid', seed: [credit(), { key: 'pool:ios', members: [IOS(1) + '\n'] }], steps: [{ kind: 'mint', expect: 'empty' }], strings: { 'credit:a': '1' }, sizes: { 'pool:ios:bad': 1 }, boxes: { a: 0 } },
  { name: 'mint-play-invalid-stops-at-reserve', seed: [credit(), { key: 'pool:android', members: Array.from({ length: 61 }, (_, n) => `bad ${n}`) }], steps: [{ kind: 'mint', os: 'android', expect: 'reserve' }], strings: { 'credit:a': '1' }, sizes: { 'pool:android': 60, 'pool:android:bad': 1 } },
  ...(['ios', 'android'] as const).map(os => ({ name: `mint-${os}-lost-reply-no-return-no-limbo`, seed: [credit(), credit('b'), pool(os, os === 'ios' ? 1 : 61)], steps: [{ kind: 'mint' as const, os, fault: 'after' as const, expect: 'error' as const }, { kind: 'mint' as const, os, expect: 'no_credit' as const }, { kind: 'mint' as const, os, ref: 'b', expect: os === 'ios' ? 'empty' as const : 'reserve' as const }], strings: { 'credit:a': '0', 'credit:b': '1' }, boxes: { a: 1, b: 0 }, sizes: { [`pool:${os}:limbo`]: 0, [`pool:${os}`]: os === 'ios' ? 0 : 60 } })),
  { name: 'mint-failure-before-eval', seed: [credit(), pool('ios', 1)], steps: [{ ...minted, fault: 'before', expect: 'error' }], unchanged: true },
  { name: 'mint-same-credit-concurrent', seed: [credit(), pool('ios', 5)], steps: [{ parallel: [minted, { kind: 'mint', expect: 'no_credit' }] }], strings: { 'credit:a': '0' }, boxes: { a: 1 }, sizes: { 'pool:ios': 4 } },
  { name: 'mint-play-reserve-concurrent', unorderedBoxes: true, seed: [credit(), credit('b'), pool('android', 61)], steps: [{ parallel: [{ kind: 'mint', os: 'android', expect: 'minted' }, { kind: 'mint', os: 'android', ref: 'b', expect: 'reserve' }] }], sizes: { 'pool:android': 60 }, boxes: { a: 1, b: 0 } },
  { name: 'mint-first-box-expiry-nx', seed: [credit(), pool('ios', 1), { key: 'box:a', fields: { [IOS(99)]: JSON.stringify({ os: 'ios', at: NOW - 1000 }) }, ttl: 30 }], steps: [minted], boxes: { a: 2 }, ttl: { 'box:a': 30 } },
  { name: 'mint-expired-box-new-first-record', seed: [credit(), pool('ios', 1), { key: 'box:a', fields: { [IOS(99)]: JSON.stringify({ os: 'ios', at: NOW - LONG * 1000 }) }, ttl: 1 }], steps: [{ wait: 1100 }, minted], boxes: { a: 1 }, ttl: { 'box:a': LONG } },
  { name: 'mint-preserves-credit-expiry', seed: [{ key: 'credit:a', value: '2', ttl: 30 }, pool('ios', 1)], steps: [minted], strings: { 'credit:a': '1' }, ttl: { 'credit:a': 30 } },
  ...['pool:ios', 'pool:ios:bad', 'box:a'].map(key => ({ name: `mint-wrong-type-${key}`, seed: [credit(), ...(key === 'pool:ios' ? [] : [pool('ios', 1)]), { key, value: 'broken' }], steps: [{ ...minted, expect: 'error' as const }], unchanged: true })),
  { name: 'mint-invalid-credit', seed: [credit('a', '-1'), pool('ios', 1)], steps: [{ ...minted, expect: 'error' }], unchanged: true },
  { name: 'mint-invalid-ttl-before-pop', seed: [credit(), pool('ios', 1)], steps: [{ ...minted, boxTtl: 0, expect: 'error' }], unchanged: true },
];

export interface AtomicHarness {
  store: InviteStore;
  prefix: string;
  wait(ms: number): Promise<void>;
  ttl(key: string): Promise<number>;
  /** All prefix keys, including types and values (TTL is checked separately). */
  snapshot(): Promise<unknown>;
}
export function scenarioInput(op: Arrival | Mint, prefix: string): ArriveCreditInput | MintOneInput {
  const key = (s: string) => `${prefix}:${s}`;
  const ref = op.ref ?? 'a';
  return op.kind === 'arrive' ? {
    keys: [key(`arr:${op.self ?? 'b'}`), key(`ip:${op.ip ?? 'one'}`), key(`count:${ref}`), key(`day:${op.day ?? 'today'}`), key(`credit:${ref}`), key(`friends:${ref}`)],
    now: NOW, decision: op.decision ?? 'eligible', inviterRef: ref,
    arriveTtl: LONG, ipTtl: 30 * 86400, longTtl: LONG, dayTtl: 3 * 86400, lifetimeCap: 3, dailyCap: 25, ...op.limits,
  } : {
    keys: [key(`credit:${ref}`), key(`pool:${op.os ?? 'ios'}`), key(`pool:${op.os ?? 'ios'}:bad`), key(`box:${ref}`)],
    os: op.os ?? 'ios', now: op.now ?? NOW, playEnd: END, reserve: op.reserve ?? 60, boxTtl: op.boxTtl ?? LONG,
  };
}
export async function runAtomicScenario(scenario: AtomicScenario, h: AtomicHarness): Promise<void> {
  const started = Date.now();
  let advancedMs = 0;
  const key = (s: string) => `${h.prefix}:${s}`;
  for (const seed of scenario.seed ?? []) {
    if ('value' in seed) await h.store.set(key(seed.key), seed.value, seed.ttl ?? LONG);
    else if ('members' in seed) for (const member of seed.members) await h.store.sadd(key(seed.key), member);
    else for (const [field, value] of Object.entries(seed.fields)) await h.store.hset(key(seed.key), field, value, seed.ttl ?? LONG);
  }
  const before = scenario.unchanged ? await h.snapshot() : null;
  const run = async (op: Operation) => {
    try {
      if (op.fault === 'before') throw new Error('injected before EVAL');
      const input = scenarioInput(op, h.prefix);
      const result = op.kind === 'arrive' ? await h.store.arriveCredit(input as ArriveCreditInput) : await h.store.mintOne(input as MintOneInput);
      if (op.fault === 'after') throw new Error('injected lost EVAL reply');
      return result;
    } catch { return 'error'; }
  };
  for (const step of scenario.steps) {
    if ('wait' in step) { await h.wait(step.wait); advancedMs += step.wait; }
    else if ('parallel' in step) assert.deepEqual((await Promise.all(step.parallel.map(run))).sort(), step.parallel.map(op => op.expect).sort(), scenario.name);
    else assert.equal(await run(step), step.expect, scenario.name);
  }
  if (scenario.unchanged) assert.deepEqual(await h.snapshot(), before, scenario.name);
  for (const [k, expected] of Object.entries(scenario.strings ?? {})) assert.equal(await h.store.get(key(k)), expected, scenario.name);
  for (const [k, expected] of Object.entries(scenario.sizes ?? {})) assert.equal(await h.store.scard(key(k)), expected, scenario.name);
  const assigned = new Set<string>();
  let boxTotal = 0;
  const boxCounts: number[] = [];
  for (const [ref, count] of Object.entries(scenario.boxes ?? {})) {
    const box = await h.store.hgetall(key(`box:${ref}`));
    boxCounts.push(Object.keys(box).length);
    if (!scenario.unorderedBoxes) assert.equal(Object.keys(box).length, count, scenario.name);
    for (const [member, raw] of Object.entries(box)) {
      assert.ok(!assigned.has(member), scenario.name); assigned.add(member); boxTotal++;
      const item = JSON.parse(raw);
      assert.ok((item.os === 'ios' || item.os === 'android') && typeof item.at === 'number', scenario.name);
    }
  }
  assert.equal(assigned.size, boxTotal, scenario.name);
  if (scenario.unorderedBoxes) assert.deepEqual(boxCounts.sort(), Object.values(scenario.boxes ?? {}).sort(), scenario.name);
  for (const [k, expected] of Object.entries(scenario.ttl ?? {})) {
    const actual = await h.ttl(key(k));
    assert.ok(actual > 0 && actual <= expected && expected - actual <= Math.ceil((Date.now() - started + advancedMs) / 1000) + 1, scenario.name);
  }
}
