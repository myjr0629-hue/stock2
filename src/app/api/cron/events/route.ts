// [P1] /api/cron/events - Economic Calendar Refresh
// Refreshes events:macro:14d from Massive API via EventHubProvider

import { NextRequest, NextResponse } from "next/server";
import { saveEventsToRedis, StoredEvent } from "@/lib/storage/eventStore";
import { getUpcomingEvents } from "@/services/eventHubProvider";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");

    // Auth check
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // [Fix] Use Real API via Provider
        const events = await getUpcomingEvents(30);

        // Save to Redis
        const storedEvents: StoredEvent[] = events.map(e => ({
            ...e,
            id: `${e.date}-${e.name}`.replace(/\s+/g, '-').toLowerCase()
        }));

        const saved = await saveEventsToRedis(storedEvents);

        return NextResponse.json({
            success: saved,
            count: events.length,
            source: "massive-api",
            updatedAt: new Date().toISOString()
        });
    } catch (e: any) {
        console.error("[Cron/Events] Error:", e);
        return NextResponse.json({
            success: false,
            error: e.message
        }, { status: 500 });
    }
}
