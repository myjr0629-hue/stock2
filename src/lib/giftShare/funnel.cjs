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
// ISSUE_LUA와 같은 원칙: 모든 상한을 먼저 읽고 검사한 뒤에만 원자로 쓴다.
// 분산 인스턴스도 같은 일별 예산·256개 충돌 버킷을 공유한다. 거부 시 쓰기 0회.
const BUMP_LUA = `
local lane = ARGV[3]
local total = tonumber(redis.call('HGET',KEYS[1],'_budget:'..lane) or '0')
if not total then return 0 end
if total >= tonumber(ARGV[4]) then return -1 end
local minute = ARGV[5]
local fields = {'_ip:'..lane..':'..ARGV[6], '_device:'..lane..':'..ARGV[7]}
local counts = {}
for i=1,2 do
  local stamp = redis.call('HGET',KEYS[1],fields[i]..':m')
  counts[i] = stamp == minute and tonumber(redis.call('HGET',KEYS[1],fields[i]..':n') or '0') or 0
  if counts[i] >= tonumber(ARGV[i+7]) then return 0 end
end
local value = tonumber(redis.call('HGET',KEYS[1],ARGV[1]) or '0')
if not value then return 0 end
redis.call('HSET',KEYS[1],ARGV[1],value+1,'_budget:'..lane,total+1,
  fields[1]..':m',minute,fields[1]..':n',counts[1]+1,
  fields[2]..':m',minute,fields[2]..':n',counts[2]+1)
redis.call('EXPIREAT',KEYS[1],ARGV[2])
return 1`;
module.exports = { SURFACES, PLATFORMS, KINDS, GATES, CLAIMS, CLIENT_STAGES, validEvent, validClientEvent, kstDay, funnelKey, field, BUMP_LUA };
