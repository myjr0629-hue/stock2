// 공유 가능한 닫힌 목록. 일별 KST 정수 카운터만 저장하며 식별자는 받지 않는다.
const SURFACES = ['gift_set', 'gift_dash', 'gift_pop', 'sh_pick', 'sh_line', 'sh_earn', 'ticker', 'rank', 'all'];
const PLATFORMS = ['ios', 'android', 'web', 'desktop'];
const KINDS = ['attached', 'legacy', 'general', 'content'];
const GATES = ['config_pending', 'config_error', 'off', 'unavailable', 'clock', 'device', 'random', 'local_cap', 'ledger', 'reserve_rejected', 'reserve_error', 'not_ready', 'platform', 'consumed', 'stale', 'hold', 'reservation', 'device_changed', 'pending', 'storage', 'cfg_missing', 'busy'];
const CLAIMS = ['new', 'again', 'expired', 'taken', 'recipient', 'cap', 'empty', 'invalid', 'error', 'disabled', 'os', 'origin', 'cookie', 'body', 'store'];
function validEvent(stage, surface, platform, detail) {
  if (!SURFACES.includes(surface) || !PLATFORMS.includes(platform)) return false;
  if (stage === 'visible' || stage === 'tap' || stage === 'open' || stage === 'redeem') return detail === 'all';
  if (['payload', 'sheet', 'copy', 'cancel', 'failed'].includes(stage)) return KINDS.includes(detail);
  if (stage === 'gate') return GATES.includes(detail);
  return stage === 'claim' && CLAIMS.includes(detail);
}
const kstDay = (ms = Date.now()) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
const funnelKey = (day, production) => `${production ? 'promo:gift:v1' : 'promo:pv:gift:v1'}:funnel:${day}`;
const field = (stage, surface, platform, detail) => `${stage}|${surface}|${platform}|${detail}`;
// 기존 giftStore.eval 방식. INCR와 만료를 원자로 묶어 동시 이벤트 손실을 막는다.
const BUMP_LUA = `redis.call('HINCRBY',KEYS[1],ARGV[1],1); redis.call('EXPIRE',KEYS[1],ARGV[2]); return 1`;
module.exports = { SURFACES, PLATFORMS, KINDS, GATES, CLAIMS, validEvent, kstDay, funnelKey, field, BUMP_LUA };
