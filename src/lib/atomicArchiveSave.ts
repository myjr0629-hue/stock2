/**
 * 원천 순서를 비교하고 저장하는 서버 전용 기반. 기존 저장 호출처에는 아직 연결하지 않는다.
 *
 * sourceTime/observedAt은 epoch milliseconds 정수다(초·ISO 문자열은 호출자가 변환).
 * sourceTime 방식과 sessionDate+observedAt 방식은 같은 키에서 섞지 않는다.
 * 같은 원천이면 correction:true가 false/생략보다 우선한다. 둘 다 정정이면 선착순:
 * 정정 사이의 개정 순서까지 필요하면 별도 revision 계약이 필요하다.
 * 값은 원래 JSON 모양 그대로 저장한다. TTL은 실제 write 때만 설정한다.
 *
 * 저장소는 명시적으로 하나를 주입한다. EC2/Upstash 사이 자동 전환·복제는 하지 않는다
 * (서로 다른 Redis의 값을 비교하면 단일 키의 원자성을 보장할 수 없다).
 * llmStore의 get/setEx, redisClient의 getFromCache/setInCache는 이 계약을 구현할 수 없다.
 * 현재 EC2 HTTP 프록시는 EVAL/WATCH/CAS 미지원이므로 직접 연결하면 안 된다.
 */

export type ArchiveSource =
    | { sourceTime: number; sessionDate?: never; observedAt?: never; correction?: boolean }
    | { sourceTime?: never; sessionDate: string; observedAt: number; correction?: boolean };

export type AtomicArchiveResult = 'written' | 'skip-older' | 'skip-same' | 'skip-correction';

/** Upstash eval(script, keys, args) 모양. 클라이언트의 자동 재시도는 끄는 것을 권장한다. */
export interface ArchiveEvalClient {
    eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>;
}

/** ioredis 전용 연결. WATCH 상태가 연결에 속하므로 공유 연결을 반환하면 안 된다. */
export interface ArchiveWatchConnection {
    watch(key: string): Promise<unknown>;
    get(key: string): Promise<string | null>;
    unwatch(): Promise<unknown>;
    multi(): {
        set(key: string, value: string, expiryMode: 'EX', ttlSeconds: number): {
            exec(): Promise<[Error | null, unknown][] | null>;
        };
    };
    /** 풀로 반납하지 않고 전용 연결을 폐기한다. */
    disconnect(): void;
}

export type AtomicArchiveStore = {
    eval?: ArchiveEvalClient['eval'];
    /** 매 호출 새 연결. EVAL이 없거나 명시적으로 미지원일 때만 사용한다. */
    connectWatch?: () => Promise<ArchiveWatchConnection>;
};

type Stamp = { kind: 'time' | 'session'; day: string; time: number; correction: boolean };
const MAX_TIME = Number.MAX_SAFE_INTEGER;
const MAX_TTL = 2_147_483_647;

function stamp(value: unknown): Stamp {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('atomic archive: invalid record');
    const v = value as Record<string, unknown>;
    if (v.correction !== undefined && typeof v.correction !== 'boolean') throw new Error('atomic archive: invalid correction');
    const timeMode = v.sourceTime !== undefined;
    const time = timeMode ? v.sourceTime : v.observedAt;
    if (typeof time !== 'number' || !Number.isSafeInteger(time) || time < 0) throw new Error('atomic archive: invalid source time');
    if (timeMode) {
        if (v.sessionDate !== undefined || v.observedAt !== undefined) throw new Error('atomic archive: mixed source modes');
        return { kind: 'time', day: '', time, correction: v.correction === true };
    }
    const day = v.sessionDate;
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)
        || day < '0001-01-01' || !Number.isFinite(Date.parse(`${day}T00:00:00Z`))
        || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) {
        throw new Error('atomic archive: invalid session date');
    }
    return { kind: 'session', day, time, correction: v.correction === true };
}

function decide(previous: Stamp, incoming: Stamp): AtomicArchiveResult {
    if (previous.kind !== incoming.kind) throw new Error('atomic archive: source mode mismatch');
    const dayOrder = previous.day === incoming.day ? 0 : previous.day > incoming.day ? 1 : -1;
    const order = dayOrder || Math.sign(previous.time - incoming.time);
    if (order > 0) return 'skip-older';
    if (order < 0) return 'written';
    if (previous.correction && !incoming.correction) return 'skip-correction';
    if (incoming.correction && !previous.correction) return 'written';
    return 'skip-same';
}

/** GET·판정·SET EX가 한 EVAL 안에 있다. 모든 검증은 첫 쓰기 전에 끝낸다. */
export const ATOMIC_ARCHIVE_SAVE_LUA = `
local function invalid() error('atomic archive: invalid record') end
local function integer(n, max)
    return type(n) == 'number' and n >= 0 and n <= max and n == math.floor(n)
end
local function date(d)
    if type(d) ~= 'string' or not string.match(d, '^%d%d%d%d%-%d%d%-%d%d$') then return false end
    local y, m, day = tonumber(string.sub(d, 1, 4)), tonumber(string.sub(d, 6, 7)), tonumber(string.sub(d, 9, 10))
    if y < 1 or m < 1 or m > 12 or day < 1 then return false end
    local days = {31,28,31,30,31,30,31,31,30,31,30,31}
    if y % 4 == 0 and (y % 100 ~= 0 or y % 400 == 0) then days[2] = 29 end
    return day <= days[m]
end
local function stamp(raw)
    -- A JSON object only; JSON arrays are also Lua tables after decode.
    if type(raw) ~= 'string' or not string.match(raw, '^%s*{') then invalid() end
    local ok, v = pcall(cjson.decode, raw)
    if not ok or type(v) ~= 'table' then invalid() end
    if v.correction ~= nil and type(v.correction) ~= 'boolean' then invalid() end
    if v.sourceTime ~= nil then
        if v.sessionDate ~= nil or v.observedAt ~= nil or not integer(v.sourceTime, ${MAX_TIME}) then invalid() end
        return {kind='time', day='', time=v.sourceTime, correction=v.correction == true}
    end
    if not date(v.sessionDate) or not integer(v.observedAt, ${MAX_TIME}) then invalid() end
    return {kind='session', day=v.sessionDate, time=v.observedAt, correction=v.correction == true}
end
if #KEYS ~= 1 or KEYS[1] == '' or #ARGV ~= 2 then invalid() end
local ttl = tonumber(ARGV[2])
if not integer(ttl, ${MAX_TTL}) or ttl < 1 then invalid() end
local incoming = stamp(ARGV[1])
local raw = redis.call('GET', KEYS[1])
if raw then
    local previous = stamp(raw)
    if previous.kind ~= incoming.kind then error('atomic archive: source mode mismatch') end
    if previous.day > incoming.day or (previous.day == incoming.day and previous.time > incoming.time) then return 'skip-older' end
    if previous.day == incoming.day and previous.time == incoming.time then
        if previous.correction and not incoming.correction then return 'skip-correction' end
        if previous.correction == incoming.correction then return 'skip-same' end
    end
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
return 'written'
`;

function result(value: unknown): AtomicArchiveResult {
    if (value !== 'written' && value !== 'skip-older' && value !== 'skip-same' && value !== 'skip-correction') {
        throw new Error('atomic archive: invalid response');
    }
    return value;
}

/** 통신/ACL/스크립트 오류를 미지원으로 취급하지 않는다. 같은 저장소의 명시적 미지원만 폴백. */
function evalUnsupported(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return /^(?:ERR\s+)?unknown command\s+['"]?eval['"]?(?:\s|,|$)/i.test(error.message)
        || /^(?:ERR\s+)?(?:EVAL is not supported|unsupported command:?\s+EVAL)$/i.test(error.message);
}

/**
 * 성공·거절은 판정 문자열, 저장소/검증 오류는 예외. 호출자가 오류를 성공으로 삼키지 않아야 한다.
 * WATCH 충돌은 최신값을 다시 읽고 최대 8회 시도한다. timeout 이후 다른 저장소로 쓰지 않는다.
 */
export async function atomicArchiveSave<T extends ArchiveSource>(
    store: AtomicArchiveStore,
    key: string,
    value: T,
    ttlSeconds: number,
): Promise<AtomicArchiveResult> {
    if (typeof key !== 'string' || !key || !Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_TTL) {
        throw new Error('atomic archive: invalid key or TTL');
    }
    stamp(value);
    // toJSON/undefined/NaN 등에 의한 직렬화 후 메타데이터 변경도 검증한다.
    const raw = JSON.stringify(value);
    const incoming = stamp(JSON.parse(raw));
    if (store.eval) {
        try { return result(await store.eval(ATOMIC_ARCHIVE_SAVE_LUA, [key], [raw, ttlSeconds])); }
        catch (error) { if (!evalUnsupported(error)) throw error; }
    }
    if (!store.connectWatch) throw new Error('atomic archive: atomic operations unavailable');
    const connection = await store.connectWatch();
    try {
        for (let attempt = 0; attempt < 8; attempt++) {
            await connection.watch(key);
            const previous = await connection.get(key);
            const decision = previous === null ? 'written' : decide(stamp(JSON.parse(previous)), incoming);
            if (decision !== 'written') return decision;
            const replies = await connection.multi().set(key, raw, 'EX', ttlSeconds).exec();
            if (replies === null) continue; // WATCH 충돌: 읽기·비교부터 재시도
            if (replies.length !== 1 || replies[0][0] || replies[0][1] !== 'OK') {
                throw new Error('atomic archive: transaction failed');
            }
            return 'written';
        }
        throw new Error('atomic archive: contention limit');
    } finally {
        // 오류가 난 연결도 재사용하지 않는다. UNWATCH 실패가 원래 결과를 덮지 않게 한다.
        try { await connection.unwatch(); } catch { /* 전용 연결은 아래에서 폐기한다. */ }
        connection.disconnect();
    }
}
