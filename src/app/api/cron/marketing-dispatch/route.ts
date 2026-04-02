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
  type DispatchResult,
  type ThreadSlide,
} from '@/lib/marketing/bufferMultiClient';
import { getChannels, truncateForPlatform, buildUtm } from '@/lib/marketing/bufferClient';
import { getHashtags, buildInstagramFooter, getPinterestSEO, type ContentType, type Lang } from '@/lib/marketing/hashtagEngine';
import type { ContentOutput } from '@/lib/marketing/contentEngines';

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
type Action = 'morning' | 'morning_ig' | 'midday' | 'education' | 'edu_bsky' | 'pulse' | 'pulse_ig' | 'event';
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
  const action = (searchParams.get('action') || 'pulse') as Action;
  const region = (searchParams.get('region') || 'all') as Region;
  const dateKey = searchParams.get('date') || new Date().toISOString().split('T')[0];
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
        const content = await loadContent('morning', dateKey);
        if (!content) return noContent('morning', dateKey);

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
              imageUrl: buildImageUrl(baseUrl, content, lang, 'tweet'),
              replyText: `📊 ${ctaUrl}`,
              dryRun,
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
            });
            results.push(r);
          }

          // IG Story
          const igCh = getChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igCh) {
            const storyUrl = buildImageUrl(baseUrl, content, lang, 'story');
            const r = await dispatchStory({
              channelId: igCh.id,
              imageUrl: storyUrl,
              dryRun,
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
        const content = await loadContent('morning', dateKey);
        if (!content) return noContent('morning', dateKey);

        for (const lang of langs) {
          const lc = content[lang];
          if (!lc?.text) continue;

          const igCh = getChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igCh) {
            const caption = lc.platformText?.instagram || lc.text;
            const carouselUrls = buildCarouselUrls(baseUrl, content, lang);

            const r = await dispatchCarousel({
              channelId: igCh.id,
              caption: truncateForPlatform(`${caption}${buildInstagramFooter(lang, 'morning')}`, 'instagram'),
              imageUrls: carouselUrls,
              dryRun,
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
        // Use pulse content for midday (latest market data)
        const content = await loadContent('pulse', dateKey);
        if (!content) return noContent('pulse', dateKey);

        for (const lang of langs) {
          const lc = content[lang];
          if (!lc?.text) continue;

          const ctaUrl = buildCtaUrl(lang, 'command', 'midday');

          // X Tweet
          const twitterCh = getChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const r = await dispatchTweet({
              channelId: twitterCh.id,
              text: truncateForPlatform(lc.platformText?.twitter || lc.text, 'twitter'),
              imageUrl: buildImageUrl(baseUrl, content, lang, 'tweet'),
              replyText: `📊 ${ctaUrl}`,
              dryRun,
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
            });
            results.push(r);
          }

          // IG Story
          const igCh = getChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igCh) {
            const r = await dispatchStory({
              channelId: igCh.id,
              imageUrl: buildImageUrl(baseUrl, content, lang, 'story'),
              dryRun,
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
            imageUrl: buildImageUrl(baseUrl, content, 'en', 'pin'),
            title: seo.title,
            description: seo.description,
            link: `${baseUrl}/command?${buildUtm('pinterest', 'midday')}`,
            dryRun,
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
            imageUrl: buildImageUrl(baseUrl, content, 'en', 'pin'),
            title: seo.title,
            description: seo.description,
            link: `${baseUrl}/command?${buildUtm('pinterest', 'education')}`,
            dryRun,
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
            imageUrl: buildImageUrl(baseUrl, content, 'en', 'pin', 2),
            title: seo.title,
            description: seo.description,
            link: `${baseUrl}/command?${buildUtm('pinterest', 'education')}`,
            dryRun,
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
              imageUrl: buildImageUrl(baseUrl, content, lang, 'tweet'),
              replyText: `📊 ${ctaUrl}`,
              dryRun,
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
            });
            results.push(r);
          }

          // IG Story
          const igCh = getChannels({ tier: 'all', lang, service: 'instagram' })[0];
          if (igCh) {
            const r = await dispatchStory({
              channelId: igCh.id,
              imageUrl: buildImageUrl(baseUrl, content, lang, 'story'),
              dryRun,
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
            imageUrl: buildImageUrl(baseUrl, content, 'en', 'pin'),
            title: seo.title,
            description: seo.description,
            link: `${baseUrl}/command?${buildUtm('pinterest', 'pulse')}`,
            dryRun,
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
            const carouselUrls = buildCarouselUrls(baseUrl, content, lang);

            const r = await dispatchCarousel({
              channelId: igCh.id,
              caption: truncateForPlatform(`${caption}${buildInstagramFooter(lang, 'pulse')}`, 'instagram'),
              imageUrls: carouselUrls,
              dryRun,
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

        for (const lang of langs) {
          const lc = content[lang];
          if (!lc?.text) continue;

          const ctaUrl = buildCtaUrl(lang, 'command', 'event');

          // X Tweet (즉시)
          const twitterCh = getChannels({ tier: 'all', lang, service: 'twitter' })[0];
          if (twitterCh) {
            const tags = getHashtags({ platform: 'twitter', contentType: 'event', lang });
            const r = await dispatchTweet({
              channelId: twitterCh.id,
              text: truncateForPlatform(`${lc.platformText?.twitter || lc.text}\n\n${tags}`, 'twitter'),
              imageUrl: lc.imageUrl,
              replyText: `📊 ${ctaUrl}`,
              dryRun,
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
              imageUrl: lc.imageUrl,
              dryRun,
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

function buildImageUrl(
  baseUrl: string,
  content: ContentOutput,
  lang: Lang,
  format: string,
  variant?: number
): string {
  // Extract params from existing imageUrl or build fresh
  const existingUrl = content[lang]?.imageUrl || '';
  const params = new URL(existingUrl, baseUrl).searchParams;

  const newUrl = new URL(`${baseUrl}/api/og/market`);
  // Copy existing params
  params.forEach((v, k) => newUrl.searchParams.set(k, v));
  // Override format
  newUrl.searchParams.set('format', format);
  newUrl.searchParams.set('lang', lang);
  if (variant) newUrl.searchParams.set('variant', String(variant));

  return newUrl.toString();
}

function buildCarouselUrls(baseUrl: string, content: ContentOutput, lang: Lang): string[] {
  const slides = ['hook', 'data', 'gex', 'darkpool', 'insight', 'cta'];
  const existingUrl = content[lang]?.imageUrl || '';
  const params = new URL(existingUrl, baseUrl).searchParams;

  return slides.map(slide => {
    const url = new URL(`${baseUrl}/api/og/market/slide`);
    params.forEach((v, k) => url.searchParams.set(k, v));
    url.searchParams.set('slide', slide);
    url.searchParams.set('format', 'carousel');
    url.searchParams.set('lang', lang);
    return url.toString();
  });
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
    { text: `🧵 ${truncateForPlatform(slide1Text, 'twitter')}`, imageUrl: buildImageUrl(baseUrl, content, lang, 'tweet') },
    { text: truncateForPlatform(slide2Text, 'twitter') },
    { text: truncateForPlatform(slide3Text, 'twitter') },
    { text: truncateForPlatform(slide4Text, 'twitter'), imageUrl: lc.imageUrl },
  ];
}
