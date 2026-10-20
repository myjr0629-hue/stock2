// Provider placeholders can be valid image/png responses (SYF: 328B; proxy: 368B).
// Apply the same conservative size floor to Parqet and FMP. Curated assets are
// trusted separately: a legitimate bundled SVG may be smaller than 600B.
export function isUsableLogo(buffer: Uint8Array, contentType: string, curated = false): boolean {
    return /^image\//i.test(contentType) && buffer.byteLength >= (curated ? 64 : 600);
}

// Per server instance: at most four cold ticker loads, with same-ticker requests
// sharing one promise. Queue time does not consume a provider's fetch timeout.
// A queue timeout returns null: callers must NOT cache this as a provider failure.
export function createLogoLoader<T>(concurrency = 4, queueTimeoutMs = 8000) {
    let active = 0;
    const waiters: (() => void)[] = [];
    const pending = new Map<string, Promise<T | null>>();

    function acquire(): Promise<boolean> {
        if (active < concurrency) {
            active++;
            return Promise.resolve(true);
        }
        return new Promise(resolve => {
            const grant = () => {
                clearTimeout(timer);
                active++;
                resolve(true);
            };
            const timer = setTimeout(() => {
                waiters.splice(waiters.indexOf(grant), 1);
                resolve(false);
            }, queueTimeoutMs);
            waiters.push(grant);
        });
    }

    return function load(key: string, task: () => Promise<T>): Promise<T | null> {
        const existing = pending.get(key);
        if (existing) return existing;
        const result = (async () => {
            if (!await acquire()) return null;
            try {
                return await task();
            } finally {
                active--;
                waiters.shift()?.();
            }
        })();
        pending.set(key, result);
        const cleanup = () => { pending.delete(key); };
        void result.then(cleanup, cleanup);
        return result;
    };
}
