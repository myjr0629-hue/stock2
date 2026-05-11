// ============================================================================
// /api/cron/render-video — Remotion 영상 렌더링 오케스트레이터
// Redis 데이터 → TTS → Remotion Lambda → S3 MP4 → Redis 로그
// ============================================================================

import { NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import {
  generateNarrationScript,
  synthesizeSpeech,
  selectBgm,
} from '@/lib/marketing/pollyClient';
import {
  renderVideo,
  checkLambdaStatus,
  type RenderResult,
} from '@/lib/marketing/remotionLambda';

// ---------------------------------------------------------------------------
// GET Handler
// ?secret=xxx — CRON_SECRET 인증
// ?dry_run=true|false (default: true)
// ?type=pulse|news|event|all (default: pulse)
// ?lang=en|ko|ja|all (default: en)
// ?status=true — Lambda 배포 상태만 확인
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

  // Status check mode
  if (searchParams.get('status') === 'true') {
    const lambdaStatus = await checkLambdaStatus();
    return NextResponse.json({
      remotion: lambdaStatus,
      envCheck: {
        REMOTION_SERVE_URL: !!process.env.REMOTION_SERVE_URL,
        REMOTION_FUNCTION_NAME: !!process.env.REMOTION_FUNCTION_NAME,
        REMOTION_AWS_REGION: process.env.REMOTION_AWS_REGION || process.env.AWS_REGION || 'not set',
        AWS_ACCESS_KEY_ID: !!process.env.AWS_ACCESS_KEY_ID,
        S3_MARKETING_BUCKET: process.env.S3_MARKETING_BUCKET || 'not set',
      },
    });
  }

  const dryRun = searchParams.get('dry_run') !== 'false';
  const videoType = (searchParams.get('type') || 'pulse') as 'pulse' | 'news' | 'event' | 'all';
  const langParam = (searchParams.get('lang') || 'en') as 'en' | 'ko' | 'ja' | 'all';

  try {
    const dateKey = new Date().toISOString().split('T')[0];
    const langs: ('en' | 'ko' | 'ja')[] = langParam === 'all' ? ['en', 'ko', 'ja'] : [langParam as any];
    const types: ('pulse' | 'news' | 'event')[] = videoType === 'all' ? ['pulse', 'news', 'event'] : [videoType as any];

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

        // 5. Build Remotion input props
        const inputProps = buildInputProps(type, lang, marketData, ttsResult.audioUrl, bgm.s3Key);

        // 6. Render via Remotion Lambda (or DRY_RUN)
        const renderResult: RenderResult = await renderVideo(
          {
            compositionId: getCompositionId(type),
            inputProps,
            codec: 'h264',
            imageFormat: 'jpeg',
          },
          dryRun
        );

        results[key] = {
          ...renderResult,
          compositionId: getCompositionId(type),
          narrationPreview: narrationScript.substring(0, 120) + '...',
          bgm: { name: bgm.name, category: bgm.category, source: bgm.source },
          ttsUrl: ttsResult.audioUrl || null,
        };
      }
    }

    // Log to Redis (7일 보관)
    const logKey = `marketing:video:${dateKey}`;
    await setInCache(logKey, JSON.stringify({
      timestamp: new Date().toISOString(),
      dryRun,
      types,
      langs,
      results,
    }), 86400 * 7);

    // Summary stats
    const successCount = Object.values(results).filter((r: any) => r.status === 'success').length;
    const errorCount = Object.values(results).filter((r: any) => r.status === 'error').length;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      dryRun,
      videoType,
      lang: langParam,
      summary: {
        totalVideos: Object.keys(results).length,
        rendered: successCount,
        errors: errorCount,
        dryRuns: Object.values(results).filter((r: any) => r.status === 'dry_run').length,
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

function buildInputProps(
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
    bgmUrl: bgmS3Key ? `${s3Base}/${bgmS3Key}` : '',
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
    const dateKey = new Date().toISOString().split('T')[0];
    const pulseCache = await getFromCache('marketing:pulse:' + dateKey);
    if (pulseCache) {
      const parsed = typeof pulseCache === 'string' ? JSON.parse(pulseCache) : pulseCache;
      return parsed._rawData || parsed;
    }

    // Fallback: read raw market data from Redis
    const [spyRaw, qqqRaw, vixRaw, gexRaw] = await Promise.all([
      safeGet('yahoo:idx:spx'),
      safeGet('yahoo:idx:nasdaq'),
      safeGet('yahoo:vix'),
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
