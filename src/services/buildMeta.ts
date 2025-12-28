// [S-52.2.3] Build Metadata Service
// Returns deployment info for API responses to help identify stale builds.

export interface BuildMeta {
    buildId: string;
    deployedAt: string;
    runtime: string;
    vercelRegion: string | null;
}

// [S-55.10a] Enhanced SSOT Build ID (Production)
const VERCEL_DEPLOYMENT_ID = process.env.VERCEL_DEPLOYMENT_ID;
const VERCEL_GIT_COMMIT_SHA = process.env.VERCEL_GIT_COMMIT_SHA;
const VERCEL_GIT_COMMIT_REF = process.env.VERCEL_GIT_COMMIT_REF;

const BUILD_ID = (() => {
    if (VERCEL_DEPLOYMENT_ID) return VERCEL_DEPLOYMENT_ID;
    if (VERCEL_GIT_COMMIT_SHA) return VERCEL_GIT_COMMIT_SHA.substring(0, 7);
    if (VERCEL_GIT_COMMIT_REF) return VERCEL_GIT_COMMIT_REF;
    if (process.env.VERCEL_URL) return process.env.VERCEL_URL;
    if (process.env.VERCEL) return 'vercel-managed';
    return 'local';
})();

const DEPLOYED_AT = new Date().toISOString();

export function getBuildMeta(headers?: Headers): BuildMeta {
    return {
        buildId: BUILD_ID,
        deployedAt: DEPLOYED_AT,
        runtime: process.env.NEXT_RUNTIME || "nodejs",
        vercelRegion: headers?.get('x-vercel-id')?.split(':')[0] || process.env.VERCEL_REGION || null
    };
}
