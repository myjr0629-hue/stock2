// src/app/api/health/env/route.ts
// S-56.4.5c: Environment Diagnostics API (sensitive data masked)

import { NextResponse } from "next/server";

// [S-56.4.5c] Force Node.js runtime and dynamic rendering for production parity
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
    const REDIS_URL = process.env.KV_REST_API_URL || process.env.REDIS_URL;

    return NextResponse.json({
        ok: true,
        timestamp: new Date().toISOString(),
        env: {
            NODE_ENV: process.env.NODE_ENV || "unknown",
            VERCEL_ENV: process.env.VERCEL_ENV || null,
            USE_REDIS_SSOT: process.env.USE_REDIS_SSOT || "false",
            MASSIVE_BASE_URL_present: !!process.env.MASSIVE_BASE_URL || true, // hardcoded in massiveClient
            MASSIVE_API_KEY_present: !!MASSIVE_API_KEY,
            MASSIVE_API_KEY_last4: MASSIVE_API_KEY ? MASSIVE_API_KEY.slice(-4) : null,
            REDIS_URL_present: !!REDIS_URL,
            NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null
        },
        warnings: [
            !MASSIVE_API_KEY ? "MASSIVE_API_KEY missing - API calls will fail" : null,
            !REDIS_URL ? "REDIS_URL missing - Redis cache disabled" : null
        ].filter(Boolean)
    });
}
