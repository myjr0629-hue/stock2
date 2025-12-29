// [P1] /api/cron/events - Economic Calendar Refresh
// Refreshes events:macro:14d from static JSON (MVP) or external API

import { NextRequest, NextResponse } from "next/server";
import { saveEventsToRedis, StoredEvent } from "@/lib/storage/eventStore";
import path from "path";
import fs from "fs";

const STATIC_DATA_PATH = path.join(process.cwd(), 'src', 'data', 'events.static.json');

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");

    // Auth check
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // MVP: Load from static JSON
        let events: StoredEvent[] = [];

        if (fs.existsSync(STATIC_DATA_PATH)) {
            const raw = fs.readFileSync(STATIC_DATA_PATH, 'utf-8');
            events = JSON.parse(raw);
        }

        // TODO: In future, fetch from external API
        // const externalEvents = await fetchFromTradingEconomics();
        // events = [...events, ...externalEvents];

        // Save to Redis
        const saved = await saveEventsToRedis(events);

        return NextResponse.json({
            success: saved,
            count: events.length,
            source: "static",
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
