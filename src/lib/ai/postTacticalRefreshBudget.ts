import { etDateOf } from '@/lib/marketCalendar';
import { POST_TACTICAL_DRIFT_MAX_REGEN_ATTEMPTS, POST_TACTICAL_REFRESH_MS, tacticalSessionAt } from './tacticalIndexFacts';

export const POST_TACTICAL_FAILURE_COOLDOWN_MS = 60 * 60_000;
export const POST_TACTICAL_MAX_CONSECUTIVE_FAILURES = 2;
type BudgetRedis = { eval: (script: string, keys: string[], args: number[]) => Promise<unknown> };
const budgetKey = (now: number) => `guardian:tactical:futures-refresh:${etDateOf(now)}`;

/** 모든 언어·인스턴스가 한 ET 날짜 키를 공유한다. 생성 시도 전에 차감한다.
 * 결과 기록이 유실돼도 폭주하지 않도록 예약은 잠정 실패로 잡고, 공급사 응답 성공 시 해제한다.
 * 공급사 사다리 내부 전환은 기존 일반 생성 정책이다.
 */
export const POST_TACTICAL_REFRESH_LUA = `
local raw = redis.call('GET', KEYS[1])
local state = raw and cjson.decode(raw) or {count=0, at=0}
local now = tonumber(ARGV[1])
local failures = state.failures or 0
if state.count >= tonumber(ARGV[3]) or failures >= tonumber(ARGV[5]) or now < (state.retryAt or state.at + tonumber(ARGV[2])) then return 0 end
redis.call('SET', KEYS[1], cjson.encode({count=state.count+1, at=now, failures=failures+1, retryAt=now+tonumber(ARGV[4])}), 'EX', 86400)
return 1
`;
/** 해당 예약만 확정한다. 실패는 종료부터 60분 쉬고, 성공은 연속 실패를 초기화한다. */
export const POST_TACTICAL_REFRESH_RESULT_LUA = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local state = cjson.decode(raw)
if state.at ~= tonumber(ARGV[1]) then return 0 end
if tonumber(ARGV[2]) == 1 then
    state.failures = 0
    state.retryAt = state.at + tonumber(ARGV[4])
else
    state.retryAt = tonumber(ARGV[3]) + tonumber(ARGV[5])
end
redis.call('SET', KEYS[1], cjson.encode(state), 'EX', 86400)
return 1
`;
export async function reservePostTacticalRefresh(redis: BudgetRedis | null, now: number): Promise<boolean> {
    if (!redis || tacticalSessionAt(now) !== 'POST') return false;
    try {
        return await redis.eval(POST_TACTICAL_REFRESH_LUA, [budgetKey(now)],
            [now, POST_TACTICAL_REFRESH_MS, POST_TACTICAL_DRIFT_MAX_REGEN_ATTEMPTS,
                POST_TACTICAL_FAILURE_COOLDOWN_MS, POST_TACTICAL_MAX_CONSECUTIVE_FAILURES]) === 1;
    } catch { return false; } // 예약 저장소 장애 시 기존 글 유지. 상한을 확인하지 못한 추가 호출은 금지.
}
export async function finishPostTacticalRefresh(redis: BudgetRedis | null, reservedAt: number, succeeded: boolean, finishedAt: number): Promise<void> {
    try {
        await redis?.eval(POST_TACTICAL_REFRESH_RESULT_LUA, [budgetKey(reservedAt)],
            [reservedAt, succeeded ? 1 : 0, finishedAt, POST_TACTICAL_REFRESH_MS, POST_TACTICAL_FAILURE_COOLDOWN_MS]);
    } catch { /* 결과 기록 장애 시 예약의 잠정 실패·60분 대기·2회 중지를 유지한다. */ }
}
