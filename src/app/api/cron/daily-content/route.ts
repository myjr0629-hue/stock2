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

    // --- SpaceX News Content ---
    if (contentType === 'spacex' || contentType === 'all') {
      const spacexResult = await generateSpaceXContent();
      const redisKey = `marketing:spacex:${dateKey}`;
      await setInCache(redisKey, JSON.stringify(spacexResult.content), 86400);

      // Pre-capture OG image with TSLA data
      let ogCdnUrl = '';
      try {
        // Fetch TSLA data for OG — use fetchTradeData (live EC2) + cache fallbacks
        const { fetchTradeData: fetchTsla } = await import('@/services/realtimeMetricsService');
        const { getStockDataLight: getTslaLight } = await import('@/services/marketDataLight');
        const [tslaLive, tslaStock, tslaAnalysisRaw] = await Promise.all([
          fetchTsla('TSLA').catch(() => null),
          getTslaLight('TSLA').catch(() => null),
          safeGetCache('cache:analysis:TSLA'),
        ]);
        const tslaAnalysis = tslaAnalysisRaw ? (typeof tslaAnalysisRaw === 'string' ? JSON.parse(tslaAnalysisRaw) : tslaAnalysisRaw) : {};

        let dp = tslaLive?.darkPoolPercent || tslaAnalysis?.darkPoolPercent || 0;
        if (dp === 0) {
          try {
            const dpC = await safeGetCache('marketing:dp:latest:TSLA');
            if (dpC) dp = parseFloat(String(dpC)) || 0;
          } catch {}
        }
        const whale = tslaAnalysis?.whaleIndex ?? tslaAnalysis?.smartFlow ?? 50;
        const gex = String(tslaAnalysis?.gexRegime ?? 'neutral').toLowerCase();
        const price = tslaStock?.price || tslaLive?.price || tslaAnalysis?.price || 0;
        const prevClose = tslaStock?.prevClose || 0;
        let change = tslaStock?.changePercent || 0;
        if (change === 0 && prevClose > 0 && price > 0) {
          change = ((price - prevClose) / prevClose) * 100;
        }
        console.log(`[SpaceX-Content] TSLA data: dp=${dp} whale=${whale} gex=${gex} price=${price} change=${change}`);

        const { captureTemplate } = await import('@/lib/marketing/screenshotService');
        const ogResult = await captureTemplate({
          template: 'spacex_ipo',
          format: 'tweet',
          data: { dp, whale: String(whale), gex, price: String(price), change, date: dateKey },
        });
        if (ogResult?.cdnUrl) {
          ogCdnUrl = ogResult.cdnUrl;
          await setInCache(`marketing:spacex:og:${dateKey}`, ogCdnUrl, 86400);
          console.log(`[SpaceX-Content] ✅ OG captured: ${ogCdnUrl}`);
        }
      } catch (err: any) {
        console.warn('[SpaceX-Content] OG capture failed (non-fatal):', err.message);
      }

      results.spacex = {
        saved: true,
        engine: spacexResult.source,
        redisKey,
        headline: spacexResult.headline,
        ogImage: ogCdnUrl || null,
        preview: {
          en: spacexResult.content.en.text.substring(0, 120) + '...',
          ko: spacexResult.content.ko.text.substring(0, 120) + '...',
          ja: spacexResult.content.ja.text.substring(0, 120) + '...',
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

// ---------------------------------------------------------------------------
// SpaceX News Content Generator
// Guardian (3-lang) → Polygon (EN) → AI translate KO/JA → ContentOutput
// ---------------------------------------------------------------------------
async function generateSpaceXContent(): Promise<{
  content: ContentOutput;
  headline: string;
  source: string;
}> {
  const { applyCompliance, DISCLAIMER } = await import('@/lib/marketing/bufferClient');

  let headline = '';
  const newsByLang: Record<string, string> = { en: '', ko: '', ja: '' };
  let source = 'generic';

  // Step 1: Guardian News Digest — already has 3-lang summaries
  try {
    const pulseRaw = await safeGetCache('guardian:news:digest');
    if (pulseRaw) {
      const pulse = typeof pulseRaw === 'string' ? JSON.parse(pulseRaw) : pulseRaw;
      const items = pulse?.items || [];
      const match = items.find((it: any) =>
        /spacex|starship|starlink|musk.*space|musk.*ipo/i.test(
          `${it.headline} ${it.summaryEN} ${it.analysisEN}`
        )
      );
      if (match) {
        headline = match.headline || '';
        newsByLang.en = [match.summaryEN, match.analysisEN].filter(Boolean).join(' ');
        newsByLang.ko = [match.summaryKR, match.analysisKR].filter(Boolean).join(' ');
        newsByLang.ja = [match.summaryJP, match.analysisJP].filter(Boolean).join(' ');
        source = 'guardian';
        console.log(`[SpaceX-Content] ✅ Guardian match: "${headline}"`);
      }
    }
  } catch {}

  // Step 2: Polygon TSLA news → SpaceX keyword filter
  if (!headline) {
    try {
      const { fetchMassive } = await import('@/services/massiveClient');
      const newsData = await fetchMassive('/v2/reference/news', { ticker: 'TSLA', limit: '10' }, true);
      const articles = (newsData?.results || []).filter((a: any) => a.title);
      const spxMatch = articles.find((a: any) =>
        /spacex|ipo|starship|starlink|musk.*space/i.test(a.title)
      );
      if (spxMatch) {
        headline = spxMatch.title;
        newsByLang.en = spxMatch.description || spxMatch.title;
        source = 'polygon';
        console.log(`[SpaceX-Content] ✅ Polygon match: "${headline}"`);
      }
    } catch {}
  }

  // Step 3: Generic fallback
  if (!headline) {
    headline = 'SpaceX IPO preparation continues as institutional interest in space sector grows';
    newsByLang.en = 'SpaceX continues IPO preparation with institutional investors closely monitoring valuation developments and potential market impact.';
    source = 'generic';
  }

  // Step 4: If KO/JA missing → Bedrock AI translation
  if (newsByLang.en && (!newsByLang.ko || !newsByLang.ja)) {
    try {
      const { callBedrock, MODELS } = await import('@/services/bedrockClient');
      const aiResult = await callBedrock({
        modelId: MODELS.HAIKU_35,
        system: 'You are a SpaceX business analyst. Summarize the given SpaceX news in Korean and Japanese. Each must be STANDALONE readable — include who, what, why. Output ONLY valid JSON. Observation only, no investment advice.',
        userPrompt: `SpaceX news to summarize:\n${newsByLang.en}\n\nOutput format: {"ko":"한국어 뉴스 요약 2-3문장. 핵심 사실 포함.","ja":"日本語ニュース要約2-3文。核心事実を含む。"}`,
        maxTokens: 600,
        temperature: 0.2,
        timeoutMs: 20000,
        jsonPrefill: true,
        label: 'SpaceX-Content-Gen',
      });

      // Robust regex extraction (avoids JSON.parse failures)
      const koM = aiResult.text.match(/"ko"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const jaM = aiResult.text.match(/"ja"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (koM && !newsByLang.ko) newsByLang.ko = koM[1].replace(/\\n/g, ' ').replace(/\\"/g, '"');
      if (jaM && !newsByLang.ja) newsByLang.ja = jaM[1].replace(/\\n/g, ' ').replace(/\\"/g, '"');
      console.log(`[SpaceX-Content] ✅ AI translate: ko=${newsByLang.ko.length} ja=${newsByLang.ja.length}`);
    } catch (e: any) {
      console.warn(`[SpaceX-Content] AI translate failed: ${e.message}`);
    }
  }

  // Final fallback for KO/JA
  if (!newsByLang.ko) newsByLang.ko = newsByLang.en;
  if (!newsByLang.ja) newsByLang.ja = newsByLang.en;

  // Build ContentOutput (same structure as education/pulse)
  function buildSpaceX(lang: 'en' | 'ko' | 'ja'): ContentOutput['en'] {
    const analysis = newsByLang[lang];
    const disclaimerMap = { en: DISCLAIMER.en, ko: DISCLAIMER.ko, ja: DISCLAIMER.ja };
    const hashtagMap = {
      en: '#SpaceX #TSLA #IPO #SpaceIndustry',
      ko: '#스페이스X #테슬라 #미국주식',
      ja: '#SpaceX #テスラ #米国株 #宇宙産業',
    };
    const headerMap = {
      en: '🚀 SpaceX Update',
      ko: '🚀 SpaceX 업데이트',
      ja: '🚀 SpaceX アップデート',
    };

    // Short version for X/Bluesky (280/300 char limit)
    // Extract first sentence only — headline is already long
    const firstSentence = analysis.split(/(?<=[.。!！?？])\s+/)[0] || analysis;
    const shortAnalysis = firstSentence.substring(0, 120);

    const twitterText = [
      headerMap[lang],
      `📰 ${headline}`,
      '',
      shortAnalysis,
    ].join('\n');

    // Full version for Threads/IG (no char limit)
    const threadsText = [
      headerMap[lang],
      `📰 ${headline}`,
      '',
      analysis,
      '',
      disclaimerMap[lang],
      '',
      hashtagMap[lang],
    ].join('\n');

    return {
      text: applyCompliance(threadsText),
      imageUrl: '',
      cta: 'liveStructure' as const,
      platformText: {
        twitter: applyCompliance(twitterText),
        threads: applyCompliance(threadsText),
        instagram: applyCompliance(threadsText),
        bluesky: applyCompliance(twitterText),
      },
    };
  }

  return {
    content: {
      en: buildSpaceX('en'),
      ko: buildSpaceX('ko'),
      ja: buildSpaceX('ja'),
    },
    headline,
    source,
  };
}
