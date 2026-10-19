import { Redis } from '@upstash/redis';
import { atomicArchiveSave } from '@/lib/atomicArchiveSave';
import { indexCloseSnapshot, type IndexCloseQuote } from '@/lib/indexCloseSnapshot';

// One authority for v2 archives: never send atomic writes through the EC2
// GET/SET proxy or switch Redis after a timeout. v1 remains a read-only fallback.
export const indexAtomicKey = (key: string) => `${key}:last-good:v2`;
let client: Redis | undefined;
function archiveClient(): Redis {
    if (client) return client;
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) throw new Error('index archive: store unavailable');
    client = new Redis({ url, token, retry: false, signal: () => AbortSignal.timeout(3000) });
    return client;
}

export async function saveIndexArchive(key: string, quote: unknown, revision: number) {
    const snapshot = indexCloseSnapshot(quote);
    if (!snapshot) throw new Error('index archive: invalid observation');
    const redis = archiveClient();
    // The source timestamp always orders sessions/ticks first. revision only
    // orders complete responses for the SAME source timestamp, including zero.
    return atomicArchiveSave({ eval: (script, keys, args) => redis.eval(script, keys, args) }, indexAtomicKey(key), {
        ...snapshot, sourceTime: Date.parse(snapshot.marketTime), revision,
    });
}

export async function readIndexArchive(key: string): Promise<IndexCloseQuote | null> {
    return indexCloseSnapshot(await archiveClient().get(indexAtomicKey(key)));
}
