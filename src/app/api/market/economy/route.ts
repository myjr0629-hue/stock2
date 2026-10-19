/**
 * 실물경제 지표 — 고용·물가·정책금리·소비심리.
 *
 * /api/market/macro 는 «가격»만 준다(NQ·SPX·VIX·US10Y·DXY…).
 * 여기는 가격 피드가 절대 주지 않는 축이다.
 *
 * 캐시: 이 계열들은 월간·분기간이다. 매 요청마다 7콜을 벤더에 던질 이유가 없다.
 *   메모리 캐시 6시간 + stale-while-error(벤더가 죽어도 마지막 정상값을 준다).
 *   TTL 을 갱신주기로 착각하지 않는다 — 나이는 «시간»이 아니라 asOf 로 판단한다.
 *
 * ★2026-10-19 (대표 «연방기준금리 등 데이터가 안 나오고 있다 · 데이터를 비게 하지 마라»):
 *   벤더가 7계열 중 일부만 실패하면 그 «부분 결측» 결과가 6시간 캐시돼 화면에 «—»가 6시간 남았다
 *   (전부 실패만 실패로 보던 옛 규칙의 구멍). 이제는
 *   ① 지표마다 마지막 정상값(값+asOf 그대로 — 지어내지 않는다)을 Redis 에 30일 보관하고
 *   ② 새 응답에서 값이 빈 지표는 그 마지막 정상값으로 채우며(날짜는 원래 asOf 가 말해 준다)
 *   ③ 하나라도 비었거나 보관본으로 채웠으면 캐시를 10분만 둬서 곧 다시 벤더에 묻는다.
 */
import { NextResponse } from "next/server";
import { getMacroEconomy, type MacroEconomy, type MacroMetric } from "@/services/macroEconomy";
import { getFromCache, setInCache } from "@/services/redisClient";

export const dynamic = "force-dynamic";

const TTL_MS = 6 * 60 * 60 * 1000;
const PARTIAL_TTL_MS = 10 * 60 * 1000;
const LASTGOOD_KEY = "macro:economy:lastgood:v1";
const LASTGOOD_TTL_S = 30 * 24 * 60 * 60;

type LastGood = Record<string, MacroMetric>;

let cache: { at: number; data: MacroEconomy; ttl: number } | null = null;

const hasValue = (m: MacroMetric | undefined | null): m is MacroMetric =>
    !!m && m.value != null && Number.isFinite(m.value);

/** 값이 빈 지표를 마지막 정상값으로 채운다. 반환: 채운 결과와 «아직 빈» 지표 수. */
export function fillFromLastGood(data: MacroEconomy, lastGood: LastGood | null): { data: MacroEconomy; filled: number; stillMissing: number } {
    let filled = 0;
    const metrics = data.metrics.map((m) => {
        if (hasValue(m)) return m;
        const prev = lastGood?.[m.key];
        if (hasValue(prev)) { filled += 1; return { ...prev, label: m.label }; }
        return m;
    });
    const stillMissing = metrics.filter((m) => !hasValue(m)).length;
    const dates = metrics.map((m) => m.asOf).filter((d): d is string => !!d).sort();
    return {
        data: { ...data, metrics, missing: stillMissing, newestAsOf: dates.length ? dates[dates.length - 1] : data.newestAsOf },
        filled,
        stillMissing,
    };
}

/** 정상값만 지표별로 보관본에 덮는다(더 옛 asOf 로는 덮지 않는다). */
export function mergeLastGood(prev: LastGood | null, data: MacroEconomy): LastGood {
    const next: LastGood = { ...(prev || {}) };
    for (const m of data.metrics) {
        if (!hasValue(m)) continue;
        const old = next[m.key];
        if (hasValue(old) && old.asOf && m.asOf && m.asOf < old.asOf) continue;
        next[m.key] = m;
    }
    return next;
}

async function readLastGood(): Promise<LastGood | null> {
    try { return await getFromCache<LastGood>(LASTGOOD_KEY); } catch { return null; }
}

export async function GET() {
    const now = Date.now();
    if (cache && now - cache.at < cache.ttl && cache.data.metrics.length > 0) {
        return NextResponse.json({
            ...cache.data,
            cached: true,
            cacheAgeSec: Math.round((now - cache.at) / 1000),
        });
    }

    const lastGood = await readLastGood();
    try {
        const raw = await getMacroEconomy();
        // 한 계열도 못 받았으면 «성공»이라 하지 않는다. 보관본이 있으면 그것을 준다.
        if (raw.metrics.length === 0) {
            const base = cache?.data ?? null;
            if (base) {
                const { data } = fillFromLastGood(base, lastGood);
                return NextResponse.json({ ...data, cached: true, degraded: true, cacheAgeSec: Math.round((now - (cache?.at ?? now)) / 1000) });
            }
            if (lastGood && Object.keys(lastGood).length) {
                const metrics = Object.values(lastGood);
                return NextResponse.json({ metrics, attribution: "FRED (St. Louis Fed) via Intrinio", newestAsOf: null, missing: 7 - metrics.length, cached: true, degraded: true });
            }
            return NextResponse.json({ metrics: [], newestAsOf: null, missing: 7, degraded: true }, { status: 503 });
        }

        const { data, filled, stillMissing } = fillFromLastGood(raw, lastGood);
        const merged = mergeLastGood(lastGood, raw);
        void setInCache(LASTGOOD_KEY, merged, LASTGOOD_TTL_S).catch(() => {});
        const ttl = filled > 0 || stillMissing > 0 ? PARTIAL_TTL_MS : TTL_MS;
        cache = { at: now, data, ttl };
        return NextResponse.json({ ...data, cached: false, cacheAgeSec: 0, ...(filled ? { filledFromLastGood: filled } : {}) });
    } catch {
        const base = cache?.data ?? null;
        if (base) {
            const { data } = fillFromLastGood(base, lastGood);
            return NextResponse.json({
                ...data, cached: true, degraded: true,
                cacheAgeSec: Math.round((now - (cache?.at ?? now)) / 1000),
            });
        }
        if (lastGood && Object.keys(lastGood).length) {
            const metrics = Object.values(lastGood);
            return NextResponse.json({ metrics, attribution: "FRED (St. Louis Fed) via Intrinio", newestAsOf: null, missing: 7 - metrics.length, cached: true, degraded: true });
        }
        return NextResponse.json({ error: "economy_unavailable" }, { status: 503 });
    }
}
