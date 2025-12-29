// [P1] Policy Store - Redis-based storage for policy events
// Migrates from static JSON to Redis with cron-driven refresh

import { Redis } from "@upstash/redis";

const POLICY_KEY = "events:policy:7d";
const POLICY_TTL = 60 * 60 * 24; // 24 hours

// Get Redis client
function getRedis(): Redis | null {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) return null;
    return new Redis({ url, token });
}

export interface StoredPolicy {
    id: string;
    category: "P0" | "P1" | "P2";
    title: string;
    titleKR: string;
    description: string;
    effectiveDate: string;
    sourceGrade: "A" | "B" | "C";
    affectedSectors?: string[];
    affectedTickers?: string[];
    impact: "POSITIVE" | "NEGATIVE" | "MIXED" | "UNKNOWN";
}

// Save policies to Redis
export async function savePoliciesToRedis(policies: StoredPolicy[]): Promise<boolean> {
    const redis = getRedis();
    if (!redis) {
        console.warn("[PolicyStore] Redis not available");
        return false;
    }

    try {
        await redis.set(POLICY_KEY, JSON.stringify({
            policies,
            updatedAt: new Date().toISOString(),
            count: policies.length
        }), { ex: POLICY_TTL });

        console.log(`[PolicyStore] Saved ${policies.length} policies to Redis`);
        return true;
    } catch (e) {
        console.error("[PolicyStore] Save failed:", e);
        return false;
    }
}

// Get policies from Redis
export async function getPoliciesFromRedis(): Promise<{ policies: StoredPolicy[]; updatedAt: string } | null> {
    const redis = getRedis();
    if (!redis) return null;

    try {
        const data = await redis.get(POLICY_KEY);
        if (!data) return null;

        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        return {
            policies: parsed.policies || [],
            updatedAt: parsed.updatedAt || new Date().toISOString()
        };
    } catch (e) {
        console.error("[PolicyStore] Read failed:", e);
        return null;
    }
}

// Split into 72h and 7d windows (ET timezone)
export function splitPolicyWindows(policies: StoredPolicy[]): { within72h: StoredPolicy[]; within7d: StoredPolicy[] } {
    const now = new Date();
    const nowET = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const in72h = new Date(nowET);
    in72h.setHours(in72h.getHours() + 72);
    const in7d = new Date(nowET);
    in7d.setDate(in7d.getDate() + 7);

    const within72h: StoredPolicy[] = [];
    const within7d: StoredPolicy[] = [];

    const sortFn = (a: StoredPolicy, b: StoredPolicy) => {
        const catOrder = { P0: 0, P1: 1, P2: 2 };
        const catCompare = catOrder[a.category] - catOrder[b.category];
        if (catCompare !== 0) return catCompare;
        return a.effectiveDate.localeCompare(b.effectiveDate);
    };

    policies.forEach(p => {
        const [y, m, d] = p.effectiveDate.split('-').map(Number);
        const pDate = new Date(y, m - 1, d);
        if (pDate >= nowET && pDate <= in72h) {
            within72h.push(p);
        } else if (pDate > in72h && pDate <= in7d) {
            within7d.push(p);
        }
    });

    return {
        within72h: within72h.sort(sortFn),
        within7d: within7d.sort(sortFn)
    };
}
