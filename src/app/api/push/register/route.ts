import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, platform, locale } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const key = `push:tokens:${token}`;
    const data = {
      token,
      platform: platform || 'unknown',
      locale: locale || 'en',
      createdAt: new Date().toISOString(),
      preferences: { morning: true, closing: true },
    };

    await redis.set(key, JSON.stringify(data));
    // Also add to the set for easy enumeration
    await redis.sadd('push:token_list', token);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error('[Push Register]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
