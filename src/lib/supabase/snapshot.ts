// ============================================================================
// Supabase Snapshot CRUD — daily_sector_snapshots table
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import type { SnapshotData, DailySectorSnapshot } from '@/types/sector';

/**
 * Save (upsert) a sector snapshot for a given date.
 * Called by cron job or manual trigger after market close.
 */
export async function saveSnapshot(
    sectorId: string,
    snapshotDate: string, // YYYY-MM-DD
    data: SnapshotData
): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = await createClient();

        const { error } = await supabase
            .from('daily_sector_snapshots')
            .upsert(
                {
                    sector_id: sectorId,
                    snapshot_date: snapshotDate,
                    data_json: data,
                },
                { onConflict: 'sector_id,snapshot_date' }
            );

        if (error) {
            console.error(`[Snapshot] Save failed for ${sectorId}/${snapshotDate}:`, error);
            return { success: false, error: error.message };
        }

        console.log(`[Snapshot] ✅ Saved ${sectorId} snapshot for ${snapshotDate}`);
        return { success: true };
    } catch (e: any) {
        console.error('[Snapshot] Unexpected error:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Get the latest snapshot for a sector.
 * Returns the most recent snapshot_date row.
 */
export async function getLatestSnapshot(
    sectorId: string
): Promise<DailySectorSnapshot | null> {
    try {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('daily_sector_snapshots')
            .select('*')
            .eq('sector_id', sectorId)
            .order('snapshot_date', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            // PGRST116 = no rows found (not actually an error)
            if (error.code === 'PGRST116') return null;
            console.error(`[Snapshot] Fetch failed for ${sectorId}:`, error);
            return null;
        }

        return data as DailySectorSnapshot;
    } catch (e) {
        console.error('[Snapshot] Unexpected error:', e);
        return null;
    }
}

/**
 * Get a snapshot for a specific date.
 */
export async function getSnapshotByDate(
    sectorId: string,
    date: string // YYYY-MM-DD
): Promise<DailySectorSnapshot | null> {
    try {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('daily_sector_snapshots')
            .select('*')
            .eq('sector_id', sectorId)
            .eq('snapshot_date', date)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null;
            console.error(`[Snapshot] Fetch by date failed:`, error);
            return null;
        }

        return data as DailySectorSnapshot;
    } catch (e) {
        console.error('[Snapshot] Unexpected error:', e);
        return null;
    }
}

/**
 * Get recent N snapshots for a sector (for historical comparison).
 */
export async function getRecentSnapshots(
    sectorId: string,
    limit: number = 5
): Promise<DailySectorSnapshot[]> {
    try {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('daily_sector_snapshots')
            .select('*')
            .eq('sector_id', sectorId)
            .order('snapshot_date', { ascending: false })
            .limit(limit);

        if (error) {
            console.error(`[Snapshot] Fetch recent failed:`, error);
            return [];
        }

        return (data || []) as DailySectorSnapshot[];
    } catch (e) {
        console.error('[Snapshot] Unexpected error:', e);
        return [];
    }
}
