import { cashSessionPhaseAt, etDateOf, etMinutesOf, isNonTradingDay, optionExpirationFloor } from '@/lib/marketCalendar';
import { newWatchlistBatchTiming, type WatchlistBatchTiming } from '@/lib/watchlistBatchTiming';
import { type WatchlistBatchMode } from '@/services/watchlistBatchService';

export type BatchPayload = { results: any[]; meta: {
    count: number; elapsed: number; source: string; cached?: boolean; levelsWaitMs?: number;
} };
export type BatchEnvelope = { at: number; scope: string; mode: WatchlistBatchMode; ticker: string;
    result: any; meta: BatchPayload['meta'] };
type Flight = { run: () => Promise<BatchEnvelope> };
type Dependencies = {
    read: (keys: string[]) => Promise<(BatchEnvelope | null)[]>;
    write: (key: string, value: BatchEnvelope, ttl: number) => Promise<unknown>;
    compute: (tickers: string[], mode: WatchlistBatchMode, timing: WatchlistBatchTiming) => Promise<BatchPayload>;
    after: (work: () => Promise<void>) => void;
    now?: () => number;
};

export const watchlistBatchKey = (ticker: string, mode: WatchlistBatchMode) => `perf:watchlist-batch:v1:${mode}:${ticker}`;

/** 세션 전환·휴장·조기 폐장·옵션 만기 경계에서는 TTL 안이어도 동기 계산한다. */
export function watchlistBatchWindow(now: number) {
    const date = etDateOf(now), minute = etMinutesOf(now);
    const regular = cashSessionPhaseAt(now) === 'regular';
    const phase = isNonTradingDay(date) ? 'closed' : regular ? 'regular'
        : minute >= 240 && minute < 570 ? 'pre'
        : minute >= 570 && minute < 1200 ? 'post' : 'night';
    return { scope: `${date}:${phase}:${optionExpirationFloor(now)}`,
        fresh: regular ? 15_000 : 60_000, maxAge: regular ? 60_000 : 600_000 };
}

function normalResult(result: any): boolean {
    return !!result?.ticker && !result.error && !!result.realtime
        && typeof result.realtime.price === 'number' && Number.isFinite(result.realtime.price)
        && result.realtime.price > 0
        && (!Array.isArray(result.realtime.missingFields) || !result.realtime.missingFields.includes('price'));
}

/** 값이 있던 원천 필드의 결측은 정상 갱신이 아니다. 0/false는 유효한 값이다. */
function lostSourceValue(previous: any, next: any): boolean {
    const empty = (value: any): boolean => value == null
        || (typeof value === 'string' && value.trim() === '')
        || (typeof value === 'object' && Object.keys(value).length === 0);
    if (empty(previous)) return false;
    if (empty(next)) return true;
    if (typeof previous === 'object' && !Array.isArray(previous)) {
        return Object.entries(previous).some(([field, value]) => lostSourceValue(value, next[field]));
    }
    return false;
}

/** 배치 API만 사용한다. SSR·포트폴리오 등 다른 소비자의 캐시 정책에는 관여하지 않는다. */
export function createWatchlistBatchCache(deps: Dependencies) {
    const memory = new Map<string, BatchEnvelope>();
    const reads = new Map<string, Promise<BatchEnvelope | null>>();
    // after 콜백이 실행되기 전부터 예약한다. 겹치는 종목 목록도 종목·모드·세션별 한 작업으로 합친다.
    const flights = new Map<string, Flight>();
    const now = deps.now ?? Date.now;
    const flightKey = (key: string, scope: string) => `${scope}:${key}`;
    const remember = (key: string, env: BatchEnvelope) => {
        if (!memory.has(key) && memory.size >= 1000) memory.delete(memory.keys().next().value!);
        memory.set(key, env);
    };
    const valid = (env: BatchEnvelope | null | undefined, ticker: string, mode: WatchlistBatchMode, scope: string | null, at: number): env is BatchEnvelope =>
        !!env && typeof env.scope === 'string' && (scope === null || env.scope === scope) && env.mode === mode && env.ticker === ticker
        && Number.isFinite(env.at) && env.at <= at && normalResult(env.result)
        && env.result.ticker === ticker && !!env.meta && Number.isFinite(env.meta.elapsed)
        && typeof env.meta.source === 'string' && Number.isFinite(env.meta.count) && env.meta.count > 0;

    async function hydrate(tickers: string[], mode: WatchlistBatchMode, scope: string) {
        const missing = tickers.filter(t => {
            const key = watchlistBatchKey(t, mode);
            return !memory.has(key) && !reads.has(key) && !flights.has(flightKey(key, scope));
        });
        if (missing.length) {
            const keys = missing.map(t => watchlistBatchKey(t, mode));
            const batch = deps.read(keys).catch(() => keys.map(() => null));
            keys.forEach((key, i) => {
                const read = batch.then(values => {
                    const env = values[i];
                    // 지난 세션 정상본도 완결성 비교용으로 보관한다. 응답은 아래 세션/나이 검사를 따른다.
                    if (valid(env, missing[i], mode, null, now())) {
                        // 더 늦게 끝난 Redis 읽기가 이미 계산된 새 메모리 정상본을 덮지 않는다.
                        const current = memory.get(key);
                        if (!current || current.at < env.at) remember(key, env);
                        return env;
                    }
                    return null;
                }).finally(() => { reads.delete(key); });
                reads.set(key, read);
            });
        }
        await Promise.all(tickers.map(t => reads.get(watchlistBatchKey(t, mode))));
    }

    function reserve(tickers: string[], mode: WatchlistBatchMode, timing: WatchlistBatchTiming): Flight[] {
        const start = now(), window = watchlistBatchWindow(start);
        const missing = tickers.filter(t => !flights.has(flightKey(watchlistBatchKey(t, mode), window.scope)));
        if (missing.length) {
            let work: Promise<Map<string, BatchEnvelope>> | undefined;
            const runBatch = () => work ??= (async () => {
                try {
                    const payload = await deps.compute(missing, mode, timing);
                    const byTicker = new Map(payload.results.map(r => [r.ticker, r]));
                    const envelopes = new Map<string, BatchEnvelope>();
                    await Promise.all(missing.map(async ticker => {
                        const result = byTicker.get(ticker) ?? { ticker, error: 'Analysis failed' };
                        // JSON 표준화는 저장본의 undefined/NaN 처리도 HTTP 직렬화와 같게 한다.
                        const env: BatchEnvelope = JSON.parse(JSON.stringify({ at: start, scope: window.scope,
                            mode, ticker, result, meta: payload.meta }));
                        envelopes.set(ticker, env);
                        if (timing.failed || !normalResult(result)) return;
                        const end = now(), currentWindow = watchlistBatchWindow(end);
                        if (currentWindow.scope !== window.scope || end - start > currentWindow.maxAge) return;
                        const key = watchlistBatchKey(ticker, mode);
                        const previous = memory.get(key);
                        if (previous && previous.at > env.at) return;
                        // 일부 값만 섞으면 파생 지표·원천 시각이 새 판본처럼 보일 수 있어 전체 교체를 거부한다.
                        // 기존 envelope의 at/meta와 모든 원천 시각을 그대로 보존하며 수명도 연장하지 않는다.
                        if (previous && lostSourceValue(previous.result, env.result)) return;
                        remember(key, env);
                        // 저장 실패도 메모리 정상본을 지우거나 시각을 다시 찍지 않는다.
                        await deps.write(key, env, 3600).catch(() => undefined);
                    }));
                    return envelopes;
                } finally {
                    missing.forEach(t => flights.delete(flightKey(watchlistBatchKey(t, mode), window.scope)));
                }
            })();
            missing.forEach(ticker => flights.set(flightKey(watchlistBatchKey(ticker, mode), window.scope), {
                run: async () => (await runBatch()).get(ticker)!,
            }));
        }
        return tickers.map(t => flights.get(flightKey(watchlistBatchKey(t, mode), window.scope))!);
    }

    return async function getBatch(tickers: string[], mode: WatchlistBatchMode, timing: WatchlistBatchTiming): Promise<BatchPayload> {
        if (!tickers.length) return deps.compute(tickers, mode, timing);
        const unique = [...new Set(tickers)];
        const memoryBefore = new Set(memory.keys());
        await hydrate(unique, mode, watchlistBatchWindow(now()).scope);
        const at = now(), window = watchlistBatchWindow(at);
        const ready = new Map<string, BatchEnvelope>();
        const stale: string[] = [], sync: string[] = [];
        for (const ticker of unique) {
            const key = watchlistBatchKey(ticker, mode), env = memory.get(key);
            if (valid(env, ticker, mode, window.scope, at) && at - env.at <= window.maxAge) {
                ready.set(ticker, env);
                timing[memoryBefore.has(key) ? 'memory' : 'redis']++;
                if (at - env.at >= window.fresh) { stale.push(ticker); timing.stale++; }
            } else {
                sync.push(ticker); timing.sync++;
            }
        }
        if (stale.length) {
            const backgroundTiming = newWatchlistBatchTiming();
            const owned = stale.filter(t => !flights.has(flightKey(watchlistBatchKey(t, mode), window.scope)));
            const tasks = reserve(owned, mode, backgroundTiming);
            if (tasks.length) {
                timing.refresh += tasks.length;
                try {
                    deps.after(async () => { await Promise.all(tasks.map(task => task.run().catch(() => undefined))); });
                } catch {
                    owned.forEach(t => flights.delete(flightKey(watchlistBatchKey(t, mode), window.scope)));
                }
            }
        }
        if (sync.length) {
            // 상한을 넘긴 요청은 예약된 after 작업도 직접 실행한다(응답 뒤 콜백을 기다리는 교착 방지).
            const tasks = reserve(sync, mode, timing);
            await Promise.all(sync.map(async (ticker, i) => { ready.set(ticker, await tasks[i].run()); }));
        }
        // 다른 종목의 동기 계산을 기다리는 동안 적중본이 상한/세션 경계를 넘었으면 다시 판정한다.
        const end = now(), endWindow = watchlistBatchWindow(end);
        const expiredHits = unique.filter(t => !sync.includes(t)).filter(t => {
            const env = ready.get(t)!;
            return !valid(env, t, mode, endWindow.scope, end) || end - env.at > endWindow.maxAge;
        });
        if (expiredHits.length) {
            timing.sync += expiredHits.length;
            const tasks = reserve(expiredHits, mode, timing);
            await Promise.all(expiredHits.map(async (ticker, i) => { ready.set(ticker, await tasks[i].run()); }));
        }
        const rows = tickers.map(t => ready.get(t)!);
        const metas = rows.map(row => row.meta);
        const meta = { ...metas[0], count: tickers.length,
            elapsed: Math.max(...metas.map(m => m.elapsed)) };
        if ('cached' in meta) meta.cached = metas.every(m => m.cached);
        if ('levelsWaitMs' in meta) meta.levelsWaitMs = Math.max(...metas.map(m => m.levelsWaitMs ?? 0));
        if (mode === 'full' && 'cached' in meta) meta.source = meta.cached ? 'analysis_cache' : 'hybrid_compute';
        // 소비자의 변경이 다음 요청의 마지막 정상본에 전파되지 않도록 매번 복제한다.
        return structuredClone({ results: rows.map(row => row.result), meta });
    };
}
