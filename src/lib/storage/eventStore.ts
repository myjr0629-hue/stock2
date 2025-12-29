// [P1] Event Store - Redis-based storage for economic events
// Migrates from static JSON to Redis with cron-driven refresh

import { Redis } from "@upstash/redis";

const EVENTS_KEY = "events:macro:14d";
const EVENTS_TTL = 60 * 60 * 12; // 12 hours

// Get Redis client
function getRedis(): Redis | null {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) return null;
    return new Redis({ url, token });
}

export interface StoredEvent {
    date: string;
    time: string;
    name: string;
    nameKR: string;
    importance: "HIGH" | "MEDIUM" | "LOW";
    expectedImpact: string;
    sourceGrade: "A" | "B" | "C";
    category: "FOMC" | "ECONOMIC" | "EARNINGS" | "OPTIONS" | "HOLIDAY" | "OTHER";
}

// Save events to Redis
export async function saveEventsToRedis(events: StoredEvent[]): Promise<boolean> {
    const redis = getRedis();
    if (!redis) {
        console.warn("[EventStore] Redis not available");
        return false;
    }

    try {
        await redis.set(EVENTS_KEY, JSON.stringify({
            events,
            updatedAt: new Date().toISOString(),
            count: events.length
        }), { ex: EVENTS_TTL });

        console.log(`[EventStore] Saved ${events.length} events to Redis`);
        return true;
    } catch (e) {
        console.error("[EventStore] Save failed:", e);
        return false;
    }
}

// Get events from Redis
export async function getEventsFromRedis(): Promise<{ events: StoredEvent[]; updatedAt: string } | null> {
    const redis = getRedis();
    if (!redis) return null;

    try {
        const data = await redis.get(EVENTS_KEY);
        if (!data) return null;

        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        return {
            events: parsed.events || [],
            updatedAt: parsed.updatedAt || new Date().toISOString()
        };
    } catch (e) {
        console.error("[EventStore] Read failed:", e);
        return null;
    }
}

// Filter to 7-day window (ET timezone)
export function filterUpcoming(events: StoredEvent[], days: number = 7): StoredEvent[] {
    const now = new Date();
    const nowET = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const cutoff = new Date(nowET);
    cutoff.setDate(cutoff.getDate() + days);

    return events
        .filter(e => {
            const [y, m, d] = e.date.split('-').map(Number);
            const eventDate = new Date(y, m - 1, d);
            return eventDate >= nowET && eventDate <= cutoff;
        })
        .sort((a, b) => {
            const dateCompare = a.date.localeCompare(b.date);
            if (dateCompare !== 0) return dateCompare;
            const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
            return (order[a.importance] || 2) - (order[b.importance] || 2);
        });
}
