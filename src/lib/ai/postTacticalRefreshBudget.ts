import { etDateOf } from '@/lib/marketCalendar';
import { POST_TACTICAL_MAX_REFRESHES, POST_TACTICAL_REFRESH_MS, tacticalSessionAt } from './tacticalIndexFacts';

/** 모든 언어·인스턴스가 한 ET 날짜 키를 공유한다. 실패도 호출 전에 차감하고 30분 쉰다. */
export const POST_TACTICAL_REFRESH_LUA = `
local raw = redis.call('GET', KEYS[1])
local state = raw and cjson.decode(raw) or {count=0, at=0}
local now = tonumber(ARGV[1])
if state.count >= tonumber(ARGV[3]) or now - state.at < tonumber(ARGV[2]) then return 0 end
redis.call('SET', KEYS[1], cjson.encode({count=state.count+1, at=now}), 'EX', 86400)
return 1
`;
export async function reservePostTacticalRefresh(redis: { eval: (script: string, keys: string[], args: number[]) => Promise<unknown> } | null, now: number): Promise<boolean> {
    if (!redis || tacticalSessionAt(now) !== 'POST') return false;
    try {
        return await redis.eval(POST_TACTICAL_REFRESH_LUA, [`guardian:tactical:futures-refresh:${etDateOf(now)}`],
            [now, POST_TACTICAL_REFRESH_MS, POST_TACTICAL_MAX_REFRESHES]) === 1;
    } catch { return false; } // 예약 저장소 장애 시 기존 글 유지. 상한을 확인하지 못한 추가 호출은 금지.
}
