// src/app/api/health/deploy/route.ts
// [S-56.4.6f] Deploy Lock Hard Seal API
// Exposes deployment metadata for UI badges and production guards.

import { NextResponse } from 'next/server';
import { getBuildId, getEnvType } from '@/services/buildIdSSOT';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
    const buildId = getBuildId();
    const envType = getEnvType();

    // Exact Vercel Env Vars
    const gitCommitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || null;
    const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || null;
    const vercelEnv = process.env.VERCEL_ENV || null;

    // Warning condition: Production Env but Local Build
    const isDrifted = envType === 'production' && buildId === 'local';

    return NextResponse.json({
        ok: true,
        deploy: {
            buildId,          // SSOT Result
            envType,          // production | development | local
            gitCommitSha,     // Raw SHA
            deploymentId,     // Vercel ID
            vercelEnv         // Vercel Env Name
        },
        guard: {
            isDrifted,
            message: isDrifted ? "CRITICAL: PRODUCTION ENV RUNNING LOCAL BUILD" : "OK"
        },
        timestamp: new Date().toISOString()
    }, {
        headers: {
            'Cache-Control': 'no-store, max-age=0, must-revalidate',
            'Pragma': 'no-cache'
        }
    });
}
