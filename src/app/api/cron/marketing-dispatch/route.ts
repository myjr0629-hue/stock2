// ============================================================================
// /api/cron/marketing-dispatch — 통합 마케팅 자동화 크론
// 모든 플랫폼 × 모든 포맷을 하나의 엔드포인트로 관리
// 
// 스케줄별 호출:
//   ?action=morning    — 06:30 KST: X tweet + Bluesky + IG Story
//   ?action=morning_ig — 08:00 KST: IG Carousel
//   ?action=midday     — 11:00 KST: X tweet + Bluesky + IG Story + Pinterest
//   ?action=education  — 14:00 KST: X Thread + Pinterest
//   ?action=edu_bsky   — 17:00 KST: Bluesky education + Pinterest
//   ?action=pulse      — 05:30+1 KST: X tweet + Bluesky + IG Story + Pinterest
//   ?action=pulse_ig   — 07:00+1 KST: IG Carousel
//   ?action=event      — 실시간: 이벤트 즉시 멀티플랫폼 발송
//
// DRY_RUN 기본: true
// ============================================================================

import { NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import {
  dispatchTweet,
  dispatchThread,
  dispatchCarousel,
  dispatchStory,
  dispatchPin,
  dispatchPost,
  generateCarouselAltTexts,
  type DispatchResult,
  type ThreadSlide,
} from '@/lib/marketing/bufferMultiClient';
import { getChannels, truncateForPlatform, buildUtm } from '@/lib/marketing/bufferClient';
import { getHashtags, buildInstagramFooter, getPinterestSEO, type ContentType, type Lang } from '@/lib/marketing/hashtagEngine';
import { captureTemplate, type FormatType, type TemplateType } from '@/lib/marketing/screenshotService';
import type { ContentOutput } from '@/lib/marketing/contentEngines';

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
type Action = 'morning' | 'morning_ig' | 'midday' | 'education' | 'edu_bsky' | 'pulse' | 'pulse_ig' | 'event' | 'spotlight';
type Region = 'en' | 'asia' | 'all'; // en=EN only, asia=KO+JP, all=both

function getLangsForRegion(region: Region): Lang[] {
  switch (region) {
    case 'en':   return ['en'];
    case 'asia': return ['ko', 'ja'];
    case 'all':  return ['en', 'ko', 'ja'];
  }
}

// ---------------------------------------------------------------------------
// GET Handler
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
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
  const draft = searchParams.get('draft') === 'true'; // Posts go to Buffer Drafts tab
  const action = (searchParams.get('action') || 'pulse') as Action;
  const region = (searchParams.get('region') || 'all') as Region;
  // [FIX] Use ET date to match daily-content's dateKey (generated at 20:30 UTC = same ET market date)
  // Without this, morning dispatch at 10:30 UTC next day would use a different dateKey
  const etDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
  const dateKey = searchParams.get('date') || etDateStr;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signumhq.com';
  const langs = getLangsForRegion(region);

  try {
    const results: DispatchResult[] = [];

    switch (action) {
      // ========================================
      // MORNING BRIEF — 06:30 KST
      // X tweet + Bluesky + IG Story
      // ========================================
      case 'morning': {
        // Morning content generated after close (16:40 ET) with session dateKey.
        // Morning dispatch next day (06:30 ET) has different ET date.
        // → Try today first, then previous trading day fallback.
        let content = await loadContent('morning', dateKey);
        if (!content) {
          const prevKey = getPreviousTradingDayKey();
          content = await loadContent('morning', prevKey);
          if (!content) return noContent('morning', `${dateKey} (also tried ${prevKey})`);
        }

        for (const lang of langs) {
          const lc = content[lang];
          if (!lc?.text) continue;

          const tweetText = lc.platformText?.twitter || lc.text;
          const blueskyText = lc.platformText?.bluesky || lc.text;
          const ctaUrl = buildCtaUrl(lang, 'guardian', 'morning');

          // X Tweet + auto-reply
          const twitterCh = getChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'morning', lang });
            const r = await dispatchTweet({
              channelId: twitterCh.id,
              text: truncateForPlatform(`${tweetText}\n\n${tags}`, 'twitter'),
              imageUrl: await captureImageForDispatch(baseUrl, content, lang, 'tweet', 'morning', dryRun),
              replyText: `📊 ${ctaUrl}`,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // Bluesky
          const bskyCh = getChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'morning', lang });
            const r = await dispatchPost({
              channelId: bskyCh.id,
              text: truncateForPlatform(`${blueskyText}\n\n${ctaUrl}\n\n${tags}`, 'bluesky'),
              imageUrl: lc.imageUrl,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // IG Story
          const igCh = getChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igCh) {
            const storyUrl = await captureImageForDispatch(baseUrl, content, lang, 'story', 'morning', dryRun);
            const r = await dispatchStory({
              channelId: igCh.id,
              imageUrl: storyUrl,
              dryRun,

              draft,
            });
            results.push(r);
          }
        }
        break;
      }

      // ========================================
      // MORNING IG CAROUSEL — 08:00 KST
      // ========================================
      case 'morning_ig': {
        // Same fallback as morning — content generated prev close
        let content = await loadContent('morning', dateKey);
        if (!content) {
          const prevKey = getPreviousTradingDayKey();
          content = await loadContent('morning', prevKey);
          if (!content) return noContent('morning', `${dateKey} (also tried ${prevKey})`);
        }

        for (const lang of langs) {
          const lc = content[lang];
          if (!lc?.text) continue;

          const igCh = getChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igCh) {
            const caption = lc.platformText?.instagram || lc.text;
            const carouselUrls = await captureCarouselForDispatch(baseUrl, content, lang, dryRun);

            const r = await dispatchCarousel({
              channelId: igCh.id,
              caption: truncateForPlatform(`${caption}${buildInstagramFooter(lang, 'morning')}`, 'instagram'),
              imageUrls: carouselUrls,
              altTexts: generateCarouselAltTexts(carouselUrls.length, lang),
              dryRun,

              draft,
            });
            results.push(r);
          }

          // Threads
          const threadsCh = getChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (threadsCh) {
            const tags = getHashtags({ platform: 'threads', contentType: 'morning', lang });
            const r = await dispatchPost({
              channelId: threadsCh.id,
              text: truncateForPlatform(`${lc.platformText?.threads || lc.text}\n\n${tags}`, 'threads'),
              imageUrl: lc.imageUrl,
              dryRun,

              draft,
            });
            results.push(r);
          }
        }
        break;
      }

      // ========================================
      // MIDDAY COMMENTARY — 11:00 KST
      // X tweet + Bluesky + IG Story + Pinterest
      // ========================================
      case 'midday': {
        // Midday uses pulse content — try today, then previous trading day
        let content = await loadContent('pulse', dateKey);
        if (!content) {
          const prevKey = getPreviousTradingDayKey();
          content = await loadContent('pulse', prevKey);
          if (!content) return noContent('pulse', `${dateKey} (also tried ${prevKey})`);
        }

        for (const lang of langs) {
          const lc = content[lang];
          if (!lc?.text) continue;

          const ctaUrl = buildCtaUrl(lang, 'command', 'midday');

          // X Tweet
          const twitterCh = getChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'midday', lang });
            const r = await dispatchTweet({
              channelId: twitterCh.id,
              text: truncateForPlatform(`${lc.platformText?.twitter || lc.text}${tags ? '\n\n' + tags : ''}`, 'twitter'),
              imageUrl: await captureImageForDispatch(baseUrl, content, lang, 'tweet', 'pulse', dryRun),
              replyText: `📊 ${ctaUrl}`,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // Bluesky
          const bskyCh = getChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'midday', lang });
            const r = await dispatchPost({
              channelId: bskyCh.id,
              text: truncateForPlatform(`${lc.platformText?.bluesky || lc.text}\n\n${ctaUrl}\n\n${tags}`, 'bluesky'),
              imageUrl: lc.imageUrl,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // IG Story
          const igCh = getChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igCh) {
            const r = await dispatchStory({
              channelId: igCh.id,
              imageUrl: await captureImageForDispatch(baseUrl, content, lang, 'story', 'pulse', dryRun),
              dryRun,

              draft,
            });
            results.push(r);
          }
        }

        // Pinterest (EN only)
        const pinCh = getChannels({ tier: 'all', service: 'pinterest' })[0];
        if (pinCh) {
          const seo = getPinterestSEO({ contentType: 'pulse', date: dateKey });
          const r = await dispatchPin({
            channelId: pinCh.id,
            imageUrl: await captureImageForDispatch(baseUrl, content, 'en', 'pin', 'pulse', dryRun),
            title: seo.title,
            description: seo.description,
            link: `${baseUrl}/command?${buildUtm('pinterest', 'midday')}`,
            dryRun,

            draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // EDUCATION THREAD — 14:00 KST
      // X Thread + Pinterest
      // ========================================
      case 'education': {
        const content = await loadContent('education', dateKey);
        if (!content) return noContent('education', dateKey);

        for (const lang of langs) {
          const lc = content[lang];
          if (!lc?.text) continue;

          const ctaUrl = buildCtaUrl(lang, 'command', 'education');
          const twitterCh = getChannels({ tier: 'all', lang, service: 'twitter' })[0];

          if (twitterCh) {
            // Build thread slides from education content
            const slides = buildEducationThread(lc, lang, ctaUrl, baseUrl, content);
            const r = await dispatchThread({
              channelId: twitterCh.id,
              slides,
              dryRun,

              draft,
            });
            results.push(r);
          }
        }

        // Pinterest (EN only)
        const pinCh = getChannels({ tier: 'all', service: 'pinterest' })[0];
        if (pinCh) {
          const seo = getPinterestSEO({ contentType: 'education' });
          const r = await dispatchPin({
            channelId: pinCh.id,
            imageUrl: await captureImageForDispatch(baseUrl, content, 'en', 'pin', 'education', dryRun),
            title: seo.title,
            description: seo.description,
            link: `${baseUrl}/command?${buildUtm('pinterest', 'education')}`,
            dryRun,

            draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // EDUCATION BLUESKY — 17:00 KST
      // Bluesky + Pinterest
      // ========================================
      case 'edu_bsky': {
        const content = await loadContent('education', dateKey);
        if (!content) return noContent('education', dateKey);

        for (const lang of langs.filter(l => region === 'asia' ? true : l === 'en')) {
          const lc = content[lang];
          if (!lc?.text) continue;

          const ctaUrl = buildCtaUrl(lang, 'command', 'education');
          const bskyCh = getChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'education', lang });
            const r = await dispatchPost({
              channelId: bskyCh.id,
              text: truncateForPlatform(`${lc.platformText?.bluesky || lc.text}\n\n${ctaUrl}\n\n${tags}`, 'bluesky'),
              imageUrl: lc.imageUrl,
              dryRun,

              draft,
            });
            results.push(r);
          }
        }

        // Additional Pinterest pin (different variant)
        const pinCh = getChannels({ tier: 'all', service: 'pinterest' })[0];
        if (pinCh) {
          const seo = getPinterestSEO({ contentType: 'education' });
          const r = await dispatchPin({
            channelId: pinCh.id,
            imageUrl: await captureImageForDispatch(baseUrl, content, 'en', 'pin', 'education', dryRun),
            title: seo.title,
            description: seo.description,
            link: `${baseUrl}/command?${buildUtm('pinterest', 'education')}`,
            dryRun,

            draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // MARKET PULSE — 05:30+1 KST
      // X tweet + Bluesky + IG Story + Pinterest
      // ========================================
      case 'pulse': {
        const content = await loadContent('pulse', dateKey);
        if (!content) return noContent('pulse', dateKey);

        for (const lang of langs) {
          const lc = content[lang];
          if (!lc?.text) continue;

          const ctaUrl = buildCtaUrl(lang, 'command', 'pulse');

          // X Tweet + auto-reply
          const twitterCh = getChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'pulse', lang });
            const r = await dispatchTweet({
              channelId: twitterCh.id,
              text: truncateForPlatform(`${lc.platformText?.twitter || lc.text}\n\n${tags}`, 'twitter'),
              imageUrl: await captureImageForDispatch(baseUrl, content, lang, 'tweet', 'pulse', dryRun),
              replyText: `📊 ${ctaUrl}`,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // Bluesky
          const bskyCh = getChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'pulse', lang });
            const r = await dispatchPost({
              channelId: bskyCh.id,
              text: truncateForPlatform(`${lc.platformText?.bluesky || lc.text}\n\n${ctaUrl}\n\n${tags}`, 'bluesky'),
              imageUrl: lc.imageUrl,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // IG Story
          const igCh = getChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igCh) {
            const r = await dispatchStory({
              channelId: igCh.id,
              imageUrl: await captureImageForDispatch(baseUrl, content, lang, 'story', 'pulse', dryRun),
              dryRun,

              draft,
            });
            results.push(r);
          }
        }

        // Pinterest (EN only)
        const pinCh = getChannels({ tier: 'all', service: 'pinterest' })[0];
        if (pinCh) {
          const seo = getPinterestSEO({ contentType: 'pulse', date: dateKey });
          const r = await dispatchPin({
            channelId: pinCh.id,
            imageUrl: await captureImageForDispatch(baseUrl, content, 'en', 'pin', 'pulse', dryRun),
            title: seo.title,
            description: seo.description,
            link: `${baseUrl}/command?${buildUtm('pinterest', 'pulse')}`,
            dryRun,

            draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // PULSE IG CAROUSEL — 07:00+1 KST
      // ========================================
      case 'pulse_ig': {
        const content = await loadContent('pulse', dateKey);
        if (!content) return noContent('pulse', dateKey);

        for (const lang of langs) {
          const lc = content[lang];
          if (!lc?.text) continue;

          const igCh = getChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igCh) {
            const caption = lc.platformText?.instagram || lc.text;
            const carouselUrls = await captureCarouselForDispatch(baseUrl, content, lang, dryRun);

            const r = await dispatchCarousel({
              channelId: igCh.id,
              caption: truncateForPlatform(`${caption}${buildInstagramFooter(lang, 'pulse')}`, 'instagram'),
              imageUrls: carouselUrls,
              altTexts: generateCarouselAltTexts(carouselUrls.length, lang),
              dryRun,

              draft,
            });
            results.push(r);
          }

          // Threads
          const threadsCh = getChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (threadsCh) {
            const tags = getHashtags({ platform: 'threads', contentType: 'pulse', lang });
            const r = await dispatchPost({
              channelId: threadsCh.id,
              text: truncateForPlatform(`${lc.platformText?.threads || lc.text}\n\n${tags}`, 'threads'),
              imageUrl: lc.imageUrl,
              dryRun,

              draft,
            });
            results.push(r);
          }
        }
        break;
      }

      // ========================================
      // EVENT — 실시간 즉시 발송
      // ========================================
      case 'event': {
        const content = await loadContent('event', dateKey);
        if (!content) return noContent('event', dateKey);

        // Load pre-captured event alert images (from screenshotService via event-detect)
        let capturedImages: { tweet?: string; story?: string } = {};
        try {
          const imagesRaw = await getFromCache(`marketing:event:images:${dateKey}`);
          if (imagesRaw) capturedImages = JSON.parse(String(imagesRaw));
        } catch { /* non-fatal */ }

        for (const lang of langs) {
          const lc = content[lang];
          if (!lc?.text) continue;

          const ctaUrl = buildCtaUrl(lang, 'command', 'event');
          // Prefer captured image → fallback to existing OG
          const tweetImage = capturedImages.tweet || lc.imageUrl;

          // X Tweet (즉시)
          const twitterCh = getChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'event', lang });
            const r = await dispatchTweet({
              channelId: twitterCh.id,
              text: truncateForPlatform(`${lc.platformText?.twitter || lc.text}\n\n${tags}`, 'twitter'),
              imageUrl: tweetImage,
              replyText: `📊 ${ctaUrl}`,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // Bluesky (즉시)
          const bskyCh = getChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'event', lang });
            const r = await dispatchPost({
              channelId: bskyCh.id,
              text: truncateForPlatform(`${lc.platformText?.bluesky || lc.text}\n\n${ctaUrl}\n\n${tags}`, 'bluesky'),
              imageUrl: tweetImage,
              dryRun,

              draft,
            });
            results.push(r);
          }
        }
        break;
      }

      case 'spotlight': {
        // Phase 4-3: Ticker Spotlight 게릴라 포스팅
        const { generateTickerSpotlight, getRandomSpotlightTicker } = await import('@/lib/marketing/contentEngines');
        const { fetchTradeData } = await import('@/services/realtimeMetricsService');
        const { captureTickerSpotlight } = await import('@/lib/marketing/screenshotService');

        const ticker = searchParams.get('ticker') || getRandomSpotlightTicker();
        const tradeData = await fetchTradeData(ticker).catch(() => null);

        const spotlightContent = generateTickerSpotlight({
          ticker,
          darkPoolPct: tradeData?.darkPoolPercent,
          buyPct: tradeData?.buyPct,
          sellPct: tradeData?.sellPct,
          blockTrades: tradeData?.blockTrades,
        });

        // Save for logging
        await setInCache(`marketing:spotlight:${dateKey}:${ticker}`, JSON.stringify(spotlightContent), 86400);

        
        // [V6.0+] Pre-capture premium images via EC2 Puppeteer -> Supabase CDN
        let spotlightImages = { tweet: null as string | null, og: null as string | null };
        if (!dryRun) {
          try {
            spotlightImages = await captureTickerSpotlight({
              ticker,
              dp: tradeData?.darkPoolPercent ?? 0,
              buy: tradeData?.buyPct ?? 50,
              sell: tradeData?.sellPct ?? 50,
              blocks: tradeData?.blockTrades ?? 0,
              position: tradeData?.darkPoolPercent != null ? Math.min(Math.round(tradeData.darkPoolPercent * 2.5), 100) : 50,
              sector: '',
            });
          } catch (err: any) {
            console.warn(`[Spotlight] Capture failed: ${err.message}`);
          }
        }
for (const lang of langs) {
          const lc = spotlightContent[lang];
          if (!lc?.text) continue;

          const tickerCashtag = `$${ticker}`;

          // X tweet
          const xCh = getChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (xCh) {
            const r = await dispatchTweet({
              channelId: xCh.id,
              text: truncateForPlatform(`${lc.text}\n\n${tickerCashtag} $SPY`, 'twitter'),
              imageUrl: spotlightImages.tweet || lc.imageUrl,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // Threads
          const thCh = getChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (thCh) {
            const r = await dispatchPost({
              channelId: thCh.id,
              text: truncateForPlatform(`${lc.text}\n\n${tickerCashtag}`, 'threads'),
              imageUrl: spotlightImages.tweet || lc.imageUrl,
              dryRun,

              draft,
            });
            results.push(r);
          }
        }
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    // Log dispatch results
    const logKey = `marketing:dispatch:v2:${dateKey}:${action}`;
    const dispatchLog = {
      timestamp: new Date().toISOString(),
      dryRun,

      draft,
      action,
      totalChannels: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
    await setInCache(logKey, JSON.stringify(dispatchLog), 86400 * 7);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      dryRun,

      draft,
      action,
      summary: {
        totalDispatched: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
      },
      results,
    });
  } catch (err: any) {
    console.error('[Cron/MarketingDispatch] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadContent(type: string, dateKey: string): Promise<ContentOutput | null> {
  const key = `marketing:${type}:${dateKey}`;
  const cached = await getFromCache(key).catch(() => null);
  if (!cached) return null;
  const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
  return parsed as ContentOutput;
}

// Previous trading day: Mon→Fri, Tue-Fri→prev day, Sat/Sun→Fri
function getPreviousTradingDayKey(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(); // 0=Sun,1=Mon,...
  const daysBack = day === 1 ? 3 : day === 0 ? 2 : 1; // Mon→3(Fri), Sun→2(Fri)
  et.setDate(et.getDate() - daysBack);
  return et.toLocaleDateString('en-CA'); // YYYY-MM-DD
}

function noContent(type: string, dateKey: string) {
  return NextResponse.json({
    success: false,
    error: `No content at marketing:${type}:${dateKey}. Run /api/cron/daily-content first.`,
  }, { status: 404 });
}

function buildCtaUrl(lang: Lang, page: string, campaign: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signumhq.com';
  const utm = buildUtm('social', campaign);
  return `${baseUrl}/${page}?${utm}`;
}

/**
 * Extract data params from content's imageUrl for EC2 capture.
 */
function extractDataParams(content: ContentOutput, lang: Lang, baseUrl: string): Record<string, string | number> {
  const existingUrl = content[lang]?.imageUrl || '';
  const params = new URL(existingUrl, baseUrl).searchParams;
  const data: Record<string, string | number> = {};
  params.forEach((v, k) => { data[k] = v; });
  return data;
}

/**
 * Capture image via EC2 Puppeteer → Supabase CDN.
 * Uses /templates/og/* HTML templates exclusively.
 * NO Satori fallback — EC2 Puppeteer is the ONLY image source.
 */
async function captureImageForDispatch(
  baseUrl: string,
  content: ContentOutput,
  lang: Lang,
  format: FormatType,
  template: TemplateType,
  dryRun: boolean,
): Promise<string> {
  const data = extractDataParams(content, lang, baseUrl);

  // dry_run: return template preview URL (Buffer won't fetch it)
  if (dryRun) {
    const previewUrl = new URL(`${baseUrl}/templates/og/${template}`);
    Object.entries(data).forEach(([k, v]) => previewUrl.searchParams.set(k, String(v)));
    previewUrl.searchParams.set('format', format);
    previewUrl.searchParams.set('lang', lang);
    return previewUrl.toString();
  }

  // LIVE: EC2 Puppeteer capture → Supabase CDN
  const result = await captureTemplate({ template, format, data });
  if (result?.cdnUrl) {
    console.log(`[Dispatch] ✅ EC2 capture: ${template}/${format}/${lang} → ${result.sizeKB}KB`);
    return result.cdnUrl;
  }

  throw new Error(`[Dispatch] EC2 capture failed for ${template}/${format}/${lang} — no image available`);
}

/**
 * Capture carousel slides via EC2 Puppeteer → Supabase CDN.
 * NO Satori fallback.
 */
async function captureCarouselForDispatch(
  baseUrl: string,
  content: ContentOutput,
  lang: Lang,
  dryRun: boolean,
): Promise<string[]> {
  const data = extractDataParams(content, lang, baseUrl);

  if (dryRun) {
    return [1, 2, 3, 4, 5, 6].map(slide => {
      const url = new URL(`${baseUrl}/templates/og/carousel`);
      Object.entries(data).forEach(([k, v]) => url.searchParams.set(k, String(v)));
      url.searchParams.set('slide', String(slide));
      url.searchParams.set('format', 'carousel');
      url.searchParams.set('lang', lang);
      return url.toString();
    });
  }

  // LIVE: EC2 capture each slide
  const urls: string[] = [];
  for (let slide = 1; slide <= 6; slide++) {
    const result = await captureTemplate({
      template: 'carousel',
      format: 'carousel',
      data: { ...data, slide },
    });
    if (!result?.cdnUrl) {
      throw new Error(`[Dispatch] EC2 carousel slide ${slide} capture failed`);
    }
    urls.push(result.cdnUrl);
    await new Promise(r => setTimeout(r, 300));
  }
  return urls;
}


function buildEducationThread(
  lc: ContentOutput['en'],
  lang: Lang,
  ctaUrl: string,
  baseUrl: string,
  content: ContentOutput
): ThreadSlide[] {
  const text = lc.platformText?.twitter || lc.text;

  // Split into ~4 thread slides
  const sentences = text.split(/[.!?。！？]\s+/).filter(s => s.trim());
  const chunkSize = Math.ceil(sentences.length / 3);

  const slide1Text = sentences.slice(0, chunkSize).join('. ') + '.';
  const slide2Text = sentences.slice(chunkSize, chunkSize * 2).join('. ') + '.';
  const slide3Text = sentences.slice(chunkSize * 2).join('. ') + '.';
  const slide4Text = `${ctaUrl}\n\n🔁 RT if this changed how you think about market structure.`;

  return [
    { text: `🧵 ${truncateForPlatform(slide1Text, 'twitter')}`, imageUrl: lc.imageUrl },
    { text: truncateForPlatform(slide2Text, 'twitter') },
    { text: truncateForPlatform(slide3Text, 'twitter') },
    { text: truncateForPlatform(slide4Text, 'twitter'), imageUrl: lc.imageUrl },
  ];
}
