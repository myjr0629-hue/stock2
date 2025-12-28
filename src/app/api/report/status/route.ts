import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';

/**
 * GET /api/report/status
 * Poll for background report generation progress
 */
export async function GET() {
    const statusPath = path.join(process.cwd(), 'snapshots', 'report_state.json');

    try {
        if (!fs.existsSync(statusPath)) {
            return NextResponse.json({
                ok: true,
                status: 'IDLE',
                message: 'No active or recent report job found.'
            });
        }

        const state = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));

        // TTL Check: If updated more than 10 mins ago, consider it stale/ABORTED
        // unless it's in a terminal state
        const isTerminal = ['SUCCESS', 'FAIL', 'ABORTED'].includes(state.status);
        const STALE_THRESHOLD = 600000; // 10 mins

        if (!isTerminal && (Date.now() - (state.updatedAt || 0) > STALE_THRESHOLD)) {
            state.status = 'ABORTED';
            state.lastError = 'Job timed out or engine crashed without status update.';
            // Option: persist this back
        }

        return NextResponse.json({
            ok: true,
            ...state
        });

    } catch (e) {
        return NextResponse.json({
            ok: false,
            error: 'Failed to read report status.'
        }, { status: 500 });
    }
}
