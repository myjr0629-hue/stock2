// src/services/buildIdSSOT.ts
// S-56.4.6d: Single Source of Truth for Build ID and Environment
// Used to verify deployment parity across API routes

/**
 * Get the current Build ID with priority:
 * 1. VERCEL_DEPLOYMENT_ID (Unique deployment ID)
 * 2. NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA (Client-side exposed SHA)
 * 3. VERCEL_GIT_COMMIT_SHA (Server-side SHA)
 * 4. VERCEL_GIT_COMMIT_REF (Branch name - weak Fallback)
 * 5. "local" (Default)
 */
export function getBuildId(): string {
    return process.env.VERCEL_DEPLOYMENT_ID ||
        process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.VERCEL_GIT_COMMIT_REF ||
        "local";
}

/**
 * Get the current Environment Type
 */
export function getEnvType(): "production" | "development" | "local" {
    if (process.env.VERCEL_ENV === "production") return "production";
    if (process.env.NODE_ENV === "production") return "production";
    if (process.env.NODE_ENV === "development") return "development";
    return "local";
}
