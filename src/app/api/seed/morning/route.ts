
import { NextResponse } from 'next/server';
import { generateReport } from '@/services/reportScheduler';
import { Redis } from '@upstash/redis';

// Force dynamic
export const runtime = 'nodejs'; // Use nodejs runtime for report generation (fs usage)

export async function POST(req: Request) {
    try {
        // 1. Redis Setup (for Lock & Rate Limit)
        const redis = Redis.fromEnv();
        const LOCK_KEY = 'lock:seed:morning';
        const LOCK_TTL = 60; // 60 seconds

        // 2. Simple Rate Limit (IP based could be added, but global lock is P0)
        // Check Global Lock
        const isLocked = await redis.get(LOCK_KEY);
        if (isLocked) {
            return NextResponse.json(
                { ok: false, error: 'Seeding already in progress' },
                { status: 429 }
            );
        }

        // 3. Acquire Lock
        await redis.set(LOCK_KEY, 'LOCKED', { ex: LOCK_TTL });

        try {
            console.log('[API] Seeding Morning Report (On-Demand)...');

            // 4. Generate Report (Force = true to Ensure creation)
            // 'morning' type is now supported
            const report = await generateReport('morning', true);

            // 5. Release Lock (Optimistic)
            await redis.del(LOCK_KEY);

            return NextResponse.json({
                ok: true,
                reportId: report.meta.id,
                generatedAtET: report.meta.generatedAtET,
                itemsCount: report.items.length
            });

        } catch (genError: any) {
            console.error('[API] Seed Failure:', genError);
            // Release lock on failure
            await redis.del(LOCK_KEY);
            return NextResponse.json(
                { ok: false, error: genError.message || 'Generation Failed' },
                { status: 500 }
            );
        }

    } catch (e: any) {
        console.error('[API] Setup Failure:', e);
        return NextResponse.json(
            { ok: false, error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
