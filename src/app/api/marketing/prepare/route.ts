// ============================================================================
// Marketing V2 — /api/marketing/prepare
// 콘텐츠 사전 생성 엔드포인트
// ?type=close|morning|spacex|education
// 데이터 수집 + AI + OG 캡처 → Redis 저장
// 실행 시간: 15~60초 (캡처 포함)
// ============================================================================

import { NextResponse } from 'next/server';
import { runPrepare } from '@/lib/marketing-v2/prepare';
import type { ContentSlot } from '@/lib/marketing-v2/core/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;  // 캡처 포함 최대 2분

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Auth
  const secret = searchParams.get('secret');
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === 'production' && cronSecret) {
    const valid = authHeader === `Bearer ${cronSecret}` || secret === cronSecret;
    if (!valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const slot = searchParams.get('type') as ContentSlot;
  const dryRun = searchParams.get('dry_run') === 'true';
  const topic = searchParams.get('topic') || undefined;
  const date = searchParams.get('date') || undefined;

  if (!slot) {
    return NextResponse.json({
      error: 'Missing type parameter',
      available: ['close', 'morning', 'spacex', 'education'],
    }, { status: 400 });
  }

  const start = Date.now();

  try {
    const pkg = await runPrepare(slot, { date, dryRun, topic });
    const elapsed = Date.now() - start;

    return NextResponse.json({
      success: true,
      slot,
      date: pkg.date,
      dryRun,
      elapsed: `${elapsed}ms`,
      images: Object.keys(pkg.images).length,
      langs: Object.keys(pkg.text).length,
      preview: Object.fromEntries(
        Object.entries(pkg.text).map(([lang, t]) => [
          lang,
          { headline: t!.headline.substring(0, 60), insight: t!.insight.substring(0, 80) },
        ])
      ),
    });
  } catch (err: any) {
    console.error(`[MktV2/Prepare] Error for ${slot}:`, err);
    return NextResponse.json({
      success: false,
      slot,
      error: err.message,
      elapsed: `${Date.now() - start}ms`,
    }, { status: 500 });
  }
}
