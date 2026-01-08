// [S-50.0] Latest API - Get latest report by type
// [S-51.5.2] Updated with @upstash/redis and UTF-8 charset
import { loadLatest } from '@/lib/storage/reportStore';
import { ReportType } from '@/services/reportScheduler';
import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0; // [S-56.3] No caching

// [S-56.3] Cache-Control SSOT: No stale data
const NO_CACHE_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as ReportType | 'gems' | null;

    try {
        // Default to 'eod' if no type specified, but respect explicit override
        const reportType = type || 'eod';

        // Special case: 'gems' returns latest.json (engine report)
        if (reportType === 'gems') {
            const filePath = path.join(process.cwd(), 'snapshots', 'latest.json');

            try {
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                return new Response(fileContent, {
                    status: 200,
                    headers: NO_CACHE_HEADERS
                });
            } catch {
                return new Response(JSON.stringify({
                    error: 'GEMS report not yet generated'
                }), {
                    status: 404,
                    headers: NO_CACHE_HEADERS
                });
            }
        }

        // Regular report types (eod, pre2h, open30m)
        const report = await loadLatest(reportType);

        if (!report) {
            return new Response(JSON.stringify({
                error: 'Report not found',
                type: reportType,
                hint: 'Use POST /api/reports/generate?type=eod to generate a report'
            }), {
                status: 404,
                headers: NO_CACHE_HEADERS
            });
        }

        // [S-52.4.x] Add storageDebug metadata for tracing
        const isVercelEnv = process.env.VERCEL === '1' || !!process.env.VERCEL_ENV;
        const storageDebug = {
            ssot: isVercelEnv ? 'REDIS' : 'FS',
            key: `reports:latest:${reportType}`,
            fetchedAt: new Date().toISOString(),
            buildId: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7)
                || process.env.VERCEL_DEPLOYMENT_ID?.slice(0, 7)
                || (process.env.VERCEL === '1' ? 'vercel-' + Date.now().toString(36) : 'local'),
            itemsCount: report.items?.length ?? report.alphaGrid?.fullUniverse?.length ?? report.meta?.top3?.length ?? 0
        };

        return new Response(JSON.stringify({
            ...report,
            storageDebug
        }), {
            status: 200,
            headers: NO_CACHE_HEADERS
        });
    } catch (error) {
        console.error('[Latest API] Error:', error);
        return new Response(JSON.stringify({
            error: 'Internal Server Error',
            message: (error as Error).message
        }), {
            status: 500,
            headers: NO_CACHE_HEADERS
        });
    }
}
