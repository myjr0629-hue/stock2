// src/lib/debugAuth.ts
// Internal debug/health endpoint authentication guard
// Blocks all external access to diagnostic endpoints

import { NextResponse } from "next/server";
import { headers } from "next/headers";

const DEBUG_SECRET = process.env.DEBUG_SECRET || process.env.CRON_SECRET || "";

/**
 * Validates debug endpoint access.
 * Requires header: x-debug-secret matching DEBUG_SECRET env var.
 * Returns null if authorized, or a 403 NextResponse if unauthorized.
 */
export function requireDebugAuth(): NextResponse | null {
    // headers() returns ReadonlyHeaders synchronously in route handlers
    const headersList = headers() as any;
    const provided = headersList?.get?.("x-debug-secret") ?? null;

    if (!DEBUG_SECRET || provided !== DEBUG_SECRET) {
        return NextResponse.json(
            { error: "Forbidden" },
            { status: 403 }
        );
    }

    return null; // Authorized
}
