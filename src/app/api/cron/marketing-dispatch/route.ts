// ============================================================================
// /api/cron/marketing-dispatch ???�합 마�????�동???�론
// 모든 ?�랫??× 모든 ?�맷???�나???�드?�인?�로 관�?
// 
// ?��?줄별 ?�출:
//   ?action=morning    ??06:30 KST: X tweet + Bluesky + IG Story
//   ?action=morning_ig ??08:00 KST: IG Carousel
//   ?action=midday     ??11:00 KST: X tweet + Bluesky + IG Story + Pinterest
//   ?action=education  ??14:00 KST: X Thread + Pinterest
//   ?action=edu_bsky   ??17:00 KST: Bluesky education + Pinterest
//   ?action=pulse      ??05:30+1 KST: X tweet + Bluesky + IG Story + Pinterest
//   ?action=pulse_ig   ??07:00+1 KST: IG Carousel
//   ?action=event      ???�시�? ?�벤??즉시 멀?�플?�폼 발송
//
// DRY_RUN 기본: true
// ============================================================================

import { NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // IG 캐러?� 6??캡처??충분???�간

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
import { captureTemplate, captureStoryImage, type FormatType, type TemplateType } from '@/lib/marketing/screenshotService';
import type { ContentOutput } from '@/lib/marketing/contentEngines';
import { buildRealtimeText, captureRealtimeOG, fetchLiveMarketData } from '@/lib/marketing/realtimeContent';

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
type Action = 'morning' | 'morning_ig' | 'midday' | 'education' | 'edu_bsky' | 'pulse' | 'pulse_ig' | 'event' | 'spotlight' | 'premarket_bsky' | 'premarket_threads' | 'intraday_bsky' | 'close_bsky' | 'close_threads';
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
      // MORNING BRIEF ??06:30 KST
      // X tweet + Bluesky + IG Story
      // ========================================
      case 'morning': {
        // Morning content generated after close (16:40 ET) with session dateKey.
        // Morning dispatch next day (06:30 ET) has different ET date.
        // ??Try today first, then previous trading day fallback.
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

          // Pre-capture OG image (reused across X + Bluesky)
          const ogImage = await captureImageForDispatch(baseUrl, content, lang, 'tweet', 'morning', dryRun);

          // X Tweet + auto-reply
          const twitterCh = getChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'morning', lang });
            const r = await dispatchTweet({
              channelId: twitterCh.id,
              text: truncateWithTags(tweetText, tags, 'twitter'),
              imageUrl: ogImage,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // Bluesky
          const bskyCh = getChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'morning', lang });
            const footer = `\n\n${ctaUrl}\n\n${tags}`;
            const r = await dispatchPost({
              channelId: bskyCh.id,
              text: truncateWithTags(blueskyText, footer, 'bluesky'),
              imageUrl: ogImage,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // IG Story (1080×1920) ??dedicated story template
          const igChMorning = getChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igChMorning) {
            const storyUrl = await captureStoryForDispatch(baseUrl, content, lang, dryRun);
            if (storyUrl) {
              const r = await dispatchStory({
                channelId: igChMorning.id,
                imageUrl: storyUrl,
                dryRun,
                draft,
              });
              results.push(r);
            }
          }
        }
        break;
      }

      // ========================================
      // MORNING IG CAROUSEL ??08:00 KST
      // ========================================
      case 'morning_ig': {
        // Same fallback as morning ??content generated prev close
        let content = await loadContent('morning', dateKey);
        if (!content) {
          const prevKey = getPreviousTradingDayKey();
          content = await loadContent('morning', prevKey);
          if (!content) return noContent('morning', `${dateKey} (also tried ${prevKey})`);
        }

        for (const lang of langs) {
          const lc = content[lang];
          if (!lc?.text) continue;

          // Pre-capture OG image for Threads
          const threadsImage = await captureImageForDispatch(baseUrl, content, lang, 'og', 'morning', dryRun);

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
              text: truncateWithTags(lc.platformText?.threads || lc.text, tags, 'threads'),
              imageUrl: threadsImage,
              dryRun,

              draft,
            });
            results.push(r);
          }
        }
        break;
      }

      // ========================================
      // MIDDAY COMMENTARY ??11:00 KST
      // X tweet + Bluesky + IG Story + Pinterest
      // ========================================
      case 'midday': {
        // Midday uses pulse content ??try today, then previous trading day
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

          // Pre-capture OG image (reused across X + Bluesky)
          const ogImage = await captureImageForDispatch(baseUrl, content, lang, 'tweet', 'pulse', dryRun);

          // X Tweet
          const twitterCh = getChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'midday', lang });
            const r = await dispatchTweet({
              channelId: twitterCh.id,
              text: truncateWithTags(lc.platformText?.twitter || lc.text, tags, 'twitter'),
              imageUrl: ogImage,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // Bluesky
          const bskyCh = getChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'midday', lang });
            const footer = `\n\n${ctaUrl}\n\n${tags}`;
            const r = await dispatchPost({
              channelId: bskyCh.id,
              text: truncateWithTags(lc.platformText?.bluesky || lc.text, footer, 'bluesky'),
              imageUrl: ogImage,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // IG Story (1080×1920) ??dedicated story template
          const igChMidday = getChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igChMidday) {
            const storyUrl = await captureStoryForDispatch(baseUrl, content, lang, dryRun);
            if (storyUrl) {
              const r = await dispatchStory({
                channelId: igChMidday.id,
                imageUrl: storyUrl,
                dryRun,
                draft,
              });
              results.push(r);
            }
          }

          // Threads
          const thChMidday = getChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (thChMidday) {
            const tags = getHashtags({ platform: 'threads', contentType: 'midday', lang });
            const r = await dispatchPost({
              channelId: thChMidday.id,
              text: truncateWithTags(lc.platformText?.threads || lc.text, tags, 'threads'),
              imageUrl: ogImage,
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
      // EDUCATION THREAD ??14:00 KST
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
            // Pre-capture education OG image for thread
            const eduOgImage = await captureImageForDispatch(baseUrl, content, lang, 'tweet', 'education', dryRun);
            // Build thread slides from education content
            const slides = buildEducationThread(lc, lang, ctaUrl, eduOgImage);
            const r = await dispatchThread({
              channelId: twitterCh.id,
              slides,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // Threads (conversational education reformat)
          const thChEdu = getChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (thChEdu) {
            const eduImage = await captureImageForDispatch(baseUrl, content, lang, 'og', 'education', dryRun);
            const tags = getHashtags({ platform: 'threads', contentType: 'education', lang });
            const r = await dispatchPost({
              channelId: thChEdu.id,
              text: truncateWithTags(lc.platformText?.threads || lc.text, tags, 'threads'),
              imageUrl: eduImage,
              dryRun,
              draft,
            });
            results.push(r);
          }

          // IG Story (1080x1920) — Education story template
          const igChEdu = getChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igChEdu && !dryRun) {
            try {
              const { captureEducationStory } = await import('@/lib/marketing/screenshotService');
              const topicId = (content as any)?.topicId || 'gex';
              const storyUrl = await captureEducationStory({ topic: topicId });
              if (storyUrl) {
                const r = await dispatchStory({ channelId: igChEdu.id, imageUrl: storyUrl, dryRun, draft });
                results.push(r);
              }
            } catch (err: any) {
              console.warn(`[Education] Story capture failed: ${err.message}`);
            }
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
      // EDUCATION BLUESKY ??17:00 KST
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
            const eduImage = await captureImageForDispatch(baseUrl, content, lang, 'og', 'education', dryRun);
            const r = await dispatchPost({
              channelId: bskyCh.id,
              text: truncateWithTags(lc.platformText?.bluesky || lc.text, `\n\n${ctaUrl}\n\n${tags}`, 'bluesky'),
              imageUrl: eduImage,
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
      // MARKET PULSE ??05:30+1 KST
      // X tweet + Bluesky + IG Story + Pinterest
      // ========================================
      case 'pulse': {
        const content = await loadContent('pulse', dateKey);
        if (!content) return noContent('pulse', dateKey);

        for (const lang of langs) {
          const lc = content[lang];
          if (!lc?.text) continue;

          const ctaUrl = buildCtaUrl(lang, 'command', 'pulse');

          // Pre-capture OG image (reused across X + Bluesky)
          const ogImage = await captureImageForDispatch(baseUrl, content, lang, 'tweet', 'pulse', dryRun);

          // X Tweet + auto-reply
          const twitterCh = getChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'pulse', lang });
            const r = await dispatchTweet({
              channelId: twitterCh.id,
              text: truncateWithTags(lc.platformText?.twitter || lc.text, tags, 'twitter'),
              imageUrl: ogImage,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // Bluesky
          const bskyCh = getChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'pulse', lang });
            const footer = `\n\n${ctaUrl}\n\n${tags}`;
            const r = await dispatchPost({
              channelId: bskyCh.id,
              text: truncateWithTags(lc.platformText?.bluesky || lc.text, footer, 'bluesky'),
              imageUrl: ogImage,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // IG Story (1080×1920) ??dedicated story template
          const igChPulse = getChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igChPulse) {
            const storyUrl = await captureStoryForDispatch(baseUrl, content, lang, dryRun);
            if (storyUrl) {
              const r = await dispatchStory({
                channelId: igChPulse.id,
                imageUrl: storyUrl,
                dryRun,
                draft,
              });
              results.push(r);
            }
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
      // PULSE IG CAROUSEL ??07:00+1 KST
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
            const threadsImage = await captureImageForDispatch(baseUrl, content, lang, 'og', 'pulse', dryRun);
            const r = await dispatchPost({
              channelId: threadsCh.id,
              text: truncateWithTags(lc.platformText?.threads || lc.text, tags, 'threads'),
              imageUrl: threadsImage,
              dryRun,

              draft,
            });
            results.push(r);
          }
        }
        break;
      }

      // ========================================
      // EVENT ???�시�?즉시 발송
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
          // Prefer captured image ??fallback to existing OG
          const tweetImage = capturedImages.tweet || lc.imageUrl;

          // X Tweet (즉시)
          const twitterCh = getChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'event', lang });
            const r = await dispatchTweet({
              channelId: twitterCh.id,
              text: truncateWithTags(lc.platformText?.twitter || lc.text, tags, 'twitter'),
              imageUrl: tweetImage,
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
              text: truncateWithTags(lc.platformText?.bluesky || lc.text, `\n\n${ctaUrl}\n\n${tags}`, 'bluesky'),
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
        // Phase 4-3: Ticker Spotlight 게릴???�스??
        const { generateTickerSpotlight, getRandomSpotlightTicker } = await import('@/lib/marketing/contentEngines');
        const { fetchTradeData } = await import('@/services/realtimeMetricsService');
        const { captureTickerSpotlight } = await import('@/lib/marketing/screenshotService');

        const ticker = searchParams.get('ticker') || await (async () => {
          // Prevent duplicate: check which tickers were already posted today
          const usedRaw = await getFromCache(`marketing:spotlight:used:${dateKey}`).catch(() => null);
          const usedTickers: string[] = usedRaw ? JSON.parse(String(usedRaw)) : [];
          let picked = getRandomSpotlightTicker();
          let attempts = 0;
          while (usedTickers.includes(picked) && attempts < 5) {
            picked = getRandomSpotlightTicker();
            attempts++;
          }
          // Record this ticker as used today
          usedTickers.push(picked);
          await setInCache(`marketing:spotlight:used:${dateKey}`, JSON.stringify(usedTickers), 86400);
          return picked;
        })();
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
          const xTags = `${tickerCashtag} $SPY #DarkPool`;

          // X tweet
          const xCh = getChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (xCh) {
            const r = await dispatchTweet({
              channelId: xCh.id,
              text: truncateWithTags(lc.text, xTags, 'twitter'),
              imageUrl: spotlightImages.tweet || lc.imageUrl,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // Bluesky
          const bskyCh = getChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'spotlight', lang, tickers: [ticker] });
            const ctaUrl = buildCtaUrl(lang, 'command', 'spotlight');
            const r = await dispatchPost({
              channelId: bskyCh.id,
              text: truncateWithTags(lc.text, `\n\n${ctaUrl}\n\n${tags}`, 'bluesky'),
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
              text: truncateWithTags(lc.text, `${tickerCashtag} #InstitutionalFlow`, 'threads'),
              imageUrl: spotlightImages.tweet || lc.imageUrl,
              dryRun,

              draft,
            });
            results.push(r);
          }

          // IG Story (1080x1920) — Spotlight story template
          const igChSpot = getChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igChSpot && !dryRun) {
            try {
              const { captureSpotlightStory } = await import('@/lib/marketing/screenshotService');
              const storyUrl = await captureSpotlightStory({
                ticker,
                dp: tradeData?.darkPoolPercent,
                smartFlow: tradeData?.buyPct,
                gex: 'neutral',
                insight: spotlightContent.en?.text?.split('\n')[0] || '',
              });
              if (storyUrl) {
                const r = await dispatchStory({ channelId: igChSpot.id, imageUrl: storyUrl, dryRun, draft });
                results.push(r);
              }
            } catch (err: any) {
              console.warn(`[Spotlight] Story capture failed: ${err.message}`);
            }
          }
        }

        // Pinterest (EN only)
        const pinChSpot = getChannels({ tier: 'all', service: 'pinterest' })[0];
        if (pinChSpot) {
          const seo = getPinterestSEO({ contentType: 'spotlight' });
          const r = await dispatchPin({
            channelId: pinChSpot.id,
            imageUrl: spotlightImages.og || spotlightImages.tweet || spotlightContent.en?.imageUrl || '',
            title: `${ticker} Dark Pool & Institutional Flow Spotlight`,
            description: seo.description,
            link: `${baseUrl}/command?${buildUtm('pinterest', 'spotlight')}&ticker=${ticker}`,
            dryRun,

            draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // PRE-MARKET BLUESKY ??08:30 ET
      // Real-time structure snapshot (FOMO)
      // ========================================
      case 'premarket_bsky': {
        const mkt = await fetchLiveMarketData();
        for (const lang of langs) {
          const bskyCh = getChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (!bskyCh) continue;
          const text = buildRealtimeText('premarket', 'bluesky', lang, mkt);
          const tags = getHashtags({ platform: 'bluesky', contentType: 'premarket', lang });
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'tweet', dryRun);
          const r = await dispatchPost({
            channelId: bskyCh.id,
            text: truncateWithTags(text, `\n\n${buildCtaUrl(lang, 'command', 'premarket')}\n\n${tags}`, 'bluesky'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // PRE-MARKET THREADS ??08:35 ET
      // Conversational pre-market (engagement)
      // ========================================
      case 'premarket_threads': {
        const mkt = await fetchLiveMarketData();
        for (const lang of langs) {
          const thCh = getChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (!thCh) continue;
          const text = buildRealtimeText('premarket', 'threads', lang, mkt);
          const tags = getHashtags({ platform: 'threads', contentType: 'premarket', lang });
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPost({
            channelId: thCh.id,
            text: truncateWithTags(text, tags, 'threads'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // INTRADAY BLUESKY ??14:00 ET
      // Live session structure update (urgency)
      // ========================================
      case 'intraday_bsky': {
        const mkt = await fetchLiveMarketData();
        for (const lang of langs) {
          const bskyCh = getChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (!bskyCh) continue;
          const text = buildRealtimeText('intraday', 'bluesky', lang, mkt);
          const tags = getHashtags({ platform: 'bluesky', contentType: 'intraday', lang });
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'tweet', dryRun);
          const r = await dispatchPost({
            channelId: bskyCh.id,
            text: truncateWithTags(text, `\n\n${buildCtaUrl(lang, 'flow', 'intraday')}\n\n${tags}`, 'bluesky'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // CLOSE BLUESKY ??16:10 ET
      // Post-close summary (FOMO next-day)
      // ========================================
      case 'close_bsky': {
        const mkt = await fetchLiveMarketData();
        for (const lang of langs) {
          const bskyCh = getChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (!bskyCh) continue;
          const text = buildRealtimeText('close', 'bluesky', lang, mkt);
          const tags = getHashtags({ platform: 'bluesky', contentType: 'close', lang });
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'tweet', dryRun);
          const r = await dispatchPost({
            channelId: bskyCh.id,
            text: truncateWithTags(text, `\n\n${buildCtaUrl(lang, 'command', 'close')}\n\n${tags}`, 'bluesky'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // CLOSE THREADS ??16:15 ET
      // Conversational close recap (engagement)
      // ========================================
      case 'close_threads': {
        const mkt = await fetchLiveMarketData();
        for (const lang of langs) {
          const thCh = getChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (!thCh) continue;
          const text = buildRealtimeText('close', 'threads', lang, mkt);
          const tags = getHashtags({ platform: 'threads', contentType: 'close', lang });
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPost({
            channelId: thCh.id,
            text: truncateWithTags(text, tags, 'threads'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
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

// Previous trading day: Mon?�Fri, Tue-Fri?�prev day, Sat/Sun?�Fri
function getPreviousTradingDayKey(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(); // 0=Sun,1=Mon,...
  const daysBack = day === 1 ? 3 : day === 0 ? 2 : 1; // Mon??(Fri), Sun??(Fri)
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
 * Truncate body text while preserving tags/footer.
 * Reserves space for the footer (tags, CTA) first, then truncates body to fit.
 */
function truncateWithTags(body: string, tagsOrFooter: string, service: string): string {
  const LIMITS: Record<string, number> = { twitter: 280, threads: 500, instagram: 2200, bluesky: 300, pinterest: 500 };
  const limit = LIMITS[service] || 280;
  const separator = '\n\n';
  const footerLen = separator.length + tagsOrFooter.length;
  const maxBody = limit - footerLen;
  if (maxBody < 50) {
    return truncateForPlatform(`${body}${separator}${tagsOrFooter}`, service);
  }
  const trimmedBody = body.length > maxBody ? body.substring(0, maxBody - 3) + '...' : body;
  return `${trimmedBody}${separator}${tagsOrFooter}`;
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
 * Capture image via EC2 Puppeteer ??Supabase CDN.
 * Uses /templates/og/* HTML templates exclusively.
 * NO Satori fallback ??EC2 Puppeteer is the ONLY image source.
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

  // LIVE: EC2 Puppeteer capture ??Supabase CDN (retry once on failure)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await captureTemplate({ template, format, data });
      if (result?.cdnUrl) {
        console.log(`[Dispatch] ??EC2 capture: ${template}/${format}/${lang} ??${result.sizeKB}KB`);
        return result.cdnUrl;
      }
    } catch (err: any) {
      console.warn(`[Dispatch] EC2 capture attempt ${attempt + 1} failed for ${template}/${format}/${lang}: ${err.message}`);
    }
    if (attempt === 0) await new Promise(r => setTimeout(r, 500));
  }

  throw new Error(`[Dispatch] EC2 capture failed for ${template}/${format}/${lang} ??no image after 2 attempts`);
}

/**
 * Capture carousel slides via EC2 Puppeteer ??Supabase CDN.
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

  // LIVE: EC2 capture each slide (resilient ??skip failures, retry once)
  const urls: string[] = [];
  for (let slide = 1; slide <= 6; slide++) {
    let result = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        result = await captureTemplate({
          template: 'carousel',
          format: 'carousel',
          data: { ...data, slide },
        });
        if (result?.cdnUrl) break;
      } catch (err: any) {
        console.warn(`[Dispatch] Carousel slide ${slide} attempt ${attempt + 1} failed: ${err.message}`);
      }
      if (attempt === 0) await new Promise(r => setTimeout(r, 500));
    }
    if (result?.cdnUrl) {
      urls.push(result.cdnUrl);
    } else {
      console.warn(`[Dispatch] Carousel slide ${slide} skipped after 2 attempts`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  if (urls.length === 0) {
    throw new Error(`[Dispatch] EC2 carousel capture failed ??all 6 slides failed`);
  }
  if (urls.length < 6) {
    console.warn(`[Dispatch] Carousel partial: ${urls.length}/6 slides captured`);
  }
  return urls;
}


function buildEducationThread(
  lc: ContentOutput['en'],
  lang: Lang,
  ctaUrl: string,
  ogImageUrl: string,
): ThreadSlide[] {
  const text = lc.platformText?.twitter || lc.text;

  // Split into ~4 thread slides
  const sentences = text.split(/[.!?。！？]\s+/).filter(s => s.trim());
  const chunkSize = Math.ceil(sentences.length / 3);

  const slide1Text = sentences.slice(0, chunkSize).join('. ') + '.';
  const slide2Text = sentences.slice(chunkSize, chunkSize * 2).join('. ') + '.';
  const slide3Text = sentences.slice(chunkSize * 2).join('. ') + '.';
  const slide4Text = `${ctaUrl}\n\n?�� RT if this changed how you think about market structure.`;

  return [
    { text: `?�� ${truncateForPlatform(slide1Text, 'twitter')}`, imageUrl: ogImageUrl },
    { text: truncateForPlatform(slide2Text, 'twitter') },
    { text: truncateForPlatform(slide3Text, 'twitter') },
    { text: truncateForPlatform(slide4Text, 'twitter'), imageUrl: ogImageUrl },
  ];
}

/**
 * Capture IG Story image (1080×1920) via dedicated story template.
 * Extracts spy/vix/gex/dp from content's imageUrl params and feeds to captureStoryImage.
 */
async function captureStoryForDispatch(
  baseUrl: string,
  content: ContentOutput,
  lang: Lang,
  dryRun: boolean,
): Promise<string | null> {
  const data = extractDataParams(content, lang, baseUrl);

  // Build story-specific params from existing content data
  const storyParams = {
    spy: data.spy || '0',
    vix: data.vix || '18',
    gex: String(data.gex || 'neutral'),
    dp: data.dp || '0',
    date: data.date as string | undefined,
    insight: data.insight as string | undefined,
  };

  if (dryRun) {
    const previewUrl = new URL(`${baseUrl}/marketing/templates/story`);
    Object.entries(storyParams).forEach(([k, v]) => {
      if (v != null) previewUrl.searchParams.set(k, String(v));
    });
    return previewUrl.toString();
  }

  try {
    const cdnUrl = await captureStoryImage(storyParams);
    if (cdnUrl) {
      console.log(`[Dispatch] ??IG Story captured: ${lang}`);
      return cdnUrl;
    }
    console.warn(`[Dispatch] IG Story capture returned null for ${lang}`);
    return null;
  } catch (err: any) {
    console.error(`[Dispatch] IG Story capture failed: ${err.message}`);
    return null;
  }
}

