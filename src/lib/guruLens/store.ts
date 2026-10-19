/** Publication only: one existing Upstash store, no EC2 fallback/replication. */
import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import type { Head } from './pipeline';
import type { Snapshot } from './types';
import { LENS_IDS } from './types';

const HEAD = 'guru:lens:v1:head';
const LOCK = 'guru:lens:v1:publication-lock';
export type CommitResult = 'published' | 'older_generation' | 'head_changed' | 'lock_lost' | 'write_failed';
export interface PublicationStore {
    read<T>(key: string): Promise<T | null>;
    acquire(): Promise<string | null>;
    save(key: string, value: unknown, owner: string): Promise<boolean>;
    commit(next: Snapshot, previous: string | null, expected: Head | null, owner: string): Promise<CommitResult>;
    release(owner: string): Promise<void>;
}
export interface PublicationClient {
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: string, options: { nx: true; ex: number }): Promise<unknown>;
    eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

// Compare lease + source date + expected pointer BEFORE updating the publication head.
// Saved generations are immutable. The atomic head update also checks the lease.
export const PUBLISH_LUA = `
if #KEYS ~= 13 or #ARGV ~= 3 then return 'write_failed' end
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 'lock_lost' end
local incoming = cjson.decode(ARGV[3])
local expected = cjson.decode(ARGV[2])
local raw = redis.call('GET', KEYS[2])
local current = raw and cjson.decode(raw) or cjson.null
if current ~= cjson.null then
    local basis = current.asOf
    if not basis then
        local meta = redis.call('GET', 'guru:lens:v1:meta:' .. current.current)
        if not meta then return 'head_changed' end
        local old = cjson.decode(meta)
        basis = old.asOf
        if not basis and old.companies then
            for _, company in pairs(old.companies) do
                local d = company.priceDate
                if type(d) == 'string' and d ~= '' and (not basis or d < basis) then basis = d end
            end
        end
        if not basis then return 'head_changed' end
    end
    if basis >= incoming.asOf then return 'older_generation' end
end
if (current == cjson.null) ~= (expected == cjson.null) then return 'head_changed' end
if current ~= cjson.null and (current.current ~= expected.current or current.previous ~= expected.previous
    or current.asOf ~= expected.asOf) then return 'head_changed' end
-- A failed or incomplete generation must never become the publication pointer.
for i = 3, 13 do
    local value = redis.call('GET', KEYS[i])
    if not value or cjson.decode(value).date ~= incoming.current then return 'write_failed' end
end
redis.call('SET', KEYS[2], ARGV[3])
return 'published'
`;
/** Lease-guarded immutable generation save; retries can confirm identical content. */
export const SAVE_LUA = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
local raw = redis.call('GET', KEYS[2])
if raw then
    if raw == ARGV[2] then return 1 else return 0 end
end
redis.call('SET', KEYS[2], ARGV[2])
return 1
`;
export const RELEASE_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`;

/** Client injection keeps protocol tests offline; production initialization is lazy. */
export function createPublicationStore(client: () => PublicationClient): PublicationStore {
    return {
        read: <T>(key: string) => client().get<T>(key),
        acquire: async () => {
            const owner = randomUUID();
            return (await client().set(LOCK, owner, { nx: true, ex: 60 })) === 'OK' ? owner : null;
        },
        save: async (key, value, owner) => {
            try { return await client().eval(SAVE_LUA, [LOCK, key], [owner, JSON.stringify(value)]) === 1; }
            catch { return false; }
        },
        commit: async (next, previous, expected, owner) => {
            const head: Head = { current: next.date, previous, asOf: next.asOf };
            const keys = [LOCK, HEAD, ...LENS_IDS.map((id) => `guru:lens:v1:${id}:${next.date}`),
                `guru:lens:v1:meta:${next.date}`];
            const args = [owner, JSON.stringify(expected), JSON.stringify(head)];
            try {
                const result = await client().eval(PUBLISH_LUA, keys, args);
                if (['published', 'older_generation', 'head_changed', 'lock_lost'].includes(String(result)))
                    return result as CommitResult;
                return 'write_failed';
            } catch { return 'write_failed'; }
        },
        release: async (owner) => { await client().eval(RELEASE_LUA, [LOCK], [owner]); },
    };
}
let client: Redis | undefined;
export const publicationStore = createPublicationStore(() => {
    if (!client) {
        const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
        const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
        if (!url || !token) throw new Error('publication_store_unavailable');
        client = new Redis({ url, token, retry: false });
    }
    return client;
});
