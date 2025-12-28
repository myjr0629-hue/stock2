import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

const STATUS_PATH = path.join(process.cwd(), 'snapshots', 'report_state.json');

function getStoredStatus() {
    try {
        if (fs.existsSync(STATUS_PATH)) {
            return JSON.parse(fs.readFileSync(STATUS_PATH, 'utf-8'));
        }
    } catch (e) { }
    return null;
}

function setStoredStatus(status: any) {
    try {
        const snapshotsDir = path.dirname(STATUS_PATH);
        if (!fs.existsSync(snapshotsDir)) fs.mkdirSync(snapshotsDir, { recursive: true });
        fs.writeFileSync(STATUS_PATH, JSON.stringify({ ...status, updatedAt: Date.now() }, null, 2));
    } catch (e) { }
}

// [S-20] State Machine & Lock Object
interface RunLock {
    isRunning: boolean;
    runId: string | null;
    startedAt: number | null;
}

let runLock: RunLock = {
    isRunning: false,
    runId: null,
    startedAt: null
};

// Force Node.js runtime
export const runtime = 'nodejs';

/**
 * GET /api/report/run
 * Status Check & Manual Reset
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const reset = searchParams.get('reset') === 'true';

    if (reset) {
        const oldRunId = runLock.runId;
        runLock = { isRunning: false, runId: null, startedAt: null };
        try {
            if (fs.existsSync(STATUS_PATH)) fs.unlinkSync(STATUS_PATH);
        } catch (e) { }
        console.log(`[S-20] MANUAL_RESET: Lock cleared and status file deleted. Previous RunID: ${oldRunId}`);
        return NextResponse.json({
            ok: true,
            status: 'RESET_SUCCESS',
            message: 'Manual reset performed. Lock and persistent state cleared.',
            previousRunId: oldRunId
        });
    }

    return NextResponse.json({
        ok: true,
        status: runLock.isRunning ? 'RUNNING' : 'IDLE',
        lock: runLock,
        serverTime: Date.now()
    });
}

/**
 * POST /api/report/run
 * Trigger Report Generation
 */
export async function POST() {
    const TTL_MS = 180 * 1000; // 3 minutes TTL
    const now = Date.now();

    const stored = getStoredStatus();
    if (stored?.status === 'RUNNING' && (now - (stored.updatedAt || 0) < TTL_MS)) {
        return NextResponse.json(
            {
                ok: false,
                error: 'A report generation is already in progress (Background).',
                runId: stored.runId,
                status: stored.status,
                elapsedMs: now - (stored.updatedAt || now)
            },
            { status: 429 }
        );
    }

    if (runLock.isRunning) {
        // Fallback for in-memory sync
        return NextResponse.json(
            {
                ok: false,
                error: 'A report generation is already in progress.',
                runId: runLock.runId,
                startedAt: runLock.startedAt
            },
            { status: 429 }
        );
    }

    // 2) Set Lock
    const currentRunId = `RUN_${now}`;
    runLock = {
        isRunning: true,
        runId: currentRunId,
        startedAt: now
    };

    // 3) Fire & Forget Background Execution
    const scriptPath = path.join(process.cwd(), 'scripts', 'final_gems_report.ts');
    const command = `npx tsx "${scriptPath}"`;

    console.log(`[API] Triggering Async Report ${currentRunId}`);

    // Initialize persistent state
    setStoredStatus({
        status: 'RUNNING',
        step: 'INIT',
        runId: currentRunId,
        progress: { tickersDone: 0, totalTickers: 12 },
        startedAt: now
    });

    // Start process in background
    const child = exec(
        command,
        {
            cwd: process.cwd(),
            env: {
                ...process.env,
                ALLOW_MASSIVE_FOR_SNAPSHOT: '1',
                TIER01_SNAPSHOT_MODE: '1',
                FORCE_COLOR: '0',
            },
            timeout: 600000,
            maxBuffer: 1024 * 1024 * 10,
        },
        (error, stdout, stderr) => {
            // [S-26] This callback runs when the background process eventually finishes
            if (runLock.runId === currentRunId) {
                runLock = { isRunning: false, runId: null, startedAt: null };
            }
            if (error) {
                console.error(`[Background Task FAIL] ${currentRunId}:`, error.message);
                // Script itself should update report_state.json to FAIL, 
                // but we add a safety update here.
                const currentStatus = getStoredStatus();
                if (currentStatus?.runId === currentRunId && currentStatus?.status === 'RUNNING') {
                    setStoredStatus({ ...currentStatus, status: 'FAIL', lastError: error.message });
                }
            } else {
                console.log(`[Background Task SUCCESS] ${currentRunId}`);
            }
        }
    );

    // Return immediately
    return NextResponse.json({
        ok: true,
        runId: currentRunId,
        status: 'STARTED',
        startedAt: now,
        message: 'Report generation started in background'
    });
}
