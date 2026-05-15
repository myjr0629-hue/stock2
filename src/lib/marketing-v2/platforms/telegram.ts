// ============================================================================
// Marketing V2 — Telegram Adapter
// 무제한 글자, 마크다운 포맷, 직접 API (Buffer 미사용)
// ============================================================================

import { ContentPackage, SendResult, Lang, Platform, ImageFormat } from '../core/types';
import { TELEGRAM_CONFIG } from '../core/channels';
import { acquireLock } from '../core/store';

export class TelegramAdapter {
  readonly platform: Platform = 'telegram';
  readonly imageFormat: ImageFormat = 'tweet';
  readonly supportedLangs: Lang[] = ['en'];

  buildText(pkg: ContentPackage, lang: Lang): string {
    const t = pkg.text[lang];
    if (!t) return '';

    // Telegram = 풀 Guardian 스타일 분석문
    return [
      t.headline,
      t.data,
      '',
      t.insight,
      '',
      t.full ? `━━━ AI Analysis ━━━\n${t.full}` : '',
      '',
      t.ctaFull ? `📊 ${t.ctaFull}` : '',
      '',
      t.disclaimer,
    ].filter(s => s !== undefined).join('\n');
  }

  async send(
    pkg: ContentPackage,
    lang: Lang,
    opts: { dryRun?: boolean; draft?: boolean } = {},
  ): Promise<SendResult> {
    if (!TELEGRAM_CONFIG.enabled) {
      return { success: false, platform: this.platform, lang, channelId: '', error: 'Telegram disabled' };
    }

    if (!opts.dryRun && !opts.draft) {
      const canSend = await acquireLock(pkg.slot, `telegram_${lang}`, pkg.date);
      if (!canSend) {
        return { success: true, platform: this.platform, lang, channelId: TELEGRAM_CONFIG.channelId, postId: 'dedup_skipped' };
      }
    }

    const text = this.buildText(pkg, lang);
    const imageUrl = pkg.images.tweet || pkg.images.og;

    if (opts.dryRun) {
      console.log(`[MktV2/telegram] DRY_RUN: ${text.substring(0, 80)}...`);
      return { success: true, platform: this.platform, lang, channelId: TELEGRAM_CONFIG.channelId, dryRun: true };
    }

    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = TELEGRAM_CONFIG.channelId;
      if (!botToken || !chatId) throw new Error('Missing Telegram credentials');

      // Send photo with caption, or text-only
      if (imageUrl) {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            photo: imageUrl,
            caption: text.slice(0, 1024),
            parse_mode: 'HTML',
          }),
        });
        const data = await res.json();
        return {
          success: data.ok,
          platform: this.platform,
          lang,
          channelId: chatId,
          postId: String(data.result?.message_id || ''),
          error: data.ok ? undefined : data.description,
        };
      } else {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
          }),
        });
        const data = await res.json();
        return {
          success: data.ok,
          platform: this.platform,
          lang,
          channelId: chatId,
          postId: String(data.result?.message_id || ''),
          error: data.ok ? undefined : data.description,
        };
      }
    } catch (err: any) {
      return { success: false, platform: this.platform, lang, channelId: TELEGRAM_CONFIG.channelId, error: err.message };
    }
  }

  async sendAll(
    pkg: ContentPackage,
    opts: { dryRun?: boolean; draft?: boolean; lang?: Lang } = {},
  ): Promise<SendResult[]> {
    const langs = opts.lang ? [opts.lang] : this.supportedLangs;
    const results: SendResult[] = [];
    for (const lang of langs) {
      results.push(await this.send(pkg, lang, opts));
    }
    return results;
  }
}
