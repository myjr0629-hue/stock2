// src/app/api/health/env/route.ts
// S-56.4.6e: SSOT Standards - Strict Environment Diagnostic
// Force dynamic, no-store, NodeJS runtime

import { NextResponse } from "next/server";
import { getBuildId, getEnvType } from "@/services/buildIdSSOT";

// [S-56.4.6e] Standardized Route Configurations
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const buildId = getBuildId();
    const envType = getEnvType();

    const headers = {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
    };

    return NextResponse.json({
        ok: true,
        timestampISO: new Date().toISOString(),
        buildId,
        deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
        nodeEnv: process.env.NODE_ENV || "unknown",
        envType
    }, { status: 200, headers });
}
