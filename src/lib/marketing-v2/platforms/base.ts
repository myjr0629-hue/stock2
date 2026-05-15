// ============================================================================
// Marketing V2 — Base Platform Adapter
// 모든 플랫폼 어댑터의 공통 인터페이스.
// 새 플랫폼 = 이 클래스 상속 + formatPost 구현.
// ============================================================================

import { ContentPackage, FormattedPost, SendResult, Lang, Platform, ImageFormat } from '../core/types';
import { getChannelsByPlatform } from '../core/channels';
import { applyCompliance, truncateWithTags } from '../core/compliance';
import { acquireLock } from '../core/store';
import { createPost } from '@/lib/marketing/bufferClient';

export abstract class BaseAdapter {
  abstract readonly platform: Platform;
  abstract readonly maxChars: number;
  abstract readonly imageFormat: ImageFormat;         // 이 플랫폼이 사용하는 이미지 포맷
  abstract readonly supportedLangs: Lang[];

  // ── 자식 클래스가 구현: 콘텐츠 패키지 → 플랫폼 텍스트 ──
  abstract buildText(pkg: ContentPackage, lang: Lang): string;

  // ── 해시태그 (자식이 오버라이드 가능) ──
  getHashtags(pkg: ContentPackage, lang: Lang): string {
    return pkg.hashtags?.[lang]?.[this.platform] || '';
  }

  // ── 이미지 선택 (공통 풀에서 자기 포맷 가져오기) ──
  getImage(pkg: ContentPackage): string | undefined {
    return pkg.images[this.imageFormat];
  }

  // ── 포맷 + 컴플라이언스 적용 ──
  format(pkg: ContentPackage, lang: Lang): FormattedPost | null {
    const channel = getChannelsByPlatform(this.platform).find(c => c.lang === lang);
    if (!channel) return null;

    const rawText = this.buildText(pkg, lang);
    const tags = this.getHashtags(pkg, lang);
    const compliant = applyCompliance(rawText);
    const text = tags 
      ? truncateWithTags(compliant, tags, this.maxChars)
      : compliant.length > this.maxChars 
        ? compliant.slice(0, this.maxChars - 3) + '...'
        : compliant;

    return {
      channelId: channel.id,
      text,
      imageUrl: this.getImage(pkg),
      lang,
      platform: this.platform,
    };
  }

  // ── 발송 (Buffer API 호출) ──
  async send(
    pkg: ContentPackage,
    lang: Lang,
    opts: { dryRun?: boolean; draft?: boolean } = {},
  ): Promise<SendResult> {
    const post = this.format(pkg, lang);
    if (!post) {
      return { success: false, platform: this.platform, lang, channelId: '', error: `No channel for ${this.platform}/${lang}` };
    }

    // Dedup lock (라이브 전용)
    if (!opts.dryRun && !opts.draft) {
      const canSend = await acquireLock(pkg.slot, `${this.platform}_${lang}`, pkg.date);
      if (!canSend) {
        return { success: true, platform: this.platform, lang, channelId: post.channelId, postId: 'dedup_skipped' };
      }
    }

    if (opts.dryRun) {
      console.log(`[MktV2/${this.platform}] DRY_RUN ${lang}: ${post.text.substring(0, 80)}...`);
      return { success: true, platform: this.platform, lang, channelId: post.channelId, dryRun: true };
    }

    const result = await createPost({
      channelIds: [post.channelId],
      text: post.text,
      mediaUrl: post.imageUrl,
      dryRun: false,
      draft: opts.draft,
    });

    return {
      success: result.success,
      platform: this.platform,
      lang,
      channelId: post.channelId,
      postId: result.postId,
      error: result.error,
    };
  }

  // ── 모든 지원 언어에 일괄 발송 ──
  async sendAll(
    pkg: ContentPackage,
    opts: { dryRun?: boolean; draft?: boolean; lang?: Lang } = {},
  ): Promise<SendResult[]> {
    const langs = opts.lang ? [opts.lang] : this.supportedLangs;
    const results: SendResult[] = [];

    for (const lang of langs) {
      const r = await this.send(pkg, lang, opts);
      results.push(r);
      // Rate limit: 500ms between channels
      if (!opts.dryRun && langs.length > 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    return results;
  }
}
