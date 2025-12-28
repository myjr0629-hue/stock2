import { NextResponse } from 'next/server';
import { getMacroSnapshotSSOT } from '@/services/macroHubProvider';

export async function GET() {
    try {
        const snapshot = await getMacroSnapshotSSOT();
        return NextResponse.json(snapshot);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch macro snapshot' }, { status: 500 });
    }
}
