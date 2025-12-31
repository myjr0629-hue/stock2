// [S-50.0] EventHub Provider - Real-time Market Status Events
// Source: Massive API /v1/marketstatus/upcoming

import { fetchMassive, CACHE_POLICY } from './massiveClient';

export interface EconomicEvent {
    date: string;           // YYYY-MM-DD
    time: string;           // HH:MM (ET)
    name: string;           // Event name (English)
    nameKR: string;         // Event name (Korean)
    importance: "HIGH" | "MEDIUM" | "LOW";
    expectedImpact: string; // Korean description of expected impact
    sourceGrade: "A" | "B" | "C";
    category: "HOLIDAY" | "OTHER";
}

interface EventHubSnapshot {
    asOfET: string;
    events: EconomicEvent[];
    shakeReasons: string[];
}

async function fetchUpcomingHolidays(): Promise<EconomicEvent[]> {
    try {
        const res = await fetchMassive('/v1/marketstatus/upcoming', {}, true, undefined, CACHE_POLICY.LIVE);
        const data = res?.data || res || [];

        return data.map((item: any) => ({
            date: item.date,
            time: "00:00",
            name: item.name,
            nameKR: `휴장: ${item.name}`,
            importance: "HIGH",
            expectedImpact: "시장 휴장 (Market Closed)",
            sourceGrade: "A",
            category: "HOLIDAY"
        }));
    } catch (e) {
        console.error('[EventHub] API Fetch Error:', e);
        return [];
    }
}

function getETDate(): string {
    return new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

export async function getUpcomingEvents(days: number = 7): Promise<EconomicEvent[]> {
    const events = await fetchUpcomingHolidays();
    const now = new Date();
    const nowET = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const cutoff = new Date(nowET);
    cutoff.setDate(cutoff.getDate() + days);

    // Filter by date range (simple string comparison for YYYY-MM-DD is safe)
    const todayStr = nowET.toISOString().split('T')[0];
    const cutoffStr = cutoff.toISOString().split('T')[0];

    return events.filter(e => e.date >= todayStr && e.date <= cutoffStr);
}


export async function getTodayShakeReasons(limit: number = 3): Promise<string[]> {
    const events = await getUpcomingEvents(3); // Look ahead 3 days
    // Filter for very near term events
    return events.slice(0, limit).map(e =>
        `${e.nameKR} (${e.date})`
    );
}


// Note: Snapshot is now async due to API call
export async function getEventHubSnapshot(): Promise<EventHubSnapshot> {
    const now = new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York',
        dateStyle: 'short',
        timeStyle: 'short'
    });

    return {
        asOfET: now,
        events: await getUpcomingEvents(14),
        shakeReasons: await getTodayShakeReasons(3)
    };
}
