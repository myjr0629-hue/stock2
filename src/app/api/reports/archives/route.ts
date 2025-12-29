import { NextResponse } from 'next/server';
import { listArchives } from '@/lib/storage/reportStore';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const archives = await listArchives();

        // Sort by date descending
        const sorted = archives.sort((a, b) => b.date.localeCompare(a.date));

        // Return structured timeline data
        // Only return dates that have at least one valid report type
        const timeline = sorted.filter(a => a.types.length > 0).map(a => ({
            date: a.date,
            types: a.types,
            // [Future] Could add summary stats here if available in redis metadata
            label: isToday(a.date) ? 'Today' : isYesterday(a.date) ? 'Yesterday' : a.date
        }));

        return NextResponse.json({ timeline });
    } catch (error) {
        console.error('[API] Failed to list archives:', error);
        return NextResponse.json({ error: 'Failed to fetch archives' }, { status: 500 });
    }
}

function isToday(dateStr: string): boolean {
    const today = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const d = new Date(today);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return dateStr === date;
}

function isYesterday(dateStr: string): boolean {
    const today = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return dateStr === date;
}
