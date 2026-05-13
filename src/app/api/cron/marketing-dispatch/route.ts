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
type Action = 'morning' | 'morning_ig' | 'midday' | 'education' | 'edu_bsky' | 'pulse' | 'pulse_ig' | 'event' | 'spotlight' | 'briefing_thread' | 'premarket_bsky' | 'premarket_threads' | 'intraday_bsky' | 'close_bsky' | 'close_threads' | 'structure_bsky' | 'insight_threads' | 'afterhours_bsky' | 'afterhours_threads' | 'asia_recap' | 'asia_insight' | 'asia_evening' | 'market_open' | 'asia_tip' | 'asia_preview' | 'weekly_recap' | 'trending_spotlight' | 'spacex_spotlight';
type Region = 'en' | 'asia' | 'all'; // en=EN only, asia=KO+JP, all=both

function getLangsForRegion(region: Region): Lang[] {
  switch (region) {
    case 'en':   return ['en'];
    case 'asia': return ['ko', 'ja'];
    case 'all':  return ['en', 'ko', 'ja'];
  }
}

// M7 ticker → company name for OG templates
const COMPANY_MAP: Record<string, string> = {
  NVDA: 'NVIDIA Corp', TSLA: 'Tesla Inc', AAPL: 'Apple Inc',
  MSFT: 'Microsoft Corp', GOOGL: 'Alphabet Inc', META: 'Meta Platforms',
  AMZN: 'Amazon.com Inc', SPY: 'SPDR S&P 500 ETF', QQQ: 'Invesco QQQ Trust',
};

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

        // Pinterest (EN only, SEO evergreen)
        const pinChMorn = getChannels({ tier: 'all', service: 'pinterest' })[0];
        if (pinChMorn && content.en?.text) {
          const seo = getPinterestSEO({ contentType: 'morning', date: dateKey });
          const ogForPin = await captureImageForDispatch(baseUrl, content, 'en', 'pin', 'morning', dryRun);
          const r = await dispatchPin({
            channelId: pinChMorn.id,
            imageUrl: ogForPin,
            title: seo.title,
            description: seo.description,
            link: `${baseUrl}/command?${buildUtm('pinterest', 'morning')}`,
            dryRun, draft,
          });
          results.push(r);
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

        // Pinterest (EN only) — vertical infographic pin
        const pinCh = getChannels({ tier: 'all', service: 'pinterest' })[0];
        if (pinCh) {
          const eduTopics = ['gex', 'dark_pool', 'smart_flow'];
          const topicIdx = new Date().getDate() % eduTopics.length;
          const pinTopic = eduTopics[topicIdx];
          const seo = getPinterestSEO({ contentType: 'education', educationTopic: pinTopic });

          // Capture vertical infographic pin (3 attempts + fallback)
          let pinImage = '';
          if (!dryRun) {
            for (let att = 0; att < 3 && !pinImage; att++) {
              try {
                const r = await captureTemplate({ template: 'education_pin', format: 'pin', data: { topic: pinTopic } });
                if (r?.cdnUrl) pinImage = r.cdnUrl;
              } catch (e: any) {
                console.warn(`[Education] Pin attempt ${att + 1}/3: ${e.message}`);
              }
              if (!pinImage && att < 2) await new Promise(r => setTimeout(r, att === 0 ? 3000 : 8000));
            }
            // Fallback to generic education template
            if (!pinImage) {
              console.warn('[Education] Pin failed 3x, falling back to generic education');
              try { pinImage = await captureImageForDispatch(baseUrl, content, 'en', 'pin', 'education', false); } catch {}
            }
          } else {
            pinImage = await captureImageForDispatch(baseUrl, content, 'en', 'pin', 'education', dryRun);
          }

          const r = await dispatchPin({
            channelId: pinCh.id,
            imageUrl: pinImage,
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

        // Additional Pinterest pin (different topic variant)
        const pinCh = getChannels({ tier: 'all', service: 'pinterest' })[0];
        if (pinCh) {
          const eduTopics = ['gex', 'dark_pool', 'smart_flow'];
          const topicIdx = (new Date().getDate() + 1) % eduTopics.length; // +1 offset from education dispatch
          const pinTopic = eduTopics[topicIdx];
          const seo = getPinterestSEO({ contentType: 'education', educationTopic: pinTopic });

          let pinImage = '';
          if (!dryRun) {
            for (let att = 0; att < 3 && !pinImage; att++) {
              try {
                const r = await captureTemplate({ template: 'education_pin', format: 'pin', data: { topic: pinTopic } });
                if (r?.cdnUrl) pinImage = r.cdnUrl;
              } catch (e: any) {
                console.warn(`[EduBsky] Pin attempt ${att + 1}/3: ${e.message}`);
              }
              if (!pinImage && att < 2) await new Promise(r => setTimeout(r, att === 0 ? 3000 : 8000));
            }
            if (!pinImage) {
              console.warn('[EduBsky] Pin failed 3x, falling back to generic education');
              try { pinImage = await captureImageForDispatch(baseUrl, content, 'en', 'pin', 'education', false); } catch {}
            }
          } else {
            pinImage = await captureImageForDispatch(baseUrl, content, 'en', 'pin', 'education', dryRun);
          }

          const r = await dispatchPin({
            channelId: pinCh.id,
            imageUrl: pinImage,
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

        // Pinterest (EN only)
        const pinChPM = getChannels({ tier: 'all', service: 'pinterest' })[0];
        if (pinChPM) {
          const seo = getPinterestSEO({ contentType: 'premarket', date: dateKey });
          const pmOg = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPin({
            channelId: pinChPM.id,
            imageUrl: pmOg,
            title: seo.title,
            description: seo.description,
            link: `${baseUrl}/flow?${buildUtm('pinterest', 'premarket')}`,
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

      // ========================================
      // STRUCTURE BSKY — 10:30 ET
      // Bluesky EN only — Mid-morning institutional analysis
      // ========================================
      case 'structure_bsky': {
        const mkt = await fetchLiveMarketData();
        const bskyCh = getChannels({ tier: 'all', lang: 'en', service: 'bluesky' })[0];
        if (bskyCh) {
          const text = buildRealtimeText('structure', 'bluesky', 'en', mkt);
          const ctaUrl = buildCtaUrl('en', 'command', 'structure');
          const tags = getHashtags({ platform: 'bluesky', contentType: 'intraday', lang: 'en' });
          const footer = `\n\n${ctaUrl}\n\n${tags}`;
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPost({
            channelId: bskyCh.id,
            text: truncateWithTags(text, footer, 'bluesky'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // INSIGHT THREADS — 10:45 ET
      // Threads EN/KO/JA — Data insight engagement
      // ========================================
      case 'insight_threads': {
        const mkt = await fetchLiveMarketData();
        for (const lang of langs) {
          const thCh = getChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (!thCh) continue;
          const text = buildRealtimeText('structure', 'threads', lang, mkt);
          const tags = getHashtags({ platform: 'threads', contentType: 'intraday', lang });
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPost({
            channelId: thCh.id,
            text: truncateWithTags(text, tags, 'threads'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }

        // Pinterest (EN only)
        const pinChInsight = getChannels({ tier: 'all', service: 'pinterest' })[0];
        if (pinChInsight) {
          const seo = getPinterestSEO({ contentType: 'intraday', date: dateKey });
          const insightOg = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPin({
            channelId: pinChInsight.id,
            imageUrl: insightOg,
            title: seo.title,
            description: seo.description,
            link: `${baseUrl}/command?${buildUtm('pinterest', 'insight')}`,
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // AFTERHOURS BSKY — 18:30 ET
      // Bluesky EN only — Session debrief
      // ========================================
      case 'afterhours_bsky': {
        const mkt = await fetchLiveMarketData();
        const bskyCh = getChannels({ tier: 'all', lang: 'en', service: 'bluesky' })[0];
        if (bskyCh) {
          const text = buildRealtimeText('afterhours', 'bluesky', 'en', mkt);
          const ctaUrl = buildCtaUrl('en', 'guardian', 'afterhours');
          const tags = getHashtags({ platform: 'bluesky', contentType: 'close', lang: 'en' });
          const footer = `\n\n${ctaUrl}\n\n${tags}`;
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPost({
            channelId: bskyCh.id,
            text: truncateWithTags(text, footer, 'bluesky'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // AFTERHOURS THREADS — 18:15 ET
      // Threads EN/KO/JA — Session recap engagement
      // ========================================
      case 'afterhours_threads': {
        const mkt = await fetchLiveMarketData();
        for (const lang of langs) {
          const thCh = getChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (!thCh) continue;
          const text = buildRealtimeText('afterhours', 'threads', lang, mkt);
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

      // ========================================
      // ASIA RECAP — UTC 02:30 (KST 11:30 / ET 22:30)
      // Threads KO/JA only — Overnight US session recap
      // ========================================
      case 'asia_recap': {
        const mkt = await fetchLiveMarketData();
        for (const lang of langs) {
          if (lang === 'en') continue; // Asia-only
          const thCh = getChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (!thCh) continue;
          const text = buildRealtimeText('recap', 'threads', lang, mkt);
          const tags = getHashtags({ platform: 'threads', contentType: 'pulse', lang });
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
      // ASIA INSIGHT — UTC 05:00 (KST 14:00 / ET 01:00)
      // Threads KO/JA only — Afternoon data insight
      // ========================================
      case 'asia_insight': {
        const mkt = await fetchLiveMarketData();
        for (const lang of langs) {
          if (lang === 'en') continue; // Asia-only
          const thCh = getChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (!thCh) continue;
          const text = buildRealtimeText('asia_insight', 'threads', lang, mkt);
          const tags = getHashtags({ platform: 'threads', contentType: 'education', lang });
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
      // ASIA TIP — UTC 07:30 (KST 16:30 / ET 03:30)
      // Threads KO/JA only — Afternoon educational tip
      // ========================================
      case 'asia_tip': {
        const mkt = await fetchLiveMarketData();
        for (const lang of langs) {
          if (lang === 'en') continue;
          const thCh = getChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (!thCh) continue;
          const text = buildRealtimeText('asia_tip', 'threads', lang, mkt);
          const tags = getHashtags({ platform: 'threads', contentType: 'education', lang });
          const r = await dispatchPost({
            channelId: thCh.id,
            text: truncateWithTags(text, tags, 'threads'),
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // ASIA PREVIEW — UTC 09:00 (KST 18:00 / ET 05:00)
      // Threads KO/JA only — Pre-session preview
      // ========================================
      case 'asia_preview': {
        const mkt = await fetchLiveMarketData();
        for (const lang of langs) {
          if (lang === 'en') continue;
          const thCh = getChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (!thCh) continue;
          const text = buildRealtimeText('asia_preview', 'threads', lang, mkt);
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
      // ASIA EVENING — UTC 11:30 (KST 20:30 / ET 07:30)
      // Threads KO/JA only — Evening engagement
      // ========================================
      case 'asia_evening': {
        const mkt = await fetchLiveMarketData();
        for (const lang of langs) {
          if (lang === 'en') continue;
          const thCh = getChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (!thCh) continue;
          const text = buildRealtimeText('asia_evening', 'threads', lang, mkt);
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
      // MARKET OPEN — UTC 13:30 (KST 22:30 / ET 09:30)
      // Threads KO/JA + Bluesky EN
      // ========================================
      case 'market_open': {
        const mkt = await fetchLiveMarketData();
        // Threads KO/JA
        for (const lang of langs) {
          if (lang === 'en') continue;
          const thCh = getChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (!thCh) continue;
          const text = buildRealtimeText('market_open', 'threads', lang, mkt);
          const tags = getHashtags({ platform: 'threads', contentType: 'intraday', lang });
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPost({
            channelId: thCh.id,
            text: truncateWithTags(text, tags, 'threads'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }
        // Bluesky EN
        const bskyCh = getChannels({ tier: 'all', lang: 'en', service: 'bluesky' })[0];
        if (bskyCh) {
          const text = buildRealtimeText('market_open', 'bluesky', 'en', mkt);
          const ctaUrl = buildCtaUrl('en', 'command', 'market_open');
          const tags = getHashtags({ platform: 'bluesky', contentType: 'intraday', lang: 'en' });
          const footer = `\n\n${ctaUrl}\n\n${tags}`;
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPost({
            channelId: bskyCh.id,
            text: truncateWithTags(text, footer, 'bluesky'),
            imageUrl: ogImage,
            dryRun, draft,
          });
          results.push(r);
        }
        // Pinterest
        const pinChOpen = getChannels({ tier: 'all', service: 'pinterest' })[0];
        if (pinChOpen) {
          const seo = getPinterestSEO({ contentType: 'intraday', date: dateKey });
          const ogImage = await captureRealtimeOG(baseUrl, mkt, 'og', dryRun);
          const r = await dispatchPin({
            channelId: pinChOpen.id,
            imageUrl: ogImage,
            title: seo.title,
            description: seo.description,
            link: `${baseUrl}/command?${buildUtm('pinterest', 'market_open')}`,
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // SPACEX SPOTLIGHT — $TSLA Proxy × SpaceX IPO Analysis
      // Special event-driven dispatch (manual or scheduled)
      // ========================================
      case 'spacex_spotlight': {
        // Fetch live $TSLA data from Redis (same key as spotlight)
        const tslaRaw = await getFromCache('stockData:TSLA').catch(() => null);
        const tslaData = tslaRaw ? (typeof tslaRaw === 'string' ? JSON.parse(tslaRaw) : tslaRaw) : {};
        const tslaPrice = tslaData?.price || tslaData?.lastPrice || 0;
        const tslaChange = tslaData?.changePct || tslaData?.pctChange || 0;
        const tslaDp = tslaData?.darkPoolPct || tslaData?.dp || 0;
        const tslaWhale = tslaData?.whaleIndex || tslaData?.smartFlow || 50;
        const tslaGex = (tslaData?.gexRegime || tslaData?.gex || 'neutral').toLowerCase();
        const tslaPremium = tslaData?.netPremium || tslaData?.premium || '';

        const hookIdx = new Date().getHours() % 3;

        for (const lang of langs) {
          // 5-Layer content: Hook → Data → Meaning → Implication → CTA
          const textMap: Record<string, string> = {
            en: [
              [`🚀 SpaceX IPO — S-1 filing expected this week.\nBut here's what nobody is tracking:`,
               `🚀 SpaceX IPO could be the largest in history ($1.75T).\nEvery trader is watching. But the smart money is already moving:`,
               `🚀 SpaceX IPO is reshaping institutional positioning.\n$TSLA is the only public proxy. Here's what the structure shows:`][hookIdx],
              '',
              `▸ $TSLA Dark Pool: ${tslaDp}%`,
              `▸ $TSLA Smart Flow: ${tslaWhale}/100`,
              `▸ $TSLA GEX Regime: ${tslaGex.toUpperCase()}`,
              '',
              `$TSLA remains the primary SpaceX proxy.`,
              `When institutions position in $TSLA ahead of a SpaceX catalyst, it reveals conviction level.`,
              '',
              `Observation only — not financial advice.`,
            ].join('\n'),
            ko: [
              [`🚀 SpaceX IPO — S-1 공개가 이번 주 예상됩니다.\n하지만 아무도 추적하지 않는 것이 있습니다:`,
               `🚀 SpaceX IPO — 역사상 최대 ($1.75조) 상장 예정.\n모든 트레이더가 주목합니다. 하지만 스마트머니는 이미 움직이고 있습니다:`,
               `🚀 SpaceX IPO가 기관 포지셔닝을 재편하고 있습니다.\n$TSLA가 유일한 프록시입니다. 구조가 보여주는 것:`][hookIdx],
              '',
              `▸ $TSLA 다크풀: ${tslaDp}%`,
              `▸ $TSLA 스마트 플로우: ${tslaWhale}/100`,
              `▸ $TSLA GEX 레짐: ${tslaGex.toUpperCase()}`,
              '',
              `$TSLA는 SpaceX의 유일한 공개 프록시입니다.`,
              `기관이 SpaceX 촉매제 앞에서 $TSLA에 포지셔닝할 때, 그것은 확신 수준을 보여줍니다.`,
              '',
              `*본 정보는 투자 권유가 아닌 데이터 분석 참고 자료입니다.`,
            ].join('\n'),
            ja: [
              [`🚀 SpaceX IPO — S-1提出が今週予想されています。\nしかし誰も追跡していないことがあります:`,
               `🚀 SpaceX IPO — 史上最大（$1.75兆）の上場予定。\nすべてのトレーダーが注目。しかしスマートマネーはすでに動いています:`,
               `🚀 SpaceX IPOが機関のポジショニングを再編しています。\n$TSLAが唯一のプロキシです。構造が示すもの:`][hookIdx],
              '',
              `▸ $TSLA ダークプール: ${tslaDp}%`,
              `▸ $TSLA スマートフロー: ${tslaWhale}/100`,
              `▸ $TSLA GEXレジーム: ${tslaGex.toUpperCase()}`,
              '',
              `$TSLAはSpaceXの唯一の公開プロキシです。`,
              `機関がSpaceXの触媒前に$TSLAにポジションを取る時、それは確信度を示します。`,
              '',
              `*投資助言ではありません。データ分析の参考資料です。`,
            ].join('\n'),
          };
          const text = textMap[lang] || textMap.en;
          const ctaUrl = buildCtaUrl(lang, 'command', 'spacex_ipo');

          // Capture OG with real TSLA data
          let ogImage = '';
          if (!dryRun) {
            const premFmt = typeof tslaPremium === 'number' ? `${tslaPremium >= 0 ? '+' : ''}$${Math.abs(tslaPremium / 1e6).toFixed(1)}M` : String(tslaPremium || '');
            const ogData = {
              dp: tslaDp, whale: String(tslaWhale), gex: tslaGex,
              price: String(tslaPrice), change: tslaChange, premium: premFmt, date: dateKey,
            };
            for (let att = 0; att < 3 && !ogImage; att++) {
              try {
                const r = await captureTemplate({ template: 'spacex_ipo', format: 'tweet', data: ogData });
                if (r?.cdnUrl) ogImage = r.cdnUrl;
              } catch (e: any) { console.warn(`[SpaceX] OG attempt ${att + 1}: ${e.message}`); }
              if (!ogImage && att < 2) await new Promise(r => setTimeout(r, att === 0 ? 3000 : 8000));
            }
          }

          // X Thread (4 slides)
          const twitterCh = getChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'spotlight', lang, tickers: ['TSLA'] });
            const lines = text.split('\n').filter(l => l.trim());
            const slides: { text: string; imageUrl?: string }[] = [];
            // Slide 1: Hook + image
            slides.push({ text: `${tags} #SpaceXIPO\n\n${lines.slice(0, 2).join('\n')}`, imageUrl: ogImage || undefined });
            // Slide 2: Data
            slides.push({ text: lines.slice(2, 6).join('\n') });
            // Slide 3: Meaning
            slides.push({ text: lines.slice(6, 9).join('\n') });
            // Slide 4: CTA
            slides.push({ text: `📊 ${lang === 'ko' ? '$TSLA 기관 구조 실시간 추적' : lang === 'ja' ? '$TSLA 機関構造リアルタイム追跡' : 'Track $TSLA institutional structure live'} → ${ctaUrl}\n\n${lines[lines.length - 1]}` });
            const r = await dispatchThread({ channelId: twitterCh.id, slides, dryRun, draft });
            results.push(r);
          }

          // Bsky
          const bskyCh = getChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'spotlight', lang, tickers: ['TSLA'] });
            const r = await dispatchPost({ channelId: bskyCh.id, text: truncateWithTags(text, `${tags} #SpaceXIPO`, 'bluesky'), imageUrl: ogImage, dryRun, draft });
            results.push(r);
          }

          // Threads
          const threadsCh = getChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (threadsCh) {
            const tags = getHashtags({ platform: 'threads', contentType: 'spotlight', lang, tickers: ['TSLA'] });
            const r = await dispatchPost({ channelId: threadsCh.id, text: truncateWithTags(text, tags, 'threads'), imageUrl: ogImage, dryRun, draft });
            results.push(r);
          }
        }

        // Pinterest pin
        const pinCh = getChannels({ tier: 'all', lang: 'en', service: 'pinterest' })[0];
        if (pinCh) {
          let pinImage = '';
          if (!dryRun) {
            for (let att = 0; att < 3 && !pinImage; att++) {
              try {
                const r = await captureTemplate({ template: 'spacex_ipo', format: 'tweet', data: { dp: tslaDp, whale: String(tslaWhale), gex: tslaGex, date: dateKey } });
                if (r?.cdnUrl) pinImage = r.cdnUrl;
              } catch {}
              if (!pinImage && att < 2) await new Promise(r => setTimeout(r, 3000));
            }
          }
          const r = await dispatchPin({
            channelId: pinCh.id,
            imageUrl: pinImage,
            title: `SpaceX IPO 2026: What $TSLA Dark Pool Data Reveals About Institutional Positioning`,
            description: `SpaceX IPO analysis using $TSLA as a proxy. Dark Pool ${tslaDp}%, Smart Flow ${tslaWhale}/100, GEX ${tslaGex.toUpperCase()}. Institutional structure analysis by SIGNUM HQ. Not financial advice. #SpaceXIPO #TSLA #DarkPool #SignumHQ`,
            link: `${baseUrl}/command?${buildUtm('pinterest', 'spacex_ipo')}`,
            dryRun, draft,
          });
          results.push(r);
        }
        break;
      }

      // ========================================
      // WEEKLY RECAP — 주말 주간 요약 Thread
      // Saturday 10:00 ET = Sunday 00:00 KST
      // ========================================
      case 'weekly_recap': {
        // Build weekly recap from Redis cached data
        const weeklyKey = `guardian:weekly_recap`;
        const weeklyRaw = await getFromCache(weeklyKey).catch(() => null);

        // Fallback: build from available data if no dedicated weekly recap
        const mktData = await fetchLiveMarketData();
        const rlsiRaw = await getFromCache('rlsi:current').catch(() => null);
        const rlsiVal = typeof rlsiRaw === 'string' ? parseInt(rlsiRaw, 10) : (typeof rlsiRaw === 'number' ? rlsiRaw : 50);

        // Get top movers from spotlight dedup set
        const spotlightHistory = await getFromCache('marketing:spotlight:weekly_tickers').catch(() => null);
        const weekTickers = spotlightHistory ? (typeof spotlightHistory === 'string' ? JSON.parse(spotlightHistory) : spotlightHistory) : [];

        const hookIdx = new Date().getDate() % 3;
        const weekDateRange = (() => {
          const now = new Date();
          const fri = new Date(now); fri.setDate(now.getDate() - (now.getDay() === 0 ? 2 : 1));
          const mon = new Date(fri); mon.setDate(fri.getDate() - 4);
          return `${mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${fri.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        })();

        for (const lang of langs) {
          const slides: { text: string; imageUrl?: string }[] = [];

          // Slide 1: Weekly hook
          const weeklyHooks: Record<string, string[]> = {
            en: [
              `📊 Weekly Structural Review — ${weekDateRange}\n\nEvery week, we distill 7 institutional data sources into one clarity report.\nHere's what the structure revealed:`,
              `📊 Week in Review — ${weekDateRange}\n\nPrice tells you what happened.\nStructure tells you why.\nOur weekly institutional analysis:`,
              `📊 Weekly Intelligence — ${weekDateRange}\n\nWhat did smart money do this week?\nOur AI analyzed dark pool, GEX, and flow data across M7:`,
            ],
            ko: [
              `📊 주간 구조 리뷰 — ${weekDateRange}\n\n매주 7개 기관 데이터를 하나의 인사이트로 압축합니다.\n이번 주 구조가 보여준 것:`,
              `📊 주간 리뷰 — ${weekDateRange}\n\n가격은 일어난 일을 말합니다.\n구조는 왜 일어났는지를 말합니다.\n이번 주 기관 분석:`,
              `📊 주간 인텔리전스 — ${weekDateRange}\n\n이번 주 스마트머니는 무엇을 했을까?\nM7 다크풀, GEX, 플로우 AI 분석:`,
            ],
            ja: [
              `📊 週間構造レビュー — ${weekDateRange}\n\n毎週7つの機関データを1つの洞察に凝縮します。\n今週の構造が示したもの:`,
              `📊 週間レビュー — ${weekDateRange}\n\n価格は何が起きたかを語ります。\n構造はなぜ起きたかを語ります。\n今週の機関分析:`,
              `📊 週間インテリジェンス — ${weekDateRange}\n\n今週スマートマネーは何をしたのか？\nM7ダークプール・GEX・フローのAI分析:`,
            ],
          };
          slides.push({ text: (weeklyHooks[lang] || weeklyHooks.en)[hookIdx] });

          // Slide 2: Key metrics summary
          const G = mktData.gex.toUpperCase();
          const riskLabel = rlsiVal >= 70 ? (lang === 'ko' ? '저위험' : lang === 'ja' ? '低リスク' : 'LOW RISK')
            : rlsiVal >= 50 ? (lang === 'ko' ? '보통' : lang === 'ja' ? '通常' : 'MODERATE')
            : (lang === 'ko' ? '주의' : lang === 'ja' ? '注意' : 'ELEVATED');
          const metricsText = lang === 'ko'
            ? `▸ RLSI: ${rlsiVal}/100 — ${riskLabel}\n▸ GEX 레짐: ${G}\n▸ VIX: ${mktData.vix.toFixed(1)}\n▸ 다크풀 DP%: ${mktData.dp.toFixed(1)}%`
            : lang === 'ja'
            ? `▸ RLSI: ${rlsiVal}/100 — ${riskLabel}\n▸ GEXレジーム: ${G}\n▸ VIX: ${mktData.vix.toFixed(1)}\n▸ ダークプール DP%: ${mktData.dp.toFixed(1)}%`
            : `▸ RLSI: ${rlsiVal}/100 — ${riskLabel}\n▸ GEX Regime: ${G}\n▸ VIX: ${mktData.vix.toFixed(1)}\n▸ Dark Pool DP%: ${mktData.dp.toFixed(1)}%`;
          slides.push({ text: metricsText });

          // Slide 3: CTA
          const ctaUrl = buildCtaUrl(lang, 'command', 'weekly_recap');
          const ctaText = lang === 'ko'
            ? `가격만 보면 반쪽입니다.\n구조를 봐야 전체가 보입니다.\n\n📊 실시간 구조 분석 → ${ctaUrl}\n\n*본 정보는 투자 권유가 아닌 데이터 분석 참고 자료입니다.`
            : lang === 'ja'
            ? `価格だけでは半分です。\n構造を見れば全体が見えます。\n\n📊 リアルタイム構造分析 → ${ctaUrl}\n\n*投資助言ではありません。データ分析の参考資料です。`
            : `Price is half the story.\nStructure reveals the full picture.\n\n📊 Live structure → ${ctaUrl}\n\nObservation only — not financial advice.`;
          slides.push({ text: ctaText });

          // Capture OG for slide 1
          let ogImage = '';
          if (!dryRun) {
            for (let att = 0; att < 3 && !ogImage; att++) {
              try {
                const r = await captureTemplate({ template: 'briefing', format: 'tweet', data: { spy: mktData.spyChg, vix: mktData.vix, gex: mktData.gex, rlsi: rlsiVal, date: weekDateRange } });
                if (r?.cdnUrl) ogImage = r.cdnUrl;
              } catch (e: any) { console.warn(`[WeeklyRecap] OG attempt ${att + 1}: ${e.message}`); }
              if (!ogImage && att < 2) await new Promise(r => setTimeout(r, att === 0 ? 3000 : 8000));
            }
          }
          if (ogImage) slides[0].imageUrl = ogImage;

          // X Thread
          const twitterCh = getChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'pulse', lang });
            slides[0].text = `${tags}\n\n${slides[0].text}`;
            const r = await dispatchThread({ channelId: twitterCh.id, slides, dryRun, draft });
            results.push(r);
          }

          // Bsky Thread
          const bskyCh = getChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'pulse', lang });
            slides[0].text = slides[0].text.includes('#') ? slides[0].text : `${tags}\n\n${slides[0].text}`;
            const r = await dispatchThread({ channelId: bskyCh.id, slides, dryRun, draft });
            results.push(r);
          }
        }
        break;
      }

      // ========================================
      // TRENDING SPOTLIGHT — $캐시태그 트렌딩 종목 자동 감지
      // Weekdays: intraday시간대에 추가 발행
      // ========================================
      case 'trending_spotlight': {
        // Fetch all M7 + top tickers and find the biggest mover
        const TRENDING_TICKERS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'SPY', 'QQQ'];
        let bestTicker = '';
        let bestAbsChange = 0;
        let bestData: any = null;

        for (const t of TRENDING_TICKERS) {
          try {
            const raw = await getFromCache(`ticker:${t}`).catch(() => null);
            if (!raw) continue;
            const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const absChg = Math.abs(d?.changePercent ?? d?.changePct ?? 0);
            if (absChg > bestAbsChange) {
              bestAbsChange = absChg;
              bestTicker = t;
              bestData = d;
            }
          } catch { /* skip */ }
        }

        // Only post if there's meaningful movement (> 1.5%)
        if (!bestTicker || bestAbsChange < 1.5 || !bestData) {
          console.log(`[TrendingSpotlight] No significant mover (best: ${bestTicker} ${bestAbsChange.toFixed(2)}%). Skipping.`);
          return NextResponse.json({ success: true, action, results: [], note: 'No trending ticker above threshold' });
        }

        // Check dedup: don't post same ticker twice in a day
        const dedupKey = `marketing:trending:${dateKey}`;
        const alreadyPosted = await getFromCache(dedupKey).catch(() => null);
        const postedSet: string[] = alreadyPosted ? (typeof alreadyPosted === 'string' ? JSON.parse(alreadyPosted) : alreadyPosted) : [];
        if (postedSet.includes(bestTicker)) {
          console.log(`[TrendingSpotlight] ${bestTicker} already posted today. Skipping.`);
          return NextResponse.json({ success: true, action, results: [], note: `${bestTicker} already posted` });
        }

        // Build trending spotlight post (reuse spotlight content pattern)
        const ticker = bestTicker;
        const price = bestData?.price ?? bestData?.last ?? 0;
        const change = bestData?.changePercent ?? bestData?.changePct ?? 0;
        const changeFmt = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
        const dp = bestData?.darkPoolPercent ?? bestData?.dp ?? 0;
        const whaleIdx = bestData?.whaleIndex ?? bestData?.smartFlow ?? 50;
        const gex = bestData?.gexRegime ?? bestData?.gex ?? 'neutral';

        for (const lang of langs) {
          const text = lang === 'ko'
            ? `🔥 $${ticker} ${changeFmt} — 오늘 가장 큰 움직임\n\n▸ 다크풀: ${dp}%\n▸ 스마트 플로우: ${whaleIdx}/100\n▸ GEX: ${gex.toUpperCase()}\n\n대부분이 가격만 봅니다. 구조를 보면 다른 이야기가 보입니다.\n\n*본 정보는 투자 권유가 아닌 데이터 분석 참고 자료입니다.`
            : lang === 'ja'
            ? `🔥 $${ticker} ${changeFmt} — 本日最大の動き\n\n▸ ダークプール: ${dp}%\n▸ スマートフロー: ${whaleIdx}/100\n▸ GEX: ${gex.toUpperCase()}\n\n価格だけでは半分です。構造を見れば全体が見えます。\n\n*投資助言ではありません。データ分析の参考資料です。`
            : `🔥 $${ticker} ${changeFmt} — Biggest move today\n\n▸ Dark Pool: ${dp}%\n▸ Smart Flow: ${whaleIdx}/100\n▸ GEX: ${gex.toUpperCase()}\n\nEveryone sees the price move. The structure tells a different story.\n\nObservation only — not financial advice.`;

          // Capture OG
          let ogImage = '';
          if (!dryRun) {
            const spotlightParams = { t: ticker, price: String(price), change, dp, whale: String(whaleIdx), gex: gex.toLowerCase(), date: dateKey };
            for (let att = 0; att < 3 && !ogImage; att++) {
              try {
                const r = await captureTemplate({ template: 'ticker', format: 'tweet', data: spotlightParams });
                if (r?.cdnUrl) ogImage = r.cdnUrl;
              } catch (e: any) { console.warn(`[TrendingSpotlight] OG attempt ${att + 1}: ${e.message}`); }
              if (!ogImage && att < 2) await new Promise(r => setTimeout(r, att === 0 ? 3000 : 8000));
            }
          }

          // X Tweet
          const twitterCh = getChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'spotlight', lang, tickers: [ticker] });
            const r = await dispatchTweet({ channelId: twitterCh.id, text: truncateWithTags(text, tags, 'twitter'), imageUrl: ogImage, dryRun, draft });
            results.push(r);
          }

          // Bsky
          const bskyCh = getChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'spotlight', lang, tickers: [ticker] });
            const r = await dispatchPost({ channelId: bskyCh.id, text: truncateWithTags(text, tags, 'bluesky'), imageUrl: ogImage, dryRun, draft });
            results.push(r);
          }

          // Threads
          const threadsCh = getChannels({ tier: 'all', lang, service: 'threads' })[0];
          if (threadsCh) {
            const tags = getHashtags({ platform: 'threads', contentType: 'spotlight', lang, tickers: [ticker] });
            const r = await dispatchPost({ channelId: threadsCh.id, text: truncateWithTags(text, tags, 'threads'), imageUrl: ogImage, dryRun, draft });
            results.push(r);
          }
        }

        // Mark as posted today
        if (!dryRun) {
          postedSet.push(bestTicker);
          await setInCache(dedupKey, JSON.stringify(postedSet), 86400).catch(() => {});
          // Also track for weekly recap
          const weeklyKey = 'marketing:spotlight:weekly_tickers';
          const weeklyRaw = await getFromCache(weeklyKey).catch(() => null);
          const weeklyArr: string[] = weeklyRaw ? (typeof weeklyRaw === 'string' ? JSON.parse(weeklyRaw) : weeklyRaw) : [];
          if (!weeklyArr.includes(bestTicker)) weeklyArr.push(bestTicker);
          await setInCache(weeklyKey, JSON.stringify(weeklyArr), 7 * 86400).catch(() => {});
        }
        break;
      }

      // ========================================
      // BRIEFING THREAD — Guardian AI Morning Briefing → X/Bsky Thread
      // Asia: KST 08:00 / EN: ET 07:00
      // ========================================
      case 'briefing_thread': {
        for (const lang of langs) {
          // Load Guardian briefing from Redis
          const briefingKey = `guardian:morning_briefing:${lang}`;
          const briefingRaw = await getFromCache(briefingKey).catch(() => null);
          if (!briefingRaw) {
            console.warn(`[Dispatch] No briefing found for ${lang}`);
            continue;
          }
          const briefing = typeof briefingRaw === 'string' ? JSON.parse(briefingRaw) : briefingRaw;
          const briefingText = briefing.briefing || briefing.text || '';
          if (!briefingText || briefingText.length < 50) continue;

          // Split into Thread slides (2-3 sentences each)
          const sentences = briefingText.match(/[^.!?]+[.!?]+/g) || [briefingText];
          const slides: ThreadSlide[] = [];
          const ctaUrl = buildCtaUrl(lang, 'guardian', 'briefing');

          // Slide 1: FOMO Hook + first 2 sentences (differentiation-first)
          const hookIdx = new Date().getDay() % 3;
          const hooks: Record<string, string[]> = {
            en: [
              `🌅 Morning Briefing — AI × 7 Data Sources\n\nWhat did institutions position for overnight?\nHere's what our AI found analyzing RLSI, GEX, and dark pool data:\n`,
              `🌅 Morning Briefing\n\nEvery morning, our AI reads 7 institutional data feeds that most retail traders never see.\nToday's structure:\n`,
              `🌅 Morning Briefing\n\nPrice tells you what happened yesterday.\nStructure tells you what's coming.\nHere's today's institutional read:\n`,
            ],
            ko: [
              `🌅 모닝 브리핑 — AI × 7개 데이터 소스\n\n밤새 기관은 어디에 포지셔닝했을까?\nRLSI, GEX, 다크풀을 종합한 AI 분석:\n`,
              `🌅 모닝 브리핑\n\n매일 아침, AI가 일반 투자자가 볼 수 없는 7개 기관 데이터를 분석합니다.\n오늘의 구조:\n`,
              `🌅 모닝 브리핑\n\n가격은 어제를 말합니다.\n구조는 내일을 보여줍니다.\n오늘의 기관 분석:\n`,
            ],
            ja: [
              `🌅 モーニングブリーフィング — AI × 7データソース\n\n一晩で機関はどこにポジションを取ったのか？\nRLSI・GEX・ダークプールのAI分析:\n`,
              `🌅 モーニングブリーフィング\n\n毎朝、AIが個人投資家が見ることのない7つの機関データを分析します。\n本日の構造:\n`,
              `🌅 モーニングブリーフィング\n\n価格は昨日を語ります。\n構造は明日を見せます。\n本日の機関分析:\n`,
            ],
          };
          const slide1Text = `${(hooks[lang] || hooks.en)[hookIdx]}${sentences.slice(0, 2).join(' ').trim()}`;
          slides.push({ text: slide1Text });

          // Slide 2: Middle sentences (news & catalysts)
          if (sentences.length > 2) {
            const midSentences = sentences.slice(2, Math.min(5, sentences.length));
            slides.push({ text: midSentences.join(' ').trim() });
          }

          // Slide 3: Risk assessment + CTA
          if (sentences.length > 5) {
            const endSentences = sentences.slice(5);
            const ctaLine = lang === 'ko' ? '\n\n전체 분석 확인' : lang === 'ja' ? '\n\n詳細分析はこちら' : '\n\nFull analysis';
            slides.push({ text: `${endSentences.join(' ').trim()}${ctaLine}: ${ctaUrl}` });
          } else if (slides.length > 0) {
            // Add CTA to last slide
            slides[slides.length - 1].text += `\n\n${ctaUrl}`;
          }

          // Capture Briefing OG with RLSI chart (aggressive retry + fallback)
          const mktData = await fetchLiveMarketData();
          let ogImage = '';
          if (!dryRun) {
            const rlsiRaw = await getFromCache('rlsi:current').catch(() => null);
            const rlsiHistRaw = await getFromCache('rlsi:history:5d').catch(() => null);
            const rlsiVal = typeof rlsiRaw === 'string' ? parseInt(rlsiRaw, 10) : (typeof rlsiRaw === 'number' ? rlsiRaw : 50);
            const rlsiHist = typeof rlsiHistRaw === 'string' ? rlsiHistRaw : `${rlsiVal-6},${rlsiVal-2},${rlsiVal+1},${rlsiVal-3},${rlsiVal}`;
            const briefingData = {
              spy: mktData.spyChg, vix: mktData.vix, gex: mktData.gex,
              rlsi: rlsiVal, rlsi_hist: rlsiHist,
              date: mktData.date, preview: briefingText.substring(0, 200),
            };
            // 3 attempts with escalating backoff
            for (let att = 0; att < 3 && !ogImage; att++) {
              try {
                const r = await captureTemplate({ template: 'briefing', format: 'tweet', data: briefingData });
                if (r?.cdnUrl) ogImage = r.cdnUrl;
              } catch (e: any) {
                console.warn(`[Dispatch] Briefing OG attempt ${att + 1}/3: ${e.message}`);
              }
              if (!ogImage && att < 2) await new Promise(r => setTimeout(r, att === 0 ? 3000 : 8000));
            }
            // Fallback: pulse OG (still better than no image)
            if (!ogImage) {
              console.warn('[Dispatch] Briefing OG failed 3x, falling back to pulse OG');
              try {
                const fb = await captureTemplate({ template: 'pulse', format: 'tweet', data: { spy: mktData.spyChg, vix: mktData.vix, gex: mktData.gex, date: mktData.date } });
                if (fb?.cdnUrl) ogImage = fb.cdnUrl;
              } catch {}
            }
          }
          if (ogImage) slides[0].imageUrl = ogImage;

          // X Thread
          const twitterCh = getChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'briefing', lang });
            // Add $cashtags to first slide
            slides[0].text = `${tags}\n\n${slides[0].text}`;
            const r = await dispatchThread({
              channelId: twitterCh.id,
              slides,
              dryRun, draft,
            });
            results.push(r);
          }

          // Bluesky Thread
          const bskyCh = getChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'briefing', lang });
            const bskySlides = slides.map((s, i) => ({
              ...s,
              text: i === 0 ? `${tags}\n\n${s.text}` : s.text,
            }));
            const r = await dispatchThread({
              channelId: bskyCh.id,
              slides: bskySlides,
              dryRun, draft,
            });
            results.push(r);
          }
        }
        break;
      }

      // ========================================
      // SPOTLIGHT — Ticker Deep-Dive (M7 Rotation)
      // Asia: KST 10:00 / EN: KST 23:00
      // ========================================
      case 'spotlight': {
        // Pick ticker: rotate through M7, dedup via Redis
        const SPOTLIGHT_POOL = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN'];
        const dedupKey = `marketing:spotlight:last:${dateKey}`;
        const lastTicker = await getFromCache(dedupKey).catch(() => null) as string | null;
        let ticker = SPOTLIGHT_POOL[Math.floor(Math.random() * SPOTLIGHT_POOL.length)];
        // Avoid repeating last ticker
        if (lastTicker && typeof lastTicker === 'string') {
          const filtered = SPOTLIGHT_POOL.filter(t => t !== lastTicker);
          ticker = filtered[Math.floor(Math.random() * filtered.length)];
        }
        await setInCache(dedupKey, ticker, 86400);

        // Fetch ticker data from Redis
        const tickerDataRaw = await getFromCache(`stockData:${ticker}`).catch(() => null);
        const tickerData = typeof tickerDataRaw === 'string' ? JSON.parse(tickerDataRaw) : tickerDataRaw;

        for (const lang of langs) {
          const dp = tickerData?.darkPoolPct || tickerData?.dp || 'N/A';
          const whaleIdx = tickerData?.whaleIndex || tickerData?.smartFlow || 'N/A';
          const price = tickerData?.price || tickerData?.lastPrice || 'N/A';
          const change = tickerData?.changePct || tickerData?.pctChange || 0;
          const gex = tickerData?.gexRegime || tickerData?.gex || 'neutral';
          const changeFmt = `${change >= 0 ? '+' : ''}${typeof change === 'number' ? change.toFixed(2) : change}%`;

          // Smart Flow interpretation (directional signal)
          const whaleNum = typeof whaleIdx === 'number' ? whaleIdx : parseInt(String(whaleIdx)) || 50;
          const flowSignal = whaleNum >= 65 ? { en: 'Accumulation pattern observed', ko: '매집 패턴 관찰', ja: '集積パターン観察' }
            : whaleNum <= 35 ? { en: 'Distribution pattern observed', ko: '분산 패턴 관찰', ja: '分配パターン観察' }
            : { en: 'Neutral positioning', ko: '중립 포지셔닝', ja: '中立ポジショニング' };

          // DP interpretation
          const dpNum = typeof dp === 'number' ? dp : parseFloat(String(dp)) || 0;
          const dpSignal = dpNum >= 40 ? { en: 'Heavy institutional activity', ko: '기관 활발 활동', ja: '機関活発な活動' }
            : { en: 'Standard institutional flow', ko: '기관 정상 흐름', ja: '機関通常フロー' };

          // Hook rotation (3 variants per lang)
          const hookIdx = new Date().getDate() % 3;

          const textMap: Record<string, string> = {
            en: [
              // Hook
              [`$${ticker} at $${price} (${changeFmt}). Everyone sees the price. Here's what most miss:`,
               `$${ticker} ${changeFmt} — the headline. But the institutional footprint tells the real story:`,
               `What are institutions doing with $${ticker} right now? The data reveals:`][hookIdx],
              '',
              // Data + Meaning
              `▸ Dark Pool: ${dp}% — ${dpSignal.en}`,
              `▸ Smart Flow: ${whaleIdx}/100 — ${flowSignal.en}`,
              `▸ GEX Regime: ${gex.toUpperCase()}`,
              '',
              // Implication (SIGNUM differentiator)
              `Most platforms show you price. We show you the structure beneath it.`,
              '',
              `Observation only — not financial advice.`,
            ].join('\n'),
            ko: [
              [`$${ticker} $${price} (${changeFmt}). 모든 사람이 가격을 봅니다. 대부분이 놓치는 것:`,
               `$${ticker} ${changeFmt} — 헤드라인입니다. 하지만 기관의 발자국은 다른 이야기를 합니다:`,
               `지금 $${ticker}에서 기관은 무엇을 하고 있을까? 데이터가 보여줍니다:`][hookIdx],
              '',
              `▸ 다크풀: ${dp}% — ${dpSignal.ko}`,
              `▸ 스마트 플로우: ${whaleIdx}/100 — ${flowSignal.ko}`,
              `▸ GEX 레짐: ${gex.toUpperCase()}`,
              '',
              `가격만 보면 반쪽입니다. 구조를 봐야 전체가 보입니다.`,
              '',
              `*본 정보는 투자 권유가 아닌 데이터 분석 참고 자료입니다.`,
            ].join('\n'),
            ja: [
              [`$${ticker} $${price} (${changeFmt})。価格は誰でも見えます。しかし見えないものがあります:`,
               `$${ticker} ${changeFmt} — ヘッドライン。しかし機関の足跡は別の物語を語ります:`,
               `$${ticker}で機関は今何をしているのか？データが示します:`][hookIdx],
              '',
              `▸ ダークプール: ${dp}% — ${dpSignal.ja}`,
              `▸ スマートフロー: ${whaleIdx}/100 — ${flowSignal.ja}`,
              `▸ GEXレジーム: ${gex.toUpperCase()}`,
              '',
              `価格だけでは半分です。構造を見れば全体が見えます。`,
              '',
              `*投資助言ではありません。データ分析の参考資料です。`,
            ].join('\n'),
          };
          const text = textMap[lang] || textMap.en;
          const ctaUrl = buildCtaUrl(lang, 'command', 'spotlight');

          // Capture spotlight OG image (full params for radar template)
          const netPrem = tickerData?.netPremium || tickerData?.premium || '';
          const spotlightParams: Record<string, string | number> = {
            t: ticker,
            price: String(price),
            change: typeof change === 'number' ? change : 0,
            dp: dpNum,
            whale: String(whaleIdx),
            gex: gex.toLowerCase(),
            premium: typeof netPrem === 'number' ? `${netPrem >= 0 ? '+' : ''}$${Math.abs(netPrem / 1e6).toFixed(1)}M` : String(netPrem || ''),
            date: dateKey,
          };
          let ogImage = '';
          if (!dryRun) {
            // 3 attempts with escalating backoff
            for (let att = 0; att < 3 && !ogImage; att++) {
              try {
                const r = await captureTemplate({ template: 'ticker', format: 'tweet', data: spotlightParams });
                if (r?.cdnUrl) ogImage = r.cdnUrl;
              } catch (e: any) {
                console.warn(`[Dispatch] Spotlight OG attempt ${att + 1}/3: ${e.message}`);
              }
              if (!ogImage && att < 2) await new Promise(r => setTimeout(r, att === 0 ? 3000 : 8000));
            }
            // Fallback: pulse OG
            if (!ogImage) {
              console.warn('[Dispatch] Spotlight OG failed 3x, falling back to pulse OG');
              try {
                const fb = await captureTemplate({ template: 'pulse', format: 'tweet', data: { spy: String(change), t: ticker, date: dateKey } });
                if (fb?.cdnUrl) ogImage = fb.cdnUrl;
              } catch {}
            }
          }

          // X Tweet with $cashtag
          const twitterCh = getChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'spotlight', lang, tickers: [ticker] });
            const r = await dispatchTweet({
              channelId: twitterCh.id,
              text: truncateWithTags(text, tags, 'twitter'),
              imageUrl: ogImage,
              dryRun, draft,
            });
            results.push(r);
          }

          // Bluesky
          const bskyCh = getChannels({ tier: 'all', lang, service: 'bluesky' })[0];
          if (bskyCh) {
            const tags = getHashtags({ platform: 'bluesky', contentType: 'spotlight', lang, tickers: [ticker] });
            const footer = `\n\n${ctaUrl}\n\n${tags}`;
            const r = await dispatchPost({
              channelId: bskyCh.id,
              text: truncateWithTags(text, footer, 'bluesky'),
              imageUrl: ogImage,
              dryRun, draft,
            });
            results.push(r);
          }

          // IG Story
          const igCh = getChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igCh && !dryRun) {
            try {
              const storyResult = await captureTemplate({ template: 'story_spotlight', format: 'story', data: { ...spotlightParams, lang } });
              if (storyResult?.cdnUrl) {
                const r = await dispatchStory({ channelId: igCh.id, imageUrl: storyResult.cdnUrl, dryRun, draft });
                results.push(r);
              }
            } catch (e: any) {
              console.warn(`[Dispatch] Spotlight Story capture failed: ${e.message}`);
            }
          }

          // Pinterest
          const pinCh = getChannels({ tier: 'all', service: 'pinterest' })[0];
          if (pinCh && lang === 'en') {
            const seo = getPinterestSEO({ contentType: 'spotlight', date: dateKey });
            const r = await dispatchPin({
              channelId: pinCh.id,
              imageUrl: ogImage,
              title: `$${ticker} ${seo.title}`,
              description: seo.description,
              link: `${baseUrl}/command?ticker=${ticker}&${buildUtm('pinterest', 'spotlight')}`,
              dryRun, draft,
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
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const dispatchLog = {
      timestamp: new Date().toISOString(),
      dryRun,

      draft,
      action,
      totalChannels: results.length,
      successful: successCount,
      failed: failCount,
      results,
    };
    await setInCache(logKey, JSON.stringify(dispatchLog), 86400 * 7);

    // ── AUTO-RETRY: If ALL dispatches failed, retry inline after 30s delay ──
    // Vercel Serverless doesn't support setTimeout after response, so retry inline.
    const retryCount = parseInt(searchParams.get('_retry') || '0', 10);
    if (results.length > 0 && successCount === 0 && !dryRun && retryCount < 2) {
      const retryKey = `marketing:retry:${dateKey}:${action}:${retryCount + 1}`;
      const alreadyRetried = await getFromCache(retryKey).catch(() => null);
      if (!alreadyRetried) {
        await setInCache(retryKey, 'scheduled', 3600); // 1hr dedup
        console.log(`[Cron/MarketingDispatch] ⚠️ ALL ${failCount} dispatches failed for "${action}". Inline retry #${retryCount + 1} in 30s...`);
        await new Promise(r => setTimeout(r, 30000)); // 30s backoff (EC2 warm-up)
        const retryUrl = new URL(request.url);
        retryUrl.searchParams.set('_retry', String(retryCount + 1));
        try {
          const retryRes = await fetch(retryUrl.toString(), {
            headers: authHeader ? { authorization: authHeader } : {},
            signal: AbortSignal.timeout(90000),
          });
          const retryData = await retryRes.json().catch(() => null);
          console.log(`[Cron/MarketingDispatch] 🔄 Retry #${retryCount + 1} result:`, retryData?.summary || 'unknown');
          return NextResponse.json({
            success: true,
            action,
            retryCount: retryCount + 1,
            originalFailure: { totalDispatched: results.length, failed: failCount },
            retryResult: retryData,
          });
        } catch (retryErr: any) {
          console.error(`[Cron/MarketingDispatch] Retry #${retryCount + 1} failed: ${retryErr.message}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      dryRun,

      draft,
      action,
      retryCount,
      summary: {
        totalDispatched: results.length,
        successful: successCount,
        failed: failCount,
        autoRetryScheduled: false,
      },
      results,
    });
  } catch (err: any) {
    console.error('[Cron/MarketingDispatch] Error:', err);

    // ── AUTO-RETRY on uncaught error ──
    const retryCount = parseInt(searchParams.get('_retry') || '0', 10);
    if (!dryRun && retryCount < 2) {
      const retryKey = `marketing:retry:error:${dateKey}:${action}:${retryCount + 1}`;
      const alreadyRetried = await getFromCache(retryKey).catch(() => null);
      if (!alreadyRetried) {
        await setInCache(retryKey, 'scheduled', 3600).catch(() => {});
        console.log(`[Cron/MarketingDispatch] ⚠️ Uncaught error for "${action}". Inline retry #${retryCount + 1} in 30s...`);
        await new Promise(r => setTimeout(r, 30000));
        const retryUrl = new URL(request.url);
        retryUrl.searchParams.set('_retry', String(retryCount + 1));
        try {
          const retryRes = await fetch(retryUrl.toString(), {
            headers: request.headers.get('authorization') ? { authorization: request.headers.get('authorization')! } : {},
            signal: AbortSignal.timeout(90000),
          });
          const retryData = await retryRes.json().catch(() => null);
          return NextResponse.json({
            success: retryData?.success || false,
            action,
            retryCount: retryCount + 1,
            originalError: err.message,
            retryResult: retryData,
          });
        } catch {}
      }
    }

    return NextResponse.json({ success: false, error: err.message, retryExhausted: retryCount >= 2 }, { status: 500 });
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
  // Map old page names to actual existing routes
  const routeMap: Record<string, string> = {
    command: 'dashboard',
    guardian: 'intel-guardian',
    guide: 'how-it-works',
  };
  const actualPage = routeMap[page] || page;
  return `${baseUrl}/${actualPage}?${utm}`;
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
  if (maxBody < 20) {
    return tagsOrFooter.substring(0, limit);
  }
  const trimmedBody = body.length > maxBody ? body.substring(0, maxBody - 3) + '...' : body;
  const result = `${trimmedBody}${separator}${tagsOrFooter}`;
  // Safety net — NEVER exceed platform limit
  if (result.length > limit) {
    return result.substring(0, limit - 3) + '...';
  }
  return result;
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

  // LIVE: EC2 Puppeteer capture — aggressive retry (4 attempts + emergency)
  const BACKOFF = [2000, 5000, 10000]; // 2s, 5s, 10s between attempts
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await captureTemplate({ template, format, data });
      if (result?.cdnUrl) {
        console.log(`[Dispatch] EC2 capture OK: ${template}/${format}/${lang} ${result.sizeKB}KB (attempt ${attempt + 1})`);
        return result.cdnUrl;
      }
      console.warn(`[Dispatch] EC2 returned null for ${template}/${format}/${lang} (attempt ${attempt + 1})`);
    } catch (err: any) {
      console.warn(`[Dispatch] EC2 capture attempt ${attempt + 1}/4 failed: ${err.message}`);
    }
    if (attempt < 3) {
      const wait = BACKOFF[attempt] || 10000;
      console.log(`[Dispatch] Retrying in ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }

  // Emergency: final attempt after 15s cooldown
  console.warn(`[Dispatch] Emergency retry for ${template}/${format}/${lang} after 15s...`);
  await new Promise(r => setTimeout(r, 15000));
  try {
    const result = await captureTemplate({ template, format, data });
    if (result?.cdnUrl) {
      console.log(`[Dispatch] Emergency capture OK: ${template}/${format}/${lang} ${result.sizeKB}KB`);
      return result.cdnUrl;
    }
  } catch (e: any) {
    console.error(`[Dispatch] Emergency capture also failed: ${e.message}`);
  }

  // Absolute last resort: text-only (5 attempts failed over ~32s)
  console.error(`[Dispatch] ALL 5 capture attempts failed for ${template}/${format}/${lang} - text-only fallback`);
  return '';
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

