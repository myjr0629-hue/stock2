// ============================================================================
// Marketing V2 — Bluesky Adapter
// 300자, 데이터 + AI 1문장 인사이트
// ============================================================================

import { BaseAdapter } from './base';
import { ContentPackage, Lang, Platform, ImageFormat } from '../core/types';

export class BlueskyAdapter extends BaseAdapter {
  readonly platform: Platform = 'bluesky';
  readonly maxChars = 300;
  readonly imageFormat: ImageFormat = 'tweet';
  readonly supportedLangs: Lang[] = ['en'];  // EN only (현재)

  buildText(pkg: ContentPackage, lang: Lang): string {
    const t = pkg.text[lang];
    if (!t) return '';

    // Bluesky = 데이터 + AI 인사이트 + CTA (300자는 base.format()이 처리)
    const parts = [
      t.headline,
      t.data,
      t.insight ? `🎯 ${t.insight}` : '',
      t.cta,
    ].filter(Boolean);

    return parts.join('\n\n');
  }
}
