import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, platform, locale, app } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    // [MULTI-APP] Default 'signum' keeps SIGNUM 100% backward-compatible (same
    // token key + same global list). WIM registers with app:'wim' → its own token
    // list, so its "today's quiz" push only reaches WIM devices (sent with
    // apns-topic com.signumhq.wim) and never crosses into SIGNUM's live sends.
    const appId = app === 'wim' ? 'wim' : 'signum';
    const key = `push:tokens:${token}`;
    const data = {
      token,
      platform: platform || 'unknown',
      locale: locale || 'en',
      app: appId,
      createdAt: new Date().toISOString(),
      preferences: { morning: true, closing: true },
    };

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
