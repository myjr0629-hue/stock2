/**
 * PRO 가격 레벨 알림 — 운영 배선(Upstash · 가격 허브 · Intrinio 예비 · RC 재확인 · APNs/FCM). 실행기: lib/proAlerts/run.ts
 *
 * 가격(정규장만):
 *   ① 가격 허브(wss://ws.signumhq.com ← EC2 price-ws, Intrinio EQUITIES_EDGE WS)의 마지막 체결 /last — 벤더 REST 호출 0, 기존 공유 가격 원천.
 *   ② 허브에 없거나 낡은 종목만 Intrinio securities/{T}/prices/realtime?source=equities_edge — 실행당 15종목(재시도 포함 실호출 ≤30) · 하루 실호출 3,000 상한(원자 예약 · FMP 쓰지 않음).
 *      429·실패면 그 종목은 이번 실행에 건너뛴다(직전 관측이 남아 다음 실행에 이어서 판정 · 공백이 16분 넘으면 기준점만 다시).
 * 끄는 법(재배포 없이): GET /api/cron/pro-alerts?mode=off (Bearer CRON_SECRET) → push:pro-alerts:v1:mode='off'. 환경변수 PRO_ALERTS_MODE=off 도 같다.
 */
import 'server-only';
import { Redis } from '@upstash/redis';
import { fetchHubLast, regularOpenMs } from '@/lib/hubLiveOverlay';
import { getRegularLastTradeIntrinio } from '@/services/intrinioClient';
import { sendSignalPushes } from '@/lib/push/sendSignal';
import { etDateOf } from '@/lib/marketCalendar';
import { PA_KEYS, type ProAlertRecord } from '@/lib/proAlerts/core';
import { openUid, verifyProWithRc, type VerifyStore } from '@/lib/proAlerts/rcVerify';
import { runProAlerts, type PaDeps, type PaPrices, type PaReport, type PaRunOpts, type PaStore, type PriceRead } from '@/lib/proAlerts/run';

export const PA_PRICE = {
    hubChunk: 100,
    /** 허브가 받은 지 이 시간 안의 체결만(체결이 드문 종목은 예비 경로로) */
    hubMaxAgeMs: 10 * 60_000,
    hubMaxLagMs: 90_000,
    /** 실행당 예비 조회 종목 수 — 종목당 최대 2회 시도(callIntrinio 재시도)라 실행당 실호출 ≤ 30 */
    vendorPerRun: 15,
    attemptsPerCall: 2,
    /** 하루 실호출 상한(시도 수 기준) */
    vendorPerDay: 3000,
    vendorConcurrency: 5,
    vendorMaxAgeMs: 10 * 60_000,
} as const;

let _redis: Redis | null = null;
const redis = () => (_redis ??= Redis.fromEnv());

export function paUpstashStore(r: Redis = redis()): PaStore & VerifyStore & { raw: Redis } {
    return {
        raw: r,
        smembers: async (k) => ((await r.smembers(k)) as string[]) || [],
        mget: async (keys) => (keys.length ? ((await r.mget(...keys)) as unknown[]) : []),
        get: (k) => r.get(k),
        setNx: async (k, v, ex) => (await r.set(k, v, { nx: true, ex })) === 'OK',
        set: async (k, v, ex) => { if (ex) await r.set(k, v, { ex }); else await r.set(k, v); },
        incr: async (k: string | string[], ex: number): Promise<any> => {
            if (Array.isArray(k)) {
                const p = r.pipeline();
                for (const x of k) { p.incr(x); p.expire(x, ex); }
                const out = (await p.exec()) as unknown[];
                return k.map((_, i) => Number(out[i * 2]));
            }
            const res = await r.pipeline().incr(k).expire(k, ex).exec();
            return Number(res?.[0]) || 0;
        },
        decr: (k) => r.decr(k),
        del: async (keys) => { if (keys.length) await r.del(...keys); },
        srem: async (k, members) => { if (members.length) await r.srem(k, ...members); },
    } as PaStore & VerifyStore & { raw: Redis };
}

export function rcKeys() {
    return { secret: process.env.REVENUECAT_SECRET_API_KEY || undefined, ios: process.env.NEXT_PUBLIC_RC_IOS_KEY, android: process.env.NEXT_PUBLIC_RC_ANDROID_KEY };
}

/** 가격 허브 → (빠진 종목) Intrinio 예비. 던지지 않는다 */
/** 하루 계량 원자 예약 — 키를 n 만큼 올리고, 상한을 넘은 만큼 돌려준 뒤 실제로 잡은 수를 준다 */
export type Reserve = (key: string, n: number, cap: number) => Promise<number>;
export function upstashReserve(r: Redis = redis()): Reserve {
    return async (key, n, cap) => {
        if (n <= 0) return 0;
        const after = Number(await r.incrby(key, n));
        await r.expire(key, 2 * 86400);
        if (!Number.isFinite(after)) return 0;
        const over = Math.max(0, after - cap);
        if (over > 0) await r.decrby(key, Math.min(over, n));
        return Math.max(0, n - over);
    };
}

export function prodPrices(store: PaStore, reserve: Reserve | null = null): PaPrices {
    return {
        async read(tickers, now, opts): Promise<PriceRead> {
            const out: PriceRead = { prices: new Map(), hub: 0, vendor: 0, missing: 0, vendorCalls: 0 };
            const etDate = etDateOf(now);
            const openMs = regularOpenMs(etDate);
            if (openMs == null || !tickers.length) return out;
            for (let i = 0; i < tickers.length; i += PA_PRICE.hubChunk) {
                const part = tickers.slice(i, i + PA_PRICE.hubChunk);
                const hub = await fetchHubLast(part, { timeoutMs: 4000, waitMs: 1500 });
                if (!hub) continue;
                for (const t of part) {
                    const k = hub.ticks?.[t];
                    if (!k) continue;
                    const p = Number(k.p), trade = Number(k.trade), rx = Number(k.rx);
                    if (!(p > 0) || !Number.isFinite(trade) || !Number.isFinite(rx)) continue;
                    if (trade < openMs - 2000 || trade > hub.now + 60_000) continue;           // 오늘 정규장 개장 이후의 체결만
                    if (rx - trade > PA_PRICE.hubMaxLagMs) continue;
                    const age = hub.now - rx;
                    if (age > PA_PRICE.hubMaxAgeMs || age < -60_000) continue;
                    // 허브 시계 → 우리 시계(체결 나이를 옮긴다)
                    out.prices.set(t, { p, at: Math.min(now, now - (hub.now - trade)) });
                    out.hub++;
                }
            }
            const missing = tickers.filter((t) => !out.prices.has(t));
            if (missing.length && opts.allowVendor && reserve) {
                // 하루 계량은 «최대 시도 수»(종목당 재시도 포함 2회)로 먼저 «원자적으로» 잡는다(INCRBY) — 넘친 만큼 돌려주고 그만큼만 부른다.
                //   계량을 못 하면(Redis 장애) 부르지 않는다(관문 11121338 ①)
                const want = Math.min(missing.length, PA_PRICE.vendorPerRun) * PA_PRICE.attemptsPerCall;
                const granted = await reserve(PA_KEYS.vendorDay(etDate), want, PA_PRICE.vendorPerDay).catch(() => 0);
                const todo = missing.slice(0, Math.floor(granted / PA_PRICE.attemptsPerCall));
                if (todo.length) {
                    const deadline = Date.now() + 20_000;
                    let next = 0;
                    const worker = async () => {
                        while (next < todo.length) {
                            const t = todo[next++];
                            out.vendorCalls++;
                            const r = await getRegularLastTradeIntrinio(t, deadline).catch(() => null);
                            if (!r) continue;
                            if (r.tradeMs < openMs - 2000 || now - r.tradeMs > PA_PRICE.vendorMaxAgeMs || r.tradeMs > now + 60_000) continue;
                            out.prices.set(t, { p: r.price, at: r.tradeMs });
                            out.vendor++;
                        }
                    };
                    await Promise.all(Array.from({ length: Math.min(PA_PRICE.vendorConcurrency, todo.length) }, worker));
                }
            }
            out.missing = tickers.filter((t) => !out.prices.has(t)).length;
            return out;
        },
    };
}

export function prodDeps(): PaDeps {
    const store = paUpstashStore();
    return {
        store,
        prices: prodPrices(store, upstashReserve(store.raw)),
        sender: { send: sendSignalPushes },
        reverify: async (rec: ProAlertRecord) => {
            const uid = openUid(rec.uidEnc, process.env.CRON_SECRET);
            if (!uid) return null;
            return verifyProWithRc(uid, rec.platform, null, { store, keys: rcKeys() });
        },
    };
}

export function envMode(): 'off' | 'live' | null {
    const v = (process.env.PRO_ALERTS_MODE || '').trim().toLowerCase();
    return v === 'off' ? 'off' : v === 'live' ? 'live' : null;
}

export async function runProAlertsProd(o: Omit<PaRunOpts, 'now' | 'envMode'> & { now?: number }): Promise<PaReport> {
    const deps = prodDeps();
    const report = await runProAlerts(deps, { ...o, now: o.now ?? Date.now(), envMode: envMode() });
    if (o.kind === 'cron' && report.status === 'ok') {
        const { crossings, ...rest } = report;
        await deps.store.set(PA_KEYS.last, JSON.stringify({ ...rest, crossings: crossings.length }), 8 * 86400).catch(() => {});
    }
    return report;
}

export async function setProAlertsMode(mode: 'off' | 'live'): Promise<void> {
    const s = paUpstashStore();
    if (mode === 'live') await s.del([PA_KEYS.mode]); else await s.set(PA_KEYS.mode, 'off');
}
export async function readProAlertsMode(): Promise<{ env: string | null; redis: string | null }> {
    const v = await paUpstashStore().get(PA_KEYS.mode).catch(() => null);
    return { env: envMode(), redis: typeof v === 'string' ? v : null };
}
