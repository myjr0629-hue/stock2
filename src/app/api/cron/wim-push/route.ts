import { NextResponse } from 'next/server';
import { sendWimQuizPush } from '@/lib/push/send';
import { getFromCache, setInCache } from '@/services/redisClient';

// [WIM] Daily "today's quiz is ready" push. Fires after the US close once the
// day's movers-quiz has been warmed, so tapping the notification lands on a
// fresh edition. iOS-only until WIM Firebase (Android FCM) is set up — see
// sendWimQuizPush. Scheduled in vercel.json (weekdays, post-close ET).
//
// [Security] 2026-09-24: 이 경로엔 인증도 «하루 1회» 제한도 없었다 — 누구든 GET 한 번으로
//   WIM 전 기기에 푸시를 보낼 수 있었다(미들웨어 matcher 는 /api 를 제외한다).
//   /api/cron/push 와 같은 CRON_SECRET 검사를 그대로 옮겼다. Vercel 크론은 Authorization: Bearer 를
//   자동으로 붙이며, 같은 검사를 하는 아침 푸시가 9/23 12:10:45Z 에 정상 발송된 것으로 확인했다.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const secretParam = new URL(request.url).searchParams.get('secret');
  if (process.env.NODE_ENV === 'production' && cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}` && secretParam !== cronSecret) {
      console.warn('[WIM Push Cron] Unauthorized request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Vercel 이 재시도해도 ET 하루 한 번만 보낸다(/api/cron/push 와 같은 방식).
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const sentKey = `push:sent:wim:${todayET}`;
  if (await getFromCache<string>(sentKey).catch(() => null)) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'already-sent' });
  }

  try {
    const res = await sendWimQuizPush();
    await setInCache(sentKey, new Date().toISOString(), 60 * 60 * 18).catch(() => { /* 기록 실패는 재발송 위험뿐 */ });
    return NextResponse.json({ ok: true, ...res, ts: new Date().toISOString() });
  } catch (e) {
    console.error('[WIM Push Cron]', e);
    return NextResponse.json({ ok: false, error: 'send failed' }, { status: 500 });
  }
}
