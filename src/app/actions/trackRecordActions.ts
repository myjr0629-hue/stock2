'use server';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function getTrackRecords() {
    const { data: records, error } = await supabase
        .from('alpha_track_records')
        .select('*')
        .order('recorded_date', { ascending: false });

    if (error) {
        console.error('[TrackRecord Action] Error fetching records:', error);
        throw new Error('Failed to fetch track records');
    }

    return records || [];
}
