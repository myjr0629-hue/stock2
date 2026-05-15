// ============================================================================
// Marketing V2 — Pinterest Adapter
// 500자, SEO 제목, destination link, 세로 핀 이미지 (1000×1500)
// ★ boardServiceId 필수! (없으면 Pin이 생성되지 않음)
// ============================================================================

import { BaseAdapter } from './base';
import { ContentPackage, SendResult, Lang, Platform, ImageFormat } from '../core/types';
import { getChannelsByPlatform } from '../core/channels';
import { acquireLock } from '../core/store';
import { PINTEREST_TITLES, EDUCATION_PIN_TITLES } from '../core/hashtags';
import { createPost } from '@/lib/marketing/bufferClient';

// ★ Pinterest Board IDs — 슬롯별 보드 매핑
// Pinterest에서 직접 생성 후 Buffer channel metadata query로 조회
import type { ContentSlot } from '../core/types';

const BOARD_MAP: Record<ContentSlot, string> = {
  morning:   '1102115408751808397', // Options Flow & Market Structure
  close:     '1102115408751808397', // Options Flow & Market Structure
  pulse:     '1102115408751808397', // Options Flow & Market Structure
  spotlight: '1102115408751808397', // Options Flow & Market Structure
  event:     '1102115408751808397', // Options Flow & Market Structure
  education: '1102115408751808398', // Trading Education
  spacex:    '1102115408751808399', // SpaceX IPO Intelligence
};

function getBoardId(slot: ContentSlot): string {
  return BOARD_MAP[slot] || BOARD_MAP.close;
}

export class PinterestAdapter extends BaseAdapter {
  readonly platform: Platform = 'pinterest';
  readonly maxChars = 500;
  readonly imageFormat: ImageFormat = 'pin';
  readonly supportedLangs: Lang[] = ['en'];  // EN only

  buildText(pkg: ContentPackage, lang: Lang): string {
    const t = pkg.text[lang];
    if (!t) return '';
    return [t.data, t.insight, t.disclaimer].filter(Boolean).join('\n\n');
  }

  // ── Pinterest Pin = metadata.pinterest { title, url, boardServiceId } ──
  async send(
    pkg: ContentPackage,
    lang: Lang,
    opts: { dryRun?: boolean; draft?: boolean } = {},
  ): Promise<SendResult> {
    const channel = getChannelsByPlatform(this.platform).find(c => c.lang === lang);
    if (!channel) {
      return { success: false, platform: this.platform, lang, channelId: '', error: 'No Pinterest channel' };
    }

    // Pin 이미지 (세로 2:3 우선, fallback tweet)
    const pinImage = pkg.images.pin || pkg.images.tweet;
    if (!pinImage) {
      return { success: false, platform: this.platform, lang, channelId: channel.id, error: 'No pin image' };
    }

    // Dedup lock
    if (!opts.dryRun && !opts.draft) {
      const canSend = await acquireLock(pkg.slot, `pinterest_${lang}`, pkg.date);
      if (!canSend) {
        return { success: true, platform: this.platform, lang, channelId: channel.id, postId: 'dedup_skipped' };
      }
    }

    // ── SEO 제목 ──
    const t = pkg.text[lang];
    let title: string;
    if (pkg.slot === 'education' && pkg.metrics?.topicId) {
      title = EDUCATION_PIN_TITLES[pkg.metrics.topicId] || PINTEREST_TITLES.education;
    } else {
      title = PINTEREST_TITLES[pkg.slot] || t?.headline || `SIGNUM HQ | ${pkg.slot}`;
    }

    // ── Description + 해시태그 ──
    const tags = this.getHashtags(pkg, lang);
    const description = this.buildText(pkg, lang);

    // ── Destination link ──
    const page = pkg.slot === 'education' ? 'how-it-works' : 'intel-guardian';
    const destinationUrl = t?.ctaFull || `https://www.signumhq.com/${page}?utm_source=pinterest&utm_medium=social&utm_campaign=${pkg.slot}`;

    // ── Pin description (Buffer enforces 500 char max) ──
    const descWithTags = tags ? `${description}\n\n${tags}` : description;
    const safeDesc = descWithTags.length > 490 ? descWithTags.substring(0, 487) + '...' : descWithTags;

    const boardId = getBoardId(pkg.slot);

    if (opts.dryRun) {
      console.log(`[MktV2/pinterest] DRY_RUN Pin:`);
      console.log(`  title: ${title}`);
      console.log(`  board: ${boardId}`);
      console.log(`  link: ${destinationUrl}`);
      console.log(`  image: ${pinImage.substring(0, 60)}...`);
      console.log(`  desc (${safeDesc.length} chars): ${safeDesc.substring(0, 80)}...`);
      return { success: true, platform: this.platform, lang, channelId: channel.id, dryRun: true };
    }

    // ★ Buffer createPost + metadata.pinterest (boardServiceId 필수!)
    const result = await createPost({
      channelIds: [channel.id],
      text: safeDesc,
      mediaUrl: pinImage,
      dryRun: false,
      draft: opts.draft,
      pinterestMeta: {
        title,
        url: destinationUrl,
        boardServiceId: boardId,
      },
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
