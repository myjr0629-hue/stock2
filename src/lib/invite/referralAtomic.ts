/**
 * 토큰 귀속 추천 보상의 원자 연산 — 2026-11-13 (브랜치 feat/referral-1113).
 * 규칙은 atomic.ts 와 같다: 모든 키는 KEYS, 정책·시각·TTL 은 ARGV. Redis Lua 는 런타임 오류를 되돌리지 않으므로
 * 첫 쓰기 «전»에 인자·키 형식을 다 본다. 응답을 잃어도 보정(되돌리기)하지 않는다 — 서버에서 이미 반영됐을 수 있다.
 * 시험(tests/referral.test.ts)은 같은 Lua «원문»을 순수 JS 해석기(tests/_giftLuaMock.mjs)로 직렬 실행해 메모리 저장소와 결과를 대조한다
 * — 그래서 그 해석기가 아는 문법만 쓴다(error()·string.match·local function 없음 → 'invalid' 를 돌려주고 저장소가 예외로 바꾼다).
 */

export type ArriveClaimDecision = 'claim' | 'legacy' | 'none' | 'self' | 'loose_ambiguous';
export type ArriveClaimResult = 'again' | 'claimed' | Exclude<ArriveClaimDecision, 'claim'>;
export interface ArriveClaimInput {
  /** arrived(친구 ref 당 평생 1회), claim(확인 대기 기록) */
  keys: [string, string];
  now: number;
  decision: ArriveClaimDecision;
  /** decision='claim' 일 때만 — JSON {r,u,at,arr,os,f,ip,l?} (번호·열쇠·RC ID 원문 없음) */
  claim: string;
  arriveTtl: number;
  claimTtl: number;
}

export type VerifyCreditResult = 'credited' | 'again' | 'none' | 'dup' | 'ip' | 'inviter_cap' | 'day_cap';
export interface VerifyCreditInput {
  /** claim, done, rcUser, rcTxn, ipCredit, month, day, credit, friends */
  keys: [string, string, string, string, string, string, string, string, string];
  now: number;
  inviterRef: string;
  monthCap: number;
  dailyCap: number;
  /** 스토어 거래 해시가 있나(없으면 rcTxn 키는 읽지도 쓰지도 않는다) */
  hasTxn: boolean;
  rcTtl: number;
  ipTtl: number;
  longTtl: number;
  dayTtl: number;
  monthTtl: number;
  doneTtl: number;
}

const MAX = Number.MAX_SAFE_INTEGER - 1;
function integer(n: number, min: number, max = MAX) {
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error('referral atomic: invalid argument');
}
function keysValid(keys: string[], count: number) {
  if (keys.length !== count || keys.some(k => typeof k !== 'string' || !k) || new Set(keys).size !== count) throw new Error('referral atomic: invalid keys');
}
const TTL_MAX = 2_147_483_647;

export function arriveClaimArgs(i: ArriveClaimInput): (string | number)[] {
  keysValid(i.keys, 2);
  integer(i.now, 0); integer(i.arriveTtl, 1, TTL_MAX); integer(i.claimTtl, 1, TTL_MAX);
  if (!['claim', 'legacy', 'none', 'self', 'loose_ambiguous'].includes(i.decision)) throw new Error('referral atomic: invalid decision');
  if (i.decision === 'claim' && (typeof i.claim !== 'string' || !i.claim || i.claim.length > 1024)) throw new Error('referral atomic: invalid claim');
  return [i.now, i.decision, i.decision === 'claim' ? i.claim : '', i.arriveTtl, i.claimTtl];
}

export function verifyCreditArgs(i: VerifyCreditInput): (string | number)[] {
  keysValid(i.keys, 9);
  integer(i.now, 0); integer(i.monthCap, 1); integer(i.dailyCap, 1);
  for (const t of [i.rcTtl, i.ipTtl, i.longTtl, i.dayTtl, i.monthTtl, i.doneTtl]) integer(t, 1, TTL_MAX);
  if (typeof i.inviterRef !== 'string' || !i.inviterRef) throw new Error('referral atomic: invalid inviter');
  return [i.now, i.inviterRef, i.monthCap, i.dailyCap, i.hasTxn ? '1' : '0', i.rcTtl, i.ipTtl, i.longTtl, i.dayTtl, i.monthTtl, i.doneTtl];
}

export const ARRIVE_CLAIM_LUA = `
if #KEYS ~= 2 or #ARGV ~= 5 then return 'invalid' end
local now = tonumber(ARGV[1])
local decision = ARGV[2]
local arriveTtl = tonumber(ARGV[4])
local claimTtl = tonumber(ARGV[5])
if not now or not arriveTtl or not claimTtl or arriveTtl < 1 or claimTtl < 1 then return 'invalid' end
if decision ~= 'claim' and decision ~= 'legacy' and decision ~= 'none' and decision ~= 'self' and decision ~= 'loose_ambiguous' then return 'invalid' end
if decision == 'claim' and ARGV[3] == '' then return 'invalid' end
for i = 1, 2 do
  local kind = redis.call('TYPE', KEYS[i]).ok
  if kind ~= 'none' and kind ~= 'string' then return 'invalid' end
end
if redis.call('EXISTS', KEYS[1]) == 1 then return 'again' end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[4])
if decision ~= 'claim' then return decision end
if redis.call('EXISTS', KEYS[2]) == 1 then return 'again' end
redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[5])
return 'claimed'
`;

export const VERIFY_CREDIT_LUA = `
if #KEYS ~= 9 or #ARGV ~= 11 then return 'invalid' end
for n = 1, 11 do
  if n ~= 2 and n ~= 5 and not tonumber(ARGV[n]) then return 'invalid' end
end
if ARGV[2] == '' then return 'invalid' end
for i = 1, 9 do
  local kind = redis.call('TYPE', KEYS[i]).ok
  if kind ~= 'none' and kind ~= 'string' then return 'invalid' end
end
if redis.call('EXISTS', KEYS[2]) == 1 then return 'again' end
if redis.call('EXISTS', KEYS[1]) == 0 then return 'none' end
local month = tonumber(redis.call('GET', KEYS[6]) or '0')
local day = tonumber(redis.call('GET', KEYS[7]) or '0')
local credit = tonumber(redis.call('GET', KEYS[8]) or '0')
local friends = tonumber(redis.call('GET', KEYS[9]) or '0')
if not month or not day or not credit or not friends then return 'invalid' end
if month < 0 or day < 0 or credit < 0 or friends < 0 then return 'invalid' end
local dupTxn = false
if ARGV[5] == '1' then dupTxn = redis.call('EXISTS', KEYS[4]) == 1 end
if redis.call('EXISTS', KEYS[3]) == 1 or dupTxn then
  redis.call('SET', KEYS[2], 'dup', 'EX', ARGV[11])
  return 'dup'
end
if redis.call('EXISTS', KEYS[5]) == 1 then
  redis.call('SET', KEYS[2], 'ip', 'EX', ARGV[11])
  return 'ip'
end
if month >= tonumber(ARGV[3]) then
  redis.call('SET', KEYS[2], 'inviter_cap', 'EX', ARGV[11])
  return 'inviter_cap'
end
if day >= tonumber(ARGV[4]) then return 'day_cap' end
redis.call('SET', KEYS[3], ARGV[2], 'EX', ARGV[6])
if ARGV[5] == '1' then redis.call('SET', KEYS[4], ARGV[2], 'EX', ARGV[6]) end
redis.call('SET', KEYS[5], ARGV[2], 'EX', ARGV[7])
redis.call('INCR', KEYS[6])
redis.call('EXPIRE', KEYS[6], ARGV[10])
redis.call('INCR', KEYS[7])
redis.call('EXPIRE', KEYS[7], ARGV[9])
redis.call('INCR', KEYS[8])
redis.call('EXPIRE', KEYS[8], ARGV[8])
redis.call('INCR', KEYS[9])
redis.call('EXPIRE', KEYS[9], ARGV[8])
redis.call('SET', KEYS[2], 'credited', 'EX', ARGV[11])
return 'credited'
`;

export const ARRIVE_CLAIM_RESULTS: readonly ArriveClaimResult[] = ['again', 'claimed', 'legacy', 'none', 'self', 'loose_ambiguous'];
export const VERIFY_CREDIT_RESULTS: readonly VerifyCreditResult[] = ['credited', 'again', 'none', 'dup', 'ip', 'inviter_cap', 'day_cap'];
