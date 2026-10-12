import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { mergeRegistration, parseRecord } from '@/lib/push/prefs';

const redis = Redis.fromEnv();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, platform, locale, app, preferences } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    // [MULTI-APP] Default 'signum' keeps SIGNUM 100% backward-compatible (same
    // token key + same global list). WIM registers with app:'wim' → its own token
    // list, so its "today's quiz" push only reaches WIM devices (sent with
    // apns-topic com.signumhq.wim) and never crosses into SIGNUM's live sends.
    const appId = app === 'wim' ? 'wim' : 'signum';
    const key = `push:tokens:${token}`;
    // ★2026-10-12 앱을 켤 때마다 이 POST 가 온다 — 예전엔 선호를 {morning:true, closing:true} 로 덮어써 끈 알림이 되살아났다.
    //   이제 «새 토큰만» 기본값 true, 기존 선호·createdAt 은 지킨다. 기기가 저장된 선호를 보내면 그 값으로 맞춘다(lib/push/prefs).
    const existing = parseRecord(await redis.get(key));
    const data = mergeRegistration(existing, { token, platform, locale, app: appId, preferences }, new Date().toISOString());

    await redis.set(key, JSON.stringify(data));
    // Per-app enumeration set. SIGNUM stays on the original key (unchanged); WIM
    // gets its own so the two never mix.
    await redis.sadd(appId === 'wim' ? 'push:token_list:wim' : 'push:token_list', token);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error('[Push Register]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// Unregister — the in-app notification switch turns push OFF without sending the
// user to the OS settings. We drop the token from BOTH per-app lists (a token is
// only ever in one, and removing from the other is a harmless no-op) plus its
// record, so the next cron send simply never sees this device.
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { token } = body as { token?: string };

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    await redis.srem('push:token_list:wim', token);
    await redis.srem('push:token_list', token);
    await redis.del(`push:tokens:${token}`);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error('[Push Unregister]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
