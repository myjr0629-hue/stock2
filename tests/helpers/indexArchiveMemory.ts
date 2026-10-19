import { atomicArchiveSave, type AtomicArchiveStore } from '../../src/lib/atomicArchiveSave';

// Redis protocol only: WATCH/EXEC compares versions, never source timestamps.
// EVAL seam executes the production WATCH implementation with the same JSON.
export function indexArchiveMemory(values: Map<string, any>, writes: any[][] = []) {
    const versions = new Map<string, number>();
    const stats = { conflicts: 0 };
    const hooks: { beforeExec?: (key: string, value: any) => Promise<void> } = {};
    const store: AtomicArchiveStore = { connectWatch: async () => {
        let key = '', version = 0;
        return {
            watch: async watched => { key = watched; version = versions.get(key) ?? 0; },
            get: async read => values.has(read) ? JSON.stringify(values.get(read)) : null,
            unwatch: async () => {}, disconnect() {},
            multi: () => ({ set: (target, raw, ...expiry) => ({ exec: async () => {
                await hooks.beforeExec?.(target, JSON.parse(raw));
                if (version !== (versions.get(key) ?? 0)) { stats.conflicts++; return null; }
                const value = JSON.parse(raw);
                values.set(target, value);
                versions.set(target, version + 1);
                writes.push([target, value, ...expiry]);
                return [[null, 'OK']];
            } }) }),
        };
    } };
    class Redis {
        get = async (key: string) => values.get(key) ?? null;
        eval = async (_script: string, keys: string[], args: (string | number)[]) =>
            atomicArchiveSave(store, keys[0], JSON.parse(String(args[0])), args[1] === '' ? undefined : Number(args[1]));
    }
    return { Redis, hooks, stats };
}
