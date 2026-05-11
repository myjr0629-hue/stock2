// ============================================================================
// /api/cron/daily-content — 마케팅 콘텐츠 생성 크론
// Redis에서 시장 데이터 → AI 3개국어 콘텐츠 → Redis 저장
// [V11] AI-powered by default (Bedrock Haiku), template fallback
// ============================================================================

import { NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
// Template engines (fallback)
import { generateMarketPulse, generateMorningBrief, generateEducationContent, getEducationTopicIds } from '@/lib/marketing/contentEngines';
// AI engines (primary)
import { generateAIMarketPulse, generateAIMorningBrief, generateAIEducation, getAIEducationTopicIds } from '@/lib/marketing/aiContentEngine';
import type { MarketData, ContentOutput } from '@/lib/marketing/contentEngines';

// ---------------------------------------------------------------------------
// GET Handler
// ?secret=xxx — CRON_SECRET 인증
// ?type=pulse|morning|education|all (default: pulse)
// ?engine=ai|template (default: ai)
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
  const useAI = searchParams.get('engine') !== 'template'; // AI by default

  try {
    // [FIX] Use ET (New York) date as dateKey — ensures alignment with marketing-dispatch
    // daily-content runs at 20:30 UTC (16:30 ET) → ET date = market session date
    const dateKey = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
    const results: Record<string, any> = {};

    // --- Market Pulse ---
    if (contentType === 'pulse' || contentType === 'all') {
      const marketData = await fetchMarketDataFromRedis();
      let pulseContent: ContentOutput;
      let engine = 'template';

      if (useAI) {
        try {
          pulseContent = await generateAIMarketPulse(marketData);
          engine = 'ai';
        } catch (err: any) {
          console.warn('[DailyContent] AI pulse failed, using template:', err.message);
          pulseContent = generateMarketPulse(marketData);
        }
      } else {
        pulseContent = generateMarketPulse(marketData);
      }

      const redisKey = `marketing:pulse:${dateKey}`;
      await setInCache(redisKey, JSON.stringify(pulseContent), 86400);

      // [V6.0+] Pre-render pulse images via EC2 Puppeteer -> Supabase CDN
      let capturedUrls: Record<string, string | null> = {};
      try {
        const { captureDailyPulse } = await import('@/lib/marketing/screenshotService');
        capturedUrls = await captureDailyPulse({
          spy: marketData.spy,
          vix: marketData.vix,
          gex: marketData.gexRegime || 'neutral',
          dp: marketData.darkPool || 0,
        });
        if (Object.values(capturedUrls).some(Boolean)) {
          await setInCache(`marketing:pulse:images:${dateKey}`, JSON.stringify(capturedUrls), 86400);
        }
      } catch (err: any) {
        console.warn('[DailyContent] Pulse image capture failed (non-fatal):', err.message);
      }

      results.pulse = {
        saved: true,
        engine,
        redisKey,
        capturedImages: Object.keys(capturedUrls).filter(k => capturedUrls[k]).length,
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

      let morningContent: ContentOutput;
      let engine = 'template';

      if (useAI) {
        try {
          morningContent = await generateAIMorningBrief({ ...marketData, briefingSummary });
          engine = 'ai';
        } catch (err: any) {
          console.warn('[DailyContent] AI morning failed, using template:', err.message);
          morningContent = generateMorningBrief({ ...marketData, briefingSummary });
        }
      } else {
        morningContent = generateMorningBrief({ ...marketData, briefingSummary });
      }

      const redisKey = `marketing:morning:${dateKey}`;
      await setInCache(redisKey, JSON.stringify(morningContent), 86400);

      results.morning = {
        saved: true,
        engine,
        redisKey,
        preview: {
          en: morningContent.en.text.substring(0, 120) + '...',
          ko: morningContent.ko.text.substring(0, 120) + '...',
        },
      };
    }

    // --- Education ---
    if (contentType === 'education' || contentType === 'all') {
      let eduContent: ContentOutput;
      let engine = 'template';

      if (useAI) {
        try {
          eduContent = await generateAIEducation(topicId);
          engine = 'ai';
        } catch (err: any) {
          console.warn('[DailyContent] AI education failed, using template:', err.message);
          eduContent = generateEducationContent(topicId);
        }
      } else {
        eduContent = generateEducationContent(topicId);
      }

      const redisKey = `marketing:education:${dateKey}`;
      await setInCache(redisKey, JSON.stringify(eduContent), 86400 * 7); // 7d TTL

      results.education = {
        saved: true,
        engine,
        redisKey,
        availableTopics: useAI ? getAIEducationTopicIds() : getEducationTopicIds(),
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
  // =========================================================================
  // PRIMARY: Read from Yahoo Finance cache (written by market-feed cron)
  // Keys: yahoo:idx:spx (^GSPC), yahoo:idx:nasdaq (^IXIC), yahoo:vix (^VIX)
  // =========================================================================
  const [spxData, nasdaqData, vixData, gexData, spyFutures] = await Promise.all([
    safeGetCache('yahoo:idx:spx'),     // ^GSPC (S&P 500 index)
    safeGetCache('yahoo:idx:nasdaq'),   // ^IXIC (NASDAQ Composite)
    safeGetCache('yahoo:vix'),          // ^VIX
    safeGetCache('analysis:gex:regime'),
    safeGetCache('yahoo:spx'),          // ES=F (S&P futures, backup)
  ]);

  // Extract changePct from Yahoo quotes
  let spy = extractChange(spxData) ?? extractChange(spyFutures) ?? 0;
  let qqq = extractChange(nasdaqData) ?? 0;
  let vix = extractVix(vixData) ?? 0;
  let gexRegime = extractGex(gexData) ?? 'neutral';

  // =========================================================================
  // FALLBACK: Try lambda-harvest cache if Yahoo keys are empty
  // =========================================================================
  if (spy === 0 || vix === 0) {
    console.warn('[DailyContent] Yahoo cache miss — attempting fallbacks...');
    try {
      // Try warm-command cache
      const warmCmd = await safeGetCache('cache:warm-command');
      const warmParsed = warmCmd ? (typeof warmCmd === 'string' ? JSON.parse(warmCmd) : warmCmd) : null;
      
      if (warmParsed) {
        const tickers = warmParsed?.tickers || warmParsed;
        if (Array.isArray(tickers)) {
          const spyEntry = tickers.find((t: any) => t?.ticker === 'SPY' || t?.symbol === 'SPY');
          const qqqEntry = tickers.find((t: any) => t?.ticker === 'QQQ' || t?.symbol === 'QQQ');
          if (spyEntry && spy === 0) spy = spyEntry.changePercent ?? spyEntry.changePct ?? 0;
          if (qqqEntry && qqq === 0) qqq = qqqEntry.changePercent ?? qqqEntry.changePct ?? 0;
        }
        
        const vixEntry = warmParsed?.vix ?? warmParsed?.VIX;
        if (vixEntry && vix === 0) {
          vix = typeof vixEntry === 'number' ? vixEntry : (vixEntry?.value ?? vixEntry?.price ?? 0);
        }
      }
      
      // Analysis cache fallback
      if (spy === 0) {
        const spyAnalysis = await safeGetCache('cache:analysis:SPY');
        const spyParsed = spyAnalysis ? (typeof spyAnalysis === 'string' ? JSON.parse(spyAnalysis) : spyAnalysis) : null;
        if (spyParsed?.changePercent) spy = spyParsed.changePercent;
      }
      
      if (vix === 0) {
        const vixAnalysis = await safeGetCache('cache:analysis:VIX');
        const vixParsed = vixAnalysis ? (typeof vixAnalysis === 'string' ? JSON.parse(vixAnalysis) : vixAnalysis) : null;
        if (vixParsed?.price) vix = vixParsed.price;
        else if (vixParsed?.value) vix = vixParsed.value;
      }

      console.log(`[DailyContent] After fallback: SPY=${spy}, QQQ=${qqq}, VIX=${vix}`);
    } catch (fallbackErr: any) {
      console.error('[DailyContent] Fallback failed:', fallbackErr.message);
    }
  }

  // Dark Pool — fetch live from EC2/Polygon (Phase 2: OG image requires dp param)
  let darkPool: number | undefined;
  try {
    const { fetchTradeData } = await import('@/services/realtimeMetricsService');
    const tradeData = await fetchTradeData('SPY');
    if (tradeData && tradeData.darkPoolPercent > 0) {
      darkPool = tradeData.darkPoolPercent;
    }
  } catch {
    // Silent — darkPool is optional, OG renders gracefully without it
  }

  // Final validation: if critical data is still 0, log warning
  if (spy === 0 && vix === 0) {
    console.error('[DailyContent] ⚠️ CRITICAL: SPY and VIX both 0 — market data unavailable');
  }

  return {
    spy,
    qqq,
    vix,
    gexRegime,
    darkPool,
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
