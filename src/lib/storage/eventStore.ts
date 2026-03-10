// [P1] Event Store - Redis-based storage for economic events
// Migrates from static JSON to Redis with cron-driven refresh
// [Phase 1B] Uses unified Redis client (EC2 proxy primary + Upstash fallback)

import { getFromCache, setInCache } from '@/services/redisClient';

const EVENTS_KEY = "events:macro:14d";
const EVENTS_TTL = 60 * 60 * 12; // 12 hours

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
    try {
        const data = {
            events,
            updatedAt: new Date().toISOString(),
            count: events.length
        };
        const ok = await setInCache(EVENTS_KEY, data, EVENTS_TTL);
        if (ok) console.log(`[EventStore] Saved ${events.length} events`);
        return ok;
    } catch (e) {
        console.error("[EventStore] Save failed:", e);
        return false;
    }
}

// Get events from Redis
export async function getEventsFromRedis(): Promise<{ events: StoredEvent[]; updatedAt: string } | null> {
    try {
        const data = await getFromCache<{ events: StoredEvent[]; updatedAt: string; count: number }>(EVENTS_KEY);
        if (!data) return null;
        return {
            events: data.events || [],
            updatedAt: data.updatedAt || new Date().toISOString()
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
