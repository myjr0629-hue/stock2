// ============================================================================
// /api/cron/buffer-dispatch — Buffer 13채널 발송 크론
// Redis 콘텐츠 → Tier별 Buffer GraphQL 발송
// Build-only: vercel.json에 등록하지 않음 (수동 트리거만)
// DRY_RUN 기본값: 실제 API 호출 없이 로그만
// ============================================================================

import { NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import {
  getChannels,
  createPost,
  truncateForPlatform,
  buildUtm,
  CTA, CTA_KO, CTA_JA,
  type ChannelTier,
  type BufferChannel,
} from '@/lib/marketing/bufferClient';
import type { ContentOutput } from '@/lib/marketing/contentEngines';

// ---------------------------------------------------------------------------
// GET Handler
// ?secret=xxx — CRON_SECRET 인증
// ?dry_run=true|false (default: true)
// ?tier=1|2|all (default: 1)
// ?content=pulse|education (default: pulse)
// ?date=YYYY-MM-DD (default: today)
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  // [Security] CRON_SECRET 검증
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get('secret');
  const authHeader = request.headers.get('authorization');

  if (process.env.NODE_ENV === 'production' && cronSecret) {
    const isHeaderValid = authHeader === `Bearer ${cronSecret}`;
    const isParamValid = secretParam === cronSecret;
    if (!isHeaderValid && !isParamValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const dryRun = searchParams.get('dry_run') !== 'false'; // default: true
  const tierParam = searchParams.get('tier') || '1';
  const contentType = searchParams.get('content') || 'pulse';
  const dateKey = searchParams.get('date') || new Date().toISOString().split('T')[0];

  const tier: ChannelTier | 'all' = tierParam === 'all' ? 'all' : (parseInt(tierParam) as ChannelTier);

  try {
    // 1. Load content from Redis
    const redisKey = `marketing:${contentType}:${dateKey}`;
    const cached = await getFromCache(redisKey);

    if (!cached) {
      return NextResponse.json({
        success: false,
        error: `No content found at ${redisKey}. Run /api/cron/daily-content first.`,
      }, { status: 404 });
    }

    const content: ContentOutput = typeof cached === 'string' ? JSON.parse(cached) : cached;

    // 2. Build dispatch plan
    const dispatchPlan = buildDispatchPlan(content, tier, contentType);

    // 3. Execute dispatch
    const results: DispatchResult[] = [];

    for (const item of dispatchPlan) {
      const result = await createPost({
        channelIds: [item.channelId],
        text: item.text,
        mediaUrl: item.imageUrl || undefined,
        dryRun,
      });

      results.push({
        channel: item.channelName,
        service: item.service,
        tier: item.tier,
        lang: item.lang,
        success: result.success,
        dryRun: result.dryRun ?? false,
        postId: result.postId,
        error: result.error,
        textPreview: item.text.substring(0, 80) + '...',
      });
    }

    // 4. Log dispatch result to Redis
    const logKey = `marketing:dispatch:${dateKey}:${contentType}`;
    const dispatchLog = {
      timestamp: new Date().toISOString(),
      dryRun,
      tier: tierParam,
      contentType,
      totalChannels: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
    await setInCache(logKey, JSON.stringify(dispatchLog), 86400 * 7); // 7d TTL

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      dryRun,
      tier: tierParam,
      contentType,
      summary: {
        totalChannels: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
      },
      results,
    });
  } catch (err: any) {
    console.error('[Cron/BufferDispatch] Error:', err);
    return NextResponse.json({
      success: false,
      error: err.message,
    }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DispatchItem {
  channelId: string;
  channelName: string;
  service: string;
  tier: ChannelTier;
  lang: 'en' | 'ko' | 'ja';
  text: string;
  imageUrl: string;
}

interface DispatchResult {
  channel: string;
  service: string;
  tier: ChannelTier;
  lang: string;
  success: boolean;
  dryRun: boolean;
  postId?: string;
  error?: string;
  textPreview: string;
}

// ---------------------------------------------------------------------------
// Build dispatch plan — maps content to channels with proper text/CTA
// ---------------------------------------------------------------------------
function buildDispatchPlan(
  content: ContentOutput,
  tier: ChannelTier | 'all',
  campaign: string
): DispatchItem[] {
  const items: DispatchItem[] = [];
  const langs: ('en' | 'ko' | 'ja')[] = ['en', 'ko', 'ja'];

  for (const lang of langs) {
    const langContent = content[lang];
    if (!langContent?.text) continue;

    const channels = getChannels({ tier, lang });
    const ctaMap = lang === 'ko' ? CTA_KO : lang === 'ja' ? CTA_JA : CTA;

    for (const ch of channels) {
      const utm = buildUtm(ch.service, campaign);
      const ctaKey = langContent.cta as keyof typeof ctaMap;
      const ctaFn = ctaMap[ctaKey];
      const cta = typeof ctaFn === 'function' ? ctaFn(utm) : '';

      const fullText = `${langContent.text}\n\n${cta}`;
      const truncated = truncateForPlatform(fullText, ch.service);

      items.push({
        channelId: ch.id,
        channelName: ch.name,
        service: ch.service,
        tier: ch.tier,
        lang,
        text: truncated,
        imageUrl: langContent.imageUrl || '',
      });
    }
  }

  return items;
}
