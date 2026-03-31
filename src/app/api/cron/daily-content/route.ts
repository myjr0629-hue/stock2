// ============================================================================
// /api/cron/daily-content — 마케팅 콘텐츠 생성 크론
// Redis에서 시장 데이터 → 3개국어 콘텐츠 → Redis 저장
// ============================================================================

import { NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { generateMarketPulse, generateMorningBrief, generateEducationContent, getEducationTopicIds } from '@/lib/marketing/contentEngines';
import type { MarketData, ContentOutput } from '@/lib/marketing/contentEngines';

// ---------------------------------------------------------------------------
// GET Handler
// ?secret=xxx — CRON_SECRET 인증
// ?type=pulse|morning|education|all (default: pulse)
// ?topic=gex|dark_pool|iv_percentile|pcr|max_pain (education only)
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

  const contentType = searchParams.get('type') || 'pulse';
  const topicId = searchParams.get('topic') || undefined;

  try {
    const dateKey = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const results: Record<string, any> = {};

    // --- Market Pulse ---
    if (contentType === 'pulse' || contentType === 'all') {
      const marketData = await fetchMarketDataFromRedis();
      const pulseContent = generateMarketPulse(marketData);

      const redisKey = `marketing:pulse:${dateKey}`;
      await setInCache(redisKey, JSON.stringify(pulseContent), 86400);

      results.pulse = {
        saved: true,
        redisKey,
        preview: {
          en: pulseContent.en.text.substring(0, 120) + '...',
          ko: pulseContent.ko.text.substring(0, 120) + '...',
        },
        imageUrl: pulseContent.en.imageUrl,
      };
    }

    // --- Morning Briefing ---
    if (contentType === 'morning' || contentType === 'all') {
      const marketData = await fetchMarketDataFromRedis();
      const briefingRaw = await safeGetCache('guardian:briefing:latest');
      const briefingSummary = briefingRaw
        ? (typeof briefingRaw === 'string' ? briefingRaw : JSON.stringify(briefingRaw)).substring(0, 200)
        : undefined;

      const morningContent = generateMorningBrief({ ...marketData, briefingSummary });

      const redisKey = `marketing:morning:${dateKey}`;
      await setInCache(redisKey, JSON.stringify(morningContent), 86400);

      results.morning = {
        saved: true,
        redisKey,
        preview: {
          en: morningContent.en.text.substring(0, 120) + '...',
          ko: morningContent.ko.text.substring(0, 120) + '...',
        },
      };
    }

    // --- Education ---
    if (contentType === 'education' || contentType === 'all') {
      const eduContent = generateEducationContent(topicId);

      const redisKey = `marketing:education:${dateKey}`;
      await setInCache(redisKey, JSON.stringify(eduContent), 86400 * 7); // 7d TTL

      results.education = {
        saved: true,
        redisKey,
        availableTopics: getEducationTopicIds(),
        preview: {
          en: eduContent.en.text.substring(0, 120) + '...',
          ko: eduContent.ko.text.substring(0, 120) + '...',
        },
      };
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      contentType,
      results,
    });
  } catch (err: any) {
    console.error('[Cron/DailyContent] Error:', err);
    return NextResponse.json({
      success: false,
      error: err.message,
    }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Redis에서 시장 데이터 로딩
// 기존 Redis 캐시 구조 활용 (market-feed, warm-command 등)
// ---------------------------------------------------------------------------
async function fetchMarketDataFromRedis(): Promise<MarketData> {
  // Try to read from existing Redis cache keys
  const [spyData, qqqData, vixData, gexData] = await Promise.all([
    safeGetCache('market:realtime:SPY'),
    safeGetCache('market:realtime:QQQ'),
    safeGetCache('market:realtime:VIX'),
    safeGetCache('analysis:gex:regime'),
  ]);

  // Also try unified dashboard cache
  const dashCache = await safeGetCache('dashboard:unified:latest');
  const parsed = dashCache ? (typeof dashCache === 'string' ? JSON.parse(dashCache) : dashCache) : null;

  // Extract data with fallbacks
  const spy = extractChange(spyData) ?? extractFromDash(parsed, 'SPY') ?? 0;
  const qqq = extractChange(qqqData) ?? extractFromDash(parsed, 'QQQ') ?? 0;
  const vix = extractVix(vixData) ?? extractFromDash(parsed, '^VIX') ?? 18;
  const gexRegime = extractGex(gexData) ?? 'neutral';

  return {
    spy,
    qqq,
    vix,
    gexRegime,
  };
}

async function safeGetCache(key: string): Promise<any> {
  try {
    return await getFromCache(key);
  } catch {
    return null;
  }
}

function extractChange(data: any): number | null {
  if (!data) return null;
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;
  return parsed?.changePercent ?? parsed?.changePct ?? parsed?.change ?? null;
}

function extractVix(data: any): number | null {
  if (!data) return null;
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;
  return parsed?.price ?? parsed?.value ?? parsed?.last ?? null;
}

function extractGex(data: any): string | null {
  if (!data) return null;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return parsed?.regime ?? parsed?.gexRegime ?? data;
    } catch {
      return data; // plain string like "positive"
    }
  }
  return data?.regime ?? data?.gexRegime ?? null;
}

function extractFromDash(dash: any, ticker: string): number | null {
  if (!dash) return null;
  const entry = dash?.tickers?.[ticker] ?? dash?.[ticker];
  if (!entry) return null;
  return entry?.changePercent ?? entry?.changePct ?? entry?.price ?? null;
}
