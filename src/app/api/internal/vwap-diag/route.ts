import { NextRequest, NextResponse } from 'next/server';
import { adminAuthorized } from '@/lib/ai/adminAuth';
import { etDateOf } from '@/lib/marketCalendar';
import { readRealtimeSessionVwapDiagnostics } from '@/services/realtimeSessionVwap';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = { 'Cache-Control': 'private, no-store' };

/** 기존 관리자 헤더 인증. URL에는 종목만 받으며 비밀·원천 응답·오류 객체를 내보내지 않는다. */
export async function GET(req: NextRequest) {
    if (!adminAuthorized(req.headers)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    const ticker = (new URL(req.url).searchParams.get('t') || '').toUpperCase();
    if (!/^[A-Z0-9.-]{1,15}$/.test(ticker)) return NextResponse.json({ error: 'Invalid ticker' }, { status: 400, headers });
    const now = Date.now();
    try {
        return NextResponse.json(await readRealtimeSessionVwapDiagnostics(ticker, etDateOf(now), now), { headers });
    } catch {
        return NextResponse.json({ error: 'Diagnostic unavailable' }, { status: 503, headers });
    }
}
