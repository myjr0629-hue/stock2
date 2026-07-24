import { NextResponse } from 'next/server';
import { sendWimQuizPush } from '@/lib/push/send';

// [WIM] Daily "today's quiz is ready" push. Fires after the US close once the
// day's movers-quiz has been warmed, so tapping the notification lands on a
// fresh edition. iOS-only until WIM Firebase (Android FCM) is set up — see
// sendWimQuizPush. Scheduled in vercel.json (weekdays, post-close ET).
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await sendWimQuizPush();
    return NextResponse.json({ ok: true, ...res, ts: new Date().toISOString() });
  } catch (e) {
    console.error('[WIM Push Cron]', e);
    return NextResponse.json({ ok: false, error: 'send failed' }, { status: 500 });
  }
}
