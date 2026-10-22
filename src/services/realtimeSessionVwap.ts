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

export type MinuteValidation = {
    barCount: number | null;
    regularMinuteCount: number;
    firstBarET: string | null;
    latestBarET: string | null;
    latestLagMinutes: number | null;
    missingMinutesET: string[];
    rejected: string[];
    skipped: { invalidTime: number; future: number; otherDate: number; outsideRegular: number };
};

function minuteET(date: string, minute: number): string {
    return `${date} ${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00`;
}

/** 기존 조건과 산식을 그대로 판정하며 원천 문자열·OHLCV는 진단에 싣지 않는다. */
export function inspectRealtimeVwapMinutes(rows: unknown, date: string, now: number): { value: SessionVwap | null; validation: MinuteValidation } {
    const validation: MinuteValidation = {
        barCount: Array.isArray(rows) ? rows.length : null, regularMinuteCount: 0,
        firstBarET: null, latestBarET: null, latestLagMinutes: null, missingMinutesET: [], rejected: [],
        skipped: { invalidTime: 0, future: 0, otherDate: 0, outsideRegular: 0 },
    };
    const reject = (reason: string) => { if (!validation.rejected.includes(reason)) validation.rejected.push(reason); };
    if (!Array.isArray(rows)) reject('not_array');
    if (etDateOf(now) !== date) reject('date_mismatch');
    if (cashSessionPhaseAt(now) !== 'regular') reject('outside_regular_session');
    if (validation.rejected.length) return { value: null, validation };
    const minutes = new Map<number, any>();
    for (const r of rows as any[]) {
        const time = fmpEtToMs(r?.date);
        if (time == null) { validation.skipped.invalidTime++; continue; }
        if (time > now) { validation.skipped.future++; continue; }
        if (etDateOf(time) !== date) { validation.skipped.otherDate++; continue; }
        if (cashSessionPhaseAt(time) !== 'regular') { validation.skipped.outsideRegular++; continue; }
        const minute = etMinutesOf(time);
        const bar = { etDate: date, session: 'REG', high: r.high, low: r.low, close: r.close, volume: r.volume };
        if (![r.high, r.low, r.close].every(x => typeof x === 'number' && Number.isFinite(x) && x > 0)) reject('invalid_price');
        if (typeof r.volume !== 'number' || !Number.isFinite(r.volume) || r.volume < 0) reject('invalid_volume');
        const previous = minutes.get(minute);
        // 무효 숫자형 값(BigInt 등)을 JSON 비교에 넘기지 않는다. 이 경우는 이미 전체 거절이다.
        if (!validation.rejected.includes('invalid_price') && !validation.rejected.includes('invalid_volume')
            && previous && JSON.stringify(previous) !== JSON.stringify(bar)) reject('conflicting_duplicate');
        minutes.set(minute, bar);
    }
    const ordered = [...minutes.keys()].sort((a, b) => a - b);
    validation.regularMinuteCount = ordered.length;
    if (!ordered.length) reject('no_regular_minutes');
    else {
        const first = ordered[0], latest = ordered[ordered.length - 1];
        validation.firstBarET = minuteET(date, first);
        validation.latestBarET = minuteET(date, latest);
        validation.latestLagMinutes = etMinutesOf(now) - latest;
        for (let m = 570; m <= latest; m++) if (!minutes.has(m)) validation.missingMinutesET.push(minuteET(date, m));
        if (first !== 570) reject('missing_open_minute');
        if (ordered.some((m, i) => m !== first + i)) reject('missing_middle_minutes');
        if (validation.latestLagMinutes > 2) reject('stale_latest_minute');
    }
    if (validation.rejected.length) return { value: null, validation };
    const value = sessionVwapFromBars([...minutes.values()]);
    if (!value) reject('session_vwap_unavailable'); // 전부 거래량 0 또는 누적 산식 결과가 무효
    return { value, validation };
}

/** 기존 호출자의 반환형·유효성 기준·산식은 유지한다. */
export function realtimeVwapFromMinutes(rows: unknown, date: string, now: number): SessionVwap | null {
    return inspectRealtimeVwapMinutes(rows, date, now).value;
}

type Observation = {
    observedAt: number;
    outcome: string;
    httpAttempted: boolean;
    httpStatus: number | null;
    validation: MinuteValidation | null;
};
const diagnosticLocal = new Map<string, Observation>();
const DIAGNOSTIC_TTL = 600;
const diagnosticKey = (key: string) => `${key}:diag:v1`;

async function rememberObservation(key: string, observation: Observation): Promise<void> {
    // 진단 저장 실패가 기존 VWAP 값·TTL·예산·복구 흐름에 영향을 주지 않는다.
    if (diagnosticLocal.size >= 1000) diagnosticLocal.delete(diagnosticLocal.keys().next().value!);
    diagnosticLocal.set(key, observation);
    try { await setInCache(diagnosticKey(key), observation, DIAGNOSTIC_TTL); } catch { /* 비밀을 포함할 수 있는 오류는 기록하지 않는다 */ }
}

/** 읽기 전용: FMP 호출·잠금 예약·캐시 갱신을 하지 않는다. 관측 없음은 실패로 단정하지 않는다. */
export async function readRealtimeSessionVwapDiagnostics(symbol: string, date: string, now: number = Date.now()) {
    const ticker = symbol.toUpperCase();
    const key = `vwap:fmp:minutes:v1:${ticker}:${date}`;
    const [cached, sharedObservation] = await Promise.all([
        readCached(key, now).catch(() => null),
        getFromCache<Observation>(diagnosticKey(key)).catch(() => null),
    ]);
    const localObservation = diagnosticLocal.get(key);
    const latest = localObservation && (!sharedObservation || localObservation.observedAt > sharedObservation.observedAt)
        ? localObservation : sharedObservation;
    const observation = latest && now - latest.observedAt < DIAGNOSTIC_TTL * 1000 ? latest : null;
    return {
        ticker, date, timezone: 'America/New_York', fmpKeyPresent: Boolean(process.env.FMP_API_KEY),
        session: cashSessionPhaseAt(now), eligible: sessionCacheKey(symbol, date, now) !== null,
        cache: { hit: cached !== null, valuePresent: cached?.value != null, expiresAt: cached?.expiresAt ?? null },
        observation, observationState: observation ? 'observed' : 'not_observed', retentionSeconds: DIAGNOSTIC_TTL,
    };
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
    if (!key) return Promise.resolve(null);
    const observation: Observation = { observedAt: Date.now(), outcome: 'background_tripped', httpAttempted: false, httpStatus: null, validation: null };
    if (bgStore.getStore()?.tripped) return rememberObservation(key, observation).then(() => null);
    const ticker = symbol.toUpperCase();
    const running = pending.get(key);
    if (running) return running;
    const task = (async (): Promise<SessionVwap | null> => {
        let stage = 'cache_read';
        let record = true;
        try {
            const hit = await readCached(key, now);
            if (hit) { record = false; return hit.value; }
            const apiKey = process.env.FMP_API_KEY;
            if (!apiKey) { observation.outcome = 'missing_fmp_key'; return null; }
            stage = 'symbol_lock';
            if (!(await upstashMeterStore.setNxEx(`${key}:lock`, '1', 10))) {
                observation.outcome = 'symbol_lock_unavailable';
                return (await readCached(key, now))?.value ?? null;
            }
            let value: SessionVwap | null = null;
            stage = 'budget';
            observation.outcome = 'budget_unavailable';
            if (await reserveCall() && !bgStore.getStore()?.tripped) {
                const params = new URLSearchParams({ symbol: ticker, from: date, to: date, apikey: apiKey });
                // 자동 재시도 없음. URL·오류 객체는 자격값을 포함하므로 기록하지 않는다.
                stage = 'fetch';
                observation.httpAttempted = true;
                const response = await fetch(`https://financialmodelingprep.com/stable/historical-chart/1min?${params}`, {
                    cache: 'no-store', signal: AbortSignal.timeout(4000),
                });
                observation.httpStatus = response.status;
                observation.outcome = 'http_error';
                if (response.status === 429) {
                    const ctx = bgStore.getStore();
                    if (ctx) { ctx.saw429++; if (ctx.tripOn429) ctx.tripped = true; }
                }
                if (response.ok) {
                    stage = 'parse';
                    const rows = await response.json();
                    stage = 'validation';
                    const inspected = inspectRealtimeVwapMinutes(rows, date, now);
                    value = inspected.value;
                    observation.validation = inspected.validation;
                    observation.outcome = value ? 'accepted' : 'validation_rejected';
                }
            } else if (bgStore.getStore()?.tripped) {
                observation.outcome = 'background_tripped';
            }
            const ttl = value ? 15 : 5;
            const entry = { value, expiresAt: Date.now() + ttl * 1000 };
            if (local.size >= 1000) local.delete(local.keys().next().value!);
            local.set(key, entry);
            stage = 'cache_write';
            await setInCache(key, entry, ttl);
            return value;
        } catch (error) {
            observation.outcome = stage === 'fetch'
                ? ((error as { name?: string })?.name === 'TimeoutError' ? 'fetch_timeout' : 'fetch_error')
                : `${stage}_error`;
            // 실패도 짧게 기억한다. 분산 잠금은 만료까지 유지해 재호출 폭주를 막는다.
            const entry = { value: null, expiresAt: Date.now() + 5000 };
            local.set(key, entry);
            await setInCache(key, entry, 5).catch(() => false);
            return null;
        } finally {
            if (record) { observation.observedAt = Date.now(); await rememberObservation(key, observation); }
        }
    })();
    pending.set(key, task);
    void task.finally(() => pending.delete(key));
    return task;
}
