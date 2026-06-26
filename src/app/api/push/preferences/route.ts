import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, morning, closing } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const key = `push:tokens:${token}`;
    const raw = await redis.get(key);

    if (!raw) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }

    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    data.preferences = {
      morning: morning !== undefined ? Boolean(morning) : data.preferences?.morning ?? true,
      closing: closing !== undefined ? Boolean(closing) : data.preferences?.closing ?? true,
    };

    await redis.set(key, JSON.stringify(data));

    return NextResponse.json({ ok: true, preferences: data.preferences });
  } catch (e: unknown) {
    console.error('[Push Preferences]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
