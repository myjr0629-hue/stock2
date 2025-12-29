// [P1] /api/cron/policy - Policy Events Refresh
// Refreshes events:policy:7d from static JSON (MVP) or external API

import { NextRequest, NextResponse } from "next/server";
import { savePoliciesToRedis, StoredPolicy } from "@/lib/storage/policyStore";
import path from "path";
import fs from "fs";

const STATIC_DATA_PATH = path.join(process.cwd(), 'src', 'data', 'policy.static.json');

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");

    // Auth check
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // MVP: Load from static JSON
        let policies: StoredPolicy[] = [];

        if (fs.existsSync(STATIC_DATA_PATH)) {
            const raw = fs.readFileSync(STATIC_DATA_PATH, 'utf-8');
            policies = JSON.parse(raw);
        }

        // TODO: In future, fetch from Whitehouse/FR API
        // const externalPolicies = await fetchFromFederalRegister();
        // policies = [...policies, ...externalPolicies];

        // Save to Redis
        const saved = await savePoliciesToRedis(policies);

        return NextResponse.json({
            success: saved,
            count: policies.length,
            source: "static",
            updatedAt: new Date().toISOString()
        });
    } catch (e: any) {
        console.error("[Cron/Policy] Error:", e);
        return NextResponse.json({
            success: false,
            error: e.message
        }, { status: 500 });
    }
}
