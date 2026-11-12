// ============================================================================
// 체험 보고 API(/api/push/trial)의 Redis 쓰기 — 전부 Lua 한 번(원자적) + 요청 순서표(seq) (2026-11-12 야간 검토 ② 관문 연속)
// ----------------------------------------------------------------------------
// 왜: 같은 토큰·같은 고객의 요청이 서로 늦게 끝나면(해제 ↔ 확인 쓰기, 잠금 만료 뒤 늦은 요청) 예전 상태가 새 상태를 덮어
//   발송 대상이 되살아나거나 한 고객에 토큰 두 개가 남았다(관문 11121040 ·11121052 ①③).
// 규칙: 모든 쓰기는 요청 시작 시각(now, ms)을 들고 온다. 토큰 순서표(push:trial:seq:<토큰>)·고객 순서표(push:trial:uidseq:<해시>)가
//   now 보다 «나중»이면 아무것도 쓰지 않는다(0). 쓰면 순서표를 now 로 올린다. → 늦게 시작한 요청의 결과만 남는다.
// 시험(tests/trialPushRoutes)은 아래 MEMORY_IMPL 로 같은 규칙을 흉내 낸다 — Lua 와 JS 를 같이 고칠 것.
// ============================================================================

export const TRIAL_PUSH_SEQ_KEY = (token: string) => `push:trial:seq:${token}`;
export const TRIAL_PUSH_UIDSEQ_KEY = (uidHash: string) => `push:trial:uidseq:${uidHash}`;
/** 순서표 보관 — 보고를 받는 만료 범위(40일) + 여유 */
export const TRIAL_PUSH_SEQ_TTL_S = 45 * 86400;
/** 고객→토큰 묶음 값 — 접두 't:' 로 저장한다(Upstash 자동 JSON 해석이 숫자처럼 생긴 토큰을 바꾸지 않게) */
export const bindValue = (token: string) => `t:${token}`;
export const boundToken = (v: unknown): string | null => (typeof v === 'string' && v.startsWith('t:') ? v.slice(2) : null);

const SEQ_OK = (k: string, a: string) => `(tonumber(redis.call('GET', ${k}) or '0') or 0) <= tonumber(${a})`;

/** 확인된 기록 쓰기. KEYS 주인·기록·대상·고객→토큰·토큰seq·고객seq · ARGV 고객해시·기록JSON·TTL·만료(점수)·대상(1/0)·토큰·now·seqTTL·묶음값('t:'+토큰) */
export const WRITE_VERIFIED_LUA = [
  `if not (${SEQ_OK('KEYS[5]', 'ARGV[7]')}) or not (${SEQ_OK('KEYS[6]', 'ARGV[7]')}) then return 0 end`,
  "redis.call('SET', KEYS[5], ARGV[7], 'EX', ARGV[8]); redis.call('SET', KEYS[6], ARGV[7], 'EX', ARGV[8])",
  "redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3]); redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3]); redis.call('SET', KEYS[4], ARGV[9], 'EX', ARGV[3])",
  "if ARGV[5] == '1' then redis.call('ZADD', KEYS[3], ARGV[4], ARGV[6]) else redis.call('ZREM', KEYS[3], ARGV[6]) end",
  'return 1',
].join('\n');

/** 토큰 지우기(해제 · RC 에 체험 없음). KEYS 대상·기록·주인·토큰seq · ARGV 토큰·now·seqTTL */
export const DROP_LUA = [
  `if not (${SEQ_OK('KEYS[4]', 'ARGV[2]')}) then return 0 end`,
  "redis.call('SET', KEYS[4], ARGV[2], 'EX', ARGV[3]); redis.call('ZREM', KEYS[1], ARGV[1]); redis.call('DEL', KEYS[2], KEYS[3])",
  'return 1',
].join('\n');

/** 빼는 보고(갱신 켬 등) 기록 쓰기 + 대상·주인 빼기. KEYS 기록·대상·주인·토큰seq · ARGV 기록JSON·TTL·토큰·now·seqTTL */
export const WRITE_UNVERIFIED_LUA = [
  `if not (${SEQ_OK('KEYS[4]', 'ARGV[4]')}) then return 0 end`,
  "redis.call('SET', KEYS[4], ARGV[4], 'EX', ARGV[5]); redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2]); redis.call('ZREM', KEYS[2], ARGV[3]); redis.call('DEL', KEYS[3])",
  'return 1',
].join('\n');

/** 옛 토큰 빼기 — 주인이 이 고객이고 그 토큰에 더 새 쓰기가 없을 때만. KEYS 옛주인·대상·옛기록·옛토큰seq · ARGV 고객해시·옛토큰·now·seqTTL */
export const DROP_IF_OWNER_LUA = [
  `if redis.call('GET', KEYS[1]) ~= ARGV[1] or not (${SEQ_OK('KEYS[4]', 'ARGV[3]')}) then return 0 end`,
  "redis.call('SET', KEYS[4], ARGV[3], 'EX', ARGV[4]); redis.call('ZREM', KEYS[2], ARGV[2]); redis.call('DEL', KEYS[3], KEYS[1])",
  'return 1',
].join('\n');

/** 발송 크론 — 확인된 기록의 «보냄» 자리 잡기: 지금도 이 고객의 묶인 토큰이고 주인이 같을 때만, 토큰·고객 표식을 함께(관문 11121127 ①).
 *  KEYS 토큰보냄·고객보냄·고객→토큰·토큰주인 · ARGV 묶음값·만료·TTL·고객해시 → 1 잡음 · 0 이미 보냄 · -1 지금 토큰 아님 */
export const CLAIM_VERIFIED_LUA = [
  "if redis.call('GET', KEYS[4]) ~= ARGV[4] or redis.call('GET', KEYS[3]) ~= ARGV[1] then return -1 end",
  "if redis.call('EXISTS', KEYS[1]) == 1 or redis.call('EXISTS', KEYS[2]) == 1 then return 0 end",
  "redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3]); redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])",
  'return 1',
].join('\n');

/** 발송 크론 — 고객의 지금 토큰이 아닐 때만 대상에서 걷는다(그 사이 다시 묶였으면 걷지 않는다 — 관문 11121127 ②). KEYS 고객→토큰·대상 · ARGV 묶음값·토큰 */
export const SWEEP_IF_UNBOUND_LUA = "if redis.call('GET', KEYS[1]) ~= ARGV[1] then redis.call('ZREM', KEYS[2], ARGV[2]) return 1 end return 0";

/** 내 잠금일 때만 푼다. KEYS 잠금 · ARGV 잠금 ID */
export const UNLOCK_LUA = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0";

// ── 시험용 같은 규칙(메모리) ─────────────────────────────────────────────
export type MemRedis = { kv: Map<string, string>; zs: Map<string, Map<string, number>> };
const seqOk = (m: MemRedis, k: string, now: string) => (Number(m.kv.get(k) ?? '0') || 0) <= Number(now);
const zset = (m: MemRedis, k: string) => m.zs.get(k) ?? m.zs.set(k, new Map()).get(k)!;
export const MEMORY_IMPL = new Map<string, (m: MemRedis, keys: string[], a: string[]) => number>([
  [WRITE_VERIFIED_LUA, (m, k, a) => {
    if (!seqOk(m, k[4], a[6]) || !seqOk(m, k[5], a[6])) return 0;
    m.kv.set(k[4], a[6]); m.kv.set(k[5], a[6]);
    m.kv.set(k[0], a[0]); m.kv.set(k[1], a[1]); m.kv.set(k[3], a[8]);
    if (a[4] === '1') zset(m, k[2]).set(a[5], Number(a[3])); else m.zs.get(k[2])?.delete(a[5]);
    return 1;
  }],
  [DROP_LUA, (m, k, a) => {
    if (!seqOk(m, k[3], a[1])) return 0;
    m.kv.set(k[3], a[1]); m.zs.get(k[0])?.delete(a[0]); m.kv.delete(k[1]); m.kv.delete(k[2]);
    return 1;
  }],
  [WRITE_UNVERIFIED_LUA, (m, k, a) => {
    if (!seqOk(m, k[3], a[3])) return 0;
    m.kv.set(k[3], a[3]); m.kv.set(k[0], a[0]); m.zs.get(k[1])?.delete(a[2]); m.kv.delete(k[2]);
    return 1;
  }],
  [DROP_IF_OWNER_LUA, (m, k, a) => {
    if (m.kv.get(k[0]) !== a[0] || !seqOk(m, k[3], a[2])) return 0;
    m.kv.set(k[3], a[2]); m.zs.get(k[1])?.delete(a[1]); m.kv.delete(k[2]); m.kv.delete(k[0]);
    return 1;
  }],
  [CLAIM_VERIFIED_LUA, (m, k, a) => {
    if (m.kv.get(k[3]) !== a[3] || m.kv.get(k[2]) !== a[0]) return -1;
    if (m.kv.has(k[0]) || m.kv.has(k[1])) return 0;
    m.kv.set(k[0], a[1]); m.kv.set(k[1], a[1]); return 1;
  }],
  [SWEEP_IF_UNBOUND_LUA, (m, k, a) => { if (m.kv.get(k[0]) !== a[0]) { m.zs.get(k[1])?.delete(a[1]); return 1; } return 0; }],
  [UNLOCK_LUA, (m, k, a) => { if (m.kv.get(k[0]) === a[0]) { m.kv.delete(k[0]); return 1; } return 0; }],
]);
