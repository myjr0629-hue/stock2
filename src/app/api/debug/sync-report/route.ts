// [Debug] Manual Sync Route - Reads from FIXED local snapshot and pushes to Redis
import { NextResponse } from 'next/server';
import { saveReport } from '@/lib/storage/reportStore';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        console.log("SYNC DEBUG: Loading Manual Report from DISK...");

        // Define path to the calibrated report
        const filePath = path.join(process.cwd(), 'snapshots/reports/2026-01-09/eod.json');

        if (!fs.existsSync(filePath)) {
            throw new Error(`Manual snapshot not found at ${filePath}`);
        }

        // Read and Parse
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const MANUAL_REPORT = JSON.parse(fileContent);

        console.log(`SYNC DEBUG: Loaded Report ${MANUAL_REPORT.meta.id} with ${MANUAL_REPORT.items.length} items from ${filePath}`);

        // Force save to Redis
        // Using 'eod' type and force=true
        // This will bypass the "Master Protection" check because force=true is passed (Wait, let's allow force=true to save the recalibrated master)
        const result = await saveReport('2026-01-09', 'eod', MANUAL_REPORT, true);

        return NextResponse.json({
            success: true,
            message: 'Synced to Redis (Loaded from Disk - 2026 Calibrated)',
            result,
            reportId: MANUAL_REPORT.meta.id
        });

    } catch (e: any) {
        console.error("Sync Failed:", e);
        return NextResponse.json({
            success: false,
            error: e.message,
            stack: e.stack
        }, { status: 500 });
    }
}
