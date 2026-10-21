import { fmpEtToMs } from '@/lib/fmpTime';
import { cashSessionPhaseAt, etDateOf, etMinutesOf } from '@/lib/marketCalendar';
import { sessionVwapFromBars } from '@/lib/vwap';
import { upstashMeterStore } from '@/lib/intrinioMeter';
import { bgStore } from '@/lib/intrinioBackground';
import { getFromCache, setInCache } from './redisClient';

type SessionVwap = NonNullable<ReturnType<typeof sessionVwapFromBars>>;
type Cached = { value: SessionVwap | null; expiresAt: number };
const pending = new Map<string, Promise<SessionVwap | null>>();
const local = new Map<string, Cached>();

/** 기존 분봉 산식 재사용. 최신 체결 폴링·전일 값·공정시장가로 누적 체결을 꾸미지 않는다. */
export function realtimeVwapFromMinutes(rows: unknown, date: string, now: number): SessionVwap | null {
    if (!Array.isArray(rows) || etDateOf(now) !== date || cashSessionPhaseAt(now) !== 'regular') return null;
    const minutes = new Map<number, any>();
    for (const r of rows) {
        const time = fmpEtToMs(r?.date);
        if (time == null || time > now || etDateOf(time) !== date || cashSessionPhaseAt(time) !== 'regular') continue;
        const minute = etMinutesOf(time);
        const bar = { etDate: date, session: 'REG', high: r.high, low: r.low, close: r.close, volume: r.volume };
        if (![r.high, r.low, r.close].every(x => typeof x === 'number' && Number.isFinite(x) && x > 0)
            || typeof r.volume !== 'number' || !Number.isFinite(r.volume) || r.volume < 0) return null;
        // 역순·동일 중복은 허용하되 서로 다른 중복·중간 누락은 누적값으로 쓰지 않는다.
        const previous = minutes.get(minute);
        if (previous && JSON.stringify(previous) !== JSON.stringify(bar)) return null;
        minutes.set(minute, bar);
    }
    const ordered = [...minutes.keys()].sort((a, b) => a - b);
    if (!ordered.length || ordered[0] !== 570 || ordered.some((m, i) => m !== 570 + i)) return null;
    // 지연된 다른 원천을 실시간 복구본으로 취급하지 않는다(미완성 현재 봉은 없어도 된다).
    if (etMinutesOf(now) - ordered[ordered.length - 1] > 2) return null;
    return sessionVwapFromBars([...minutes.values()]);
}

/** 신규 경로 전체에서 이동 60초당 HTTP 최대 30회. 저장소 장애 시 호출하지 않는다. */
async function reserveCall(): Promise<boolean> {
    // 공용 2초 간격: 분 경계에서 두 배로 몰리는 고정 분 버킷을 쓰지 않는다.
    return upstashMeterStore.setNxEx('vwap:fmp:budget', '1', 2);
}

function sessionCacheKey(symbol: string, date: string, now: number): string | null {
    const ticker = symbol.toUpperCase();
    if (!/^[A-Z0-9.-]{1,15}$/.test(ticker) || date !== etDateOf(now) || cashSessionPhaseAt(now) !== 'regular') return null;
    return `vwap:fmp:minutes:v1:${ticker}:${date}`;
}

async function readCached(key: string, now: number): Promise<Cached | null> {
    const hit = local.get(key);
    if (hit && hit.expiresAt > now) return hit;
    const shared = await getFromCache<Cached>(key);
    return shared && shared.expiresAt > now ? shared : null;
}

/** 응답용 저장본 읽기. 공급사 호출·진행 중 작업 합류·잠금 대기는 하지 않는다. */
export async function readRealtimeSessionVwap(symbol: string, date: string, now: number = Date.now()): Promise<SessionVwap | null> {
    const key = sessionCacheKey(symbol, date, now);
    if (!key) return null;
    try { return (await readCached(key, now))?.value ?? null; } catch { return null; }
}

/** 정규장 Intrinio 결측 때만 호출. 종목·날짜 잠금과 캐시는 인스턴스 사이에도 공유한다. */
export function getRealtimeSessionVwap(symbol: string, date: string, now: number = Date.now()): Promise<SessionVwap | null> {
    const key = sessionCacheKey(symbol, date, now);
    if (!key || bgStore.getStore()?.tripped) return Promise.resolve(null);
    const ticker = symbol.toUpperCase();
    const running = pending.get(key);
    if (running) return running;
    const task = (async (): Promise<SessionVwap | null> => {
        try {
            const hit = await readCached(key, now);
            if (hit) return hit.value;
            const apiKey = process.env.FMP_API_KEY;
            if (!apiKey) return null;
            if (!(await upstashMeterStore.setNxEx(`${key}:lock`, '1', 10))) {
                return (await readCached(key, now))?.value ?? null;
            }
            let value: SessionVwap | null = null;
            if (await reserveCall() && !bgStore.getStore()?.tripped) {
                const params = new URLSearchParams({ symbol: ticker, from: date, to: date, apikey: apiKey });
                // 자동 재시도 없음. URL·오류 객체는 자격값을 포함하므로 기록하지 않는다.
                const response = await fetch(`https://financialmodelingprep.com/stable/historical-chart/1min?${params}`, {
                    cache: 'no-store', signal: AbortSignal.timeout(4000),
                });
                if (response.status === 429) {
                    const ctx = bgStore.getStore();
                    if (ctx) { ctx.saw429++; if (ctx.tripOn429) ctx.tripped = true; }
                }
                if (response.ok) value = realtimeVwapFromMinutes(await response.json(), date, now);
            }
            const ttl = value ? 15 : 5;
            const entry = { value, expiresAt: Date.now() + ttl * 1000 };
            if (local.size >= 1000) local.delete(local.keys().next().value!);
            local.set(key, entry);
            await setInCache(key, entry, ttl);
            return value;
        } catch {
            // 실패도 짧게 기억한다. 분산 잠금은 만료까지 유지해 재호출 폭주를 막는다.
            const entry = { value: null, expiresAt: Date.now() + 5000 };
            local.set(key, entry);
            await setInCache(key, entry, 5).catch(() => false);
            return null;
        }
    })();
    pending.set(key, task);
    void task.finally(() => pending.delete(key));
    return task;
}
