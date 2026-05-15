// ============================================================================
// Marketing V2 — /api/marketing/send
// 플랫폼별 발송 엔드포인트
// Redis에서 콘텐츠 읽기 → 어댑터 호출 → 발송. 이게 전부.
// 실행 시간: 2~5초 (캡처 없음, AI 없음, 데이터 수집 없음)
// ============================================================================

import { NextResponse } from 'next/server';
import { loadContentPackage, getETDate } from '@/lib/marketing-v2/core/store';
import { getAdapter, instagram } from '@/lib/marketing-v2/platforms';
import type { Platform, ContentSlot, Lang } from '@/lib/marketing-v2/core/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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

  const platform = searchParams.get('platform') as Platform;
  const slot = searchParams.get('slot') as ContentSlot;
  const dryRun = searchParams.get('dry_run') !== 'false';
  const draft = searchParams.get('draft') === 'true';
  const lang = searchParams.get('lang') as Lang | null;
  const date = searchParams.get('date') || getETDate();
  const igMode = searchParams.get('mode') || 'feed'; // story | feed

  if (!platform || !slot) {
    return NextResponse.json({
      error: 'Missing platform or slot',
      usage: '/api/marketing/send?platform=twitter&slot=close&dry_run=false',
      platforms: ['twitter', 'threads', 'bluesky', 'instagram', 'pinterest', 'telegram'],
      slots: ['close', 'morning', 'spacex', 'education'],
    }, { status: 400 });
  }

  const start = Date.now();

  // 1. Redis에서 콘텐츠 패키지 로드
  const pkg = await loadContentPackage(slot, date);
  if (!pkg) {
    return NextResponse.json({
      error: 'Content not prepared',
      hint: `Run /api/marketing/prepare?type=${slot} first`,
      slot, date,
    }, { status: 404 });
  }

  // 2. 어댑터 선택
  const adapter = getAdapter(platform);
  if (!adapter) {
    return NextResponse.json({ error: `Unknown platform: ${platform}` }, { status: 400 });
  }

  // 3. 발송
  const opts = { dryRun, draft, lang: lang || undefined };
  let results;

  if (platform === 'instagram') {
    // IG는 Story/Feed 분기
    const langs = lang ? [lang] : instagram.supportedLangs;
    results = [];
    for (const l of langs) {
      if (igMode === 'story') {
        results.push(await instagram.sendStory(pkg, l, opts));
      } else {
        results.push(await instagram.sendFeed(pkg, l, opts));
      }
    }
  } else {
    results = await adapter.sendAll(pkg, opts);
  }

  const elapsed = Date.now() - start;
  const successful = results.filter((r: any) => r.success).length;
  const failed = results.filter((r: any) => !r.success).length;

  return NextResponse.json({
    success: failed === 0,
    platform, slot, date,
    dryRun, draft,
    elapsed: `${elapsed}ms`,
    summary: { successful, failed, total: results.length },
    results,
  });
}
