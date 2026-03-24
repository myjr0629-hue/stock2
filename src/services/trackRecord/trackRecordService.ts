import { createClient } from '@supabase/supabase-js';
import { AlphaInput } from '../alphaEngine';

// Initialize Supabase Client (assuming Edge Context or Server Context)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// TYPES
// ============================================================================

export interface TrackRecordDB {
    id?: string;
    recorded_date: string;
    recommendation_type: 'PRE_MARKET' | 'INTRADAY';
    ticker: string;
    alpha_score: number;
    grade: string;
    action: string;
    price_at_recommendation: number;
    entry_zone_lower: number;
    entry_zone_upper: number;
    target_price: number;
    stop_loss_price: number;
    target_check_date: string;
    is_entry_triggered?: boolean;
    price_at_check?: number | null;
    return_pct?: number | null;
    outcome?: 'WIN' | 'LOSS' | 'FLAT' | 'INVALID_ENTRY' | 'PENDING';
    created_at?: string;
}

// ============================================================================
// 1. SAVE NEW RECOMMENDATIONS TO DB (CRON JOB ENTRY POINT)
// ============================================================================

/**
 * Saves the given top recommended stocks into the `alpha_track_records` table.
 * @param topItems The enriched items (with decisionSSOT)
 * @param type 'PRE_MARKET' or 'INTRADAY'
 */
export async function insertNewTrackRecords(
    topItems: any[],
    type: 'PRE_MARKET' | 'INTRADAY'
): Promise<{ success: boolean; count: number; error?: string }> {
    try {
        if (!topItems || topItems.length === 0) {
            return { success: true, count: 0 };
        }

        const today = new Date();
        const recordedDate = today.toISOString().split('T')[0];

        // Calculate Target Check Date (T+3 Business Days, holiday-aware)
        const targetCheckDate = (await calculateTPlus3(today)).toISOString().split('T')[0];

        const recordsToInsert: TrackRecordDB[] = topItems.map(item => {
            const ssot = item.decisionSSOT;
            if (!ssot) {
                console.warn(`[TrackRecord] Warning: Stock ${item.ticker || item.symbol} is missing decisionSSOT.`);
            }

            const currentPrice = item.evidence?.price?.last || item.price || 0;
            const entryLower = ssot?.entryBand?.[0] || currentPrice * 0.98;
            const entryUpper = ssot?.entryBand?.[1] || currentPrice;
            const target = ssot?.targetPrice || currentPrice * 1.05;
            const stopLoss = ssot?.cutPrice || currentPrice * 0.95;

            return {
                recorded_date: recordedDate,
                recommendation_type: type,
                ticker: item.ticker || item.symbol,
                alpha_score: item.alphaScore || item.powerScore || item.score || 0,
                grade: item.qualityTier || item.grade || 'C',
                action: ssot?.tacticalConclusion?.direction === 'BULLISH' ? 'STRONG_BULLISH' : 'BULLISH',
                price_at_recommendation: currentPrice,
                entry_zone_lower: entryLower,
                entry_zone_upper: entryUpper,
                target_price: target,
                stop_loss_price: stopLoss,
                target_check_date: targetCheckDate,
                outcome: 'PENDING'
            };
        });

        // Upsert logic: Avoid duplicating the exact same ticket + type + date
        for (const record of recordsToInsert) {
            const { error: matchError, count } = await supabase
                .from('alpha_track_records')
                .select('id', { count: 'exact' })
                .eq('ticker', record.ticker)
                .eq('recorded_date', record.recorded_date)
                .eq('recommendation_type', record.recommendation_type);

            if (count === 0) {
                const { error: insertError } = await supabase
                    .from('alpha_track_records')
                    .insert(record);

                if (insertError) {
                    console.error(`[TrackRecord] Error inserting ${record.ticker}:`, insertError);
                }
            }
        }

        return { success: true, count: recordsToInsert.length };

    } catch (error: any) {
        console.error('[TrackRecord] Database Injection Failed:', error);
        return { success: false, count: 0, error: error.message };
    }
}

// ============================================================================
// 2. T+3 ENTRY ZONE VERIFICATION ENGINE (OVERNIGHT BATCH)
// ============================================================================

/**
 * Validates pending track records to see if they triggered the entry zone,
 * and if so, whether the recommendation was a WIN, LOSS, or FLAT.
 */
export async function verifyPendingTrackRecords(): Promise<{ success: boolean; processed: number; error?: string }> {
    try {
        const todayStr = new Date().toISOString().split('T')[0];

        // 1. Fetch PENDING records where target_check_date is today or in the past
        const { data: records, error: fetchError } = await supabase
            .from('alpha_track_records')
            .select('*')
            .eq('outcome', 'PENDING')
            .lte('target_check_date', todayStr);

        if (fetchError) throw fetchError;
        if (!records || records.length === 0) {
            console.log('[TrackRecord] No pending records to verify today.');
            return { success: true, processed: 0 };
        }

        console.log(`[TrackRecord] Found ${records.length} pending records to verify. Initiating Precision Engine...`);
        let processedCount = 0;

        // Dynamic import massiveClient to fetch daily aggregates
        const { fetchMassive } = await import('../massiveClient');

        for (const record of records as TrackRecordDB[]) {
            const ticker = record.ticker;
            const startDate = record.recorded_date;
            const endDate = record.target_check_date;

            // Step 2: Fetch Daily Candles from Polygon via Massive
            // We use the 'day' timeframe to get Low/High over the T~T+3 span
            let aggregates: any[] = [];
            try {
                // Polygon aggregates API expects: /v2/aggs/ticker/{ticker}/range/1/day/{start}/{end}
                // We will construct this call using the massive pipeline or direct fetch
                const polyUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${startDate}/${endDate}?apiKey=${process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY}`;
                const res = await fetch(polyUrl);
                const data = await res.json();
                if (data.results && data.results.length > 0) {
                    aggregates = data.results;
                }
            } catch (e) {
                console.error(`[TrackRecord] Failed to fetch aggregates for ${ticker}:`, e);
                continue; // Skip and try again tomorrow
            }

            if (aggregates.length === 0) {
                console.warn(`[TrackRecord] No market data found for ${ticker} between ${startDate} and ${endDate}. Skipping.`);
                continue;
            }

            // Step 3: Entry Zone Check (Precision Logic)
            // Did the price ever drop into the entry zone?
            let isEntryTriggered = false;
            let highestPostEntry = 0;
            let closingPrice = aggregates[aggregates.length - 1].c; // Last day's close

            for (const candle of aggregates) {
                const low = candle.l;
                const high = candle.h;

                // Condition: If the lowest price of the day is <= entry_zone_upper
                // AND highest price of the day >= entry_zone_lower, it crossed the zone.
                // Or if it simply opened inside the zone.
                if (low <= record.entry_zone_upper && high >= record.entry_zone_lower) {
                    isEntryTriggered = true;
                }

                if (isEntryTriggered && high > highestPostEntry) {
                    highestPostEntry = high;
                }
            }

            // Step 4: Outcome Evaluation
            let finalOutcome: TrackRecordDB['outcome'] = 'PENDING';
            let returnPct = 0;
            const entryRef = (record.entry_zone_lower + record.entry_zone_upper) / 2; // Midpoint for calculation

            if (!isEntryTriggered) {
                // 진입 실패 (날아가버렸거나, 닿지 않음) -> 모수 제외
                finalOutcome = 'INVALID_ENTRY';
                returnPct = 0;
            } else {
                // 진입 성공 (Entry Triggered) -> Validate Win/Loss
                const hitTarget = highestPostEntry >= record.target_price;
                const closedAboveRef = closingPrice > entryRef;
                const stoppedOut = closingPrice <= record.stop_loss_price; // Naive check: did it close below SL?

                // WIN: If it hit the target price AT ANY POINT, or closed +3% higher, or closed higher in general.
                // We use a strict WIN criteria: Hit Target = WIN.
                if (hitTarget) {
                    finalOutcome = 'WIN';
                    returnPct = ((record.target_price - entryRef) / entryRef) * 100;
                    closingPrice = record.target_price; // Assume sold at target
                } else if (stoppedOut) {
                    finalOutcome = 'LOSS';
                    returnPct = ((closingPrice - entryRef) / entryRef) * 100;
                } else if (closedAboveRef && closingPrice >= entryRef * 1.01) {
                    // Closed decently above entry (e.g. +1%)
                    finalOutcome = 'WIN';
                    returnPct = ((closingPrice - entryRef) / entryRef) * 100;
                } else if (closingPrice < entryRef * 0.99) {
                    finalOutcome = 'LOSS';
                    returnPct = ((closingPrice - entryRef) / entryRef) * 100;
                } else {
                    finalOutcome = 'FLAT';
                    returnPct = ((closingPrice - entryRef) / entryRef) * 100;
                }
            }

            // Step 5: Update Database
            const { error: updateError } = await supabase
                .from('alpha_track_records')
                .update({
                    is_entry_triggered: isEntryTriggered,
                    price_at_check: closingPrice,
                    return_pct: Number(returnPct.toFixed(2)),
                    outcome: finalOutcome
                })
                .eq('id', record.id);

            if (updateError) {
                console.error(`[TrackRecord] Failed to update outcome for ${ticker}:`, updateError);
            } else {
                processedCount++;
                console.log(`[TrackRecord] Verified ${ticker}: ${finalOutcome} (Triggered: ${isEntryTriggered}, Return: ${returnPct.toFixed(2)}%)`);
            }
        }

        return { success: true, processed: processedCount };

    } catch (error: any) {
        console.error('[TrackRecord] Verification Engine Failed:', error);
        return { success: false, processed: 0, error: error.message };
    }
}

// ============================================================================
// HELPER: Calculate T+3 Business Days (Holiday-Aware)
// ============================================================================

async function calculateTPlus3(startDate: Date): Promise<Date> {
    const { getMarketHolidays, isMarketHoliday } = await import('../holidayCache');
    let holidays: Awaited<ReturnType<typeof getMarketHolidays>> = [];
    try {
        holidays = await getMarketHolidays();
    } catch (e) {
        console.warn('[TrackRecord] Holiday fetch failed, skipping holiday check');
    }

    let daysAdded = 0;
    let currentDate = new Date(startDate);

    while (daysAdded < 3) {
        currentDate.setDate(currentDate.getDate() + 1);
        const dayOfWeek = currentDate.getDay();
        const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

        // Skip Weekends (0 = Sunday, 6 = Saturday) and Market Holidays
        if (dayOfWeek !== 0 && dayOfWeek !== 6 && !isMarketHoliday(dateStr, holidays)) {
            daysAdded++;
        }
    }

    return currentDate;
}
