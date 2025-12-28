// src/app/api/health/env/route.ts
// S-56.4.6e: SSOT Standards - Strict Environment Diagnostic
// Force dynamic, no-store, NodeJS runtime

import { NextResponse } from "next/server";
import { getBuildId, getEnvType } from "@/services/buildIdSSOT";

// [S-56.4.6e] Standardized Route Configurations
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
    const UPSTASH_URL = process.env.KV_REST_API_URL || process.env.REDIS_URL;
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
        gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || null,
        deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
        vercelEnv: process.env.VERCEL_ENV || null,
        nodeEnv: process.env.NODE_ENV || "unknown",
        useRedisSSOT: process.env.USE_REDIS_SSOT || "false",
        massiveKeyPresent: !!MASSIVE_API_KEY,
        upstashUrlPresent: !!UPSTASH_URL,
        envType
    }, { status: 200, headers });
}
