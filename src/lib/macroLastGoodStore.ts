/** Macro persistence only. v2 isolates atomic writers from legacy unconditional SETs. */
import type { MacroEconomy, MacroMetric } from "@/services/macroEconomy";
import { hasValue, METRIC_ORDER, type LastGood } from "./macroLastGood";

const PREFIX = "macro:economy:lastgood:v2:";
const LEGACY_PREFIX = "macro:economy:lastgood:v1:";
const TTL_S = 30 * 24 * 60 * 60;

export async function readLastGood(): Promise<LastGood | null> {
    try {
        const { mgetLatestAsOf } = await import("@/services/redisClient");
        const keys = METRIC_ORDER.map(s => s.key);
        const vals = await mgetLatestAsOf<MacroMetric>([
            ...keys.map(k => PREFIX + k), ...keys.map(k => LEGACY_PREFIX + k),
        ]);
        const out: LastGood = {};
        keys.forEach((key, i) => {
            const current = vals[i], legacy = vals[i + keys.length];
            const chosen = hasValue(legacy) && (!hasValue(current) || (legacy.asOf ?? "") > (current.asOf ?? ""))
                ? legacy : current;
            if (hasValue(chosen)) out[key] = chosen;
        });
        return out;
    } catch { return null; }
}

export async function saveLastGood(prev: LastGood | null, data: MacroEconomy): Promise<void> {
    try {
        const { setIfNewerAsOf } = await import("@/services/redisClient");
        await Promise.all(data.metrics.map(async m => {
            // Unknown dates cannot establish freshness or replace a dated observation.
            if (!hasValue(m) || !m.asOf) return;
            const old = prev?.[m.key];
            // Carry a newer legacy snapshot into v2 too; the Redis-side comparison
            // still decides against concurrent writes after this snapshot was read.
            const candidate = hasValue(old) && old.asOf && old.asOf >= m.asOf ? old : m;
            await setIfNewerAsOf(PREFIX + m.key, candidate, TTL_S);
        }));
    } catch { /* A persistence failure must not block the vendor response. */ }
}
