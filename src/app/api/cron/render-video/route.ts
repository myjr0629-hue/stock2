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
    case 'pulse': return 'MarketPulseV3';  // V3 하이브리드 6씬
    case 'pulse_legacy': return 'MarketPulse';  // V2 레거시
    case 'news':  return 'NewsDigest';
    case 'event': return 'EventSpike';
    default:      return 'MarketPulseV3';
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
      // V3 하이브리드 — 전체 16개 필드
      return {
        ...common,
        date: new Date().toISOString().split('T')[0],
        ticker: data.topTicker || data.ticker || 'SPY',
        tickerName: data.tickerName || 'S&P 500 ETF',
        price: String(data.topPrice || data.price || '585.00'),
        change: String(data.topChange || data.change || '+0.00'),
        gexRegime: (data.gexRegime || 'neutral').toUpperCase(),
        gexLabel: data.gexLabel || data.gexShift || `→ ${(data.gexRegime || 'NEUTRAL').toUpperCase()}`,
        instNotional: data.instNotional ?? null,
        instCallPct: data.instCallPct ?? null,
        buyRatio: data.buyRatio || 50,
        sellRatio: data.sellRatio || 50,
        spy: data.spy || 0,
        qqq: data.qqq || 0,
        vix: data.vix || 18,
        insight1: data.insight1 || '',
        insight2: data.insight2 || '',
        insight3: data.insight3 || '',
      };

    case 'pulse_legacy':
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
    // [V3] Use ET date to match daily-content pipeline
    const dateKey = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    // PRIMARY: Reuse data from daily-content cron (includes _rawData with darkPool)
    const pulseCache = await getFromCache('marketing:pulse:' + dateKey);
    const raw = pulseCache
      ? (() => { const p = typeof pulseCache === 'string' ? JSON.parse(pulseCache) : pulseCache; return p._rawData || p; })()
      : null;

    // Market indices (from pulse or fallback)
    let spy = raw?.spy || 0;
    let qqq = raw?.qqq || 0;
    let vix = raw?.vix || 18;

    if (!raw) {
      // FALLBACK: Read raw market data from actual Redis keys
      const [spyRaw, qqqRaw, vixRaw] = await Promise.all([
        safeGet('yahoo:idx:spx'),
        safeGet('yahoo:idx:nasdaq'),
        safeGet('yahoo:vix'),
      ]);
      spy = extractNum(spyRaw, 'changePercent') || 0;
      qqq = extractNum(qqqRaw, 'changePercent') || 0;
      vix = extractNum(vixRaw, 'price') || 18;
    }

    // GEX regime
    const gexRaw = await safeGet('analysis:gex:regime');
    const gexParsed = typeof gexRaw === 'string'
      ? (() => { try { return JSON.parse(gexRaw); } catch { return { regime: gexRaw }; } })()
      : (gexRaw || {});

    // ⚠️ 여기 있던 `let darkPool = raw?.darkPool || 35` 가 **발행되는 영상에**
    //    존재하지 않는 다크풀 35% 를 실어 내보내고 있었다. 원천은 2026-08-28
    //    소멸했고, 그 뒤로 이 상수만 남아 매 영상에 찍혔다.
    //    대체: 기관 신규 포지션(옵션 미결제약정 증가분). 없으면 null 로 두고
    //    영상에서 그 패널을 **아예 안 그린다**.
    let instNotional: number | null = null;
    let instCallPct: number | null = null;
    let buyRatio = 50;
    let sellRatio = 50;
    try {
      const { getInstitutionalFlowSummary } = await import('@/services/institutionalFlow');
      const inst = await getInstitutionalFlowSummary();
      if (inst) {
        instNotional = inst.notional;
        instCallPct = inst.callPct;
        buyRatio = Math.round(inst.callPct);
        sellRatio = 100 - Math.round(inst.callPct);
      }
    } catch { /* 없으면 패널을 안 그린다 */ }

    // [V3] Dynamic top ticker — scan M7 for biggest mover
    const topTickerData = await findTopTicker();

    // [V3] AI-generated insights
    const gexRegime = gexParsed?.regime || raw?.gexRegime || 'neutral';
    // 나레이션까지 가짜 숫자로 만들지 않는다 — 없으면 그 주제를 안 쓴다
    const insights = await generateVideoInsights({ spy, qqq, vix, gexRegime, instNotional, instCallPct });

    return {
      spy,
      qqq,
      vix,
      gexRegime,
      gexLabel: gexParsed?.shift || '',
      instNotional,
      instCallPct,
      buyRatio,
      sellRatio,
      topTicker: topTickerData.ticker,
      tickerName: topTickerData.name,
      topPrice: topTickerData.price,
      topChange: topTickerData.change,
      insight1: insights[0],
      insight2: insights[1],
      insight3: insights[2],
    };
  } catch {
    // 실패했으면 «모른다». 상수(다크풀 35·VIX 18)를 발행하지 않는다.
    return { spy: 0, qqq: 0, vix: 0, gexRegime: 'neutral', instNotional: null, instCallPct: null, buyRatio: 50, sellRatio: 50 };
  }
}

// ---------------------------------------------------------------------------
// [V3] Dynamic Top Ticker — M7 중 가장 큰 변동 티커 자동 선택
// ---------------------------------------------------------------------------
const M7_TICKERS: { ticker: string; name: string }[] = [
  { ticker: 'NVDA', name: 'NVIDIA Corp' },
  { ticker: 'TSLA', name: 'Tesla Inc' },
  { ticker: 'AAPL', name: 'Apple Inc' },
  { ticker: 'MSFT', name: 'Microsoft Corp' },
  { ticker: 'AMZN', name: 'Amazon.com Inc' },
  { ticker: 'META', name: 'Meta Platforms' },
  { ticker: 'GOOGL', name: 'Alphabet Inc' },
];

async function findTopTicker(): Promise<{
  ticker: string; name: string; price: string; change: string;
}> {
  try {
    const results: { ticker: string; name: string; change: number; price: number }[] = [];

    await Promise.all(M7_TICKERS.map(async (t) => {
      const raw = await safeGet(`cache:analysis:${t.ticker}`);
      if (!raw) return;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const change = parsed?.changePercent ?? parsed?.changePct ?? null;
      const price = parsed?.price ?? parsed?.currentPrice ?? null;
      if (change != null && price != null) {
        results.push({ ticker: t.ticker, name: t.name, change, price });
      }
    }));

    if (results.length === 0) {
      return { ticker: 'SPY', name: 'S&P 500 ETF', price: '585.00', change: '+0.00' };
    }

    // Pick biggest absolute move
    results.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    const top = results[0];

    return {
      ticker: top.ticker,
      name: top.name,
      price: top.price.toFixed(2),
      change: top.change > 0 ? `+${top.change.toFixed(2)}` : top.change.toFixed(2),
    };
  } catch {
    return { ticker: 'SPY', name: 'S&P 500 ETF', price: '585.00', change: '+0.00' };
  }
}

// ---------------------------------------------------------------------------
// [V3] AI-generated Video Insights — Bedrock Haiku 3줄 인사이트
// ---------------------------------------------------------------------------
async function generateVideoInsights(data: {
  spy: number; qqq: number; vix: number; gexRegime: string;
  instNotional: number | null; instCallPct: number | null;
}): Promise<[string, string, string]> {
  const money = (v: number) => v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`;
  // 다크풀 문장은 삭제했다 — 원천이 없는데 「Dark pool 42%」를 읽어 주고 있었다.
  const instLine = data.instNotional != null && data.instCallPct != null
    ? `${money(data.instNotional)} in new institutional option positions — ${data.instCallPct >= 50 ? 'call' : 'put'}-weighted ${data.instCallPct >= 50 ? data.instCallPct.toFixed(0) : (100 - data.instCallPct).toFixed(0)}%`
    : `VIX structure and dealer positioning define today's hedging backdrop`;
  const defaults: [string, string, string] = [
    `GEX ${data.gexRegime.toUpperCase()} regime — dealer hedging structure ${data.gexRegime === 'negative' ? 'amplifies' : 'dampens'} volatility`,
    instLine,
    `VIX at ${data.vix.toFixed(1)} — ${data.vix > 25 ? 'elevated short-term risk structure' : data.vix > 18 ? 'moderate volatility regime' : 'low volatility compression'}`,
  ];

  try {
    const { callBedrock, MODELS } = await import('@/services/bedrockClient');

    const prompt = `Generate exactly 3 short video insights (each 10-15 words max) for a market structure analysis video.

DATA:
- SPY: ${data.spy > 0 ? '+' : ''}${data.spy.toFixed(2)}%
- QQQ: ${data.qqq > 0 ? '+' : ''}${data.qqq.toFixed(2)}%
- VIX: ${data.vix.toFixed(1)}
- GEX Regime: ${data.gexRegime.toUpperCase()}
${data.instNotional != null && data.instCallPct != null
  ? `- New institutional option positions (open-interest additions, prior close): ${money(data.instNotional)}, ${data.instCallPct.toFixed(1)}% call-weighted`
  : '- (No institutional positioning data today — do not mention it)'}

RULES:
- Each insight must be a structural OBSERVATION, not prediction
- Use institutional vocabulary (dealer hedging, gamma exposure, open interest)
- NEVER mention dark pool — we do not have that data. Inventing it is a false claim.
- Only reference numbers given above. Never invent a metric that is not listed.
- NEVER use: buy, sell, bullish, bearish, predict, guarantee, opportunity
- Format: Return ONLY a JSON array of exactly 3 strings
- Example: ["GEX negative regime — dealer hedging amplifies volatility","$63B in new call positions — institutional accumulation signal","VIX 18.5 — moderate volatility compression"]`;

    const result = await callBedrock({
      modelId: MODELS.HAIKU_35,
      system: 'You are a quantitative market analyst. Return ONLY valid JSON arrays.',
      userPrompt: prompt,
      maxTokens: 300,
      temperature: 0.5,
      timeoutMs: 10000,
      fallbackModel: null,
      jsonPrefill: true,
      maxRetries: 1,
      label: 'VideoInsights',
    });

    let text = result.text.trim();
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const arrStart = text.indexOf('[');
    if (arrStart >= 0) text = text.slice(arrStart);

    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length >= 3) {
      return [String(parsed[0]), String(parsed[1]), String(parsed[2])];
    }

    return defaults;
  } catch (err: any) {
    console.warn('[RenderVideo] AI insights fallback:', err.message);
    return defaults;
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

