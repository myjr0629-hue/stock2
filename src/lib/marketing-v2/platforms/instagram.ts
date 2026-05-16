// ============================================================================
// Marketing V2 — Instagram Adapter
// Story (1080×1920) + Feed Single (1080×1080) 분기
// ============================================================================

import { BaseAdapter } from './base';
import { ContentPackage, SendResult, Lang, Platform, ImageFormat } from '../core/types';
import { getChannelsByPlatform } from '../core/channels';
import { acquireLock } from '../core/store';
import { createPost } from '@/lib/marketing/bufferClient';

export class InstagramAdapter extends BaseAdapter {
  readonly platform: Platform = 'instagram';
  readonly maxChars = 2200;
  readonly imageFormat: ImageFormat = 'carousel';  // Feed 기본
  readonly supportedLangs: Lang[] = ['en', 'ko', 'ja'];

  buildText(pkg: ContentPackage, lang: Lang): string {
    const t = pkg.text[lang];
    if (!t) return '';

    // IG Feed = 풀 캡션 + 해시태그 30개
    return [
      t.headline,
      t.data,
      t.insight,
      t.disclaimer,
    ].filter(Boolean).join('\n\n');
  }

  // ── Story 발송 (이미지만, 텍스트 없음) ──
  async sendStory(
    pkg: ContentPackage,
    lang: Lang,
    opts: { dryRun?: boolean; draft?: boolean } = {},
  ): Promise<SendResult> {
    const channel = getChannelsByPlatform(this.platform).find(c => c.lang === lang);
    if (!channel) {
      return { success: false, platform: this.platform, lang, channelId: '', error: 'No IG channel' };
    }

    const storyImage = pkg.images.story;
    if (!storyImage) {
      return { success: false, platform: this.platform, lang, channelId: channel.id, error: 'No story image' };
    }

    if (!opts.dryRun && !opts.draft) {
      const canSend = await acquireLock(pkg.slot, `ig_story_${lang}`, pkg.date);
      if (!canSend) {
        return { success: true, platform: this.platform, lang, channelId: channel.id, postId: 'dedup_skipped' };
      }
    }

    if (opts.dryRun) {
      console.log(`[MktV2/instagram] DRY_RUN story ${lang}: ${storyImage.substring(0, 60)}...`);
      return { success: true, platform: this.platform, lang, channelId: channel.id, dryRun: true };
    }

    const result = await createPost({
      channelIds: [channel.id],
      text: '',
      mediaUrl: storyImage,
      dryRun: false,
      draft: opts.draft,
      instagramMeta: { type: 'story', shouldShareToFeed: false },
    });

    return {
      success: result.success,
      platform: this.platform,
      lang,
      channelId: channel.id,
      postId: result.postId,
      error: result.error,
    };
  }

  // ── Feed Single 발송 (이미지 + 캡션) ──
  async sendFeed(
    pkg: ContentPackage,
    lang: Lang,
    opts: { dryRun?: boolean; draft?: boolean } = {},
  ): Promise<SendResult> {
    const channel = getChannelsByPlatform(this.platform).find(c => c.lang === lang);
    if (!channel) {
      return { success: false, platform: this.platform, lang, channelId: '', error: 'No IG channel' };
    }

    const feedImage = pkg.images.carousel || pkg.images.square;
    if (!feedImage) {
      return { success: false, platform: this.platform, lang, channelId: channel.id, error: 'No feed image' };
    }

    if (!opts.dryRun && !opts.draft) {
      const canSend = await acquireLock(pkg.slot, `ig_feed_${lang}`, pkg.date);
      if (!canSend) {
        return { success: true, platform: this.platform, lang, channelId: channel.id, postId: 'dedup_skipped' };
      }
    }

    const post = this.format(pkg, lang);
    const caption = post?.text || '';

    if (opts.dryRun) {
      console.log(`[MktV2/instagram] DRY_RUN feed ${lang}: ${caption.substring(0, 60)}...`);
      return { success: true, platform: this.platform, lang, channelId: channel.id, dryRun: true };
    }

    // 멀티 슬라이드 캐러셀 or 싱글 이미지
    const hasCarousel = pkg.carouselSlides && pkg.carouselSlides.length > 1;

    const result = await createPost({
      channelIds: [channel.id],
      text: caption,
      ...(hasCarousel
        ? { mediaUrls: pkg.carouselSlides! }
        : { mediaUrl: feedImage }),
      dryRun: false,
      draft: opts.draft,
      instagramMeta: { type: 'post', shouldShareToFeed: true },
    });

    return {
      success: result.success,
      platform: this.platform,
      lang,
      channelId: channel.id,
      postId: result.postId,
      error: result.error,
    };
  }
}
