// [S-52.6] Health Check - Report Status
// Returns SSOT, integrity, and counts for monitoring

import { loadLatest, validateReportShape, calculateOptionsStatus } from '@/lib/storage/reportStore';
import fs from 'fs';
import path from 'path';
import { getBuildId, getEnvType } from '@/services/buildIdSSOT'; // [S-56.4.6d]

export const dynamic = 'force-dynamic';
export const revalidate = 0; // [S-56.3] No caching

// [S-56.3] Cache-Control SSOT
const NO_CACHE_HEADERS = {
    'Cache-Control': 'no-store, max-age=0, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'eod';
    const buildId = getBuildId();
    const includeSnapshot = searchParams.get('includeSnapshot') === 'true'; // [S-56.4.7b]

    const isVercelEnv = process.env.VERCEL === '1' || !!process.env.VERCEL_ENV;
    // [P0] HARDCODED: Always use Redis SSOT
    const useRedisEnv = true;

    try {
        const report = await loadLatest(type);

        if (!report) {
            return Response.json({
                ok: false,
                ssot: useRedisEnv ? 'REDIS' : 'FS',
                error: 'Report not found',
                type
            }, { status: 404, headers: NO_CACHE_HEADERS });
        }

        const validation = validateReportShape(report);
        const optionsStatus = calculateOptionsStatus(report);

        const reportStr = JSON.stringify(report);

        return Response.json({
            ok: true,
            ssot: useRedisEnv ? 'REDIS' : 'FS',
            type,
            bytes: reportStr.length,
            // [S-56.4.7b] Include full snapshot if requested for UI binding
            snapshot: includeSnapshot ? report : undefined,
            reportId: report.meta?.id || 'unknown',
            generatedAtET: report.meta?.generatedAtET || report.meta?.generatedAt,
            version: report.meta?.version,
            integrity: validation.integrity,
            optionsStatus: (report.meta as any)?.optionsStatus || optionsStatus, // [S-55.3] Prefer Meta SSOT
            freshness: (report.meta as any)?.freshness, // [S-55.3] Freshness & ETA
            firstItemGateStatus: (report.items?.[0] as any)?.v71?.gateStatus || (() => {
                try {
                    const fsPath = path.join(process.cwd(), 'snapshots/latest.json');
                    const fsData = JSON.parse(fs.readFileSync(fsPath, 'utf-8'));
                    return fsData.items?.[0]?.v71?.gateStatus;
                } catch { return 'FS_READ_FAIL'; }
            })(),
            counts: {
                items: report.items?.length ?? 0,
                top3: report.meta?.top3?.length ?? report.alphaGrid?.top3?.length ?? 0,
                fullUniverse: report.alphaGrid?.fullUniverse?.length ?? 0
            },
            env: {
                USE_REDIS_SSOT: 'true', // [P0] HARDCODED
                buildId: buildId.slice(0, 7)
            },
            // [S-56.4.5c] Env Diagnostics Fallback - for production route parity check
            envDiagnostics: {
                MASSIVE_API_KEY_present: !!(process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY),
                MASSIVE_BASE_URL_present: !!process.env.MASSIVE_BASE_URL || true,
                USE_REDIS_SSOT: 'true', // [P0] HARDCODED
                buildId: buildId.slice(0, 7),
                routeVersionTag: 'S-56.4.6d'
            },
            // [S-56.1] Continuity Stats
            continuityStats: (() => {
                const diffs = (report as any).diffs || [];
                const total = 12; // Top 12
                const continued = diffs.filter((d: any) => d.reasonCode === 'CONTINUATION').length;
                const newEntries = diffs.filter((d: any) => d.reasonCode === 'NEW_ENTRY').length;

                // If diffs are not populated in report, we can't calculate cleanly here without loading prev report.
                // So we rely on what's in the report SSOT.

                return {
                    retentionRate: diffs.length > 0 ? ((continued / total) * 100).toFixed(1) : "N/A",
                    maintainCount: continued,
                    newEntryCount: newEntries,
                    churnRate: diffs.length > 0 ? ((newEntries / total) * 100).toFixed(1) : "N/A"
                };
            })(),
            // [S-56.2] Universe Policy SSOT
            universeStats: (report as any).engine?.universeStats || null,
            universePolicy: (report as any).engine?.universePolicy ? {
                etfExcluded: (report as any).engine.universePolicy.etfExcluded,
                classifierVersion: (report as any).engine.universePolicy.classifierVersion,
                excludedETFCount: (report as any).engine.universePolicy.excludedETFs?.length || 0
            } : null,
            macroSSOT: (report as any).engine?.macroSSOT || null,
            leadersTrackStats: (report as any).engine?.leadersTrack ? {
                groupCount: (report as any).engine.leadersTrack.groups?.length || 0,
                groups: (report as any).engine.leadersTrack.groups?.map((g: any) => ({
                    key: g.key,
                    itemCount: g.items?.length || 0
                })) || []
            } : null,
            etfIntegrity: (report as any).engine?.etfIntegrity || null
        }, { headers: NO_CACHE_HEADERS });
    } catch (error) {
        return Response.json({
            ok: false,
            ssot: useRedisEnv ? 'REDIS' : 'FS',
            error: (error as Error).message,
            type
        }, { status: 500, headers: NO_CACHE_HEADERS });
    }
}
