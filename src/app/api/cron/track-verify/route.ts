// ============================================================================
// [V6.0] Post-Market Track Record Verification Cron
// Runs at 16:30 ET (21:30 UTC) Monday-Friday
//
// TWO JOBS:
// 1. SAME-DAY ENTRY CHECK: Did today's recommended stocks hit their entry zone?
// 2. T+3 OUTCOME CHECK: Final WIN/LOSS/FLAT verdict for matured records
// ============================================================================

import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    // Security: Check CRON_SECRET
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');
    const secretParam = searchParams.get('secret');

    if (process.env.NODE_ENV === 'production' && cronSecret) {
        const isHeaderValid = authHeader === `Bearer ${cronSecret}`;
        const isParamValid = secretParam === cronSecret;
        if (!isHeaderValid && !isParamValid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const startTime = Date.now();
    const results = {
        sameDayCheck: { processed: 0, triggered: 0, notTriggered: 0, error: null as string | null },
        t3Check: { processed: 0, wins: 0, losses: 0, flat: 0, invalidEntry: 0, error: null as string | null },
    };

    try {
        // ================================================================
        // JOB 1: Same-Day Entry Zone Check
        // For today's PENDING records → check if price entered entry_zone
        // ================================================================
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        // Get today's date in ET
        const todayET = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        const todayDate = new Date(todayET);
        const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;

        console.log(`[TrackVerify] Starting post-market verification for ${todayStr}...`);

        // Fetch today's PENDING records
        const { data: todayRecords, error: todayError } = await supabase
            .from('alpha_track_records')
            .select('*')
            .eq('recorded_date', todayStr)
            .eq('outcome', 'PENDING');

        if (todayError) {
            results.sameDayCheck.error = todayError.message;
            console.error('[TrackVerify] Error fetching today records:', todayError);
        } else if (todayRecords && todayRecords.length > 0) {
            console.log(`[TrackVerify] Found ${todayRecords.length} today's records to check entry zones.`);

            // Fetch intraday data for each ticker
            for (const record of todayRecords) {
                try {
                    // Use Polygon day aggregate for today
                    const polyUrl = `https://api.polygon.io/v2/aggs/ticker/${record.ticker}/range/1/day/${todayStr}/${todayStr}?apiKey=${process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY}`;
                    const res = await fetch(polyUrl);
                    const data = await res.json();

                    if (data.results && data.results.length > 0) {
                        const candle = data.results[0];
                        const low = candle.l;
                        const high = candle.h;

                        // Check if price entered entry zone at any point today
                        const isTriggered = low <= record.entry_zone_upper && high >= record.entry_zone_lower;

                        // Update is_entry_triggered
                        await supabase
                            .from('alpha_track_records')
                            .update({ is_entry_triggered: isTriggered })
                            .eq('id', record.id);

                        results.sameDayCheck.processed++;
                        if (isTriggered) {
                            results.sameDayCheck.triggered++;
                            console.log(`[TrackVerify] ${record.ticker}: ✅ ENTRY TRIGGERED (Low=${low.toFixed(2)}, Zone=${record.entry_zone_lower}~${record.entry_zone_upper})`);
                        } else {
                            results.sameDayCheck.notTriggered++;
                            console.log(`[TrackVerify] ${record.ticker}: ⏳ No entry (Low=${low.toFixed(2)}, Zone=${record.entry_zone_lower}~${record.entry_zone_upper})`);
                        }
                    }
                } catch (e: any) {
                    console.error(`[TrackVerify] Entry check failed for ${record.ticker}:`, e?.message);
                }
            }
        } else {
            console.log('[TrackVerify] No pending records for today.');
        }

        // ================================================================
        // JOB 2: T+3 Outcome Verification
        // For matured PENDING records → determine WIN/LOSS/FLAT
        // ================================================================
        try {
            const { verifyPendingTrackRecords } = await import('@/services/trackRecord/trackRecordService');
            const t3Result = await verifyPendingTrackRecords();
            results.t3Check.processed = t3Result.processed;
            if (t3Result.error) results.t3Check.error = t3Result.error;
            console.log(`[TrackVerify] T+3 verification complete: ${t3Result.processed} records evaluated.`);
        } catch (e: any) {
            results.t3Check.error = e?.message || 'T+3 check failed';
            console.error('[TrackVerify] T+3 check failed:', e);
        }

        // ================================================================
        // JOB 3: Invalidate Supabase performance cache
        // So next report generation picks up fresh data
        // ================================================================
        try {
            const { invalidateCache } = await import('@/services/trackRecord/supabaseTrackQuery');
            invalidateCache();
        } catch (e) { }

    } catch (error: any) {
        console.error('[TrackVerify] Fatal error:', error);
        return NextResponse.json({
            error: 'Verification failed',
            message: error.message,
            elapsed: `${Date.now() - startTime}ms`
        }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        date: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
        elapsed: `${Date.now() - startTime}ms`,
        results
    });
}
