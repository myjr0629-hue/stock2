
import { fetchMassive } from "../massiveClient";

// === TYPES ===
export interface RvolProfile {
    ticker: string;
    rvol: number;          // The calculated Ratio (e.g. 1.2 = 120% of normal)
    currentVol: number;    // Today's cumulative volume so far
    baselineVol: number;   // Average cumulative volume at this time
    timestamp: number;     // Calculation time
    status: "OPEN" | "CLOSED" | "PRE_MARKET" | "AFTER_HOURS";
}

interface AggBar {
    o: number; h: number; l: number; c: number; v: number; t: number;
}

// === CONFIG ===
const BAR_SIZE_MIN = 5; // 5-minute bars for baseline
const BASELINE_DAYS = 20; // 20-day average

// Cache baselines in memory (refresh once per day effectively)
// Map<Ticker, Map<MinuteOfDay, AvgCumVol>>
const baselineCache: Map<string, Map<number, number>> = new Map();
const baselineTimestamp: Map<string, number> = new Map();

export class RvolEngine {

    /**
     * Get Real-time RVOL for a specific ticker (e.g., QQQ, DIA)
     */
    static async getRvol(ticker: string): Promise<RvolProfile> {
        try {
            // 1. Determine Market State & Time
            const now = new Date();
            const nyTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
            const hours = nyTime.getHours();
            const minutes = nyTime.getMinutes();
            const marketOpen = 9 * 60 + 30; // 09:30 => 570
            const marketClose = 16 * 60;    // 16:00 => 960
            const currentMinuteOfDay = hours * 60 + minutes;

            let status: RvolProfile['status'] = "CLOSED";
            if (currentMinuteOfDay >= marketOpen && currentMinuteOfDay < marketClose) status = "OPEN";
            else if (currentMinuteOfDay < marketOpen) status = "PRE_MARKET";
            else status = "AFTER_HOURS";

            // 2. Ensure Baseline Exists (Heavy Lift - done once)
            await this.ensureBaseline(ticker);

            // 3. Fallback Logic for PRE_MARKET (Show Yesterday's Final RVOL)
            if (status === "PRE_MARKET") {
                // Fetch Previous Close Data
                const prevRes = await fetchMassive(`/v2/aggs/ticker/${ticker}/prev`, { adjusted: "true" });

                if (prevRes.results && prevRes.results.length > 0) {
                    const prevBar = prevRes.results[0];
                    const prevVol = prevBar.v;

                    // Get Baseline Total Volume (at 16:00 / 960m)
                    const baseline = baselineCache.get(ticker);
                    // Find the last minute in the map (usually 960 or closest)
                    const endOfDayMinute = 16 * 60;
                    const baselineTotal = baseline?.get(endOfDayMinute) || baseline?.get(endOfDayMinute - 5) || 0;

                    // [ADJUSTMENT] For PRE_MARKET (Yesterday's Data), we must exclude 'Yesterday' 
                    // from the 20-day baseline average to show the true "Closing Figure" as seen yesterday.
                    // Logic: The current 'baselineTotal' likely INCLUDES 'prevVol' (if rolled over).
                    // We back it out: (Avg * 20 - Current) / 19
                    let adjustedBaseline = baselineTotal;
                    if (baselineTotal > 0) {
                        const sum20 = baselineTotal * 20;
                        // Safety check: ensure we don't divide by zero or get negative if data is weird
                        if (sum20 > prevVol) {
                            adjustedBaseline = (sum20 - prevVol) / 19;
                        }
                    }

                    const finalRvol = adjustedBaseline > 0 ? (prevVol / adjustedBaseline) : 0;

                    return {
                        ticker,
                        rvol: finalRvol,
                        currentVol: prevVol,
                        baselineVol: adjustedBaseline,
                        timestamp: prevBar.t || Date.now(), // Use data timestamp if available
                        status: "CLOSED" // Display as Closed/Final
                    };
                }
            }

            // 4. Standard Intraday Logic (OPEN / AFTER_HOURS)
            // Fetch today's bars
            const todayStr = nyTime.toISOString().split('T')[0];
            const result = await fetchMassive(`/v2/aggs/ticker/${ticker}/range/1/minute/${todayStr}/${todayStr}`, {
                adjusted: "true",
                sort: "asc",
                limit: "5000"
            });

            const bars: AggBar[] = result.results || [];

            // If it's early "OPEN" but no bars yet (switched JUST now), might return empty. 
            // Handle empty bars by showing 0 for now.
            if (bars.length === 0) {
                return { ticker, rvol: 0, currentVol: 0, baselineVol: 0, timestamp: Date.now(), status };
            }

            // Sum volume up to now
            const currentCumVol = bars.reduce((sum, b) => sum + b.v, 0);

            // Get Baseline Volume for this specific time
            const baseline = baselineCache.get(ticker);

            // Clamp time for AFTER_HOURS to ensure we compare against End-of-Day Baseline
            let lookupMinute = currentMinuteOfDay;
            if (status === "AFTER_HOURS") {
                lookupMinute = 955; // 15:55 (Start of last 5-min bar)
            }

            const baselineVol = baseline?.get(lookupMinute) || baseline?.get(lookupMinute - (lookupMinute % 5)) || 0;

            // Calculate Ratio
            const rvol = baselineVol > 0 ? (currentCumVol / baselineVol) : 0;

            return {
                ticker,
                rvol,
                currentVol: currentCumVol,
                baselineVol,
                timestamp: Date.now(),
                status
            };

        } catch (error) {
            console.error(`RVOL Calculation Failed for ${ticker}:`, error);
            return { ticker, rvol: 0, currentVol: 0, baselineVol: 0, timestamp: Date.now(), status: "CLOSED" };
        }
    }

    /**
     * Build Baseline (20-day average cumulative volume profile)
     */
    private static async ensureBaseline(ticker: string) {
        const now = Date.now();
        // Refresh baseline if older than 12 hours (basically once a day)
        if (baselineCache.has(ticker) && (now - (baselineTimestamp.get(ticker) || 0) < 12 * 60 * 60 * 1000)) {
            return;
        }

        console.log(`[RVOL] Building Baseline for ${ticker}...`);

        // Fetch last 30 days to ensure we get 20 trading days
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 35);

        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        // Fetch 5-minute bars for efficiency? Or 1-minute for precision?
        // 1-minute over 30 days is A LOT of data. 20 days * 390 bars = 7800 bars.
        // Polygon limit is 50000. It's fine.
        // But to be safe and fast, maybe 5-min bars are enough for baseline.
        // Let's use 5-minute bars.

        const res = await fetchMassive(`/v2/aggs/ticker/${ticker}/range/5/minute/${startStr}/${endStr}`, {
            adjusted: "true",
            sort: "asc",
            limit: "50000"
        });

        if (!res.results) return;

        // Group by Date to separate days
        const days: Record<string, AggBar[]> = {};
        res.results.forEach((b: AggBar) => {
            const dateStr = new Date(b.t).toISOString().split('T')[0];
            if (!days[dateStr]) days[dateStr] = [];
            days[dateStr].push(b);
        });

        // Filter last 20 complete trading days
        // A complete day should have bars near close (15:55 or 16:00)
        // Check only days with significant bar count (e.g. > 50 bars)
        const validDates = Object.keys(days).filter(d => days[d].length > 50).sort().slice(-20);

        // Build Cumulative Profile for each day
        // map<MinuteOfDay, SumVolume[]>
        const timeProfile: Map<number, number[]> = new Map();

        validDates.forEach(date => {
            const bars = days[date];
            let dailyCum = 0;

            // Need to interpolate or just bucket?
            // With 5-min bars, we have data at 9:30, 9:35...
            // We want to fill the map for these timestamps.

            bars.forEach(b => {
                dailyCum += b.v;
                const t = new Date(b.t);
                // Convert to NY time minutes from midnight
                const nyTime = new Date(t.toLocaleString("en-US", { timeZone: "America/New_York" }));
                const minuteOfDay = nyTime.getHours() * 60 + nyTime.getMinutes();

                if (!timeProfile.has(minuteOfDay)) timeProfile.set(minuteOfDay, []);
                timeProfile.get(minuteOfDay)?.push(dailyCum);
            });
        });

        // Average the profiles
        const avgProfile: Map<number, number> = new Map();

        // Fill gaps? 
        // If we queried 5-min bars, we only have keys for 570, 575...
        // When we lookup later at 573, we should fallback to 570. Valid.

        for (const [minute, vols] of timeProfile.entries()) {
            const sum = vols.reduce((a, b) => a + b, 0);
            const avg = sum / vols.length;
            avgProfile.set(minute, avg);
        }

        // Interpolate essential minutes (every minute) for smoother lookup?
        // Or just store the sparse 5-min map and handle lookup logic.
        // Sparse is fine for now. We handled `current - (current % 5)` in lookup.

        baselineCache.set(ticker, avgProfile);
        baselineTimestamp.set(ticker, now);
        console.log(`[RVOL] Baseline built for ${ticker}. Points: ${avgProfile.size}`);
    }
}
