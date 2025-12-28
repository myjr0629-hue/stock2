// [S-53.6] Report Finalization Endpoint
// Check if options are READY and regenerate FINAL report if so

import { NextResponse } from 'next/server';
import { loadLatest, saveReport } from '@/lib/storage/reportStore';

export const dynamic = 'force-dynamic';

type ReportType = 'eod' | 'pre2h' | 'open30m';

export async function POST(request: Request) {
    const { searchParams } = new URL(request.url);
    const type = (searchParams.get('type') || 'eod') as ReportType;

    try {
        // 1) Load current latest report
        const currentReport = await loadLatest(type);

        if (!currentReport) {
            return NextResponse.json({
                success: false,
                reason: 'NO_REPORT_EXISTS',
                message: '기존 보고서가 없습니다. 먼저 /api/reports/generate를 호출하세요.'
            }, { status: 404 });
        }

        // 2) Check optionsStatus
        const optionsStatus = currentReport.meta?.optionsStatus;

        if (!optionsStatus) {
            return NextResponse.json({
                success: false,
                reason: 'NO_OPTIONS_STATUS',
                message: 'optionsStatus가 없습니다. 보고서를 다시 생성해주세요.'
            }, { status: 400 });
        }

        // 3) Already READY? No action needed
        if (optionsStatus.state === 'READY') {
            return NextResponse.json({
                success: true,
                reason: 'ALREADY_FINALIZED',
                message: '이미 FINAL 보고서입니다.',
                optionsStatus,
                reportId: currentReport.meta?.id
            });
        }

        // 4) Check coverage - if 100%, upgrade to READY
        const coveragePct = optionsStatus.coveragePct ?? 0;
        const pendingTickers = optionsStatus.pendingTickers ?? [];

        if (coveragePct >= 100 && pendingTickers.length === 0) {
            // Options ready but state not updated - update it
            const updatedReport = {
                ...currentReport,
                meta: {
                    ...currentReport.meta,
                    optionsStatus: {
                        ...optionsStatus,
                        state: 'READY',
                        lastUpdatedAt: new Date().toISOString()
                    },
                    integrity: {
                        ...currentReport.meta?.integrity,
                        status: 'OK' // Upgrade from PARTIAL to OK
                    }
                }
            };

            const result = await saveReport(
                currentReport.meta?.marketDate || new Date().toISOString().split('T')[0],
                type,
                updatedReport
            );

            return NextResponse.json({
                success: true,
                reason: 'FINALIZED',
                message: 'FINAL 보고서로 업그레이드되었습니다.',
                optionsStatus: updatedReport.meta.optionsStatus,
                reportId: updatedReport.meta?.id,
                stored: result.stored
            });
        }

        // 5) Still PENDING/PARTIAL - return current status
        return NextResponse.json({
            success: false,
            reason: 'OPTIONS_NOT_READY',
            message: `옵션 수집 미완료: ${pendingTickers.length}개 대기 중`,
            optionsStatus,
            pendingTickers,
            coveragePct,
            reportId: currentReport.meta?.id
        });

    } catch (error: any) {
        console.error('[S-53.6] Finalize error:', error);
        return NextResponse.json({
            success: false,
            reason: 'ERROR',
            message: error.message
        }, { status: 500 });
    }
}

// GET for status check
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const type = (searchParams.get('type') || 'eod') as ReportType;

    try {
        const currentReport = await loadLatest(type);

        if (!currentReport) {
            return NextResponse.json({
                status: 'NO_REPORT',
                canFinalize: false
            });
        }

        const optionsStatus = currentReport.meta?.optionsStatus || { state: 'PENDING' };
        const coveragePct = optionsStatus.coveragePct ?? 0;
        const pendingTickers = optionsStatus.pendingTickers ?? [];

        return NextResponse.json({
            status: optionsStatus.state,
            coveragePct,
            pendingCount: pendingTickers.length,
            pendingTickers,
            canFinalize: optionsStatus.state === 'READY' || (coveragePct >= 100 && pendingTickers.length === 0),
            reportId: currentReport.meta?.id,
            lastUpdatedAt: optionsStatus.lastUpdatedAt
        });

    } catch (error: any) {
        return NextResponse.json({
            status: 'ERROR',
            error: error.message
        }, { status: 500 });
    }
}
