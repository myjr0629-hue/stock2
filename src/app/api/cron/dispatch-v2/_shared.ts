// ============================================================================
// Dispatch V2 — Shared Utilities
// 모든 dispatch 크론이 공유하는 인증, 실행, 응답 로직
// ============================================================================

import { NextResponse } from 'next/server';
import { ContentPackage, SendResult, ContentSlot, Platform, Lang } from '@/lib/marketing-v2/core/types';
import { getAdapter } from '@/lib/marketing-v2/platforms';

// ── 인증 ──
export function checkAuth(request: Request): Response | null {
  const cronSecret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === 'production' && cronSecret) {
    const { searchParams } = new URL(request.url);
    const isHeaderValid = request.headers.get('authorization') === `Bearer ${cronSecret}`;
    const isParamValid = searchParams.get('secret') === cronSecret;
    if (!isHeaderValid && !isParamValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  return null;
}

// ── 파라미터 파싱 ──
export function parseParams(request: Request) {
  const { searchParams } = new URL(request.url);
  return {
    dryRun: searchParams.get('dry_run') !== 'false',
    draft: searchParams.get('draft') === 'true',
    date: searchParams.get('date') || undefined,
    ticker: searchParams.get('ticker') || undefined,
    topic: searchParams.get('topic') || undefined,
    region: (searchParams.get('region') || 'all') as 'en' | 'ko' | 'ja' | 'asia' | 'all',
  };
}

// ── region → 언어 변환 ──
function getLangsForRegion(region: 'en' | 'ko' | 'ja' | 'asia' | 'all'): Lang[] {
  switch (region) {
    case 'en':   return ['en'];
    case 'ko':   return ['ko'];
    case 'ja':   return ['ja'];
    case 'asia': return ['ko', 'ja'];
    case 'all':  return ['en', 'ko', 'ja'];
  }
}

// ── 슬롯별 활성 플랫폼 정의 ──
// Instagram 싱글이미지: morning, close만
// Telegram: 제외
const SLOT_PLATFORMS: Record<ContentSlot, Platform[]> = {
  morning:   ['twitter', 'threads', 'bluesky', 'instagram', 'pinterest'],
  close:     ['twitter', 'threads', 'bluesky', 'instagram', 'pinterest'],
  pulse:     ['twitter', 'threads', 'bluesky', 'pinterest'],
  spotlight: ['twitter', 'threads', 'bluesky'],
  education: ['twitter', 'threads', 'bluesky', 'instagram', 'pinterest'],
  spacex:    ['twitter', 'threads', 'bluesky', 'pinterest'],
  event:     ['twitter', 'threads', 'bluesky'],
};

// ── 모든 활성 플랫폼에 발송 (region 필터링 포함) ──
export async function dispatchToAll(
  pkg: ContentPackage,
  opts: { dryRun: boolean; draft: boolean; region?: 'en' | 'ko' | 'ja' | 'asia' | 'all' },
): Promise<SendResult[]> {
  const results: SendResult[] = [];
  const platforms = SLOT_PLATFORMS[pkg.slot] || ['twitter', 'threads', 'bluesky'];
  const langs = getLangsForRegion(opts.region || 'all');

  for (const platform of platforms) {
    const adapter = getAdapter(platform);
    if (!adapter) continue;

    // 각 언어별 발송 (region 필터 적용)
    for (const lang of langs) {
      // 해당 어댑터가 이 언어를 지원하는지 확인
      if (!adapter.supportedLangs?.includes(lang)) continue;

      // 봇 방지 알고리즘 우회: 매 정각/동일 분에 나가는 패턴을 방지하기 위해 2~20분 무작위 지연(Jitter) 예약 설정
      let scheduledAt: string | undefined = undefined;
      if (!opts.draft) {
        const delayMs = (2 + Math.floor(Math.random() * 19)) * 60 * 1000; // 2~20분 랜덤 지연
        scheduledAt = new Date(Date.now() + delayMs).toISOString();
      }

      let r: SendResult;
      // Instagram은 sendFeed() 사용 (instagramMeta 필수)
      if (platform === 'instagram' && 'sendFeed' in adapter) {
        r = await (adapter as any).sendFeed(pkg, lang, { dryRun: opts.dryRun, draft: opts.draft, scheduledAt });
      } else {
        r = await adapter.send(pkg, lang, { dryRun: opts.dryRun, draft: opts.draft, scheduledAt });
      }
      
      // If we are scheduled, append that info to the dryRun logs or output
      if (scheduledAt && r.dryRun) {
        console.log(`[DispatchV2] Jitter scheduled for ${platform}/${lang} at ${scheduledAt}`);
      }
      
      results.push(r);

      // Rate limit: 채널 간 300ms 대기
      if (!opts.dryRun) {
        await new Promise(r => setTimeout(r, 300));
      }
    }
  }

  return results;
}

// ── Spotlight 드래프트 체인 발송 (X, Threads, Bluesky EN만) ──
export async function dispatchSpotlightDrafts(
  pkg: ContentPackage,
  opts: { dryRun: boolean },
): Promise<SendResult[]> {
  const results: SendResult[] = [];
  const draftPlatforms: Platform[] = ['twitter', 'threads', 'bluesky'];

  for (const platform of draftPlatforms) {
    const adapter = getAdapter(platform);
    if (!adapter) continue;

    // EN만 draft로 발송 (체인 트윗용)
    const r = await adapter.send(pkg, 'en', { dryRun: opts.dryRun, draft: true });
    results.push(r);
  }

  return results;
}

// ── 결과 요약 응답 ──
export function buildResponse(
  slot: ContentSlot,
  results: SendResult[],
  pkg: ContentPackage,
  startTime: number,
  region?: string,
) {
  const success = results.filter(r => r.success && !r.dryRun && r.postId !== 'dedup_skipped').length;
  const skipped = results.filter(r => r.postId === 'dedup_skipped').length;
  const failed = results.filter(r => !r.success).length;
  const dryRun = results.filter(r => r.dryRun).length;
  const elapsed = Date.now() - startTime;

  const summary = {
    slot,
    date: pkg.date,
    region: region || 'all',
    elapsed: `${elapsed}ms`,
    images: Object.keys(pkg.images).length,
    platforms: SLOT_PLATFORMS[pkg.slot]?.join(', ') || 'default',
    results: { total: results.length, success, skipped, failed, dryRun },
    details: results.map(r => ({
      platform: r.platform,
      lang: r.lang,
      success: r.success,
      postId: r.postId,
      dryRun: r.dryRun,
      error: r.error,
    })),
  };

  console.log(`[DispatchV2/${slot}] ✅ Done: ${success} sent, ${skipped} skipped, ${failed} failed, ${dryRun} dry_run (${elapsed}ms)`);

  return NextResponse.json(summary);
}
