// ============================================================================
// /api/cron/render-video — Remotion 영상 렌더링 오케스트레이터
// Redis 데이터 → TTS → Remotion Lambda → S3 → (나중) YouTube/TikTok
// Build-only: DRY_RUN 기본값, Lambda 미배포, cron 미등록
// ============================================================================

import { NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import {
  generateNarrationScript,
  synthesizeSpeech,
  selectBgm,
} from '@/lib/marketing/pollyClient';

// ---------------------------------------------------------------------------
// GET Handler
// ?secret=xxx — CRON_SECRET 인증
// ?dry_run=true|false (default: true)
// ?type=pulse|news|event|all (default: pulse)
// ?lang=en|ko|ja|all (default: en)
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

  const dryRun = searchParams.get('dry_run') !== 'false';
  const videoType = (searchParams.get('type') || 'pulse') as 'pulse' | 'news' | 'event' | 'all';
  const langParam = (searchParams.get('lang') || 'en') as 'en' | 'ko' | 'ja' | 'all';

  try {
    const dateKey = new Date().toISOString().split('T')[0];
    const langs: ('en' | 'ko' | 'ja')[] = langParam === 'all' ? ['en', 'ko', 'ja'] : [langParam as any];
    const types: ('pulse' | 'news' | 'event')[] = videoType === 'all' ? ['pulse', 'news'] : [videoType as any];

    const results: Record<string, any> = {};

    for (const type of types) {
      for (const lang of langs) {
        const key = `${type}_${lang}`;

        // 1. Fetch market data from Redis
        const marketData = await fetchVideoData(type);

        // 2. Generate TTS narration script
        const narrationScript = generateNarrationScript({ type, lang, data: marketData });

        // 3. Synthesize speech (or DRY_RUN)
        const ttsResult = await synthesizeSpeech({
          text: narrationScript,
          lang,
          dryRun,
        });

        // 4. Select BGM based on market mood
        const bgm = selectBgm({
          gexRegime: marketData.gexRegime || 'neutral',
          videoType: type,
          vix: marketData.vix,
        });

        // 5. Build Remotion render props
        const renderProps = buildRenderProps(type, lang, marketData, ttsResult.audioUrl, bgm.s3Key);

        // 6. Trigger Remotion Lambda render (or DRY_RUN)
        let renderResult: any;
        if (dryRun) {
          console.log(`[RenderVideo] DRY_RUN: Would render ${type}/${lang}`);
          renderResult = {
            dryRun: true,
            compositionId: getCompositionId(type),
            props: renderProps,
            bgm: { name: bgm.name, category: bgm.category, source: bgm.source },
            narrationScript: narrationScript.substring(0, 100) + '...',
          };
        } else {
          // Real Remotion Lambda call would go here:
          // import { renderMediaOnLambda } from '@remotion/lambda/client';
          // renderResult = await renderMediaOnLambda({
          //   region: 'us-east-1',
          //   functionName: 'remotion-render-signum',
          //   composition: getCompositionId(type),
          //   inputProps: renderProps,
          //   codec: 'h264',
          //   serveUrl: REMOTION_SERVE_URL,
          // });
          renderResult = { status: 'not_configured', message: 'Lambda not deployed yet' };
        }

        results[key] = renderResult;
      }
    }

    // Log to Redis
    const logKey = `marketing:video:${dateKey}`;
    await setInCache(logKey, JSON.stringify({
      timestamp: new Date().toISOString(),
      dryRun,
      types,
      langs,
      results,
    }), 86400 * 7);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      dryRun,
      videoType,
      lang: langParam,
      summary: {
        totalVideos: Object.keys(results).length,
        types,
        langs,
      },
      results,
    });
  } catch (err: any) {
    console.error('[Cron/RenderVideo] Error:', err);
    return NextResponse.json({
      success: false,
      error: err.message,
    }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCompositionId(type: string): string {
  switch (type) {
    case 'pulse': return 'MarketPulse';
    case 'news':  return 'NewsDigest';
    case 'event': return 'EventSpike';
    default:      return 'MarketPulse';
  }
}

function buildRenderProps(
  type: string,
  lang: string,
  data: any,
  narrationUrl: string,
  bgmS3Key: string
): Record<string, any> {
  const s3Base = process.env.S3_MARKETING_BUCKET_URL || 'https://signum-marketing.s3.amazonaws.com';

  const common = {
    lang,
    narrationUrl,
    bgmUrl: `${s3Base}/${bgmS3Key}`,
  };

  switch (type) {
    case 'pulse':
      return {
        ...common,
        spy: data.spy || 0,
        qqq: data.qqq || 0,
        vix: data.vix || 18,
        gexRegime: data.gexRegime || 'neutral',
        darkPool: data.darkPool,
        callWall: data.callWall,
        putFloor: data.putFloor,
      };

    case 'news':
      return {
        ...common,
        headlines: data.headlines || [],
        spy: data.spy || 0,
        vix: data.vix || 18,
      };

    case 'event':
      return {
        ...common,
        ticker: data.ticker || 'SPY',
        eventType: data.eventType || 'whale',
        details: data.details || '',
        premium: data.premium,
        spy: data.spy || 0,
        gexRegime: data.gexRegime || 'neutral',
      };

    default:
      return common;
  }
}

async function fetchVideoData(type: string): Promise<any> {
  try {
    // Reuse data from daily-content cron
    const pulseCache = await getFromCache('marketing:pulse:' + new Date().toISOString().split('T')[0]);
    if (pulseCache) {
      const parsed = typeof pulseCache === 'string' ? JSON.parse(pulseCache) : pulseCache;
      // Extract raw data from content if available
      return parsed._rawData || parsed;
    }

    // Fallback: read raw market data from Redis
    const [spyRaw, qqqRaw, vixRaw, gexRaw] = await Promise.all([
      safeGet('market:realtime:SPY'),
      safeGet('market:realtime:QQQ'),
      safeGet('market:realtime:VIX'),
      safeGet('analysis:gex:regime'),
    ]);

    return {
      spy: extractNum(spyRaw, 'changePercent') || 0,
      qqq: extractNum(qqqRaw, 'changePercent') || 0,
      vix: extractNum(vixRaw, 'price') || 18,
      gexRegime: typeof gexRaw === 'string' ? gexRaw : (gexRaw?.regime || 'neutral'),
    };
  } catch {
    return { spy: 0, qqq: 0, vix: 18, gexRegime: 'neutral' };
  }
}

async function safeGet(key: string): Promise<any> {
  try { return await getFromCache(key); }
  catch { return null; }
}

function extractNum(data: any, field: string): number | null {
  if (!data) return null;
  const p = typeof data === 'string' ? JSON.parse(data) : data;
  return p?.[field] ?? null;
}
