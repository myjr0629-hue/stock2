// ============================================================================
// Buffer Multi-Format Client — Thread, Carousel, Story, Auto-Reply support
// Extends base bufferClient with platform-specific dispatch formats
// ============================================================================

import { createPost, getChannels, truncateForPlatform, buildUtm, type BufferChannel, type ChannelTier } from './bufferClient';
import { getHashtags, getTwitterTagsSplit, buildInstagramFooter, getPinterestSEO, type ContentType, type Platform, type Lang } from './hashtagEngine';

const BUFFER_API_URL = 'https://api.buffer.com';

// ---------------------------------------------------------------------------
// GraphQL helper
// ---------------------------------------------------------------------------
async function bufferGraphQL<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  if (!token) throw new Error('[BufferMulti] BUFFER_ACCESS_TOKEN not set');

  const res = await fetch(BUFFER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`[BufferMulti] HTTP ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`[BufferMulti] GraphQL Error: ${json.errors[0].message}`);
  }
  return json.data as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface DispatchResult {
  success: boolean;
  format: 'tweet' | 'thread' | 'carousel' | 'story' | 'pin' | 'post';
  channel: string;
  service: string;
  lang: string;
  postId?: string;
  error?: string;
  dryRun?: boolean;
  textPreview: string;
}

export interface ThreadSlide {
  text: string;
  imageUrl?: string;
}

// ---------------------------------------------------------------------------
// A. Single Tweet + Auto-Reply (CTA link in reply)
// ---------------------------------------------------------------------------
export async function dispatchTweet(opts: {
  channelId: string;
  text: string;
  imageUrl?: string;
  replyText?: string;  // CTA link goes in reply
  dryRun?: boolean;
  draft?: boolean;
}): Promise<DispatchResult> {
  const { channelId, text, imageUrl, replyText, dryRun = true, draft = false } = opts;
  const channel = getChannels({ tier: 'all' }).find(c => c.id === channelId);

  if (dryRun) {
    console.log(`[BufferMulti] DRY_RUN tweet: ${text.substring(0, 80)}...`);
    if (replyText) console.log(`[BufferMulti] DRY_RUN reply: ${replyText.substring(0, 80)}...`);
    return { success: true, format: 'tweet', channel: channel?.name || channelId, service: 'twitter', lang: channel?.lang || 'en', dryRun: true, textPreview: text.substring(0, 100) };
  }

  // Post main tweet
  const mainResult = await createPost({ channelIds: [channelId], text, mediaUrl: imageUrl, dryRun: false, draft });

  // Post auto-reply with CTA link if provided
  if (replyText && mainResult.postId && !draft) {
    const replyTime = new Date(Date.now() + 30000).toISOString();
    await createPost({ channelIds: [channelId], text: replyText, scheduledAt: replyTime, dryRun: false });
  }

  return {
    success: mainResult.success,
    format: 'tweet',
    channel: channel?.name || channelId,
    service: 'twitter',
    lang: channel?.lang || 'en',
    postId: mainResult.postId,
    error: mainResult.error,
    textPreview: text.substring(0, 100),
  };
}

// ---------------------------------------------------------------------------
// B. Thread (X Thread — multiple sequential tweets)
// ---------------------------------------------------------------------------
export async function dispatchThread(opts: {
  channelId: string;
  slides: ThreadSlide[];
  dryRun?: boolean;
  draft?: boolean;
}): Promise<DispatchResult> {
  const { channelId, slides, dryRun = true, draft = false } = opts;
  const channel = getChannels({ tier: 'all' }).find(c => c.id === channelId);

  if (dryRun) {
    console.log(`[BufferMulti] DRY_RUN thread (${slides.length} tweets):`);
    slides.forEach((s, i) => console.log(`  ${i + 1}/${slides.length}: ${s.text.substring(0, 60)}...`));
    return { success: true, format: 'thread', channel: channel?.name || channelId, service: 'twitter', lang: channel?.lang || 'en', dryRun: true, textPreview: slides[0]?.text.substring(0, 100) || '' };
  }

  const orgId = process.env.BUFFER_ORGANIZATION_ID;
  if (!orgId) throw new Error('[BufferMulti] BUFFER_ORGANIZATION_ID not set');

  try {
    // Buffer's thread creation: postCreate with threadItems
    const threadItems = slides.map(s => ({
      text: s.text,
      ...(s.imageUrl ? { media: [{ url: s.imageUrl }] } : {}),
    }));

    const data = await bufferGraphQL(`
      mutation CreatePost($input: PostCreateInput!) {
        postCreate(input: $input) {
          ... on PostCreateSuccess {
            post { id status }
          }
          ... on CoreError { message }
        }
      }
    `, {
      input: {
        organizationId: orgId,
        channelIds: [channelId],
        content: threadItems[0],  // First tweet
        threadItems: threadItems.slice(1),  // Remaining tweets
        ...(draft ? { draft: true } : {}),
      },
    });

    const result = data.postCreate;
    return {
      success: !!result?.post?.id,
      format: 'thread',
      channel: channel?.name || channelId,
      service: 'twitter',
      lang: channel?.lang || 'en',
      postId: result?.post?.id,
      error: result?.message,
      textPreview: slides[0]?.text.substring(0, 100) || '',
    };
  } catch (err: any) {
    return { success: false, format: 'thread', channel: channel?.name || channelId, service: 'twitter', lang: channel?.lang || 'en', error: err.message, textPreview: slides[0]?.text.substring(0, 100) || '' };
  }
}

// ---------------------------------------------------------------------------
// C. Instagram Carousel (multiple images in one post)
// ---------------------------------------------------------------------------
export async function dispatchCarousel(opts: {
  channelId: string;
  caption: string;
  imageUrls: string[];  // Up to 10 images
  altTexts?: string[];  // ALT text per image (IG SEO — Phase 1-6)
  dryRun?: boolean;
  draft?: boolean;
}): Promise<DispatchResult> {
  const { channelId, caption, imageUrls, altTexts, dryRun = true, draft = false } = opts;
  const channel = getChannels({ tier: 'all' }).find(c => c.id === channelId);

  if (dryRun) {
    console.log(`[BufferMulti] DRY_RUN carousel (${imageUrls.length} images): ${caption.substring(0, 80)}...`);
    return { success: true, format: 'carousel', channel: channel?.name || channelId, service: 'instagram', lang: channel?.lang || 'en', dryRun: true, textPreview: caption.substring(0, 100) };
  }

  const orgId = process.env.BUFFER_ORGANIZATION_ID;
  if (!orgId) throw new Error('[BufferMulti] BUFFER_ORGANIZATION_ID not set');

  try {
    const data = await bufferGraphQL(`
      mutation CreatePost($input: PostCreateInput!) {
        postCreate(input: $input) {
          ... on PostCreateSuccess {
            post { id status }
          }
          ... on CoreError { message }
        }
      }
    `, {
      input: {
        organizationId: orgId,
        channelIds: [channelId],
        content: {
          text: caption,
          media: imageUrls.slice(0, 10).map((url, i) => ({
            url,
            ...(altTexts?.[i] ? { altText: altTexts[i] } : {}),
          })),
        },
        ...(draft ? { draft: true } : {}),
      },
    });

    const result = data.postCreate;
    return {
      success: !!result?.post?.id,
      format: 'carousel',
      channel: channel?.name || channelId,
      service: 'instagram',
      lang: channel?.lang || 'en',
      postId: result?.post?.id,
      error: result?.message,
      textPreview: caption.substring(0, 100),
    };
  } catch (err: any) {
    return { success: false, format: 'carousel', channel: channel?.name || channelId, service: 'instagram', lang: channel?.lang || 'en', error: err.message, textPreview: caption.substring(0, 100) };
  }
}

// ---------------------------------------------------------------------------
// D. Instagram Story (image-only, fully automated)
// ---------------------------------------------------------------------------
export async function dispatchStory(opts: {
  channelId: string;
  imageUrl: string;  // 1080×1920 story format
  dryRun?: boolean;
  draft?: boolean;
}): Promise<DispatchResult> {
  const { channelId, imageUrl, dryRun = true, draft = false } = opts;
  const channel = getChannels({ tier: 'all' }).find(c => c.id === channelId);

  if (dryRun) {
    console.log(`[BufferMulti] DRY_RUN story: ${imageUrl}`);
    return { success: true, format: 'story', channel: channel?.name || channelId, service: 'instagram', lang: channel?.lang || 'en', dryRun: true, textPreview: `Story: ${imageUrl}` };
  }

  const orgId = process.env.BUFFER_ORGANIZATION_ID;
  if (!orgId) throw new Error('[BufferMulti] BUFFER_ORGANIZATION_ID not set');

  try {
    const data = await bufferGraphQL(`
      mutation CreatePost($input: PostCreateInput!) {
        postCreate(input: $input) {
          ... on PostCreateSuccess {
            post { id status }
          }
          ... on CoreError { message }
        }
      }
    `, {
      input: {
        organizationId: orgId,
        channelIds: [channelId],
        content: {
          text: '',
          media: [{ url: imageUrl }],
        },
        subprofile: { type: 'story' },
        ...(draft ? { draft: true } : {}),
      },
    });

    const result = data.postCreate;
    return {
      success: !!result?.post?.id,
      format: 'story',
      channel: channel?.name || channelId,
      service: 'instagram',
      lang: channel?.lang || 'en',
      postId: result?.post?.id,
      error: result?.message,
      textPreview: `Story: ${imageUrl.substring(0, 80)}`,
    };
  } catch (err: any) {
    return { success: false, format: 'story', channel: channel?.name || channelId, service: 'instagram', lang: channel?.lang || 'en', error: err.message, textPreview: `Story: ${imageUrl.substring(0, 80)}` };
  }
}

// ---------------------------------------------------------------------------
// E. Pinterest Pin
// ---------------------------------------------------------------------------
export async function dispatchPin(opts: {
  channelId: string;
  imageUrl: string;     // 1000×1500 pin format
  title: string;
  description: string;
  link: string;
  boardName?: string;
  dryRun?: boolean;
  draft?: boolean;
}): Promise<DispatchResult> {
  const { channelId, imageUrl, title, description, link, dryRun = true, draft = false } = opts;
  const channel = getChannels({ tier: 'all' }).find(c => c.id === channelId);

  if (dryRun) {
    console.log(`[BufferMulti] DRY_RUN pin: ${title}`);
    return { success: true, format: 'pin', channel: channel?.name || channelId, service: 'pinterest', lang: 'en', dryRun: true, textPreview: title };
  }

  // Pinterest via Buffer: text = title + description, media = pin image, link in text
  const pinText = `${title}\n\n${description}\n\n${link}`;
  const result = await createPost({
    channelIds: [channelId],
    text: pinText,
    mediaUrl: imageUrl,
    dryRun: false,
    draft,
  });

  return {
    success: result.success,
    format: 'pin',
    channel: channel?.name || channelId,
    service: 'pinterest',
    lang: 'en',
    postId: result.postId,
    error: result.error,
    textPreview: title,
  };
}

// ---------------------------------------------------------------------------
// F. Generic Post (Bluesky, Threads — text + optional image)
// ---------------------------------------------------------------------------
export async function dispatchPost(opts: {
  channelId: string;
  text: string;
  imageUrl?: string;
  dryRun?: boolean;
  draft?: boolean;
}): Promise<DispatchResult> {
  const { channelId, text, imageUrl, dryRun = true, draft = false } = opts;
  const channel = getChannels({ tier: 'all' }).find(c => c.id === channelId);

  if (dryRun) {
    console.log(`[BufferMulti] DRY_RUN post (${channel?.service}): ${text.substring(0, 80)}...`);
    return { success: true, format: 'post', channel: channel?.name || channelId, service: channel?.service || 'unknown', lang: channel?.lang || 'en', dryRun: true, textPreview: text.substring(0, 100) };
  }

  const result = await createPost({ channelIds: [channelId], text, mediaUrl: imageUrl, dryRun: false, draft });
  return {
    success: result.success,
    format: 'post',
    channel: channel?.name || channelId,
    service: channel?.service || 'unknown',
    lang: channel?.lang || 'en',
    postId: result.postId,
    error: result.error,
    textPreview: text.substring(0, 100),
  };
}

// ---------------------------------------------------------------------------
// IG Carousel ALT Text Generator — Phase 1-6
// IG algorithm uses ALT text + caption keywords for search ranking
// ---------------------------------------------------------------------------
const SLIDE_ALT: Record<string, string[]> = {
  en: [
    'SIGNUM HQ market structure analysis - daily options flow and gamma exposure overview',
    'S&P 500 and market data - stock market performance with options structure context',
    'GEX gamma exposure regime analysis - dealer hedging impact on market volatility',
    'Dark pool institutional trading activity - smart money positioning data',
    'Key market insight - options structure drives price action analysis',
    'SIGNUM HQ call to action - institutional grade market analysis platform',
  ],
  ko: [
    'SIGNUM HQ 시장 구조 분석 - 옵션 플로우 및 감마 노출 개요',
    'S&P 500 시장 데이터 - 옵션 구조 맥락의 시장 성과 분석',
    'GEX 감마 노출 레짐 분석 - 딜러 헤징이 변동성에 미치는 영향',
    '다크풀 기관 매매 활동 - 스마트 머니 포지셔닝 데이터',
    '핵심 시장 인사이트 - 옵션 구조가 가격 움직임을 결정',
    'SIGNUM HQ - 기관급 시장 구조 분석 플랫폼',
  ],
  ja: [
    'SIGNUM HQ market structure analysis - options flow and gamma exposure',
    'S&P 500 market data - stock performance with options structure',
    'GEX gamma exposure regime - dealer hedging volatility impact',
    'Dark pool institutional trading - smart money positioning',
    'Key market insight - options structure price action',
    'SIGNUM HQ - institutional grade market analysis',
  ],
};

export function generateCarouselAltTexts(slideCount: number, lang: string): string[] {
  const alts = SLIDE_ALT[lang] || SLIDE_ALT.en;
  return Array.from({ length: slideCount }, (_, i) => alts[i % alts.length]);
}

// ---------------------------------------------------------------------------
// Full Multi-Platform Dispatch — handles routing to all platforms
// ---------------------------------------------------------------------------
export interface MultiPlatformContent {
  contentType: ContentType;
  lang: Lang;
  // Text per platform
  tweetText: string;
  threadSlides?: ThreadSlide[];
  instagramCaption: string;
  blueskyText: string;
  threadsText: string;
  pinterestTitle?: string;
  pinterestDescription?: string;
  // Images
  tweetImageUrl?: string;       // 1200×675
  ogImageUrl?: string;          // 1200×630
  carouselImageUrls?: string[]; // 1080×1350 × 8
  carouselAltTexts?: string[];  // ALT text per slide (IG SEO — Phase 1-6)
  storyImageUrl?: string;       // 1080×1920
  pinImageUrl?: string;         // 1000×1500
  // Context
  tickers?: string[];
  educationTopic?: string;
  ctaUrl: string;
}

export async function dispatchMultiPlatform(
  content: MultiPlatformContent,
  opts: {
    dryRun?: boolean;
    tier?: ChannelTier | 'all';
    formats?: ('tweet' | 'thread' | 'carousel' | 'story' | 'pin' | 'bluesky' | 'threads')[];
  } = {}
): Promise<DispatchResult[]> {
  const { dryRun = true, tier = 'all', formats } = opts;
  const results: DispatchResult[] = [];
  const { lang, contentType } = content;

  // Get channels for this language
  const channels = getChannels({ tier, lang });

  // --- Twitter Tweet ---
  // 2026 X algorithm: $Cashtags at FIRST LINE for SimClusters matching,
  // hashtags at end (max 2), CTA link in auto-reply (not in body)
  if (!formats || formats.includes('tweet')) {
    const twitterCh = channels.find(c => c.service === 'twitter');
    if (twitterCh) {
      const { cashtags, hashtags } = getTwitterTagsSplit({
        contentType, tickers: content.tickers, educationTopic: content.educationTopic,
      });
      // Structure: $CASHTAGS — [tweet body] \n\n #hashtags
      const bodyWithCashtags = `${cashtags} — ${content.tweetText}`;
      const fullText = truncateForPlatform(
        hashtags ? `${bodyWithCashtags}\n\n${hashtags}` : bodyWithCashtags,
        'twitter',
      );
      const replyText = `📊 ${content.ctaUrl}`;

      const r = await dispatchTweet({
        channelId: twitterCh.id,
        text: fullText,
        imageUrl: content.tweetImageUrl || content.ogImageUrl,
        replyText,
        dryRun,
      });
      results.push(r);
    }
  }

  // --- Twitter Thread ---
  if ((!formats || formats.includes('thread')) && content.threadSlides?.length) {
    const twitterCh = channels.find(c => c.service === 'twitter');
    if (twitterCh) {
      const r = await dispatchThread({
        channelId: twitterCh.id,
        slides: content.threadSlides,
        dryRun,
      });
      results.push(r);
    }
  }

  // --- Instagram Carousel ---
  if ((!formats || formats.includes('carousel')) && content.carouselImageUrls?.length) {
    const igCh = channels.find(c => c.service === 'instagram');
    if (igCh) {
      const footer = buildInstagramFooter(lang, contentType);
      const caption = truncateForPlatform(`${content.instagramCaption}${footer}`, 'instagram');

      const r = await dispatchCarousel({
        channelId: igCh.id,
        caption,
        imageUrls: content.carouselImageUrls,
        altTexts: content.carouselAltTexts || generateCarouselAltTexts(content.carouselImageUrls.length, lang),
        dryRun,
      });
      results.push(r);
    }
  }

  // --- Instagram Story ---
  if ((!formats || formats.includes('story')) && content.storyImageUrl) {
    const igCh = channels.find(c => c.service === 'instagram');
    if (igCh) {
      const r = await dispatchStory({
        channelId: igCh.id,
        imageUrl: content.storyImageUrl,
        dryRun,
      });
      results.push(r);
    }
  }

  // --- Bluesky ---
  if (!formats || formats.includes('bluesky')) {
    const bskyCh = channels.find(c => c.service === 'bluesky');
    if (bskyCh) {
      const tags = getHashtags({ platform: 'bluesky', contentType, lang, tickers: content.tickers });
      const fullText = truncateForPlatform(`${content.blueskyText}\n\n${content.ctaUrl}\n\n${tags}`, 'bluesky');

      const r = await dispatchPost({
        channelId: bskyCh.id,
        text: fullText,
        imageUrl: content.ogImageUrl,
        dryRun,
      });
      results.push(r);
    }
  }

  // --- Threads ---
  if (!formats || formats.includes('threads')) {
    const threadsCh = channels.find(c => c.service === 'threads');
    if (threadsCh) {
      const tags = getHashtags({ platform: 'threads', contentType, lang });
      const fullText = truncateForPlatform(`${content.threadsText}\n\n${tags}`, 'threads');

      const r = await dispatchPost({
        channelId: threadsCh.id,
        text: fullText,
        imageUrl: content.ogImageUrl,
        dryRun,
      });
      results.push(r);
    }
  }

  // --- Pinterest ---
  if ((!formats || formats.includes('pin')) && content.pinImageUrl) {
    const pinCh = getChannels({ tier: 'all', service: 'pinterest' })[0];
    if (pinCh) {
      const seo = getPinterestSEO({
        contentType,
        educationTopic: content.educationTopic,
        date: new Date().toISOString().split('T')[0],
      });
      const title = content.pinterestTitle || seo.title;
      const description = content.pinterestDescription || seo.description;

      const r = await dispatchPin({
        channelId: pinCh.id,
        imageUrl: content.pinImageUrl,
        title,
        description,
        link: content.ctaUrl,
        dryRun,
      });
      results.push(r);
    }
  }

  return results;
}
