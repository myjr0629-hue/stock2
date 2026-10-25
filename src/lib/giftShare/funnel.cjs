// 공유 가능한 닫힌 목록. 일별 KST 정수 카운터만 저장하며 식별자는 받지 않는다.
const SURFACES = ['gift_set', 'gift_dash', 'gift_pop', 'sh_pick', 'sh_line', 'sh_earn', 'ticker', 'rank', 'all'];
const PLATFORMS = ['ios', 'android', 'web', 'desktop'];
const KINDS = ['attached', 'legacy', 'general', 'content'];
const GATES = ['config_pending', 'config_error', 'off', 'unavailable', 'clock', 'device', 'random', 'local_cap', 'ledger', 'reserve_rejected', 'reserve_error', 'not_ready', 'platform', 'consumed', 'stale', 'hold', 'reservation', 'device_changed', 'pending', 'storage', 'cfg_missing', 'busy'];
const CLIENT_STAGES = ['visible', 'tap', 'payload', 'sheet', 'copy', 'cancel', 'failed', 'gate'];
const CLAIMS = ['new', 'again', 'expired', 'taken', 'recipient', 'cap', 'empty', 'invalid', 'error', 'disabled', 'os', 'origin', 'cookie', 'body', 'store'];
function validEvent(stage, surface, platform, detail) {
  if (!SURFACES.includes(surface) || !PLATFORMS.includes(platform)) return false;
  if (stage === 'issue') return surface === 'all' && ['ios', 'android', 'web'].includes(platform) && detail === 'new';
  if (stage === 'visible' || stage === 'tap' || stage === 'open' || stage === 'redeem') return detail === 'all';
  if (['payload', 'sheet', 'copy', 'cancel', 'failed'].includes(stage)) return KINDS.includes(detail);
  if (stage === 'gate') return GATES.includes(detail);
  return stage === 'claim' && CLAIMS.includes(detail);
}
const kstDay = (ms = Date.now()) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
const funnelKey = (day, production) => `${production ? 'promo:gift:v1' : 'promo:pv:gift:v1'}:funnel:${day}`;
const field = (stage, surface, platform, detail) => `${stage}|${surface}|${platform}|${detail}`;
function validClientEvent(stage, surface, platform, detail) {
  return CLIENT_STAGES.includes(stage) && surface !== 'all' && platform !== 'desktop' &&
    (stage !== 'visible' || surface.startsWith('gift_')) && validEvent(stage, surface, platform, detail);
}
// 인스턴스 메모리에 모은 «묶음» 하나를 EVAL 1회로 반영한다(요청마다 호출하지 않는다).
// 전역 상한 2개를 Redis 한 키에서 원자적으로 검사한다:
//  ① _calls:<lane> — 이 레인이 오늘 받아들인 EVAL 수. CALL_CAP 이상이면 쓰기 0으로 -1 반환 →
//     인스턴스는 당일 그 레인의 호출을 0으로 멈춘다(인스턴스당 거부 호출 최대 1회).
//  ② _budget:<lane> — 오늘 반영한 이벤트 수. DAY_CAP 에서 잘라 쓴다(위조 수치의 천장).
// ARGV: 1 만료(초) · 2 레인 · 3 DAY_CAP · 4 CALL_CAP · 5.. (필드, 개수) 쌍. 필드는 서버 코드가 닫힌 목록에서 만든다.
const BUMP_LUA = `
local lane = ARGV[2]
local calls = tonumber(redis.call('HGET',KEYS[1],'_calls:'..lane) or '0')
if not calls then return 0 end
if calls >= tonumber(ARGV[4]) then return -1 end
local total = tonumber(redis.call('HGET',KEYS[1],'_budget:'..lane) or '0')
if not total then return 0 end
local cap = tonumber(ARGV[3])
redis.call('HSET',KEYS[1],'_calls:'..lane,calls+1)
redis.call('EXPIREAT',KEYS[1],ARGV[1])
if total >= cap then return -1 end
local sum = 0
for i=5,#ARGV,2 do
  local n = tonumber(ARGV[i+1])
  if n and n > 0 and total + sum < cap then
    if total + sum + n > cap then n = cap - total - sum end
    local value = tonumber(redis.call('HGET',KEYS[1],ARGV[i]) or '0')
    if value then
      redis.call('HSET',KEYS[1],ARGV[i],value+n)
      sum = sum + n
    end
  end
end
redis.call('HSET',KEYS[1],'_budget:'..lane,total+sum)
return 1`;
module.exports = { SURFACES, PLATFORMS, KINDS, GATES, CLAIMS, CLIENT_STAGES, validEvent, validClientEvent, kstDay, funnelKey, field, BUMP_LUA };
