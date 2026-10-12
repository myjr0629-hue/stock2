import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { mergePrefs, parseRecord, sanitizePrefs } from '@/lib/push/prefs';

const redis = Redis.fromEnv();

// 설정 › 알림 토글 → 서버. ★2026-10-12 마스터 «알림»(enabled)도 받는다(예전엔 morning·closing 만 — 마스터를 꺼도 발송됐다).
// 발송(lib/push/send.ts)이 enabled·morning·closing 을 지킨다(lib/push/prefs.wantsPush).
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { token } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const key = `push:tokens:${token}`;
    const data = parseRecord<Record<string, any>>(await redis.get(key));

    if (!data) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }

    data.preferences = mergePrefs(data.preferences, sanitizePrefs(body));

    await redis.set(key, JSON.stringify(data));

    return NextResponse.json({ ok: true, preferences: data.preferences });
  } catch (e: unknown) {
    console.error('[Push Preferences]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
