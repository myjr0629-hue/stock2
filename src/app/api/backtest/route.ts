// [V3.1] Backtest API — Check & Display Alpha Engine Performance
// GET /api/backtest — Returns backtest summary + records
// POST /api/backtest/check — Triggers outcome checking for pending records

import { NextRequest, NextResponse } from 'next/server';
import {
    getBacktestSummary,
    getAllRecords,
    checkPendingOutcomes
} from '@/services/backtestService';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const action = req.nextUrl.searchParams.get('action');

    try {
        if (action === 'check') {
            // Trigger outcome checking
            const checked = await checkPendingOutcomes();
            const summary = getBacktestSummary();
            return NextResponse.json({
                checkedCount: checked,
                summary,
                message: `Checked ${checked} pending records`
            });
        }

        // Default: return summary + recent records
        const summary = getBacktestSummary();
        const records = getAllRecords().slice(0, 50); // Last 50

        return NextResponse.json({
            summary,
            records,
            _meta: {
                endpoint: '/api/backtest',
                description: 'Alpha Engine Self-Correction: Tracks ACTIONABLE recommendations vs 3-day outcomes',
                usage: {
                    summary: 'GET /api/backtest',
                    check: 'GET /api/backtest?action=check'
                }
            }
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}
