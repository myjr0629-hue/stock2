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
 *   ① 지표마다 마지막 정상값(값+asOf 그대로 — 지어내지 않는다)을 «지표별 키»로 Redis 에 30일 보관하고
 *      (한 객체로 통째 저장하면 동시 요청이 서로의 정상값을 지운다 — 관문 10192347)
 *   ② 새 응답에서 값이 빈 지표는 그 마지막 정상값으로 채우며(날짜는 원래 asOf 가 말해 준다)
 *   ③ 하나라도 비었거나 보관본으로 채웠으면 캐시를 10분만 둬서 곧 다시 벤더에 묻는다.
 *   ④ 벤더가 전부 실패해도 7행(METRIC_ORDER)을 같은 순서로 준다 — 보관값이 없는 지표는 행을 남기고 값만 null.
 */
import { NextResponse } from "next/server";
import { getMacroEconomy, type MacroEconomy, type MacroMetric } from "@/services/macroEconomy";
import { METRIC_ORDER, fillFromLastGood, hasValue, type LastGood } from "@/lib/macroLastGood";

export const dynamic = "force-dynamic";

const TTL_MS = 6 * 60 * 60 * 1000;
const PARTIAL_TTL_MS = 10 * 60 * 1000;
const LASTGOOD_PREFIX = "macro:economy:lastgood:v1:";
const LASTGOOD_TTL_S = 30 * 24 * 60 * 60;
const ATTRIBUTION = "FRED (St. Louis Fed) via Intrinio";

let cache: { at: number; data: MacroEconomy; ttl: number } | null = null;

async function readLastGood(): Promise<LastGood | null> {
    try {
        const { mgetFromCache } = await import("@/services/redisClient");
        const keys = METRIC_ORDER.map((s) => s.key);
        const vals = await mgetFromCache<MacroMetric>(keys.map((k) => LASTGOOD_PREFIX + k));
        const out: LastGood = {};
        keys.forEach((k, i) => { const v = vals?.[i]; if (hasValue(v)) out[k] = v; });
        return out;
    } catch {
        return null;
    }
}

/** 정상값만 «지표별 키»로 저장한다. 같은 키의 더 옛 asOf 로는 덮지 않는다. */
async function saveLastGood(prev: LastGood | null, data: MacroEconomy): Promise<void> {
    try {
        const { setInCache } = await import("@/services/redisClient");
        await Promise.all(data.metrics.map(async (m) => {
            if (!hasValue(m)) return;
            const old = prev?.[m.key];
            if (hasValue(old) && old.asOf && m.asOf && m.asOf < old.asOf) return;
            await setInCache(LASTGOOD_PREFIX + m.key, m, LASTGOOD_TTL_S);
        }));
    } catch { /* 보관 실패는 응답을 막지 않는다 */ }
}

const emptyBase = (): MacroEconomy => ({ metrics: [], attribution: ATTRIBUTION, newestAsOf: null, missing: 7 } as unknown as MacroEconomy);

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
    const degradedResponse = () => {
        const base = cache?.data ?? emptyBase();
        const { data, stillMissing } = fillFromLastGood(base, lastGood);
        if (stillMissing === data.metrics.length) {
            return NextResponse.json({ metrics: [], newestAsOf: null, missing: 7, degraded: true }, { status: 503 });
        }
        return NextResponse.json({ ...data, cached: true, degraded: true, cacheAgeSec: cache ? Math.round((now - cache.at) / 1000) : null });
    };

    try {
        const raw = await getMacroEconomy();
        // 한 계열도 못 받았으면 «성공»이라 하지 않는다 — 직전 캐시·보관본으로 7행을 준다.
        if (raw.metrics.length === 0) return degradedResponse();

        const { data, filled, stillMissing } = fillFromLastGood(raw, lastGood);
        await saveLastGood(lastGood, raw);
        const ttl = filled > 0 || stillMissing > 0 ? PARTIAL_TTL_MS : TTL_MS;
        cache = { at: now, data, ttl };
        return NextResponse.json({ ...data, cached: false, cacheAgeSec: 0, ...(filled ? { filledFromLastGood: filled } : {}) });
    } catch {
        return degradedResponse();
    }
}
