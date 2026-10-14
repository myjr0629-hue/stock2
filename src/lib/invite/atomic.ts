/** Atomic invite gates. All keys are explicit KEYS; policy/time/TTL are ARGV.
 * Redis Lua serializes commands but does NOT roll back runtime errors. Validate
 * arguments, key types and counter ranges before the first write. Never compensate
 * for a failed/lost response: it may already have committed on the server.
 */
export type ArriveDecision = 'eligible' | 'none' | 'self' | 'loose_ambiguous';
export type ArriveCreditResult = Exclude<ArriveDecision, 'eligible'> | 'again' | 'ip' | 'inviter_cap' | 'day_cap' | 'credited';
export interface ArriveCreditInput {
  /** arrived, ipCredit, lifetime count, day count, credit, friends */
  keys: [string, string, string, string, string, string];
  now: number;
  decision: ArriveDecision;
  inviterRef: string;
  arriveTtl: number;
  ipTtl: number;
  longTtl: number;
  dayTtl: number;
  lifetimeCap: number;
  dailyCap: number;
}
export type MintOneResult = 'minted' | 'no_credit' | 'expired' | 'reserve' | 'empty' | 'invalid';
export interface MintOneInput {
  /** credit, pool, bad pool, box */
  keys: [string, string, string, string];
  os: 'ios' | 'android';
  now: number;
  playEnd: number;
  reserve: number;
  boxTtl: number;
}

const MAX_COUNTER = Number.MAX_SAFE_INTEGER - 1;
export function counterValue(raw: string | null): number {
  if (raw === null) return 0;
  const n = Number(raw);
  if (!/^(0|[1-9][0-9]*)$/.test(raw) || !Number.isSafeInteger(n) || String(n) !== raw || n > MAX_COUNTER) {
    throw new Error('invite atomic: invalid counter');
  }
  return n;
}
function integer(n: number, min: number, max = MAX_COUNTER) {
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error('invite atomic: invalid argument');
}
function keysValid(keys: string[], count: number) {
  if (keys.length !== count || keys.some(k => typeof k !== 'string' || !k) || new Set(keys).size !== count) {
    throw new Error('invite atomic: invalid keys');
  }
}
export function arriveArgs(i: ArriveCreditInput): (string | number)[] {
  keysValid(i.keys, 6);
  integer(i.now, 0);
  for (const ttl of [i.arriveTtl, i.ipTtl, i.longTtl, i.dayTtl]) integer(ttl, 1, 2_147_483_647);
  integer(i.lifetimeCap, 1); integer(i.dailyCap, 1);
  if (!['eligible', 'none', 'self', 'loose_ambiguous'].includes(i.decision) || typeof i.inviterRef !== 'string' || !i.inviterRef) {
    throw new Error('invite atomic: invalid decision');
  }
  return [i.now, i.decision, i.inviterRef, i.arriveTtl, i.ipTtl, i.longTtl, i.dayTtl, i.lifetimeCap, i.dailyCap];
}
export function mintArgs(i: MintOneInput): (string | number)[] {
  keysValid(i.keys, 4);
  integer(i.now, 0); integer(i.playEnd, 0); integer(i.reserve, 0); integer(i.boxTtl, 1, 2_147_483_647);
  if (i.os !== 'ios' && i.os !== 'android') throw new Error('invite atomic: invalid os');
  return [i.os, i.now, i.playEnd, i.reserve, i.boxTtl];
}

const PREFLIGHT = `
local function integer(v, min, max)
  local n = tonumber(v)
  if not n or n ~= math.floor(n) or n < min or n > max then error('invite atomic: invalid argument') end
  return n
end
local function keytypes(types)
  if #KEYS ~= #types then error('invite atomic: invalid keys') end
  local seen = {}
  for n, kind in ipairs(types) do
    if KEYS[n] == '' or seen[KEYS[n]] then error('invite atomic: invalid keys') end
    seen[KEYS[n]] = true
    local actual = redis.call('TYPE', KEYS[n]).ok
    if actual ~= 'none' and actual ~= kind then error('invite atomic: invalid key type') end
  end
end
local function counter(key)
  local raw = redis.call('GET', key)
  if not raw then return 0 end
  if raw ~= '0' and not string.match(raw, '^[1-9][0-9]*$') then error('invite atomic: invalid counter') end
  return integer(raw, 0, 9007199254740990)
end
`;

export const ARRIVE_CREDIT_LUA = `${PREFLIGHT}
if #ARGV ~= 9 then error('invite atomic: invalid arguments') end
local now = integer(ARGV[1], 0, 9007199254740990)
local decision = ARGV[2]
if decision ~= 'eligible' and decision ~= 'none' and decision ~= 'self' and decision ~= 'loose_ambiguous' then error('invite atomic: invalid decision') end
if ARGV[3] == '' then error('invite atomic: invalid inviter') end
for n = 4, 7 do integer(ARGV[n], 1, 2147483647) end
local lifetimeCap = integer(ARGV[8], 1, 9007199254740990)
local dailyCap = integer(ARGV[9], 1, 9007199254740990)
keytypes({'string', 'string', 'string', 'string', 'string', 'string'})
if redis.call('EXISTS', KEYS[1]) == 1 then return 'again' end
-- Even friends/credit must be validated before writing the arrival marker.
local count = counter(KEYS[3])
local day = counter(KEYS[4])
counter(KEYS[5])
counter(KEYS[6])
redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[4])
-- A normal no-match consumes the first launch. A read/preflight failure does not.
if decision ~= 'eligible' then return decision end
if not redis.call('SET', KEYS[2], ARGV[3], 'NX', 'EX', ARGV[5]) then return 'ip' end
if count >= lifetimeCap then return 'inviter_cap' end
if day >= dailyCap then return 'day_cap' end
for _, n in ipairs({3, 4, 5, 6}) do
  redis.call('INCR', KEYS[n])
  redis.call('EXPIRE', KEYS[n], n == 4 and ARGV[7] or ARGV[6])
end
return 'credited'
`;

export const MINT_ONE_LUA = `${PREFLIGHT}
if #ARGV ~= 5 then error('invite atomic: invalid arguments') end
local os = ARGV[1]
if os ~= 'ios' and os ~= 'android' then error('invite atomic: invalid os') end
local now = integer(ARGV[2], 0, 9007199254740990)
local playEnd = integer(ARGV[3], 0, 9007199254740990)
local reserve = integer(ARGV[4], 0, 9007199254740990)
integer(ARGV[5], 1, 2147483647)
keytypes({'string', 'set', 'set', 'hash'})
local credit = counter(KEYS[1])
if credit == 0 then return 'no_credit' end
if os == 'android' and now >= playEnd then return 'expired' end
-- Encode before SPOP so malformed arguments cannot strand a popped member.
local item = cjson.encode({os = os, at = now})
for attempt = 1, 3 do
  if os == 'android' and redis.call('SCARD', KEYS[2]) <= reserve then return 'reserve' end
  local code = redis.call('SPOP', KEYS[2])
  if not code then return 'empty' end
  local valid = string.match(code, '^[A-Z0-9]+$') and ((os == 'ios' and #code >= 8 and #code <= 24) or (os == 'android' and #code == 23))
  if not valid then
    redis.call('SADD', KEYS[3], code)
  else
    redis.call('HSET', KEYS[4], code, item)
    redis.call('EXPIRE', KEYS[4], ARGV[5], 'NX')
    redis.call('DECR', KEYS[1])
    return 'minted'
  end
end
return 'invalid'
`;
