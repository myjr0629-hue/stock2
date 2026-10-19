/** Offline Redis protocol fixture; never initializes a configured production client. */
import { createPublicationStore, PUBLISH_LUA, SAVE_LUA, RELEASE_LUA } from '../../src/lib/guruLens/store';
import type { PublicationClient } from '../../src/lib/guruLens/store';
import { HEAD_KEY, metaKey } from '../../src/lib/guruLens/pipeline';

export function memoryPublication(values = new Map<string, unknown>()) {
    let lease: string | null = null;
    let failKey: string | null = null;
    const writes: string[] = [];
    let beforeCommit: (() => Promise<void>) | undefined;
    const clone = <T>(v: T) => structuredClone(v);
    const client: PublicationClient = {
        get: async <T>(key: string) => clone((values.get(key) as T) ?? null),
        set: async (_key, owner) => {
            if (lease !== null) return null;
            lease = owner;
            return 'OK';
        },
        eval: async (script, keys, args) => {
            if (script === RELEASE_LUA) {
                if (lease !== args[0]) return 0;
                lease = null;
                return 1;
            }
            if (script === SAVE_LUA) {
                if (lease !== args[0]) return 0;
                const key = keys[1];
                writes.push(key);
                if (key === failKey) throw new Error('synthetic save failure');
                const existing = values.get(key);
                if (existing !== undefined) return JSON.stringify(existing) === args[1] ? 1 : 0;
                values.set(key, JSON.parse(args[1]));
                return 1;
            }
            if (script !== PUBLISH_LUA) throw new Error('unknown script');
            await beforeCommit?.();
            if (lease !== args[0]) return 'lock_lost';
            const expected = JSON.parse(args[1]), incoming = JSON.parse(args[2]);
            const current = values.get(HEAD_KEY) as any;
            if (current) {
                const meta = values.get(metaKey(current.current)) as any;
                const basis = current.asOf ?? meta?.asOf ?? (meta?.companies
                    ? Object.values<any>(meta.companies).map((c) => c.priceDate).filter(Boolean).sort()[0] : null);
                if (!basis) return 'head_changed';
                if (basis >= incoming.asOf) return 'older_generation';
            }
            if (!!current !== !!expected || (current && (
                current.current !== expected.current || current.previous !== expected.previous || current.asOf !== expected.asOf
            ))) return 'head_changed';
            for (const key of keys.slice(2))
                if ((values.get(key) as any)?.date !== incoming.current) return 'write_failed';
            writes.push(HEAD_KEY);
            if (failKey === HEAD_KEY) throw new Error('synthetic head failure');
            values.set(HEAD_KEY, incoming);
            return 'published';
        },
    };
    const cache = createPublicationStore(() => client);
    return {
        ...cache, values, writes,
        fail(key: string | null) { failKey = key; },
        expire() { lease = null; },
        beforeCommit(fn?: () => Promise<void>) { beforeCommit = fn; },
    };
}
