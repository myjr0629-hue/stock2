
import { NextResponse } from 'next/server';

// Simple test to check if imports work
export async function GET(request: Request) {
    try {
        // Step 1: Try importing the module
        console.log("[Test] Attempting to import GuardianDataHub...");
        const { GuardianDataHub } = await import('@/services/guardian/unifiedDataStream');
        console.log("[Test] Import successful!");

        // Step 2: Test call
        console.log("[Test] Calling getGuardianSnapshot...");
        const context = await GuardianDataHub.getGuardianSnapshot(true);
        console.log("[Test] Call successful!", context.rlsi.score);

        return NextResponse.json({ success: true, score: context.rlsi.score });
    } catch (error: any) {
        console.error("[Test] ERROR:", error?.message || error);
        console.error("[Test] Stack:", error?.stack);

        return NextResponse.json({
            success: false,
            error: error?.message || String(error),
            stack: error?.stack
        }, { status: 500 });
    }
}
