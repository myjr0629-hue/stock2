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

    // Bluesky = 데이터 + 짧은 AI 인사이트 + CTA
    const shortInsight = t.insight.length > 80 
      ? t.insight.slice(0, 77) + '...' 
      : t.insight;

    const parts = [
      t.headline,
      t.data,
      shortInsight,
      t.cta,
    ].filter(Boolean);

    return parts.join('\n\n');
  }
}
